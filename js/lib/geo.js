import { reverseGeocode } from './geocode.js';

const LAST_LOCATION_KEY = 'wr:lastLocation';

/** Resolves the active location per Settings: current GPS position or the chosen favorite. */
export async function resolveActiveLocation(settings, favorites) {
  if (settings.homeLocationSource === 'favorite' && settings.homeFavoriteId) {
    const fav = favorites.find((f) => f.id === settings.homeFavoriteId);
    if (fav) return { lat: fav.lat, lon: fav.lon, label: fav.label };
  }
  return getCurrentPosition();
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      const last = getLastKnownLocation();
      if (last) return resolve(last);
      return reject(new Error('Geolocation is not supported by this browser'));
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;

        let label = 'Current Location';
        try {
          const reverse = await reverseGeocode(lat, lon);
          if (reverse?.label) label = reverse.label;
        } catch {
          // Reverse geocoding is best-effort — fall back to a generic label
          // rather than failing the whole location resolution over it.
        }

        const location = { lat, lon, label };
        localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(location));
        resolve(location);
      },
      (err) => {
        const last = getLastKnownLocation();
        if (last) return resolve(last);
        reject(err);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 }
    );
  });
}

export function getLastKnownLocation() {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
