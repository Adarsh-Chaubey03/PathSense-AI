import { MockLocationAdapter } from "@/src/services/location/location-mock";
import { MockSensorAdapter } from "@/src/services/sensors/sensor-mock";

export const services = {
  sensorAdapter: new MockSensorAdapter(),
  locationAdapter: new MockLocationAdapter(),
};
