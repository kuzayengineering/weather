// api.weather.gov client.
//
// Rules (verified against NWS API maintainer guidance):
// - Never set a custom User-Agent from client-side JS — it breaks the CORS
//   preflight in browsers. The browser's default UA is fine for client apps;
//   the "unique UA" requirement is for server-side callers/proxies only.
// - Cache the /points lookup per location forever (it never changes).
// - Respect HTTP caching (plain fetch already does this) and don't poll
//   faster than the data actually updates.

import { cacheGet, cacheSet, cacheAgeMs } from '../lib/storage.js';

const BASE = 'https://api.weather.gov';
const STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour — matches the offline-notice threshold

function roundCoord(n) {
  return Math.round(n * 10000) / 10000; // ~11m precision, improves cache hit rate
}

class NwsError extends Error {
  constructor(message, { offline = false, stale = null } = {}) {
    super(message);
    this.name = 'NwsError';
    this.offline = offline;
    this.stale = stale;
  }
}

/**
 * Fetch JSON with a timestamped localStorage cache fallback for offline/stale use.
 * @returns {Promise<{data: any, stale: boolean, ageMs: number}>}
 */
async function cachedFetch(url, { ttlMs = 10 * 60 * 1000 } = {}) {
  const cached = cacheGet(url);

  try {
    const res = await fetch(url, { headers: { Accept: 'application/geo+json, application/json' } });
    if (!res.ok) throw new Error(`NWS API ${res.status} for ${url}`);
    const data = await res.json();
    cacheSet(url, data);
    return { data, stale: false, ageMs: 0 };
  } catch (err) {
    if (cached) {
      return { data: cached.data, stale: true, ageMs: cacheAgeMs(cached) };
    }
    throw new NwsError(`Failed to load ${url} and no cached copy is available`, { offline: true });
  }
}

/** Points lookup — cached indefinitely per rounded coordinate. */
export async function getPoints(lat, lon) {
  const key = `points:${roundCoord(lat)},${roundCoord(lon)}`;
  const cached = cacheGet(key);
  if (cached) return { data: cached.data, stale: false, ageMs: 0 };

  const url = `${BASE}/points/${roundCoord(lat)},${roundCoord(lon)}`;
  const result = await cachedFetch(url);
  if (!result.stale) cacheSet(key, result.data); // points never change — cache under stable key too
  return result;
}

export async function getForecast(points) {
  return cachedFetch(points.data.properties.forecast, { ttlMs: 15 * 60 * 1000 });
}

export async function getHourlyForecast(points) {
  return cachedFetch(points.data.properties.forecastHourly, { ttlMs: 15 * 60 * 1000 });
}

export async function getGridData(points) {
  return cachedFetch(points.data.properties.forecastGridData, { ttlMs: 15 * 60 * 1000 });
}

export async function getActiveAlerts(lat, lon) {
  const url = `${BASE}/alerts/active?point=${roundCoord(lat)},${roundCoord(lon)}`;
  return cachedFetch(url, { ttlMs: 5 * 60 * 1000 });
}

export async function getObservationStations(points) {
  return cachedFetch(points.data.properties.observationStations, { ttlMs: 60 * 60 * 1000 });
}

export async function getLatestObservation(stationId) {
  const url = `${BASE}/stations/${stationId}/observations/latest`;
  return cachedFetch(url, { ttlMs: 10 * 60 * 1000 });
}

/** Convenience: current conditions from the nearest reporting station. */
export async function getCurrentConditions(points) {
  const stations = await getObservationStations(points);
  const stationId = stations.data.features[0]?.properties?.stationIdentifier;
  if (!stationId) throw new NwsError('No observation stations found for this location');
  const obs = await getLatestObservation(stationId);
  return { ...obs, stale: obs.stale || stations.stale };
}

export { STALE_AFTER_MS, NwsError };
