#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import logging
import random
from dataclasses import dataclass
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
LOGGER = logging.getLogger("fall_detector")

FEATURES = ["acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z"]


@dataclass
class Config:
    data_dir: Path
    output_dir: Path
    fall_csv: Path
    false_csv: Path
    batch_size: int = 64
    epochs: int = 40
    learning_rate: float = 1e-3
    weight_decay: float = 1e-5
    patience: int = 8
    raw_hz: int = 200
    target_hz: int = 50
    window_seconds: float = 2.0
    overlap: float = 0.5
    conv1_filters: int = 64
    conv2_filters: int = 128
    lstm_hidden: int = 128
    fc_hidden: int = 64
    dropout: float = 0.5
    seed: int = 42
    target_recall: float = 0.97
    target_accuracy: float = 0.90
    max_sessions_per_class: int | None = None

    @property
    def device(self) -> torch.device:
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")

    @property
    def downsample(self) -> int:
        return self.raw_hz // self.target_hz

    @property
    def window_size(self) -> int:
        return int(self.window_seconds * self.target_hz)

    @property
    def stride(self) -> int:
        return int(self.window_size * (1.0 - self.overlap))

    @property
    def models_dir(self) -> Path:
        return self.output_dir / "models"

    @property
    def plots_dir(self) -> Path:
        return self.output_dir / "plots"

    @property
    def reports_dir(self) -> Path:
        return self.output_dir / "reports"


@dataclass
class Session:
    session_id: str
    label: int
    timestamps: np.ndarray
    features: np.ndarray


class WindowDataset(Dataset):
    def __init__(self, windows: np.ndarray, labels: np.ndarray) -> None:
        self.windows = torch.as_tensor(windows, dtype=torch.float32)
        self.labels = torch.as_tensor(labels, dtype=torch.float32)

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self.windows[idx], self.labels[idx]


class FallDetector(nn.Module):
    def __init__(self, cfg: Config) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(len(FEATURES), cfg.conv1_filters, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(cfg.conv1_filters)
        self.pool1 = nn.MaxPool1d(2)
        self.conv2 = nn.Conv1d(cfg.conv1_filters, cfg.conv2_filters, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(cfg.conv2_filters)
        self.pool2 = nn.MaxPool1d(2)
        self.lstm = nn.LSTM(input_size=cfg.conv2_filters, hidden_size=cfg.lstm_hidden, batch_first=True)
        self.fc1 = nn.Linear(cfg.lstm_hidden, cfg.fc_hidden)
        self.fc2 = nn.Linear(cfg.fc_hidden, 1)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(cfg.dropout)
        self._init_weights()

    def _init_weights(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Conv1d):
                nn.init.kaiming_normal_(module.weight, nonlinearity="relu")
                nn.init.zeros_(module.bias)
            elif isinstance(module, nn.BatchNorm1d):
                nn.init.ones_(module.weight)
                nn.init.zeros_(module.bias)
            elif isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                nn.init.zeros_(module.bias)

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


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


class DataBuilder:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.expected_step = 1.0 / cfg.raw_hz

    def load_sessions(self, csv_path: Path, label: int, prefix: str) -> list[Session]:
        LOGGER.info("Loading %s", csv_path)
        df = pd.read_csv(csv_path, usecols=["timestamp", *FEATURES], dtype=np.float32)
        timestamps = df["timestamp"].to_numpy(copy=True)
        features = df[FEATURES].to_numpy(dtype=np.float32, copy=True)
        del df

        diffs = np.diff(timestamps)
        resets = np.where((diffs <= 0) | (diffs > self.expected_step * 1.5))[0] + 1
        time_chunks = np.split(timestamps, resets)
        feature_chunks = np.split(features, resets)

        sessions: list[Session] = []
        dropped = 0
        for idx, (time_chunk, feature_chunk) in enumerate(zip(time_chunks, feature_chunks), start=1):
            time_chunk = time_chunk[:: self.cfg.downsample]
            feature_chunk = feature_chunk[:: self.cfg.downsample]
            if len(feature_chunk) < self.cfg.window_size:
                dropped += 1
                continue
            sessions.append(Session(f"{prefix}_{idx:05d}", label, time_chunk, feature_chunk))

        LOGGER.info("%s usable sessions: %d | dropped short: %d", prefix, len(sessions), dropped)
        return sessions

    def split_sessions(self, sessions: list[Session]) -> tuple[list[Session], list[Session], list[Session]]:
        labels = np.array([session.label for session in sessions], dtype=np.int64)
        train_sessions, temp_sessions = train_test_split(
            sessions,
            test_size=0.30,
            random_state=self.cfg.seed,
            stratify=labels,
            shuffle=True,
        )
        temp_labels = np.array([session.label for session in temp_sessions], dtype=np.int64)
        val_sessions, test_sessions = train_test_split(
            temp_sessions,
            test_size=0.50,
            random_state=self.cfg.seed,
            stratify=temp_labels,
            shuffle=True,
        )
        return train_sessions, val_sessions, test_sessions

    @staticmethod
    def fit_normalizer(sessions: list[Session]) -> tuple[np.ndarray, np.ndarray]:
        stacked = np.concatenate([session.features for session in sessions], axis=0)
        mean = stacked.mean(axis=0, dtype=np.float64).astype(np.float32)
        std = stacked.std(axis=0, dtype=np.float64).astype(np.float32)
        std = np.where(std < 1e-6, 1.0, std).astype(np.float32)
        return mean, std

    def make_windows(self, sessions: list[Session], mean: np.ndarray, std: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        windows: list[np.ndarray] = []
        labels: list[int] = []
        for session in sessions:
            normalized = (session.features - mean) / std
            last_start = len(normalized) - self.cfg.window_size
            for start in range(0, last_start + 1, self.cfg.stride):
                end = start + self.cfg.window_size
                windows.append(normalized[start:end])
                labels.append(session.label)
        if not windows:
            raise ValueError("No windows were produced from the provided sessions.")
        return np.stack(windows).astype(np.float32), np.asarray(labels, dtype=np.float32)


def maybe_limit_sessions(sessions: list[Session], max_sessions_per_class: int | None) -> list[Session]:
    if max_sessions_per_class is None:
        return sessions
    per_class = {0: 0, 1: 0}
    limited: list[Session] = []
    for session in sessions:
        if per_class[session.label] >= max_sessions_per_class:
            continue
        limited.append(session)
        per_class[session.label] += 1
    LOGGER.warning("Smoke-test session limit applied: %s", per_class)
    return limited


def describe_split(name: str, sessions: list[Session] | None = None, labels: np.ndarray | None = None) -> None:
    if sessions is not None:
        values = np.array([session.label for session in sessions], dtype=np.int64)
        LOGGER.info("%s sessions: %d | non_fall=%d fall=%d", name, len(values), int((values == 0).sum()), int((values == 1).sum()))
    if labels is not None:
        values = labels.astype(np.int64)
        LOGGER.info("%s windows: %d | non_fall=%d fall=%d", name, len(values), int((values == 0).sum()), int((values == 1).sum()))


def pos_weight_from_labels(labels: np.ndarray, device: torch.device) -> torch.Tensor:
    positives = float(labels.sum())
    negatives = float(len(labels) - positives)
    value = negatives / max(positives, 1.0)
    LOGGER.info("Positive class weight: %.4f", value)
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


def tune_threshold(probabilities: np.ndarray, labels: np.ndarray) -> tuple[float, dict[str, float]]:
    best_threshold = 0.50
    best_metrics = binary_metrics(probabilities, labels, best_threshold)
    best_score = (
        best_metrics["recall"],
        best_metrics["f1"],
        best_metrics["precision"],
        best_metrics["accuracy"],
    )
    for threshold in np.arange(0.05, 0.95 + 1e-8, 0.01):
        metrics = binary_metrics(probabilities, labels, float(threshold))
        score = (metrics["recall"], metrics["f1"], metrics["precision"], metrics["accuracy"])
        if score > best_score:
            best_threshold = float(threshold)
            best_metrics = metrics
            best_score = score
    return round(best_threshold, 4), best_metrics


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
            probs = torch.sigmoid(logits)
            losses.append(float(loss.item()))
            probabilities.append(probs.cpu().numpy())
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
        self.best_recall = -1.0
        self.no_improve_epochs = 0
        self.history: dict[str, list[float]] = {
            "train_loss": [],
            "val_loss": [],
            "train_accuracy": [],
            "val_accuracy": [],
            "val_precision": [],
            "val_recall": [],
            "val_f1": [],
            "val_threshold": [],
            "learning_rate": [],
        }

    def train_epoch(self, loader: DataLoader) -> tuple[float, float]:
        self.model.train()
        losses: list[float] = []
        probabilities: list[np.ndarray] = []
        labels: list[np.ndarray] = []
        for batch_x, batch_y in tqdm(loader, desc="Train", leave=False):
            batch_x = batch_x.to(self.device, non_blocking=True)
            batch_y = batch_y.to(self.device, non_blocking=True)
            self.optimizer.zero_grad(set_to_none=True)
            logits = self.model(batch_x)
            loss = self.criterion(logits, batch_y)
            loss.backward()
            self.optimizer.step()
            losses.append(float(loss.item()))
            probabilities.append(torch.sigmoid(logits).detach().cpu().numpy())
            labels.append(batch_y.detach().cpu().numpy())
        metrics = binary_metrics(np.concatenate(probabilities), np.concatenate(labels), 0.50)
        return float(np.mean(losses)), metrics["accuracy"]

    def fit(self, train_loader: DataLoader, val_loader: DataLoader) -> dict[str, list[float]]:
        for epoch in range(1, self.cfg.epochs + 1):
            LOGGER.info("Epoch %d/%d", epoch, self.cfg.epochs)
            train_loss, train_acc = self.train_epoch(train_loader)
            val_loss, val_probs, val_labels = collect_outputs(self.model, val_loader, self.criterion, self.device)
            threshold, val_metrics = tune_threshold(val_probs, val_labels)
            lr = float(self.optimizer.param_groups[0]["lr"])
            self.history["train_loss"].append(train_loss)
            self.history["val_loss"].append(val_loss)
            self.history["train_accuracy"].append(train_acc)
            self.history["val_accuracy"].append(val_metrics["accuracy"])
            self.history["val_precision"].append(val_metrics["precision"])
            self.history["val_recall"].append(val_metrics["recall"])
            self.history["val_f1"].append(val_metrics["f1"])
            self.history["val_threshold"].append(threshold)
            self.history["learning_rate"].append(lr)
            LOGGER.info(
                "train_loss=%.4f train_acc=%.4f | val_loss=%.4f val_acc=%.4f val_precision=%.4f val_recall=%.4f val_f1=%.4f threshold=%.2f",
                train_loss, train_acc, val_loss, val_metrics["accuracy"], val_metrics["precision"], val_metrics["recall"], val_metrics["f1"], threshold
            )
            self.scheduler.step(val_metrics["recall"])
            if val_metrics["recall"] > self.best_recall + 1e-4:
                self.best_recall = val_metrics["recall"]
                self.best_threshold = threshold
                self.best_epoch = epoch
                self.best_state = copy.deepcopy(self.model.state_dict())
                self.no_improve_epochs = 0
            else:
                self.no_improve_epochs += 1
            if self.no_improve_epochs >= self.cfg.patience:
                LOGGER.info("Early stopping triggered")
                break
        if self.best_state is not None:
            self.model.load_state_dict(self.best_state)
        return self.history


def evaluate(model: nn.Module, loader: DataLoader, criterion: nn.Module, device: torch.device, threshold: float) -> dict[str, Any]:
    loss, probabilities, labels = collect_outputs(model, loader, criterion, device)
    metrics = binary_metrics(probabilities, labels, threshold)
    predictions = (probabilities >= threshold).astype(np.int64)
    truth = labels.astype(np.int64)
    cm = confusion_matrix(truth, predictions)
    fpr, tpr, _ = roc_curve(truth, probabilities)
    return {
        "loss": loss,
        "threshold": threshold,
        "accuracy": metrics["accuracy"],
        "precision": metrics["precision"],
        "recall": metrics["recall"],
        "f1": metrics["f1"],
        "roc_auc": float(auc(fpr, tpr)),
        "confusion_matrix": cm.tolist(),
        "classification_report": classification_report(truth, predictions, target_names=["non_fall", "fall"], zero_division=0, output_dict=True),
        "fpr": fpr.tolist(),
        "tpr": tpr.tolist(),
    }


def plot_history(history: dict[str, list[float]], path: Path) -> None:
    epochs = range(1, len(history["train_loss"]) + 1)
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    axes[0, 0].plot(epochs, history["train_loss"], label="train")
    axes[0, 0].plot(epochs, history["val_loss"], label="val")
    axes[0, 0].set_title("Loss")
    axes[0, 0].legend()
    axes[0, 0].grid(True)
    axes[0, 1].plot(epochs, history["train_accuracy"], label="train")
    axes[0, 1].plot(epochs, history["val_accuracy"], label="val")
    axes[0, 1].axhline(0.90, linestyle="--", color="green")
    axes[0, 1].set_title("Accuracy")
    axes[0, 1].legend()
    axes[0, 1].grid(True)
    axes[1, 0].plot(epochs, history["val_precision"], label="precision")
    axes[1, 0].plot(epochs, history["val_recall"], label="recall")
    axes[1, 0].plot(epochs, history["val_f1"], label="f1")
    axes[1, 0].axhline(0.97, linestyle="--", color="red")
    axes[1, 0].set_title("Validation Metrics")
    axes[1, 0].legend()
    axes[1, 0].grid(True)
    axes[1, 1].plot(epochs, history["learning_rate"])
    axes[1, 1].set_yscale("log")
    axes[1, 1].set_title("Learning Rate")
    axes[1, 1].grid(True)
    fig.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_confusion(confusion: list[list[int]], path: Path) -> None:
    fig, ax = plt.subplots(figsize=(6, 5))
    matrix = np.array(confusion)
    im = ax.imshow(matrix, cmap="Blues")
    ax.set_xticks([0, 1], labels=["non_fall", "fall"])
    ax.set_yticks([0, 1], labels=["non_fall", "fall"])
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("Confusion Matrix")
    for i in range(2):
        for j in range(2):
            ax.text(j, i, str(matrix[i, j]), ha="center", va="center", color="black")
    fig.colorbar(im, ax=ax)
    fig.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_roc(fpr: list[float], tpr: list[float], roc_auc: float, path: Path) -> None:
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot(fpr, tpr, label=f"AUC={roc_auc:.4f}")
    ax.plot([0, 1], [0, 1], linestyle="--", color="gray")
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("ROC Curve")
    ax.legend()
    ax.grid(True)
    fig.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def save_checkpoint(path: Path, model: nn.Module, trainer: Trainer, cfg: Config, mean: np.ndarray, std: np.ndarray) -> None:
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "threshold": trainer.best_threshold,
            "best_epoch": trainer.best_epoch,
            "best_val_recall": trainer.best_recall,
            "feature_columns": FEATURES,
            "normalizer": {"mean": mean.tolist(), "std": std.tolist()},
            "config": {
                "window_size": cfg.window_size,
                "stride": cfg.stride,
                "target_hz": cfg.target_hz,
                "conv1_filters": cfg.conv1_filters,
                "conv2_filters": cfg.conv2_filters,
                "lstm_hidden": cfg.lstm_hidden,
                "fc_hidden": cfg.fc_hidden,
                "dropout": cfg.dropout,
            },
            "history": trainer.history,
        },
        path,
    )


def parse_args() -> Config:
    parser = argparse.ArgumentParser(description="Train the Stage 1 fall detector.")
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).parent / "data")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "outputs")
    parser.add_argument("--fall-csv", type=Path, default=None)
    parser.add_argument("--false-csv", type=Path, default=None)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-sessions-per-class", type=int, default=None)
    args = parser.parse_args()
    data_dir = args.data_dir.resolve()
    output_dir = args.output_dir.resolve()
    fall_csv = args.fall_csv.resolve() if args.fall_csv else data_dir / "fall_data.csv"
    false_csv = args.false_csv.resolve() if args.false_csv else data_dir / "false_data.csv"
    return Config(
        data_dir=data_dir,
        output_dir=output_dir,
        fall_csv=fall_csv,
        false_csv=false_csv,
        batch_size=args.batch_size,
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        patience=args.patience,
        seed=args.seed,
        max_sessions_per_class=args.max_sessions_per_class,
    )


def main() -> None:
    cfg = parse_args()
    set_seed(cfg.seed)
    for path in [cfg.fall_csv, cfg.false_csv]:
        if not path.exists():
            raise FileNotFoundError(f"Missing dataset file: {path}")
    cfg.models_dir.mkdir(parents=True, exist_ok=True)
    cfg.plots_dir.mkdir(parents=True, exist_ok=True)
    cfg.reports_dir.mkdir(parents=True, exist_ok=True)
    LOGGER.info("Using device: %s", cfg.device)
    if cfg.device.type == "cuda":
        LOGGER.info("GPU: %s", torch.cuda.get_device_name(0))

    builder = DataBuilder(cfg)
    fall_sessions = builder.load_sessions(cfg.fall_csv, 1, "fall")
    false_sessions = builder.load_sessions(cfg.false_csv, 0, "false")
    sessions = maybe_limit_sessions(fall_sessions + false_sessions, cfg.max_sessions_per_class)
    describe_split("All", sessions=sessions)

    train_sessions, val_sessions, test_sessions = builder.split_sessions(sessions)
    describe_split("Train", sessions=train_sessions)
    describe_split("Validation", sessions=val_sessions)
    describe_split("Test", sessions=test_sessions)

    mean, std = builder.fit_normalizer(train_sessions)
    LOGGER.info("Train mean: %s", np.round(mean, 4).tolist())
    LOGGER.info("Train std: %s", np.round(std, 4).tolist())

    train_windows, train_labels = builder.make_windows(train_sessions, mean, std)
    val_windows, val_labels = builder.make_windows(val_sessions, mean, std)
    test_windows, test_labels = builder.make_windows(test_sessions, mean, std)
    describe_split("Train", labels=train_labels)
    describe_split("Validation", labels=val_labels)
    describe_split("Test", labels=test_labels)

    train_loader = DataLoader(WindowDataset(train_windows, train_labels), batch_size=cfg.batch_size, shuffle=True, num_workers=0, pin_memory=cfg.device.type == "cuda")
    val_loader = DataLoader(WindowDataset(val_windows, val_labels), batch_size=cfg.batch_size, shuffle=False, num_workers=0, pin_memory=cfg.device.type == "cuda")
    test_loader = DataLoader(WindowDataset(test_windows, test_labels), batch_size=cfg.batch_size, shuffle=False, num_workers=0, pin_memory=cfg.device.type == "cuda")

    model = FallDetector(cfg)
    LOGGER.info("Model parameters: %s", f"{sum(p.numel() for p in model.parameters()):,}")
    trainer = Trainer(model, cfg, pos_weight_from_labels(train_labels, cfg.device))
    history = trainer.fit(train_loader, val_loader)
    if trainer.best_state is None:
        raise RuntimeError("Training finished without a best checkpoint.")

    results = evaluate(trainer.model, test_loader, trainer.criterion, cfg.device, trainer.best_threshold)
    save_checkpoint(cfg.models_dir / "model_fall_detector.pth", trainer.model, trainer, cfg, mean, std)
    plot_history(history, cfg.plots_dir / "training_history.png")
    plot_confusion(results["confusion_matrix"], cfg.plots_dir / "confusion_matrix.png")
    plot_roc(results["fpr"], results["tpr"], results["roc_auc"], cfg.plots_dir / "roc_curve.png")

    report = {
        "config": {
            "data_dir": str(cfg.data_dir),
            "output_dir": str(cfg.output_dir),
            "fall_csv": str(cfg.fall_csv),
            "false_csv": str(cfg.false_csv),
            "batch_size": cfg.batch_size,
            "epochs": cfg.epochs,
            "learning_rate": cfg.learning_rate,
            "window_size": cfg.window_size,
            "stride": cfg.stride,
            "target_hz": cfg.target_hz,
        },
        "best_epoch": trainer.best_epoch,
        "best_val_recall": trainer.best_recall,
        "best_threshold": trainer.best_threshold,
        "train_window_count": int(len(train_labels)),
        "val_window_count": int(len(val_labels)),
        "test_window_count": int(len(test_labels)),
        "test_metrics": results,
    }
    (cfg.reports_dir / "fall_detector_test_metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    LOGGER.info(
        "Test accuracy=%.4f precision=%.4f recall=%.4f f1=%.4f threshold=%.2f",
        results["accuracy"], results["precision"], results["recall"], results["f1"], results["threshold"]
    )
    LOGGER.info(
        "Recall target met: %s | Accuracy target met: %s",
        results["recall"] >= cfg.target_recall,
        results["accuracy"] >= cfg.target_accuracy,
    )


if __name__ == "__main__":
    main()
