import { evaluateGeofence, haversineMeters } from './geo';

describe('geo', () => {
  it('computes haversine distances', () => {
    // one arc-minute of latitude ≈ 1853 m
    expect(haversineMeters(23.8, 86.44, 23.8 + 1 / 60, 86.44)).toBeCloseTo(1853, -1);
    expect(haversineMeters(23.81, 86.44, 23.81, 86.44)).toBe(0);
  });

  const centre = { centerLat: 23.8143, centerLon: 86.4412, radiusM: 60 };

  it('accepts a fix inside the fence', () => {
    const v = evaluateGeofence({ ...centre, lat: 23.8146, lon: 86.4412, accuracyM: 10 });
    expect(v.ok).toBe(true);
  });

  it('adds at most 25 m of accuracy tolerance', () => {
    // ~78 m north: outside 60 m, inside 60 + 25
    const near = { ...centre, lat: 23.8143 + 78 / 111_195, lon: 86.4412 };
    expect(evaluateGeofence({ ...near, accuracyM: 5 }).ok).toBe(false);
    expect(evaluateGeofence({ ...near, accuracyM: 40 }).ok).toBe(true);
  });

  it('rejects fixes that are too coarse or too far', () => {
    expect(evaluateGeofence({ ...centre, lat: 23.8143, lon: 86.4412, accuracyM: 150 })).toMatchObject({ ok: false, reason: 'LOW_ACCURACY' });
    expect(evaluateGeofence({ ...centre, lat: 23.82, lon: 86.4412, accuracyM: 5 })).toMatchObject({ ok: false, reason: 'OUT_OF_GEOFENCE' });
  });
});
