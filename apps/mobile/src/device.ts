import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DEVICE_KEY = 'sportsos.deviceId';
let cached: string | null = null;

/**
 * A random per-install identifier, created once and kept in SecureStore. The API
 * rejects a second student checking in to the same session from the same device.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id = await SecureStore.getItemAsync(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_KEY, id);
  }
  cached = id;
  return id;
}
