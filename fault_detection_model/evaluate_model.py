#!/usr/bin/env python3
"""
Comprehensive Evaluation Script for Fall Detection Model
Generates confusion matrices and metrics for Train, Validation, and Test sets
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from scipy import signal
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm

FEATURES = ["acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z"]


@dataclass
class Recording:
    file_path: Path
    subject_id: str
    activity_code: str
    trial: str
    label: int
    timestamps: np.ndarray = field(default_factory=lambda: np.array([]))
    features: np.ndarray = field(default_factory=lambda: np.array([]))


@dataclass
class Subject:
    subject_id: str
    recordings: list[Recording] = field(default_factory=list)

    @property
    def fall_count(self) -> int:
        return sum(1 for r in self.recordings if r.label == 1)

    @property
    def non_fall_count(self) -> int:
        return sum(1 for r in self.recordings if r.label == 0)


class FallDataset(Dataset):
    def __init__(self, windows: np.ndarray, labels: np.ndarray) -> None:
        self.windows = torch.as_tensor(windows, dtype=torch.float32)
        self.labels = torch.as_tensor(labels, dtype=torch.float32)

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self.windows[idx], self.labels[idx]


class FallDetector(nn.Module):
    def __init__(self, conv1_filters=64, conv2_filters=128, lstm_hidden=128, fc_hidden=64, dropout=0.5):
        super().__init__()
        self.conv1 = nn.Conv1d(len(FEATURES), conv1_filters, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(conv1_filters)
        self.pool1 = nn.MaxPool1d(kernel_size=2)
        self.conv2 = nn.Conv1d(conv1_filters, conv2_filters, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(conv2_filters)
        self.pool2 = nn.MaxPool1d(kernel_size=2)
        self.lstm = nn.LSTM(input_size=conv2_filters, hidden_size=lstm_hidden, batch_first=True)
        self.fc1 = nn.Linear(lstm_hidden, fc_hidden)
        self.fc2 = nn.Linear(fc_hidden, 1)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x.transpose(1, 2)
        x = self.pool1(self.relu(self.bn1(self.conv1(x))))
        x = self.pool2(self.relu(self.bn2(self.conv2(x))))
        x = x.transpose(1, 2)
        x, _ = self.lstm(x)
        x = x[:, -1, :]
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        return self.fc2(x).squeeze(-1)


class DataLoader_:
    FILENAME_PATTERN = re.compile(r"^([FD]\d+)_([A-Z]+\d+)_R(\d+)\.txt$")

    def __init__(self, data_dir: Path, raw_hz=200, target_hz=50, window_size=100):
        self.data_dir = data_dir
        self.raw_hz = raw_hz
        self.target_hz = target_hz
        self.window_size = window_size
        self.downsample_factor = raw_hz // target_hz

    def parse_filename(self, file_path: Path):
        match = self.FILENAME_PATTERN.match(file_path.name)
        if not match:
            return None
        activity_code = match.group(1)
        subject_id = match.group(2)
        trial = match.group(3)
        label = 1 if activity_code.startswith("F") else 0
        return activity_code, subject_id, trial, label

    def load_file(self, file_path: Path):
        try:
            data = []
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    if line.endswith(";"):
                        line = line[:-1]
                    parts = line.replace(";", ",").split(",")
                    if len(parts) >= 6:
                        values = [float(p.strip()) for p in parts[:6]]
                        data.append(values)
            if not data:
                return None
            return np.array(data, dtype=np.float32)
        except Exception:
            return None

    def convert_units(self, data: np.ndarray) -> np.ndarray:
        converted = np.zeros_like(data)
        converted[:, 0:3] = data[:, 0:3] / 256.0
        converted[:, 3:6] = data[:, 3:6] / 14.375
        return converted

    def resample(self, data: np.ndarray):
        num_samples = len(data)
        target_samples = int(num_samples / self.downsample_factor)
        if target_samples < 1:
            return data
        return signal.resample(data, target_samples, axis=0).astype(np.float32)

    def clip_values(self, data: np.ndarray) -> np.ndarray:
        clipped = np.copy(data)
        clipped[:, 0:3] = np.clip(clipped[:, 0:3], -3.0, 3.0)
        clipped[:, 3:6] = np.clip(clipped[:, 3:6], -500.0, 500.0)
        return clipped

    def load_all_files(self):
        subjects = {}
        txt_files = list(self.data_dir.rglob("*.txt"))

        for file_path in tqdm(txt_files, desc="Loading SisFall files"):
            parsed = self.parse_filename(file_path)
            if parsed is None:
                continue
            activity_code, subject_id, trial, label = parsed
            raw_data = self.load_file(file_path)
            if raw_data is None or len(raw_data) < self.window_size * self.downsample_factor:
                continue
            data = self.convert_units(raw_data)
            data = self.resample(data)
            mask = ~np.any(np.isnan(data), axis=1)
            data = data[mask]
            if len(data) < self.window_size:
                continue
            data = self.clip_values(data)

            recording = Recording(
                file_path=file_path,
                subject_id=subject_id,
                activity_code=activity_code,
                trial=trial,
                label=label,
                features=data
            )
            if subject_id not in subjects:
                subjects[subject_id] = Subject(subject_id=subject_id)
            subjects[subject_id].recordings.append(recording)

        return subjects


def create_windows(subjects, subject_ids, mean, std, window_size=100, stride=50):
    recordings = []
    for sid in subject_ids:
        if sid in subjects:
            recordings.extend(subjects[sid].recordings)

    windows = []
    labels = []

    for recording in recordings:
        normalized = (recording.features - mean) / std
        n_samples = len(normalized)
        for start in range(0, n_samples - window_size + 1, stride):
            end = start + window_size
            windows.append(normalized[start:end])
            labels.append(recording.label)

    return np.stack(windows), np.array(labels, dtype=np.float32)


@torch.no_grad()
def predict(model, loader, device, threshold):
    model.eval()
    all_probs = []
    all_labels = []

    for batch_x, batch_y in loader:
        batch_x = batch_x.to(device)
        logits = model(batch_x)
        probs = torch.sigmoid(logits).cpu().numpy()
        all_probs.append(probs)
        all_labels.append(batch_y.numpy())

    probs = np.concatenate(all_probs)
    labels = np.concatenate(all_labels)
    preds = (probs >= threshold).astype(np.int64)

    return probs, labels, preds


def compute_metrics(labels, preds, probs):
    return {
        "accuracy": accuracy_score(labels, preds),
        "precision": precision_score(labels, preds, zero_division=0),
        "recall": recall_score(labels, preds, zero_division=0),
        "f1": f1_score(labels, preds, zero_division=0),
        "roc_auc": roc_auc_score(labels, probs) if len(np.unique(labels)) > 1 else 0.0,
        "confusion_matrix": confusion_matrix(labels, preds).tolist()
    }


def plot_all_confusion_matrices(train_cm, val_cm, test_cm, save_path):
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))

    titles = ["Train Set", "Validation Set", "Test Set"]
    cms = [train_cm, val_cm, test_cm]

    for ax, cm, title in zip(axes, cms, titles):
        cm = np.array(cm)
        im = ax.imshow(cm, cmap="Blues")
        ax.set_xticks([0, 1])
        ax.set_yticks([0, 1])
        ax.set_xticklabels(["Non-Fall", "Fall"])
        ax.set_yticklabels(["Non-Fall", "Fall"])
        ax.set_xlabel("Predicted", fontsize=11)
        ax.set_ylabel("Actual", fontsize=11)
        ax.set_title(title, fontsize=14, fontweight="bold")

        # Add values
        for i in range(2):
            for j in range(2):
                color = "white" if cm[i, j] > cm.max() / 2 else "black"
                ax.text(j, i, f"{cm[i, j]:,}", ha="center", va="center",
                       color=color, fontsize=12, fontweight="bold")

        fig.colorbar(im, ax=ax, shrink=0.8)

    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved confusion matrices to {save_path}")


def print_metrics_table(name, metrics, n_windows, n_fall, n_non_fall, threshold):
    print(f"\n{'='*60}")
    print(f" {name} Set Evaluation")
    print(f"{'='*60}")
    print(f" Windows:     {n_windows:,} (Fall: {n_fall:,}, Non-Fall: {n_non_fall:,})")
    print(f" Threshold:   {threshold:.3f}")
    print(f"{'-'*60}")
    print(f" Accuracy:    {metrics['accuracy']:.4f} ({metrics['accuracy']*100:.2f}%)")
    print(f" Precision:   {metrics['precision']:.4f} ({metrics['precision']*100:.2f}%)")
    print(f" Recall:      {metrics['recall']:.4f} ({metrics['recall']*100:.2f}%)")
    print(f" F1-Score:    {metrics['f1']:.4f}")
    print(f" ROC AUC:     {metrics['roc_auc']:.4f}")
    print(f"{'-'*60}")
    cm = np.array(metrics['confusion_matrix'])
    print(f" Confusion Matrix:")
    print(f"                  Predicted")
    print(f"                Non-Fall    Fall")
    print(f" Actual Non-Fall  {cm[0,0]:>7,}  {cm[0,1]:>7,}")
    print(f" Actual Fall      {cm[1,0]:>7,}  {cm[1,1]:>7,}")
    print(f"{'='*60}")


def main():
    # Paths
    base_dir = Path(__file__).parent
    model_path = base_dir / "outputs" / "model_fall_detector.pth"
    data_dir = base_dir / "SisFall_dataset"
    output_dir = base_dir / "outputs"

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # Load checkpoint
    print(f"\nLoading model from {model_path}")
    checkpoint = torch.load(model_path, map_location=device, weights_only=False)

    # Get configuration
    config = checkpoint["config"]
    threshold = checkpoint["threshold"]
    mean = np.array(checkpoint["normalizer"]["mean"], dtype=np.float32)
    std = np.array(checkpoint["normalizer"]["std"], dtype=np.float32)
    subject_split = checkpoint["subject_split"]

    train_subjects = subject_split["train"]
    val_subjects = subject_split["val"]
    test_subjects = subject_split["test"]

    print(f"\n{'='*60}")
    print(" MODEL CONFIGURATION")
    print(f"{'='*60}")
    print(f" Window Size:      {config['window_size']} samples ({config['window_size']/config['target_hz']:.1f}s)")
    print(f" Target Hz:        {config['target_hz']} Hz")
    print(f" Stride:           {config['stride']} samples (50% overlap)")
    print(f" Conv1 Filters:    {config['conv1_filters']}")
    print(f" Conv2 Filters:    {config['conv2_filters']}")
    print(f" LSTM Hidden:      {config['lstm_hidden']}")
    print(f" FC Hidden:        {config['fc_hidden']}")
    print(f" Dropout:          {config['dropout']}")
    print(f" Best Epoch:       {checkpoint['best_epoch']}")
    print(f" Best Threshold:   {threshold:.3f}")
    print(f" Best Val Recall:  {checkpoint['best_val_recall']:.4f}")
    print(f"{'='*60}")

    print(f"\n{'='*60}")
    print(" SUBJECT SPLIT (No Overlap)")
    print(f"{'='*60}")
    print(f" Train Subjects ({len(train_subjects)}): {', '.join(sorted(train_subjects))}")
    print(f" Val Subjects ({len(val_subjects)}):   {', '.join(sorted(val_subjects))}")
    print(f" Test Subjects ({len(test_subjects)}):  {', '.join(sorted(test_subjects))}")
    print(f"{'='*60}")

    print(f"\n{'='*60}")
    print(" NORMALIZATION PARAMETERS (from training set)")
    print(f"{'='*60}")
    for i, feature in enumerate(FEATURES):
        print(f" {feature:>8}: mean={mean[i]:>8.4f}, std={std[i]:>8.4f}")
    print(f"{'='*60}")

    # Create model
    model = FallDetector(
        conv1_filters=config["conv1_filters"],
        conv2_filters=config["conv2_filters"],
        lstm_hidden=config["lstm_hidden"],
        fc_hidden=config["fc_hidden"],
        dropout=config["dropout"]
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()

    # Load data
    print("\nLoading dataset...")
    loader = DataLoader_(
        data_dir=data_dir,
        raw_hz=200,
        target_hz=config["target_hz"],
        window_size=config["window_size"]
    )
    subjects = loader.load_all_files()

    # Create windows for each split
    print("\nCreating windows for each split...")
    train_windows, train_labels = create_windows(
        subjects, train_subjects, mean, std, config["window_size"], config["stride"]
    )
    val_windows, val_labels = create_windows(
        subjects, val_subjects, mean, std, config["window_size"], config["stride"]
    )
    test_windows, test_labels = create_windows(
        subjects, test_subjects, mean, std, config["window_size"], config["stride"]
    )

    # Create data loaders
    train_loader = DataLoader(FallDataset(train_windows, train_labels), batch_size=64, shuffle=False)
    val_loader = DataLoader(FallDataset(val_windows, val_labels), batch_size=64, shuffle=False)
    test_loader = DataLoader(FallDataset(test_windows, test_labels), batch_size=64, shuffle=False)

    # Evaluate on each split
    print("\nEvaluating on all splits...")
    train_probs, train_labels_arr, train_preds = predict(model, train_loader, device, threshold)
    val_probs, val_labels_arr, val_preds = predict(model, val_loader, device, threshold)
    test_probs, test_labels_arr, test_preds = predict(model, test_loader, device, threshold)

    train_metrics = compute_metrics(train_labels_arr, train_preds, train_probs)
    val_metrics = compute_metrics(val_labels_arr, val_preds, val_probs)
    test_metrics = compute_metrics(test_labels_arr, test_preds, test_probs)

    # Print metrics
    print_metrics_table("Train", train_metrics, len(train_labels), int(train_labels.sum()),
                       int(len(train_labels) - train_labels.sum()), threshold)
    print_metrics_table("Validation", val_metrics, len(val_labels), int(val_labels.sum()),
                       int(len(val_labels) - val_labels.sum()), threshold)
    print_metrics_table("Test", test_metrics, len(test_labels), int(test_labels.sum()),
                       int(len(test_labels) - test_labels.sum()), threshold)

    # Plot confusion matrices
    plot_all_confusion_matrices(
        train_metrics["confusion_matrix"],
        val_metrics["confusion_matrix"],
        test_metrics["confusion_matrix"],
        output_dir / "all_confusion_matrices.png"
    )

    # Summary
    print(f"\n{'='*60}")
    print(" SUMMARY")
    print(f"{'='*60}")
    print(f" {'Split':<12} {'Accuracy':>10} {'Precision':>10} {'Recall':>10} {'F1':>10} {'ROC AUC':>10}")
    print(f" {'-'*12} {'-'*10} {'-'*10} {'-'*10} {'-'*10} {'-'*10}")
    print(f" {'Train':<12} {train_metrics['accuracy']:>10.4f} {train_metrics['precision']:>10.4f} {train_metrics['recall']:>10.4f} {train_metrics['f1']:>10.4f} {train_metrics['roc_auc']:>10.4f}")
    print(f" {'Validation':<12} {val_metrics['accuracy']:>10.4f} {val_metrics['precision']:>10.4f} {val_metrics['recall']:>10.4f} {val_metrics['f1']:>10.4f} {val_metrics['roc_auc']:>10.4f}")
    print(f" {'Test':<12} {test_metrics['accuracy']:>10.4f} {test_metrics['precision']:>10.4f} {test_metrics['recall']:>10.4f} {test_metrics['f1']:>10.4f} {test_metrics['roc_auc']:>10.4f}")
    print(f"{'='*60}")

    # Target check
    recall_target = 0.97
    print(f"\n Target Recall: {recall_target:.2f}")
    print(f" Test Recall:   {test_metrics['recall']:.4f} {'PASS' if test_metrics['recall'] >= recall_target else 'FAIL'}")

    # Save comprehensive report
    report = {
        "model_config": config,
        "threshold": threshold,
        "best_epoch": checkpoint["best_epoch"],
        "normalizer": {"mean": mean.tolist(), "std": std.tolist()},
        "subject_split": {"train": train_subjects, "val": val_subjects, "test": test_subjects},
        "train_metrics": train_metrics,
        "val_metrics": val_metrics,
        "test_metrics": test_metrics
    }

    report_path = output_dir / "comprehensive_evaluation_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nSaved comprehensive report to {report_path}")


if __name__ == "__main__":
    main()
