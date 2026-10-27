/**
 * Spatial validation for verified attendance (GPS geofencing).
 */

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine formula). */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Fixes reported worse than this are rejected outright. */
export const MAX_ACCEPTED_ACCURACY_M = 100;
/** At most this much of the reported accuracy is added to the fence radius as tolerance. */
export const MAX_ACCURACY_TOLERANCE_M = 25;

export interface GeofenceInput {
  centerLat: number;
  centerLon: number;
  radiusM: number;
  lat: number;
  lon: number;
  accuracyM: number;
}

export type GeofenceVerdict =
  | { ok: true; distanceM: number; allowedM: number }
  | { ok: false; reason: 'LOW_ACCURACY' | 'OUT_OF_GEOFENCE'; distanceM: number; allowedM: number };

export function evaluateGeofence(input: GeofenceInput): GeofenceVerdict {
  const distanceM = haversineMeters(input.centerLat, input.centerLon, input.lat, input.lon);
  const allowedM = input.radiusM + Math.min(Math.max(input.accuracyM, 0), MAX_ACCURACY_TOLERANCE_M);
  if (!Number.isFinite(input.accuracyM) || input.accuracyM > MAX_ACCEPTED_ACCURACY_M) {
    return { ok: false, reason: 'LOW_ACCURACY', distanceM, allowedM };
  }
  if (distanceM > allowedM) {
    return { ok: false, reason: 'OUT_OF_GEOFENCE', distanceM, allowedM };
  }
  return { ok: true, distanceM, allowedM };
}
