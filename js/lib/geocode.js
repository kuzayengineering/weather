// Free geocoding via OpenStreetMap Nominatim, used only for "add a favorite location"
// (typing a city/address and turning it into lat/lon). Per Nominatim's usage policy for
// light client-side use: no API key, but keep request volume low and identify the app.

const BASE = 'https://nominatim.openstreetmap.org/search';

export async function geocode(query) {
  const url = `${BASE}?format=jsonv2&limit=5&countrycodes=us&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const results = await res.json();
  return results.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));
}
