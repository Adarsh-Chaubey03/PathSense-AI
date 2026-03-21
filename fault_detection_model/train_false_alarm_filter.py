#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import logging
import math
import random
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
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
from sklearn.model_selection import train_test_split
from torch.optim import Adam
from torch.optim.lr_scheduler import ReduceLROnPlateau
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm


logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
LOGGER = logging.getLogger("false_alarm_filter")

RAW_FEATURES = ["acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z"]
ENGINEERED_FEATURES = ["smv", "gyro_mag", "jerk_x", "jerk_y", "jerk_z", "jerk_mag"]
FEATURES = RAW_FEATURES + ENGINEERED_FEATURES
JSON_FALSE_LABELS = {"phone_drop", "phone_placed_on_table", "random_movement"}


@dataclass
class Config:
    data_dir: Path
    output_dir: Path
    batch_size: int = 64
    epochs: int = 40
    learning_rate: float = 1e-3
    weight_decay: float = 1e-5
    patience: int = 8
    raw_hz: int = 200
    target_hz: int = 50
    window_seconds: float = 2.0
    overlap: float = 0.5
    train_ratio: float = 0.70
    val_ratio: float = 0.15
    test_ratio: float = 0.15
    conv1_filters: int = 64
    conv2_filters: int = 128
    conv3_filters: int = 256
    lstm_hidden: int = 128
    fc_hidden: int = 64
    dropout: float = 0.5
    min_recall: float = 0.85
    json_gap_seconds: float = 1.0
    seed: int = 42
    balance_strategy: str = "undersample"
    max_json_sessions: int | None = None
    max_sisfall_recordings: int | None = None

    @property
    def device(self) -> torch.device:
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")

    @property
    def window_size(self) -> int:
        return int(self.window_seconds * self.target_hz)

    @property
    def stride(self) -> int:
        return int(self.window_size * (1.0 - self.overlap))

    @property
    def sampling_interval(self) -> float:
        return 1.0 / self.target_hz


@dataclass
class Recording:
    recording_id: str
    label: int
    source: str
    event_type: str
    subject_id: str
    activity_code: str
    timestamps: np.ndarray
    features: np.ndarray
    metadata: dict[str, Any] = field(default_factory=dict)


class WindowDataset(Dataset):
    def __init__(self, windows: np.ndarray, labels: np.ndarray) -> None:
        self.windows = torch.as_tensor(windows, dtype=torch.float32)
        self.labels = torch.as_tensor(labels, dtype=torch.float32)

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self.windows[idx], self.labels[idx]


class FalseAlarmFilter(nn.Module):
    def __init__(self, cfg: Config) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(len(FEATURES), cfg.conv1_filters, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(cfg.conv1_filters)
        self.pool1 = nn.MaxPool1d(kernel_size=2)

        self.conv2 = nn.Conv1d(cfg.conv1_filters, cfg.conv2_filters, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(cfg.conv2_filters)
        self.pool2 = nn.MaxPool1d(kernel_size=2)

        self.conv3 = nn.Conv1d(cfg.conv2_filters, cfg.conv3_filters, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm1d(cfg.conv3_filters)

        self.lstm = nn.LSTM(input_size=cfg.conv3_filters, hidden_size=cfg.lstm_hidden, batch_first=True)
        self.fc1 = nn.Linear(cfg.lstm_hidden, cfg.fc_hidden)
        self.fc2 = nn.Linear(cfg.fc_hidden, 1)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(cfg.dropout)

        self._init_weights()

    def _init_weights(self) -> None:
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

    def forward(self, batch: torch.Tensor) -> torch.Tensor:
        x = batch.transpose(1, 2)
        x = self.pool1(self.relu(self.bn1(self.conv1(x))))
        x = self.pool2(self.relu(self.bn2(self.conv2(x))))
        x = self.relu(self.bn3(self.conv3(x)))
        x = x.transpose(1, 2)
        x, _ = self.lstm(x)
        x = x[:, -1, :]
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        return self.fc2(x).squeeze(-1)


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def read_json_records(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, list):
        return data
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def parse_sisfall_file(path: Path) -> np.ndarray | None:
    rows: list[list[float]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            cleaned = line.strip().rstrip(";")
            if not cleaned:
                continue
            parts = [part.strip() for part in cleaned.split(",")]
            if len(parts) < 6:
                continue
            try:
                rows.append([float(parts[idx]) for idx in range(6)])
            except ValueError:
                continue
    if not rows:
        return None
    return np.asarray(rows, dtype=np.float32)


def convert_sisfall_units(raw: np.ndarray) -> pd.DataFrame:
    frame = pd.DataFrame(raw[:, :6], columns=RAW_FEATURES)
    frame[["acc_x", "acc_y", "acc_z"]] = frame[["acc_x", "acc_y", "acc_z"]] / 256.0
    frame[["gyro_x", "gyro_y", "gyro_z"]] = frame[["gyro_x", "gyro_y", "gyro_z"]] / 14.375
    return frame


def json_timestamp_scale(timestamps: np.ndarray) -> float:
    positive_diffs = np.diff(timestamps)
    positive_diffs = positive_diffs[positive_diffs > 0]
    median_step = float(np.median(positive_diffs)) if positive_diffs.size else 0.0
    if np.nanmax(np.abs(timestamps)) > 1e6 or median_step > 0.5:
        return 1.0 / 1000.0
    return 1.0


def split_json_sessions(records: list[dict[str, Any]], cfg: Config, source_name: str) -> list[pd.DataFrame]:
    if not records:
        return []
    timestamps = np.asarray([float(item.get("timestamp", idx)) for idx, item in enumerate(records)], dtype=np.float64)
    scale = json_timestamp_scale(timestamps)
    labels = [str(item.get("label", "unknown")) for item in records]
    diffs = np.diff(timestamps * scale)
    boundaries = np.where(
        (diffs <= 0.0)
        | (diffs > cfg.json_gap_seconds)
        | (np.asarray(labels[1:], dtype=object) != np.asarray(labels[:-1], dtype=object))
    )[0] + 1
    sessions: list[pd.DataFrame] = []
    for segment_index, segment in enumerate(np.split(np.asarray(records, dtype=object), boundaries), start=1):
        rows = list(segment.tolist())
        if not rows:
            continue
        frame = pd.DataFrame(rows)
        if frame.empty:
            continue
        frame["source_file"] = source_name
        frame["recording_id"] = f"{source_name}_segment_{segment_index:03d}"
        sessions.append(frame)
    return sessions


def clean_frame(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    for column in ["timestamp", *RAW_FEATURES]:
        result[column] = pd.to_numeric(result[column], errors="coerce")
    result = result.dropna(subset=["timestamp", *RAW_FEATURES])
    result = result.drop_duplicates()
    result = result.sort_values("timestamp")
    result = result.drop_duplicates(subset=["timestamp"], keep="first")
    if result.empty:
        return result
    result["timestamp"] = result["timestamp"] - float(result["timestamp"].iloc[0])
    if float(result["timestamp"].max()) > 1e3:
        result["timestamp"] = result["timestamp"] / 1000.0
    result[["acc_x", "acc_y", "acc_z"]] = result[["acc_x", "acc_y", "acc_z"]].clip(-3.0, 3.0)
    result[["gyro_x", "gyro_y", "gyro_z"]] = result[["gyro_x", "gyro_y", "gyro_z"]].clip(-500.0, 500.0)
    return result.reset_index(drop=True)


def resample_frame(frame: pd.DataFrame, cfg: Config) -> pd.DataFrame | None:
    if len(frame) < 2:
        return None
    timestamps = frame["timestamp"].to_numpy(dtype=np.float64, copy=True)
    duration = float(timestamps[-1] - timestamps[0])
    if duration <= 0.0:
        return None
    target_times = np.arange(0.0, duration + cfg.sampling_interval * 0.5, cfg.sampling_interval, dtype=np.float64)
    if len(target_times) < cfg.window_size:
        return None
    resampled = pd.DataFrame({"timestamp": target_times})
    for column in RAW_FEATURES:
        values = frame[column].to_numpy(dtype=np.float64, copy=True)
        resampled[column] = np.interp(target_times, timestamps, values)
    for column in ["label", "source", "event_type", "subject_id", "activity_code", "recording_id"]:
        resampled[column] = frame[column].iloc[0]
    resampled[["acc_x", "acc_y", "acc_z"]] = resampled[["acc_x", "acc_y", "acc_z"]].clip(-3.0, 3.0)
    resampled[["gyro_x", "gyro_y", "gyro_z"]] = resampled[["gyro_x", "gyro_y", "gyro_z"]].clip(-500.0, 500.0)
    return resampled


def add_engineered_features(frame: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    result = frame.copy()
    acc = result[["acc_x", "acc_y", "acc_z"]].to_numpy(dtype=np.float32, copy=True)
    gyro = result[["gyro_x", "gyro_y", "gyro_z"]].to_numpy(dtype=np.float32, copy=True)
    result["smv"] = np.sqrt(np.sum(acc ** 2, axis=1))
    result["gyro_mag"] = np.sqrt(np.sum(gyro ** 2, axis=1))
    result["jerk_x"] = np.gradient(result["acc_x"].to_numpy(dtype=np.float32), cfg.sampling_interval)
    result["jerk_y"] = np.gradient(result["acc_y"].to_numpy(dtype=np.float32), cfg.sampling_interval)
    result["jerk_z"] = np.gradient(result["acc_z"].to_numpy(dtype=np.float32), cfg.sampling_interval)
    jerk = result[["jerk_x", "jerk_y", "jerk_z"]].to_numpy(dtype=np.float32, copy=True)
    result["jerk_mag"] = np.sqrt(np.sum(jerk ** 2, axis=1))
    return result


def frame_to_recording(frame: pd.DataFrame) -> Recording:
    return Recording(
        recording_id=str(frame["recording_id"].iloc[0]),
        label=int(frame["label"].iloc[0]),
        source=str(frame["source"].iloc[0]),
        event_type=str(frame["event_type"].iloc[0]),
        subject_id=str(frame["subject_id"].iloc[0]),
        activity_code=str(frame["activity_code"].iloc[0]),
        timestamps=frame["timestamp"].to_numpy(dtype=np.float32, copy=True),
        features=frame[FEATURES].to_numpy(dtype=np.float32, copy=True),
        metadata={
            "n_samples": int(len(frame)),
            "duration_seconds": float(frame["timestamp"].iloc[-1]) if len(frame) else 0.0,
        },
    )


def load_json_recordings(cfg: Config) -> list[Recording]:
    json_files = sorted(cfg.data_dir.rglob("all_datasets_*.json"))
    if not json_files:
        raise FileNotFoundError(f"No all_datasets_*.json files found under {cfg.data_dir}")

    recordings: list[Recording] = []
    for json_path in json_files:
        LOGGER.info("Loading JSON false-event file: %s", json_path.name)
        raw_records = read_json_records(json_path)
        sessions = split_json_sessions(raw_records, cfg, json_path.stem)
        for session in sessions:
            event_type = str(session.get("label", pd.Series(["unknown"])).iloc[0])
            if event_type not in JSON_FALSE_LABELS:
                LOGGER.warning("Skipping unsupported JSON label '%s' in %s", event_type, json_path.name)
                continue
            session = session.copy()
            if "timestamp" not in session.columns:
                session["timestamp"] = np.arange(len(session), dtype=np.float64) * (1.0 / cfg.raw_hz)
            else:
                session["timestamp"] = pd.to_numeric(session["timestamp"], errors="coerce")
                session["timestamp"] = session["timestamp"] * json_timestamp_scale(
                    session["timestamp"].to_numpy(dtype=np.float64, copy=True)
                )
            session["source"] = "json_false_event"
            session["event_type"] = event_type
            session["label"] = 1
            session["subject_id"] = "custom_json"
            session["activity_code"] = event_type
            session[["gyro_x", "gyro_y", "gyro_z"]] = session[["gyro_x", "gyro_y", "gyro_z"]] * (180.0 / math.pi)
            cleaned = clean_frame(session[["timestamp", *RAW_FEATURES, "label", "source", "event_type", "subject_id", "activity_code", "recording_id"]])
            if len(cleaned) < 2:
                continue
            resampled = resample_frame(cleaned, cfg)
            if resampled is None:
                continue
            featured = add_engineered_features(resampled, cfg)
            recordings.append(frame_to_recording(featured))

    if cfg.max_json_sessions is not None:
        recordings = recordings[: cfg.max_json_sessions]

    LOGGER.info("Loaded %d JSON false-event recordings", len(recordings))
    return recordings


SISFALL_PATTERN = re.compile(r"^(D\d+)_([A-Z]+\d+)_R(\d+)\.txt$")


def load_sisfall_recordings(cfg: Config) -> list[Recording]:
    recordings: list[Recording] = []
    txt_files = sorted(cfg.data_dir.rglob("D*.txt"))
    if not txt_files:
        raise FileNotFoundError(f"No SisFall Dxx recordings found under {cfg.data_dir}")

    kept = 0
    for txt_path in txt_files:
        match = SISFALL_PATTERN.match(txt_path.name)
        if not match:
            continue
        raw = parse_sisfall_file(txt_path)
        if raw is None or raw.shape[0] < 2:
            continue
        frame = convert_sisfall_units(raw)
        frame["timestamp"] = np.arange(len(frame), dtype=np.float64) / float(cfg.raw_hz)
        frame["label"] = 0
        frame["source"] = "sisfall_adl"
        frame["event_type"] = "normal_adl"
        frame["subject_id"] = match.group(2)
        frame["activity_code"] = match.group(1)
        frame["recording_id"] = txt_path.stem
        cleaned = clean_frame(frame[["timestamp", *RAW_FEATURES, "label", "source", "event_type", "subject_id", "activity_code", "recording_id"]])
        if len(cleaned) < 2:
            continue
        resampled = resample_frame(cleaned, cfg)
        if resampled is None:
            continue
        featured = add_engineered_features(resampled, cfg)
        recordings.append(frame_to_recording(featured))
        kept += 1
        if cfg.max_sisfall_recordings is not None and kept >= cfg.max_sisfall_recordings:
            break

    LOGGER.info("Loaded %d SisFall ADL recordings", len(recordings))
    return recordings


def describe_recordings(name: str, recordings: list[Recording]) -> None:
    labels = np.asarray([recording.label for recording in recordings], dtype=np.int64)
    positives = int((labels == 1).sum())
    negatives = int((labels == 0).sum())
    LOGGER.info("%s recordings: %d | normal=%d false_event=%d", name, len(recordings), negatives, positives)


def split_by_ratio(recordings: list[Recording], cfg: Config, stratify_keys: list[str] | None = None) -> tuple[list[Recording], list[Recording], list[Recording]]:
    if len(recordings) < 3:
        raise ValueError("At least 3 recordings are required to create train/val/test splits.")

    indices = np.arange(len(recordings))
    if stratify_keys is not None and len(set(stratify_keys)) > 1:
        stratify_one = stratify_keys
    else:
        stratify_one = None

    try:
        train_idx, temp_idx = train_test_split(
            indices,
            train_size=cfg.train_ratio,
            random_state=cfg.seed,
            shuffle=True,
            stratify=stratify_one,
        )
    except ValueError:
        LOGGER.warning("Falling back to non-stratified train/temp split due to small class counts")
        train_idx, temp_idx = train_test_split(
            indices,
            train_size=cfg.train_ratio,
            random_state=cfg.seed,
            shuffle=True,
            stratify=None,
        )

    remaining_ratio = cfg.val_ratio + cfg.test_ratio
    val_share_of_temp = cfg.val_ratio / remaining_ratio
    temp_keys = [stratify_keys[idx] for idx in temp_idx] if stratify_keys is not None else None
    if temp_keys is not None and len(set(temp_keys)) <= 1:
        temp_keys = None

    try:
        val_idx, test_idx = train_test_split(
            temp_idx,
            train_size=val_share_of_temp,
            random_state=cfg.seed,
            shuffle=True,
            stratify=temp_keys,
        )
    except ValueError:
        LOGGER.warning("Falling back to non-stratified val/test split due to small class counts")
        val_idx, test_idx = train_test_split(
            temp_idx,
            train_size=val_share_of_temp,
            random_state=cfg.seed,
            shuffle=True,
            stratify=None,
        )

    return (
        [recordings[idx] for idx in train_idx],
        [recordings[idx] for idx in val_idx],
        [recordings[idx] for idx in test_idx],
    )


def create_split_recordings(
    json_recordings: list[Recording],
    sisfall_recordings: list[Recording],
    cfg: Config,
) -> tuple[list[Recording], list[Recording], list[Recording]]:
    json_keys = [recording.event_type for recording in json_recordings]
    sisfall_keys = [recording.activity_code for recording in sisfall_recordings]

    train_json, val_json, test_json = split_by_ratio(json_recordings, cfg, json_keys)
    train_sisfall, val_sisfall, test_sisfall = split_by_ratio(sisfall_recordings, cfg, sisfall_keys)

    train_recordings = train_json + train_sisfall
    val_recordings = val_json + val_sisfall
    test_recordings = test_json + test_sisfall

    rng = random.Random(cfg.seed)
    rng.shuffle(train_recordings)
    rng.shuffle(val_recordings)
    rng.shuffle(test_recordings)
    return train_recordings, val_recordings, test_recordings


def fit_normalizer(recordings: list[Recording]) -> tuple[np.ndarray, np.ndarray]:
    stacked = np.concatenate([recording.features for recording in recordings], axis=0)
    mean = stacked.mean(axis=0, dtype=np.float64).astype(np.float32)
    std = stacked.std(axis=0, dtype=np.float64).astype(np.float32)
    std = np.where(std < 1e-6, 1.0, std).astype(np.float32)
    return mean, std


def recordings_to_windows(recordings: list[Recording], cfg: Config, mean: np.ndarray, std: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    windows: list[np.ndarray] = []
    labels: list[int] = []
    for recording in recordings:
        normalized = (recording.features - mean) / std
        limit = len(normalized) - cfg.window_size
        for start in range(0, limit + 1, cfg.stride):
            end = start + cfg.window_size
            windows.append(normalized[start:end])
            labels.append(recording.label)
    if not windows:
        raise ValueError("No windows were created from the selected recordings.")
    return np.stack(windows).astype(np.float32), np.asarray(labels, dtype=np.float32)


def describe_windows(name: str, labels: np.ndarray) -> None:
    labels_i = labels.astype(np.int64)
    positives = int((labels_i == 1).sum())
    negatives = int((labels_i == 0).sum())
    LOGGER.info("%s windows: %d | normal=%d false_event=%d", name, len(labels_i), negatives, positives)


def balance_windows(windows: np.ndarray, labels: np.ndarray, seed: int) -> tuple[np.ndarray, np.ndarray]:
    label_int = labels.astype(np.int64)
    class_zero = np.flatnonzero(label_int == 0)
    class_one = np.flatnonzero(label_int == 1)
    if len(class_zero) == 0 or len(class_one) == 0:
        raise ValueError("Both classes must be present for balancing.")
    target = min(len(class_zero), len(class_one))
    rng = np.random.default_rng(seed)
    selected_zero = rng.choice(class_zero, size=target, replace=False)
    selected_one = rng.choice(class_one, size=target, replace=False)
    selected = np.concatenate([selected_zero, selected_one])
    rng.shuffle(selected)
    return windows[selected], labels[selected]


def pos_weight_from_labels(labels: np.ndarray, device: torch.device) -> torch.Tensor:
    positives = float(labels.sum())
    negatives = float(len(labels) - positives)
    value = negatives / max(positives, 1.0)
    LOGGER.info("BCE positive class weight: %.4f", value)
    return torch.tensor(value, dtype=torch.float32, device=device)


def binary_metrics(probabilities: np.ndarray, labels: np.ndarray, threshold: float) -> dict[str, float]:
    predictions = (probabilities >= threshold).astype(np.int64)
    truth = labels.astype(np.int64)
    return {
        "accuracy": float(accuracy_score(truth, predictions)),
        "precision": float(precision_score(truth, predictions, zero_division=0)),
        "recall": float(recall_score(truth, predictions, zero_division=0)),
        "f1": float(f1_score(truth, predictions, zero_division=0)),
    }


def tune_threshold(probabilities: np.ndarray, labels: np.ndarray, min_recall: float) -> tuple[float, dict[str, float], tuple[float, ...]]:
    best_threshold = 0.50
    best_metrics = binary_metrics(probabilities, labels, best_threshold)
    best_score = (
        1.0 if best_metrics["recall"] >= min_recall else 0.0,
        best_metrics["precision"],
        best_metrics["f1"],
        best_metrics["recall"],
        best_metrics["accuracy"],
    )
    for threshold in np.arange(0.05, 0.951, 0.01):
        metrics = binary_metrics(probabilities, labels, float(threshold))
        score = (
            1.0 if metrics["recall"] >= min_recall else 0.0,
            metrics["precision"],
            metrics["f1"],
            metrics["recall"],
            metrics["accuracy"],
        )
        if score > best_score:
            best_threshold = float(threshold)
            best_metrics = metrics
            best_score = score
    return round(best_threshold, 4), best_metrics, best_score


def collect_outputs(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> tuple[float, np.ndarray, np.ndarray]:
    model.eval()
    losses: list[float] = []
    probabilities: list[np.ndarray] = []
    labels: list[np.ndarray] = []
    with torch.no_grad():
        for batch_x, batch_y in loader:
            batch_x = batch_x.to(device, non_blocking=True)
            batch_y = batch_y.to(device, non_blocking=True)
            logits = model(batch_x)
            loss = criterion(logits, batch_y)
            losses.append(float(loss.item()))
            probabilities.append(torch.sigmoid(logits).cpu().numpy())
            labels.append(batch_y.cpu().numpy())
    return float(np.mean(losses)), np.concatenate(probabilities), np.concatenate(labels)


class Trainer:
    def __init__(self, model: nn.Module, cfg: Config, pos_weight: torch.Tensor) -> None:
        self.model = model.to(cfg.device)
        self.cfg = cfg
        self.device = cfg.device
        self.criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
        self.optimizer = Adam(self.model.parameters(), lr=cfg.learning_rate, weight_decay=cfg.weight_decay)
        self.scheduler = ReduceLROnPlateau(self.optimizer, mode="max", factor=0.5, patience=3)
        self.best_state: dict[str, Any] | None = None
        self.best_epoch = 0
        self.best_threshold = 0.50
        self.best_score: tuple[float, ...] | None = None
        self.no_improve_epochs = 0
        self.history: dict[str, list[float]] = {
            "train_loss": [],
            "val_loss": [],
            "val_accuracy": [],
            "val_precision": [],
            "val_recall": [],
            "val_f1": [],
            "val_threshold": [],
            "learning_rate": [],
        }

    def train_epoch(self, loader: DataLoader) -> float:
        self.model.train()
        losses: list[float] = []
        for batch_x, batch_y in tqdm(loader, desc="Train", leave=False):
            batch_x = batch_x.to(self.device, non_blocking=True)
            batch_y = batch_y.to(self.device, non_blocking=True)
            self.optimizer.zero_grad(set_to_none=True)
            logits = self.model(batch_x)
            loss = self.criterion(logits, batch_y)
            loss.backward()
            self.optimizer.step()
            losses.append(float(loss.item()))
        return float(np.mean(losses))

    def fit(self, train_loader: DataLoader, val_loader: DataLoader) -> dict[str, list[float]]:
        for epoch in range(1, self.cfg.epochs + 1):
            LOGGER.info("Epoch %d/%d", epoch, self.cfg.epochs)
            train_loss = self.train_epoch(train_loader)
            val_loss, val_probs, val_labels = collect_outputs(self.model, val_loader, self.criterion, self.device)
            threshold, val_metrics, score = tune_threshold(val_probs, val_labels, self.cfg.min_recall)
            lr = float(self.optimizer.param_groups[0]["lr"])

            self.history["train_loss"].append(train_loss)
            self.history["val_loss"].append(val_loss)
            self.history["val_accuracy"].append(val_metrics["accuracy"])
            self.history["val_precision"].append(val_metrics["precision"])
            self.history["val_recall"].append(val_metrics["recall"])
            self.history["val_f1"].append(val_metrics["f1"])
            self.history["val_threshold"].append(threshold)
            self.history["learning_rate"].append(lr)

            LOGGER.info(
                "train_loss=%.4f | val_loss=%.4f val_precision=%.4f val_recall=%.4f val_f1=%.4f val_acc=%.4f threshold=%.2f",
                train_loss,
                val_loss,
                val_metrics["precision"],
                val_metrics["recall"],
                val_metrics["f1"],
                val_metrics["accuracy"],
                threshold,
            )

            self.scheduler.step(val_metrics["precision"])

            if self.best_score is None or score > self.best_score:
                self.best_score = score
                self.best_state = copy.deepcopy(self.model.state_dict())
                self.best_threshold = threshold
                self.best_epoch = epoch
                self.no_improve_epochs = 0
            else:
                self.no_improve_epochs += 1

            if self.no_improve_epochs >= self.cfg.patience:
                LOGGER.info("Early stopping triggered")
                break

        if self.best_state is not None:
            self.model.load_state_dict(self.best_state)
        return self.history


def evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    threshold: float,
) -> dict[str, Any]:
    loss, probabilities, labels = collect_outputs(model, loader, criterion, device)
    metrics = binary_metrics(probabilities, labels, threshold)
    predictions = (probabilities >= threshold).astype(np.int64)
    truth = labels.astype(np.int64)
    matrix = confusion_matrix(truth, predictions)
    fpr, tpr, _ = roc_curve(truth, probabilities)
    return {
        "loss": loss,
        "threshold": threshold,
        "accuracy": metrics["accuracy"],
        "precision": metrics["precision"],
        "recall": metrics["recall"],
        "f1": metrics["f1"],
        "roc_auc": float(auc(fpr, tpr)),
        "confusion_matrix": matrix.tolist(),
        "classification_report": classification_report(
            truth,
            predictions,
            target_names=["normal_adl", "false_event"],
            zero_division=0,
            output_dict=True,
        ),
        "fpr": fpr.tolist(),
        "tpr": tpr.tolist(),
    }


def plot_confusion_matrix(matrix: list[list[int]], path: Path) -> None:
    values = np.asarray(matrix)
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(values, cmap="Blues")
    ax.set_xticks([0, 1], labels=["normal_adl", "false_event"])
    ax.set_yticks([0, 1], labels=["normal_adl", "false_event"])
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("False Alarm Filter Confusion Matrix")
    for row in range(values.shape[0]):
        for col in range(values.shape[1]):
            ax.text(col, row, str(values[row, col]), ha="center", va="center", color="black")
    fig.colorbar(im, ax=ax)
    fig.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_roc_curve(fpr: list[float], tpr: list[float], roc_auc: float, path: Path) -> None:
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot(fpr, tpr, label=f"AUC={roc_auc:.4f}")
    ax.plot([0, 1], [0, 1], linestyle="--", color="gray")
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("False Alarm Filter ROC Curve")
    ax.grid(True)
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_training_history(history: dict[str, list[float]], path: Path) -> None:
    epochs = range(1, len(history["train_loss"]) + 1)
    fig, axes = plt.subplots(2, 2, figsize=(13, 10))
    axes[0, 0].plot(epochs, history["train_loss"], label="train_loss")
    axes[0, 0].plot(epochs, history["val_loss"], label="val_loss")
    axes[0, 0].set_title("Loss")
    axes[0, 0].grid(True)
    axes[0, 0].legend()

    axes[0, 1].plot(epochs, history["val_precision"], label="precision")
    axes[0, 1].plot(epochs, history["val_recall"], label="recall")
    axes[0, 1].plot(epochs, history["val_f1"], label="f1")
    axes[0, 1].axhline(0.90, linestyle="--", color="green")
    axes[0, 1].axhline(0.85, linestyle="--", color="orange")
    axes[0, 1].set_title("Validation Metrics")
    axes[0, 1].grid(True)
    axes[0, 1].legend()

    axes[1, 0].plot(epochs, history["val_accuracy"], label="accuracy")
    axes[1, 0].plot(epochs, history["val_threshold"], label="threshold")
    axes[1, 0].set_title("Validation Accuracy / Threshold")
    axes[1, 0].grid(True)
    axes[1, 0].legend()

    axes[1, 1].plot(epochs, history["learning_rate"], label="lr")
    axes[1, 1].set_yscale("log")
    axes[1, 1].set_title("Learning Rate")
    axes[1, 1].grid(True)
    axes[1, 1].legend()

    fig.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def save_checkpoint(
    path: Path,
    model: nn.Module,
    trainer: Trainer,
    cfg: Config,
    mean: np.ndarray,
    std: np.ndarray,
    split_summary: dict[str, Any],
) -> None:
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "threshold": trainer.best_threshold,
            "best_epoch": trainer.best_epoch,
            "feature_columns": FEATURES,
            "normalizer": {"mean": mean.tolist(), "std": std.tolist()},
            "split_summary": split_summary,
            "config": {
                "batch_size": cfg.batch_size,
                "epochs": cfg.epochs,
                "learning_rate": cfg.learning_rate,
                "weight_decay": cfg.weight_decay,
                "window_size": cfg.window_size,
                "stride": cfg.stride,
                "target_hz": cfg.target_hz,
                "overlap": cfg.overlap,
                "conv1_filters": cfg.conv1_filters,
                "conv2_filters": cfg.conv2_filters,
                "conv3_filters": cfg.conv3_filters,
                "lstm_hidden": cfg.lstm_hidden,
                "fc_hidden": cfg.fc_hidden,
                "dropout": cfg.dropout,
                "min_recall": cfg.min_recall,
                "balance_strategy": cfg.balance_strategy,
            },
            "history": trainer.history,
        },
        path,
    )


def parse_args() -> Config:
    parser = argparse.ArgumentParser(description="Train the false alarm detection model.")
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).parent / "SisFall_dataset")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "outputs")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-5)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--window-seconds", type=float, default=2.0)
    parser.add_argument("--overlap", type=float, default=0.5)
    parser.add_argument("--target-hz", type=int, default=50)
    parser.add_argument("--min-recall", type=float, default=0.85)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--balance-strategy", choices=["none", "undersample"], default="undersample")
    parser.add_argument("--max-json-sessions", type=int, default=None)
    parser.add_argument("--max-sisfall-recordings", type=int, default=None)
    args = parser.parse_args()

    return Config(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        batch_size=args.batch_size,
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        patience=args.patience,
        window_seconds=args.window_seconds,
        overlap=args.overlap,
        target_hz=args.target_hz,
        min_recall=args.min_recall,
        seed=args.seed,
        balance_strategy=args.balance_strategy,
        max_json_sessions=args.max_json_sessions,
        max_sisfall_recordings=args.max_sisfall_recordings,
    )


def main() -> None:
    cfg = parse_args()
    set_seed(cfg.seed)
    cfg.output_dir.mkdir(parents=True, exist_ok=True)

    LOGGER.info("Device: %s", cfg.device)
    LOGGER.info("Loading false-event JSON recordings...")
    json_recordings = load_json_recordings(cfg)
    LOGGER.info("Loading SisFall Dxx ADL recordings...")
    sisfall_recordings = load_sisfall_recordings(cfg)

    if not json_recordings:
        raise ValueError("No JSON false-event recordings were loaded.")
    if not sisfall_recordings:
        raise ValueError("No SisFall ADL recordings were loaded.")

    describe_recordings("JSON false-event", json_recordings)
    describe_recordings("SisFall ADL", sisfall_recordings)

    train_recordings, val_recordings, test_recordings = create_split_recordings(json_recordings, sisfall_recordings, cfg)
    describe_recordings("Train", train_recordings)
    describe_recordings("Validation", val_recordings)
    describe_recordings("Test", test_recordings)

    mean, std = fit_normalizer(train_recordings)
    train_windows_raw, train_labels_raw = recordings_to_windows(train_recordings, cfg, mean, std)
    val_windows, val_labels = recordings_to_windows(val_recordings, cfg, mean, std)
    test_windows, test_labels = recordings_to_windows(test_recordings, cfg, mean, std)

    describe_windows("Train raw", train_labels_raw)
    describe_windows("Validation", val_labels)
    describe_windows("Test", test_labels)

    if cfg.balance_strategy == "undersample":
        train_windows, train_labels = balance_windows(train_windows_raw, train_labels_raw, cfg.seed)
    else:
        train_windows, train_labels = train_windows_raw, train_labels_raw

    describe_windows("Train final", train_labels)
    pos_weight = pos_weight_from_labels(train_labels, cfg.device)

    train_loader = DataLoader(
        WindowDataset(train_windows, train_labels),
        batch_size=cfg.batch_size,
        shuffle=True,
        num_workers=0,
        pin_memory=cfg.device.type == "cuda",
    )
    val_loader = DataLoader(
        WindowDataset(val_windows, val_labels),
        batch_size=cfg.batch_size,
        shuffle=False,
        num_workers=0,
        pin_memory=cfg.device.type == "cuda",
    )
    test_loader = DataLoader(
        WindowDataset(test_windows, test_labels),
        batch_size=cfg.batch_size,
        shuffle=False,
        num_workers=0,
        pin_memory=cfg.device.type == "cuda",
    )

    model = FalseAlarmFilter(cfg)
    trainer = Trainer(model, cfg, pos_weight)
    history = trainer.fit(train_loader, val_loader)

    test_metrics = evaluate(model, test_loader, trainer.criterion, cfg.device, trainer.best_threshold)
    LOGGER.info(
        "Test metrics | precision=%.4f recall=%.4f f1=%.4f accuracy=%.4f threshold=%.2f",
        test_metrics["precision"],
        test_metrics["recall"],
        test_metrics["f1"],
        test_metrics["accuracy"],
        trainer.best_threshold,
    )

    split_summary = {
        "train_recordings": len(train_recordings),
        "val_recordings": len(val_recordings),
        "test_recordings": len(test_recordings),
        "train_windows_raw": int(len(train_labels_raw)),
        "train_windows_final": int(len(train_labels)),
        "val_windows": int(len(val_labels)),
        "test_windows": int(len(test_labels)),
        "train_false_event_windows_raw": int((train_labels_raw == 1).sum()),
        "train_normal_windows_raw": int((train_labels_raw == 0).sum()),
        "train_false_event_windows_final": int((train_labels == 1).sum()),
        "train_normal_windows_final": int((train_labels == 0).sum()),
        "val_false_event_windows": int((val_labels == 1).sum()),
        "val_normal_windows": int((val_labels == 0).sum()),
        "test_false_event_windows": int((test_labels == 1).sum()),
        "test_normal_windows": int((test_labels == 0).sum()),
    }

    checkpoint_path = cfg.output_dir / "model_false_alarm_filter.pth"
    confusion_path = cfg.output_dir / "confusion_matrix.png"
    roc_path = cfg.output_dir / "roc_curve.png"
    history_path = cfg.output_dir / "false_alarm_training_history.png"
    metrics_path = cfg.output_dir / "false_alarm_metrics.json"

    save_checkpoint(checkpoint_path, model, trainer, cfg, mean, std, split_summary)
    plot_confusion_matrix(test_metrics["confusion_matrix"], confusion_path)
    plot_roc_curve(test_metrics["fpr"], test_metrics["tpr"], test_metrics["roc_auc"], roc_path)
    plot_training_history(history, history_path)

    with metrics_path.open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "split_summary": split_summary,
                "best_epoch": trainer.best_epoch,
                "best_threshold": trainer.best_threshold,
                "history": history,
                "test_metrics": test_metrics,
            },
            handle,
            indent=2,
        )

    LOGGER.info("Saved checkpoint to %s", checkpoint_path)
    LOGGER.info("Saved confusion matrix to %s", confusion_path)
    LOGGER.info("Saved ROC curve to %s", roc_path)
    LOGGER.info("Saved metrics report to %s", metrics_path)


if __name__ == "__main__":
    main()
