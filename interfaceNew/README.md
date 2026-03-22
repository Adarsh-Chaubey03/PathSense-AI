
npm run android 

for android start


## PathSense interfaceNew

Expo Router app for live fall monitoring, confirmation flow, backend escalation, and demo-ready telemetry capture.

## Quick start

```bash
npm install
npx expo start
```

## What is implemented so far

### 1) App flow and routing

- Monitoring -> Confirm -> Alert -> Result flow is implemented.
- Settings screen is active and now fetches emergency contacts from backend.
- Redundant Explore tab/route was removed.

Key files:

- `app/monitoring.tsx`
- `app/confirm.tsx`
- `app/alert.tsx`
- `app/result.tsx`
- `app/settings.tsx`

### 2) Fall event state machine

- Shared fall-event state transitions are wired across screens.
- Local persistence/hydration support is in place for resume behavior.

Key files:

- `src/state/fall-event-store.ts`
- `src/state/use-fall-event.ts`
- `src/bootstrap/index.ts`

### 3) Real sensor telemetry integration (ported from legacy interface)

- Real accelerometer + gyroscope adapter implemented with continuous sampling.
- Rich sample model now includes:
  - `accelerometer` xyz
  - `gyroscope` xyz
  - `accelMagnitude`
  - `gyroMagnitude`
  - `motionState`
  - `motionScore`
  - `orientationChange`
  - `timestampMs`
  - `sampleRateHz`
  - `source`
- Snapshot ring-buffer support added for event-window uploads.

Key files:

- `src/services/sensors/sensor-adapter.ts`
- `src/services/sensors/sensor-real.ts`
- `src/services/sensors/sensor-mock.ts`
- `src/services/index.ts`

### 4) False-positive reduction guardrails

- Candidate filtering now rejects common non-fall patterns before escalation:
  - Bed-like stationary placement profile
  - High-rotation shake without strong impact
  - Insufficient impact magnitude

Key file:

- `src/features/fall-event/detection.ts`

### 5) Edge AI Fall Detection Filter (NEW)

Real-time physics-based filtering on the frontend to minimize unnecessary backend API calls. Only high-confidence fall patterns are escalated.

#### How It Works

The edge filter maintains a **sliding window of 20 sensor samples** (~1 second at 20 Hz) and applies physics-based rules:

```
Sensor Data → Edge Filter → Window Analysis → Physics Check → Decision
                              ↓
                    [20 samples sliding window]
                              ↓
                    Compute: min_acc, max_acc, max_gyro
                              ↓
                    All 3 conditions met?
                              ↓
                    YES → CALL_API (navigate to confirm)
                    NO  → IGNORE (continue monitoring)
```

#### Fall Detection Constraints

| Condition | Threshold | Description |
|-----------|-----------|-------------|
| **Free Fall** | `min_acc < 0.5g` | Minimum acceleration in window must drop below 0.5g (indicating free fall phase) |
| **Impact** | `max_acc > 2.5g` | Maximum acceleration must spike above 2.5g (indicating ground impact) |
| **Rotation** | `max_gyro > 2.5 rad/s` | Maximum gyroscope magnitude must exceed 2.5 rad/s (indicating body rotation) |

**All three conditions must be satisfied simultaneously** within the sliding window to trigger a fall detection.

#### Safety Rules

- **Cooldown:** 3-second cooldown between API calls to prevent duplicate alerts
- **Stable readings ignored:** Normal ~1g readings are filtered out
- **Gradual movements ignored:** Walking, sitting, phone handling do not trigger
- **Spike without drop ignored:** Sudden impact without prior free fall phase is rejected

#### Sensor Data Caching for API

When a fall is detected, the system captures a **2-second window of raw sensor data** for the backend ML model:

```typescript
interface RawSensorDataPoint {
  acc_x: number;   // Accelerometer X (m/s²)
  acc_y: number;   // Accelerometer Y (m/s²)
  acc_z: number;   // Accelerometer Z (m/s²)
  gyro_x: number;  // Gyroscope X (rad/s)
  gyro_y: number;  // Gyroscope Y (rad/s)
  gyro_z: number;  // Gyroscope Z (rad/s)
  timestamp: number;
}
```

This data is sent to the backend via `sensorWindow` field in the API payload for ML model inference.

#### Key Files

- `src/features/fall-event/edge-filter.ts` - Core edge AI filter logic
- `src/features/fall-event/detection.ts` - Detection interface
- `src/services/sensors/sensor-window-store.ts` - 2-second raw data cache
- `app/monitoring.tsx` - Real-time monitoring with edge filter

### 6) Backend API integration hardening

- Confirm flow submits full telemetry payload + recent snapshot window to backend.
- API client now enforces a 15-second timeout.
- Alert dispatch screen shows backend success/failure and recipient counts.
- Dedicated contacts API wrapper is in use.

Key files:

- `src/services/api/client.ts`
- `src/services/api/fall-events.ts`
- `src/services/api/contacts.ts`
- `app/confirm.tsx`
- `app/alert.tsx`

### 6) Permissions + voice runtime

- Bootstrap now requests app permissions without blocking startup.
- Sensor availability checks are included.
- Voice prompts are now spoken via `expo-speech` instead of console logs.

Key files:

- `src/services/permissions/permissions.ts`
- `src/services/feedback/voice.ts`
- `src/bootstrap/index.ts`

## Backend changes already integrated (project-level)

### Fall API contract + persistence

- `/api/fall-event` expanded to validate richer telemetry fields.
- Fall events are persisted to `server/src/data/fall-events.json`.
- Debug endpoint added: `GET /api/fall-events/recent?limit=25`.

### Alerting reliability

- `/api/contacts/alert` now uses real contact manager dispatch results.
- SMS service supports `DEMO_MODE` and retry logic.
- `sosTriggered` reflects real dispatch success outcome.

## What is still remaining

### 1) Runtime smoke verification (pending)

- Validate online fall flow end-to-end (`POST /api/fall-event`).
- Validate online contacts alert dispatch (`POST /api/contacts/alert`).
- Validate backend-offline fallback behavior in confirm/alert flow.

### 2) Calibration pass (pending)

- Run scenario matrix and tune thresholds using persisted event data:
  - pocket idle
  - walking
  - random shake
  - bed/table placement
  - controlled drop simulation

### 3) README close-out notes (pending)

- Add measured threshold values after calibration.
- Add final “demo run checklist” with expected outcomes/screens.

### 4) Frontend pre-filter + local safe-pattern memory (DONE ✓)

- ✅ Added edge AI filter with sliding window analysis (20 samples)
- ✅ Physics-based detection: free fall (<0.5g) + impact (>2.5g) + rotation (>2.5 rad/s)
- ✅ 3-second cooldown between API calls
- ✅ Real-time filtering on monitoring screen
- ⏳ Local comparison against pre-saved “known safe” events (future enhancement)

### 5) Sensor data caching for API calls (DONE ✓)

- ✅ Store accelerometer readings (acc_x, acc_y, acc_z) in memory cache
- ✅ Store gyroscope readings (gyro_x, gyro_y, gyro_z) in memory cache
- ✅ Maintain 2-second sliding window of raw sensor data
- ✅ Auto-expire old samples (>2 seconds)
- ✅ Send cached sensor window with fall event API payload
- ✅ Backend receives `sensorWindow.samples[]` for ML model input

Key files:
- `src/services/sensors/sensor-window-store.ts` - In-memory sensor cache
- `src/services/api/fall-events.ts` - API payload with sensorWindow field

### 6) Future enhancements (pending)

- Add local comparison against pre-saved “known safe” events:
  - When user confirms they were okay after a suspected fall, persist a compact local signature.
  - On future candidates, compare current snapshot signature against locally stored safe signatures.
  - If similarity is high, suppress API call and continue monitoring.
- Add explicit suppression reason logging for each filtered candidate:
  - `safe_profile_gate`
  - `known_safe_signature_match`
  - `insufficient_impact_or_orientation`

## Validation status so far

- `interfaceNew`: lint clean (`npm run lint`)
- `server`: TypeScript build clean (`npm run build`)

## Useful commands

### Frontend

```bash
cd interfaceNew
npm install
npx expo start
npm run lint
```

### Backend

```bash
cd server
npm install
npm run build
npm run dev:node
```
