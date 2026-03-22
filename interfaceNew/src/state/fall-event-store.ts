import {
  applyTransition,
  createInitialEvent,
} from "@/src/features/fall-event/event.logic";
import {
  FallEventContext,
  FallEventState,
  FallEventTransition,
  MLDetectionData,
} from "@/src/features/fall-event/event.types";
import { getJSON, setJSON } from "@/src/services/storage/local-store";
import { STORAGE_KEYS } from "@/src/services/storage/storage-keys";

let currentEvent: FallEventContext = createInitialEvent();
let transitionLog: FallEventTransition[] = [];
const listeners: ((event: FallEventContext) => void)[] = [];

async function persistSnapshot(): Promise<void> {
  await Promise.all([
    setJSON(STORAGE_KEYS.currentEvent, currentEvent),
    setJSON(STORAGE_KEYS.transitions, transitionLog),
  ]);
}

function notify(): void {
  for (const listener of listeners) {
    listener(currentEvent);
  }
}

export function getFallEvent(): FallEventContext {
  return currentEvent;
}

export function getFallEventTransitions(): FallEventTransition[] {
  return [...transitionLog];
}

export async function hydrateFallEvent(): Promise<FallEventContext> {
  const [storedEvent, storedTransitions] = await Promise.all([
    getJSON<FallEventContext>(STORAGE_KEYS.currentEvent),
    getJSON<FallEventTransition[]>(STORAGE_KEYS.transitions),
  ]);

  if (storedEvent) {
    currentEvent = storedEvent;
  }

  if (storedTransitions) {
    transitionLog = storedTransitions;
  }

  notify();
  return currentEvent;
}

export function resetFallEvent(): FallEventContext {
  currentEvent = createInitialEvent();
  transitionLog = [];
  void persistSnapshot();
  notify();
  return currentEvent;
}

export function transitionFallEvent(
  to: FallEventState,
  reason: string,
): { event: FallEventContext; transition: FallEventTransition } {
  const transition = applyTransition(currentEvent, to, reason);
  currentEvent = transition.event;
  transitionLog = [...transitionLog.slice(-49), transition.transition];
  void persistSnapshot();
  notify();
  return transition;
}

export function subscribeToFallEvent(
  listener: (event: FallEventContext) => void,
): () => void {
  listeners.push(listener);

  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

export function setMLDetectionResult(mlData: MLDetectionData): void {
  currentEvent = {
    ...currentEvent,
    mlDetection: mlData,
    updatedAt: new Date().toISOString(),
  };
  void persistSnapshot();
  notify();
}

export function getMLDetectionResult(): MLDetectionData | undefined {
  return currentEvent.mlDetection;
}

export function clearMLDetectionResult(): void {
  const { mlDetection, ...rest } = currentEvent;
  currentEvent = {
    ...rest,
    updatedAt: new Date().toISOString(),
  };
  void persistSnapshot();
  notify();
}
