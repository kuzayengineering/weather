// AirNow (EPA) current-observations-by-location API.
//
// Local-dev only for now: pulls the key from js/config.local.js (gitignored).
// On the deployed public site that file won't exist, so this cleanly reports
// "unavailable" instead of ever shipping a key in public client-side source.
// Production needs a server-side proxy — see js/config.example.js.

let cachedKey;

async function getApiKey() {
  if (cachedKey !== undefined) return cachedKey;
  try {
    const mod = await import('../config.local.js');
    cachedKey = mod.AIRNOW_API_KEY || null;
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

/** @returns {Promise<{available: boolean, readings?: Array}>} */
export async function getNearbyAqi(lat, lon, distanceMiles = 50) {
  const key = await getApiKey();
  if (!key) return { available: false };

  const url = `https://www.airnowapi.org/aq/observation/latLong/current/?format=application/json&latitude=${lat}&longitude=${lon}&distance=${distanceMiles}&API_KEY=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AirNow API ${res.status}`);
  const readings = await res.json();
  return { available: true, readings };
}

/** AirNow reports one entry per pollutant; the headline AQI is the worst of them. */
export function worstReading(readings) {
  if (!readings?.length) return null;
  return readings.reduce((worst, r) => (!worst || r.AQI > worst.AQI ? r : worst), null);
}

/**
 * Daily AQI forecast (AirNow only forecasts per calendar day, not day/night).
 * @returns {Promise<{available: boolean, byDate?: Map<string, {aqi: number|null, category: {Number:number, Name:string}}>}>}
 */
export async function getAqiForecast(lat, lon, distanceMiles = 50) {
  const key = await getApiKey();
  if (!key) return { available: false };

  const url = `https://www.airnowapi.org/aq/forecast/latLong/?format=application/json&latitude=${lat}&longitude=${lon}&distance=${distanceMiles}&API_KEY=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AirNow API ${res.status}`);
  const entries = await res.json();

  const byDate = new Map();
  for (const entry of entries) {
    const existing = byDate.get(entry.DateForecast);
    // AirNow's forecast AQI value is often -1 (not yet calculated) — the
    // category is still meaningful even when the number isn't, so keep
    // whichever entry has the worse category, preferring a real AQI number.
    if (!existing || entry.Category.Number > existing.category.Number) {
      byDate.set(entry.DateForecast, { aqi: entry.AQI >= 0 ? entry.AQI : null, category: entry.Category });
    }
  }
  return { available: true, byDate };
}

const AQI_CATEGORY_COLORS = {
  1: '#00e400', // Good
  2: '#ffff00', // Moderate
  3: '#ff7e00', // Unhealthy for Sensitive Groups
  4: '#ff0000', // Unhealthy
  5: '#8f3f97', // Very Unhealthy
  6: '#7e0023', // Hazardous
};

export function aqiColor(categoryNumber) {
  return AQI_CATEGORY_COLORS[categoryNumber] || '#999999';
}
