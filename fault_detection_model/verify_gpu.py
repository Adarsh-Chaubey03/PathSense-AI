import sys

import torch


def main() -> None:
    print(f"Python: {sys.version.split()[0]}")
    print(f"Torch: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    print(f"CUDA runtime: {torch.version.cuda}")
    print(f"cuDNN available: {torch.backends.cudnn.is_available()}")
    print(f"cuDNN version: {torch.backends.cudnn.version()}")

    if not torch.cuda.is_available():
        print("No CUDA device detected by PyTorch.")
        return

    print(f"GPU count: {torch.cuda.device_count()}")
    for index in range(torch.cuda.device_count()):
        print(f"GPU {index}: {torch.cuda.get_device_name(index)}")

    x = torch.randn((1024, 1024), device="cuda")
    y = torch.randn((1024, 1024), device="cuda")
    z = (x @ y).mean()
    torch.cuda.synchronize()
    print(f"CUDA smoke test mean: {z.item():.6f}")


if __name__ == "__main__":
    main()
