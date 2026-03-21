# PathSense-AI `interfaceNew` App Scope

This document defines the **technical architecture and implementation plan** for the new app being built in `interfaceNew`.

The goal is to build a **clean, operational frontend shell first**, then progressively connect it to sensors, backend services, and ML/model outputs without destabilizing the app.

---

## 1. Technical objective

`interfaceNew` is the new mobile app workspace for the FallSense flow inside PathSense-AI.

This app should eventually support:

- device-side monitoring
- fall candidate creation
- user confirmation flow
- alert payload creation
- backend event dispatch
- event status tracking
- later: sensors, voice, haptics, GPS, background behavior, and model-assisted decisions

For now, the app must be designed so that it can grow into that system **without requiring a rewrite**.

---

## 2. Technical constraints and design principles

### Constraints
- `interfaceNew` is currently an Expo app scaffold
- some code in `interface` may be reusable, but we should not depend on unstable or unclear parts
- changes must be made incrementally
- the app must stay runnable after every small change
- initial versions should not depend on full backend readiness
- initial versions should not depend on full sensor/native integration

### Principles
- keep domain logic separate from UI
- keep app flow separate from sensor implementation
- keep backend contracts isolated behind service functions
- prefer mockable interfaces
- use simple modules first
- avoid importing old complexity from `interface`
- structure files according to responsibilities, not temporary hacks

---

## 3. App responsibility boundaries

The frontend app in `interfaceNew` is responsible for:

- rendering the user flow
- managing app-level fall event state
- coordinating confirmation and alert UX
- gathering device-side input when available
- constructing event payloads for the backend
- showing event progression to the user
- caching lightweight local state needed for UX continuity

The frontend app is **not** responsible for:

- long-term event analytics
- queue workers
- location cache persistence across system services
- push notification fan-out
- ETA computation for contacts
- server-side escalation decisions
- model training
- final backend source of truth

---

## 4. High-level architecture

The app should be organized into the following layers:

1. **Routing / screen layer**
   - screen entry points
   - navigation composition
   - user-visible flow

2. **UI component layer**
   - presentational components
   - buttons, cards, banners, timers, indicators

3. **Feature layer**
   - monitoring feature
   - confirmation feature
   - alert feature
   - event history feature later

4. **State layer**
   - fall event state machine
   - app session state
   - derived view state

5. **Service layer**
   - backend API client
   - sensor adapter
   - location adapter
   - haptics adapter
   - voice adapter
   - local storage adapter

6. **Domain layer**
   - types
   - event schemas
   - status enums
   - payload builders
   - state transition rules

7. **Utility layer**
   - date/time formatting
   - ID generation
   - validation helpers
   - countdown helpers

---

## 5. Recommended folder structure

The current Expo router structure can be kept, but the app should grow into a structure like this:

```text
interfaceNew/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── monitoring.tsx
│   ├── confirm.tsx
│   ├── alert.tsx
│   ├── result.tsx
│   └── settings.tsx
│
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── AppButton.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── ScreenContainer.tsx
│   │   │   ├── SectionCard.tsx
│   │   │   └── CountdownTimer.tsx
│   │   ├── monitoring/
│   │   │   ├── MonitoringStatusCard.tsx
│   │   │   ├── SensorStatusCard.tsx
│   │   │   └── ManualTriggerCard.tsx
│   │   ├── confirmation/
│   │   │   ├── ConfirmationPrompt.tsx
│   │   │   ├── ImOkButton.tsx
│   │   │   └── ConfirmationCountdown.tsx
│   │   ├── alert/
│   │   │   ├── AlertSummaryCard.tsx
│   │   │   ├── DispatchStatusCard.tsx
│   │   │   └── EmergencyActionsCard.tsx
│   │   └── result/
│   │       ├── EventResultCard.tsx
│   │       └── ResetActionsCard.tsx
│   │
│   ├── features/
│   │   ├── monitoring/
│   │   │   ├── monitoring.logic.ts
│   │   │   ├── monitoring.types.ts
│   │   │   └── monitoring.constants.ts
│   │   ├── fall-event/
│   │   │   ├── event.logic.ts
│   │   │   ├── event.types.ts
│   │   │   ├── event.builders.ts
│   │   │   └── event.constants.ts
│   │   ├── confirmation/
│   │   │   ├── confirmation.logic.ts
│   │   │   └── confirmation.types.ts
│   │   └── alert/
│   │       ├── alert.logic.ts
│   │       ├── alert.types.ts
│   │       └── alert.constants.ts
│   │
│   ├── services/
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── fall-events.ts
│   │   │   ├── sos.ts
│   │   │   └── health.ts
│   │   ├── sensors/
│   │   │   ├── sensor-adapter.ts
│   │   │   ├── sensor-mock.ts
│   │   │   └── sensor-types.ts
│   │   ├── location/
│   │   │   ├── location-adapter.ts
│   │   │   ├── location-mock.ts
│   │   │   └── location-types.ts
│   │   ├── feedback/
│   │   │   ├── haptics.ts
│   │   │   ├── voice.ts
│   │   │   └── feedback.types.ts
│   │   ├── storage/
│   │   │   ├── local-store.ts
│   │   │   └── storage-keys.ts
│   │   └── diagnostics/
│   │       └── logger.ts
│   │
│   ├── state/
│   │   ├── app-state.ts
│   │   ├── fall-event-store.ts
│   │   ├── reducers/
│   │   │   └── fall-event.reducer.ts
│   │   └── selectors/
│   │       └── fall-event.selectors.ts
│   │
│   ├── domain/
│   │   ├── fall-event.ts
│   │   ├── severity.ts
│   │   ├── sensor.ts
│   │   ├── location.ts
│   │   ├── user.ts
│   │   └── api-contracts.ts
│   │
│   ├── hooks/
│   │   ├── useMonitoring.ts
│   │   ├── useConfirmation.ts
│   │   ├── useAlertFlow.ts
│   │   └── useAppBootstrap.ts
│   │
│   ├── constants/
│   │   ├── colors.ts
│   │   ├── spacing.ts
│   │   ├── typography.ts
│   │   ├── app.ts
│   │   └── timing.ts
│   │
│   ├── utils/
│   │   ├── ids.ts
│   │   ├── dates.ts
│   │   ├── countdown.ts
│   │   ├── validation.ts
│   │   └── maps.ts
│   │
│   └── config/
│       ├── env.ts
│       └── feature-flags.ts
│
└── APP_SCOPE.md
```

---

## 6. Routing strategy

Because `interfaceNew` uses Expo Router, the app flow should be implemented as route-driven screens.

### Recommended initial routes
- `app/index.tsx`
  - landing / home
- `app/monitoring.tsx`
  - active monitoring screen
- `app/confirm.tsx`
  - fall confirmation screen
- `app/alert.tsx`
  - alerting / dispatch screen
- `app/result.tsx`
  - final result / resolved / false alarm screen
- `app/settings.tsx`
  - settings later

### Why route-driven screens
- easier to reason about app flow
- easier to test each state visually
- easier to keep UI modular
- easier to attach route params while prototyping

### Route params likely needed later
- `eventId`
- `status`
- `source`
- `severity`
- `triggerMode`

---

## 7. Core app state model

The app should revolve around a **fall event state machine**.

### Primary statuses
- `idle`
- `monitoring`
- `candidate`
- `confirming`
- `alerting`
- `resolved`
- `false_alarm`
- later:
  - `dispatch_failed`
  - `escalating`
  - `backend_pending`

### Suggested state shape
```ts
type FallAppStatus =
  | 'idle'
  | 'monitoring'
  | 'candidate'
  | 'confirming'
  | 'alerting'
  | 'resolved'
  | 'false_alarm';

interface FallEventState {
  eventId: string | null;
  status: FallAppStatus;
  triggerMode: 'manual' | 'sensor' | null;
  severity: 'unknown' | 'minor' | 'semi_major' | 'major';
  startedAt: string | null;
  candidateDetectedAt: string | null;
  confirmationStartedAt: string | null;
  alertStartedAt: string | null;
  resolvedAt: string | null;
  isUserSafe: boolean | null;
  confirmationCountdownSeconds: number;
  lastKnownLocation: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    label: string | null;
  };
  dispatch: {
    attempted: boolean;
    success: boolean | null;
    error: string | null;
  };
}
```

### State management recommendation
Start simple:
- React context + reducer

Later, if complexity grows:
- move to a dedicated state library

### Why not over-engineer first
The first goal is operational correctness of flow, not maximum abstraction.

---

## 8. Frontend feature modules

### 8.1 Monitoring feature
Responsibilities:
- enter monitoring mode
- display monitoring state
- trigger manual candidate for testing
- later attach to sensor adapter

Files:
- `features/monitoring/monitoring.logic.ts`
- `hooks/useMonitoring.ts`
- `components/monitoring/*`

### 8.2 Fall event feature
Responsibilities:
- create event IDs
- initialize event state
- build local event records
- manage state transitions

Files:
- `features/fall-event/event.logic.ts`
- `features/fall-event/event.builders.ts`
- `domain/fall-event.ts`
- `state/fall-event-store.ts`

### 8.3 Confirmation feature
Responsibilities:
- start confirmation timer
- allow user cancellation
- handle timeout
- later attach voice/haptic prompts

Files:
- `features/confirmation/confirmation.logic.ts`
- `hooks/useConfirmation.ts`
- `components/confirmation/*`

### 8.4 Alert feature
Responsibilities:
- construct backend payload
- call dispatch endpoint
- update dispatch state
- show success/failure
- later support retries and escalation

Files:
- `features/alert/alert.logic.ts`
- `hooks/useAlertFlow.ts`
- `services/api/fall-events.ts`
- `services/api/sos.ts`

---

## 9. Service layer design

The service layer must isolate all external dependencies.

### 9.1 API service
Purpose:
- centralize backend URL usage
- centralize request/response typing
- make mocking easy

Files:
- `services/api/client.ts`
- `services/api/fall-events.ts`
- `services/api/sos.ts`
- `services/api/health.ts`

### 9.2 Sensor service
Purpose:
- abstract current or future sensor sources
- allow the app to work even with mocked detection first

Files:
- `services/sensors/sensor-adapter.ts`
- `services/sensors/sensor-mock.ts`
- `services/sensors/sensor-types.ts`

Initial implementation:
- manual trigger only
- optional fake sensor status values

Later:
- actual accelerometer / motion source

### 9.3 Location service
Purpose:
- expose last known location
- remain mockable until real location access is added

Files:
- `services/location/location-adapter.ts`
- `services/location/location-mock.ts`
- `services/location/location-types.ts`

Initial implementation:
- fixed mock location or unavailable state

Later:
- real GPS / Expo location integration
- backend cache write support

### 9.4 Feedback service
Purpose:
- isolate haptics and voice behavior

Files:
- `services/feedback/haptics.ts`
- `services/feedback/voice.ts`

Initial implementation:
- no-op or minimal mock

Later:
- actual haptics
- TTS prompts
- confirmation alerts

### 9.5 Storage service
Purpose:
- local persistence for session continuity

Files:
- `services/storage/local-store.ts`
- `services/storage/storage-keys.ts`

Likely stored values:
- onboarding-complete flag later
- last event snapshot
- last monitoring state
- settings

---

## 10. Domain models

The domain layer should define the frontend source-of-truth types.

### 10.1 Fall event domain model
Needs to include:
- event ID
- status
- trigger mode
- severity
- timestamps
- confirmation result
- location snapshot
- dispatch state

### 10.2 Severity model
Initial values:
- `unknown`
- `minor`
- `semi_major`
- `major`

Initial behavior:
- use placeholder or manual severity

Later behavior:
- determined from rules and/or model output

### 10.3 Sensor snapshot model
Initial:
- optional and mostly mocked

Later:
- accelerometer summary
- gyroscope summary
- confidence
- trigger reason

### 10.4 API contract model
Separate frontend app types from backend storage types where necessary, but align naming early.

---

## 11. Backend interaction plan

The app should be built as if it will talk to the backend, even if early versions use mocks.

### Expected backend interaction points
1. health check
2. create fall event
3. dispatch SOS alert
4. update event status
5. resolve event
6. later:
   - location cache write
   - fall history fetch
   - contact sync
   - escalation status tracking

### Suggested frontend API modules
- `health.ts`
- `fall-events.ts`
- `sos.ts`

### Recommended request progression
#### Phase 1
- no real backend dependency
- build payloads locally
- display payload on screen

#### Phase 2
- optional health check on app start
- send mock or real create-event request

#### Phase 3
- send dispatch request
- handle response state
- allow resolve/reset

---

## 12. Proposed frontend-to-backend flow

### Current MVP-oriented app flow
1. user opens app
2. app shows `idle`
3. user starts monitoring
4. app enters `monitoring`
5. manual test trigger creates local event
6. app enters `candidate`
7. app enters `confirming`
8. user either:
   - presses `I'M OK` -> `false_alarm`
   - does nothing -> `alerting`
9. app builds alert payload
10. app sends or simulates dispatch to backend
11. app shows result
12. app can reset or resolve

### Later production-oriented flow
1. device monitoring starts
2. sensor adapter detects fall candidate
3. frontend event store creates event
4. confirmation flow begins
5. location snapshot attached
6. optional voice/haptic prompts started
7. if user cancels:
   - mark false alarm locally
   - optionally sync to backend
8. if user does not cancel:
   - create / update fall event in backend
   - request SOS dispatch
   - receive backend acknowledgement
   - display dispatch state
9. later:
   - escalation state updates
   - resolution state sync

---

## 13. Model and ML integration points

The frontend app should be prepared for model-assisted behavior later, but should not depend on it now.

### Model sources expected later
- on-device rule-based candidate scoring
- on-device ML classifier
- backend-enriched severity/context data

### Integration point in frontend
The frontend should only consume **normalized outputs**, not model internals.

Example normalized shape:
```ts
interface DetectionDecision {
  candidate: boolean;
  confidence: number;
  severity: 'minor' | 'semi_major' | 'major' | 'unknown';
  reason: string;
}
```

### Where this should plug in
- `services/sensors/sensor-adapter.ts`
- `features/fall-event/event.builders.ts`
- `domain/fall-event.ts`

### Rule
The UI should react to a detection decision, not care whether it came from:
- manual trigger
- rules
- model
- backend suggestion

---

## 14. Data contracts the frontend should prepare for

Even if the backend is not finalized, the app should expect to work with payloads like these.

### 14.1 Create fall event payload
```ts
interface CreateFallEventPayload {
  eventId: string;
  source: 'manual' | 'sensor';
  severity: 'unknown' | 'minor' | 'semi_major' | 'major';
  timestamps: {
    startedAt: string;
    candidateDetectedAt?: string;
    confirmationStartedAt?: string;
    alertStartedAt?: string;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    label?: string | null;
  };
  deviceContext: {
    platform: string;
    appVersion?: string;
  };
}
```

### 14.2 Dispatch SOS payload
```ts
interface DispatchSosPayload {
  eventId: string;
  severity: 'minor' | 'semi_major' | 'major' | 'unknown';
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    label?: string | null;
  };
  confirmation: {
    userCancelled: boolean;
    timedOut: boolean;
  };
}
```

### 14.3 Resolve event payload
```ts
interface ResolveEventPayload {
  eventId: string;
  resolution: 'false_alarm' | 'user_safe' | 'resolved';
  resolvedAt: string;
}
```

---

## 15. Reuse plan from `interface`

Only selective reuse should happen.

### Safe to reuse early
- visual constants
- color tokens
- spacing / typography ideas
- simple stateless UI components
- status indicator patterns
- plain TypeScript types where still relevant

### Reuse later only if needed
- haptic helpers
- voice helper concepts
- simplified service wrappers

### Avoid pulling over directly at first
- old navigation structure
- complex sensor hooks
- unstable voice confirmation logic
- code tied to unrelated navigation use cases

### Important stack note
`interfaceNew` and `interface` do not currently share the same app stack assumptions, so reusing logic should be done by **copying patterns**, not blindly moving files.

---

## 16. Incremental implementation plan

### Phase 0: architecture shell
Goal:
- define folders
- define state model
- define route structure
- define reusable constants/components

Deliverables:
- clean route files
- base screen container
- common button/card components
- fall event reducer or context scaffold

### Phase 1: operational app shell
Goal:
- replace starter Expo content
- build visual flow for home -> monitoring -> confirm -> alert -> result

Deliverables:
- `app/index.tsx`
- `app/monitoring.tsx`
- `app/confirm.tsx`
- `app/alert.tsx`
- `app/result.tsx`

### Phase 2: local event engine
Goal:
- make the flow stateful without backend dependency

Deliverables:
- event ID generation
- fall event state machine
- manual trigger path
- confirmation timeout behavior
- reset / false alarm resolution

### Phase 3: backend-ready contracts
Goal:
- add request builders and API service boundaries

Deliverables:
- `services/api/client.ts`
- typed payload builders
- mocked request flow
- optional health check

### Phase 4: device capability adapters
Goal:
- add location, haptics, and voice as adapters

Deliverables:
- mockable service interfaces
- fallback behavior when unavailable
- location snapshot inclusion
- confirmation UX enhancement

### Phase 5: sensor hookup
Goal:
- attach a basic candidate source

Deliverables:
- sensor adapter
- mocked-to-real transition path
- event source = `sensor`

### Phase 6: backend integration
Goal:
- create real server interaction

Deliverables:
- create event call
- SOS dispatch call
- resolve event call
- request status handling

### Phase 7: model/detection enrichment
Goal:
- integrate normalized detection outputs

Deliverables:
- confidence-aware event creation
- severity input from detection layer
- model/rule result adapter

---

## 17. Operational validation criteria per phase

Each phase should be considered complete only if:

### Architecture shell
- folders make sense
- app still runs

### Operational shell
- navigation works
- no broken routes
- screen flow is clear

### Local event engine
- state transitions are reliable
- false alarm path works
- timeout path works

### Backend-ready contracts
- payloads are typed
- mocked calls do not break flow

### Device capability adapters
- unavailable capabilities fail gracefully

### Sensor hookup
- manual trigger still works
- sensor trigger does not break app flow

### Backend integration
- request failures are shown safely
- UI remains usable on errors

---

## 18. Minimum viable technical build

The minimum technical build for `interfaceNew` should include:

### Must exist
- route structure
- screen components
- event state model
- manual trigger flow
- confirmation timeout
- false alarm handling
- alert payload builder
- reset flow

### Can be mocked initially
- sensor input
- location input
- backend dispatch
- haptics
- voice

### Should not block the build
- ML
- background services
- push
- BLE
- ETA
- full escalation stack

---

## 19. Technical risks and mitigations

### Risk: frontend grows around mock logic only
Mitigation:
- define service interfaces early
- keep mocks behind adapters

### Risk: app flow becomes tangled with UI
Mitigation:
- keep state transitions in feature/domain logic
- keep screens thin

### Risk: backend contract changes later
Mitigation:
- isolate requests in API service files
- use payload builders

### Risk: old `interface` code introduces instability
Mitigation:
- reuse patterns selectively
- do not import large old modules early

### Risk: Expo limitations block later native features
Mitigation:
- keep current scope operational and modular
- delay native-specific decisions until the app shell is correct

---

## 20. Definition of success

This technical planning phase is successful when `interfaceNew` is positioned to support:

- a clean route-based flow
- a stable event state machine
- backend-ready payload creation
- future service adapters
- later sensor/model integration
- safe incremental implementation

In short:

`interfaceNew` should first become a **well-structured fall-flow application shell**, not a half-wired prototype of every future feature.

---

## 21. Immediate next implementation target

The next implementation target should be:

1. replace the starter Expo screens with the route structure for the app flow
2. add a minimal shared state model for fall event flow
3. add the manual trigger path
4. add the confirmation timeout and false alarm path
5. keep all external integrations mocked or optional

Only after that should the app start integrating:
- location
- haptics
- voice
- sensors
- backend calls

---