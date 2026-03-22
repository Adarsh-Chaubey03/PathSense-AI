# PathSense-AI

Privacy-first smartphone fall detection and emergency response for visually impaired users.

## Problem Statement

Visually impaired users are at higher risk after a fall because help may not be immediately available and environmental awareness is limited.

Most fall-response systems depend on wearables, cameras, or cloud-heavy pipelines. That increases friction, cost, and privacy risk.

## Solution Overview

PathSense-AI turns a smartphone into a fall-safety assistant using built-in IMU sensors.

It combines:

- confidence-based fall validation
- voice-assisted confirmation with fallback
- priority-aware SOS handling
- offline-friendly monitoring and confirmation
- privacy-first sensing without camera dependence

The core sensing loop does not depend on public internet APIs. Optional alert delivery can run in demo mode or through a configured SMS provider.

## Key Features

- Real-time accelerometer and gyroscope monitoring on the phone
- On-device edge filtering to reduce false positives before escalation
- Confidence-based validation using buffered sensor windows
- Voice prompt on confirmation screen, with manual response and timeout fallback
- Emergency contact alert flow with location attachment when available
- Priority-aware backend escalation logic based on risk level and user response
- Local state persistence for resilient app flow recovery
- Privacy-first design using motion telemetry instead of continuous audio/video capture

## System Workflow

1. IMU sensors continuously stream accelerometer and gyroscope data.
2. The app keeps a rolling motion window and applies an edge filter on-device.
3. Suspicious motion is passed to the validation layer for confidence-based classification.
4. High-risk events open an "Are you okay?" confirmation step.
5. If the user confirms safety, the event is canceled.
6. If the user asks for help or does not respond, SOS escalation is triggered.
7. Emergency contacts are notified and the incident is logged.

## Tech Stack

- Mobile: React Native, Expo, Expo Router, Expo Sensors, Expo Speech
- Backend: Node.js, Express, TypeScript/JavaScript
- ML pipeline: Python, PyTorch, NumPy, SciPy, scikit-learn, ONNX Runtime
- Alerting: JSON-backed contact manager, demo-mode SMS flow, optional Twilio integration
- Storage: Local app persistence plus server-side JSON event/contact storage

## How It Works

- The mobile app reads IMU data continuously and maintains a short rolling buffer.
- A local edge filter suppresses stable or obviously non-fall motion before any escalation.
- Candidate windows are validated using fall-confidence and false-alarm confidence outputs.
- Only high-risk cases move to confirmation, where the user can cancel or escalate quickly.
- If the backend or network is unavailable, the app still preserves the local monitoring and confirmation flow.

## Demo / Usage Instructions

### 1. Backend setup

Create `server/.env` from `server/.env.example`.

For demo runs, keep `DEMO_MODE=true` to simulate SMS delivery safely.

```bash
cd server
npm install
npm run dev:node
```

### 2. Mobile app setup

Create `interfaceNew/.env` from `interfaceNew/.env.example` and point `EXPO_PUBLIC_API_BASE_URL` to your machine's local API URL.

```bash
cd interfaceNew
npm install
npx expo start
```

### 3. Optional ML environment

Use this when running the Python inference pipeline locally.

```bash
cd fault_detection_model
python -m venv .venv
pip install torch torchvision
pip install -r requirements-gpu.txt
```

### 4. Demo flow

1. Start the backend server and launch the mobile application.
2. Configure emergency contacts from the Settings screen.
3. Open the Live Monitoring module.
4. Trigger a fall event using a controlled motion test or the “Simulate fall” option.
5. On detection, the device vibrates and shows a confirmation screen:

   * Any screen interaction within the timeout cancels the alert.
   * No interaction results in automatic emergency SOS dispatch.

## Future Scope

- Move the full confidence-validation stage fully on-device
- Add hands-free spoken response capture for confirmation
- Personalize thresholds using user-specific safe-motion patterns
- Expand field calibration for different carrying positions and real-world movement profiles

## Team Info

- Team: Ved Vahini
- Members: Adarsh Chaubey, Aditya Laxkar, Abhinav Patra, Sakshi Gupta
- Track: Problem Statement 5
