import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

function webStorage(): Storage | null {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return null;
  return localStorage;
}

export async function kvGet(key: string): Promise<string | null> {
  try {
    const web = webStorage();
    if (web) return web.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  const web = webStorage();
  if (web) {
    web.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function kvDelete(key: string): Promise<void> {
  try {
    const web = webStorage();
    if (web) {
      web.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* Already gone. */
  }
}
