# PathSense-AI — FallSense Module
## Structured Stack, Architecture & Execution Plan
### Framework: React Native (Bare Workflow)

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Integration with PathSense Core](#2-integration-with-pathsense-core)
3. [Required App Permissions](#3-required-app-permissions)
4. [Full Tech Stack](#4-full-tech-stack)
5. [Sensor Architecture & IMU Pipeline](#5-sensor-architecture--imu-pipeline)
   - 5.1 Sensor Inputs Available on Device
   - 5.2 Continuous Motion State Monitor
   - 5.3 Initial Calibration Phase (Days 1–5)
   - 5.4 Multi-Stage Fall Detection Algorithm
   - 5.5 Contextual Environment Detection
6. [Fall Severity Classification](#6-fall-severity-classification)
   - 6.1 Severity Scoring Formula
   - 6.2 Severity Levels and Definitions
7. [Alert Escalation System](#7-alert-escalation-system)
   - 7.1 Full Escalation Chain
   - 7.2 SOS Contact Alert
   - 7.3 ETA-Based Decision Logic
   - 7.4 108 Emergency Integration
   - 7.5 Bluetooth Emergency Broadcast
8. [Location Caching Strategy (Redis)](#8-location-caching-strategy-redis)
9. [False Alarm Prevention](#9-false-alarm-prevention)
   - 9.1 Pre-Event Gate: Gait and Motion Context
   - 9.2 Throw vs Fall Disambiguation
   - 9.3 Impact Surface Signature
   - 9.4 Depth and Altitude Context
   - 9.5 Audio Confirmation Flow
   - 9.6 Device-Local Adaptive Learning
10. [Data Schema](#10-data-schema)
11. [Phased Execution Plan](#11-phased-execution-plan)
12. [External Suggestions and Open Questions](#12-external-suggestions-and-open-questions)

---

## 1. Module Overview

FallSense is a passive, always-on fall detection and emergency response module that
extends the PathSense-AI assistive navigation system. It uses only the hardware sensors
already present in a modern smartphone — no external wearables, no additional hardware.

The module is designed specifically for elderly users. It assumes the phone is either
in a pocket, in a pouch, held in hand, or in a chest/neck mount — consistent with the
existing PathSense operating assumptions.

Core responsibilities:

- Continuously monitor IMU streams for fall events in the background via a persistent
  Android Foreground Service and iOS Background Location anchor
- Cache the user's last-known GPS coordinates every 60 seconds into Redis, independently
  of the navigation session, so that location is available even if the phone is
  unresponsive or GPS becomes unavailable after a fall
- Classify the fall's severity using a multi-factor sensor score fused with an
  on-device TFLite classifier
- Classify the fall's environmental context (road, ditch, washroom, market, staircase)
- Execute a tiered, time-gated alert escalation chain toward SOS contacts, 108
  emergency services, and nearby BLE-enabled devices
- Prevent false alarms through a multi-layer gating and disambiguation pipeline
- Learn device-specific false-positive signatures locally over time and adapt
  detection thresholds without requiring any cloud round-trip

---

## 2. Integration with PathSense Core

FallSense shares infrastructure with the existing PathSense pipeline but runs as a
parallel, independent background task. It does not block or depend on the navigation
inference loop. When a fall is detected, it injects an event into the shared Safety
Supervisor which halts navigation guidance and hands control to the alert pipeline.

```
PathSense Core                           FallSense Module
────────────────────────────────────────────────────────────────────────────────
IMU Sensor Manager          ─────────>   Fall IMU Consumer (parallel ring buffer read)
GPS Preprocessor            ─────────>   Location Cache Writer (60s interval)
Depth Estimation (MiDaS)    ─────────>   Post-fall context enrichment (on-demand)
Segmentation (Fast-SCNN)    ─────────>   Surface type at fall point (on-demand)
Camera Preprocessor         ─────────>   Post-fall scene snapshot (optional)
IMU Ring Buffer (2s)        ─────────>   Pre-fall window replay for ML input
Safety Supervisor           <─────────   Fall event injection (halt navigation)
Local Event Logger          <─────────   Fall event, severity, context, alert chain log
```

The React Native JS thread handles UI, confirmation prompts, and alert dispatch.
The native module (Java/Kotlin on Android, Swift/Obj-C on iOS) handles the
high-frequency IMU loop and fall candidate detection so the JS bridge is never
a bottleneck for sensor reads. Only confirmed fall candidates are passed to JS.

---

## 3. Required App Permissions

All permissions must be declared in the platform manifest and requested at runtime
with clear plain-language explanations before each request. Every permission below
has a documented justification for elderly-audience trust and app store compliance.

### Android (AndroidManifest.xml)

```xml
<!-- Sensor Access -->
<uses-permission android:name="android.permission.BODY_SENSORS" />
<!-- Required Android 13+ for background sensor polling -->
<uses-permission android:name="android.permission.BODY_SENSORS_BACKGROUND" />
<!-- Required Android 12+ for sampling accelerometer/gyroscope above 200 Hz -->
<uses-permission android:name="android.permission.HIGH_SAMPLING_RATE_SENSORS" />

<!-- Location -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<!-- Required for 60-second Redis location cache writes when app is backgrounded -->
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Background Execution -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<!-- Android 14+ type declaration for health monitoring foreground service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_HEALTH" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Audio -->
<!-- Ambient audio classification for context detection and voice "I'm OK" -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<!-- Communications -->
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.CALL_PHONE" />
<uses-permission android:name="android.permission.SEND_SMS" />
<uses-permission android:name="android.permission.READ_CONTACTS" />

<!-- Bluetooth Emergency Broadcast -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<!-- Network & Motion -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
```

### iOS (Info.plist)

```xml
<key>NSMotionUsageDescription</key>
<string>FallSense uses the accelerometer and gyroscope to detect if you fall.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Your location is saved every minute so we can find you if you fall
and your phone cannot respond.</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>Your location is saved every minute so we can find you if you fall.</string>

<key>NSMicrophoneUsageDescription</key>
<string>The microphone is used briefly after a possible fall to understand
where you are and to hear you say "I'm OK".</string>

<key>NSBluetoothAlwaysUsageDescription</key>
<string>Bluetooth is used to alert nearby people with the app if you fall
and need immediate help.</string>

<key>NSContactsUsageDescription</key>
<string>Used to select your emergency SOS contacts from your address book.</string>

<key>NSSpeechRecognitionUsageDescription</key>
<string>Used to hear you say "I'm fine" to cancel a false fall alert quickly.</string>

<key>UIBackgroundModes</key>
<array>
  <string>location</string>          <!-- Background GPS for 60s location cache -->
  <string>bluetooth-central</string> <!-- BLE scanning in background -->
  <string>bluetooth-peripheral</string> <!-- BLE advertising emergency beacon -->
  <string>fetch</string>             <!-- Periodic Redis cache write -->
  <string>processing</string>        <!-- Fall ML inference -->
  <string>audio</string>             <!-- Ambient audio monitoring post-fall -->
</array>
```

### Permission UX Strategy

- Do NOT request all permissions at once on first launch.
- Use a step-by-step onboarding flow with one permission per screen.
- Each screen uses large text (minimum 18sp), single action button, and a brief
  plain-language explanation of exactly why that permission is needed.
- For background location: show an explicit explainer screen before the OS prompt.
  Text: "This lets us remember where you were before a fall, even if your phone
  cannot respond afterwards."
- Rejected permissions degrade gracefully. Show a persistent soft warning banner
  inside the app. Never crash or block core functionality silently.
- Re-request at next app open with a single tap "Enable now" prompt — not a modal.

---

## 4. Full Tech Stack

### Mobile Application

```
Framework           React Native CLI (bare workflow)
Language            TypeScript
                    Chosen for: type safety on sensor data pipelines,
                    better refactoring support, and enforced null checks
                    on severity and alert state machines

Why bare workflow:  Expo managed cannot support custom native modules required
                    for high-frequency IMU access, BLE advertising, foreground
                    services, and emergency call automation. Bare workflow gives
                    direct Gradle and Xcode project control.

Sensor Access
  react-native-sensors              Accelerometer, gyroscope, magnetometer,
                                    barometer — configurable update intervals
                                    down to 10ms (100Hz). Streams as RxJS
                                    Observables, easy to pipe into ring buffer.

  @react-native-community/
  netinfo                           Network state monitoring (needed to detect
                                    if connectivity was lost after fall)

Background Execution
  react-native-background-actions   Runs a JS task in a persistent Android
                                    foreground service with a sticky notification.
                                    Used for the fall detection loop and the
                                    60-second Redis location writer.

  @supersami/rn-foreground-service  Alternative / fallback native foreground
                                    service with Java-level IMU access for
                                    Android 14+ compliance.

  react-native-background-fetch     iOS-compatible periodic background fetch
                                    for the 60s location cache write when
                                    background-actions is not available.

Location
  react-native-geolocation-service  Full GPS access on Android and iOS.
                                    Supports background location, high accuracy
                                    mode, and foreground service integration.

  @mauron85/react-native-
  background-geolocation            Robust background location with battery
                                    optimization, geofencing, and SQLite-backed
                                    location history. Used as the primary
                                    background location provider.

Bluetooth (Emergency Broadcast)
  react-native-ble-plx              BLE central role: scan for nearby devices
                                    running FallSense to confirm broadcast reach.

  react-native-ble-advertiser       BLE peripheral role: broadcast emergency
                                    beacon advertisement with encoded location
                                    payload. Android only — iOS restricts
                                    background peripheral advertising (see
                                    Section 7.5 for iOS fallback).

On-Device ML
  @tensorflow/tfjs-react-native     TensorFlow.js runtime for React Native.
                                    Loads TFLite/TFJS fall classifier model.
                                    Runs inference on 2-second IMU window.

  react-native-fast-tflite          Faster alternative TFLite runner using
                                    JSI bridge (no async overhead). Preferred
                                    for latency-sensitive fall inference.

Local Storage
  @op-engineering/op-sqlite         High-performance SQLite via JSI. Used for:
                                    - False alarm fingerprint database
                                    - Calibration profile store
                                    - Pre-fall IMU window cache
                                    - Shadow detection log (calibration phase)

  @react-native-async-storage/
  async-storage                     Key-value store for user config, SOS
                                    contacts list, thresholds, and app state.

Audio / Voice
  react-native-audio-recorder-
  player                            Record short ambient audio clips for
                                    context classification (washroom echo,
                                    market noise). Triggered post-fall only.

  @react-native-voice/voice         Speech recognition for voice-based
                                    "I'm OK" confirmation. Listens for 8s
                                    after fall prompt. Understands regional
                                    accents via on-device recognition API.

  react-native-tts                  Text-to-speech for audio prompt:
                                    "Did you fall? Say I'm fine or press OK
                                    to cancel."

Push Notifications and Alerts
  @react-native-firebase/messaging  FCM push notifications to SOS contact
                                    devices. Works in background/killed state.

  notifee                           On-device notification builder for the
                                    fall confirmation prompt (high-priority,
                                    full-screen intent on Android).

  react-native-communications       Programmatic phone call and SMS trigger.
                                    Used for 108 auto-dial and SMS fallback.

Networking
  axios                             HTTP client for backend API calls.
  socket.io-client                  WebSocket for real-time SOS contact
                                    response tracking during active fall event.

State Management
  zustand                           Lightweight reactive state for fall event
                                    state machine, alert chain status, and
                                    SOS contact ETA tracking.

  immer                             Immutable state updates for complex fall
                                    event objects passed through the pipeline.

Navigation
  react-navigation v6               Screen navigation for onboarding,
                                    dashboard, SOS contact management,
                                    and fall event history.

UI
  react-native-paper                Material Design component library.
                                    Chosen for accessibility support,
                                    large touch targets, and readable defaults.

  react-native-reanimated           Smooth animations for fall confirmation
                                    countdown UI and alert escalation timer.
```

### Backend Services

```
Runtime             Bun 1.x + Express 4.x
                    TypeScript throughout — same language as the mobile app,
                    shared type definitions for the fall event schema,
                    alert payloads, and Redis key contracts can live in a
                    common types/ package consumed by both sides.
                    Bun is chosen over plain Node.js for:
                      - Native TypeScript execution (no tsc build step needed
                        during hackathon development)
                      - Significantly faster cold starts and I/O throughput
                      - Built-in .env loading, test runner, and bundler
                      - Compatible with the full npm/Node.js ecosystem

Project structure
  server/
  ├── src/
  │   ├── index.ts               Express app entry point
  │   ├── routes/
  │   │   ├── location.ts        /api/v1/location/*
  │   │   ├── fall.ts            /api/v1/fall/*
  │   │   └── sos.ts             /api/v1/sos/*
  │   ├── workers/
  │   │   ├── alertWorker.ts     BullMQ worker: SOS push dispatch
  │   │   ├── etaWorker.ts       BullMQ worker: ETA polling + escalation
  │   │   └── escalationWorker.ts BullMQ worker: 108 + BLE trigger logic
  │   ├── services/
  │   │   ├── redis.ts           ioredis client + location cache helpers
  │   │   ├── firebase.ts        Firebase Admin SDK (FCM dispatch)
  │   │   ├── twilio.ts          Twilio SMS + voice call helpers
  │   │   └── socket.ts          socket.io server for live event tracking
  │   ├── db/
  │   │   ├── models/            Mongoose model files (User, FallEvent, Calibration, FalseAlarmLog)
  │   │   └── client.ts          Mongoose connection singleton
  │   └── types/
  │       ├── fallEvent.ts       Shared FallEvent, Severity, Context types
  │       └── redisKeys.ts       Redis key builders + TTL constants
  ├── package.json
  ├── bunfig.toml
  └── .env

Task Queue          BullMQ + Redis
                    Node.js-native job queue backed by Redis.
                    Replaces Celery entirely. Three named queues:
                      alert-dispatch   SOS FCM push + SMS + WhatsApp send
                      eta-monitor      60s repeating ETA re-evaluation job
                      escalation       108 dial trigger, BLE server-push
                    BullMQ is type-safe with generics for job data payloads.
                    Jobs are added from Express route handlers.
                    Workers run in the same Bun process (hackathon simplicity)
                    or can be split to separate worker processes for scale.

Location Cache      Redis 7 (via ioredis)
                    TTL-based last-known location store.
                    See Section 8 for full key schema and TTL strategy.

Database            — see note below —

Push                firebase-admin (Node.js SDK)
                    Server-side FCM dispatch to SOS contact devices.
                    Same API surface as the Python SDK, identical behaviour.

SMS / Call          twilio (Node.js SDK)
                    Fallback SMS to SOS contacts if FCM push fails.
                    Programmatic call to 108 for MAJOR fall events.
                    WhatsApp Business API via Twilio for SOS contact
                    alerts (high open-rate in Indian user base).

Real-time           socket.io 4.x
                    WebSocket server for live fall event tracking.
                    SOS contact app connects to /fall/live/:eventId room.
                    Server emits: eta_update, sos_arrived, escalation_fired.

Containerization    Docker + Docker Compose
                    Services: api (Bun), redis, mongodb, nginx-proxy
                    Bun Docker image: oven/bun:1 (official, ~95MB)
                    docker compose up spins the full stack in one command.
                    MongoDB Atlas free tier (M0) is a zero-Docker alternative
                    for hackathon development — one connection string in .env.

API Surface
  POST  /api/v1/location/cache        Receive 60s location ping from device
  POST  /api/v1/fall/event            Receive confirmed fall event + sensor snapshot
  POST  /api/v1/sos/dispatch          Trigger alert dispatch to SOS contacts
  POST  /api/v1/sos/eta               Receive ETA update from SOS contact device
  POST  /api/v1/sos/resolve           Mark event resolved or false alarm
  GET   /api/v1/fall/history/:userId  Fetch fall event history
  WS    /api/v1/fall/live/:eventId    socket.io room for real-time event tracking
```

> **Database: MongoDB 7 + Mongoose 8**
> The fall event schema (Section 10) is a deeply nested JSON document — MongoDB's
> document model is a natural fit. No migrations, flexible schema iteration mid-hack,
> and Atlas free tier (M0) means zero local infrastructure needed.
> `MONGODB_URI` in `.env` is the only config required.

### On-Device ML Model (Fall Classifier)

```
Architecture    MobileNetV3-Small or 2-layer LSTM
                LSTM preferred: better temporal sequence modeling for
                IMU time-series data.

Input           2-second sliding window at 100Hz = 200 samples per channel
                Channels: acc_x, acc_y, acc_z, gyr_x, gyr_y, gyr_z,
                          acc_magnitude, gyr_magnitude, pitch, roll, yaw_rate
                Total input shape: [200, 11]

Output          Softmax over 4 classes:
                  0: no_fall
                  1: minor_fall
                  2: semi_major_fall
                  3: major_fall

Format          TFLite INT8 (quantized) — target < 2MB model size
                Loaded via react-native-fast-tflite for JSI inference

Training Data   FARSEEING   — real-world falls from elderly users in daily life
                SisFall     — 19 fall types + 33 ADL types, phone in pocket
                MobiAct     — large-scale IMU fall dataset, multiple placements
                Device-local calibration data appended per-user (Phase 5)

Inference       Triggered only on fall candidate (not continuous)
                Target latency: < 30ms on mid-range Android device

Fallback        Rule-based threshold classifier (Section 6.1)
                Activated when model confidence < 0.60
                Default to MINOR when uncertain — fail-safe bias
```

---

## 5. Sensor Architecture & IMU Pipeline

### 5.1 Sensor Inputs Available on Device

All sensors listed below are standard hardware in any smartphone manufactured
after 2018. No external devices are required.

```
Sensor                  Sampling Rate    Purpose in FallSense
──────────────────────────────────────────────────────────────────────────────
Accelerometer           100–200 Hz       Primary fall detection signal.
                                         Free-fall detection: magnitude < 0.5g.
                                         Impact detection: magnitude spike > 2.5g.
                                         Post-impact immobility monitoring.

Gyroscope               100–200 Hz       Orientation change during fall event.
                                         Distinguishes person-fall rotation arc
                                         from object-throw chaotic spin.
                                         Roll/pitch/yaw rate continuity analysis.

Barometer               5–10 Hz          Altitude and floor-level estimation.
                                         Detect staircase fall (rapid pressure drop).
                                         Detect ditch/below-grade context.
                                         Floor index: ground(0), 1st(1), 2nd(2).
                                         Resolution: ~0.06 hPa = ~50cm on BMP388.

Magnetometer            20 Hz            Heading stability tracking.
                                         Anomalous reading may indicate metallic
                                         surface contact post-fall.
                                         Indoor/outdoor environment signal.

GPS                     0.016 Hz         Location cache (every 60 seconds).
                        (1 per 60s)      Last cached location used in all alerts
                                         when GPS becomes unavailable post-fall.

Microphone              On-trigger        Post-fall ambient audio clip (3–5s).
                        only             Washroom echo, market noise, road traffic.
                                         "I'm OK" voice confirmation listening (10s).
                                         NOT continuously recording — privacy first.

Camera                  On-trigger        Optional post-fall scene snapshot.
                        only             Depth map for surface/context enrichment.
                                         Reuses MiDaS pipeline from PathSense core.
                                         NOT continuously active — battery cost.

Android Activity        1 Hz             OS-level motion classifier.
Recognition API                          States: WALKING / RUNNING / IN_VEHICLE /
                                         STILL / ON_FOOT / ON_BICYCLE.
                                         Used as a coarse gate before IMU pipeline.
```

### 5.2 Continuous Motion State Monitor

This is the always-on lightweight layer running before any fall detection logic.
It runs entirely in native code (Java/Kotlin, Swift) to avoid JS bridge overhead
at 100Hz. It classifies the user's current motion state using a low-power sliding
window over raw IMU data and communicates only state changes to the JS layer.

```
Motion States (Internal):
──────────────────────────────────────────────────────────────────────────────
STATIONARY          acc_magnitude ≈ 1g ± 0.1, gyr_magnitude ≈ 0 rad/s
WALKING             Periodic acc oscillation at 1.5–2.5 Hz. Step cadence
                    detected via peak counting on acc_magnitude signal.
RUNNING             acc oscillation frequency > 3 Hz, higher magnitude swings.
IN_VEHICLE          Smooth low-frequency vibration pattern. GPS speed > 15 km/h.
                    Fall detection suppressed for most events in this state
                    (speed bump, pothole) — except extreme impact (> 6g).
UNSTABLE_GAIT       Irregular step cadence. High lateral acc sway.
                    This is the critical pre-fall indicator.
                    Raises fall detection sensitivity by 20% immediately.
PHONE_HANDLED       Rapid multi-axis rotation without forward translation.
                    Suggests the phone is being picked up, adjusted, or handed.
                    Reduces fall sensitivity for 3 seconds after detection.
AIRBORNE            acc_magnitude < personal_free_fall_threshold for > 80ms.
                    Passes control to Stage 2 of fall pipeline.
POST_IMPACT         Transition from AIRBORNE to sudden acc spike > 2.5g.
                    Followed by either STILL (unconscious) or motion (recovery).

State transitions feed directly into the Fall Detection Pipeline as gates.
The motion state over the last 2 seconds before a fall candidate is a
critical feature vector for the ML classifier.
```

### 5.3 Initial Calibration Phase (Days 1–5)

The system spends the first 5 days passively learning the user's personal motion
baseline before full fall detection is active. No user interaction is required
during this phase. A gentle onboarding message informs the user:

"FallSense is getting to know your movement patterns for the next 5 days.
After that, fall detection will be fully active."

```
Day 1–2: Passive collection only. Fall alerts are completely inactive.
──────────────────────────────────────────────────────────────────────────────
Recording:
  - acc_magnitude distribution during walking epochs
  - Step cadence frequency (Hz) and regularity (variance)
  - Dominant phone carry posture: inferred from pitch/roll distribution
      Pocket carry:    pitch ≈ 80–90°, roll ≈ 0–10°
      Hand carry:      pitch ≈ 50–70°, roll varies widely
      Neck/chest mount: pitch ≈ 30–50°, roll ≈ 0°
  - Typical vertical acceleration bounce amplitude during walking
  - Resting noise floor of accelerometer (device-specific hardware variance)
  - Gyroscope drift rate (temperature-dependent, measured at rest)
  - Barometric baseline pressure (calibrated against GPS altitude on first fix)

Day 3–4: Baseline computed. System runs in SHADOW MODE.
──────────────────────────────────────────────────────────────────────────────
Shadow mode: Detects fall candidates using draft thresholds but fires NO alerts.
Every shadow detection is logged to SQLite with the full 2s IMU snapshot and
sensor context. The user sees no indication a "fall" was detected.

Optional lightweight check-in (shown once per day, dismissable):
"Did anything unusual happen around [time]? (Yes / No)"
A "Yes" response flags that shadow detection as a true positive for validation.
A "No" response flags it as a false positive. These labels refine thresholds.

Day 5: Full activation.
──────────────────────────────────────────────────────────────────────────────
Personal calibration profile is finalized and written to SQLite.
A background sync sends an encrypted, anonymized version to the backend
for aggregate model improvement (opt-in only, GDPR/DPDP compliant).
User receives: "FallSense is now fully active and watching over you."
```

Calibration outputs written to SQLite `calibration_profile` table:

```
user_acc_walk_mean             Mean acc_magnitude during walking
user_acc_walk_stddev           Standard deviation of walking acc_magnitude
user_step_cadence_hz           Dominant step frequency
user_phone_carry_pitch         Median pitch angle in carry posture
user_phone_carry_roll          Median roll angle in carry posture
user_gyr_walk_mean             Mean gyr_magnitude during walking
user_stationary_noise_floor    Resting acc noise (sigma)
personal_freefall_threshold    walk_mean - (2.5 * walk_stddev), floor 0.3g
personal_impact_threshold      walk_mean + (3.5 * walk_stddev), floor 2.0g
personal_rotation_threshold    gyr_walk_mean + (4 * gyr_stddev), floor 1.2 rad/s
baro_ground_pressure_hpa       Barometric baseline at ground level
carry_posture_type             POCKET | HAND | MOUNT (inferred)
calibration_date               ISO timestamp
calibration_version            Incremented on each recalibration
```

Recalibration is triggered automatically if:
- The user's step cadence shifts by more than 15% over 7 days (gait change)
- User installs the app on a new device (hardware noise floor differs)
- User explicitly requests it from settings

### 5.4 Multi-Stage Fall Detection Algorithm

The algorithm is a 5-stage cascade pipeline. Each stage is a gate — only a pass
at every stage advances to the next. This design keeps CPU near zero during normal
activity. Stages 1–3 run in native code. Stages 4–5 involve JS and ML inference.

```
══════════════════════════════════════════════════════════════════════════════
STAGE 1 — FREE-FALL DETECTION GATE
══════════════════════════════════════════════════════════════════════════════
Trigger:
  acc_magnitude < personal_freefall_threshold  (calibrated, default 0.5g)
  Must sustain for > 80ms  (eliminates single-sample noise and micro-jolts)

Motion state gate:
  Must be in: WALKING | STATIONARY | UNSTABLE_GAIT
  Reject if:  IN_VEHICLE  (speed bump, pothole, road vibration)
              PHONE_HANDLED  (phone being picked up or tossed, < 3s suppression)

Action:
  Start fall candidate timer.
  Snapshot current motion state and barometer reading.
  Pull 2-second pre-event IMU window from ring buffer — this window is the
  primary ML model input and cannot be reconstructed after the fact.
  Activate Stage 2 real-time monitor.

══════════════════════════════════════════════════════════════════════════════
STAGE 2 — IMPACT DETECTION
══════════════════════════════════════════════════════════════════════════════
Window:     200ms after Stage 1 trigger

Trigger (ALL conditions must be met):
  acc_magnitude    > personal_impact_threshold  (calibrated, default 2.5g)
  gyr_magnitude    > personal_rotation_threshold (calibrated, default 1.2 rad/s)

Extended window:
  If no impact in 200ms but acc_magnitude remains below 0.8g (still falling),
  extend the impact detection window to 500ms.
  This handles staircase tumbles where each step produces a partial impact.

Reject if (throw/drop detection):
  Impact is immediately (< 100ms) followed by another AIRBORNE state.
  This is the double-bounce pattern of a phone thrown onto a hard floor,
  not a person falling.

Action:
  Record impact vector:
    impact_peak_g       Maximum acc_magnitude at impact
    impact_direction    Primary axis of impact (forward / sideways / backward)
    impact_duration_ms  Duration of impact spike above threshold
    impact_timestamp    Precise monotonic timestamp
  Advance to Stage 3.
  Begin False Alarm Gate analysis in parallel (Sections 9.1, 9.2, 9.3).

══════════════════════════════════════════════════════════════════════════════
STAGE 3 — ORIENTATION ASSESSMENT (Post-Impact)
══════════════════════════════════════════════════════════════════════════════
Window:     500ms after impact

Computation:
  delta_pitch = |post_impact_pitch - pre_fall_pitch|
  delta_roll  = |post_impact_roll  - pre_fall_roll|
  orientation_shift = sqrt(delta_pitch² + delta_roll²)

Threshold:
  orientation_shift > 60°  →  fall-consistent orientation change
  A person falling from standing to lying down creates a large orientation shift.
  The phone in a pocket or hand follows this arc predictably.

Borderline case (30°–60°):
  Reduce ML confidence contribution by 30%.
  Continue monitoring. The post-impact motion window (Stage 4) becomes
  the primary discriminator in this range.

Under-threshold case (< 30°):
  Phone remained essentially upright post-impact.
  This is consistent with: tripping and catching oneself, bumping into a wall,
  sitting down hard, or phone on a desk being bumped.
  Do NOT advance unless Stage 4 shows prolonged immobility.
  Flag as LOW_CONFIDENCE fall candidate.

Action:
  Advance to Stage 4 with orientation_shift and confidence modifier recorded.

══════════════════════════════════════════════════════════════════════════════
STAGE 4 — POST-IMPACT MOTION MONITORING
══════════════════════════════════════════════════════════════════════════════
Window:     0 to 30 seconds after impact (active monitoring)

Monitoring:
  Every 500ms, sample acc_magnitude and gyr_magnitude.
  Compute 3-second rolling variance of acc_magnitude.
  Variance < 0.04 g² over a 3s window = IMMOBILE (person not moving).

Recovery States:
  IMMEDIATE_RECOVERY    Motion detected within 0–8s post-impact.
                        Consistent with stumble-and-catch or minor fall.
                        User got up quickly. → Input to severity scorer.

  DELAYED_RECOVERY      Motion detected within 8–25s post-impact.
                        User took time to get up. Possible injury or shock.
                        → Input to severity scorer.

  IMMOBILE              No significant motion for > 25 continuous seconds.
                        acc_magnitude variance < 0.04 g² sustained.
                        → Hard escalation trigger: bypass ML fusion entirely.
                        → Severity is set to MAJOR directly. Do not run fusion.
                        Advance immediately to Stage 5 for context enrichment
                        and alert dispatch only — severity is already decided.

  PROGRESSIVE_MOTION    Gradual increase in motion over 10–25s window.
                        User is slowly getting up. Do NOT suppress alert.
                        Flag for audio confirmation first.

Action:
  Record recovery_time_seconds (time from impact to first significant motion,
  or 30 if never moves within the window).
  Advance to Stage 5.

══════════════════════════════════════════════════════════════════════════════
STAGE 5 — ML CLASSIFIER + RULE FUSION + CONTEXT ENRICHMENT
══════════════════════════════════════════════════════════════════════════════
Inputs:
  pre_fall_imu_window_2s      200 samples × 11 channels (from Stage 1 buffer)
  impact_snapshot             Peak g-force, direction, duration
  orientation_shift_deg       From Stage 3
  recovery_time_s             From Stage 4
  motion_state_pre_fall       WALKING | STATIONARY | UNSTABLE_GAIT
  barometer_delta_hpa         Pressure change during fall event
  ambient_audio_clip          3s recording, triggered now (async)
  last_cached_gps             From Redis (Section 8)
  false_alarm_gate_result     PASS | SUPPRESS | REDUCE_CONFIDENCE (from Section 9)

ML Inference:
  Run TFLite fall classifier on pre_fall_imu_window_2s + impact features.
  Output: [P_no_fall, P_minor, P_semi_major, P_major]
  Latency target: < 30ms via react-native-fast-tflite JSI bridge.

  If model confidence (max(P)) < 0.60:
    Discard ML output.
    Use rule-based severity score exclusively (Section 6.1).
    Do NOT suppress the alert — fail-safe bias applies.

IMMOBILE Override:
  If Stage 4 recovery state = IMMOBILE:
    Skip fusion. Set severity = MAJOR unconditionally.
    Proceed directly to alert dispatch with context enrichment only.

Final Severity Fusion (all non-IMMOBILE cases):
  severity_score = (0.55 × ML_output) + (0.30 × rule_score) + (0.15 × context_modifier)
  Final severity level = MINOR | SEMI_MAJOR | MAJOR (see Section 6.2)

If False Alarm Gate result = SUPPRESS:
  Do not fire any alert.
  Log the event to SQLite as SUPPRESSED for review.

If False Alarm Gate result = REDUCE_CONFIDENCE:
  Require audio confirmation before any alert dispatch.
  If user confirms "I'm OK" → log as false positive, update fingerprint DB.
  If no response in 10s → fire alert at one level below computed severity.

Output:
  Confirmed fall event object (see Section 10 for schema).
  → Advance to Audio Confirmation (Section 9.5).
  → In parallel, begin context environment classification (Section 5.5).
```

### 5.5 Contextual Environment Detection

Context enriches the alert message sent to SOS contacts and emergency services.
It never gates whether an alert fires — the alert fires regardless. Context
makes the alert actionable (e.g., "in a washroom on the 2nd floor" vs "outdoors
on a road").

```
──────────────────────────────────────────────────────────────────────────────
CONTEXT: WASHROOM / BATHROOM
──────────────────────────────────────────────────────────────────────────────
Signals:
  Ambient audio     High-frequency reverb and echo signature from tiled surfaces.
                    Short impulse response analysis of the 3s clip.
  WiFi fingerprint  Home or office SSID (if previously seen and labeled by user).
  Ambient dB        Low background noise floor with sharp transient reflections.
  BLE density       Very low (0–1 devices nearby). Isolation indicator.

Tag:      indoor_bathroom
Message:  "Possibly in washroom or bathroom."
Note:     Washroom falls are statistically severe (hard tiles, isolation, water).
Modifier: +0.10 on severity score.

──────────────────────────────────────────────────────────────────────────────
CONTEXT: OUTDOOR ROAD / PAVEMENT
──────────────────────────────────────────────────────────────────────────────
Signals:
  GPS               Fix valid, accuracy < 15m, GPS confidence HIGH.
  Ambient audio     Broadband traffic noise, wind, engine sounds.
  Barometer         Pressure consistent with ground level baseline.
  BLE density       Low to moderate.

Tag:      outdoor_road
Message:  "Fell outdoors. GPS coordinates attached."
Note:     Secondary injury risk (traffic). GPS coordinates shared in all alerts.
Action:   Always include GPS link in SOS message and 108 call.

──────────────────────────────────────────────────────────────────────────────
CONTEXT: MARKET / CROWDED INDOOR SPACE
──────────────────────────────────────────────────────────────────────────────
Signals:
  Bluetooth scan    High BLE device density > 8 devices in range.
  Ambient audio     High background noise, multiple overlapping voices.
  GPS               Degraded accuracy (indoor) or unavailable.
  WiFi              Multiple strong SSIDs from commercial routers.

Tag:      indoor_crowded
Message:  "In a crowded area (market, mall, or public space)."
Action:   Prioritize BLE broadcast (Section 7.5). Nearby app users can respond
          fastest. 108 response time in indoor crowded spaces is slower.

──────────────────────────────────────────────────────────────────────────────
CONTEXT: STAIRCASE FALL
──────────────────────────────────────────────────────────────────────────────
Signals:
  Impact pattern    Multiple impact events within 2–6 seconds (bouncing down stairs).
                    Each step impact has peak_g in range 1.5–4g, not one single spike.
  Barometer         Measurable altitude drop during fall sequence.
                    1 stair ≈ 0.2m ≈ 0.024 hPa. Full staircase (12 steps) ≈ 2.4m ≈ 0.28 hPa.
  Gyroscope         Repeated forward-tumbling rotation pattern across multiple impacts.
  Impact count      ≥ 3 distinct acc spikes above 1.5g within 6 seconds.

Tag:      staircase_fall
Override: Hard-set severity to SEMI_MAJOR minimum regardless of recovery time.
          Staircase falls cause injuries that are not immediately apparent.
Note:     Include floor level at start and end of fall in alert.

──────────────────────────────────────────────────────────────────────────────
CONTEXT: DITCH / BELOW-GRADE FALL
──────────────────────────────────────────────────────────────────────────────
Signals:
  Barometer         Sustained pressure increase post-fall:
                    > 0.4 hPa above last cached pressure = ~3.3m below ground level.
  GPS altitude      Current altitude significantly below last cached altitude.
  Depth model       If camera accessible: depth map shows no recoverable flat ground.
                    This is a best-effort signal — camera may be face-down.

Tag:      below_grade
Override: Hard-set severity to SEMI_MAJOR minimum.
Message:  "May have fallen into a ditch or below road level."
Note:     Last cached GPS is critical here. Always attach to all alerts.

──────────────────────────────────────────────────────────────────────────────
CONTEXT: FLOOR-LEVEL AWARENESS (Universal, All Contexts)
──────────────────────────────────────────────────────────────────────────────
Computation:
  At app start, record baro_ground_pressure_hpa (calibrated against GPS altitude).
  Each floor ≈ 3m ≈ 0.37 hPa pressure delta (standard floor height).
  floor_index = round((baro_ground_pressure_hpa - current_pressure_hpa) / 0.37)
  floor_index = 0  → ground floor
  floor_index = 1  → first floor above ground
  floor_index = -1 → one floor below ground (basement, underpass, ditch)

Barometer resolution on BMP388-class sensors: 0.06 hPa ≈ 50cm.
Floor-level detection is reliable for floor-to-floor discrimination (3m steps).

Included in: Every SOS message and 108 call.
Example:  "Fell on Floor 2. Building entry at [GPS coordinates]."

──────────────────────────────────────────────────────────────────────────────
CONTEXT: IN-VEHICLE EJECTION (Edge Case)
──────────────────────────────────────────────────────────────────────────────
Signals:
  Motion state      Was IN_VEHICLE within the last 10 seconds.
  GPS speed         > 30 km/h within last 10 seconds before fall.
  Impact            > 5g — consistent with vehicle collision, not speed bump.

Tag:      vehicle_ejection
Override: Hard-set severity to MAJOR. Skip audio confirmation entirely.
Action:   Alert 108 immediately with last known GPS. No waiting.
Note:     Life-threatening. False alarm cost is acceptable here.
```

---

## 6. Fall Severity Classification

### 6.1 Severity Scoring Formula

The rule-based severity score (used standalone when ML confidence < 0.60,
or as 30% weight in the fusion equation from Stage 5):

```
S_impact   = normalize(impact_peak_g, min=1.0, max=8.0)
             8g and above = 1.0 (worst case).
             < 1g = 0.0 (below threshold, should not reach this point).

S_freefall = normalize(freefall_duration_ms, min=80, max=600)
             80ms = minimum valid free-fall. 600ms+ = fall from height.

S_orient   = 1.0   if orientation_shift > 70°   (near-horizontal = lying down)
             0.6   if orientation_shift 45°–70°  (diagonal fall)
             0.2   if orientation_shift < 45°    (partial fall or catch)

S_recovery = 1.0   if recovery_time_s > 25   (IMMOBILE — no motion)
             0.7   if recovery_time_s 10–25  (DELAYED — slow to get up)
             0.3   if recovery_time_s 3–10   (SLOW — got up with effort)
             0.0   if recovery_time_s < 3    (IMMEDIATE — back up fast)

S_context  = 0.1   if context = indoor_bathroom   (hard surface, isolation)
             0.1   if context = staircase_fall     (multiple impacts)
             0.1   if context = below_grade        (ditch)
             0.2   if context = vehicle_ejection   (extreme)
             0.0   otherwise

Rule score = (0.35 × S_impact) + (0.25 × S_freefall) +
             (0.20 × S_orient) + (0.15 × S_recovery) + (0.05 × S_context)

Rule score range: 0.0 to 1.0
```

### 6.2 Severity Levels and Definitions

```
Final severity_score = (0.55 × ML_output) + (0.30 × rule_score) + (0.15 × context_modifier)

─────────────────────────────────────────────────────────────────────────────
LEVEL
 1 — MINOR FALL                            severity_score < 0.45
─────────────────────────────────────────────────────────────────────────────
Characteristics:
  Impact typically < 3g.
  User showed IMMEDIATE_RECOVERY (back up within 3–8s).
  Orientation shift moderate (phone did not end up fully horizontal).
  No staircase, ditch, or vehicle context.

Interpretation: User stumbled and recovered. Probably embarrassed, not injured.
                Risk is low but a check-in is appropriate.

Actions:
  1. Vibrate phone + audio prompt: "Did you fall? Tap OK to let us know you're fine."
  2. 10-second window for user to cancel (tap or say "I'm fine").
  3. If no cancel:
     → Push notification to all SOS contacts:
       "Possible minor fall detected for [Name] at [Location] at [Time].
        They may need assistance. Please check in with them."
  4. No 108 call.
  5. No BLE broadcast.
  6. Log event. Monitor for motion over next 2 minutes.
     If user becomes IMMOBILE after alert fires → escalate to SEMI_MAJOR.

─────────────────────────────────────────────────────────────────────────────
LEVEL 2 — SEMI-MAJOR FALL                       severity_score 0.45–0.75
─────────────────────────────────────────────────────────────────────────────
Characteristics:
  Impact typically 3–6g.
  DELAYED_RECOVERY (took 10–25s to show motion) OR IMMOBILE for 20–25s.
  Significant orientation shift.
  May include staircase or ditch context.

Interpretation: User fell hard. May be injured. Recovery is uncertain.

Actions:
  1. Vibrate phone + audio prompt: "We detected a fall. Say I'm fine or
     tap OK if you're OK. We'll alert your emergency contacts in 10 seconds."
  2. 10-second audio confirmation window.
  3. If no cancel:
     → Push + SMS to all SOS contacts with GPS location, floor level, context tag.
     → Start ETA timer (Section 7.3).
  4. If no SOS contact acknowledges within 30 seconds of alert dispatch:
     → Escalate to 108 call (Section 7.4).
  5. If SOS contact acknowledges and ETA is acceptable (Section 7.3):
     → Hold 108 escalation. Monitor ETA progress.
  6. BLE broadcast is triggered if context = indoor_crowded
     OR if all SOS contacts are > 10 minutes away.

─────────────────────────────────────────────────────────────────────────────
LEVEL 3 — MAJOR FALL                            severity_score > 0.75
─────────────────────────────────────────────────────────────────────────────
Characteristics:
  Impact > 6g OR IMMOBILE for > 25s.
  Likely complete loss of consciousness or severe injury.
  May include vehicle ejection, severe staircase, ditch context.

Interpretation: User is likely incapacitated. Immediate professional response needed.

Actions:
  1. Brief audio prompt (3 seconds only): "Emergency services are being contacted.
     Say I'm fine if you can hear this."
  2. 3-second window ONLY.
  3. Simultaneously:
     → Push + SMS to all SOS contacts.
     → Initiate 108 call (Section 7.4) — does NOT wait for SOS response.
     → Trigger BLE emergency broadcast (Section 7.5).
  4. Log full sensor snapshot, GPS, floor level, context to backend immediately.
     (Pre-emptive in case phone dies or connectivity drops.)
  5. NO dependency on SOS ETA — 108 is called regardless.
```

---

## 7. Alert Escalation System

### 7.1 Full Escalation Chain

```
FALL DETECTED
      │
      ▼
Audio Confirmation Window (3–10s depending on severity)
      │
      ├──[User cancels]──────────────────────────────► Log as false alarm.
      │                                                Update false alarm fingerprint DB.
      │
      └──[No cancel / timeout]
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ TIER 1: SOS Contact Push Notification + SMS                 │
   │ Sent immediately to all registered SOS contacts             │
   │ Payload: name, GPS link, floor level, context tag, time     │
   │ SMS + WhatsApp sent if no FCM ack in 15s                    │
   └─────────────────────────────────────────────────────────────┘
            │
            ▼
   ETA Timer starts (Section 7.3)
            │
            ├──[SOS contact responds + ETA acceptable]──────────► Monitor ETA.
            │                                                       Hold 108 if on track.
            │                                                       BLE broadcast if crowded.
            │
            ├──[No SOS response in 30s]────────────────────────► TIER 2: Alert 108.
            │
            ├──[SOS ETA > threshold AND severity = SEMI_MAJOR]──► TIER 2: Alert 108.
            │
            └──[Severity = MAJOR]───────────────────────────────► TIER 2: Alert 108.
                                                                    (Simultaneous with Tier 1)
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ TIER 2: 108 Emergency Services Call (Section 7.4)          │
   └─────────────────────────────────────────────────────────────┘
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ TIER 3: BLE Emergency Broadcast (Section 7.5)              │
   │ Triggered by: indoor_crowded context                        │
   │               OR SOS ETA > 10 min AND severity ≥ SEMI_MAJOR │
   │               OR MAJOR fall regardless of context           │
   └─────────────────────────────────────────────────────────────┘
            │
            ▼
   Event remains open until:
   - User manually clears it from phone
   - SOS contact marks "Reached them" in their app
   - 108 services confirm dispatch
```

### 7.2 SOS Contact Alert

SOS contacts are pre-registered by the user during setup. Recommended: 2–5 contacts.
They must have the app installed to receive push notifications. SMS is always the
fallback and requires no app installation.

```
Push Notification (FCM via Firebase):
  Title:    "⚠ FALL ALERT — [User Name]"
  Body:     "[Name] may have fallen at [Time]. Tap to see location and details."
  Data:     { eventId, lat, lng, floor_level, severity, context, timestamp }
  Priority: High (wakes screen on Android, critical notification on iOS)

In-app SOS Contact View (when they tap notification):
  - Live map with user's last cached GPS pin
  - Severity badge (MINOR / SEMI-MAJOR / MAJOR)
  - Context tag ("Outdoors", "Possible staircase fall", etc.)
  - Floor level ("Floor 2")
  - "I'm heading there" button → starts ETA reporting (see Section 7.3)
  - "I've reached them" button → closes event
  - "Call [User Name]" button → direct dial

SMS Fallback (Twilio):
  Sent if FCM push not acknowledged within 15 seconds.
  "FALL ALERT: [Name] may have fallen at [Time]. Location: [Google Maps link].
   Floor: [N]. Reply with your ETA in minutes or call [User Phone]."

WhatsApp (Twilio WhatsApp API):
  Sent at the same time as the SMS fallback (both fire together when FCM
  goes unacknowledged for 15s). SMS guarantees delivery on any phone;
  WhatsApp reaches the contact faster if they are online.
  Same message content, with Maps link.
```

### 7.3 ETA-Based Decision Logic

When an SOS contact taps "I'm heading there", their device begins sharing location
via the WebSocket connection. The system computes whether they can arrive in time.

```
ETA Computation:
  contact_distance_m = haversine(contact_lat, contact_lng, user_lat, user_lng)
  ETA Estimation:
    If driving:     contact_distance_m / 500m per minute = ETA minutes
                    (500 m/min = 30 km/h urban average with traffic)
    If walking:     contact_distance_m / 80m per minute = ETA minutes
    Mode inferred:  If contact_distance_m > 500m → assume driving
                    If contact_distance_m ≤ 500m → assume walking

ETA Thresholds:
  MINOR fall:     SOS ETA ≤ 15 min → no 108 escalation. Monitor.
                  SOS ETA > 15 min → fire BLE broadcast. Still no 108.
                  If user becomes immobile while waiting → escalate to SEMI_MAJOR.

  SEMI_MAJOR fall: SOS ETA ≤ 8 min → hold 108. Monitor closely.
                   SOS ETA > 8 min → alert 108 immediately.
                   No SOS response in 30s → alert 108 immediately.

  MAJOR fall:     108 is always called regardless of SOS ETA.

ETA Drift Check:
  Re-evaluate ETA every 60 seconds against contact's live GPS.
  If contact has not moved toward user for > 2 minutes (ETA increasing):
    → Escalate: fire 108 if not already alerted.
  If contact arrives (within 50m of user GPS):
    → Send "SOS contact has arrived" notification to user's phone.
    → Play audio: "[Contact Name] has reached you."
    → Event resolution prompted on contact's phone.

No SOS Response Protocol:
  If no SOS contact taps "I'm heading there" within 30 seconds of notification:
    → Assume contacts are unreachable (sleeping, no connectivity, missed alert).
    → Fire 108 immediately for SEMI_MAJOR.
    → For MINOR: send a follow-up push reminder after 60s. Still no 108.
```

### 7.4 108 Emergency Integration

India's 108 service does not have a public REST API for programmatic dispatch.
The integration strategy is multi-layered:

```
Layer 1 — Automated Call via react-native-communications:
  react-native-communications calls 108 directly using:
    Linking.openURL('tel:108')  on iOS
    IntentLauncher (phone call intent) on Android

  A pre-recorded voice message is played when 108 connects:
    "This is an automated emergency call from FallSense. An elderly person
     named [Name] has fallen at [Address/GPS coordinates], Floor [N].
     Last known location: latitude [X], longitude [Y].
     Please send help immediately. The person is [RESPONSIVE / UNRESPONSIVE]."

  Responsiveness is determined by:
    RESPONSIVE   = User moved or responded to audio prompt.
    UNRESPONSIVE = IMMOBILE > 25s and no audio confirmation.

Layer 2 — SMS to 108 (state-dependent, some states support SMS to 108):
  Message:
    "EMERGENCY: Elderly person fell. Name: [Name]. Location: [Maps link].
     Floor: [N]. Status: [Responsive/Unresponsive]. Call auto-initiated."

Layer 3 — Twilio Programmable Voice (if Layer 1 fails):
  Twilio places a call from a registered Indian virtual number to 108.
  Uses text-to-speech to deliver the same emergency message.
  This is the backend fallback when the device cannot initiate a call

  (phone is locked, screen is cracked, call rejected by device).
  Log each 108 attempt to MongoDB:
    FallEvent.findByIdAndUpdate(eventId, {
      'alertChain.call108InitiatedAt': new Date(),
      'alertChain.call108Method': layerUsed })

Layer 4 — NEMS / State Helpline Integration (Future):
  Several Indian states have API-accessible emergency dispatch systems.
  This is a roadmap item for integration as official APIs become available.
  For now, document and track: Andhra Pradesh, Telangana, Karnataka pilots.

Post-Call Logging:
  Call timestamp, duration (if connected), layer used → logged to backend.
  SOS contacts are notified: "108 has been alerted. They are en route."
```

### 7.5 Bluetooth Emergency Broadcast

When a SEMI_MAJOR or MAJOR fall occurs in a crowded area, or when SOS contacts
are too far away, FallSense broadcasts a BLE advertisement packet so that nearby
devices running the FallSense app can receive the alert and assist.

```
Android BLE Advertising (via react-native-ble-advertiser):
  Advertisement packet structure (31 bytes max):
    Bytes 0–1:    Manufacturer ID  (FallSense app identifier: 0xFF, 0xFA)
    Bytes 2–3:    Protocol version
    Bytes 4–5:    Severity level   (0x01 MINOR, 0x02 SEMI, 0x03 MAJOR)
    Bytes 6–13:   Latitude         (IEEE 754 float64 / double, 8 bytes)
    Bytes 14–21:  Longitude        (IEEE 754 float64 / double, 8 bytes)
    Bytes 22–23:  Floor index      (int16)
    Bytes 24–25:  Context tag      (enum: OUTDOOR, INDOOR, BATHROOM, MARKET, STAIRCASE)
    Bytes 26–31:  Reserved / checksum

  Broadcast interval: 100ms (high-frequency for emergency)
  Broadcast duration: Until event is resolved or 15 minutes, whichever comes first.
  TX Power:      High (maximum range, approximately 50–80m in open space).

iOS BLE Advertising (Peripheral Background Mode):
  iOS restricts background peripheral advertising — the advertisement packet
  shrinks to service UUIDs only when backgrounded.
  Mitigation:
    Use a registered custom Service UUID that FallSense scanning devices look for.
    Nearby iOS FallSense devices in background central mode will detect the UUID
    and trigger a local notification.
    This is less rich than Android but still achieves the proximity alert goal.

Nearby Device Reception (BLE Central):
  All FallSense-installed devices within range are continuously scanning for
  the FallSense manufacturer ID (Android) or service UUID (iOS).
  Scanning power cost: approximately 2–4 mA, negligible on modern devices.

  On detection:
    Show full-screen notification:
      "🆘 NEARBY EMERGENCY
       An elderly person has fallen near you.
       [Severity] fall detected [N] meters away.
       [Map pin showing direction]
       Tap to see location and assist."

  Privacy:
    The broadcast contains NO personal identifying information.
    Name, phone number, and user ID are NOT in the BLE packet.
    Detailed info is only available to registered SOS contacts via FCM.
    Nearby responders see only: location, floor, severity, context.
```

---

## 8. Location Caching Strategy (Redis)

The Redis location cache exists for one critical purpose: preserving the user's
last known position when GPS becomes unavailable after a fall (phone face-down,
body blocking GPS antenna, loss of connectivity, device trauma).

### Cache Write Strategy

```
Frequency:     Every 60 seconds when app is running or backgrounded.
Trigger:       react-native-background-fetch (iOS) /
               react-native-background-actions foreground service (Android).
Condition:     Only write if GPS accuracy < 50m.
               Do not write stale or low-accuracy fixes — a 200m-accuracy
               fix is worse than a 60-second-old accurate fix.
```

### Redis Key Schema

```
Key: user:{userId}:location:latest
Type: Hash
Fields:
  lat           Latitude (float, 6 decimal places)
  lng           Longitude (float, 6 decimal places)
  accuracy_m    GPS horizontal accuracy in meters
  altitude_m    GPS altitude in meters (for floor-level context)
  speed_ms      Speed in m/s (used for vehicle context detection)
  heading_deg   Compass heading
  ts            ISO8601 timestamp
  source        "gps" | "network" | "fused"
TTL: 86400 seconds (24 hours)

Key: user:{userId}:location:history
Type: List (LPUSH, capped to 60 entries = 60 minutes of history)
Value: JSON string of same fields as above
TTL: 86400 seconds

Key: user:{userId}:fall:event:{eventId}
Type: Hash
Fields: (full event schema — see Section 10)
TTL: 2592000 seconds (30 days)

Key: user:{userId}:fall:active
Type: String ("true" | "false")
TTL: 3600 seconds (auto-expires if never resolved)

Key: sos:{contactId}:eta:{eventId}
Type: Hash
Fields:
  eta_minutes       Estimated minutes to arrival
  distance_m        Distance to user at time of last update
  last_update_ts    Timestamp of most recent ETA update
  status            "en_route" | "arrived" | "unavailable"
TTL: 3600 seconds
```

### Fallback Chain When Network is Down Post-Fall

```
1. Device attempts Redis write via mobile data.
2. If network unavailable:
   → Store location + event in SQLite queue on device.
   → Keep retrying every 10 seconds (background fetch).
3. When connectivity resumes (WiFi reconnects, network available):
   → Flush queued writes to Redis in order.
   → Also push fall event to backend API if not already received.
4. SOS contacts receive the cached-then-flushed location.
   Alert includes note: "Location from before fall (cached [X] minutes ago)."
```

---

## 9. False Alarm Prevention

False alarms are a primary UX failure mode for this system. Every false alert
that reaches an SOS contact degrades trust and causes alert fatigue. The goal is
< 1 false alarm per user per week under normal daily use.

False alarm prevention is a multi-layer gate, not a single check. Each layer
independently reduces the false alarm rate. Together they form a high-specificity
pipeline while preserving sensitivity for real falls.

### 9.1 Pre-Event Gate: Gait and Motion Context

The most powerful false alarm gate is asking: "What was the user doing before this?"

```
Gate rule: A fall candidate is treated with HIGH suspicion unless the 2-second
pre-event window contains a plausible pre-fall motion context.

Accepted pre-contexts (fall is plausible):
  WALKING           User was walking. A stumble or trip is likely.
  UNSTABLE_GAIT     User was already showing gait instability. High probability.
  STATIONARY        User was standing still. Fainting or sudden loss of balance.
                    Requires slightly higher impact threshold (no trip momentum).

Rejected pre-contexts (fall is unlikely):
  IN_VEHICLE        Likely speed bump, pothole, or road vibration.
                    Only escalate if impact > 5g (vehicle ejection risk).
  PHONE_HANDLED     Phone was actively being manipulated 0–3 seconds before event.
                    Classify as: user dropped/threw phone. Suppress automatically.
  RUNNING           High-speed falls are possible but signatures differ.
                    Require orientation shift > 70° (hard drop) not just a stumble.
                    Running fall suppression reduces athlete/jogger false alarms.
```

### 9.2 Throw vs Fall Disambiguation

This gate specifically handles the scenarios raised:
"throwing phone on bed" and "throwing phone to someone to catch."

```
Throw-to-bed detection:
  Signature:  Short airborne phase (< 400ms).
              Impact soft: peak_g < 1.5g (bed mattress).
              Post-impact: phone lying flat, NO recovery motion at all.
              Pre-event: phone was STATIONARY or PHONE_HANDLED.
              No gait pattern in 5s before event.
  Action:     SUPPRESS automatically. Log as THROW_SOFT event.

Throw-to-person detection:
  Signature:  Short airborne phase.
              No hard impact spike — instead, smooth deceleration at catch point.
              Catch = gradual reduction in acc_magnitude rather than sudden spike.
              Gyroscope: chaotic multi-axis spin (consistent with thrown object).
              No prior gait.
  Action:     SUPPRESS automatically. Log as THROW_CAUGHT event.

General throw vs human fall differentiation table:
──────────────────────────────────────────────────────────────────────────────
Feature                   Human Fall          Phone Throw
──────────────────────────────────────────────────────────────────────────────
Pre-event motion state    WALKING/STATIONARY  PHONE_HANDLED/STATIONARY
Pre-event gait pattern    Present             Absent
Airborne duration         300–700ms           100–400ms
Free-fall trajectory      Controlled arc      Chaotic / erratic
Gyroscope during fall     Axis-aligned arc    Random multi-axis spin
Impact type               Hard spike (floor)  Soft (bed) or absent (caught)
Post-impact orientation   Near-horizontal     Varies widely
Post-impact motion        Recovery motion OR  Completely still
                          immobility
Phone orientation          Vertical (pocket)  Varies (often flat)
before event              Pitch ~80–90°       No consistent pattern
──────────────────────────────────────────────────────────────────────────────
Confidence reduction: If 3+ throw features match → reduce severity score by 50%.
                      If all throw features match → SUPPRESS.
```

### 9.3 Impact Surface Signature

Post-impact vibration decay reveals what surface the phone landed on.
This helps distinguish falls on soft surfaces (bed, couch, grass) from
falls on hard surfaces (floor, road, tiles).

```
Analysis:   100ms window immediately after impact spike.
            Compute vibration decay rate and residual oscillation amplitude.

Hard surface (floor, concrete, tiles):
  Sharp spike (> 2g), rapid decay (< 50ms), brief ringing (high-frequency residual).
  Consistent with a human fall on a hard surface.
  → Proceed normally.

Soft surface (bed, mattress, carpet, grass):
  Low spike (< 1.5g), slow decay (> 150ms), no ringing, damped oscillation.
  Consistent with: phone thrown on bed, person falling on mattress,
  rolling onto soft ground.
  → Apply: REDUCE_CONFIDENCE by 30%.
  → Require audio confirmation before alert dispatch.
  → If user confirms fine → log as soft_surface_false_alarm.

Rationale for not suppressing soft-surface falls entirely:
  An elderly person falling on carpet or grass is still a fall worth checking.
  The impact is softer, but the person may still be injured (hip fracture on soft fall).
  Suppression would be unsafe. Instead: require confirmation before escalating.
```

### 9.4 Depth and Altitude Context

The existing MiDaS depth estimation model from PathSense core provides an additional
signal for post-fall context analysis.

```
Triggered:  If camera is accessible and face-up after fall (detected via orientation).
            Camera is NOT continuously active — triggered on fall confirmation only.

Depth map analysis:
  Flat ground plane detected at < 0.5m depth:
    → Phone is lying on a flat surface. Consistent with fall.
    → No modification to severity.

  No ground plane detected (depth > 2m everywhere):
    → Phone may be in the air, on a ledge, or face-down against wall.
    → Best-effort signal only. Do not suppress based on this alone.

  Elevated structure detected below phone (depth > 0.8m but soft texture):
    → Phone may be on a bed or sofa (combined with soft impact signature).
    → Increase throw/soft-surface confidence. Apply REDUCE_CONFIDENCE.

Barometric altitude cross-check:
  Compare current barometric altitude to last cached barometric reading.
  Sudden altitude increase (> 0.3 hPa = ~2.5m) after impact:
    → Phone went UP, not down. Consistent with being thrown upward.
    → SUPPRESS fall detection. Log as throw event.

  Sudden altitude decrease (> 0.4 hPa = ~3.3m) after impact:
    → Phone went significantly down. Consistent with ditch or staircase.
    → Tag context accordingly. Apply severity OVERRIDE minimum SEMI_MAJOR.

Floor-level note:
  For falls on 1st floor vs ground floor:
    The floor_index computation (Section 5.5) operates at ~50cm resolution.
    A person falling on the 1st floor (~3m above ground) is easily differentiated
    from a ground-floor fall. This is NOT used to suppress alerts —
    floor level is recorded and included in all emergency communications.
    Being on the 1st floor is not a reason to doubt a fall occurred.
```

### 9.5 Audio Confirmation Flow

The audio confirmation is the user's last chance to cancel before any alert fires.
It must be fast, loud, and require minimal physical effort — designed for a person
who may be on the ground and possibly disoriented.

```
Trigger:    After Stage 5 confirms fall candidate (any severity level).
            Exception: MAJOR fall + IN_VEHICLE context → skip confirmation,
                       alert immediately (life-threatening scenario).

Confirmation prompt sequence:
  1. Phone vibrates in a strong, distinctive pattern: 3 short pulses, 1 long.
     Designed to be felt even if phone is face-down in pocket.
  2. Volume is forced to maximum (requires MODIFY_AUDIO_SETTINGS permission).
  3. react-native-tts speaks:
     MINOR:      "Did you fall? Say I'm fine or tap the screen to cancel."
     SEMI-MAJOR: "We detected a fall. Say I'm fine to cancel.
                  We will alert your contacts in 10 seconds."
     MAJOR:      "Emergency services are being contacted. Say I'm fine to cancel."

Listening window:
  MINOR:      10 seconds
  SEMI-MAJOR: 10 seconds
  MAJOR:      3 seconds only

Voice recognition (@react-native-voice/voice):
  Listens for: "I'm fine", "I'm ok", "I'm okay", "cancel", "stop", "theek hoon",
               "main theek hoon", "nahi gira", common regional phrases.
  Uses on-device speech recognition (Android SpeechRecognizer, iOS SFSpeechRecognizer).
  No cloud round-trip — works offline.
  On match: Cancel fall event. Log as USER_CANCELLED.

Screen tap override:
  Large full-screen cancel button shown during confirmation window.
  Minimum tap target: 200 × 200 dp (easily tapped with shaking hands).
  Button text: "I'M OK — CANCEL ALERT"
  Button color: Green, high contrast.

Countdown timer:
  Visible on screen (if phone is face-up): large countdown number.
  Audible countdown: "3... 2... 1... Alerting your contacts now."

Confirmation result states:
  USER_CANCELLED:   User said "I'm fine" or tapped button. → Section 9.6.
  TIMEOUT_NO_RESP:  Window elapsed, no input. → Fire alert chain.
  VOICE_CONFIRMED:  User spoke but said something other than a cancel phrase.
                    → Treat as no response. Fire alert chain.
```

### 9.6 Device-Local Adaptive Learning

Every confirmed false alarm teaches the system about this specific user's behavior.
The false alarm fingerprint database lives entirely on-device in SQLite.
No personal data leaves the device for this feature (opt-out of aggregate sync).

```
False Alarm Fingerprint Record (SQLite table: false_alarm_fingerprints):
──────────────────────────────────────────────────────────────────────────────
  id                  UUID
  timestamp           ISO8601 when the event occurred
  cancellation_method "voice" | "tap" | "shadow_label"
  imu_vector_2s       JSON array: 200-sample × 11-channel IMU window
                      This is the raw fingerprint.
  impact_peak_g       Recorded impact magnitude
  orientation_shift   Recorded orientation change in degrees
  recovery_time_s     Recorded recovery time
  surface_type        "hard" | "soft" | "unknown"
  motion_state_pre    Motion state before fall candidate
  context_tag         Context detected (indoor, outdoor, etc.)
  similarity_used     Whether this fingerprint has been matched before
──────────────────────────────────────────────────────────────────────────────

Matching at inference time:
  When a new fall candidate reaches Stage 5:
    Compute cosine similarity between the new 2s IMU vector and all stored
    false alarm fingerprints.
    If max_similarity > 0.88 (high match):
      → Tag the event: LIKELY_FALSE_ALARM.
      → Extend audio confirmation window by 5 seconds.
      → Reduce severity by one level for alert dispatch only
        (severity score is preserved for logging).
    If max_similarity 0.70–0.88 (partial match):
      → Require audio confirmation even for MINOR falls.
      → Do not auto-suppress.

Database management:
  Maximum 500 fingerprint records per device.
  FIFO eviction when limit is reached (oldest removed).
  Records older than 180 days are automatically pruned.

Aggregate feedback (opt-in only):
  With user consent, anonymized false alarm aggregate data (counts per context,
  distribution of impact values at false alarm, NOT raw IMU vectors) is synced
  to the backend for model improvement across the user base.
  Raw IMU vectors never leave the device.

Recalibration trigger from false alarms:
  If > 5 false alarms are recorded within 7 days:
    → Notify user: "FallSense has detected a pattern. Would you like to
       recalibrate to reduce false alerts?"
    → Trigger calibration Day 1–2 passive re-collection.
    → Raise personal_impact_threshold by one standard deviation.
```

---

## 10. Data Schema

### Fall Event Object (Device + Backend)

```json
{
  "event_id": "uuid-v4",
  "user_id": "uuid-v4",
  "device_id": "uuid-v4",
  "timestamp_detected": "2025-01-15T14:23:11.442Z",
  "timestamp_resolved": "2025-01-15T14:31:05.001Z",

  "severity_level": "SEMI_MAJOR",
  "severity_score": 0.62,
  "severity_ml_score": 0.59,
  "severity_rule_score": 0.67,
  "context_modifier": 0.10,

  "context": {
    "tag": "indoor_bathroom",
    "floor_index": 0,
    "gps_available": true,
    "gps_accuracy_m": 8.5,
    "lat": 17.4485,
    "lng": 78.3908,
    "altitude_m": 542.3,
    "baro_delta_hpa": 0.02
  },

  "imu_snapshot": {
    "freefall_duration_ms": 310,
    "impact_peak_g": 3.8,
    "impact_direction": "forward",
    "impact_duration_ms": 45,
    "orientation_shift_deg": 72.3,
    "recovery_time_s": 18.4,
    "motion_state_pre_fall": "WALKING",
    "pre_fall_window_ref": "sqlite://pre_fall_windows/{event_id}"
  },

  "false_alarm_gate": {
    "result": "PASS",
    "throw_confidence": 0.08,
    "surface_type": "hard",
    "fingerprint_max_similarity": 0.12
  },

  "confirmation": {
    "method": "TIMEOUT_NO_RESP",
    "window_seconds": 10,
    "voice_detected": false
  },

  "alert_chain": {
    "sos_push_sent_at": "2025-01-15T14:23:22.001Z",
    "sos_acknowledged_at": "2025-01-15T14:23:38.004Z",
    "sos_contact_eta_min": 12,
    "eta_exceeded_threshold": true,
    "call_108_initiated_at": "2025-01-15T14:24:08.001Z",
    "call_108_method": "device_call",
    "ble_broadcast_started": false,
    "resolution": "SOS_ARRIVED"
  },

  "location_source": "live_gps",
  "last_cached_location_age_s": 47,

  "is_false_alarm": false,
  "false_alarm_confirmed_by": null
}
```

### Calibration Profile (SQLite, per-device)

```json
{
  "user_acc_walk_mean": 1.08,
  "user_acc_walk_stddev": 0.11,
  "user_step_cadence_hz": 1.82,
  "user_phone_carry_pitch": 84.2,
  "user_phone_carry_roll": 5.3,
  "user_gyr_walk_mean": 0.42,
  "user_stationary_noise_floor": 0.03,
  "personal_freefall_threshold": 0.36,
  "personal_impact_threshold": 2.47,
  "personal_rotation_threshold": 1.28,
  "baro_ground_pressure_hpa": 1008.42,
  "carry_posture_type": "POCKET",
  "calibration_date": "2025-01-10T08:00:00Z",
  "calibration_version": 1
}
```

---

## 11. Phased Execution Plan

### Phase 1 — Foundation and Sensor Access (Week 1–2)

```
Goal: Get clean high-frequency sensor data flowing reliably in the background.

Tasks:
  1.1  Scaffold React Native bare project with TypeScript.
       Configure Gradle (Android) and Xcode (iOS) build targets.

  1.2  Implement Android Foreground Service for fall detection loop.
       Use react-native-background-actions with sticky notification.
       Verify service survives: app backgrounded, screen off, device restart.

  1.3  Integrate react-native-sensors.
       Configure accelerometer and gyroscope at 100Hz.
       Pipe output through a ring buffer (circular array, 200-sample depth per channel).
       Confirm < 5ms latency between sensor event and ring buffer write.

  1.4  Integrate barometer (via react-native-sensors barometric pressure API).
       Record ground-level baseline on first app launch with valid GPS fix.
       Compute and store baro_ground_pressure_hpa in AsyncStorage.

  1.5  Implement background GPS location writer.
       Use @mauron85/react-native-background-geolocation.
       Write to Redis via FastAPI endpoint every 60 seconds when accuracy < 50m.
       Implement SQLite queue for when network is unavailable.

  1.6  Build onboarding permission flow.
       One permission per screen, large text, plain language, elderly-optimized.
       Track which permissions were granted/denied in AsyncStorage.
       Show degradation warning banners for denied critical permissions.

  1.7  Build SOS contact management screen.
       Add/edit/remove up to 5 contacts. Pull from device address book.
       Store in AsyncStorage. Sync to backend user profile.

Deliverable: Sensor data flowing at 100Hz. Location cached to Redis every 60s.
             Onboarding complete. SOS contacts configured.
```

### Phase 2 — Calibration Engine (Week 2–3)

```
Goal: Build the 5-day passive calibration pipeline.

Tasks:
  2.1  Implement motion state classifier (Section 5.2) as a native module.
       Java/Kotlin (Android) implementation reading directly from SensorManager.
       State changes emitted to JS via event emitter (not polling).
       Target: < 2ms state transition detection latency.

  2.2  Implement calibration data collection.
       Collect acc_magnitude, gyr_magnitude, pitch, roll, step peaks
       during WALKING epochs. Write to SQLite calibration_raw table.

  2.3  Implement calibration analysis job.
       Runs after Day 2. Computes all personal threshold values.
       Writes to calibration_profile table in SQLite.

  2.4  Implement shadow mode detection.
       Run Stage 1 and 2 detection using draft thresholds.
       Log all shadow detections with full IMU snapshot.
       Build optional "Did anything unusual happen?" daily check-in UI.

  2.5  Implement recalibration trigger logic.
       Check gait drift on 7-day rolling window.
       Prompt user with plain-language recalibration suggestion.

  2.6  Implement calibration backup sync to backend.
       Encrypted, anonymized. Opt-in consent screen with plain explanation.

Deliverable: Calibration profile computed and stored for a test device.
             Shadow mode running and logging accurately.
             Personal thresholds differ measurably from defaults.
```

### Phase 3 — Fall Detection Pipeline (Week 3–4)

```
Goal: Full 5-stage fall detection running on-device.

Tasks:
  3.1  Implement Stage 1 and Stage 2 (free-fall + impact) in native module.
       Use personal_freefall_threshold and personal_impact_threshold from calibration.
       Emit FallCandidateDetected event to JS with IMU snapshot.

  3.2  Implement Stage 3 orientation assessment in JS/TypeScript.
       Compute pitch/roll delta from pre-fall vs post-impact orientation.
       Classify as fall-consistent or borderline.

  3.3  Implement Stage 4 post-impact monitoring.
       Monitor acc_magnitude variance every 500ms for 30 seconds.
       Classify recovery state: IMMEDIATE | DELAYED | IMMOBILE | PROGRESSIVE.

  3.4  Integrate TFLite fall classifier via react-native-fast-tflite.
       Load FARSEEING/SisFall pre-trained INT8 model on app start.
       Run inference on fall candidate trigger, not continuously.
       Verify < 30ms inference latency on mid-range Android device.

  3.5  Implement rule-based severity scorer (Section 6.1).
       Used as fallback when ML confidence < 0.60.

  3.6  Implement Stage 5 fusion: ML + rule + context (0.55 / 0.30 / 0.15 weights).

  3.7  Implement contextual environment detection (Section 5.5).
       Barometer-based floor index computation.
       Barometric ditch/staircase detection.
       Microphone-based ambient context (triggered post-fall, not continuous).
       BLE scan for density (market detection).

  3.8  Implement the False Alarm Gate (Sections 9.1–9.4).
       Throw-to-bed, throw-to-person detection.
       Surface softness classification from impact decay.
       Pre-event motion state gate.

Deliverable: End-to-end fall detection working on test device.
             False alarm gate vetted against throw/drop scenarios.
             Field test: 20 intentional falls, 20 throw/drop scenarios.
             Target: ≥ 18/20 falls detected, ≤ 2/20 throws false-alarmed.
```

### Phase 4 — Audio Confirmation and False Alarm Learning (Week 4–5)

```
Goal: User confirmation flow and adaptive false alarm suppression.

Tasks:
  4.1  Build fall confirmation UI.
       Full-screen overlay. Large green "I'M OK" button (200×200dp minimum).
       Countdown timer (react-native-reanimated smooth animation).
       notifee high-priority notification as full-screen intent (Android).

  4.2  Integrate react-native-tts for audio prompt.
       Force speaker volume to max. Play prompt immediately after vibration.
       Regional language support: English, Hindi, Telugu, Tamil, Kannada
       (language selection in user settings, defaults to device language).

  4.3  Integrate @react-native-voice/voice for "I'm fine" recognition.
       Offline speech recognition. No network dependency.
       Expand phrase dictionary: English + Hindi + regional equivalents.

  4.4  Implement false alarm fingerprint DB (Section 9.6).
       SQLite schema for imu_vector_2s storage.
       Cosine similarity matching at Stage 5.
       Confidence reduction logic when similarity > 0.88.

  4.5  Implement false alarm logging and recalibration trigger.
       If > 5 false alarms in 7 days → prompt user for recalibration.
       Aggregate sync (opt-in).

  4.6  Build False Alarm History screen in app.
       Shows: time, context, how it was cancelled, similarity score.
       User can mark any logged event as "actually a real fall" (retroactive).

Deliverable: Audio confirmation working. False alarm DB operational.
             Lab test: 15 false alarm scenarios, confirm all handled correctly.
```

### Phase 5 — Alert Dispatch and Backend (Week 5–6)

```
Goal: Full alert chain operational: SOS push, ETA tracking, 108, BLE.

Tasks:
  5.1  Scaffold Bun + Express backend.
       bun init in server/ directory. Install express, ioredis, bullmq,
       firebase-admin, twilio, socket.io, mongoose, zod.
       Configure bunfig.toml. Set up .env with Redis URL, MONGODB_URI,
       Firebase service account path, Twilio credentials.
       Implement all API endpoints (Section 4, Backend Services) in
       src/routes/. Use zod for request body validation on every route.
       Integrate ioredis client (src/services/redis.ts) for location
       cache reads and writes with the key schema from Section 8.
       Connect Mongoose in src/db/client.ts on app startup:
         mongoose.connect(process.env.MONGODB_URI)
       All five collections (Section Appendix B) defined as Mongoose
       schemas in src/db/models/. No migrations — schema changes apply
       immediately on next server start.

  5.2  Implement SOS alert dispatch (Section 7.2).
       Initialize firebase-admin with service account JSON in src/services/firebase.ts.
       FCM push via admin.messaging().sendEachForMulticast().
       On POST /api/v1/sos/dispatch, enqueue an alert-dispatch BullMQ job.
       alertWorker.ts dequeues and fires FCM. If no FCM ack in 15s,
       worker enqueues a twilio-sms fallback job automatically.
       Twilio WhatsApp message sent in the same worker alongside SMS.

  5.3  Build SOS contact receiver app flow.
       FCM notification handling when app is killed/backgrounded
       (@react-native-firebase/messaging background handler).
       Full-screen emergency view with map pin.
       "I'm heading there" → device connects to socket.io room
       /fall/live/:eventId and begins emitting location every 10s.
       Server etaWorker.ts picks up the location stream, computes
       haversine ETA, emits eta_update back to the room.
       "I've reached them" → POST /api/v1/sos/resolve → server emits
       sos_arrived to the room, closes the BullMQ eta-monitor job.
       Resolution updates the FallEvent Mongoose document:
         FallEvent.findByIdAndUpdate(eventId, { resolvedAt: new Date(),
           'alertChain.resolution': 'SOS_ARRIVED' })

  5.4  Implement ETA computation and decision logic (Section 7.3).
       etaWorker.ts runs as a BullMQ repeatable job every 60 seconds
       per active event. Reads SOS contact location from the socket.io
       room state. Computes haversine distance in TypeScript (no lib needed,
       ~10 lines). Infers drive vs walk from distance. Applies ETA thresholds
       for MINOR and SEMI_MAJOR from Section 7.3. If ETA drift detected
       (contact not moving toward user for 2 consecutive checks), worker
       enqueues an escalation job immediately.

  5.5  Implement 108 integration (Section 7.4).
       Device-side: react-native-communications auto-dial as Layer 1.
       Backend Layer 3 fallback: escalationWorker.ts dequeues escalation
       job and calls twilio.calls.create({ to: '108', twiml: <Say> TwiML
       with the pre-scripted emergency message + GPS + floor level }).
       escalationWorker fires only if device signals call failure via
       POST /api/v1/sos/dispatch with { layer1_failed: true } or if
       no device acknowledgment arrives within 10s of escalation trigger.
       Log call SID, timestamp, and layer used to DB for every 108 attempt.

  5.6  Implement BLE broadcast (Section 7.5).
       Device-side: react-native-ble-advertiser starts advertisement on
       fall confirmation. Custom manufacturer ID packet encoding per
       the byte layout in Section 7.5.
       Server-side community responder push (Section 12 suggestion):
       escalationWorker queries MongoDB for all users whose last cached
       location is within 200m of the fallen user using a 2dsphere
       geospatial index on the User collection's lastLocation field:
         User.find({ lastLocation: { $near: { $geometry: { type: 'Point',
           coordinates: [lng, lat] }, $maxDistance: 200 } } })
       The User.lastLocation field is updated on every 60s Redis write
       so both Redis (fast TTL cache) and MongoDB (geospatial query) stay
       in sync. Redis handles the low-latency lookup; MongoDB handles the
       spatial fan-out query.
       Fires FCM push to those nearby devices as a server-driven
       complement to BLE, covering outdoor range beyond BLE reach.

  5.7  Implement full escalation state machine in Zustand (device-side).
       State: IDLE → CANDIDATE → CONFIRMING → ALERTING → ESCALATING → RESOLVED.
       Every transition emits a log entry to op-sqlite and a POST to
       /api/v1/fall/event with the current state and timestamp.
       Server mirrors the state in Redis key user:{userId}:fall:active
       so any connected SOS contact app always reflects the live status.
       Mongoose writes the finalized FallEvent document on RESOLVED
       transition using FallEvent.create() or findByIdAndUpdate().

Deliverable: Full alert chain tested end-to-end with 3 test devices.
             SOS contact receives push in < 5 seconds.
             108 auto-dial fires correctly for MAJOR event.
             BLE detected on nearby device within 10 seconds.
```

### Phase 6 — Integration with PathSense Core (Week 6–7)

```
Goal: FallSense and PathSense share infrastructure cleanly.

Tasks:
  6.1  Integrate FallSense IMU consumer with PathSense IMU ring buffer.
       Both consumers read the same buffer without blocking each other.

  6.2  Integrate Safety Supervisor injection.
       When fall confirmed → PathSense navigation output halts.
       Resume navigation after event resolved.

  6.3  Integrate MiDaS depth estimation for post-fall context.
       Triggered on-demand, not continuously. Reuse existing inference pipeline.

  6.4  Integrate shared GPS preprocessor output.
       FallSense uses PathSense GPS output instead of running a separate GPS reader.

  6.5  Unified local event log.
       FallSense events appear in PathSense event log.
       Consistent log format across both modules.

Deliverable: Both modules running simultaneously with no performance regression.
             Navigation guidance unaffected during non-fall periods.
             Latency budget verified: fall detection adds < 2ms overhead to navigation loop.
```

### Phase 7 — Field Testing, Hardening, and Threshold Tuning (Week 7–9)

```
Goal: Real-world validation. Reduce false alarm rate. Tune thresholds.

Tasks:
  7.1  Controlled fall study.
       Recruit 5–10 test participants of varying ages.
       Perform staged falls: forward, sideways, backward, staircase.
       Phone in pocket, in hand, in chest mount.
       Measure: detection rate, severity accuracy, false alarm rate.

  7.2  Daily use false alarm measurement.
       Deploy to 5–10 elderly users for 2 weeks.
       Measure: false alarms per user per day in normal activity.
       Target: < 1 per week per user.

  7.3  Alert latency measurement.
       Time from fall impact to SOS contact receiving push notification.
       Target: < 10 seconds end-to-end.
       Time from fall decision to 108 dial: < 3 seconds.

  7.4  Connectivity edge case testing.
       Fall with no network → SQLite queue → flush on reconnect.
       Fall with GPS unavailable → Redis cached location used.
       Fall with phone face-down → confirm audio confirmation audible.

  7.5  Threshold adjustment from field data.
       Use shadow mode logs + participant feedback.
       Adjust personal_impact_threshold and personal_freefall_threshold.
       Update default fallback thresholds from aggregate data.

  7.6  Battery impact measurement.
       Measure battery drain over 8 hours of background operation.
       Target: < 3% additional battery usage per hour vs baseline.
       Optimize sensor polling rate if target exceeded.

Deliverable: Detection rate ≥ 90% on controlled falls.
             False alarm rate ≤ 1 per user per week.
             Alert latency < 10 seconds.
             Battery overhead < 3%/hr.
```

### Phase 8 — Accessibility, Localization, and Production Release (Week 9–10)

```
Goal: App is ready for elderly users in the Indian market.

Tasks:
  8.1  Accessibility audit.
       Minimum touch target: 48×48dp (Google standard), 60×60dp for critical buttons.
       Minimum font size: 18sp for body text, 24sp for alerts.
       High contrast mode support.
       Screen reader (TalkBack/VoiceOver) compatibility.

  8.2  Localization.
       UI: English, Hindi, Telugu, Tamil, Kannada, Bengali, Marathi.
       Fall confirmation audio prompts in all 7 languages.
       Language auto-detected from device locale. User can override in settings.

  8.3  Setup wizard for elderly users.
       Guided 5-step setup: name, language, SOS contacts, permissions, calibration.
       Voiceover reads every screen. Large back/next buttons.
       "Help" button on every screen opens a 30-second video guide.

  8.4  Privacy and data compliance.
       DPDP Act (India Digital Personal Data Protection Act 2023) compliance.
       GDPR compliance for potential international users.
       Privacy policy in plain language, in-app, in local language.
       Explicit consent for: location background, audio, aggregate data sync.

  8.5  App store submission.
       Google Play: health & fitness category, medical device disclaimer.
       Apple App Store: health utility, privacy nutrition labels.

  8.6  Post-launch monitoring.
       Sentry error tracking in React Native.
       Backend: Grafana dashboards for alert volumes, latency, error rates.
       Weekly false alarm aggregate review.

Deliverable: App store published. 100 initial users. Monitoring active.
```

---

## 12. External Suggestions and Open Questions

### Suggested External Integrations

```
1. Wear OS / Apple Watch (Future Phase)
   A companion app on the user's smartwatch provides a far more reliable fall
   detection signal — the watch is wrist-mounted and follows body motion closely.
   Heart rate data (sudden spike or flatline post-fall) adds a critical biometric
   severity signal. The phone app becomes the alert dispatcher; the watch is the
   primary sensor. Strongly recommended as a Phase 2 product extension.

2. UPI-Linked Emergency Pre-Auth (India-Specific)
   For cases where 108 response requires transport costs (some rural areas),
   a pre-authorized small UPI payment can facilitate faster response from
   local transport. Explored as a partnership feature, not a product-core feature.

3. NEMS / Unified Emergency Response API
   The National Emergency Management System and several state-level 112/108
   platforms are developing API access. Track: PSAP (Public Safety Answering Point)
   API availability via the Ministry of Home Affairs and TRAI.
   When available, replace Twilio call with a structured API dispatch that
   carries GPS coordinates and patient status in structured form rather than
   relying on a TTS voice message.

4. On-Device Sound Classification Model
   A lightweight ambient audio classifier (MobileNet Audio or YAMNet-Tiny quantized
   to TFLite INT8) would replace the heuristic-based audio context detection.
   Trained on: bathroom echo, market noise, road traffic, rainfall, silence.
   Inference on the 3-second post-fall clip in < 50ms.
   This improves context detection accuracy meaningfully and is worth including
   in Phase 3 or 4 as an optional upgrade to the rule-based audio analysis.

5. Community Responder Network
   Extend the BLE broadcast concept to a server-side "nearby responder" push.
   When a fall is detected, the backend sends a push to all app-installed devices
   within a 200m radius (computed from last known GPS of both parties).
   This does NOT require BLE range — it works on GPS proximity via the server.
   Faster and more reliable than BLE, especially outdoors.
   Requires: user opt-in to "community responder" mode in settings.
   Privacy: responders see only: direction, distance (not exact location), severity.
```

### Open Questions to Resolve Before Phase 3

```
Q1. Fall dataset availability for Indian elderly users
    FARSEEING and SisFall are predominantly Western/younger populations.
    Is there access to Indian elderly fall data for fine-tuning the TFLite model?
    If not: consider recording a small controlled dataset during Phase 7
    field testing and fine-tuning the model before production release.

Q2. iOS background sensor access limits
    iOS restricts background sensor access more aggressively than Android.
    The Core Motion framework can deliver background accelerometer updates,
    but only when an active background location session is running.
    Confirm: is the location background mode (which the app requires) sufficient
    to piggyback Core Motion sensor access, or is a separate entitlement needed?
    Test on physical iOS device — simulator does not reflect background limits.

Q3. 108 call behavior when phone is locked
    On Android, Linking.openURL('tel:108') from a foreground service on a locked
    screen requires the CALL_PHONE permission AND may show a confirmation dialog
    on some OEM ROMs (Samsung One UI, Xiaomi MIUI). Test on the top 5 OEM ROMs
    used in the Indian market. May need native intent with FLAG_ACTIVITY_NEW_TASK.

Q4. BLE Advertising on Android 12+ background restriction
    Android 12 added stricter BLE advertising limits from background.
    Confirm that advertising from within the foreground service context
    (not a background service) bypasses this restriction.
    If not: advertising must be initiated from the foreground service notification
    action, which keeps it technically in foreground scope.

Q5. Calibration accuracy for pocket vs hand carry
    The calibration phase infers carry posture from pitch/roll distribution.
    Many elderly users switch between carrying modes (pocket in morning,
    hand in market). Consider: detect carry posture in real-time and apply
    the appropriate threshold set dynamically per-session rather than using
    a single calibrated posture.

Q6. False alarm rate in specific activities
    Activities that may produce high false alarm rates for elderly users:
    - Sitting down hard on a chair (impact + orientation change)
    - Lying down on a bed deliberately (slow orientation change, no real impact)
    - Getting into/out of a car (orientation change + possible impact)
    - Doing puja/bending down repeatedly (orientation change cycles)
    Each of these should be tested explicitly in Phase 7 with elderly participants
    and, if needed, added as suppression patterns in the false alarm gate.
```
