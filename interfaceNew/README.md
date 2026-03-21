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

### 5) Backend API integration hardening

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

### 4) Frontend pre-filter + local safe-pattern memory (pending)

- Add an additional frontend filtering gate before calling the backend fall API.
- Use actual runtime metrics already produced by the sensor pipeline:
  - `motionScore`
  - `accelMagnitude`
  - `gyroMagnitude`
  - `motionState`
  - `orientationChange`
  - recent snapshot window patterns (not only the latest sample)
- Define a two-stage frontend gate:
  - **Stage A (safe reject):** suppress backend call for clearly safe profiles (for example pocket idle, stable bed/table placement, high-rotation shake without impact).
  - **Stage B (possible fall):** only call backend when impact + orientation + motion pattern indicates a genuine fall candidate.
- Add local comparison against pre-saved "known safe" events:
  - When user confirms they were okay after a suspected fall, persist a compact local signature from that snapshot (derived metrics + temporal shape).
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
