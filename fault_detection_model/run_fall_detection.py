#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn


RAW_FEATURES = ["acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z"]


class FallDetector(nn.Module):
    def __init__(
        self,
        conv1_filters: int = 64,
        conv2_filters: int = 128,
        lstm_hidden: int = 128,
        fc_hidden: int = 64,
        dropout: float = 0.5,
        n_features: int = 6,
    ) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(n_features, conv1_filters, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(conv1_filters)
        self.pool1 = nn.MaxPool1d(2)
        self.conv2 = nn.Conv1d(conv1_filters, conv2_filters, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(conv2_filters)
        self.pool2 = nn.MaxPool1d(2)
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


class FalseAlarmFilter(nn.Module):
    def __init__(
        self,
        conv1_filters: int = 64,
        conv2_filters: int = 128,
        conv3_filters: int = 256,
        lstm_hidden: int = 128,
        fc_hidden: int = 64,
        dropout: float = 0.5,
        n_features: int = 15,
    ) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(n_features, conv1_filters, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(conv1_filters)
        self.pool1 = nn.MaxPool1d(2)

        self.conv2 = nn.Conv1d(conv1_filters, conv2_filters, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(conv2_filters)
        self.pool2 = nn.MaxPool1d(2)

        self.conv3 = nn.Conv1d(conv2_filters, conv3_filters, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm1d(conv3_filters)

        self.lstm = nn.LSTM(input_size=conv3_filters, hidden_size=lstm_hidden, batch_first=True)
        self.fc1 = nn.Linear(lstm_hidden, fc_hidden)
        self.fc2 = nn.Linear(fc_hidden, 1)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)

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


def _checkpoint_state_dict(checkpoint: Any) -> dict[str, Any]:
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        return checkpoint["model_state_dict"]
    if isinstance(checkpoint, dict):
        return checkpoint
    raise ValueError("Unsupported checkpoint format.")


def _infer_input_dim(state_dict: dict[str, Any], fallback: int) -> int:
    conv1_weight = state_dict.get("conv1.weight")
    if conv1_weight is None:
        return fallback
    return int(conv1_weight.shape[1])


def _build_features(window: np.ndarray, feature_dim: int) -> np.ndarray:
    if window.shape != (100, 6):
        raise ValueError(f"Expected input shape (100, 6), got {window.shape}")

    acc = window[:, :3].astype(np.float32)
    gyro = window[:, 3:6].astype(np.float32)

    smv = np.sqrt(np.sum(acc ** 2, axis=1, keepdims=True))
    gyro_mag = np.sqrt(np.sum(gyro ** 2, axis=1, keepdims=True))

    dt = 1.0 / 50.0
    jerk_x = np.gradient(acc[:, 0], dt).reshape(-1, 1)
    jerk_y = np.gradient(acc[:, 1], dt).reshape(-1, 1)
    jerk_z = np.gradient(acc[:, 2], dt).reshape(-1, 1)
    jerk = np.hstack([jerk_x, jerk_y, jerk_z])
    jerk_mag = np.sqrt(np.sum(jerk ** 2, axis=1, keepdims=True))

    base12 = np.hstack([window.astype(np.float32), smv, gyro_mag, jerk_x, jerk_y, jerk_z, jerk_mag])

    if feature_dim == 12:
        return base12.astype(np.float32)

    if feature_dim == 15:
        energy = np.sum(acc ** 2, axis=1, keepdims=True)
        prev_acc = np.vstack([acc[0:1], acc[:-1]])
        denom = np.linalg.norm(acc, axis=1) * np.linalg.norm(prev_acc, axis=1)
        denom = np.clip(denom, 1e-6, None)
        cosine = np.sum(acc * prev_acc, axis=1) / denom
        cosine = np.clip(cosine, -1.0, 1.0)
        delta_angle = np.arccos(cosine).astype(np.float32).reshape(-1, 1)
        delta_angle[0, 0] = 0.0
        peak_acc = np.max(np.abs(acc), axis=1, keepdims=True)
        return np.hstack([base12, energy, delta_angle, peak_acc]).astype(np.float32)

    if feature_dim == 6:
        return window.astype(np.float32)

    raise ValueError(f"Unsupported feature_dim={feature_dim}. Expected one of [6, 12, 15].")


def _normalize(features: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
    if mean.ndim != 1 or std.ndim != 1:
        raise ValueError("Normalization arrays must be 1D.")
    if mean.shape != std.shape:
        raise ValueError("norm_mean.npy and norm_std.npy must have the same shape.")
    if mean.size < features.shape[1]:
        raise ValueError(
            f"Normalization vectors too short: got {mean.size}, need at least {features.shape[1]}"
        )

    mean_slice = mean[: features.shape[1]].astype(np.float32)
    std_slice = std[: features.shape[1]].astype(np.float32)
    std_slice = np.where(std_slice < 1e-6, 1.0, std_slice)
    return (features - mean_slice) / std_slice


def load_models(
    model1_path: str | Path,
    model2_path: str | Path,
    threshold1_default: float = 0.03,
    threshold2_default: float = 0.66,
) -> tuple[nn.Module, nn.Module, float, float, int, int, torch.device]:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    ckpt1 = torch.load(model1_path, map_location=device, weights_only=False)
    state1 = _checkpoint_state_dict(ckpt1)
    cfg1 = ckpt1.get("config", {}) if isinstance(ckpt1, dict) else {}
    model1_input_dim = _infer_input_dim(state1, fallback=6)

    model1 = FallDetector(
        conv1_filters=int(cfg1.get("conv1_filters", 64)),
        conv2_filters=int(cfg1.get("conv2_filters", 128)),
        lstm_hidden=int(cfg1.get("lstm_hidden", 128)),
        fc_hidden=int(cfg1.get("fc_hidden", 64)),
        dropout=float(cfg1.get("dropout", 0.5)),
        n_features=model1_input_dim,
    )
    model1.load_state_dict(state1)
    model1.to(device)
    model1.eval()

    ckpt2 = torch.load(model2_path, map_location=device, weights_only=False)
    state2 = _checkpoint_state_dict(ckpt2)
    cfg2 = ckpt2.get("config", {}) if isinstance(ckpt2, dict) else {}
    model2_input_dim = _infer_input_dim(state2, fallback=15)

    model2 = FalseAlarmFilter(
        conv1_filters=int(cfg2.get("conv1_filters", 64)),
        conv2_filters=int(cfg2.get("conv2_filters", 128)),
        conv3_filters=int(cfg2.get("conv3_filters", 256)),
        lstm_hidden=int(cfg2.get("lstm_hidden", 128)),
        fc_hidden=int(cfg2.get("fc_hidden", 64)),
        dropout=float(cfg2.get("dropout", 0.5)),
        n_features=model2_input_dim,
    )
    model2.load_state_dict(state2)
    model2.to(device)
    model2.eval()

    threshold1 = float(ckpt1.get("threshold", threshold1_default)) if isinstance(ckpt1, dict) else threshold1_default
    threshold2 = float(ckpt2.get("threshold", threshold2_default)) if isinstance(ckpt2, dict) else threshold2_default

    return model1, model2, threshold1, threshold2, model1_input_dim, model2_input_dim, device


def preprocess_window(
    window: np.ndarray,
    norm_mean_path: str | Path,
    norm_std_path: str | Path,
    model1_input_dim: int,
    model2_input_dim: int,
) -> tuple[torch.Tensor, torch.Tensor]:
    mean = np.load(norm_mean_path).astype(np.float32)
    std = np.load(norm_std_path).astype(np.float32)

    model1_features = _build_features(window, model1_input_dim)
    model2_features = _build_features(window, model2_input_dim)

    model1_features = _normalize(model1_features, mean, std)
    model2_features = _normalize(model2_features, mean, std)

    x1 = torch.from_numpy(model1_features).unsqueeze(0)
    x2 = torch.from_numpy(model2_features).unsqueeze(0)
    return x1, x2


def predict(
    window: np.ndarray,
    model1: nn.Module,
    model2: nn.Module,
    norm_mean_path: str | Path,
    norm_std_path: str | Path,
    model1_input_dim: int,
    model2_input_dim: int,
    device: torch.device,
    threshold1: float,
    threshold2: float,
) -> dict[str, Any]:
    x1, x2 = preprocess_window(
        window=window,
        norm_mean_path=norm_mean_path,
        norm_std_path=norm_std_path,
        model1_input_dim=model1_input_dim,
        model2_input_dim=model2_input_dim,
    )

    x1 = x1.to(device)
    x2 = x2.to(device)

    with torch.no_grad():
        logits1 = model1(x1)
        fall_prob = float(torch.sigmoid(logits1).item())

    if fall_prob < threshold1:
        return {
            "fall_probability": fall_prob,
            "false_alarm_probability": None,
            "final_result": "NO FALL",
        }

    with torch.no_grad():
        logits2 = model2(x2)
        false_prob = float(torch.sigmoid(logits2).item())

    if false_prob >= threshold2:
        final_result = "FALSE ALARM (ignored)"
    else:
        final_result = "REAL FALL DETECTED"

    return {
        "fall_probability": fall_prob,
        "false_alarm_probability": false_prob,
        "final_result": final_result,
    }


def generate_random_window(window_size: int = 100) -> np.ndarray:
    acc = np.random.randn(window_size, 3).astype(np.float32) * 0.4
    gyro = np.random.randn(window_size, 3).astype(np.float32) * 25.0
    return np.hstack([acc, gyro]).astype(np.float32)


def load_window_from_csv(csv_path: str | Path, window_size: int = 100) -> np.ndarray:
    rows: list[list[float]] = []
    with Path(csv_path).open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        required = set(RAW_FEATURES)
        if reader.fieldnames is None or not required.issubset(set(reader.fieldnames)):
            raise ValueError("CSV must contain columns: acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z")

        for row in reader:
            rows.append([float(row[c]) for c in RAW_FEATURES])
            if len(rows) >= window_size:
                break

    if len(rows) < window_size:
        raise ValueError(f"CSV contains {len(rows)} rows, but {window_size} are required.")

    return np.asarray(rows, dtype=np.float32)


def main() -> None:
    base_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(description="Two-stage real-time fall detection inference")
    parser.add_argument("--model1", type=Path, default=base_dir / "outputs" / "models" / "model_fall_detector.pth")
    parser.add_argument("--model2", type=Path, default=base_dir / "outputs" / "model_false_alarm_filter_v2.pth")
    parser.add_argument("--norm-mean", type=Path, default=base_dir / "norm_mean.npy")
    parser.add_argument("--norm-std", type=Path, default=base_dir / "norm_std.npy")
    parser.add_argument("--threshold1", type=float, default=None, help="Fall detector threshold (~0.01 to 0.05)")
    parser.add_argument("--threshold2", type=float, default=0.66, help="False alarm threshold")
    parser.add_argument("--csv", type=Path, default=None, help="Path to CSV with 100x6 IMU window")
    parser.add_argument("--random", action="store_true", help="Use random simulated IMU input")
    args = parser.parse_args()

    model1, model2, t1_ckpt, t2_ckpt, dim1, dim2, device = load_models(args.model1, args.model2)

    threshold1 = args.threshold1 if args.threshold1 is not None else t1_ckpt
    threshold2 = args.threshold2 if args.threshold2 is not None else t2_ckpt

    if args.csv is not None:
        window = load_window_from_csv(args.csv)
    else:
        window = generate_random_window()

    output = predict(
        window=window,
        model1=model1,
        model2=model2,
        norm_mean_path=args.norm_mean,
        norm_std_path=args.norm_std,
        model1_input_dim=dim1,
        model2_input_dim=dim2,
        device=device,
        threshold1=float(threshold1),
        threshold2=float(threshold2),
    )

    print(f"Fall Probability: {output['fall_probability']:.4f}")
    if output["false_alarm_probability"] is None:
        print("False Alarm Probability: N/A")
    else:
        print(f"False Alarm Probability: {output['false_alarm_probability']:.4f}")
    print(f"FINAL RESULT: {output['final_result']}")


if __name__ == "__main__":
    main()
