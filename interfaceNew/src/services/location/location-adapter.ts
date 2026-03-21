export interface LocationSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
}

export interface LocationAdapter {
  getCurrentLocation(): Promise<LocationSnapshot>;
}
