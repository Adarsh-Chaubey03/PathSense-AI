#!/usr/bin/env python3
"""
Fall Detection Dataset Preparation Script

This script extracts and prepares datasets for a two-model fall detection pipeline:
- Model 1: Fall Detector (trained on real fall data from SisFall)
- Model 2: False Alarm Detector (trained on non-fall + custom false events)

Author: ML Engineer
Date: 2026-03-21
"""

import os
import json
import glob
import math
import logging
from pathlib import Path
from typing import List, Tuple, Optional
import numpy as np
import pandas as pd

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# =============================================================================
# CONFIGURATION
# =============================================================================

class Config:
    """Configuration constants for dataset preparation."""

    # Paths
    SISFALL_DIR = Path(__file__).parent / "SisFall_dataset"
    CUSTOM_DATA_DIR = Path(__file__).parent / "custom_dataset"
    OUTPUT_DIR = Path(__file__).parent / "data"

    # SisFall sensor configuration
    # Columns 0-2: ADXL345 accelerometer
    # Columns 3-5: ITG3200 gyroscope
    # Columns 6-8: MMA8451Q accelerometer (IGNORED for mobile consistency)
    ACCEL_COLS = [0, 1, 2]  # ADXL345
    GYRO_COLS = [3, 4, 5]   # ITG3200

    # Sensor conversion factors (from SisFall documentation)
    # ADXL345: ±16g range, 13-bit resolution
    # Scale factor: raw_value / 256 = acceleration in g
    ADXL345_SCALE = 1.0 / 256.0  # converts to g

    # ITG3200: ±2000 deg/s range, 16-bit resolution
    # Sensitivity: 14.375 LSB/(deg/s)
    ITG3200_SCALE = 1.0 / 14.375  # converts to deg/s

    # Sampling rate
    SAMPLING_RATE_HZ = 200

    # Data cleaning thresholds
    ACC_MIN = -3.0  # g
    ACC_MAX = 3.0   # g
    GYRO_MIN = -500.0  # deg/s
    GYRO_MAX = 500.0   # deg/s

    # Labels
    FALL_LABEL = 1
    NON_FALL_LABEL = 0

    # File patterns
    FALL_PATTERN = "F*"  # F01-F15 are fall activities
    NON_FALL_PATTERN = "D*"  # D01-D19 are daily activities (non-fall)

    # Column names for output
    OUTPUT_COLUMNS = [
        'timestamp', 'acc_x', 'acc_y', 'acc_z',
        'gyro_x', 'gyro_y', 'gyro_z', 'label'
    ]


# =============================================================================
# SISFALL DATA LOADING
# =============================================================================

def parse_sisfall_file(filepath: Path) -> Optional[np.ndarray]:
    """
    Parse a single SisFall .txt file.

    Each line format: col0, col1, col2, col3, col4, col5, col6, col7, col8;

    Args:
        filepath: Path to the .txt file

    Returns:
        numpy array of shape (n_samples, 9) or None if parsing fails
    """
    try:
        data = []
        with open(filepath, 'r') as f:
            for line in f:
                # Remove semicolon and whitespace, then split by comma
                line = line.strip().rstrip(';')
                if not line:
                    continue
                values = [int(v.strip()) for v in line.split(',')]
                if len(values) == 9:
                    data.append(values)
                else:
                    logger.warning(f"Skipping line with {len(values)} columns in {filepath}")

        if not data:
            logger.warning(f"No valid data found in {filepath}")
            return None

        return np.array(data, dtype=np.float64)

    except Exception as e:
        logger.error(f"Error parsing {filepath}: {e}")
        return None


def convert_sisfall_units(data: np.ndarray) -> np.ndarray:
    """
    Convert SisFall raw sensor values to physical units.

    CRITICAL: Only use ADXL345 (cols 0-2) and ITG3200 (cols 3-5).
    IGNORE MMA8451Q (cols 6-8) for mobile sensor consistency.

    Args:
        data: Raw sensor data array (n_samples, 9)

    Returns:
        Converted data array (n_samples, 6) with acc (g) and gyro (deg/s)
    """
    # Extract only ADXL345 accelerometer and ITG3200 gyroscope
    acc_raw = data[:, Config.ACCEL_COLS]  # columns 0, 1, 2
    gyro_raw = data[:, Config.GYRO_COLS]  # columns 3, 4, 5

    # Convert to physical units
    acc_g = acc_raw * Config.ADXL345_SCALE       # raw to g
    gyro_dps = gyro_raw * Config.ITG3200_SCALE   # raw to deg/s

    # Combine accelerometer and gyroscope data
    return np.hstack([acc_g, gyro_dps])


def generate_timestamps(n_samples: int, sampling_rate: float = 200.0) -> np.ndarray:
    """
    Generate timestamps based on sampling rate.

    Args:
        n_samples: Number of samples
        sampling_rate: Sampling rate in Hz

    Returns:
        Array of timestamps in seconds
    """
    return np.arange(n_samples) / sampling_rate


def load_sisfall_files(
    activity_pattern: str,
    label: int,
    subject_dirs: Optional[List[str]] = None
) -> pd.DataFrame:
    """
    Load all SisFall files matching the activity pattern.

    Args:
        activity_pattern: Pattern to match (e.g., "F*" for falls, "D*" for daily)
        label: Label to assign (1 for fall, 0 for non-fall)
        subject_dirs: Optional list of subject directories to process.
                     If None, processes all SA* and SE* directories.

    Returns:
        DataFrame with all processed data
    """
    all_data = []
    files_processed = 0
    files_failed = 0

    # Find all subject directories if not specified
    if subject_dirs is None:
        subject_dirs = []
        for pattern in ["SA*", "SE*"]:
            subject_dirs.extend(sorted(Config.SISFALL_DIR.glob(pattern)))
    else:
        subject_dirs = [Config.SISFALL_DIR / d for d in subject_dirs]

    logger.info(f"Processing SisFall data with pattern '{activity_pattern}' from {len(subject_dirs)} subjects")

    for subject_dir in subject_dirs:
        if not subject_dir.is_dir():
            continue

        # Find all files matching the activity pattern
        pattern_path = subject_dir / f"{activity_pattern}_*.txt"
        files = sorted(glob.glob(str(pattern_path)))

        for filepath in files:
            filepath = Path(filepath)
            filename = filepath.stem

            # Parse and convert the file
            raw_data = parse_sisfall_file(filepath)
            if raw_data is None:
                files_failed += 1
                continue

            # Convert units (ONLY using ADXL345 and ITG3200)
            converted_data = convert_sisfall_units(raw_data)
            n_samples = converted_data.shape[0]

            # Generate timestamps
            timestamps = generate_timestamps(n_samples, Config.SAMPLING_RATE_HZ)

            # Create labels array
            labels = np.full(n_samples, label, dtype=np.int32)

            # Combine all data
            file_data = np.column_stack([
                timestamps,
                converted_data,
                labels
            ])

            # Create DataFrame for this file
            df = pd.DataFrame(file_data, columns=Config.OUTPUT_COLUMNS)
            df['source_file'] = filename  # Track source for debugging
            df['subject'] = subject_dir.name

            all_data.append(df)
            files_processed += 1

    logger.info(f"Processed {files_processed} files, {files_failed} failed")

    if not all_data:
        logger.warning(f"No data found for pattern '{activity_pattern}'")
        return pd.DataFrame(columns=Config.OUTPUT_COLUMNS)

    return pd.concat(all_data, ignore_index=True)


# =============================================================================
# CUSTOM DATA LOADING
# =============================================================================

def load_custom_json_file(filepath: Path) -> Optional[pd.DataFrame]:
    """
    Load a single custom JSON file.

    Expected JSON format (list of records):
    [
        {
            "timestamp": 0.005,
            "acc_x": 0.01,
            "acc_y": -0.02,
            "acc_z": 1.0,
            "gyro_x": 0.5,
            "gyro_y": 0.3,
            "gyro_z": -0.1,
            "label": "phone_drop"
        },
        ...
    ]

    Gyroscope values are expected in rad/s and will be converted to deg/s.

    Args:
        filepath: Path to the JSON file

    Returns:
        DataFrame with processed data or None if loading fails
    """
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)

        if not isinstance(data, list):
            # Try loading as line-delimited JSON
            with open(filepath, 'r') as f:
                data = [json.loads(line) for line in f if line.strip()]

        df = pd.DataFrame(data)

        # Check required columns
        required_cols = ['acc_x', 'acc_y', 'acc_z', 'gyro_x', 'gyro_y', 'gyro_z']
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            logger.error(f"Missing columns in {filepath}: {missing}")
            return None

        # Generate timestamps if not present
        if 'timestamp' not in df.columns:
            df['timestamp'] = generate_timestamps(len(df), Config.SAMPLING_RATE_HZ)

        # Convert gyroscope from rad/s to deg/s (custom data format)
        RAD_TO_DEG = 180.0 / math.pi
        df['gyro_x'] = df['gyro_x'] * RAD_TO_DEG
        df['gyro_y'] = df['gyro_y'] * RAD_TO_DEG
        df['gyro_z'] = df['gyro_z'] * RAD_TO_DEG

        # All custom events are FALSE events (non-fall), label = 0
        df['label'] = Config.NON_FALL_LABEL

        # Store original label as metadata
        if 'label' in data[0] if data else False:
            df['event_type'] = [d.get('label', 'unknown') for d in data]
        else:
            df['event_type'] = 'custom'

        df['source_file'] = filepath.stem

        return df

    except Exception as e:
        logger.error(f"Error loading custom JSON {filepath}: {e}")
        return None


def load_custom_dataset() -> pd.DataFrame:
    """
    Load all custom JSON files from the custom dataset directory.

    Returns:
        DataFrame with all custom data
    """
    if not Config.CUSTOM_DATA_DIR.exists():
        logger.warning(f"Custom data directory not found: {Config.CUSTOM_DATA_DIR}")
        logger.info("Creating empty custom_dataset directory for future use")
        Config.CUSTOM_DATA_DIR.mkdir(parents=True, exist_ok=True)
        return pd.DataFrame(columns=Config.OUTPUT_COLUMNS)

    json_files = list(Config.CUSTOM_DATA_DIR.glob("*.json"))

    if not json_files:
        logger.warning(f"No JSON files found in {Config.CUSTOM_DATA_DIR}")
        return pd.DataFrame(columns=Config.OUTPUT_COLUMNS)

    all_data = []

    for filepath in json_files:
        df = load_custom_json_file(filepath)
        if df is not None:
            all_data.append(df)

    if not all_data:
        return pd.DataFrame(columns=Config.OUTPUT_COLUMNS)

    combined = pd.concat(all_data, ignore_index=True)
    logger.info(f"Loaded {len(combined)} samples from {len(all_data)} custom JSON files")

    return combined


# =============================================================================
# DATA CLEANING
# =============================================================================

def remove_nan_values(df: pd.DataFrame) -> pd.DataFrame:
    """
    Remove rows with NaN values.

    Args:
        df: Input DataFrame

    Returns:
        DataFrame with NaN rows removed
    """
    initial_count = len(df)
    df_clean = df.dropna(subset=['acc_x', 'acc_y', 'acc_z', 'gyro_x', 'gyro_y', 'gyro_z'])
    removed = initial_count - len(df_clean)

    if removed > 0:
        logger.info(f"Removed {removed} rows with NaN values ({removed/initial_count*100:.2f}%)")

    return df_clean


def remove_duplicate_timestamps(df: pd.DataFrame) -> pd.DataFrame:
    """
    Remove rows with duplicate timestamps within each source file.

    Args:
        df: Input DataFrame

    Returns:
        DataFrame with duplicate timestamps removed
    """
    initial_count = len(df)

    if 'source_file' in df.columns:
        # Remove duplicates within each source file
        df_clean = df.drop_duplicates(subset=['timestamp', 'source_file'], keep='first')
    else:
        df_clean = df.drop_duplicates(subset=['timestamp'], keep='first')

    removed = initial_count - len(df_clean)

    if removed > 0:
        logger.info(f"Removed {removed} duplicate timestamp rows ({removed/initial_count*100:.2f}%)")

    return df_clean


def clip_extreme_values(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clip extreme sensor values to prevent outliers from affecting training.

    Thresholds:
    - Accelerometer: [-3g, +3g]
    - Gyroscope: [-500, +500] deg/s

    Args:
        df: Input DataFrame

    Returns:
        DataFrame with clipped values
    """
    df = df.copy()

    # Clip accelerometer values
    acc_cols = ['acc_x', 'acc_y', 'acc_z']
    for col in acc_cols:
        clipped_count = ((df[col] < Config.ACC_MIN) | (df[col] > Config.ACC_MAX)).sum()
        if clipped_count > 0:
            logger.info(f"Clipping {clipped_count} values in {col} to [{Config.ACC_MIN}, {Config.ACC_MAX}] g")
        df[col] = df[col].clip(Config.ACC_MIN, Config.ACC_MAX)

    # Clip gyroscope values
    gyro_cols = ['gyro_x', 'gyro_y', 'gyro_z']
    for col in gyro_cols:
        clipped_count = ((df[col] < Config.GYRO_MIN) | (df[col] > Config.GYRO_MAX)).sum()
        if clipped_count > 0:
            logger.info(f"Clipping {clipped_count} values in {col} to [{Config.GYRO_MIN}, {Config.GYRO_MAX}] deg/s")
        df[col] = df[col].clip(Config.GYRO_MIN, Config.GYRO_MAX)

    return df


def clean_data(df: pd.DataFrame, name: str = "dataset") -> pd.DataFrame:
    """
    Apply full data cleaning pipeline.

    Args:
        df: Input DataFrame
        name: Name for logging

    Returns:
        Cleaned DataFrame
    """
    logger.info(f"Cleaning {name} ({len(df)} samples)")

    df = remove_nan_values(df)
    df = remove_duplicate_timestamps(df)
    df = clip_extreme_values(df)

    logger.info(f"Cleaned {name}: {len(df)} samples remaining")

    return df


# =============================================================================
# VALIDATION
# =============================================================================

def compute_statistics(df: pd.DataFrame, name: str) -> dict:
    """
    Compute and display statistics for a dataset.

    Args:
        df: Input DataFrame
        name: Dataset name for display

    Returns:
        Dictionary of statistics
    """
    sensor_cols = ['acc_x', 'acc_y', 'acc_z', 'gyro_x', 'gyro_y', 'gyro_z']

    stats = {}

    print(f"\n{'='*60}")
    print(f"Statistics for {name}")
    print(f"{'='*60}")
    print(f"Total samples: {len(df):,}")

    if 'source_file' in df.columns:
        print(f"Unique recordings: {df['source_file'].nunique():,}")

    if 'subject' in df.columns:
        print(f"Unique subjects: {df['subject'].nunique()}")

    print(f"\nFeature Statistics:")
    print(f"{'Column':<12} {'Mean':>12} {'Std':>12} {'Min':>12} {'Max':>12}")
    print("-" * 60)

    for col in sensor_cols:
        mean_val = df[col].mean()
        std_val = df[col].std()
        min_val = df[col].min()
        max_val = df[col].max()

        stats[col] = {
            'mean': mean_val,
            'std': std_val,
            'min': min_val,
            'max': max_val
        }

        print(f"{col:<12} {mean_val:>12.4f} {std_val:>12.4f} {min_val:>12.4f} {max_val:>12.4f}")

    return stats


def validate_dataset(df: pd.DataFrame, name: str) -> bool:
    """
    Validate dataset integrity.

    Checks:
    - No missing values in sensor columns
    - Consistent shape
    - Valid label values

    Args:
        df: Input DataFrame
        name: Dataset name for error messages

    Returns:
        True if validation passes, raises AssertionError otherwise
    """
    sensor_cols = ['acc_x', 'acc_y', 'acc_z', 'gyro_x', 'gyro_y', 'gyro_z']

    print(f"\nValidating {name}...")

    # Check for missing values
    missing = df[sensor_cols].isnull().sum().sum()
    assert missing == 0, f"Found {missing} missing values in {name}"
    print(f"  [OK] No missing values in sensor columns")

    # Check required columns exist
    required_cols = ['timestamp'] + sensor_cols + ['label']
    for col in required_cols:
        assert col in df.columns, f"Missing required column: {col}"
    print(f"  [OK] All required columns present")

    # Check data types
    for col in sensor_cols:
        assert df[col].dtype in [np.float64, np.float32, float], \
            f"Column {col} has invalid dtype: {df[col].dtype}"
    print(f"  [OK] Correct data types")

    # Check for finite values
    inf_count = np.isinf(df[sensor_cols].values).sum()
    assert inf_count == 0, f"Found {inf_count} infinite values in {name}"
    print(f"  [OK] No infinite values")

    # Check label values
    unique_labels = df['label'].unique()
    assert all(l in [0, 1] for l in unique_labels), \
        f"Invalid label values found: {unique_labels}"
    print(f"  [OK] Valid label values: {sorted(unique_labels)}")

    print(f"  [OK] Validation passed for {name}!")

    return True


def validate_feature_consistency(fall_df: pd.DataFrame, false_df: pd.DataFrame) -> bool:
    """
    Ensure both datasets have identical feature formats.

    Args:
        fall_df: Fall dataset
        false_df: False alarm dataset

    Returns:
        True if consistent, raises AssertionError otherwise
    """
    print("\nValidating feature consistency between datasets...")

    sensor_cols = ['acc_x', 'acc_y', 'acc_z', 'gyro_x', 'gyro_y', 'gyro_z']

    # Check column names match
    fall_cols = set(fall_df.columns)
    false_cols = set(false_df.columns)

    # Only compare the output columns
    output_cols = set(Config.OUTPUT_COLUMNS)
    assert output_cols.issubset(fall_cols), f"Fall dataset missing columns: {output_cols - fall_cols}"
    assert output_cols.issubset(false_cols), f"False dataset missing columns: {output_cols - false_cols}"
    print("  [OK] Both datasets have required columns")

    # Check data types match
    for col in sensor_cols:
        fall_dtype = fall_df[col].dtype
        false_dtype = false_df[col].dtype
        assert fall_dtype == false_dtype, \
            f"Data type mismatch for {col}: fall={fall_dtype}, false={false_dtype}"
    print("  [OK] Data types are consistent")

    # Check value ranges are reasonable
    for col in sensor_cols:
        fall_range = (fall_df[col].min(), fall_df[col].max())
        false_range = (false_df[col].min(), false_df[col].max())
        print(f"  {col}: fall=[{fall_range[0]:.2f}, {fall_range[1]:.2f}], "
              f"false=[{false_range[0]:.2f}, {false_range[1]:.2f}]")

    print("  [OK] Feature consistency validated!")

    return True


# =============================================================================
# OUTPUT
# =============================================================================

def save_dataset(df: pd.DataFrame, filename: str) -> Path:
    """
    Save dataset to CSV file.

    Args:
        df: DataFrame to save
        filename: Output filename (without extension)

    Returns:
        Path to saved file
    """
    # Ensure output directory exists
    Config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    output_path = Config.OUTPUT_DIR / f"{filename}.csv"

    # Select only the output columns (drop metadata columns)
    output_df = df[Config.OUTPUT_COLUMNS].copy()

    # Save to CSV
    output_df.to_csv(output_path, index=False, float_format='%.6f')

    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    logger.info(f"Saved {filename}.csv: {len(output_df):,} samples, {file_size_mb:.2f} MB")

    return output_path


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def extract_fall_dataset() -> pd.DataFrame:
    """
    Extract fall dataset for Model 1 (Fall Detector).

    - Load all SisFall files starting with 'F' (F01-F15)
    - Use ONLY ADXL345 + ITG3200 sensors
    - Convert to physical units
    - Label = 1 (fall)

    Returns:
        DataFrame with fall data
    """
    logger.info("=" * 60)
    logger.info("EXTRACTING FALL DATASET (Model 1)")
    logger.info("=" * 60)

    # Load fall data (F01-F15 activities)
    fall_df = load_sisfall_files(
        activity_pattern="F*",
        label=Config.FALL_LABEL
    )

    logger.info(f"Loaded {len(fall_df):,} fall samples from SisFall")

    return fall_df


def extract_false_alarm_dataset() -> pd.DataFrame:
    """
    Extract false alarm dataset for Model 2 (False Alarm Detector).

    Sources:
    A) SisFall: Files starting with 'D' (D01-D19 daily activities)
    B) Custom JSON: phone_drop, phone_placed_on_table, random_movement

    Returns:
        DataFrame with false alarm data
    """
    logger.info("=" * 60)
    logger.info("EXTRACTING FALSE ALARM DATASET (Model 2)")
    logger.info("=" * 60)

    # A) Load SisFall non-fall data (D01-D19 activities)
    logger.info("Loading SisFall non-fall activities (D01-D19)...")
    sisfall_nonfall_df = load_sisfall_files(
        activity_pattern="D*",
        label=Config.NON_FALL_LABEL
    )
    logger.info(f"Loaded {len(sisfall_nonfall_df):,} non-fall samples from SisFall")

    # B) Load custom false events
    logger.info("Loading custom dataset...")
    custom_df = load_custom_dataset()

    if len(custom_df) > 0:
        logger.info(f"Loaded {len(custom_df):,} samples from custom dataset")

        # Ensure custom data has required columns
        for col in Config.OUTPUT_COLUMNS:
            if col not in custom_df.columns:
                if col == 'label':
                    custom_df[col] = Config.NON_FALL_LABEL
                else:
                    custom_df[col] = 0.0

    # Combine all false alarm data
    all_false_data = [sisfall_nonfall_df]

    if len(custom_df) > 0:
        all_false_data.append(custom_df)

    false_df = pd.concat(all_false_data, ignore_index=True)

    logger.info(f"Total false alarm samples: {len(false_df):,}")

    return false_df


def main():
    """Main pipeline execution."""
    print("\n" + "=" * 70)
    print("  FALL DETECTION DATASET PREPARATION PIPELINE")
    print("  Two-Model Architecture: Fall Detector + False Alarm Detector")
    print("=" * 70 + "\n")

    # Check SisFall dataset exists
    if not Config.SISFALL_DIR.exists():
        logger.error(f"SisFall dataset not found at: {Config.SISFALL_DIR}")
        logger.error("Please download and extract the SisFall dataset first.")
        return False

    # =========================================================================
    # TASK 1: Extract Fall Dataset (for Model 1)
    # =========================================================================
    fall_df = extract_fall_dataset()

    if len(fall_df) == 0:
        logger.error("No fall data extracted. Aborting.")
        return False

    # =========================================================================
    # TASK 2 & 3: Extract and Combine False Alarm Dataset (for Model 2)
    # =========================================================================
    false_df = extract_false_alarm_dataset()

    if len(false_df) == 0:
        logger.error("No false alarm data extracted. Aborting.")
        return False

    # =========================================================================
    # TASK 4: Data Cleaning
    # =========================================================================
    logger.info("=" * 60)
    logger.info("DATA CLEANING")
    logger.info("=" * 60)

    fall_df = clean_data(fall_df, "fall_data")
    false_df = clean_data(false_df, "false_data")

    # =========================================================================
    # TASK 5: Validation Checks
    # =========================================================================
    logger.info("=" * 60)
    logger.info("VALIDATION")
    logger.info("=" * 60)

    # Compute and display statistics
    fall_stats = compute_statistics(fall_df, "Fall Dataset")
    false_stats = compute_statistics(false_df, "False Alarm Dataset")

    # Validate individual datasets
    validate_dataset(fall_df, "fall_data")
    validate_dataset(false_df, "false_data")

    # Validate feature consistency between datasets
    validate_feature_consistency(fall_df, false_df)

    # =========================================================================
    # TASK 6: Save Output
    # =========================================================================
    logger.info("=" * 60)
    logger.info("SAVING DATASETS")
    logger.info("=" * 60)

    fall_path = save_dataset(fall_df, "fall_data")
    false_path = save_dataset(false_df, "false_data")

    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("\n" + "=" * 70)
    print("  PIPELINE COMPLETED SUCCESSFULLY")
    print("=" * 70)
    print(f"\nOutput files created in: {Config.OUTPUT_DIR}")
    print(f"  - fall_data.csv:  {len(fall_df):,} samples (label=1)")
    print(f"  - false_data.csv: {len(false_df):,} samples (label=0)")
    print("\nDataset Summary:")
    print(f"  - Features: timestamp, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z, label")
    print(f"  - Accelerometer units: g")
    print(f"  - Gyroscope units: deg/s")
    print(f"  - Sampling rate: {Config.SAMPLING_RATE_HZ} Hz")
    print("\nSensor Configuration:")
    print(f"  - Accelerometer: ADXL345 (columns 0-2) - USED")
    print(f"  - Gyroscope: ITG3200 (columns 3-5) - USED")
    print(f"  - Accelerometer: MMA8451Q (columns 6-8) - IGNORED (mobile consistency)")
    print("\nDatasets are ready for training!")
    print("  - Model 1 (Fall Detector): Use fall_data.csv")
    print("  - Model 2 (False Alarm Detector): Use false_data.csv")

    return True


if __name__ == "__main__":
    import sys

    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        logger.exception(f"Pipeline failed with error: {e}")
        sys.exit(1)
