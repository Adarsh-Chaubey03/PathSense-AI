export const STORAGE_KEYS = {
  schemaVersion: "pathsense.schema.version",
  currentEvent: "pathsense.fall-event.current",
  transitions: "pathsense.fall-event.transitions",
  safeSignalCache: "pathsense.fall-event.safe-signal-cache",
} as const;

export const STORAGE_SCHEMA_VERSION = "1";
