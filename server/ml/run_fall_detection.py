#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn


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
	raise ValueError("Unsupported checkpoint format")


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

	base12 = np.hstack(
		[window.astype(np.float32), smv, gyro_mag, jerk_x, jerk_y, jerk_z, jerk_mag]
	)

	if feature_dim == 6:
		return window.astype(np.float32)

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

	raise ValueError(f"Unsupported feature_dim={feature_dim}")


def _normalize(features: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
	if mean.ndim != 1 or std.ndim != 1:
		raise ValueError("Normalization arrays must be 1D")
	if mean.shape != std.shape:
		raise ValueError("norm_mean.npy and norm_std.npy must have matching shape")
	if mean.size < features.shape[1]:
		raise ValueError(
			f"Normalization vectors are too short. Got {mean.size}, need {features.shape[1]}"
		)

	mean_slice = mean[: features.shape[1]].astype(np.float32)
	std_slice = std[: features.shape[1]].astype(np.float32)
	std_slice = np.where(std_slice < 1e-6, 1.0, std_slice)
	return (features - mean_slice) / std_slice


class InferenceEngine:
	def __init__(
		self,
		model1_path: Path,
		model2_path: Path,
		norm_mean_path: Path,
		norm_std_path: Path,
		threshold1_default: float = 0.03,
		threshold2_default: float = 0.66,
	) -> None:
		self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

		ckpt1 = torch.load(model1_path, map_location=self.device, weights_only=False)
		state1 = _checkpoint_state_dict(ckpt1)
		cfg1 = ckpt1.get("config", {}) if isinstance(ckpt1, dict) else {}
		self.model1_input_dim = _infer_input_dim(state1, fallback=6)

		self.model1 = FallDetector(
			conv1_filters=int(cfg1.get("conv1_filters", 64)),
			conv2_filters=int(cfg1.get("conv2_filters", 128)),
			lstm_hidden=int(cfg1.get("lstm_hidden", 128)),
			fc_hidden=int(cfg1.get("fc_hidden", 64)),
			dropout=float(cfg1.get("dropout", 0.5)),
			n_features=self.model1_input_dim,
		)
		self.model1.load_state_dict(state1)
		self.model1.to(self.device)
		self.model1.eval()

		ckpt2 = torch.load(model2_path, map_location=self.device, weights_only=False)
		state2 = _checkpoint_state_dict(ckpt2)
		cfg2 = ckpt2.get("config", {}) if isinstance(ckpt2, dict) else {}
		self.model2_input_dim = _infer_input_dim(state2, fallback=15)

		self.model2 = FalseAlarmFilter(
			conv1_filters=int(cfg2.get("conv1_filters", 64)),
			conv2_filters=int(cfg2.get("conv2_filters", 128)),
			conv3_filters=int(cfg2.get("conv3_filters", 256)),
			lstm_hidden=int(cfg2.get("lstm_hidden", 128)),
			fc_hidden=int(cfg2.get("fc_hidden", 64)),
			dropout=float(cfg2.get("dropout", 0.5)),
			n_features=self.model2_input_dim,
		)
		self.model2.load_state_dict(state2)
		self.model2.to(self.device)
		self.model2.eval()

		self.threshold1 = (
			float(ckpt1.get("threshold", threshold1_default))
			if isinstance(ckpt1, dict)
			else threshold1_default
		)
		self.threshold2 = (
			float(ckpt2.get("threshold", threshold2_default))
			if isinstance(ckpt2, dict)
			else threshold2_default
		)

		self.norm_mean = np.load(norm_mean_path).astype(np.float32)
		self.norm_std = np.load(norm_std_path).astype(np.float32)

	def _prepare(self, window: np.ndarray) -> tuple[torch.Tensor, torch.Tensor]:
		model1_features = _build_features(window, self.model1_input_dim)
		model2_features = _build_features(window, self.model2_input_dim)

		model1_features = _normalize(model1_features, self.norm_mean, self.norm_std)
		model2_features = _normalize(model2_features, self.norm_mean, self.norm_std)

		x1 = torch.from_numpy(model1_features).unsqueeze(0).to(self.device)
		x2 = torch.from_numpy(model2_features).unsqueeze(0).to(self.device)
		return x1, x2

	def predict(self, window_data: list[list[float]]) -> dict[str, Any]:
		window = np.asarray(window_data, dtype=np.float32)
		if window.shape != (100, 6):
			raise ValueError(f"window must be [100][6], got {window.shape}")

		x1, x2 = self._prepare(window)

		with torch.no_grad():
			fall_prob = float(torch.sigmoid(self.model1(x1)).item())

		if fall_prob < self.threshold1:
			return {
				"fall_prob": round(fall_prob, 6),
				"false_prob": 0.0,
				"result": "NO_FALL",
			}

		with torch.no_grad():
			false_prob = float(torch.sigmoid(self.model2(x2)).item())

		result = "FALSE_ALARM" if false_prob >= self.threshold2 else "REAL_FALL"
		return {
			"fall_prob": round(fall_prob, 6),
			"false_prob": round(false_prob, 6),
			"result": result,
		}


def _print_json(payload: dict[str, Any]) -> None:
	sys.stdout.write(json.dumps(payload) + "\n")
	sys.stdout.flush()


def run_stdio(engine: InferenceEngine) -> None:
	for line in sys.stdin:
		line = line.strip()
		if not line:
			continue

		try:
			request = json.loads(line)
			request_id = request.get("id")
			window_data = request.get("window")
			if not isinstance(window_data, list):
				raise ValueError("window must be an array")

			response = engine.predict(window_data)
			if request_id is not None:
				response["id"] = request_id
			_print_json(response)
		except Exception as exc:  # noqa: BLE001
			error_payload: dict[str, Any] = {"error": str(exc)}
			try:
				request_id = json.loads(line).get("id")
				if request_id is not None:
					error_payload["id"] = request_id
			except Exception:  # noqa: BLE001
				pass
			_print_json(error_payload)


def run_once(engine: InferenceEngine) -> int:
	payload = json.load(sys.stdin)
	window_data = payload.get("window") if isinstance(payload, dict) else None
	if not isinstance(window_data, list):
		_print_json({"error": "window must be an array"})
		return 1

	try:
		response = engine.predict(window_data)
		_print_json(response)
		return 0
	except Exception as exc:  # noqa: BLE001
		_print_json({"error": str(exc)})
		return 1


def main() -> int:
	base_dir = Path(__file__).resolve().parent
	parser = argparse.ArgumentParser(description="Two-stage fall detection worker")
	parser.add_argument("--model1", type=Path, default=base_dir / "model_fall_detector.pth")
	parser.add_argument("--model2", type=Path, default=base_dir / "model_false_alarm_filter_v2.pth")
	parser.add_argument("--norm-mean", type=Path, default=base_dir / "norm_mean.npy")
	parser.add_argument("--norm-std", type=Path, default=base_dir / "norm_std.npy")
	parser.add_argument("--stdio", action="store_true", help="Process newline-delimited JSON requests")
	args = parser.parse_args()

	engine = InferenceEngine(
		model1_path=args.model1,
		model2_path=args.model2,
		norm_mean_path=args.norm_mean,
		norm_std_path=args.norm_std,
	)

	if args.stdio:
		run_stdio(engine)
		return 0

	return run_once(engine)


if __name__ == "__main__":
	raise SystemExit(main())
