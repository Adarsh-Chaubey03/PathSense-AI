import type { SensorSample } from "@/src/services/sensors/sensor-adapter";
import { getJSON, setJSON } from "@/src/services/storage/local-store";
import { STORAGE_KEYS } from "@/src/services/storage/storage-keys";

const DEFAULT_SAFE_CACHE_TTL_MS = 30 * 60 * 1000;
const SAFE_CACHE_MAX_ENTRIES = 500;

interface SafeSignalCacheEntry {
  key: string;
  expiresAt: number;
  updatedAt: number;
}

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function normalizeEntries(value: unknown): SafeSignalCacheEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is SafeSignalCacheEntry => {
      if (typeof entry !== "object" || entry === null) {
        return false;
      }

      const candidate = entry as {
        key?: unknown;
        expiresAt?: unknown;
        updatedAt?: unknown;
      };

      return (
        typeof candidate.key === "string" &&
        typeof candidate.expiresAt === "number" &&
        Number.isFinite(candidate.expiresAt) &&
        typeof candidate.updatedAt === "number" &&
        Number.isFinite(candidate.updatedAt)
      );
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function pruneEntries(
  entries: SafeSignalCacheEntry[],
  nowMs: number,
): SafeSignalCacheEntry[] {
  const nonExpired = entries.filter((entry) => entry.expiresAt > nowMs);
  nonExpired.sort((a, b) => b.updatedAt - a.updatedAt);
  return nonExpired.slice(0, SAFE_CACHE_MAX_ENTRIES);
}

async function loadEntries(): Promise<SafeSignalCacheEntry[]> {
  const stored = await getJSON<unknown>(STORAGE_KEYS.safeSignalCache);
  return normalizeEntries(stored);
}

async function saveEntries(entries: SafeSignalCacheEntry[]): Promise<void> {
  await setJSON(STORAGE_KEYS.safeSignalCache, entries);
}

export function buildSafeSignalKeyFromSample(sample: SensorSample): string {
  return [
    sample.motionState,
    sample.orientationChange ? "1" : "0",
    roundTo(sample.motionScore, 2),
    roundTo(sample.accelMagnitude, 2),
    roundTo(sample.gyroMagnitude, 2),
    roundTo(sample.sampleRateHz, 1),
  ].join("|");
}

export async function isSafeSignalKeyCached(key: string): Promise<boolean> {
  const nowMs = Date.now();
  const entries = await loadEntries();
  const pruned = pruneEntries(entries, nowMs);

  if (pruned.length !== entries.length) {
    await saveEntries(pruned);
  }

  return pruned.some((entry) => entry.key === key);
}

export async function cacheSafeSignalKey(
  key: string,
  ttlMs: number = DEFAULT_SAFE_CACHE_TTL_MS,
): Promise<void> {
  const nowMs = Date.now();
  const ttl =
    Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_SAFE_CACHE_TTL_MS;
  const expiresAt = nowMs + ttl;

  const entries = await loadEntries();
  const pruned = pruneEntries(entries, nowMs);
  const withoutKey = pruned.filter((entry) => entry.key !== key);

  const nextEntries = pruneEntries(
    [{ key, expiresAt, updatedAt: nowMs }, ...withoutKey],
    nowMs,
  );

  await saveEntries(nextEntries);
}
