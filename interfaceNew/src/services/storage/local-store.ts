import AsyncStorage from "@react-native-async-storage/async-storage";

export async function setString(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function getString(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function removeKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
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
