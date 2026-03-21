# Fault Detection Model Environment

This folder contains the GPU-ready Python environment setup for the FallSense
fault detection model described in [stackAndFlow.md](D:/coderonin/stackAndFlow.md).

## Local Runtime Choice

The stack document recommends Python 3.11, but this machine currently has
Python 3.10.11 installed. PyTorch officially supports Python 3.9-3.12 on
Windows, so this environment uses Python 3.10.11 for now.

## Environment Layout

- `.venv` for the local virtual environment
- `requirements-gpu.txt` for the training and export toolchain
- `verify_gpu.py` to confirm CUDA and cuDNN are visible to PyTorch

## Create Or Reuse The Environment

```powershell
cd fault_detection_model
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
.venv\Scripts\python.exe -m pip install -r requirements-gpu.txt
```

## Activate In PowerShell

```powershell
cd fault_detection_model
.\.venv\Scripts\Activate.ps1
```

## Verify GPU Training Support

```powershell
cd fault_detection_model
.\.venv\Scripts\python.exe verify_gpu.py
```

Notes:

- The CUDA-enabled PyTorch wheel brings the matching cuDNN runtime with it, so
  you do not need a separate manual cuDNN zip install for this project.
- If you later install Python 3.11 locally, recreate `.venv` to match the
  version preferred in the architecture doc.
