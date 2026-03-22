import AsyncStorage from "@react-native-async-storage/async-storage";

const fallbackStore = new Map<string, string>();
let warnedUnavailable = false;

function warnStorageUnavailable(error: unknown): void {
  if (warnedUnavailable) {
    return;
  }

  warnedUnavailable = true;
  console.warn(
    "[storage] AsyncStorage unavailable, falling back to in-memory store.",
    error,
  );
}

export async function setString(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
    fallbackStore.set(key, value);
  } catch (error) {
    warnStorageUnavailable(error);
    fallbackStore.set(key, value);
  }
}

export async function getString(key: string): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value !== null) {
      fallbackStore.set(key, value);
      return value;
    }
  } catch (error) {
    warnStorageUnavailable(error);
  }

  return fallbackStore.get(key) ?? null;
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    warnStorageUnavailable(error);
  }

  fallbackStore.delete(key);
}

export async function setJSON<T>(key: string, value: T): Promise<void> {
  await setString(key, JSON.stringify(value));
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const value = await getString(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
