#!/usr/bin/env python3
"""
Fall Detection Model Training Pipeline - SisFall Dataset Only
==============================================================

This script trains a CNN+LSTM fall detection model using ONLY the SisFall dataset.
It implements proper subject-wise splitting to prevent data leakage.

Dataset Structure:
- Files: {ActivityCode}_{SubjectID}_{Trial}.txt
- Activity codes starting with 'F' -> Fall (label=1)
- Activity codes starting with 'D' -> Non-Fall (label=0)

Sensor Columns (semicolon-separated):
- Columns 0-2: Accelerometer (ADXL345) -> acc_x, acc_y, acc_z
- Columns 3-5: Gyroscope (ITG3200) -> gyro_x, gyro_y, gyro_z
- Columns 6-8: Accelerometer (MMA8451Q) -> IGNORED

Unit Conversion:
- Accelerometer: raw / 256 -> g
- Gyroscope: raw / 14.375 -> deg/s

Usage:
    python train_sisfall_fall_detector.py --data-dir ./SisFall_dataset --output-dir ./outputs
"""

from __future__ import annotations

import argparse
import copy
import json
import logging
import os
import random
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from scipy import signal
from sklearn.metrics import (
    accuracy_score,
    auc,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_curve,
)
from torch.optim import Adam
from torch.optim.lr_scheduler import ReduceLROnPlateau
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)
LOGGER = logging.getLogger("sisfall_fall_detector")

# Feature columns
FEATURES = ["acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z"]


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class Config:
    """Training configuration."""
    data_dir: Path
    output_dir: Path

    # Data parameters
    raw_hz: int = 200
    target_hz: int = 50
    window_seconds: float = 2.0
    overlap: float = 0.5

    # Unit conversion constants
    acc_scale: float = 256.0  # raw / 256 = g
    gyro_scale: float = 14.375  # raw / 14.375 = deg/s

    # Clipping ranges
    acc_clip_min: float = -3.0  # g
    acc_clip_max: float = 3.0   # g
    gyro_clip_min: float = -500.0  # deg/s
    gyro_clip_max: float = 500.0   # deg/s

    # Model architecture
    conv1_filters: int = 64
    conv2_filters: int = 128
    lstm_hidden: int = 128
    fc_hidden: int = 64
    dropout: float = 0.5

    # Training parameters
    batch_size: int = 64
    epochs: int = 50
    learning_rate: float = 1e-3
    weight_decay: float = 1e-5
    patience: int = 10  # Early stopping patience

    # Split ratios (subject-wise)
    train_ratio: float = 0.70
    val_ratio: float = 0.15
    test_ratio: float = 0.15

    # Targets
    target_recall: float = 0.97
    target_accuracy: float = 0.90

    # Random seed
    seed: int = 42

    @property
    def device(self) -> torch.device:
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")

    @property
    def downsample_factor(self) -> int:
        return self.raw_hz // self.target_hz

    @property
    def window_size(self) -> int:
        """Window size in samples (at target_hz)."""
        return int(self.window_seconds * self.target_hz)

    @property
    def stride(self) -> int:
        """Stride for sliding window (at target_hz)."""
        return int(self.window_size * (1.0 - self.overlap))


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class Recording:
    """Single recording from SisFall dataset."""
    file_path: Path
    subject_id: str
    activity_code: str
    trial: str
    label: int  # 0=non-fall, 1=fall
    timestamps: np.ndarray = field(default_factory=lambda: np.array([]))
    features: np.ndarray = field(default_factory=lambda: np.array([]))


@dataclass
class Subject:
    """Subject data container."""
    subject_id: str
    recordings: list[Recording] = field(default_factory=list)

    @property
    def fall_count(self) -> int:
        return sum(1 for r in self.recordings if r.label == 1)

    @property
    def non_fall_count(self) -> int:
        return sum(1 for r in self.recordings if r.label == 0)


# =============================================================================
# Dataset Class
# =============================================================================

class FallDataset(Dataset):
    """PyTorch Dataset for fall detection windows."""

    def __init__(self, windows: np.ndarray, labels: np.ndarray) -> None:
        self.windows = torch.as_tensor(windows, dtype=torch.float32)
        self.labels = torch.as_tensor(labels, dtype=torch.float32)

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self.windows[idx], self.labels[idx]


# =============================================================================
# Model Architecture
# =============================================================================

class FallDetector(nn.Module):
    """
    CNN + LSTM Fall Detection Model.

    Architecture:
    - Conv1D (6 -> 64) + BatchNorm + ReLU + MaxPool
    - Conv1D (64 -> 128) + BatchNorm + ReLU + MaxPool
    - LSTM (hidden_size=128)
    - Dense (128 -> 64) + ReLU + Dropout
    - Dense (64 -> 1)
    - Output: Sigmoid (applied via BCEWithLogitsLoss)
    """

    def __init__(self, cfg: Config) -> None:
        super().__init__()

        # Convolutional layers
        self.conv1 = nn.Conv1d(len(FEATURES), cfg.conv1_filters, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(cfg.conv1_filters)
        self.pool1 = nn.MaxPool1d(kernel_size=2)

        self.conv2 = nn.Conv1d(cfg.conv1_filters, cfg.conv2_filters, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(cfg.conv2_filters)
        self.pool2 = nn.MaxPool1d(kernel_size=2)

        # LSTM layer
        self.lstm = nn.LSTM(
            input_size=cfg.conv2_filters,
            hidden_size=cfg.lstm_hidden,
            batch_first=True
        )

        # Fully connected layers
        self.fc1 = nn.Linear(cfg.lstm_hidden, cfg.fc_hidden)
        self.fc2 = nn.Linear(cfg.fc_hidden, 1)

        # Activation and regularization
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(cfg.dropout)

        # Initialize weights
        self._init_weights()

    def _init_weights(self) -> None:
        """Initialize model weights."""
        for module in self.modules():
            if isinstance(module, nn.Conv1d):
                nn.init.kaiming_normal_(module.weight, nonlinearity="relu")
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, nn.BatchNorm1d):
                nn.init.ones_(module.weight)
                nn.init.zeros_(module.bias)
            elif isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Args:
            x: Input tensor of shape (batch, timesteps, features)

        Returns:
            Output logits of shape (batch,)
        """
        # Transpose to (batch, features, timesteps) for Conv1d
        x = x.transpose(1, 2)

        # Conv layers
        x = self.pool1(self.relu(self.bn1(self.conv1(x))))
        x = self.pool2(self.relu(self.bn2(self.conv2(x))))

        # Transpose back to (batch, timesteps, features) for LSTM
        x = x.transpose(1, 2)

        # LSTM
        x, _ = self.lstm(x)

        # Take last timestep output
        x = x[:, -1, :]

        # Fully connected layers
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)

        return x.squeeze(-1)


# =============================================================================
# Data Loading and Preprocessing
# =============================================================================

class SisFallDataLoader:
    """Load and preprocess SisFall dataset."""

    # Regex pattern for SisFall filenames: ActivityCode_SubjectID_Trial.txt
    FILENAME_PATTERN = re.compile(r"^([FD]\d+)_([A-Z]+\d+)_R(\d+)\.txt$")

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def parse_filename(self, file_path: Path) -> tuple[str, str, str, int] | None:
        """
        Parse SisFall filename to extract metadata.

        Args:
            file_path: Path to .txt file

        Returns:
            Tuple of (activity_code, subject_id, trial, label) or None if invalid
        """
        match = self.FILENAME_PATTERN.match(file_path.name)
        if not match:
            return None

        activity_code = match.group(1)
        subject_id = match.group(2)
        trial = match.group(3)

        # Label based on first character
        label = 1 if activity_code.startswith("F") else 0

        return activity_code, subject_id, trial, label

    def load_file(self, file_path: Path) -> np.ndarray | None:
        """
        Load and parse a single SisFall .txt file.

        Args:
            file_path: Path to .txt file

        Returns:
            Array of shape (samples, 6) with columns [acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z]
            or None if loading fails
        """
        try:
            # Read file with semicolon separator
            data = []
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    # Remove trailing semicolon if present
                    if line.endswith(";"):
                        line = line[:-1]
                    # Split by semicolon or comma
                    parts = line.replace(";", ",").split(",")
                    if len(parts) >= 6:
                        # Extract first 6 columns (ignore columns 6-8)
                        values = [float(p.strip()) for p in parts[:6]]
                        data.append(values)

            if not data:
                return None

            return np.array(data, dtype=np.float32)

        except Exception as e:
            LOGGER.warning("Failed to load %s: %s", file_path, e)
            return None

    def convert_units(self, data: np.ndarray) -> np.ndarray:
        """
        Convert raw sensor values to physical units.

        Args:
            data: Array of shape (samples, 6) with raw values

        Returns:
            Array with converted units:
            - acc (columns 0-2): raw / 256 -> g
            - gyro (columns 3-5): raw / 14.375 -> deg/s
        """
        converted = np.zeros_like(data)

        # Convert accelerometer (columns 0-2)
        converted[:, 0:3] = data[:, 0:3] / self.cfg.acc_scale

        # Convert gyroscope (columns 3-5)
        converted[:, 3:6] = data[:, 3:6] / self.cfg.gyro_scale

        return converted

    def generate_timestamps(self, num_samples: int) -> np.ndarray:
        """
        Generate timestamps at raw sampling rate (200 Hz).

        Args:
            num_samples: Number of samples

        Returns:
            Array of timestamps in seconds
        """
        return np.arange(num_samples) / self.cfg.raw_hz

    def resample(self, data: np.ndarray, timestamps: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Resample data from raw_hz to target_hz using scipy resample.

        Args:
            data: Array of shape (samples, 6)
            timestamps: Array of timestamps

        Returns:
            Tuple of (resampled_data, resampled_timestamps)
        """
        num_samples = len(data)
        target_samples = int(num_samples / self.cfg.downsample_factor)

        if target_samples < 1:
            return data, timestamps

        # Resample each channel
        resampled_data = signal.resample(data, target_samples, axis=0)

        # Generate new timestamps
        resampled_timestamps = np.linspace(
            timestamps[0],
            timestamps[-1],
            target_samples
        )

        return resampled_data.astype(np.float32), resampled_timestamps.astype(np.float32)

    def clip_values(self, data: np.ndarray) -> np.ndarray:
        """
        Clip sensor values to valid ranges.

        Args:
            data: Array of shape (samples, 6)

        Returns:
            Clipped array
        """
        clipped = np.copy(data)

        # Clip accelerometer (columns 0-2)
        clipped[:, 0:3] = np.clip(
            clipped[:, 0:3],
            self.cfg.acc_clip_min,
            self.cfg.acc_clip_max
        )

        # Clip gyroscope (columns 3-5)
        clipped[:, 3:6] = np.clip(
            clipped[:, 3:6],
            self.cfg.gyro_clip_min,
            self.cfg.gyro_clip_max
        )

        return clipped

    def remove_nan(self, data: np.ndarray) -> np.ndarray:
        """
        Remove rows containing NaN values.

        Args:
            data: Array of shape (samples, 6)

        Returns:
            Array with NaN rows removed
        """
        mask = ~np.any(np.isnan(data), axis=1)
        return data[mask]

    def load_all_files(self) -> dict[str, Subject]:
        """
        Load all SisFall files and organize by subject.

        Returns:
            Dictionary mapping subject_id to Subject object
        """
        subjects: dict[str, Subject] = {}

        # Find all .txt files recursively
        txt_files = list(self.cfg.data_dir.rglob("*.txt"))
        LOGGER.info("Found %d .txt files in %s", len(txt_files), self.cfg.data_dir)

        loaded_count = 0
        skipped_count = 0
        fall_count = 0
        non_fall_count = 0

        for file_path in tqdm(txt_files, desc="Loading SisFall files"):
            # Parse filename
            parsed = self.parse_filename(file_path)
            if parsed is None:
                skipped_count += 1
                continue

            activity_code, subject_id, trial, label = parsed

            # Load raw data
            raw_data = self.load_file(file_path)
            if raw_data is None or len(raw_data) < self.cfg.window_size:
                skipped_count += 1
                continue

            # Convert units
            data = self.convert_units(raw_data)

            # Generate timestamps
            timestamps = self.generate_timestamps(len(data))

            # Resample to target frequency
            data, timestamps = self.resample(data, timestamps)

            # Remove NaN values
            data = self.remove_nan(data)

            if len(data) < self.cfg.window_size:
                skipped_count += 1
                continue

            # Clip values
            data = self.clip_values(data)

            # Create recording
            recording = Recording(
                file_path=file_path,
                subject_id=subject_id,
                activity_code=activity_code,
                trial=trial,
                label=label,
                timestamps=timestamps[:len(data)],
                features=data
            )

            # Add to subject
            if subject_id not in subjects:
                subjects[subject_id] = Subject(subject_id=subject_id)
            subjects[subject_id].recordings.append(recording)

            loaded_count += 1
            if label == 1:
                fall_count += 1
            else:
                non_fall_count += 1

        LOGGER.info("Loaded %d recordings (%d fall, %d non-fall), skipped %d",
                    loaded_count, fall_count, non_fall_count, skipped_count)
        LOGGER.info("Total subjects: %d", len(subjects))

        return subjects


# =============================================================================
# Subject-wise Data Splitting
# =============================================================================

class SubjectSplitter:
    """Split subjects into train/val/test sets ensuring no overlap."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def split_subjects(
        self,
        subjects: dict[str, Subject]
    ) -> tuple[list[str], list[str], list[str]]:
        """
        Split subjects into train/val/test sets with balanced class distribution.

        Args:
            subjects: Dictionary of subject_id -> Subject

        Returns:
            Tuple of (train_subjects, val_subjects, test_subjects) as lists of subject IDs
        """
        # Separate SA (young adults) and SE (elderly) subjects
        sa_subjects = [sid for sid in subjects.keys() if sid.startswith("SA")]
        se_subjects = [sid for sid in subjects.keys() if sid.startswith("SE")]

        LOGGER.info("SA subjects (young adults): %d", len(sa_subjects))
        LOGGER.info("SE subjects (elderly): %d", len(se_subjects))

        # Shuffle subjects
        random.shuffle(sa_subjects)
        random.shuffle(se_subjects)

        # Split SA subjects
        sa_train, sa_val, sa_test = self._split_group(
            sa_subjects, self.cfg.train_ratio, self.cfg.val_ratio
        )

        # Split SE subjects
        se_train, se_val, se_test = self._split_group(
            se_subjects, self.cfg.train_ratio, self.cfg.val_ratio
        )

        # Combine
        train_subjects = sa_train + se_train
        val_subjects = sa_val + se_val
        test_subjects = sa_test + se_test

        # Shuffle final lists
        random.shuffle(train_subjects)
        random.shuffle(val_subjects)
        random.shuffle(test_subjects)

        LOGGER.info("Train subjects: %d", len(train_subjects))
        LOGGER.info("Validation subjects: %d", len(val_subjects))
        LOGGER.info("Test subjects: %d", len(test_subjects))

        return train_subjects, val_subjects, test_subjects

    def _split_group(
        self,
        subject_ids: list[str],
        train_ratio: float,
        val_ratio: float
    ) -> tuple[list[str], list[str], list[str]]:
        """Split a group of subjects according to ratios."""
        n = len(subject_ids)
        if n == 0:
            return [], [], []

        n_train = max(1, int(n * train_ratio))
        n_val = max(1, int(n * val_ratio)) if n > 2 else 0
        n_test = n - n_train - n_val

        train = subject_ids[:n_train]
        val = subject_ids[n_train:n_train + n_val]
        test = subject_ids[n_train + n_val:]

        return train, val, test

    def get_class_distribution(
        self,
        subjects: dict[str, Subject],
        subject_ids: list[str]
    ) -> tuple[int, int]:
        """Get fall/non-fall counts for a set of subjects."""
        fall_count = 0
        non_fall_count = 0

        for sid in subject_ids:
            if sid in subjects:
                fall_count += subjects[sid].fall_count
                non_fall_count += subjects[sid].non_fall_count

        return fall_count, non_fall_count


# =============================================================================
# Window Generation
# =============================================================================

class WindowGenerator:
    """Generate sliding windows from recordings."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def create_windows(
        self,
        subjects: dict[str, Subject],
        subject_ids: list[str],
        mean: np.ndarray | None = None,
        std: np.ndarray | None = None
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Create sliding windows from recordings of specified subjects.

        Args:
            subjects: Dictionary of subject_id -> Subject
            subject_ids: List of subject IDs to include
            mean: Mean for normalization (compute if None)
            std: Std for normalization (compute if None)

        Returns:
            Tuple of (windows, labels) where:
            - windows: Array of shape (n_windows, window_size, n_features)
            - labels: Array of shape (n_windows,)
        """
        # Collect all recordings
        recordings = []
        for sid in subject_ids:
            if sid in subjects:
                recordings.extend(subjects[sid].recordings)

        if not recordings:
            raise ValueError(f"No recordings found for subjects: {subject_ids}")

        # Compute normalizer if not provided
        if mean is None or std is None:
            mean, std = self._compute_normalizer(recordings)

        # Generate windows
        windows = []
        labels = []

        for recording in recordings:
            # Normalize
            normalized = (recording.features - mean) / std

            # Extract windows
            n_samples = len(normalized)
            for start in range(0, n_samples - self.cfg.window_size + 1, self.cfg.stride):
                end = start + self.cfg.window_size
                window = normalized[start:end]

                # Window label: if ANY part of window is from a fall recording, label as fall
                # (For SisFall, entire recording is labeled as fall or non-fall)
                windows.append(window)
                labels.append(recording.label)

        if not windows:
            raise ValueError("No windows generated - check data and parameters")

        return np.stack(windows), np.array(labels, dtype=np.float32), mean, std

    def _compute_normalizer(
        self,
        recordings: list[Recording]
    ) -> tuple[np.ndarray, np.ndarray]:
        """Compute mean and std from recordings (z-score normalization)."""
        all_data = np.concatenate([r.features for r in recordings], axis=0)

        mean = all_data.mean(axis=0, dtype=np.float64).astype(np.float32)
        std = all_data.std(axis=0, dtype=np.float64).astype(np.float32)

        # Prevent division by zero
        std = np.where(std < 1e-6, 1.0, std).astype(np.float32)

        return mean, std


# =============================================================================
# Training Utilities
# =============================================================================

def set_seed(seed: int) -> None:
    """Set random seed for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


def compute_class_weights(labels: np.ndarray, device: torch.device) -> torch.Tensor:
    """
    Compute positive class weight for imbalanced dataset.

    Returns weight = n_negative / n_positive
    """
    n_positive = float(labels.sum())
    n_negative = float(len(labels) - n_positive)

    weight = n_negative / max(n_positive, 1.0)
    LOGGER.info("Class weights - Positive weight: %.4f (neg=%d, pos=%d)",
                weight, int(n_negative), int(n_positive))

    return torch.tensor(weight, dtype=torch.float32, device=device)


def compute_metrics(
    probabilities: np.ndarray,
    labels: np.ndarray,
    threshold: float
) -> dict[str, float]:
    """Compute binary classification metrics."""
    predictions = (probabilities >= threshold).astype(np.int64)
    truth = labels.astype(np.int64)

    return {
        "accuracy": float(accuracy_score(truth, predictions)),
        "precision": float(precision_score(truth, predictions, zero_division=0)),
        "recall": float(recall_score(truth, predictions, zero_division=0)),
        "f1": float(f1_score(truth, predictions, zero_division=0)),
    }


def tune_threshold(
    probabilities: np.ndarray,
    labels: np.ndarray,
    target_recall: float = 0.97
) -> tuple[float, dict[str, float]]:
    """
    Find optimal threshold, prioritizing recall.

    Strategy:
    1. First, find thresholds that achieve target recall
    2. Among those, pick the one with best F1 score
    3. If no threshold achieves target recall, pick the one with highest recall
    """
    best_threshold = 0.50
    best_metrics = compute_metrics(probabilities, labels, best_threshold)

    # Store all results
    results = []

    for threshold in np.arange(0.01, 0.99, 0.01):
        metrics = compute_metrics(probabilities, labels, float(threshold))
        results.append((float(threshold), metrics))

    # First, find thresholds achieving target recall
    high_recall = [(t, m) for t, m in results if m["recall"] >= target_recall]

    if high_recall:
        # Pick the one with best F1 among high-recall thresholds
        best_threshold, best_metrics = max(high_recall, key=lambda x: x[1]["f1"])
        LOGGER.info("Found threshold %.3f achieving target recall %.2f",
                    best_threshold, target_recall)
    else:
        # Fall back to highest recall
        best_threshold, best_metrics = max(results, key=lambda x: (
            x[1]["recall"], x[1]["f1"], x[1]["precision"]
        ))
        LOGGER.warning("Could not achieve target recall %.2f, best recall: %.4f at threshold %.3f",
                       target_recall, best_metrics["recall"], best_threshold)

    return round(best_threshold, 3), best_metrics


# =============================================================================
# Trainer Class
# =============================================================================

class Trainer:
    """Model trainer with early stopping and threshold tuning."""

    def __init__(
        self,
        model: nn.Module,
        cfg: Config,
        pos_weight: torch.Tensor
    ) -> None:
        self.model = model.to(cfg.device)
        self.cfg = cfg
        self.device = cfg.device

        # Loss with class weighting
        self.criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

        # Optimizer
        self.optimizer = Adam(
            self.model.parameters(),
            lr=cfg.learning_rate,
            weight_decay=cfg.weight_decay
        )

        # Learning rate scheduler (reduce on plateau of recall)
        self.scheduler = ReduceLROnPlateau(
            self.optimizer,
            mode="max",
            factor=0.5,
            patience=3
        )

        # Best model tracking
        self.best_state: dict[str, Any] | None = None
        self.best_epoch = 0
        self.best_threshold = 0.50
        self.best_recall = -1.0
        self.no_improve_epochs = 0

        # Training history
        self.history: dict[str, list[float]] = defaultdict(list)

    def train_epoch(self, loader: DataLoader) -> tuple[float, dict[str, float]]:
        """Train for one epoch."""
        self.model.train()

        losses = []
        all_probs = []
        all_labels = []

        for batch_x, batch_y in tqdm(loader, desc="Training", leave=False):
            batch_x = batch_x.to(self.device, non_blocking=True)
            batch_y = batch_y.to(self.device, non_blocking=True)

            self.optimizer.zero_grad(set_to_none=True)

            logits = self.model(batch_x)
            loss = self.criterion(logits, batch_y)

            loss.backward()
            self.optimizer.step()

            losses.append(loss.item())
            all_probs.append(torch.sigmoid(logits).detach().cpu().numpy())
            all_labels.append(batch_y.detach().cpu().numpy())

        # Compute metrics
        probs = np.concatenate(all_probs)
        labels = np.concatenate(all_labels)
        metrics = compute_metrics(probs, labels, 0.50)

        return float(np.mean(losses)), metrics

    @torch.no_grad()
    def evaluate(self, loader: DataLoader) -> tuple[float, np.ndarray, np.ndarray]:
        """Evaluate model on a dataset."""
        self.model.eval()

        losses = []
        all_probs = []
        all_labels = []

        for batch_x, batch_y in loader:
            batch_x = batch_x.to(self.device, non_blocking=True)
            batch_y = batch_y.to(self.device, non_blocking=True)

            logits = self.model(batch_x)
            loss = self.criterion(logits, batch_y)

            losses.append(loss.item())
            all_probs.append(torch.sigmoid(logits).cpu().numpy())
            all_labels.append(batch_y.cpu().numpy())

        return (
            float(np.mean(losses)),
            np.concatenate(all_probs),
            np.concatenate(all_labels)
        )

    def fit(
        self,
        train_loader: DataLoader,
        val_loader: DataLoader
    ) -> dict[str, list[float]]:
        """Train the model."""
        LOGGER.info("Starting training for %d epochs", self.cfg.epochs)
        LOGGER.info("Device: %s", self.device)

        for epoch in range(1, self.cfg.epochs + 1):
            LOGGER.info("=" * 60)
            LOGGER.info("Epoch %d/%d", epoch, self.cfg.epochs)

            # Train
            train_loss, train_metrics = self.train_epoch(train_loader)

            # Validate
            val_loss, val_probs, val_labels = self.evaluate(val_loader)
            threshold, val_metrics = tune_threshold(
                val_probs, val_labels, self.cfg.target_recall
            )

            # Get current learning rate
            lr = self.optimizer.param_groups[0]["lr"]

            # Record history
            self.history["train_loss"].append(train_loss)
            self.history["val_loss"].append(val_loss)
            self.history["train_accuracy"].append(train_metrics["accuracy"])
            self.history["train_recall"].append(train_metrics["recall"])
            self.history["val_accuracy"].append(val_metrics["accuracy"])
            self.history["val_precision"].append(val_metrics["precision"])
            self.history["val_recall"].append(val_metrics["recall"])
            self.history["val_f1"].append(val_metrics["f1"])
            self.history["threshold"].append(threshold)
            self.history["learning_rate"].append(lr)

            # Log progress
            LOGGER.info(
                "Train Loss=%.4f Acc=%.4f Recall=%.4f | "
                "Val Loss=%.4f Acc=%.4f Prec=%.4f Recall=%.4f F1=%.4f | Threshold=%.3f",
                train_loss, train_metrics["accuracy"], train_metrics["recall"],
                val_loss, val_metrics["accuracy"], val_metrics["precision"],
                val_metrics["recall"], val_metrics["f1"], threshold
            )

            # Update scheduler
            self.scheduler.step(val_metrics["recall"])

            # Check for improvement
            if val_metrics["recall"] > self.best_recall + 1e-4:
                self.best_recall = val_metrics["recall"]
                self.best_threshold = threshold
                self.best_epoch = epoch
                self.best_state = copy.deepcopy(self.model.state_dict())
                self.no_improve_epochs = 0
                LOGGER.info("New best model! Recall=%.4f", self.best_recall)
            else:
                self.no_improve_epochs += 1

            # Early stopping
            if self.no_improve_epochs >= self.cfg.patience:
                LOGGER.info("Early stopping triggered after %d epochs without improvement",
                           self.cfg.patience)
                break

        # Restore best model
        if self.best_state is not None:
            self.model.load_state_dict(self.best_state)
            LOGGER.info("Restored best model from epoch %d with recall=%.4f",
                       self.best_epoch, self.best_recall)

        return dict(self.history)


# =============================================================================
# Evaluation and Visualization
# =============================================================================

def full_evaluation(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    threshold: float
) -> dict[str, Any]:
    """Perform full evaluation with all metrics."""
    model.eval()

    losses = []
    all_probs = []
    all_labels = []

    with torch.no_grad():
        for batch_x, batch_y in loader:
            batch_x = batch_x.to(device, non_blocking=True)
            batch_y = batch_y.to(device, non_blocking=True)

            logits = model(batch_x)
            loss = criterion(logits, batch_y)

            losses.append(loss.item())
            all_probs.append(torch.sigmoid(logits).cpu().numpy())
            all_labels.append(batch_y.cpu().numpy())

    probs = np.concatenate(all_probs)
    labels = np.concatenate(all_labels)
    predictions = (probs >= threshold).astype(np.int64)
    truth = labels.astype(np.int64)

    # Compute metrics
    metrics = compute_metrics(probs, labels, threshold)

    # Confusion matrix
    cm = confusion_matrix(truth, predictions)

    # ROC curve
    fpr, tpr, _ = roc_curve(truth, probs)
    roc_auc = auc(fpr, tpr)

    # Classification report
    report = classification_report(
        truth, predictions,
        target_names=["Non-Fall", "Fall"],
        zero_division=0,
        output_dict=True
    )

    return {
        "loss": float(np.mean(losses)),
        "threshold": threshold,
        "accuracy": metrics["accuracy"],
        "precision": metrics["precision"],
        "recall": metrics["recall"],
        "f1": metrics["f1"],
        "roc_auc": roc_auc,
        "confusion_matrix": cm.tolist(),
        "classification_report": report,
        "fpr": fpr.tolist(),
        "tpr": tpr.tolist(),
    }


def plot_training_history(history: dict[str, list[float]], save_path: Path) -> None:
    """Plot training history."""
    epochs = range(1, len(history["train_loss"]) + 1)

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # Loss
    axes[0, 0].plot(epochs, history["train_loss"], label="Train", color="blue")
    axes[0, 0].plot(epochs, history["val_loss"], label="Val", color="orange")
    axes[0, 0].set_title("Loss", fontsize=12)
    axes[0, 0].set_xlabel("Epoch")
    axes[0, 0].legend()
    axes[0, 0].grid(True, alpha=0.3)

    # Accuracy
    axes[0, 1].plot(epochs, history["train_accuracy"], label="Train", color="blue")
    axes[0, 1].plot(epochs, history["val_accuracy"], label="Val", color="orange")
    axes[0, 1].axhline(0.90, linestyle="--", color="green", alpha=0.7, label="Target (90%)")
    axes[0, 1].set_title("Accuracy", fontsize=12)
    axes[0, 1].set_xlabel("Epoch")
    axes[0, 1].legend()
    axes[0, 1].grid(True, alpha=0.3)

    # Validation Metrics
    axes[1, 0].plot(epochs, history["val_precision"], label="Precision", color="green")
    axes[1, 0].plot(epochs, history["val_recall"], label="Recall", color="red")
    axes[1, 0].plot(epochs, history["val_f1"], label="F1", color="purple")
    axes[1, 0].axhline(0.97, linestyle="--", color="red", alpha=0.7, label="Recall Target (97%)")
    axes[1, 0].set_title("Validation Metrics", fontsize=12)
    axes[1, 0].set_xlabel("Epoch")
    axes[1, 0].legend()
    axes[1, 0].grid(True, alpha=0.3)

    # Learning Rate
    axes[1, 1].plot(epochs, history["learning_rate"], color="brown")
    axes[1, 1].set_yscale("log")
    axes[1, 1].set_title("Learning Rate", fontsize=12)
    axes[1, 1].set_xlabel("Epoch")
    axes[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    LOGGER.info("Saved training history plot to %s", save_path)


def plot_confusion_matrix(cm: list[list[int]], save_path: Path) -> None:
    """Plot confusion matrix."""
    fig, ax = plt.subplots(figsize=(8, 6))

    matrix = np.array(cm)
    im = ax.imshow(matrix, cmap="Blues")

    ax.set_xticks([0, 1])
    ax.set_yticks([0, 1])
    ax.set_xticklabels(["Non-Fall", "Fall"])
    ax.set_yticklabels(["Non-Fall", "Fall"])
    ax.set_xlabel("Predicted", fontsize=12)
    ax.set_ylabel("Actual", fontsize=12)
    ax.set_title("Confusion Matrix", fontsize=14)

    # Add text annotations
    for i in range(2):
        for j in range(2):
            color = "white" if matrix[i, j] > matrix.max() / 2 else "black"
            ax.text(j, i, f"{matrix[i, j]:,}", ha="center", va="center",
                   color=color, fontsize=14, fontweight="bold")

    fig.colorbar(im, ax=ax)
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    LOGGER.info("Saved confusion matrix to %s", save_path)


def plot_roc_curve(fpr: list[float], tpr: list[float], roc_auc: float, save_path: Path) -> None:
    """Plot ROC curve."""
    fig, ax = plt.subplots(figsize=(8, 6))

    ax.plot(fpr, tpr, color="darkorange", lw=2, label=f"ROC curve (AUC = {roc_auc:.4f})")
    ax.plot([0, 1], [0, 1], color="navy", lw=2, linestyle="--", label="Random")
    ax.fill_between(fpr, tpr, alpha=0.2, color="darkorange")

    ax.set_xlim([0.0, 1.0])
    ax.set_ylim([0.0, 1.05])
    ax.set_xlabel("False Positive Rate", fontsize=12)
    ax.set_ylabel("True Positive Rate", fontsize=12)
    ax.set_title("Receiver Operating Characteristic (ROC) Curve", fontsize=14)
    ax.legend(loc="lower right")
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    LOGGER.info("Saved ROC curve to %s", save_path)


# =============================================================================
# Model Saving
# =============================================================================

def save_model(
    save_path: Path,
    model: nn.Module,
    trainer: Trainer,
    cfg: Config,
    mean: np.ndarray,
    std: np.ndarray,
    train_subjects: list[str],
    val_subjects: list[str],
    test_subjects: list[str]
) -> None:
    """Save model checkpoint with all metadata."""
    checkpoint = {
        "model_state_dict": model.state_dict(),
        "threshold": trainer.best_threshold,
        "best_epoch": trainer.best_epoch,
        "best_val_recall": trainer.best_recall,
        "feature_columns": FEATURES,
        "normalizer": {
            "mean": mean.tolist(),
            "std": std.tolist()
        },
        "config": {
            "raw_hz": cfg.raw_hz,
            "target_hz": cfg.target_hz,
            "window_size": cfg.window_size,
            "stride": cfg.stride,
            "window_seconds": cfg.window_seconds,
            "overlap": cfg.overlap,
            "acc_clip_min": cfg.acc_clip_min,
            "acc_clip_max": cfg.acc_clip_max,
            "gyro_clip_min": cfg.gyro_clip_min,
            "gyro_clip_max": cfg.gyro_clip_max,
            "conv1_filters": cfg.conv1_filters,
            "conv2_filters": cfg.conv2_filters,
            "lstm_hidden": cfg.lstm_hidden,
            "fc_hidden": cfg.fc_hidden,
            "dropout": cfg.dropout,
        },
        "subject_split": {
            "train": train_subjects,
            "val": val_subjects,
            "test": test_subjects
        },
        "history": dict(trainer.history)
    }

    torch.save(checkpoint, save_path)
    LOGGER.info("Saved model checkpoint to %s", save_path)


# =============================================================================
# Main Training Pipeline
# =============================================================================

def parse_args() -> Config:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Train Fall Detection Model on SisFall Dataset"
    )

    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).parent / "SisFall_dataset",
        help="Path to SisFall dataset directory"
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).parent / "outputs",
        help="Output directory for models and plots"
    )
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=64, help="Batch size")
    parser.add_argument("--learning-rate", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--patience", type=int, default=10, help="Early stopping patience")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")

    args = parser.parse_args()

    return Config(
        data_dir=args.data_dir.resolve(),
        output_dir=args.output_dir.resolve(),
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        patience=args.patience,
        seed=args.seed
    )


def main() -> None:
    """Main training pipeline."""
    cfg = parse_args()

    # Set seed
    set_seed(cfg.seed)

    # Create output directories
    cfg.output_dir.mkdir(parents=True, exist_ok=True)

    LOGGER.info("=" * 70)
    LOGGER.info("Fall Detection Model Training - SisFall Dataset")
    LOGGER.info("=" * 70)
    LOGGER.info("Data directory: %s", cfg.data_dir)
    LOGGER.info("Output directory: %s", cfg.output_dir)
    LOGGER.info("Device: %s", cfg.device)
    if cfg.device.type == "cuda":
        LOGGER.info("GPU: %s", torch.cuda.get_device_name(0))
    LOGGER.info("Window: %.1fs at %dHz = %d samples",
                cfg.window_seconds, cfg.target_hz, cfg.window_size)
    LOGGER.info("Overlap: %.0f%% (stride=%d)", cfg.overlap * 100, cfg.stride)

    # Check data directory
    if not cfg.data_dir.exists():
        raise FileNotFoundError(f"Data directory not found: {cfg.data_dir}")

    # ==========================================================================
    # Step 1: Load and preprocess data
    # ==========================================================================
    LOGGER.info("-" * 70)
    LOGGER.info("Step 1: Loading SisFall dataset")
    LOGGER.info("-" * 70)

    loader = SisFallDataLoader(cfg)
    subjects = loader.load_all_files()

    if not subjects:
        raise ValueError("No data loaded from SisFall dataset")

    # Log subject statistics
    for subject_id, subject in sorted(subjects.items()):
        LOGGER.debug("Subject %s: %d recordings (%d fall, %d non-fall)",
                    subject_id, len(subject.recordings),
                    subject.fall_count, subject.non_fall_count)

    # ==========================================================================
    # Step 2: Subject-wise split
    # ==========================================================================
    LOGGER.info("-" * 70)
    LOGGER.info("Step 2: Subject-wise train/val/test split")
    LOGGER.info("-" * 70)

    splitter = SubjectSplitter(cfg)
    train_subjects, val_subjects, test_subjects = splitter.split_subjects(subjects)

    # Log split statistics
    for split_name, split_ids in [
        ("Train", train_subjects),
        ("Val", val_subjects),
        ("Test", test_subjects)
    ]:
        fall, non_fall = splitter.get_class_distribution(subjects, split_ids)
        LOGGER.info("%s: %d subjects, %d recordings (%d fall, %d non-fall)",
                   split_name, len(split_ids), fall + non_fall, fall, non_fall)

    # Verify no overlap
    train_set = set(train_subjects)
    val_set = set(val_subjects)
    test_set = set(test_subjects)

    assert train_set.isdisjoint(val_set), "Train/Val subject overlap detected!"
    assert train_set.isdisjoint(test_set), "Train/Test subject overlap detected!"
    assert val_set.isdisjoint(test_set), "Val/Test subject overlap detected!"
    LOGGER.info("Verified: No subject overlap between splits")

    # ==========================================================================
    # Step 3: Generate windows
    # ==========================================================================
    LOGGER.info("-" * 70)
    LOGGER.info("Step 3: Generating sliding windows")
    LOGGER.info("-" * 70)

    window_gen = WindowGenerator(cfg)

    # Create training windows (and compute normalizer)
    train_windows, train_labels, mean, std = window_gen.create_windows(
        subjects, train_subjects, mean=None, std=None
    )
    LOGGER.info("Train windows: %d (fall=%d, non-fall=%d)",
                len(train_labels), int(train_labels.sum()),
                int(len(train_labels) - train_labels.sum()))

    # Create validation windows (using train normalizer)
    val_windows, val_labels, _, _ = window_gen.create_windows(
        subjects, val_subjects, mean=mean, std=std
    )
    LOGGER.info("Val windows: %d (fall=%d, non-fall=%d)",
                len(val_labels), int(val_labels.sum()),
                int(len(val_labels) - val_labels.sum()))

    # Create test windows (using train normalizer)
    test_windows, test_labels, _, _ = window_gen.create_windows(
        subjects, test_subjects, mean=mean, std=std
    )
    LOGGER.info("Test windows: %d (fall=%d, non-fall=%d)",
                len(test_labels), int(test_labels.sum()),
                int(len(test_labels) - test_labels.sum()))

    LOGGER.info("Normalization - Mean: %s", np.round(mean, 4).tolist())
    LOGGER.info("Normalization - Std: %s", np.round(std, 4).tolist())

    # ==========================================================================
    # Step 4: Create data loaders
    # ==========================================================================
    LOGGER.info("-" * 70)
    LOGGER.info("Step 4: Creating data loaders")
    LOGGER.info("-" * 70)

    train_dataset = FallDataset(train_windows, train_labels)
    val_dataset = FallDataset(val_windows, val_labels)
    test_dataset = FallDataset(test_windows, test_labels)

    pin_memory = cfg.device.type == "cuda"

    train_loader = DataLoader(
        train_dataset,
        batch_size=cfg.batch_size,
        shuffle=True,
        num_workers=0,
        pin_memory=pin_memory
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=cfg.batch_size,
        shuffle=False,
        num_workers=0,
        pin_memory=pin_memory
    )
    test_loader = DataLoader(
        test_dataset,
        batch_size=cfg.batch_size,
        shuffle=False,
        num_workers=0,
        pin_memory=pin_memory
    )

    LOGGER.info("Train batches: %d", len(train_loader))
    LOGGER.info("Val batches: %d", len(val_loader))
    LOGGER.info("Test batches: %d", len(test_loader))

    # ==========================================================================
    # Step 5: Create model
    # ==========================================================================
    LOGGER.info("-" * 70)
    LOGGER.info("Step 5: Creating model")
    LOGGER.info("-" * 70)

    model = FallDetector(cfg)
    n_params = sum(p.numel() for p in model.parameters())
    LOGGER.info("Model parameters: %s", f"{n_params:,}")
    LOGGER.info("Model architecture:\n%s", model)

    # ==========================================================================
    # Step 6: Train model
    # ==========================================================================
    LOGGER.info("-" * 70)
    LOGGER.info("Step 6: Training model")
    LOGGER.info("-" * 70)

    pos_weight = compute_class_weights(train_labels, cfg.device)
    trainer = Trainer(model, cfg, pos_weight)
    history = trainer.fit(train_loader, val_loader)

    if trainer.best_state is None:
        raise RuntimeError("Training finished without finding a best model checkpoint")

    # ==========================================================================
    # Step 7: Evaluate on test set
    # ==========================================================================
    LOGGER.info("-" * 70)
    LOGGER.info("Step 7: Evaluating on test set")
    LOGGER.info("-" * 70)

    test_results = full_evaluation(
        trainer.model, test_loader, trainer.criterion,
        cfg.device, trainer.best_threshold
    )

    LOGGER.info("Test Results (threshold=%.3f):", trainer.best_threshold)
    LOGGER.info("  Accuracy:  %.4f", test_results["accuracy"])
    LOGGER.info("  Precision: %.4f", test_results["precision"])
    LOGGER.info("  Recall:    %.4f (TARGET: %.2f) %s",
                test_results["recall"], cfg.target_recall,
                "OK" if test_results["recall"] >= cfg.target_recall else "BELOW TARGET")
    LOGGER.info("  F1 Score:  %.4f", test_results["f1"])
    LOGGER.info("  ROC AUC:   %.4f", test_results["roc_auc"])

    # Print confusion matrix
    cm = test_results["confusion_matrix"]
    LOGGER.info("Confusion Matrix:")
    LOGGER.info("              Pred Non-Fall  Pred Fall")
    LOGGER.info("  Non-Fall      %6d       %6d", cm[0][0], cm[0][1])
    LOGGER.info("  Fall          %6d       %6d", cm[1][0], cm[1][1])

    # ==========================================================================
    # Step 8: Save outputs
    # ==========================================================================
    LOGGER.info("-" * 70)
    LOGGER.info("Step 8: Saving outputs")
    LOGGER.info("-" * 70)

    # Save model
    model_path = cfg.output_dir / "model_fall_detector.pth"
    save_model(
        model_path, trainer.model, trainer, cfg, mean, std,
        train_subjects, val_subjects, test_subjects
    )

    # Save plots
    plot_training_history(history, cfg.output_dir / "training_history.png")
    plot_confusion_matrix(test_results["confusion_matrix"], cfg.output_dir / "confusion_matrix.png")
    plot_roc_curve(
        test_results["fpr"], test_results["tpr"],
        test_results["roc_auc"], cfg.output_dir / "roc_curve.png"
    )

    # Save test metrics report
    report = {
        "config": {
            "data_dir": str(cfg.data_dir),
            "output_dir": str(cfg.output_dir),
            "raw_hz": cfg.raw_hz,
            "target_hz": cfg.target_hz,
            "window_seconds": cfg.window_seconds,
            "overlap": cfg.overlap,
            "window_size": cfg.window_size,
            "stride": cfg.stride,
            "batch_size": cfg.batch_size,
            "epochs": cfg.epochs,
            "learning_rate": cfg.learning_rate,
            "seed": cfg.seed,
        },
        "subject_split": {
            "train": train_subjects,
            "val": val_subjects,
            "test": test_subjects,
            "train_count": len(train_subjects),
            "val_count": len(val_subjects),
            "test_count": len(test_subjects),
        },
        "window_counts": {
            "train": int(len(train_labels)),
            "train_fall": int(train_labels.sum()),
            "train_non_fall": int(len(train_labels) - train_labels.sum()),
            "val": int(len(val_labels)),
            "val_fall": int(val_labels.sum()),
            "val_non_fall": int(len(val_labels) - val_labels.sum()),
            "test": int(len(test_labels)),
            "test_fall": int(test_labels.sum()),
            "test_non_fall": int(len(test_labels) - test_labels.sum()),
        },
        "training": {
            "best_epoch": trainer.best_epoch,
            "best_val_recall": trainer.best_recall,
            "best_threshold": trainer.best_threshold,
            "total_epochs": len(history["train_loss"]),
        },
        "test_results": {
            "threshold": test_results["threshold"],
            "accuracy": test_results["accuracy"],
            "precision": test_results["precision"],
            "recall": test_results["recall"],
            "f1": test_results["f1"],
            "roc_auc": test_results["roc_auc"],
            "confusion_matrix": test_results["confusion_matrix"],
        },
        "targets_met": {
            "recall_target": cfg.target_recall,
            "recall_met": test_results["recall"] >= cfg.target_recall,
            "accuracy_target": cfg.target_accuracy,
            "accuracy_met": test_results["accuracy"] >= cfg.target_accuracy,
        }
    }

    report_path = cfg.output_dir / "test_metrics_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    LOGGER.info("Saved test metrics report to %s", report_path)

    # ==========================================================================
    # Summary
    # ==========================================================================
    LOGGER.info("=" * 70)
    LOGGER.info("TRAINING COMPLETE")
    LOGGER.info("=" * 70)
    LOGGER.info("Best epoch: %d", trainer.best_epoch)
    LOGGER.info("Best threshold: %.3f", trainer.best_threshold)
    LOGGER.info("Test Accuracy: %.4f (target: %.2f) %s",
                test_results["accuracy"], cfg.target_accuracy,
                "PASS" if test_results["accuracy"] >= cfg.target_accuracy else "FAIL")
    LOGGER.info("Test Recall: %.4f (target: %.2f) %s",
                test_results["recall"], cfg.target_recall,
                "PASS" if test_results["recall"] >= cfg.target_recall else "FAIL")
    LOGGER.info("Outputs saved to: %s", cfg.output_dir)
    LOGGER.info("=" * 70)


if __name__ == "__main__":
    main()
