// localStorage-backed settings, favorites, and generic timestamped data cache.

const SETTINGS_KEY = 'wr:settings';
const FAVORITES_KEY = 'wr:favorites';
const CACHE_PREFIX = 'wr:cache:';

const DEFAULT_SETTINGS = {
  units: 'imperial', // 'imperial' | 'metric'
  theme: 'system', // 'system' | 'light' | 'dark'
  homeLocationSource: 'current', // 'current' | 'favorite'
  homeFavoriteId: null,
  notifications: {
    advisories: false,
    incomingPrecip: false,
  },
  widget: {
    locationSource: 'current',
    favoriteId: null,
    background: 'none', // 'none' | 'color'
    backgroundColor: '#000000',
    backgroundOpacity: 0.4,
  },
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    return { ...structuredClone(DEFAULT_SETTINGS), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function updateSettings(patch) {
  const current = getSettings();
  const next = { ...current, ...patch };
  saveSettings(next);
  return next;
}

export function getFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

export function addFavorite(favorite) {
  const favorites = getFavorites();
  const withId = { id: crypto.randomUUID(), ...favorite };
  favorites.push(withId);
  saveFavorites(favorites);
  return withId;
}

export function removeFavorite(id) {
  const favorites = getFavorites().filter((f) => f.id !== id);
  saveFavorites(favorites);
  return favorites;
}

export function updateFavorite(id, patch) {
  const favorites = getFavorites().map((f) => (f.id === id ? { ...f, ...patch } : f));
  saveFavorites(favorites);
  return favorites;
}

// --- Generic timestamped cache, used to serve stale data when offline ---

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw); // { data, timestamp }
  } catch {
    return null;
  }
}

export function cacheSet(key, data) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // localStorage full or unavailable — degrade silently, cache is best-effort
  }
}

export function cacheAgeMs(entry) {
  if (!entry) return Infinity;
  return Date.now() - entry.timestamp;
}
