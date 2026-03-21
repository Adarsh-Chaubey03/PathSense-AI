import type {
  LocationAdapter,
  LocationSnapshot,
} from "@/src/services/location/location-adapter";

export class MockLocationAdapter implements LocationAdapter {
  async getCurrentLocation(): Promise<LocationSnapshot> {
    return {
      latitude: 28.6139,
      longitude: 77.209,
      accuracy: 50,
      timestamp: new Date().toISOString(),
    };
  }
}
