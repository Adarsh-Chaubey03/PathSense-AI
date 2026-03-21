# Mobile Assistive Navigation System for Visually Impaired Users

## Overview

This repository defines a production-ready system architecture for a mobile-based assistive navigation system that uses only smartphone sensors:

- Camera for primary visual perception
- IMU for motion and orientation awareness
- GPS for location and environmental context

The system is designed as a cyber-physical safety assistant, not just an AI inference demo. Its target is high real-world reliability through:

- Multi-sensor fusion
- Temporal stability
- Context-aware filtering
- Conservative decision logic
- Graceful degradation under sensor failure

The primary objective is to convert real-world visual and motion data into accurate, reliable, real-time guidance with approximately 95% effective system-level accuracy within its intended operating domain.

## System Objective

The system provides real-time guidance for visually impaired users while walking in outdoor or semi-structured pedestrian environments. It runs entirely on a mobile device and converts sensor input into short, actionable outputs:

- Voice instructions for navigation and hazard awareness
- Haptic feedback for urgency and directional support

The design prioritizes:

- Reliability over raw model complexity
- Stability over single-frame predictions
- Low cognitive load over verbose feedback
- Safe behavior under uncertainty

## Operating Assumptions

This design assumes:

- The smartphone camera faces forward
- The user is walking at pedestrian speed
- The phone is handheld, chest-mounted, or neck-mounted
- The environment is mostly outdoor sidewalks, pathways, crossings, or semi-structured public spaces

The approximately 95% target refers to effective actionable guidance in the supported operating domain, not standalone object detection accuracy.

## High-Level Architecture

```text
[Camera 15-20 FPS] ----\
[IMU 100-200 Hz] ------> [Sensor Manager + Monotonic Timestamping + Ring Buffers]
[GPS 1-5 Hz] ---------/                     |
                                            v
                    [Preprocessing + Sensor Quality Estimation]
                    | Camera: resize, normalize, blur, brightness, ROI
                    | IMU: filter, gravity removal, orientation, motion state
                    | GPS: outlier reject, smooth, speed, heading
                                            |
                                            v
                    [Time Alignment + Sliding Window Builder]
                    | frame_t + IMU[-100ms,+50ms] + latest valid GPS
                                            |
            ---------------------------------------------------------
            |                         |                            |
            v                         v                            v
   [Object Detection]         [Depth Estimation]          [Segmentation]
   [YOLOv8n INT8]             [Mobile MiDaS INT8]         [Fast-SCNN INT8]
            \                         |                            /
             \________________ [Track Manager + Ego-motion] _____/
                                   |
                                   v
                    [Sensor Fusion + Confidence/Risk Engine]
                    | distance | path overlap | closing rate
                    | temporal stability | motion context | uncertainty
                                   |
                                   v
                    [Priority Decision Engine + Alert Arbiter]
                                   |
                      ---------------------------------
                      |                               |
                      v                               v
                [Voice Output]                  [Haptic Output]
                      \                               /
                       \_____________________________/
                                   |
                                   v
            [Safety Supervisor + Failure Handling + Local Event Logging]
```

## Repository Layout

```text
.
|-- README.md
|-- detection_model/
|-- depth_model/
`-- segmentation_model/
```

Recommended ownership:

- `detection_model/` for object detection assets, configs, exported mobile models, and evaluation notes
- `depth_model/` for depth estimation assets and mobile-optimized variants
- `segmentation_model/` for walkable-area segmentation assets and deployment artifacts

## End-to-End Data Flow Pipeline

1. Acquire sensor data from camera, IMU, and GPS.
2. Assign monotonic timestamps to all sensor samples.
3. Store all incoming sensor data in ring buffers.
4. Preprocess each sensor stream and compute sensor health scores.
5. Align multi-rate sensor streams into a shared sliding analysis window.
6. Run object detection, depth estimation, and segmentation on the camera frame.
7. Track objects across frames and compensate for ego-motion using IMU estimates.
8. Fuse detection, depth, segmentation, IMU, and GPS into stable hazard objects.
9. Score each hazard by confidence, distance, path relevance, and urgency.
10. Select a single prioritized user instruction.
11. Output voice guidance and matching haptic feedback.
12. Monitor failures and degrade gracefully when a sensor becomes unreliable.

## Input Pipeline

### Sensors

- Camera: visual stream, main perception source
- IMU: accelerometer and gyroscope for motion, heading, and phone pose
- GPS: position, speed, coarse heading, and outdoor environmental context

### Time Synchronization

The camera stream acts as the master timeline for decision making. All sensor samples are timestamped with a monotonic system clock.

Synchronization strategy:

- Camera frames sampled at 15-20 FPS
- IMU samples sampled at 100-200 Hz
- GPS fixes sampled at 1-5 Hz
- Each camera frame at time `t` is paired with:
  - IMU window from `t - 100 ms` to `t + 50 ms`
  - Latest valid GPS sample with freshness threshold less than or equal to 2 seconds

### Data Alignment and Windowing

The fusion engine operates on a sliding temporal window:

- Visual window: 5 recent frames
- IMU window: 150-250 ms
- GPS freshness window: 2 seconds

This supports:

- Multi-frame validation
- Stability analysis
- Ego-motion compensation
- Confidence smoothing

## Sensor Preprocessing

### Camera Preprocessing

Goals:

- Improve model robustness under mobile lighting and motion conditions
- Detect frames that are unsuitable for reliable perception
- Focus computation on the most safety-relevant parts of the scene

Pipeline:

1. Capture RGB frame.
2. Resize into model-specific input sizes:
   - Detection: `320x320` or `416x416`
   - Depth: `256x256` or device-optimized equivalent
   - Segmentation: `256x512` or mobile-friendly size
3. Normalize with model-specific mean and standard deviation.
4. Run blur detection using variance of Laplacian and motion-blur heuristics.
5. Estimate brightness and contrast using luminance histogram and saturation statistics.
6. Apply lightweight enhancement when needed:
   - CLAHE
   - Gamma adjustment
   - Highlight clipping awareness
7. Define region of interest:
   - Lower-center corridor for near-field walk hazards
   - Periodic full-frame refresh to avoid tunnel vision
8. Compute camera health score `Q_cam`.

Camera quality checks:

- Blur score
- Underexposure score
- Overexposure score
- Texture richness
- Lens obstruction or occlusion likelihood

Graceful handling:

- If blur is high, lower confidence and rely more on temporal consistency
- If low light is detected, announce degraded guidance if sustained
- If obstruction persists, request user to adjust phone position

### IMU Preprocessing

Goals:

- Estimate user and device motion robustly
- Infer phone orientation and motion state
- Support ego-motion compensation and alert gating

Pipeline:

1. Read accelerometer and gyroscope streams.
2. Apply low-pass filtering to reduce high-frequency noise.
3. Estimate orientation using complementary filter or Madgwick filter.
4. Remove gravity from accelerometer to obtain linear acceleration.
5. Compute derived features:
   - Acceleration magnitude
   - Angular velocity magnitude
   - Pitch
   - Roll
   - Yaw change
   - Heading stability
6. Smooth derived features using EMA or short median windows.
7. Classify motion context:
   - Stationary
   - Walking
   - Turning
   - Rapid shaking
   - Unstable hold

IMU quality score `Q_imu` is based on:

- Sensor continuity
- Saturation or clipping
- Excessive oscillation
- Orientation estimate consistency

### GPS Preprocessing

Goals:

- Provide coarse outdoor context without destabilizing the system
- Estimate speed and location quality
- Reject noisy or implausible fixes

Pipeline:

1. Read GPS fix and reported accuracy.
2. Reject fixes with poor accuracy or impossible jumps.
3. Smooth latitude and longitude with alpha-beta or Kalman filtering.
4. Estimate speed:
   - Prefer Doppler speed if available
   - Otherwise use filtered position delta
5. Estimate heading only when speed is sufficient.
6. Compute GPS quality score `Q_gps`.

GPS rejection rules:

- Horizontal accuracy worse than configured threshold
- Unrealistic displacement between consecutive fixes
- Implausible acceleration or direction change
- Fix age greater than freshness threshold

GPS supports:

- Walking speed context
- Outdoor environment confidence
- Route layer extension in future versions
- Better tuning of lookahead distance

## AI Perception Layer

### 1. Object Detection

Recommended model:

- YOLOv8n or equivalent mobile detector

Expected output:

- Object class
- Bounding box
- Detection confidence

Production guidance:

- Fine-tune for mobility-relevant hazards, not generic object taxonomy alone
- Prioritize:
  - Person
  - Bicycle
  - Motorcycle
  - Car near pedestrian path
  - Pole
  - Stair or edge cues
  - Barrier
  - Sign stand
  - Trash bin
  - Open door
  - Low obstacle

Design note:

The model should be trained or adapted around hazard relevance, because a safe assistive system cares more about collision risk than general visual labeling.

### 2. Depth Estimation

Recommended model:

- Lightweight MiDaS or mobile depth transformer variant

Expected output:

- Relative depth map

Usage:

- Estimate object proximity
- Support distance binning
- Detect looming hazards
- Support risk scoring in combination with detection and segmentation

Production note:

The system should avoid overclaiming metric distance from monocular depth. It should use calibrated relative depth to derive robust bins:

- Near: less than 1.2 m
- Medium: 1.2 m to 2.5 m
- Far: greater than 2.5 m

### 3. Segmentation

Recommended model:

- Fast-SCNN
- DeepLab Mobile

Expected output:

- Walkable region mask
- Non-walkable region mask

Usage:

- Identify free corridor
- Determine whether an object intersects the path
- Support path correction decisions
- Filter irrelevant off-path detections

This module is optional in a minimal build, but strongly recommended in production because it materially improves path relevance estimation and alert precision.

### 4. Track Manager

The perception layer should include a tracking module even if not exposed as a headline model.

Responsibilities:

- Associate detections across frames
- Maintain object IDs
- Smooth object motion
- Estimate closing behavior over time
- Improve stability and reduce alert flicker

Suggested methods:

- IoU-based association
- Kalman filter per track
- Optional appearance embedding if device budget allows

## Sensor Fusion Engine

This is the core reliability layer. The purpose of fusion is not just to merge sensor outputs, but to transform noisy model predictions into stable, actionable hazard assessments.

### Fusion Inputs

- Object detections
- Relative depth map
- Walkable area segmentation
- IMU motion context
- GPS speed and environment quality
- Camera, IMU, and GPS health scores

### Fusion Outputs

For each tracked hazard object:

- Object class
- Path relevance
- Distance bin
- Relative motion indicator
- Fused confidence
- Risk score
- Priority class

### Object Distance Estimation

For tracked object `k`, estimate distance from the lower object region or footpoint using the depth map:

```text
d_k = s_t * median(D_t(p)),  p in footpoint(B_k)
```

Where:

- `D_t` is the relative depth map at time `t`
- `B_k` is the object bounding box
- `p` is the lower-footpoint or contact region of the object
- `s_t` is a scale factor derived from camera pose, calibration, and ground-plane assumptions

Distance should be used primarily as safety bins, not exact metric truth.

### Sensor Quality Weighting

Overall sensor quality:

```text
q_sensor = 0.5 * Q_cam + 0.3 * Q_imu + 0.2 * Q_gps
```

This emphasizes camera quality because vision is the main perception source while still accounting for inertial and location reliability.

### Fused Confidence

For each object `k`:

```text
C_k = 0.40 * c_det + 0.20 * c_depth + 0.25 * s_temp + 0.15 * q_sensor
```

Where:

- `c_det` = detector confidence
- `c_depth` = depth consistency score around the object
- `s_temp` = temporal stability score
- `q_sensor` = combined sensor health

### Path Relevance

Objects are prioritized if they intersect the walkable corridor:

```text
P_k = overlap(B_k, walk_corridor)
```

Where `P_k` measures whether the object is actually in the user path instead of simply present in the scene.

### Relative Motion and Closing Rate

Closing behavior uses track change over time after ego-motion compensation:

```text
M_k = f(delta_bbox, delta_depth, imu_compensated_motion)
```

This increases urgency for fast-approaching or path-crossing hazards such as bicycles or people entering the user corridor.

### Final Hazard Risk Score

```text
R_k = C_k * (0.40 * F_d + 0.25 * P_k + 0.20 * M_k + 0.15 * H_k)
```

Where:

- `F_d` = distance danger score
- `P_k` = path overlap score
- `M_k` = motion or closing-rate score
- `H_k` = class severity prior

Example class priors:

- Moving bicycle: high
- Static pole in corridor: medium-high
- Far sign outside path: low

### Temporal Filtering

The system should never trust a single frame for safety-critical output.

Recommended rules:

- Static obstacle is valid only if observed in 3 of last 5 frames
- Fast-moving obstacle can be valid in 2 of last 3 frames if closing rate is strong
- Rapidly disappearing objects are kept briefly with decaying confidence to avoid flicker

Temporal stability score components:

- Track persistence
- Bounding-box consistency
- Depth consistency
- Path relevance consistency

### Context-Aware Filtering

Filtering rules:

- Ignore far objects outside the path corridor
- Suppress stationary background clutter
- Expand lookahead distance when walking speed increases
- Lower trust in GPS when signal is weak
- Raise caution thresholds when camera quality deteriorates
- Use fail-safe bias for near uncertain hazards

### Ego-Motion Compensation

The IMU is used to distinguish:

- True scene motion
- Camera shake
- User turning
- Rapid phone movement

This reduces false alerts caused by motion blur, viewpoint oscillation, or handheld instability.

## Decision Engine

The decision engine is priority based. It receives fused hazard objects and converts them into a single concise action for the user.

### Priority Levels

- High: immediate danger
- Medium: path correction
- Low: informational state

### Priority Definitions

#### High Priority

Triggered by:

- Close obstacle in central corridor
- Estimated time to collision less than 1.5 seconds
- Fast-moving object crossing or approaching user path
- Strong hazard under moderate uncertainty

Output examples:

- `Stop`
- `Obstacle ahead`
- `Step left`
- `Step right`

#### Medium Priority

Triggered by:

- Path narrowing
- Drifting away from clear corridor
- Obstacle ahead that requires correction but is not immediate

Output examples:

- `Keep left`
- `Move right`
- `Path narrowing`

#### Low Priority

Triggered by:

- Clear path state change
- GPS weak
- Low light
- Camera blocked warning

Output examples:

- `Low light, guidance limited`
- `GPS weak`
- `Camera blocked`

### Decision Flow

```text
1. Check system health and sensor faults
2. If critical fault exists, announce degraded mode
3. Else evaluate all fused hazard objects
4. Select highest-risk valid hazard
5. Map hazard to priority level
6. Generate one concise action
7. Apply anti-overload rules
8. Output voice and haptic feedback
```

### Anti-Overload Policy

To reduce cognitive burden:

- Only one primary instruction is active at a time
- High-priority alerts preempt all others
- Repeated alerts are suppressed unless risk materially increases
- Medium and low alerts are rate-limited
- Silence is preferred when safe

### Fail-Safe Bias

If the system is uncertain but there is plausible near danger, it should prefer caution over silence.

Examples:

- If a near obstacle appears intermittently in poor lighting, issue `Caution ahead`
- If camera reliability is dropping, announce degraded guidance rather than continuing silently

## Output Layer

### Voice Output

Voice is the primary communication channel.

Design rules:

- Use short imperative phrases
- Avoid verbose scene descriptions
- Speak only when action is needed or status changes materially
- Keep language consistent across scenarios

Recommended vocabulary:

- `Stop`
- `Step left`
- `Step right`
- `Keep left`
- `Keep right`
- `Caution ahead`
- `Low light, guidance limited`
- `Camera blocked, adjust phone`

### Haptic Feedback

Haptic output acts as a secondary redundant channel.

Recommended patterns:

- Stop: one long continuous vibration
- Left: two short pulses
- Right: three short pulses
- Caution: short-long pulse

Haptics should reinforce urgency and direction without requiring interpretation of many complex patterns.

## Failure Handling and Graceful Degradation

The system must be explicit about failures and degrade gracefully rather than silently operating with misleading confidence.

### Low Light Detection

Detected using:

- Average luminance
- Noise estimate
- Exposure saturation
- Reduced image texture

System response:

- Apply limited enhancement
- Lower vision confidence
- Increase caution bias
- If sustained, announce `Low light, guidance limited`

### Camera Obstruction

Detected using:

- Persistent darkness
- Very low texture
- Abnormal blur
- Occlusion patterns across most of the frame

System response:

- Temporarily suspend precise obstacle guidance
- Request user correction
- Announce `Camera blocked, adjust phone`

### Sensor Inconsistency

Examples:

- IMU indicates large movement but visual motion is static
- GPS reports unrealistic jump
- Vision sees motion inconsistent with inertial context

System response:

- Down-weight inconsistent sensor
- Freeze unstable state if needed
- Bias toward conservative alerts
- Log the event for diagnostics

### GPS Unavailability

When GPS is weak or absent:

- Continue local obstacle avoidance using camera and IMU
- Suppress location-context-dependent behavior
- Announce `GPS weak` only when relevant

### Degradation Modes

- Mode A: full fusion, all sensors healthy
- Mode B: vision + IMU, GPS degraded
- Mode C: vision-dominant, IMU weak, conservative thresholds
- Mode D: camera unavailable, status-only mode, no reliable obstacle guidance

In Mode D the system must clearly indicate that active navigation quality is limited and the user should rely on primary mobility aids.

## Performance Constraints and Optimization Strategy

The complete system must operate on a mobile device with end-to-end actionable latency less than or equal to 100 ms.

### Runtime Targets

- Camera: 15-20 FPS
- End-to-end actionable latency: 70-95 ms target
- Energy-aware operation under continuous walking use

### Model Optimization

- Export all models for mobile inference
- Use INT8 quantization where accuracy permits
- Use FP16 selectively where hardware benefits outweigh INT8 limitations
- Prefer vendor NPU, DSP, GPU, Core ML, or NNAPI acceleration

### Scheduling Strategy

- Run detection and depth in parallel
- Run segmentation every frame or every second frame depending on thermal budget
- Use asynchronous pipelining across sensor read, preprocessing, inference, and fusion
- Use lower-center ROI inference every frame and periodic full-frame refresh

### Memory and Throughput Optimizations

- Use ring buffers for sensor streams
- Use zero-copy frame handoff where platform allows
- Keep models warm in memory
- Avoid repeated tensor reallocation
- Reuse preprocessing buffers

### Thermal and Battery Strategy

- Reduce segmentation frequency under thermal pressure
- Reduce full-frame passes when stationary
- Lower camera resolution when risk is low
- Use hazard-only mode when battery is critically low

### Example Latency Budget

- Camera preprocessing: 5-8 ms
- Object detection: 18-25 ms
- Depth estimation: 15-22 ms
- Segmentation: 8-12 ms
- Tracking, fusion, decision: 4-8 ms
- Output trigger: 5-10 ms

With pipelined execution, practical user-facing latency can remain below 100 ms on a capable modern smartphone.

## Production Reliability Strategy

High reliability comes from system design rather than any single model.

The key mechanisms are:

- Sensor quality scoring
- Multi-frame validation
- Object tracking
- Path-aware filtering
- Risk scoring instead of binary triggering
- Conservative fail-safe behavior
- Explicit degraded-mode announcements

This is how the system approaches approximately 95% effective guidance reliability in supported conditions.

## Safety and Usability Principles

- Do not overload the user with scene narration
- Prefer short commands over descriptive explanations
- Prefer warning over silence when near uncertainty exists
- Prefer silence when no action is needed
- Degrade explicitly, never invisibly
- Treat monocular depth as approximate
- Treat GPS as context, not as primary collision sensing

## Scalability Considerations

The architecture should remain modular so it can scale across devices, use cases, and future features.

### Technical Scalability

- Swap detection, depth, or segmentation models without changing the decision engine
- Support device-specific calibration profiles
- Support multiple hardware acceleration backends
- Add optional route awareness later without changing the local safety loop

### Product Scalability

- Start with outdoor sidewalk navigation
- Extend to crossings, transit hubs, and semi-indoor environments as separate validated modes
- Add optional user profile tuning for walking speed, feedback verbosity, and phone carrying mode

### Data and Learning Scalability

- Log privacy-preserving event summaries locally
- Use offline analysis for threshold tuning
- Use federated or offline retraining for hazard classes and environment adaptation
- Validate every domain expansion separately as a safety profile, not as a generic model update

## Recommended Validation Metrics

For production readiness, validate the full system with system-level metrics, not only model benchmarks.

Recommended metrics:

- Hazard detection recall in user path
- False alert rate per minute
- Missed critical hazard rate
- Median and 95th percentile alert latency
- Path correction success rate
- Degraded-mode detection accuracy
- User comprehension time for voice and haptic commands

Field evaluation scenarios should include:

- Bright daylight
- Low light
- Motion blur
- Sidewalk clutter
- Approaching cyclists
- People crossing
- Static poles and bins
- GPS weak environments
- Camera partially obstructed conditions

## Suggested Next Implementation Steps

1. Define the mobile runtime service architecture and platform target.
2. Export and benchmark baseline mobile models for detection, depth, and segmentation.
3. Implement timestamped ring buffers and sensor preprocessing.
4. Build the track manager and fusion engine before tuning user prompts.
5. Tune decision thresholds in field trials with safety observers.
6. Add health monitoring, degraded modes, and event logging.
7. Validate in staged environments before real-world pilot deployment.

## Summary

This architecture is designed as a production-ready, edge-first, safety-aware assistive navigation system for visually impaired users using only smartphone sensors.

Its effectiveness depends on:

- Strong preprocessing
- Reliable time alignment
- Parallel mobile perception
- Multi-frame sensor fusion
- Conservative decision logic
- Minimal, high-value user feedback
- Graceful degradation under uncertainty

The system is intentionally designed to behave like a stable mobility assistant: quiet when safe, decisive when necessary, and transparent when confidence drops.
