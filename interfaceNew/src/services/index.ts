import { MockLocationAdapter } from "@/src/services/location/location-mock";
import { RealSensorAdapter } from "@/src/services/sensors/sensor-real";

export const services = {
  sensorAdapter: new RealSensorAdapter(),
  locationAdapter: new MockLocationAdapter(),
};
