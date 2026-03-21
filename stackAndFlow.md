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
Runtime             Python 3.11 + FastAPI (async)
                    Consistent with existing PathSense ML stack.
                    All model inference dependencies (PyTorch, ONNX) are
                    already in the same ecosystem.

Task Queue          Celery 5 + Redis broker
                    Async dispatch of SOS alerts, ETA polling, and
                    escalation timers. Celery beat handles scheduled jobs.

Location Cache      Redis 7
                    TTL-based last-known location store.
                    See Section 8 for full key schema and TTL strategy.

Database            PostgreSQL 15
                    User profiles, SOS contact lists, fall event history,
                    per-device calibration backup, anonymized false alarm
                    aggregate data for model improvement.

Push                Firebase Admin SDK (Python)
                    Server-side FCM dispatch to SOS contact devices.

SMS / Call          Twilio Python SDK
                    Fallback SMS to SOS contacts if FCM push fails.
                    Programmatic call to 108 for MAJOR fall events.
                    WhatsApp Business API via Twilio for SOS contact
                    alerts (high open-rate in Indian user base).

Containerization    Docker + Docker Compose
                    Services: api, redis, postgres, celery-worker,
                    celery-beat, nginx-proxy

API Surface
  POST  /api/v1/location/cache        Receive 60s location ping from device
  POST  /api/v1/fall/event            Receive confirmed fall event + sensor snapshot
  POST  /api/v1/sos/dispatch          Trigger alert dispatch to SOS contacts
  POST  /api/v1/sos/eta               Receive ETA update from SOS contact device
  POST  /api/v1/sos/resolve           Mark event resolved or false alarm
  GET   /api/v1/fall/history/:userId  Fetch fall event history
  WS    /api/v1/fall/live/:eventId    Real-time event tracking socket during active event
```

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
                                         "I'm OK" voice confirmation listening (8s).
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
  Orientation change > 45° in at least one axis (pitch OR roll)

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
                        → Hard escalation trigger regardless of ML output.
                        Advance immediately to Stage 5 without waiting.

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

Final Severity Fusion:
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
