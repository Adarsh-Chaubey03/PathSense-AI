import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { FallDispatchSummary, FallEventRequest, FallStatus } from '../types/fall.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '../data/fall-events.json');

export interface StoredFallEvent {
  eventId: string;
  createdAt: string;
  status: FallStatus;
  sosTriggered: boolean;
  dispatch: FallDispatchSummary;
  request: FallEventRequest;
}

function ensureStoreFile(): void {
  const folder = dirname(DATA_FILE);

  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }

  if (!existsSync(DATA_FILE)) {
    writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function readEvents(): StoredFallEvent[] {
  ensureStoreFile();

  try {
    const raw = readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as StoredFallEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[FallEventStore] Failed to read store, resetting file:', error);
    writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
    return [];
  }
}

function writeEvents(events: StoredFallEvent[]): void {
  ensureStoreFile();
  writeFileSync(DATA_FILE, JSON.stringify(events, null, 2), 'utf-8');
}

export function appendFallEvent(record: StoredFallEvent): void {
  const events = readEvents();
  events.push(record);
  writeEvents(events);
}

export function getRecentFallEvents(limit: number = 25): StoredFallEvent[] {
  const events = readEvents();
  return events.slice(-Math.max(1, limit)).reverse();
}
