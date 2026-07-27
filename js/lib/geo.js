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
      (pos) => {
        const location = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: 'Current Location',
        };
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
