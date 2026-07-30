import { initTheme } from './lib/theme.js';
import { getSettings, getFavorites } from './lib/storage.js';
import { resolveActiveLocation, getCurrentPosition, getLastKnownLocation } from './lib/geo.js';
import { renderHomeTab, refreshHomeMapSize } from './tabs/home.js';
import { renderHourlyTab } from './tabs/hourly.js';
import { renderDailyTab } from './tabs/daily.js';
import { renderMapsTab } from './tabs/maps.js';
import { renderSettingsTab } from './tabs/settings.js';

initTheme();

const tabButtons = document.querySelectorAll('nav.tab-bar button');
const panels = {
  home: document.getElementById('tab-home'),
  hourly: document.getElementById('tab-hourly'),
  daily: document.getElementById('tab-daily'),
  maps: document.getElementById('tab-maps'),
  settings: document.getElementById('tab-settings'),
};

const TAB_RENDERERS = {
  home: renderHomeTab,
  hourly: renderHourlyTab,
  daily: renderDailyTab,
  maps: renderMapsTab,
};

let currentLocation = null;
const loadedTabs = new Set();

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    Object.values(panels).forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    panels[tab].classList.add('active');
    loadTab(tab);
    if (tab === 'home') refreshHomeMapSize();
  });
});

renderSettingsTab(panels.settings, {
  onUnitsOrThemeChange: refreshLoadedTabs,
  onLocationSourceChange: reresolveLocationAndRefresh,
});

async function loadTab(tab) {
  const renderer = TAB_RENDERERS[tab];
  if (!renderer || loadedTabs.has(tab) || !currentLocation) return;
  loadedTabs.add(tab);
  await renderer(panels[tab], currentLocation, getSettings());
}

/** Re-renders every already-loaded tab — used after a settings change like units. */
async function refreshLoadedTabs() {
  const settings = getSettings();
  for (const tab of loadedTabs) {
    await TAB_RENDERERS[tab](panels[tab], currentLocation, settings);
  }
}

/** Used when the active location itself changes (e.g. switching to a favorite). */
async function reresolveLocationAndRefresh() {
  const settings = getSettings();
  const favorites = getFavorites();
  try {
    currentLocation = await resolveActiveLocation(settings, favorites);
    document.getElementById('location-label').textContent = currentLocation.label;
    await refreshLoadedTabs();
  } catch (err) {
    console.error(err);
  }
}

function isSameRoundedLocation(a, b) {
  const round = (n) => Math.round(n * 10000) / 10000; // ~11m precision, matches nws.js's own cache rounding
  return round(a.lat) === round(b.lat) && round(a.lon) === round(b.lon);
}

async function boot() {
  const locationLabel = document.getElementById('location-label');
  const settings = getSettings();
  const favorites = getFavorites();

  // A favorite location is already instant (no geolocation involved).
  if (settings.homeLocationSource === 'favorite' && settings.homeFavoriteId) {
    const fav = favorites.find((f) => f.id === settings.homeFavoriteId);
    if (fav) {
      currentLocation = fav;
      locationLabel.textContent = fav.label;
      loadedTabs.add('home');
      try {
        await renderHomeTab(panels.home, currentLocation, settings);
      } catch (err) {
        console.error(err);
      }
      return;
    }
  }

  // "Current location" path: paint instantly from last time's GPS fix (if we
  // have one) instead of blocking on a fresh geolocation lookup, then quietly
  // refresh once the real fix — with an actual place name — comes back.
  const cachedLocation = getLastKnownLocation();
  if (cachedLocation) {
    currentLocation = cachedLocation;
    locationLabel.textContent = cachedLocation.label;
    loadedTabs.add('home');
    try {
      await renderHomeTab(panels.home, currentLocation, settings);
    } catch (err) {
      console.error(err);
    }
  }

  try {
    const fresh = await getCurrentPosition();
    currentLocation = fresh;
    locationLabel.textContent = fresh.label;

    if (!cachedLocation) {
      loadedTabs.add('home');
      await renderHomeTab(panels.home, currentLocation, getSettings());
    } else if (!isSameRoundedLocation(cachedLocation, fresh) || cachedLocation.label !== fresh.label) {
      await refreshLoadedTabs();
    }
    // else: identical spot and label as last time — no need to flicker a re-render.
  } catch (err) {
    if (!cachedLocation) {
      locationLabel.textContent = 'Location unavailable';
      panels.home.innerHTML = `<p class="error">Couldn't get your location. Check that location permission is allowed for this site, then reload.</p>`;
    }
    console.error(err);
  }
}

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW registration failed', err));
  });
}
