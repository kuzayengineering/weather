// Free geocoding via OpenStreetMap Nominatim, used only for "add a favorite location"
// (typing a city/address and turning it into lat/lon). Per Nominatim's usage policy for
// light client-side use: no API key, but keep request volume low and identify the app.

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

export async function geocode(query) {
  const url = `${SEARCH_URL}?format=jsonv2&limit=5&countrycodes=us&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const results = await res.json();
  return results.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));
}

/** Turns coordinates into a short "City, ST" label — used for the current-GPS-location display. */
export async function reverseGeocode(lat, lon) {
  const url = `${REVERSE_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`);
  const result = await res.json();
  const addr = result.address || {};

  const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || result.name;
  const stateCode = addr['ISO3166-2-lvl4']?.split('-')[1];
  const label = city && stateCode ? `${city}, ${stateCode}` : city || addr.state || result.display_name;

  return { label, city, state: addr.state, stateCode };
}
