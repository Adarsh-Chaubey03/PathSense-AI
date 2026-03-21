import type {
  SensorAdapter,
  SensorSample,
} from "@/src/services/sensors/sensor-adapter";

// Fall simulation phases
type FallPhase = "normal" | "freefall" | "impact" | "recovery";

export class MockSensorAdapter implements SensorAdapter {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private latestSample: SensorSample | null = null;
  private readonly samples: SensorSample[] = [];
  private readonly maxBufferSize = 300;

  // Fall simulation state
  private fallSimulationActive = false;
  private fallPhase: FallPhase = "normal";
  private fallPhaseCounter = 0;
  private sampleCounter = 0;

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private pushSample(sample: SensorSample): void {
    this.latestSample = sample;
    this.samples.push(sample);

    if (this.samples.length > this.maxBufferSize) {
      this.samples.splice(0, this.samples.length - this.maxBufferSize);
    }
  }

  /**
   * Trigger a simulated fall sequence
   * Call this to test the edge AI filter
   */
  simulateFall(): void {
    this.fallSimulationActive = true;
    this.fallPhase = "freefall";
    this.fallPhaseCounter = 0;
  }

  /**
   * Generate sensor data based on current fall phase
   */
  private generateFallData(): { accelerometer: { x: number; y: number; z: number }; gyroscope: { x: number; y: number; z: number } } {
    switch (this.fallPhase) {
      case "freefall":
        // Free fall: near-zero acceleration (< 0.5g = ~4.9 m/s²)
        this.fallPhaseCounter++;
        if (this.fallPhaseCounter >= 5) {
          this.fallPhase = "impact";
          this.fallPhaseCounter = 0;
        }
        return {
          accelerometer: {
            x: (Math.random() - 0.5) * 1,
            y: (Math.random() - 0.5) * 1,
            z: (Math.random() - 0.5) * 2, // Very low Z during freefall
          },
          gyroscope: {
            x: (Math.random() - 0.5) * 4,
            y: (Math.random() - 0.5) * 4,
            z: (Math.random() - 0.5) * 4,
          },
        };

      case "impact":
        // Impact: high acceleration (> 2.5g = ~24.5 m/s²) + high rotation
        this.fallPhaseCounter++;
        if (this.fallPhaseCounter >= 3) {
          this.fallPhase = "recovery";
          this.fallPhaseCounter = 0;
        }
        return {
          accelerometer: {
            x: (Math.random() - 0.5) * 15,
            y: (Math.random() - 0.5) * 15,
            z: 25 + Math.random() * 10, // High impact > 2.5g
          },
          gyroscope: {
            x: (Math.random() - 0.5) * 8,
            y: (Math.random() - 0.5) * 8,
            z: 3 + Math.random() * 3, // High rotation > 2.5 rad/s
          },
        };

      case "recovery":
        // Recovery: return to normal
        this.fallPhaseCounter++;
        if (this.fallPhaseCounter >= 10) {
          this.fallSimulationActive = false;
          this.fallPhase = "normal";
          this.fallPhaseCounter = 0;
        }
        return {
          accelerometer: {
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() - 0.5) * 2,
            z: 9.81 + (Math.random() - 0.5) * 1,
          },
          gyroscope: {
            x: (Math.random() - 0.5) * 1,
            y: (Math.random() - 0.5) * 1,
            z: (Math.random() - 0.5) * 1,
          },
        };

      default:
        // Normal stationary data
        return {
          accelerometer: {
            x: (Math.random() - 0.5) * 0.5,
            y: (Math.random() - 0.5) * 0.5,
            z: 9.81 + (Math.random() - 0.5) * 0.3,
          },
          gyroscope: {
            x: (Math.random() - 0.5) * 0.2,
            y: (Math.random() - 0.5) * 0.2,
            z: (Math.random() - 0.5) * 0.2,
          },
        };
    }
  }

  start(onSample: (sample: SensorSample) => void): void {
    this.stop();
    this.sampleCounter = 0;

    // Faster sampling rate: 50ms (20 Hz) for realistic fall detection
    this.intervalId = setInterval(() => {
      this.sampleCounter++;

      // Auto-trigger fall every 100 samples (~5 seconds) for testing
      // Remove or modify this for production
      if (this.sampleCounter % 100 === 50 && !this.fallSimulationActive) {
        this.simulateFall();
      }

      let accelerometer: { x: number; y: number; z: number };
      let gyroscope: { x: number; y: number; z: number };

      if (this.fallSimulationActive) {
        const fallData = this.generateFallData();
        accelerometer = fallData.accelerometer;
        gyroscope = fallData.gyroscope;
      } else {
        // Normal ambient data with occasional small movements
        const smallMovement = Math.random() > 0.9;
        accelerometer = smallMovement
          ? {
              x: (Math.random() - 0.5) * 2,
              y: (Math.random() - 0.5) * 2,
              z: 9.81 + (Math.random() - 0.5) * 2,
            }
          : {
              x: (Math.random() - 0.5) * 0.5,
              y: (Math.random() - 0.5) * 0.5,
              z: 9.81 + (Math.random() - 0.5) * 0.3,
            };

        gyroscope = smallMovement
          ? {
              x: (Math.random() - 0.5) * 1,
              y: (Math.random() - 0.5) * 1,
              z: (Math.random() - 0.5) * 1,
            }
          : {
              x: (Math.random() - 0.5) * 0.2,
              y: (Math.random() - 0.5) * 0.2,
              z: (Math.random() - 0.5) * 0.2,
            };
      }

      const accelMagnitude = Math.sqrt(
        accelerometer.x ** 2 + accelerometer.y ** 2 + accelerometer.z ** 2,
      );
      const gyroMagnitude = Math.sqrt(
        gyroscope.x ** 2 + gyroscope.y ** 2 + gyroscope.z ** 2,
      );
      const impactIntensity = this.clamp(Math.abs(accelMagnitude - 9.81) / 12, 0, 1);
      const rotationIntensity = this.clamp(gyroMagnitude / 6, 0, 1);
      const motionScore = this.clamp(1 - (impactIntensity * 0.65 + rotationIntensity * 0.35), 0, 1);

      const sample: SensorSample = {
        timestampMs: Date.now(),
        accelerometer,
        gyroscope,
        accelMagnitude,
        gyroMagnitude,
        motionScore,
        orientationChange: this.fallSimulationActive || gyroMagnitude > 0.8,
        motionState: this.fallSimulationActive ? "unstable" : "stationary",
        sampleRateHz: 20,
        source: "mock",
      };

      this.pushSample(sample);
      onSample(sample);
    }, 50); // 50ms = 20 Hz sampling
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getLatestSample(): SensorSample | null {
    return this.latestSample;
  }

  getRecentSamples(windowMs: number, maxSamples: number = 120): SensorSample[] {
    const cutoff = Date.now() - Math.max(windowMs, 0);
    return this.samples
      .filter((sample) => sample.timestampMs >= cutoff)
      .slice(-Math.max(1, maxSamples));
  }
}
