# save as fault_detection_model/analyze_thresholds_dual.py
import json, numpy as np, pandas as pd
from pathlib import Path

BASE = Path("custom_dataset")
FILES = {
    "fall_data": BASE / "fall_data.csv",
    "false_data": BASE / "false_data.csv",
}
AXES = ["acc_x","acc_y","acc_z","gyro_x","gyro_y","gyro_z"]

def qstats(s):
    return {
        "min": float(np.nanmin(s)), "max": float(np.nanmax(s)),
        "mean": float(np.nanmean(s)), "std": float(np.nanstd(s)),
        "p50": float(np.nanpercentile(s,50)), "p90": float(np.nanpercentile(s,90)),
        "p95": float(np.nanpercentile(s,95)), "p99": float(np.nanpercentile(s,99)),
    }

def analyze_csv(path):
    cols = pd.read_csv(path, nrows=0).columns.tolist()
    use = [c for c in ["timestamp", *AXES, "label"] if c in cols]
    df = pd.read_csv(path, usecols=use)
    out = {"rows": int(len(df)), "columns": cols, "axes": {}, "derived": {}}

    for c in AXES:
        if c in df.columns:
            out["axes"][c] = qstats(df[c].values)

    if all(c in df.columns for c in ["acc_x","acc_y","acc_z"]):
        acc_mag = np.sqrt(df["acc_x"]**2 + df["acc_y"]**2 + df["acc_z"]**2)
        out["derived"]["acc_mag"] = qstats(acc_mag.values)

    if all(c in df.columns for c in ["gyro_x","gyro_y","gyro_z"]):
        gyro_mag = np.sqrt(df["gyro_x"]**2 + df["gyro_y"]**2 + df["gyro_z"]**2)
        out["derived"]["gyro_mag"] = qstats(gyro_mag.values)

    if "timestamp" in df.columns and len(df) > 2:
        dt = np.diff(df["timestamp"].values.astype(float))
        dt = dt[np.isfinite(dt) & (dt > 0)]
        out["sampling"] = {
            "dt_p50": float(np.percentile(dt,50)),
            "dt_p95": float(np.percentile(dt,95)),
            "hz_estimate_p50": float(1.0/np.percentile(dt,50)),
        }

    if "label" in df.columns:
        vc = df["label"].value_counts(dropna=False).to_dict()
        out["label_counts"] = {str(k): int(v) for k,v in vc.items()}

    return out

res = {name: analyze_csv(path) for name, path in FILES.items()}

f_acc = res["fall_data"]["derived"]["acc_mag"]; n_acc = res["false_data"]["derived"]["acc_mag"]
f_gyro = res["fall_data"]["derived"]["gyro_mag"]; n_gyro = res["false_data"]["derived"]["gyro_mag"]

# conservative buffered thresholds + hysteresis
acc_trigger = max(n_acc["p99"], n_acc["p95"] + 0.20*(f_acc["p95"] - n_acc["p95"]))
gyro_trigger = max(n_gyro["p99"], n_gyro["p95"] + 0.20*(f_gyro["p95"] - n_gyro["p95"]))

res["threshold_candidates"] = {
    "trigger": {
        "acc_mag_g": float(acc_trigger),
        "gyro_mag_dps": float(gyro_trigger),
        "logic": "AND within 80ms coincidence"
    },
    "release": {
        "acc_mag_g": float(max(n_acc["p95"], acc_trigger*0.82)),
        "gyro_mag_dps": float(max(n_gyro["p95"], gyro_trigger*0.82)),
        "logic": "both below for >=250ms"
    },
    "timing": {
        "min_above_trigger_ms": 60,
        "cooldown_ms": 1200
    },
    "window_50hz_samples": {
        "rear_pre": 40, "core": 20, "post": 40, "total": 100
    }
}

print(json.dumps(res, indent=2))