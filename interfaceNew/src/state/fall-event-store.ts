import {
  applyTransition,
  createInitialEvent,
} from "@/src/features/fall-event/event.logic";
import {
  FallEventContext,
  FallEventState,
  FallEventTransition,
} from "@/src/features/fall-event/event.types";

let currentEvent: FallEventContext = createInitialEvent();
const listeners: ((event: FallEventContext) => void)[] = [];

function notify(): void {
  for (const listener of listeners) {
    listener(currentEvent);
  }
}

export function getFallEvent(): FallEventContext {
  return currentEvent;
}

export function resetFallEvent(): FallEventContext {
  currentEvent = createInitialEvent();
  notify();
  return currentEvent;
}

export function transitionFallEvent(
  to: FallEventState,
  reason: string,
): { event: FallEventContext; transition: FallEventTransition } {
  const transition = applyTransition(currentEvent, to, reason);
  currentEvent = transition.event;
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
