import { initTheme } from './lib/theme.js';
import { getSettings, updateSettings, getFavorites } from './lib/storage.js';
import { resolveActiveLocation } from './lib/geo.js';
import { renderHomeTab } from './tabs/home.js';
import { renderHourlyTab } from './tabs/hourly.js';
import { renderDailyTab } from './tabs/daily.js';

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
  });
});

renderSettingsTabStub();

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

async function boot() {
  const locationLabel = document.getElementById('location-label');
  try {
    const settings = getSettings();
    const favorites = getFavorites();
    currentLocation = await resolveActiveLocation(settings, favorites);
    locationLabel.textContent = currentLocation.label;
    loadedTabs.add('home');
    await renderHomeTab(panels.home, currentLocation, settings);
  } catch (err) {
    locationLabel.textContent = 'Location unavailable';
    panels.home.innerHTML = `<p class="error">Couldn't get your location. Check that location permission is allowed for this site, then reload.</p>`;
    console.error(err);
  }
}

// Minimal settings UI for now — units + theme only.
// Favorites / notifications / widget config land in a later pass.
function renderSettingsTabStub() {
  const settings = getSettings();
  panels.settings.innerHTML = `
    <div class="card">
      <h2>Units</h2>
      <label><input type="radio" name="units" value="imperial" ${settings.units === 'imperial' ? 'checked' : ''}/> Imperial (°F, mph, in)</label><br/>
      <label><input type="radio" name="units" value="metric" ${settings.units === 'metric' ? 'checked' : ''}/> Metric (°C, km/h, mm)</label>
    </div>
    <div class="card">
      <h2>Theme</h2>
      <label><input type="radio" name="theme" value="system" ${settings.theme === 'system' ? 'checked' : ''}/> Match system</label><br/>
      <label><input type="radio" name="theme" value="light" ${settings.theme === 'light' ? 'checked' : ''}/> Light</label><br/>
      <label><input type="radio" name="theme" value="dark" ${settings.theme === 'dark' ? 'checked' : ''}/> Dark</label>
    </div>
  `;

  panels.settings.querySelectorAll('input[name="units"]').forEach((input) => {
    input.addEventListener('change', async (e) => {
      updateSettings({ units: e.target.value });
      await refreshLoadedTabs();
    });
  });

  panels.settings.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', async (e) => {
      updateSettings({ theme: e.target.value });
      initTheme();
    });
  });
}

boot();
