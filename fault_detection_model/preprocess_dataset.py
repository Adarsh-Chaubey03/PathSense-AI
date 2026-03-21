#!/usr/bin/env python3
"""
Fall Detection Dataset Preprocessing Pipeline (v3.0 - Domain Aligned)

CRITICAL FIXES:
- Correct sensor selection (ADXL345 + ITG3200 only)
- Domain alignment with robust scaling and clipping
- Global normalization from training set only
- Stratified subject-wise splitting for balanced classes
- Comprehensive visualization and diagnostics
- Domain labels for potential domain adaptation

Author: ML Pipeline
Version: 3.0.0
"""

import os
import re
import json
import logging
import warnings
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy import interpolate
from scipy.stats import iqr
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

warnings.filterwarnings('ignore', category=RuntimeWarning)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


@dataclass
class Config:
    sisfall_dir: str = "SisFall_dataset"
    output_dir: str = "data"
    plots_dir: str = "outputs/plots"

    sisfall_acc_scale: float = 1.0 / 256.0
    sisfall_gyro_scale: float = 1.0 / 14.375
    custom_acc_scale: float = 1.0
    custom_gyro_to_degs: float = 180.0 / 3.14159265359
    custom_gyro_in_radians: bool = True

    acc_clip_min: float = -8.0
    acc_clip_max: float = 8.0
    gyro_clip_min: float = -500.0
    gyro_clip_max: float = 500.0

    sisfall_original_rate: float = 200.0
    target_sample_rate: float = 50.0
    window_duration: float = 2.0
    window_overlap: float = 0.5

    train_ratio: float = 0.70
    val_ratio: float = 0.15
    test_ratio: float = 0.15

    normalization_method: str = 'robust'
    random_seed: int = 42

    raw_features: List[str] = field(default_factory=lambda: [
        'acc_x', 'acc_y', 'acc_z', 'gyro_x', 'gyro_y', 'gyro_z'
    ])
    engineered_features: List[str] = field(default_factory=lambda: [
        'smv', 'gyro_mag', 'jerk_x', 'jerk_y', 'jerk_z', 'jerk_mag'
    ])

    @property
    def all_features(self) -> List[str]:
        return self.raw_features + self.engineered_features

    @property
    def n_features(self) -> int:
        return len(self.all_features)

    @property
    def window_size(self) -> int:
        return int(self.window_duration * self.target_sample_rate)

    @property
    def window_step(self) -> int:
        return int(self.window_size * (1 - self.window_overlap))


config = Config()


def setup_plot_directory(config: Config) -> Path:
    plots_path = Path(config.plots_dir)
    plots_path.mkdir(parents=True, exist_ok=True)
    return plots_path


def plot_distribution_comparison(sisfall_df, custom_df, features, title_prefix, filename, config):
    plots_path = setup_plot_directory(config)
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    axes = axes.flatten()

    for idx, feat in enumerate(features[:6]):
        ax = axes[idx]
        sisfall_data = sisfall_df[feat].dropna().values
        custom_data = custom_df[feat].dropna().values if len(custom_df) > 0 else np.array([])

        ax.hist(sisfall_data, bins=100, alpha=0.6, label='SisFall', color='blue', density=True)
        if len(custom_data) > 0:
            ax.hist(custom_data, bins=100, alpha=0.6, label='Custom', color='orange', density=True)

        ax.set_title(f'{feat}')
        ax.legend()

    plt.suptitle(f'{title_prefix} Distribution Comparison', fontsize=14)
    plt.tight_layout()
    plt.savefig(plots_path / filename, dpi=150, bbox_inches='tight')
    plt.close()
    logger.info(f"  Saved plot: {filename}")


def plot_smv_comparison(sisfall_df, custom_df, config):
    plots_path = setup_plot_directory(config)
    fig, ax = plt.subplots(figsize=(10, 6))

    if 'smv' in sisfall_df.columns:
        ax.hist(sisfall_df['smv'].values, bins=100, alpha=0.6, label='SisFall', density=True)
    if len(custom_df) > 0 and 'smv' in custom_df.columns:
        ax.hist(custom_df['smv'].values, bins=100, alpha=0.6, label='Custom', density=True)

    ax.set_title('SMV Distribution')
    ax.legend()
    plt.savefig(plots_path / 'smv_comparison.png', dpi=150)
    plt.close()
    logger.info("  Saved plot: smv_comparison.png")


def plot_time_series_comparison(sisfall_df, custom_df, config):
    plots_path = setup_plot_directory(config)
    fig, axes = plt.subplots(3, 2, figsize=(16, 12))

    # SisFall fall sample
    fall_files = sisfall_df[sisfall_df['label'] == 1]['file_id'].unique()
    if len(fall_files) > 0:
        sample = sisfall_df[sisfall_df['file_id'] == fall_files[0]].head(300)
        time = np.arange(len(sample)) / config.target_sample_rate

        axes[0, 0].plot(time, sample['acc_x'], label='acc_x')
        axes[0, 0].plot(time, sample['acc_y'], label='acc_y')
        axes[0, 0].plot(time, sample['acc_z'], label='acc_z')
        axes[0, 0].set_title('SisFall Fall - Accelerometer')
        axes[0, 0].legend()

        axes[1, 0].plot(time, sample['gyro_x'], label='gyro_x')
        axes[1, 0].plot(time, sample['gyro_y'], label='gyro_y')
        axes[1, 0].plot(time, sample['gyro_z'], label='gyro_z')
        axes[1, 0].set_title('SisFall Fall - Gyroscope')
        axes[1, 0].legend()

        if 'smv' in sample.columns:
            axes[2, 0].plot(time, sample['smv'], color='red')
            axes[2, 0].set_title('SisFall Fall - SMV')

    # Custom sample
    if len(custom_df) > 0:
        custom_files = custom_df['file_id'].unique()
        sample = custom_df[custom_df['file_id'] == custom_files[0]].head(300)
        time = np.arange(len(sample)) / config.target_sample_rate

        axes[0, 1].plot(time, sample['acc_x'], label='acc_x')
        axes[0, 1].plot(time, sample['acc_y'], label='acc_y')
        axes[0, 1].plot(time, sample['acc_z'], label='acc_z')
        axes[0, 1].set_title('Custom - Accelerometer')
        axes[0, 1].legend()

        axes[1, 1].plot(time, sample['gyro_x'], label='gyro_x')
        axes[1, 1].plot(time, sample['gyro_y'], label='gyro_y')
        axes[1, 1].plot(time, sample['gyro_z'], label='gyro_z')
        axes[1, 1].set_title('Custom - Gyroscope')
        axes[1, 1].legend()

        if 'smv' in sample.columns:
            axes[2, 1].plot(time, sample['smv'], color='red')
            axes[2, 1].set_title('Custom - SMV')

    plt.tight_layout()
    plt.savefig(plots_path / 'time_series_comparison.png', dpi=150)
    plt.close()
    logger.info("  Saved plot: time_series_comparison.png")


def plot_class_distribution(splits, config):
    plots_path = setup_plot_directory(config)
    fig, axes = plt.subplots(1, 3, figsize=(14, 5))

    for idx, (split_name, (X, y)) in enumerate(splits.items()):
        ax = axes[idx]
        n_fall = np.sum(y == 1)
        n_nonfall = np.sum(y == 0)
        total = len(y)

        bars = ax.bar(['Non-Fall', 'Fall'], [n_nonfall, n_fall])
        ax.set_title(f'{split_name.capitalize()}\n(n={total:,}, {100*n_fall/total:.1f}% falls)')

        for bar, count in zip(bars, [n_nonfall, n_fall]):
            ax.annotate(f'{count:,}', xy=(bar.get_x() + bar.get_width()/2, bar.get_height()),
                       ha='center', va='bottom')

    plt.tight_layout()
    plt.savefig(plots_path / 'class_distribution.png', dpi=150)
    plt.close()
    logger.info("  Saved plot: class_distribution.png")


def plot_normalization_effect(X_before, X_after, feature_names, config):
    plots_path = setup_plot_directory(config)
    fig, axes = plt.subplots(2, 6, figsize=(18, 8))

    X_before_flat = X_before.reshape(-1, X_before.shape[-1])
    X_after_flat = X_after.reshape(-1, X_after.shape[-1])

    for idx in range(min(6, len(feature_names))):
        axes[0, idx].hist(X_before_flat[:, idx], bins=50, alpha=0.7)
        axes[0, idx].set_title(f'{feature_names[idx]} (Before)')
        axes[1, idx].hist(X_after_flat[:, idx], bins=50, alpha=0.7, color='green')
        axes[1, idx].set_title(f'{feature_names[idx]} (After)')

    plt.tight_layout()
    plt.savefig(plots_path / 'normalization_effect.png', dpi=150)
    plt.close()
    logger.info("  Saved plot: normalization_effect.png")


def print_distribution_diagnostics(sisfall_df, custom_df, features, title):
    logger.info(f"\n{'='*70}")
    logger.info(f"DISTRIBUTION DIAGNOSTICS: {title}")
    logger.info('='*70)

    for feat in features:
        s_data = sisfall_df[feat].dropna()
        logger.info(f"{feat:10s} SisFall: μ={s_data.mean():8.3f}, σ={s_data.std():8.3f}, "
                   f"range=[{s_data.min():.2f}, {s_data.max():.2f}]")
        if len(custom_df) > 0:
            c_data = custom_df[feat].dropna()
            logger.info(f"{' ':10s} Custom:  μ={c_data.mean():8.3f}, σ={c_data.std():8.3f}, "
                       f"range=[{c_data.min():.2f}, {c_data.max():.2f}]")


def validate_physical_ranges(df, source, config):
    logger.info(f"  Validating physical ranges for {source}...")

    for col in ['acc_x', 'acc_y', 'acc_z']:
        out = ((df[col] < config.acc_clip_min) | (df[col] > config.acc_clip_max)).sum()
        df[col] = df[col].clip(config.acc_clip_min, config.acc_clip_max)
        if out > 0:
            logger.info(f"    {col}: clipped {out} values")

    for col in ['gyro_x', 'gyro_y', 'gyro_z']:
        out = ((df[col] < config.gyro_clip_min) | (df[col] > config.gyro_clip_max)).sum()
        df[col] = df[col].clip(config.gyro_clip_min, config.gyro_clip_max)
        if out > 0:
            logger.info(f"    {col}: clipped {out} values")

    logger.info(f"    ✓ Physical constraints applied")
    return df


def validate_final_dataset(splits, config):
    logger.info("\n" + "="*70)
    logger.info("FINAL DATASET VALIDATION")
    logger.info("="*70)

    for split_name, (X, y) in splits.items():
        assert len(X.shape) == 3
        assert X.shape[1] == config.window_size
        assert X.shape[2] == config.n_features
        assert not np.any(np.isnan(X))
        assert not np.any(np.isinf(X))
        logger.info(f"  {split_name}: ✓ Shape {X.shape}, no NaN/Inf")

    return True


def parse_sisfall_filename(filename):
    match = re.match(r'([DF]\d{2})_([SE][AE]\d{2})_R(\d{2})\.txt', filename)
    if match:
        return match.group(1), match.group(2), match.group(3)
    return None, None, None


def load_sisfall_file(filepath, config):
    try:
        data = pd.read_csv(filepath, sep=r'[;,]', header=None, engine='python', skipinitialspace=True)

        if data.shape[1] >= 9:
            data = data.iloc[:, :9]
        elif data.shape[1] < 6:
            return None

        raw = data.values.astype(np.float64)

        # Handle NaN
        for col in range(raw.shape[1]):
            mask = np.isnan(raw[:, col])
            if np.any(mask) and not np.all(mask):
                valid = np.where(~mask)[0]
                invalid = np.where(mask)[0]
                raw[invalid, col] = np.interp(invalid, valid, raw[valid, col])

        # Select correct sensors (ADXL345 + ITG3200)
        acc = raw[:, 0:3] * config.sisfall_acc_scale
        gyro = raw[:, 3:6] * config.sisfall_gyro_scale

        df = pd.DataFrame({
            'acc_x': acc[:, 0], 'acc_y': acc[:, 1], 'acc_z': acc[:, 2],
            'gyro_x': gyro[:, 0], 'gyro_y': gyro[:, 1], 'gyro_z': gyro[:, 2],
        })
        df['timestamp'] = np.arange(len(df)) / config.sisfall_original_rate
        return df
    except:
        return None


def load_sisfall(config):
    logger.info("="*70)
    logger.info("LOADING SISFALL DATASET")
    logger.info("="*70)
    logger.info("  Using: ADXL345 (acc) + ITG3200 (gyro)")

    sisfall_path = Path(config.sisfall_dir)
    all_data = []

    subject_dirs = sorted([d for d in sisfall_path.iterdir()
                          if d.is_dir() and (d.name.startswith('SA') or d.name.startswith('SE'))])

    total = 0
    processed = 0

    for subject_dir in subject_dirs:
        subject_id = subject_dir.name
        for filepath in subject_dir.glob('*.txt'):
            total += 1
            activity, _, trial = parse_sisfall_filename(filepath.name)
            if activity is None:
                continue

            df = load_sisfall_file(filepath, config)
            if df is not None:
                df['label'] = 1 if activity.startswith('F') else 0
                df['subject_id'] = subject_id
                df['activity_code'] = activity
                df['trial'] = trial
                df['source'] = 'sisfall'
                df['domain'] = 0
                df['file_id'] = filepath.stem
                all_data.append(df)
                processed += 1

    logger.info(f"  Loaded {processed}/{total} files")

    combined_df = pd.concat(all_data, ignore_index=True)
    combined_df = validate_physical_ranges(combined_df, "SisFall", config)

    n_fall = (combined_df['label'] == 1).sum()
    logger.info(f"  Samples: {len(combined_df):,} | Falls: {n_fall:,} ({100*n_fall/len(combined_df):.1f}%)")

    return combined_df


def load_custom_json(config):
    logger.info("\n" + "="*70)
    logger.info("LOADING CUSTOM JSON DATASET")
    logger.info("="*70)

    sisfall_path = Path(config.sisfall_dir)
    json_files = list(sisfall_path.glob('all_datasets_*.json'))

    if not json_files:
        logger.warning("  No JSON files found")
        return pd.DataFrame()

    all_data = []

    for json_file in json_files:
        logger.info(f"  Loading {json_file.name}...")
        try:
            with open(json_file, 'r') as f:
                data = json.load(f)

            df = pd.DataFrame(data)

            df['acc_x'] *= config.custom_acc_scale
            df['acc_y'] *= config.custom_acc_scale
            df['acc_z'] *= config.custom_acc_scale

            if config.custom_gyro_in_radians:
                df['gyro_x'] *= config.custom_gyro_to_degs
                df['gyro_y'] *= config.custom_gyro_to_degs
                df['gyro_z'] *= config.custom_gyro_to_degs

            df['activity_code'] = df['label']
            df['label'] = 0
            df['timestamp'] = (df['timestamp'] - df['timestamp'].min()) / 1000.0
            df['subject_id'] = 'custom'
            df['source'] = 'custom_json'
            df['domain'] = 1
            df['trial'] = json_file.stem.split('_')[-1]
            df['file_id'] = json_file.stem

            all_data.append(df)
            logger.info(f"    ✓ {len(df):,} samples ({df['activity_code'].iloc[0]})")
        except Exception as e:
            logger.error(f"    Error: {e}")

    if not all_data:
        return pd.DataFrame()

    combined_df = pd.concat(all_data, ignore_index=True)
    combined_df = combined_df[['timestamp', 'acc_x', 'acc_y', 'acc_z', 'gyro_x', 'gyro_y', 'gyro_z',
                               'label', 'subject_id', 'activity_code', 'trial', 'source', 'domain', 'file_id']]
    combined_df = validate_physical_ranges(combined_df, "Custom", config)

    logger.info(f"  Total: {len(combined_df):,} samples")
    return combined_df


def resample_data(df, config):
    logger.info(f"\n  Resampling to {config.target_sample_rate} Hz...")

    resampled = []
    groups = list(df.groupby('file_id'))

    for idx, (file_id, group) in enumerate(groups):
        if (idx + 1) % 500 == 0:
            logger.info(f"    Progress: {idx+1}/{len(groups)}")

        group = group.sort_values('timestamp').drop_duplicates(subset='timestamp')
        if len(group) < 10:
            continue

        t_start, t_end = group['timestamp'].iloc[0], group['timestamp'].iloc[-1]
        duration = t_end - t_start
        if duration < 0.1:
            continue

        n_samples = int(duration * config.target_sample_rate) + 1
        new_t = np.linspace(t_start, t_end, n_samples)

        resampled_group = pd.DataFrame({'timestamp': new_t})

        for col in config.raw_features:
            valid = ~group[col].isna()
            if valid.sum() < 2:
                continue
            f = interpolate.interp1d(group.loc[valid, 'timestamp'].values,
                                     group.loc[valid, col].values,
                                     kind='linear', fill_value='extrapolate', bounds_error=False)
            resampled_group[col] = f(new_t)

        for col in ['label', 'subject_id', 'activity_code', 'trial', 'source', 'domain', 'file_id']:
            resampled_group[col] = group[col].iloc[0]

        resampled.append(resampled_group)

    result = pd.concat(resampled, ignore_index=True)
    logger.info(f"    Resampled: {len(df):,} → {len(result):,}")
    return result


def clean_data(df, config):
    logger.info("\n  Cleaning data...")
    df = df.dropna(subset=config.raw_features)

    for col in config.raw_features:
        df = df[~np.isinf(df[col])]

    for col in ['acc_x', 'acc_y', 'acc_z']:
        df[col] = df[col].clip(config.acc_clip_min, config.acc_clip_max)
    for col in ['gyro_x', 'gyro_y', 'gyro_z']:
        df[col] = df[col].clip(config.gyro_clip_min, config.gyro_clip_max)

    logger.info(f"    Final: {len(df):,} samples")
    return df.reset_index(drop=True)


def compute_features(df, config):
    logger.info("\n  Computing features...")

    df['smv'] = np.sqrt(df['acc_x']**2 + df['acc_y']**2 + df['acc_z']**2)
    df['gyro_mag'] = np.sqrt(df['gyro_x']**2 + df['gyro_y']**2 + df['gyro_z']**2)

    df['jerk_x'] = 0.0
    df['jerk_y'] = 0.0
    df['jerk_z'] = 0.0

    for file_id, group in df.groupby('file_id'):
        idx = group.index
        for a, j in [('acc_x', 'jerk_x'), ('acc_y', 'jerk_y'), ('acc_z', 'jerk_z')]:
            df.loc[idx, j] = np.gradient(group[a].values, 1.0 / config.target_sample_rate)

    df['jerk_mag'] = np.sqrt(df['jerk_x']**2 + df['jerk_y']**2 + df['jerk_z']**2)

    logger.info(f"    Added: {config.engineered_features}")
    return df


def create_windows(df, config):
    logger.info("\n  Creating windows...")

    windows_X, windows_y, windows_subject, windows_domain = [], [], [], []

    for file_id, group in df.groupby('file_id'):
        group = group.reset_index(drop=True)
        n = len(group)
        if n < config.window_size:
            continue

        X_data = group[config.all_features].values
        y_data = group['label'].values
        subject = group['subject_id'].iloc[0]
        domain = group['domain'].iloc[0]

        start = 0
        while start + config.window_size <= n:
            windows_X.append(X_data[start:start + config.window_size])
            windows_y.append(1 if np.any(y_data[start:start + config.window_size] == 1) else 0)
            windows_subject.append(subject)
            windows_domain.append(domain)
            start += config.window_step

    X = np.array(windows_X, dtype=np.float32)
    y = np.array(windows_y, dtype=np.int32)

    logger.info(f"    Windows: {len(X):,} | Falls: {np.sum(y==1):,} ({100*np.mean(y):.1f}%)")
    return X, y, windows_subject, windows_domain


def stratified_subject_split(X, y, subject_ids, domain_labels, config):
    logger.info("\n  Stratified subject-wise split...")

    np.random.seed(config.random_seed)
    subject_ids = np.array(subject_ids)
    domain_labels = np.array(domain_labels)
    unique_subjects = np.unique(subject_ids)

    sisfall_subjects = [s for s in unique_subjects if s != 'custom']
    has_custom = 'custom' in unique_subjects

    # Separate subjects WITH falls from subjects WITHOUT falls
    subjects_with_falls = []
    subjects_without_falls = []

    for subject in sisfall_subjects:
        mask = subject_ids == subject
        if np.any(y[mask] == 1):
            subjects_with_falls.append(subject)
        else:
            subjects_without_falls.append(subject)

    logger.info(f"    Subjects with falls: {len(subjects_with_falls)}")
    logger.info(f"    Subjects without falls: {len(subjects_without_falls)}")

    np.random.shuffle(subjects_with_falls)
    np.random.shuffle(subjects_without_falls)

    # Split subjects WITH falls
    n = len(subjects_with_falls)
    n_train = int(n * config.train_ratio)
    n_val = max(1, int(n * config.val_ratio))

    train_fall = subjects_with_falls[:n_train]
    val_fall = subjects_with_falls[n_train:n_train + n_val]
    test_fall = subjects_with_falls[n_train + n_val:]

    # Split subjects WITHOUT falls
    n = len(subjects_without_falls)
    n_train = int(n * config.train_ratio)
    n_val = int(n * config.val_ratio)

    train_nofall = subjects_without_falls[:n_train]
    val_nofall = subjects_without_falls[n_train:n_train + n_val]
    test_nofall = subjects_without_falls[n_train + n_val:]

    train_subjects = set(train_fall + train_nofall)
    val_subjects = set(val_fall + val_nofall)
    test_subjects = set(test_fall + test_nofall)

    logger.info(f"    Train: {len(train_subjects)} subjects ({len(train_fall)} with falls)")
    logger.info(f"    Val: {len(val_subjects)} subjects ({len(val_fall)} with falls)")
    logger.info(f"    Test: {len(test_subjects)} subjects ({len(test_fall)} with falls)")

    # Custom data
    if has_custom:
        custom_idx = np.where(subject_ids == 'custom')[0]
        np.random.shuffle(custom_idx)
        n = len(custom_idx)
        n_train = int(n * config.train_ratio)
        n_val = int(n * config.val_ratio)
        custom_train = custom_idx[:n_train]
        custom_val = custom_idx[n_train:n_train + n_val]
        custom_test = custom_idx[n_train + n_val:]
        logger.info(f"    Custom: train={len(custom_train)}, val={len(custom_val)}, test={len(custom_test)}")

    # Create masks
    train_mask = np.array([s in train_subjects for s in subject_ids])
    val_mask = np.array([s in val_subjects for s in subject_ids])
    test_mask = np.array([s in test_subjects for s in subject_ids])

    if has_custom:
        train_mask[custom_train] = True
        val_mask[custom_val] = True
        test_mask[custom_test] = True

    return {
        'train': (X[train_mask], y[train_mask], domain_labels[train_mask]),
        'val': (X[val_mask], y[val_mask], domain_labels[val_mask]),
        'test': (X[test_mask], y[test_mask], domain_labels[test_mask])
    }


def normalize_data(splits, config):
    logger.info(f"\n  Applying {config.normalization_method} normalization (TRAIN SET ONLY)...")

    X_train, y_train, d_train = splits['train']
    X_train_before = X_train.copy()

    X_flat = X_train.reshape(-1, X_train.shape[-1])

    if config.normalization_method == 'robust':
        center = np.median(X_flat, axis=0)
        scale = iqr(X_flat, axis=0)
        scale = np.where(scale < 1e-8, 1.0, scale)
    else:
        center = np.mean(X_flat, axis=0)
        scale = np.std(X_flat, axis=0)
        scale = np.where(scale < 1e-8, 1.0, scale)

    normalized = {}
    for name, (X, y, d) in splits.items():
        X_norm = (X - center) / scale
        normalized[name] = (X_norm.astype(np.float32), y, d)
        logger.info(f"    {name}: {X_norm.shape}")

    # Plot effect
    plot_normalization_effect(X_train_before, normalized['train'][0], config.all_features, config)

    return normalized, {'center': center, 'scale': scale, 'method': config.normalization_method}


def save_dataset(splits, stats, config):
    logger.info(f"\n  Saving to {config.output_dir}/...")

    output_path = Path(config.output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    for name, (X, y, d) in splits.items():
        np.save(output_path / f'X_{name}.npy', X)
        np.save(output_path / f'y_{name}.npy', y)
        np.save(output_path / f'domain_{name}.npy', d)
        logger.info(f"    {name}: X={X.shape}, y={y.shape}")

    np.save(output_path / 'norm_center.npy', stats['center'])
    np.save(output_path / 'norm_scale.npy', stats['scale'])

    metadata = {
        'feature_names': config.all_features,
        'window_size': config.window_size,
        'sample_rate': config.target_sample_rate,
        'normalization': config.normalization_method,
        'n_features': config.n_features,
        'labels': {'0': 'non_fall', '1': 'fall'},
        'domain_labels': {'0': 'sisfall', '1': 'custom'}
    }

    with open(output_path / 'metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)

    logger.info("    ✓ Saved metadata.json")


def run_pipeline():
    logger.info("="*70)
    logger.info("FALL DETECTION PREPROCESSING (v3.0 - Domain Aligned)")
    logger.info("="*70)

    setup_plot_directory(config)

    # Load
    logger.info("\n[1/9] Loading datasets...")
    sisfall_df = load_sisfall(config)
    custom_df = load_custom_json(config)

    # Diagnostics
    logger.info("\n[2/9] Distribution diagnostics (RAW)...")
    print_distribution_diagnostics(sisfall_df, custom_df, config.raw_features, "RAW")
    plot_distribution_comparison(sisfall_df, custom_df, config.raw_features, "Raw", "raw_distribution.png", config)

    # Combine and resample
    logger.info("\n[3/9] Combining and resampling...")
    combined = pd.concat([sisfall_df, custom_df], ignore_index=True) if len(custom_df) > 0 else sisfall_df
    resampled = resample_data(combined, config)

    # Clean
    logger.info("\n[4/9] Cleaning...")
    cleaned = clean_data(resampled, config)

    # Features
    logger.info("\n[5/9] Computing features...")
    featured = compute_features(cleaned, config)

    # Processed diagnostics
    sisfall_proc = featured[featured['domain'] == 0]
    custom_proc = featured[featured['domain'] == 1]
    print_distribution_diagnostics(sisfall_proc, custom_proc, config.raw_features, "PROCESSED")
    plot_distribution_comparison(sisfall_proc, custom_proc, config.raw_features, "Processed", "processed_distribution.png", config)
    plot_smv_comparison(sisfall_proc, custom_proc, config)
    plot_time_series_comparison(sisfall_proc, custom_proc, config)

    # Windows
    logger.info("\n[6/9] Creating windows...")
    X, y, subjects, domains = create_windows(featured, config)

    # Split
    logger.info("\n[7/9] Stratified split...")
    splits = stratified_subject_split(X, y, subjects, domains, config)

    # Class distribution plot
    splits_2tuple = {k: (v[0], v[1]) for k, v in splits.items()}
    plot_class_distribution(splits_2tuple, config)

    # Normalize
    logger.info("\n[8/9] Normalizing...")
    normalized, stats = normalize_data(splits, config)

    # Validate and save
    logger.info("\n[9/9] Validating and saving...")
    validate_final_dataset({k: (v[0], v[1]) for k, v in normalized.items()}, config)
    save_dataset(normalized, stats, config)

    # Summary
    logger.info("\n" + "="*70)
    logger.info("COMPLETE!")
    logger.info("="*70)

    for name, (X, y, d) in normalized.items():
        logger.info(f"  {name:5s}: {X.shape[0]:>6,} windows | Falls: {np.sum(y==1):>5,} ({100*np.mean(y):.1f}%) | "
                   f"SisFall: {np.sum(d==0):,}, Custom: {np.sum(d==1):,}")

    logger.info(f"\n  Features: {config.n_features} ({config.all_features})")
    logger.info(f"  Window: {config.window_size} samples ({config.window_duration}s @ {config.target_sample_rate}Hz)")
    logger.info(f"  Output: {config.output_dir}/")
    logger.info(f"  Plots: {config.plots_dir}/")

    return normalized, stats


if __name__ == '__main__':
    run_pipeline()
