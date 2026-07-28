// Open-Meteo Air Quality API — free, no key/signup required, full CORS support
// (verified: `access-control-allow-origin: *`). Reports the EPA US AQI scale
// directly, with an hourly forecast, so it works the same in local dev and on
// the deployed public site — unlike AirNow, which needs a key we can't safely
// ship in this public repo's client-side code.

const BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const AQI_CATEGORIES = [
  { max: 50, number: 1, name: 'Good' },
  { max: 100, number: 2, name: 'Moderate' },
  { max: 150, number: 3, name: 'Unhealthy for Sensitive Groups' },
  { max: 200, number: 4, name: 'Unhealthy' },
  { max: 300, number: 5, name: 'Very Unhealthy' },
  { max: Infinity, number: 6, name: 'Hazardous' },
];

const AQI_CATEGORY_COLORS = {
  1: '#00e400',
  2: '#ffff00',
  3: '#ff7e00',
  4: '#ff0000',
  5: '#8f3f97',
  6: '#7e0023',
};

export function aqiCategory(aqi) {
  if (aqi == null) return null;
  return AQI_CATEGORIES.find((c) => aqi <= c.max);
}

export function aqiColor(categoryNumber) {
  return AQI_CATEGORY_COLORS[categoryNumber] || '#999999';
}

export function formatAqi(aqi) {
  if (aqi == null) return null;
  const category = aqiCategory(aqi);
  return `${aqi} (${category.name})`;
}

/** @returns {Promise<{available: boolean, aqi?: number}>} */
export async function getCurrentAqi(lat, lon) {
  const url = `${BASE}?latitude=${lat}&longitude=${lon}&current=us_aqi&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) return { available: false };
  const data = await res.json();
  const aqi = data.current?.us_aqi;
  return aqi != null ? { available: true, aqi } : { available: false };
}

/**
 * Hourly AQI forecast, returned pre-parsed for use with the same
 * valueAt()-style time sampling used elsewhere for grid data.
 * @returns {Promise<{available: boolean, points?: Array<{time: Date, aqi: number}>}>}
 */
export async function getAqiForecast(lat, lon, days = 3) {
  const url = `${BASE}?latitude=${lat}&longitude=${lon}&hourly=us_aqi&forecast_days=${days}&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) return { available: false };
  const data = await res.json();
  if (!data.hourly?.time) return { available: false };

  const points = data.hourly.time.map((t, i) => ({ time: new Date(t + 'Z'), aqi: data.hourly.us_aqi[i] }));
  return { available: true, points };
}

/** Nearest forecast point to `date` (Open-Meteo gives hourly points, so this is within ~30 min). */
export function aqiAt(forecast, date) {
  if (!forecast.available || !forecast.points.length) return null;
  const nearest = forecast.points.reduce((best, p) =>
    Math.abs(p.time - date) < Math.abs(best.time - date) ? p : best
  );
  return nearest.aqi;
}
