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
    roc_auc_score,
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
ENGINEERED_FEATURES = [
    "smv",
    "gyro_mag",
    "jerk_x",
    "jerk_y",
    "jerk_z",
    "jerk_mag",
    "energy",
    "delta_angle",
    "peak_acc",
]
FEATURES = RAW_FEATURES + ENGINEERED_FEATURES
JSON_FALSE_LABELS = {"phone_drop", "phone_placed_on_table", "random_movement"}


@dataclass
class Config:
    data_dir: Path
    output_dir: Path
    batch_size: int = 128
    epochs: int = 30
    learning_rate: float = 1e-3
    weight_decay: float = 1e-4
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
    target_precision: float = 0.90
    min_recall: float = 0.80
    json_gap_seconds: float = 1.0
    seed: int = 42
    loss_name: str = "focal"
    focal_alpha: float = 0.25
    focal_gamma: float = 2.0
    hard_negative_score_threshold: float = 0.50
    model1_checkpoint: Path | None = None
    max_json_sessions: int | None = None
    max_sisfall_recordings: int | None = None
    model_output_name: str = "model_false_alarm_filter_v2.pth"
    metrics_output_name: str = "metrics_report.txt"
    metrics_json_name: str = "false_alarm_v2_metrics.json"
    num_workers: int = 0

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


@dataclass(frozen=True)
class WindowMetadata:
    recording_id: str
    start: int
    end: int
    source: str
    event_type: str
    base_label: int


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


class Model1FallDetector(nn.Module):
    def __init__(self, conv1_filters: int, conv2_filters: int, lstm_hidden: int, fc_hidden: int, dropout: float) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(len(RAW_FEATURES), conv1_filters, kernel_size=3, padding=1)
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

    def forward(self, batch: torch.Tensor) -> torch.Tensor:
        x = batch.transpose(1, 2)
        x = self.pool1(self.relu(self.bn1(self.conv1(x))))
        x = self.pool2(self.relu(self.bn2(self.conv2(x))))
        x = x.transpose(1, 2)
        x, _ = self.lstm(x)
        x = x[:, -1, :]
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        return self.fc2(x).squeeze(-1)


class BinaryFocalLossWithLogits(nn.Module):
    def __init__(self, alpha: float = 0.25, gamma: float = 2.0, pos_weight: torch.Tensor | None = None) -> None:
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.register_buffer("pos_weight", pos_weight if pos_weight is not None else None)

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        targets = targets.float()
        bce = nn.functional.binary_cross_entropy_with_logits(
            logits,
            targets,
            reduction="none",
            pos_weight=self.pos_weight,
        )
        probs = torch.sigmoid(logits)
        pt = torch.where(targets > 0.5, probs, 1.0 - probs)
        alpha_factor = torch.where(
            targets > 0.5,
            torch.full_like(targets, self.alpha),
            torch.full_like(targets, 1.0 - self.alpha),
        )
        focal_weight = alpha_factor * torch.pow(1.0 - pt.clamp(min=1e-6), self.gamma)
        return (focal_weight * bce).mean()


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
    result["energy"] = np.sum(acc ** 2, axis=1)
    acc_norm = np.linalg.norm(acc, axis=1)
    prev_acc = np.vstack([acc[0:1], acc[:-1]])
    prev_norm = np.linalg.norm(prev_acc, axis=1)
    denom = np.clip(acc_norm * prev_norm, a_min=1e-6, a_max=None)
    cosine = np.sum(acc * prev_acc, axis=1) / denom
    cosine = np.clip(cosine, -1.0, 1.0)
    delta_angle = np.arccos(cosine)
    delta_angle[0] = 0.0
    result["delta_angle"] = delta_angle.astype(np.float32)
    result["peak_acc"] = np.max(np.abs(acc), axis=1)
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


def resolve_model1_checkpoint(cfg: Config) -> Path | None:
    if cfg.model1_checkpoint is not None and cfg.model1_checkpoint.exists():
        return cfg.model1_checkpoint
    candidates = [
        cfg.output_dir / "model_fall_detector.pth",
        cfg.output_dir / "models" / "model_fall_detector.pth",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def load_model1_bundle(cfg: Config) -> dict[str, Any] | None:
    checkpoint_path = resolve_model1_checkpoint(cfg)
    if checkpoint_path is None:
        LOGGER.warning("Model 1 checkpoint not found; hard-negative mining will be skipped")
        return None

    checkpoint = torch.load(checkpoint_path, map_location=cfg.device)
    model_cfg = checkpoint["config"]
    model = Model1FallDetector(
        conv1_filters=int(model_cfg["conv1_filters"]),
        conv2_filters=int(model_cfg["conv2_filters"]),
        lstm_hidden=int(model_cfg["lstm_hidden"]),
        fc_hidden=int(model_cfg["fc_hidden"]),
        dropout=float(model_cfg["dropout"]),
    ).to(cfg.device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    threshold = float(checkpoint.get("threshold", 0.5))
    if cfg.hard_negative_score_threshold is not None:
        threshold = max(threshold, float(cfg.hard_negative_score_threshold))

    mean = np.asarray(checkpoint["normalizer"]["mean"], dtype=np.float32)
    std = np.asarray(checkpoint["normalizer"]["std"], dtype=np.float32)
    std = np.where(std < 1e-6, 1.0, std).astype(np.float32)

    LOGGER.info("Loaded Model 1 checkpoint from %s", checkpoint_path)
    LOGGER.info("Hard-negative mining score threshold: %.3f", threshold)

    return {
        "path": checkpoint_path,
        "model": model,
        "device": cfg.device,
        "mean": mean,
        "std": std,
        "threshold": threshold,
        "window_size": int(model_cfg["window_size"]),
        "stride": int(model_cfg["stride"]),
        "target_hz": int(model_cfg["target_hz"]),
    }


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


def recordings_to_windows(
    recordings: list[Recording],
    cfg: Config,
    mean: np.ndarray,
    std: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, list[WindowMetadata]]:
    windows: list[np.ndarray] = []
    labels: list[int] = []
    metadata: list[WindowMetadata] = []
    for recording in recordings:
        normalized = (recording.features - mean) / std
        limit = len(normalized) - cfg.window_size
        for start in range(0, limit + 1, cfg.stride):
            end = start + cfg.window_size
            windows.append(normalized[start:end])
            labels.append(recording.label)
            metadata.append(
                WindowMetadata(
                    recording_id=recording.recording_id,
                    start=start,
                    end=end,
                    source=recording.source,
                    event_type=recording.event_type,
                    base_label=recording.label,
                )
            )
    if not windows:
        raise ValueError("No windows were created from the selected recordings.")
    return np.stack(windows).astype(np.float32), np.asarray(labels, dtype=np.float32), metadata


def describe_windows(name: str, labels: np.ndarray) -> None:
    labels_i = labels.astype(np.int64)
    positives = int((labels_i == 1).sum())
    negatives = int((labels_i == 0).sum())
    LOGGER.info("%s windows: %d | normal=%d false_event=%d", name, len(labels_i), negatives, positives)


def mine_hard_negative_keys(recordings: list[Recording], bundle: dict[str, Any] | None, batch_size: int = 512) -> set[tuple[str, int]]:
    if bundle is None:
        return set()

    if bundle["target_hz"] != 50:
        LOGGER.warning("Model 1 target_hz=%s does not match expected 50 Hz; hard-negative mining skipped", bundle["target_hz"])
        return set()

    model = bundle["model"]
    device = bundle["device"]
    mean = bundle["mean"]
    std = bundle["std"]
    window_size = bundle["window_size"]
    stride = bundle["stride"]
    threshold = bundle["threshold"]

    mined_keys: set[tuple[str, int]] = set()
    batch_windows: list[np.ndarray] = []
    batch_keys: list[tuple[str, int]] = []

    @torch.no_grad()
    def flush() -> None:
        nonlocal batch_windows, batch_keys, mined_keys
        if not batch_windows:
            return
        tensor = torch.as_tensor(np.stack(batch_windows).astype(np.float32), dtype=torch.float32, device=device)
        logits = model(tensor)
        probs = torch.sigmoid(logits).detach().cpu().numpy()
        for key, prob in zip(batch_keys, probs):
            if float(prob) >= threshold:
                mined_keys.add(key)
        batch_windows = []
        batch_keys = []

    for recording in recordings:
        if recording.label != 0:
            continue
        raw_features = recording.features[:, : len(RAW_FEATURES)]
        normalized = (raw_features - mean) / std
        limit = len(normalized) - window_size
        for start in range(0, limit + 1, stride):
            end = start + window_size
            batch_windows.append(normalized[start:end])
            batch_keys.append((recording.recording_id, start))
            if len(batch_windows) >= batch_size:
                flush()
    flush()

    LOGGER.info("Mined %d hard-negative windows from Model 1 false positives", len(mined_keys))
    return mined_keys


def relabel_hard_negatives(labels: np.ndarray, metadata: list[WindowMetadata], hard_negative_keys: set[tuple[str, int]]) -> tuple[np.ndarray, int]:
    updated = labels.astype(np.float32, copy=True)
    relabeled = 0
    for idx, meta in enumerate(metadata):
        if meta.base_label == 0 and (meta.recording_id, meta.start) in hard_negative_keys:
            if updated[idx] != 1.0:
                updated[idx] = 1.0
                relabeled += 1
    return updated, relabeled


def pos_weight_from_labels(labels: np.ndarray, device: torch.device) -> torch.Tensor:
    positives = float(labels.sum())
    negatives = float(len(labels) - positives)
    value = negatives / max(positives, 1.0)
    LOGGER.info("BCE positive class weight: %.4f", value)
    return torch.tensor(value, dtype=torch.float32, device=device)


def build_criterion(cfg: Config, pos_weight: torch.Tensor) -> nn.Module:
    if cfg.loss_name == "focal":
        LOGGER.info("Using Focal Loss | alpha=%.3f gamma=%.3f", cfg.focal_alpha, cfg.focal_gamma)
        return BinaryFocalLossWithLogits(alpha=cfg.focal_alpha, gamma=cfg.focal_gamma, pos_weight=pos_weight)
    LOGGER.info("Using BCEWithLogitsLoss")
    return nn.BCEWithLogitsLoss(pos_weight=pos_weight)


def binary_metrics(probabilities: np.ndarray, labels: np.ndarray, threshold: float) -> dict[str, float]:
    predictions = (probabilities >= threshold).astype(np.int64)
    truth = labels.astype(np.int64)
    roc_auc = roc_auc_score(truth, probabilities) if len(np.unique(truth)) > 1 else 0.0
    return {
        "accuracy": float(accuracy_score(truth, predictions)),
        "precision": float(precision_score(truth, predictions, zero_division=0)),
        "recall": float(recall_score(truth, predictions, zero_division=0)),
        "f1": float(f1_score(truth, predictions, zero_division=0)),
        "roc_auc": float(roc_auc),
    }


def tune_threshold(
    probabilities: np.ndarray,
    labels: np.ndarray,
    target_precision: float,
    min_recall: float,
) -> tuple[float, dict[str, float], tuple[float, ...]]:
    best_threshold = 0.50
    best_metrics = binary_metrics(probabilities, labels, best_threshold)
    best_score = (
        1.0 if best_metrics["precision"] >= target_precision else 0.0,
        1.0 if best_metrics["recall"] >= min_recall else 0.0,
        best_metrics["precision"],
        best_metrics["recall"],
        best_metrics["f1"],
        best_metrics["roc_auc"],
        best_metrics["accuracy"],
    )
    constrained_candidate: tuple[float, dict[str, float]] | None = None
    for threshold in np.arange(0.50, 0.991, 0.01):
        metrics = binary_metrics(probabilities, labels, float(threshold))
        if (
            metrics["precision"] >= target_precision
            and metrics["recall"] >= min_recall
        ):
            if constrained_candidate is None or threshold < constrained_candidate[0]:
                constrained_candidate = (float(threshold), metrics)
        score = (
            1.0 if metrics["precision"] >= target_precision else 0.0,
            1.0 if metrics["recall"] >= min_recall else 0.0,
            metrics["precision"],
            metrics["recall"],
            metrics["f1"],
            metrics["roc_auc"],
            metrics["accuracy"],
        )
        if score > best_score:
            best_threshold = float(threshold)
            best_metrics = metrics
            best_score = score
    if constrained_candidate is not None:
        best_threshold, best_metrics = constrained_candidate
        best_score = (
            1.0,
            1.0,
            best_metrics["precision"],
            best_metrics["recall"],
            best_metrics["f1"],
            best_metrics["roc_auc"],
            best_metrics["accuracy"],
        )
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
        self.criterion = build_criterion(cfg, pos_weight)
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
            "val_roc_auc": [],
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
            threshold, val_metrics, score = tune_threshold(
                val_probs,
                val_labels,
                self.cfg.target_precision,
                self.cfg.min_recall,
            )
            lr = float(self.optimizer.param_groups[0]["lr"])

            self.history["train_loss"].append(train_loss)
            self.history["val_loss"].append(val_loss)
            self.history["val_accuracy"].append(val_metrics["accuracy"])
            self.history["val_precision"].append(val_metrics["precision"])
            self.history["val_recall"].append(val_metrics["recall"])
            self.history["val_f1"].append(val_metrics["f1"])
            self.history["val_roc_auc"].append(val_metrics["roc_auc"])
            self.history["val_threshold"].append(threshold)
            self.history["learning_rate"].append(lr)

            LOGGER.info(
                "train_loss=%.4f | val_loss=%.4f val_precision=%.4f val_recall=%.4f val_f1=%.4f val_auc=%.4f val_acc=%.4f threshold=%.2f",
                train_loss,
                val_loss,
                val_metrics["precision"],
                val_metrics["recall"],
                val_metrics["f1"],
                val_metrics["roc_auc"],
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
    axes[0, 1].plot(epochs, history["val_roc_auc"], label="roc_auc")
    axes[0, 1].axhline(0.90, linestyle="--", color="green")
    axes[0, 1].axhline(0.80, linestyle="--", color="orange")
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
                "target_precision": cfg.target_precision,
                "min_recall": cfg.min_recall,
                "loss_name": cfg.loss_name,
                "focal_alpha": cfg.focal_alpha,
                "focal_gamma": cfg.focal_gamma,
                "hard_negative_score_threshold": cfg.hard_negative_score_threshold,
            },
            "history": trainer.history,
        },
        path,
    )


def write_metrics_report(
    path: Path,
    cfg: Config,
    split_summary: dict[str, Any],
    train_metrics: dict[str, Any],
    val_metrics: dict[str, Any],
    test_metrics: dict[str, Any],
    best_epoch: int,
    best_threshold: float,
) -> None:
    passes = (
        test_metrics["precision"] >= cfg.target_precision
        and test_metrics["recall"] >= cfg.min_recall
        and test_metrics["roc_auc"] >= 0.97
    )
    lines = [
        "False Alarm Filter V2 Metrics Report",
        "=" * 40,
        f"Best epoch: {best_epoch}",
        f"Best threshold: {best_threshold:.3f}",
        f"Loss: {cfg.loss_name}",
        f"Target precision: {cfg.target_precision:.2f}",
        f"Minimum recall: {cfg.min_recall:.2f}",
        f"Acceptance criteria met: {'YES' if passes else 'NO'}",
        "",
        "Split Summary",
        "-" * 20,
    ]
    for key, value in split_summary.items():
        lines.append(f"{key}: {value}")

    def append_metrics(name: str, metrics: dict[str, Any]) -> None:
        lines.extend(
            [
                "",
                name,
                "-" * len(name),
                f"accuracy: {metrics['accuracy']:.4f}",
                f"precision: {metrics['precision']:.4f}",
                f"recall: {metrics['recall']:.4f}",
                f"f1: {metrics['f1']:.4f}",
                f"roc_auc: {metrics['roc_auc']:.4f}",
                f"confusion_matrix: {metrics['confusion_matrix']}",
            ]
        )

    append_metrics("Train", train_metrics)
    append_metrics("Validation", val_metrics)
    append_metrics("Test", test_metrics)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> Config:
    parser = argparse.ArgumentParser(description="Train the false alarm detection model.")
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).parent / "SisFall_dataset")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "outputs")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--window-seconds", type=float, default=2.0)
    parser.add_argument("--overlap", type=float, default=0.5)
    parser.add_argument("--target-hz", type=int, default=50)
    parser.add_argument("--target-precision", type=float, default=0.90)
    parser.add_argument("--min-recall", type=float, default=0.80)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--loss-name", choices=["bce", "focal"], default="focal")
    parser.add_argument("--focal-alpha", type=float, default=0.25)
    parser.add_argument("--focal-gamma", type=float, default=2.0)
    parser.add_argument("--hard-negative-score-threshold", type=float, default=0.50)
    parser.add_argument("--model1-checkpoint", type=Path, default=None)
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
        target_precision=args.target_precision,
        min_recall=args.min_recall,
        seed=args.seed,
        loss_name=args.loss_name,
        focal_alpha=args.focal_alpha,
        focal_gamma=args.focal_gamma,
        hard_negative_score_threshold=args.hard_negative_score_threshold,
        model1_checkpoint=args.model1_checkpoint,
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
    train_windows, train_labels_base, train_metadata = recordings_to_windows(train_recordings, cfg, mean, std)
    val_windows, val_labels, _ = recordings_to_windows(val_recordings, cfg, mean, std)
    test_windows, test_labels, _ = recordings_to_windows(test_recordings, cfg, mean, std)

    model1_bundle = load_model1_bundle(cfg)
    hard_negative_keys = mine_hard_negative_keys(train_recordings, model1_bundle)
    train_labels, hard_negative_count = relabel_hard_negatives(train_labels_base, train_metadata, hard_negative_keys)

    describe_windows("Train base", train_labels_base)
    LOGGER.info("Relabeled %d hard-negative windows as false_event=1", hard_negative_count)
    describe_windows("Train relabeled", train_labels)
    describe_windows("Validation", val_labels)
    describe_windows("Test", test_labels)

    pos_weight = pos_weight_from_labels(train_labels, cfg.device)

    train_loader = DataLoader(
        WindowDataset(train_windows, train_labels),
        batch_size=cfg.batch_size,
        shuffle=True,
        num_workers=cfg.num_workers,
        pin_memory=cfg.device.type == "cuda",
    )
    val_loader = DataLoader(
        WindowDataset(val_windows, val_labels),
        batch_size=cfg.batch_size,
        shuffle=False,
        num_workers=cfg.num_workers,
        pin_memory=cfg.device.type == "cuda",
    )
    test_loader = DataLoader(
        WindowDataset(test_windows, test_labels),
        batch_size=cfg.batch_size,
        shuffle=False,
        num_workers=cfg.num_workers,
        pin_memory=cfg.device.type == "cuda",
    )

    model = FalseAlarmFilter(cfg)
    trainer = Trainer(model, cfg, pos_weight)
    history = trainer.fit(train_loader, val_loader)

    train_metrics = evaluate(model, train_loader, trainer.criterion, cfg.device, trainer.best_threshold)
    val_metrics = evaluate(model, val_loader, trainer.criterion, cfg.device, trainer.best_threshold)
    test_metrics = evaluate(model, test_loader, trainer.criterion, cfg.device, trainer.best_threshold)
    LOGGER.info(
        "Validation metrics | precision=%.4f recall=%.4f f1=%.4f auc=%.4f threshold=%.2f",
        val_metrics["precision"],
        val_metrics["recall"],
        val_metrics["f1"],
        val_metrics["roc_auc"],
        trainer.best_threshold,
    )
    LOGGER.info(
        "Test metrics | precision=%.4f recall=%.4f f1=%.4f auc=%.4f accuracy=%.4f threshold=%.2f",
        test_metrics["precision"],
        test_metrics["recall"],
        test_metrics["f1"],
        test_metrics["roc_auc"],
        test_metrics["accuracy"],
        trainer.best_threshold,
    )

    split_summary = {
        "train_recordings": len(train_recordings),
        "val_recordings": len(val_recordings),
        "test_recordings": len(test_recordings),
        "train_windows": int(len(train_labels)),
        "val_windows": int(len(val_labels)),
        "test_windows": int(len(test_labels)),
        "train_false_event_windows_base": int((train_labels_base == 1).sum()),
        "train_normal_windows_base": int((train_labels_base == 0).sum()),
        "train_false_event_windows_final": int((train_labels == 1).sum()),
        "train_normal_windows_final": int((train_labels == 0).sum()),
        "val_false_event_windows": int((val_labels == 1).sum()),
        "val_normal_windows": int((val_labels == 0).sum()),
        "test_false_event_windows": int((test_labels == 1).sum()),
        "test_normal_windows": int((test_labels == 0).sum()),
        "hard_negative_windows": int(hard_negative_count),
    }

    checkpoint_path = cfg.output_dir / cfg.model_output_name
    confusion_path = cfg.output_dir / "confusion_matrix.png"
    roc_path = cfg.output_dir / "roc_curve.png"
    history_path = cfg.output_dir / "false_alarm_v2_training_history.png"
    metrics_path = cfg.output_dir / cfg.metrics_json_name
    metrics_report_path = cfg.output_dir / cfg.metrics_output_name

    save_checkpoint(checkpoint_path, model, trainer, cfg, mean, std, split_summary)
    plot_confusion_matrix(test_metrics["confusion_matrix"], confusion_path)
    plot_roc_curve(test_metrics["fpr"], test_metrics["tpr"], test_metrics["roc_auc"], roc_path)
    plot_training_history(history, history_path)
    write_metrics_report(
        metrics_report_path,
        cfg,
        split_summary,
        train_metrics,
        val_metrics,
        test_metrics,
        trainer.best_epoch,
        trainer.best_threshold,
    )

    with metrics_path.open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "split_summary": split_summary,
                "best_epoch": trainer.best_epoch,
                "best_threshold": trainer.best_threshold,
                "history": history,
                "train_metrics": train_metrics,
                "val_metrics": val_metrics,
                "test_metrics": test_metrics,
            },
            handle,
            indent=2,
        )

    LOGGER.info("Saved checkpoint to %s", checkpoint_path)
    LOGGER.info("Saved confusion matrix to %s", confusion_path)
    LOGGER.info("Saved ROC curve to %s", roc_path)
    LOGGER.info("Saved metrics report to %s", metrics_report_path)
    LOGGER.info("Saved metrics json to %s", metrics_path)


if __name__ == "__main__":
    main()
