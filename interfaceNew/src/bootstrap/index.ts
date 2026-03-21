import { getHealth } from "@/src/services/api/fall-events";
import { getJSON, setString } from "@/src/services/storage/local-store";
import {
  STORAGE_KEYS,
  STORAGE_SCHEMA_VERSION,
} from "@/src/services/storage/storage-keys";
import { requestAppPermissions } from "@/src/services/permissions/permissions";
import { hydrateFallEvent } from "@/src/state/fall-event-store";

export async function bootstrapApp(): Promise<void> {
  const storedVersion = await getJSON<string>(STORAGE_KEYS.schemaVersion);

  if (storedVersion !== STORAGE_SCHEMA_VERSION) {
    await setString(STORAGE_KEYS.schemaVersion, STORAGE_SCHEMA_VERSION);
  }

  await hydrateFallEvent();

  try {
    const permissions = await requestAppPermissions();
    console.log("[Permissions]", permissions);
  } catch {
    // Permission flow should never block demo startup.
  }

  try {
    await getHealth();
  } catch {
    // Keep app functional offline/local without blocking startup.
  }
}
