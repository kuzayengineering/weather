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

  const seg = (name, value, options) =>
    `<div class="segmented" data-seg="${name}">${options
      .map(
        (o) =>
          `<button type="button" data-value="${o.value}" class="${value === o.value ? 'active' : ''}">${o.label}</button>`
      )
      .join('')}</div>`;

  const toggle = (id, on) =>
    `<button type="button" class="toggle" id="${id}" role="switch" aria-checked="${on}"><span class="knob"></span></button>`;

  const pinIcon = `<svg class="wx-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/></svg>`;

  container.innerHTML = `
    <div class="tab-head">
      <h1 class="tab-title">Settings</h1>
    </div>

    <div class="settings-group">
      <p class="section-label">Display</p>
      <div class="settings-card">
        <div class="settings-row">
          <span class="row-title">Units</span>
          ${seg('units', settings.units, [
            { value: 'imperial', label: '°F' },
            { value: 'metric', label: '°C' },
          ])}
        </div>
        <div class="settings-row">
          <span class="row-title">Theme</span>
          ${seg('theme', settings.theme, [
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ])}
        </div>
      </div>
    </div>

    <div class="settings-group">
      <p class="section-label">Location</p>
      <div class="settings-card">
        <div class="settings-row">
          <div>
            <div class="row-title">Use my location</div>
            <div class="row-sub">${
              settings.homeLocationSource === 'current'
                ? 'Home screen follows where you are'
                : 'Home screen uses a saved place instead'
            }</div>
          </div>
          ${toggle('use-current-location', settings.homeLocationSource === 'current')}
        </div>

        ${
          settings.homeLocationSource === 'favorite' && favorites.length
            ? `<div class="settings-row">
                 <span class="row-title">Show</span>
                 ${seg(
                   'home-favorite',
                   settings.homeFavoriteId || favorites[0].id,
                   favorites.map((f) => ({ value: f.id, label: f.label.split(',')[0] }))
                 )}
               </div>`
            : ''
        }

        <div class="favorites-list">
          ${
            favorites.length
              ? favorites
                  .map(
                    (f) => `
                <div class="favorite-row" data-id="${f.id}">
                  <span class="fav-name">${pinIcon}<span>${f.label}</span></span>
                  <button class="remove-favorite-btn" data-id="${f.id}">Remove</button>
                </div>`
                  )
                  .join('')
              : '<p class="settings-note">No saved places yet.</p>'
          }
        </div>
        <div class="add-favorite">
          <input type="text" id="favorite-search-input" placeholder="City, address, or zip code" />
          <button id="favorite-search-btn">Search</button>
        </div>
        <div id="favorite-search-results"></div>
      </div>
    </div>

    <div class="settings-group">
      <p class="section-label">Alerts</p>
      <p class="settings-note">Saved now, delivered once push notifications ship.</p>
      <div class="settings-card">
        <div class="settings-row">
          <div>
            <div class="row-title">Severe weather</div>
            <div class="row-sub">Watches and warnings near you</div>
          </div>
          ${toggle('notif-advisories', settings.notifications.advisories)}
        </div>
        <div class="settings-row">
          <div>
            <div class="row-title">Rain starting soon</div>
            <div class="row-sub">Within the next half hour</div>
          </div>
          ${toggle('notif-precip', settings.notifications.incomingPrecip)}
        </div>
      </div>
    </div>

    <div class="settings-group">
      <p class="section-label">Home screen widget</p>
      <p class="settings-note">Saved now, applied once the Android widget ships.</p>
      <div class="settings-card">
        <div class="settings-row">
          <span class="row-title">Background</span>
          ${seg('widget-background', settings.widget.background, [
            { value: 'none', label: 'None' },
            { value: 'color', label: 'Colour' },
          ])}
        </div>
        <div class="settings-row">
          <span class="row-title" style="${settings.widget.background !== 'color' ? 'color:var(--ink-4)' : ''}">Colour</span>
          <input type="color" id="widget-color" value="${settings.widget.backgroundColor}" ${settings.widget.background !== 'color' ? 'disabled' : ''}/>
        </div>
        <div class="settings-row">
          <span class="row-title" style="${settings.widget.background !== 'color' ? 'color:var(--ink-4)' : ''}">Opacity</span>
          <input type="range" id="widget-opacity" min="0" max="1" step="0.05" value="${settings.widget.backgroundOpacity}" ${settings.widget.background !== 'color' ? 'disabled' : ''}/>
        </div>
      </div>
    </div>
  `;

  wireUnitsAndTheme(container, callbacks);
  wireFavorites(container, callbacks);
  wireHomeLocationSource(container, callbacks);
  wireNotifications(container);
  wireWidget(container, callbacks);
}

/** Segmented controls and toggles replace the old radio/checkbox/select set. */
function onSegment(container, name, handler) {
  const group = container.querySelector(`.segmented[data-seg="${name}"]`);
  if (!group) return;
  group.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      group.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      handler(btn.dataset.value);
    });
  });
}

function onToggle(container, id, handler) {
  const btn = container.querySelector(`#${id}`);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    handler(next);
  });
}

function wireUnitsAndTheme(container, callbacks) {
  onSegment(container, 'units', (value) => {
    updateSettings({ units: value });
    callbacks.onUnitsOrThemeChange?.();
  });

  onSegment(container, 'theme', (value) => {
    updateSettings({ theme: value });
    initTheme();
    // Charts read their colours from CSS tokens at draw time, so a theme
    // change needs a re-render to pick up the new palette.
    callbacks.onUnitsOrThemeChange?.();
  });
}

function wireFavorites(container, callbacks) {
  container.querySelectorAll('.remove-favorite-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const removedId = btn.dataset.id;
      const remaining = removeFavorite(removedId);
      // Don't strand the home screen pointing at a place that no longer exists.
      const settings = getSettings();
      if (settings.homeFavoriteId === removedId) {
        updateSettings({
          homeFavoriteId: remaining[0]?.id ?? null,
          homeLocationSource: remaining.length ? settings.homeLocationSource : 'current',
        });
      }
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
    resultsEl.innerHTML = '<p class="loading">Searching&hellip;</p>';
    try {
      const results = await geocode(query);
      if (!results.length) {
        resultsEl.innerHTML = '<p class="settings-note">No matches found.</p>';
        return;
      }
      resultsEl.innerHTML = results
        .map((r, i) => `<button class="add-result-btn" data-index="${i}">${r.label}</button>`)
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
  onToggle(container, 'use-current-location', (on) => {
    const favorites = getFavorites();
    if (!on && !favorites.length) {
      // Nothing to fall back to — keep following current location.
      container.querySelector('#use-current-location').setAttribute('aria-checked', 'true');
      return;
    }
    updateSettings(
      on
        ? { homeLocationSource: 'current' }
        : { homeLocationSource: 'favorite', homeFavoriteId: getSettings().homeFavoriteId || favorites[0].id }
    );
    renderSettingsTab(container, callbacks);
    callbacks.onLocationSourceChange?.();
  });

  onSegment(container, 'home-favorite', (value) => {
    updateSettings({ homeFavoriteId: value });
    callbacks.onLocationSourceChange?.();
  });
}

function wireNotifications(container) {
  onToggle(container, 'notif-advisories', (on) => {
    const settings = getSettings();
    updateSettings({ notifications: { ...settings.notifications, advisories: on } });
  });
  onToggle(container, 'notif-precip', (on) => {
    const settings = getSettings();
    updateSettings({ notifications: { ...settings.notifications, incomingPrecip: on } });
  });
}

function wireWidget(container, callbacks) {
  const colorInput = container.querySelector('#widget-color');
  const opacityInput = container.querySelector('#widget-opacity');

  onSegment(container, 'widget-background', (value) => {
    const settings = getSettings();
    updateSettings({ widget: { ...settings.widget, background: value } });
    // Re-render so the colour/opacity rows visibly enable or grey out.
    renderSettingsTab(container, callbacks);
  });

  colorInput?.addEventListener('change', (e) => {
    const settings = getSettings();
    updateSettings({ widget: { ...settings.widget, backgroundColor: e.target.value } });
  });

  opacityInput?.addEventListener('change', (e) => {
    const settings = getSettings();
    updateSettings({ widget: { ...settings.widget, backgroundOpacity: Number(e.target.value) } });
  });
}
