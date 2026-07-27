import { getSettings, updateSettings, getFavorites, addFavorite, removeFavorite } from '../lib/storage.js';
import { geocode } from '../lib/geocode.js';
import { initTheme } from '../lib/theme.js';

/**
 * @param {HTMLElement} container
 * @param {{onUnitsOrThemeChange?: () => void, onLocationSourceChange?: () => void}} callbacks
 */
export function renderSettingsTab(container, callbacks = {}) {
  const settings = getSettings();
  const favorites = getFavorites();

  container.innerHTML = `
    <div class="card">
      <h2>Units</h2>
      <label><input type="radio" name="units" value="imperial" ${settings.units === 'imperial' ? 'checked' : ''}/> Imperial (°F, mph, in)</label><br/>
      <label><input type="radio" name="units" value="metric" ${settings.units === 'metric' ? 'checked' : ''}/> Metric (°C, km/h, mm)</label>
    </div>

    <div class="card">
      <h2>Theme</h2>
      <label><input type="radio" name="theme" value="system" ${settings.theme === 'system' ? 'checked' : ''}/> Match system</label><br/>
      <label><input type="radio" name="theme" value="light" ${settings.theme === 'light' ? 'checked' : ''}/> Light</label><br/>
      <label><input type="radio" name="theme" value="dark" ${settings.theme === 'dark' ? 'checked' : ''}/> Dark (OLED black)</label>
    </div>

    <div class="card">
      <h2>Favorite Locations</h2>
      <div class="favorites-list">
        ${
          favorites.length
            ? favorites
                .map(
                  (f) => `
              <div class="favorite-row" data-id="${f.id}">
                <span>${f.label}</span>
                <button class="remove-favorite-btn" data-id="${f.id}">Remove</button>
              </div>`
                )
                .join('')
            : '<p class="meta">No favorites saved yet.</p>'
        }
      </div>
      <div class="add-favorite">
        <input type="text" id="favorite-search-input" placeholder="City, address, or zip code" />
        <button id="favorite-search-btn">Search</button>
      </div>
      <div id="favorite-search-results"></div>
    </div>

    <div class="card">
      <h2>Home Screen Location</h2>
      <label><input type="radio" name="home-location-source" value="current" ${settings.homeLocationSource === 'current' ? 'checked' : ''}/> Use current location</label><br/>
      <label><input type="radio" name="home-location-source" value="favorite" ${settings.homeLocationSource === 'favorite' ? 'checked' : ''} ${!favorites.length ? 'disabled' : ''}/> Use a favorite:</label>
      <select id="home-favorite-select" ${settings.homeLocationSource !== 'favorite' || !favorites.length ? 'disabled' : ''}>
        ${favorites.map((f) => `<option value="${f.id}" ${settings.homeFavoriteId === f.id ? 'selected' : ''}>${f.label}</option>`).join('')}
      </select>
    </div>

    <div class="card">
      <h2>Notifications</h2>
      <p class="meta">Push notification delivery is coming in a later update — these preferences are saved now so they're ready when it ships.</p>
      <label><input type="checkbox" id="notif-advisories" ${settings.notifications.advisories ? 'checked' : ''}/> Weather advisories</label><br/>
      <label><input type="checkbox" id="notif-precip" ${settings.notifications.incomingPrecip ? 'checked' : ''}/> Incoming precipitation (&lt;30 min)</label>
    </div>

    <div class="card">
      <h2>Widget</h2>
      <p class="meta">Configuration for the home-screen widget, once the Android widget ships.</p>
      <label>Location:
        <select id="widget-location-source">
          <option value="current" ${settings.widget.locationSource === 'current' ? 'selected' : ''}>Current location</option>
          ${favorites.map((f) => `<option value="${f.id}" ${settings.widget.locationSource === 'favorite' && settings.widget.favoriteId === f.id ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </label><br/>
      <label>Background:
        <select id="widget-background">
          <option value="none" ${settings.widget.background === 'none' ? 'selected' : ''}>None (fully transparent)</option>
          <option value="color" ${settings.widget.background === 'color' ? 'selected' : ''}>Color</option>
        </select>
      </label><br/>
      <label>Color: <input type="color" id="widget-color" value="${settings.widget.backgroundColor}" ${settings.widget.background !== 'color' ? 'disabled' : ''}/></label>
      <label>Opacity: <input type="range" id="widget-opacity" min="0" max="1" step="0.05" value="${settings.widget.backgroundOpacity}" ${settings.widget.background !== 'color' ? 'disabled' : ''}/></label>
    </div>
  `;

  wireUnitsAndTheme(container, callbacks);
  wireFavorites(container, callbacks);
  wireHomeLocationSource(container, callbacks);
  wireNotifications(container);
  wireWidget(container);
}

function wireUnitsAndTheme(container, callbacks) {
  container.querySelectorAll('input[name="units"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      updateSettings({ units: e.target.value });
      callbacks.onUnitsOrThemeChange?.();
    });
  });

  container.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      updateSettings({ theme: e.target.value });
      initTheme();
    });
  });
}

function wireFavorites(container, callbacks) {
  container.querySelectorAll('.remove-favorite-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeFavorite(btn.dataset.id);
      renderSettingsTab(container, callbacks);
      callbacks.onLocationSourceChange?.();
    });
  });

  const searchInput = container.querySelector('#favorite-search-input');
  const searchBtn = container.querySelector('#favorite-search-btn');
  const resultsEl = container.querySelector('#favorite-search-results');

  const runSearch = async () => {
    const query = searchInput.value.trim();
    if (!query) return;
    resultsEl.innerHTML = '<p class="loading">Searching…</p>';
    try {
      const results = await geocode(query);
      if (!results.length) {
        resultsEl.innerHTML = '<p class="meta">No matches found.</p>';
        return;
      }
      resultsEl.innerHTML = results
        .map(
          (r, i) => `<div class="geocode-result" data-index="${i}"><button class="add-result-btn" data-index="${i}">+ ${r.label}</button></div>`
        )
        .join('');
      resultsEl.querySelectorAll('.add-result-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const r = results[Number(btn.dataset.index)];
          addFavorite({ label: r.label.split(',').slice(0, 2).join(','), lat: r.lat, lon: r.lon });
          searchInput.value = '';
          resultsEl.innerHTML = '';
          renderSettingsTab(container, callbacks);
        });
      });
    } catch (err) {
      resultsEl.innerHTML = '<p class="error">Search failed. Check your connection and try again.</p>';
      console.error(err);
    }
  };

  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });
}

function wireHomeLocationSource(container, callbacks) {
  container.querySelectorAll('input[name="home-location-source"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const patch = { homeLocationSource: e.target.value };
      if (e.target.value === 'favorite') {
        // The <select> may already show the right favorite without firing its own
        // 'change' event (e.g. only one favorite exists) — sync from its current value.
        const select = container.querySelector('#home-favorite-select');
        const favorites = getFavorites();
        patch.homeFavoriteId = select?.value || favorites[0]?.id || null;
      }
      updateSettings(patch);
      renderSettingsTab(container, callbacks);
      callbacks.onLocationSourceChange?.();
    });
  });

  const select = container.querySelector('#home-favorite-select');
  select?.addEventListener('change', (e) => {
    updateSettings({ homeFavoriteId: e.target.value });
    callbacks.onLocationSourceChange?.();
  });
}

function wireNotifications(container) {
  container.querySelector('#notif-advisories')?.addEventListener('change', (e) => {
    const settings = getSettings();
    updateSettings({ notifications: { ...settings.notifications, advisories: e.target.checked } });
  });
  container.querySelector('#notif-precip')?.addEventListener('change', (e) => {
    const settings = getSettings();
    updateSettings({ notifications: { ...settings.notifications, incomingPrecip: e.target.checked } });
  });
}

function wireWidget(container) {
  const bgSelect = container.querySelector('#widget-background');
  const colorInput = container.querySelector('#widget-color');
  const opacityInput = container.querySelector('#widget-opacity');
  const locationSelect = container.querySelector('#widget-location-source');

  bgSelect?.addEventListener('change', (e) => {
    const settings = getSettings();
    updateSettings({ widget: { ...settings.widget, background: e.target.value } });
    colorInput.disabled = e.target.value !== 'color';
    opacityInput.disabled = e.target.value !== 'color';
  });

  colorInput?.addEventListener('change', (e) => {
    const settings = getSettings();
    updateSettings({ widget: { ...settings.widget, backgroundColor: e.target.value } });
  });

  opacityInput?.addEventListener('change', (e) => {
    const settings = getSettings();
    updateSettings({ widget: { ...settings.widget, backgroundOpacity: Number(e.target.value) } });
  });

  locationSelect?.addEventListener('change', (e) => {
    const settings = getSettings();
    const value = e.target.value;
    if (value === 'current') {
      updateSettings({ widget: { ...settings.widget, locationSource: 'current', favoriteId: null } });
    } else {
      updateSettings({ widget: { ...settings.widget, locationSource: 'favorite', favoriteId: value } });
    }
  });
}
