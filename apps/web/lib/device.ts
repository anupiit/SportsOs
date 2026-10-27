const DEVICE_KEY = 'sportsos.deviceId';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** A stable per-browser identifier sent with attendance check-ins (anti-proxy: one device per session). */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = randomId();
    window.localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

export function getPosition(timeoutMs = 15000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This browser does not support geolocation.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy * 10) / 10,
        }),
      (err) => {
        const messages: Record<number, string> = {
          1: 'Location permission was denied. Allow location access to check in.',
          2: 'Your position is unavailable. Move to an open area and retry.',
          3: 'Timed out while getting your location. Retry.',
        };
        reject(new Error(messages[err.code] ?? err.message));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
