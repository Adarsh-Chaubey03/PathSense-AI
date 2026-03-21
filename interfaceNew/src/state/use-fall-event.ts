import { useEffect, useState } from "react";

import type { FallEventContext } from "@/src/features/fall-event/event.types";
import {
  getFallEvent,
  subscribeToFallEvent,
} from "@/src/state/fall-event-store";

export function useFallEvent(): FallEventContext {
  const [event, setEvent] = useState<FallEventContext>(getFallEvent());

  useEffect(() => {
    return subscribeToFallEvent(setEvent);
  }, []);

  return event;
}
