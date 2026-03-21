# PathSense-AI TODO

Based on the review of `flow.md`, `stackAndFlow.md`, and the current repo structure/codebase.

## Status Legend

- `[x]` Done
- `[-]` Partial / started
- `[ ]` Left / not implemented yet

---

## 1. Documentation and Planning

- [x] Create high-level fall response flow in `flow.md`
- [x] Create detailed architecture, stack, and phased plan in `stackAndFlow.md`
- [x] Define major module areas:
  - `interface`
  - `server`
  - `test`
  - `fault_detection_model`
- [ ] Freeze final MVP scope
- [ ] Freeze final event lifecycle and naming
- [ ] Freeze final API contracts and endpoint naming
- [ ] Decide clearly whether fall alerts are active from day 1 or only after calibration
- [ ] Separate MVP features from later-phase features:
  - BLE broadcast
  - WhatsApp
  - ETA monitoring
  - full 108 automation
  - advanced ML fusion

---

## 2. Current Repo Foundation

- [x] Create main mobile app scaffold in `interface`
- [x] Create backend scaffold in `server`
- [x] Create IMU dataset collection app in `test`
- [x] Create model workspace in `fault_detection_model`
- [ ] Clean up naming consistency where needed
- [ ] Add root-level implementation tracking and milestone documentation
- [ ] Add architecture decision record for MVP choices

---

## 3. Mobile App - Current Completed Foundations

- [x] App bootstrap exists
- [x] Navigation structure exists
- [x] Home screen exists
- [x] Navigation screen exists
- [x] Settings screen exists
- [x] Sensor service abstraction exists
- [x] GPS service abstraction exists
- [x] Camera service abstraction exists
- [x] Voice output helper exists
- [x] Haptic helper exists
- [-] Voice confirmation component exists but is not fully integrated into the live app flow
- [-] `useSensors` hook exists but is not driving the full fall pipeline

---

## 4. Backend - Current Completed Foundations

- [x] Express app scaffold exists
- [x] Health endpoint exists
- [x] Contacts route exists
- [x] Basic fall route exists
- [x] Twilio SMS service scaffold exists
- [-] Fall validation service exists, but only in simplified prototype form
- [-] Contacts are stored via local JSON, not a production-ready user/contact model
- [ ] Add proper versioned API structure
- [ ] Add persistent data model for users, contacts, and fall events
- [ ] Add event resolution lifecycle
- [ ] Add event history endpoints

---

## 5. Flow Issues Identified

### Major flow mismatches to fix

- [ ] Align the implemented app/backend flow with `flow.md`
- [ ] Align the implemented app/backend flow with `stackAndFlow.md`
- [ ] Fix confirmation timing mismatch:
  - docs say ~30 seconds
  - current prototype behavior is much shorter
- [ ] Replace current prototype-only backend decision model:
  - `motionScore`
  - `orientationChange`
  - optional transcript
  with a real fall event payload
- [ ] Add severity model to the event flow:
  - MINOR
  - SEMI_MAJOR
  - MAJOR
- [ ] Ensure the app actually wires together:
  - sensor monitoring
  - candidate detection
  - confirmation
  - SOS dispatch
  - resolution
- [ ] Define one clear user-facing fall flow for MVP and keep all code aligned to it

---

## 6. MVP Definition

### Recommended MVP

- [ ] Detect a simple fall candidate on-device
- [ ] Ask user for confirmation with voice + haptic + large button
- [ ] If user cancels, log false alarm and stop
- [ ] If user does not respond, send SOS alert with location to emergency contacts
- [ ] Log the event locally and on backend
- [ ] Allow manual resolution of the event

### MVP decisions to finalize

- [ ] Decide exact candidate detection rule for MVP
- [ ] Decide exact confirmation duration for MVP
- [ ] Decide whether voice-only, button-only, or both are required in MVP
- [ ] Decide whether 108 is included in MVP or postponed
- [ ] Decide whether BLE is postponed to post-MVP

---

## 7. App State Machine

- [ ] Create a dedicated fall detection state machine
- [ ] Recommended states:
  - `IDLE`
  - `MONITORING`
  - `CANDIDATE`
  - `CONFIRMING`
  - `ALERTING`
  - `ESCALATING`
  - `RESOLVED`
  - `FALSE_ALARM`
- [ ] Persist state transitions locally
- [ ] Mirror final event status to backend
- [ ] Add structured event IDs
- [ ] Add timestamps for every state transition

---

## 8. Device Sensor Pipeline

### Current

- [x] Accelerometer access started
- [x] Gyroscope access started
- [-] Basic motion-state logic exists
- [ ] Real production sensor pipeline is not implemented yet

### TODO

- [ ] Implement real sensor monitoring architecture
- [ ] Add ring buffer for pre-fall IMU capture
- [ ] Store at least the planned pre-event window
- [ ] Add synchronized sensor event timestamps
- [ ] Improve motion-state classifier
- [ ] Move critical detection logic out of JS where needed
- [ ] Ensure low-latency handoff from sensor data to fall candidate detection
- [ ] Add battery-aware sampling strategy
- [ ] Add restart-safe behavior for long-running monitoring

---

## 9. Background Monitoring

- [ ] Implement Android foreground service for continuous fall monitoring
- [ ] Make monitoring survive app backgrounding
- [ ] Make monitoring survive screen-off state
- [ ] Make monitoring recover after device restart
- [ ] Add iOS background strategy
- [ ] Add background-safe location caching
- [ ] Add background-safe fall candidate handling
- [ ] Add graceful fallback behavior if full background capability is unavailable

---

## 10. Calibration Engine

- [ ] Implement 5-day calibration pipeline
- [ ] Collect passive movement baselines
- [ ] Compute personal thresholds
- [ ] Store calibration profile locally
- [ ] Add shadow mode
- [ ] Log shadow detections
- [ ] Add daily lightweight check-in flow if needed
- [ ] Add recalibration trigger logic
- [ ] Decide whether calibration blocks alerts or only improves them
- [ ] Prefer safe default thresholds from day 1 unless product policy says otherwise

---

## 11. Fall Detection Pipeline

### Planned from docs but not built yet

- [ ] Stage 1: free-fall detection gate
- [ ] Stage 2: impact detection gate
- [ ] Stage 3: orientation assessment
- [ ] Stage 4: post-impact motion monitoring
- [ ] Stage 5: ML + rules + context fusion

### MVP-first implementation tasks

- [ ] Build simple candidate detector first
- [ ] Add impact threshold logic
- [ ] Add orientation change logic
- [ ] Add immobility check
- [ ] Add event confidence score
- [ ] Add structured fall candidate payload
- [ ] Add event logging for all candidate detections

---

## 12. Severity Scoring

- [ ] Add severity levels to domain model
- [ ] Add rule-based severity scoring
- [ ] Include factors such as:
  - impact strength
  - orientation change
  - immobility duration
  - user response / no response
- [ ] Use severity to control escalation behavior
- [ ] Ensure severity is part of both device and backend event schema

---

## 13. False Alarm Reduction

- [ ] Add throw-vs-fall disambiguation
- [ ] Add phone drop-vs-human fall separation
- [ ] Add soft surface / hard surface handling
- [ ] Add context-based suppression rules
- [ ] Add false alarm logging
- [ ] Add false alarm fingerprint DB
- [ ] Add recalibration trigger when false alarms are too frequent
- [ ] Add false alarm history UI
- [ ] Allow user to reclassify a logged event later if needed

---

## 14. Voice Confirmation Flow

### Current

- [x] TTS prototype exists
- [x] Speech recognition prototype exists
- [-] Backend transcript submission exists in prototype form
- [ ] Not fully integrated into the main app flow

### TODO

- [ ] Integrate voice confirmation into actual fall workflow
- [ ] Add large accessible `I'M OK` button
- [ ] Add full-screen confirmation UI
- [ ] Add countdown timer
- [ ] Match confirmation duration to final product decision
- [ ] Support slower user response patterns
- [ ] Add retry/fallback behavior if voice recognition fails
- [ ] Add multilingual confirmation phrases
- [ ] Add accessibility support for screen readers
- [ ] Ensure confirmation works even when app is backgrounded or locked where possible

---

## 15. Haptic and Audio Alerts

- [x] Haptic helper exists
- [x] Voice output helper exists
- [ ] Add dedicated fall alert haptic pattern
- [ ] Add dedicated emergency voice prompts
- [ ] Add volume escalation logic for emergency prompts
- [ ] Add user settings for voice language and rate
- [ ] Add emergency audio fallback if speech recognition fails
- [ ] Ensure alerts are clear for elderly users in noisy environments

---

## 16. GPS and Location Handling

### Current

- [x] GPS service wrapper exists
- [-] Live GPS reading exists in prototype form
- [ ] Planned background last-known-location cache flow is not implemented

### TODO

- [ ] Add last-known-location cache strategy
- [ ] Cache location periodically in background
- [ ] Include cached location in all fall alerts
- [ ] Add behavior when GPS is weak or unavailable
- [ ] Add stale-location handling
- [ ] Add maps link generation
- [ ] Add location accuracy tracking in event payload
- [ ] Add floor-level/context hooks when available

---

## 17. Backend Event Model

- [ ] Define final `FallEvent` schema
- [ ] Include:
  - event ID
  - user ID
  - timestamps
  - severity
  - candidate metrics
  - transcript / confirmation result
  - location
  - alert chain status
  - resolution
- [ ] Add persistent user model
- [ ] Add persistent contact model
- [ ] Add event audit log
- [ ] Add fall history API
- [ ] Add false alarm history API

---

## 18. Contacts and SOS Management

### Current

- [x] Basic contacts API exists
- [-] SMS alerting exists
- [ ] No full app-side SOS contact management flow yet

### TODO

- [ ] Build SOS contact management UI in app
- [ ] Add add/edit/remove contact flow
- [ ] Add limit rules if needed
- [ ] Add address book import if required
- [ ] Add backend sync for contacts
- [ ] Validate contact numbers
- [ ] Add primary / secondary contact priority if needed
- [ ] Add contact test-message flow

---

## 19. Alert Dispatch Chain

### Current

- [-] Prototype SMS dispatch exists
- [ ] Full chain does not exist

### TODO

- [ ] Trigger alerts from actual fall event state machine
- [ ] Send SMS with:
  - user name
  - timestamp
  - location link
  - severity
  - event ID
- [ ] Add acknowledgement tracking
- [ ] Add retry policy
- [ ] Add escalation timing policy
- [ ] Add event resolution flow
- [ ] Add alert delivery logs
- [ ] Add fallback behavior if first alert method fails

---

## 20. Backend Infrastructure

### Planned but not implemented

- [ ] Redis
- [ ] MongoDB
- [ ] BullMQ
- [ ] socket.io
- [ ] Firebase Admin
- [ ] geospatial nearby search
- [ ] queue-based escalation workers

### Implementation TODO

- [ ] Add Redis for location/event cache
- [ ] Add MongoDB for persistent event and user storage
- [ ] Add queue workers for dispatch/escalation
- [ ] Add socket.io for live event updates
- [ ] Add Firebase push notification support
- [ ] Add configuration and environment validation
- [ ] Add structured logging
- [ ] Add runtime error monitoring

---

## 21. API Contract Alignment

### Current issue

- [ ] Current routes do not yet match the planned architecture

### TODO

- [ ] Define final versioned API namespace
- [ ] Add endpoint for location caching
- [ ] Add endpoint for fall event create/update
- [ ] Add endpoint for SOS dispatch
- [ ] Add endpoint for ETA updates
- [ ] Add endpoint for event resolve
- [ ] Add endpoint for fall history
- [ ] Add request validation on all routes
- [ ] Align mobile app requests with final backend contracts

---

## 22. Push Notifications and Contact Acknowledgement

- [ ] Add Firebase Cloud Messaging integration
- [ ] Send push notifications to SOS contacts
- [ ] Add acknowledgement tracking
- [ ] Add push-to-SMS fallback timing
- [ ] Add contact-side event open screen
- [ ] Add `I'm heading there` action
- [ ] Add `I've reached them` action
- [ ] Add contact-side manual call action
- [ ] Log all acknowledgement and response actions

---

## 23. ETA Tracking

- [ ] Add SOS responder live tracking flow
- [ ] Add ETA calculation logic
- [ ] Add ETA threshold escalation rules
- [ ] Recompute ETA periodically
- [ ] Detect if responder is not moving toward user
- [ ] Escalate based on drift / no progress
- [ ] Close event when responder arrives

---

## 24. 108 Emergency Escalation

- [ ] Finalize whether 108 is part of MVP or post-MVP
- [ ] Add device-side emergency calling strategy
- [ ] Add scripted emergency message generation
- [ ] Add backend fallback call strategy if required
- [ ] Add logging for every 108 attempt
- [ ] Add escalation rules based on severity
- [ ] Add escalation rules based on no-response windows

---

## 25. BLE and Nearby Responder Flow

- [ ] Decide whether BLE is post-MVP
- [ ] Add BLE emergency broadcast on supported platforms
- [ ] Add nearby device scanning flow
- [ ] Add responder notification UI
- [ ] Add event packet format
- [ ] Add resolution behavior for BLE-triggered assistance
- [ ] Add server-driven nearby responder fallback if implemented later

---

## 26. Context and Environment Classification

- [ ] Add barometer integration
- [ ] Add floor-level estimation
- [ ] Add staircase/ditch heuristics
- [ ] Add ambient audio context capture
- [ ] Add optional scene/context enrichment
- [ ] Add context tags to event payload:
  - indoor
  - outdoor
  - market
  - washroom
  - staircase
  - unknown
- [ ] Ensure privacy-safe handling of audio/context features

---

## 27. Machine Learning Workstream

### Current

- [x] Model environment setup exists
- [x] Dataset prep scripts exist
- [x] Test app exists for IMU data collection
- [-] ML integration into app is not done

### TODO

- [ ] Finalize labeled data collection plan
- [ ] Collect fall-like and non-fall datasets
- [ ] Prepare training pipeline
- [ ] Train initial classifier
- [ ] Evaluate with meaningful metrics
- [ ] Export mobile-compatible model
- [ ] Integrate model runtime in app
- [ ] Add model confidence handling
- [ ] Fuse model output with rule-based severity
- [ ] Add fallback path when model confidence is low

---

## 28. Testing and Validation

### Already useful

- [x] Dataset collection app exists for gathering non-fall movement data

### TODO

- [ ] Add unit tests for fall validation logic
- [ ] Add unit tests for event state machine
- [ ] Add integration tests for app-to-server flow
- [ ] Add backend route tests
- [ ] Add end-to-end tests for candidate -> confirm -> alert
- [ ] Add simulated fall scenarios
- [ ] Add phone drop / throw / table placement scenarios
- [ ] Add controlled field tests
- [ ] Measure detection rate
- [ ] Measure false positive rate
- [ ] Measure alert latency
- [ ] Measure battery impact

---

## 29. Accessibility

- [ ] Audit all critical flows for elderly users
- [ ] Ensure large touch targets
- [ ] Ensure large default font sizes
- [ ] Ensure high contrast UI
- [ ] Ensure screen reader support
- [ ] Ensure emergency prompts are simple and understandable
- [ ] Ensure confirmation screen is usable under stress
- [ ] Add one-permission-per-screen onboarding flow
- [ ] Add gentle degraded-mode messaging when permissions are denied

---

## 30. Localization

- [ ] Add language selection support
- [ ] Add multilingual emergency prompts
- [ ] Add multilingual voice recognition phrases
- [ ] Localize onboarding, settings, and alerts
- [ ] Localize emergency SMS templates if needed

---

## 31. Privacy and Compliance

- [ ] Define data retention policy
- [ ] Define consent handling for:
  - background location
  - microphone
  - aggregate model improvement
- [ ] Add in-app privacy explanation
- [ ] Add plain-language consent screens
- [ ] Add privacy policy
- [ ] Review DPDP/GDPR implications as needed

---

## 32. PathSense Core Integration

- [ ] Decide exact integration boundary between PathSense navigation and FallSense
- [ ] Share IMU infrastructure where appropriate
- [ ] Share GPS preprocessing where appropriate
- [ ] Add Safety Supervisor handoff
- [ ] Pause navigation guidance during active fall event
- [ ] Resume navigation after resolution
- [ ] Reuse context/depth services only when needed

---

## 33. Suggested Execution Order

### Phase A - Align and freeze MVP
- [ ] Freeze MVP flow
- [ ] Freeze event model
- [ ] Freeze API contracts

### Phase B - Build one real working flow
- [ ] Sensor candidate detection
- [ ] Confirmation UI
- [ ] SMS alert with location
- [ ] Event logging
- [ ] Manual resolution

### Phase C - Make it reliable
- [ ] Background monitoring
- [ ] Permissions onboarding
- [ ] Contact management
- [ ] Persistent backend storage

### Phase D - Improve quality
- [ ] Calibration
- [ ] false alarm reduction
- [ ] severity scoring
- [ ] better context

### Phase E - Add advanced features
- [ ] push notifications
- [ ] ETA tracking
- [ ] 108 escalation
- [ ] BLE
- [ ] ML fusion

---

## 34. Recommended Immediate Next 5 Tasks

- [ ] Finalize the exact MVP fall flow
- [ ] Build the app-side fall event state machine
- [ ] Replace prototype fall request payload with a real event payload
- [ ] Integrate the confirmation UI into the actual running app
- [ ] Make SOS SMS with location work end-to-end from the app

---

## 35. Final Reality Check

### What is actually done today
- [x] Planning and architecture docs
- [x] Repo structure
- [x] App scaffold
- [x] Backend scaffold
- [x] Dataset collection app
- [x] Model workspace setup
- [-] Voice confirmation prototype
- [-] Simple sensor and fall prototype

### What is still mostly left
- [ ] The real end-to-end FallSense product flow
- [ ] The production-safe background monitoring architecture
- [ ] The full escalation chain
- [ ] The calibration and false-alarm learning pipeline
- [ ] The full backend infrastructure
- [ ] The ML integration
- [ ] The final PathSense-core integration