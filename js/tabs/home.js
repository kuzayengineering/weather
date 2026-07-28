import * as nws from '../api/nws.js';
import { parseIconUrl } from '../lib/icons.js';
import { formatTemp, formatPrecip } from '../lib/units.js';
import { indoorEquivalentRH } from '../lib/psychro.js';
import { valueAt, valuesInRange } from '../lib/griddata.js';
import { OSM_TILE_URL, RADAR_TILE_URL } from '../lib/mapTiles.js';

const cToF = (c) => (c * 9) / 5 + 32;

let homeMap = null;

function findPeriod(periods, predicate) {
  return periods.find(predicate);
}

/** Finds the time of day a temperature extreme (max or min) occurs within [start, end). */
function findExtremeTime(gridTemp, start, end, mode) {
  const intervals = valuesInRange(gridTemp, start, end);
  if (!intervals.length) return null;
  const best = intervals.reduce((acc, i) => {
    if (i.value == null) return acc;
    if (!acc) return i;
    return mode === 'max' ? (i.value > acc.value ? i : acc) : i.value < acc.value ? i : acc;
  }, null);
  return best ? best.start : null;
}

function formatTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function summarizeNext8Hours(gridData, now) {
  const end = new Date(now.getTime() + 8 * 3600000);
  const pop = valuesInRange(gridData.properties.probabilityOfPrecipitation, now, end);
  const qpf = valuesInRange(gridData.properties.quantitativePrecipitation, now, end);
  const weather = valuesInRange(gridData.properties.weather, now, end);

  const totalMm = qpf.reduce((sum, i) => sum + (i.value || 0), 0);
  const significant = pop.find((i) => (i.value || 0) >= 30);

  if (!significant && totalMm === 0) {
    return { expected: false };
  }

  let kind = 'precipitation';
  const weatherAtStart = weather.find((w) => w.start <= (significant?.start || now));
  const wv = weatherAtStart?.value?.[0]?.weather;
  if (wv) kind = wv;

  return {
    expected: true,
    startTime: significant?.start || pop[0]?.start,
    kind,
    amountIn: totalMm / 25.4,
  };
}

export async function renderHomeTab(container, location, settings) {
  container.innerHTML = '<p class="loading">Loading current conditions…</p>';

  try {
    const points = await nws.getPoints(location.lat, location.lon);
    const [alerts, current, forecast, gridDataRes] = await Promise.all([
      nws.getActiveAlerts(location.lat, location.lon),
      nws.getCurrentConditions(points),
      nws.getForecast(points),
      nws.getGridData(points),
    ]);

    const anyStale = [points, alerts, current, forecast, gridDataRes].some((r) => r.stale);
    const oldestAgeMs = Math.max(
      ...[points, alerts, current, forecast, gridDataRes].map((r) => r.ageMs || 0)
    );

    renderContent(container, {
      location,
      settings,
      points: points.data,
      alerts: alerts.data,
      current: current.data,
      forecast: forecast.data,
      gridData: gridDataRes.data,
      stale: anyStale,
      staleAgeMs: oldestAgeMs,
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="error">Couldn't load weather data. ${err.offline ? 'You appear to be offline and no cached data is available yet for this location.' : ''}</p>`;
  }
}

function renderContent(container, { location, settings, points, alerts, current, forecast, gridData, stale, staleAgeMs }) {
  const units = settings.units;

  // --- Current conditions ---
  const currentTempF = current.properties.temperature.value != null ? cToF(current.properties.temperature.value) : null;
  const currentRH = current.properties.relativeHumidity.value;
  const icon = parseIconUrl(current.properties.icon);
  const alertFeatures = alerts.features || [];

  const now = new Date();
  const precipSummary = summarizeNext8Hours(gridData, now);

  // --- Upcoming conditions: Tonight / Tomorrow / Tomorrow Night ---
  const periods = forecast.properties.periods;
  const tonight = findPeriod(periods, (p) => !p.isDaytime && p.number === periods[0].number + (periods[0].isDaytime ? 1 : 0)) || periods.find((p) => !p.isDaytime);
  const tonightIdx = periods.indexOf(tonight);
  const tomorrow = periods.slice(tonightIdx + 1).find((p) => p.isDaytime);
  const tomorrowIdx = periods.indexOf(tomorrow);
  const tomorrowNight = periods.slice(tomorrowIdx + 1).find((p) => !p.isDaytime);

  // NWS's /forecast endpoint doesn't include dewpoint/RH per period — pull those
  // from the raw grid data instead, sampled at the temperature-extreme time.
  const gridTemp = gridData.properties.temperature;
  const gridDewpoint = gridData.properties.dewpoint;
  const gridRH = gridData.properties.relativeHumidity;

  const tonightLowTime = tonight ? findExtremeTime(gridTemp, new Date(tonight.startTime), new Date(tonight.endTime), 'min') : null;
  const tomorrowHighTime = tomorrow ? findExtremeTime(gridTemp, new Date(tomorrow.startTime), new Date(tomorrow.endTime), 'max') : null;
  const tomorrowNightLowTime = tomorrowNight ? findExtremeTime(gridTemp, new Date(tomorrowNight.startTime), new Date(tomorrowNight.endTime), 'min') : null;

  const tonightSampleTime = tonightLowTime || (tonight && new Date(tonight.startTime));
  const tomorrowSampleTime = tomorrowHighTime || (tomorrow && new Date(tomorrow.startTime));
  const tomorrowNightSampleTime = tomorrowNightLowTime || (tomorrowNight && new Date(tomorrowNight.startTime));

  const tonightDewC = tonightSampleTime ? valueAt(gridDewpoint, tonightSampleTime) : null;
  const tonightDewF = tonightDewC != null ? cToF(tonightDewC) : null;
  const tonightRH = tonightSampleTime ? valueAt(gridRH, tonightSampleTime) : null;
  const tonightIndoorRH = tonightDewF != null ? indoorEquivalentRH(tonightDewF, 70) : null;

  const tomorrowRH = tomorrowSampleTime ? valueAt(gridRH, tomorrowSampleTime) : null;
  const tomorrowNightRH = tomorrowNightSampleTime ? valueAt(gridRH, tomorrowNightSampleTime) : null;

  container.innerHTML = `
    <div class="stale-banner ${stale ? 'visible' : ''}">
      Showing cached data${staleAgeMs && Number.isFinite(staleAgeMs) ? ` from ${Math.round(staleAgeMs / 60000)} min ago` : ''}${staleAgeMs > 3600000 ? ' — this may be out of date.' : '.'}
    </div>

    <div class="card">
      <h2>Current Conditions</h2>
      ${alertFeatures.map((f) => `<div class="alert-banner">⚠️ ${f.properties.event}: ${f.properties.headline || ''}</div>`).join('')}
      <div class="current-conditions">
        <div class="symbol">${icon.symbol}</div>
        <div>
          <div class="temp">${currentTempF != null ? formatTemp(currentTempF, units) : '—'}</div>
          <div class="meta">${icon.label}${current.properties.textDescription && current.properties.textDescription !== icon.label ? ` · ${current.properties.textDescription}` : ''}</div>
          <div class="meta">RH ${currentRH != null ? Math.round(currentRH) : '—'}%</div>
        </div>
      </div>
      <p class="meta" style="margin-top:0.75rem;">
        ${
          precipSummary.expected
            ? `Expect ${precipSummary.kind} ${precipSummary.startTime ? `around ${formatTime(precipSummary.startTime)}` : 'in the next 8 hours'}${precipSummary.amountIn > 0 ? `, about ${formatPrecip(precipSummary.amountIn, units)}` : ''}.`
            : 'No precipitation expected in the next 8 hours.'
        }
      </p>
    </div>

    <div class="card">
      <h2>Upcoming</h2>
      <div class="upcoming-grid">
        <div class="item">
          <div class="label">Tonight's Low</div>
          <div class="value">${tonight ? formatTemp(tonight.temperatureUnit === 'F' ? tonight.temperature : cToF(tonight.temperature), units) : '—'}</div>
          <div class="sub">Dew pt ${tonightDewF != null ? formatTemp(tonightDewF, units) : '—'}</div>
          <div class="sub">RH ${tonightRH != null ? Math.round(tonightRH) : '—'}%</div>
          <div class="sub">Indoor RH @70°F: ${tonightIndoorRH != null ? Math.round(tonightIndoorRH) + '%' : '—'}</div>
        </div>
        <div class="item">
          <div class="label">Tomorrow's High</div>
          <div class="value">${tomorrow ? formatTemp(tomorrow.temperatureUnit === 'F' ? tomorrow.temperature : cToF(tomorrow.temperature), units) : '—'}</div>
          <div class="sub">RH ${tomorrowRH != null ? Math.round(tomorrowRH) : '—'}%</div>
          <div class="sub">${tomorrowHighTime ? `at ${formatTime(tomorrowHighTime)}` : ''}</div>
        </div>
        <div class="item">
          <div class="label">Tomorrow Night's Low</div>
          <div class="value">${tomorrowNight ? formatTemp(tomorrowNight.temperatureUnit === 'F' ? tomorrowNight.temperature : cToF(tomorrowNight.temperature), units) : '—'}</div>
          <div class="sub">RH ${tomorrowNightRH != null ? Math.round(tomorrowNightRH) : '—'}%</div>
          <div class="sub">${tomorrowNightLowTime ? `at ${formatTime(tomorrowNightLowTime)}` : ''}</div>
        </div>
      </div>
    </div>

    <div class="card radar-box">
      <h2>Radar</h2>
      <div id="home-radar-map" class="home-map"></div>
      <button id="open-full-map-btn" class="link-btn">Open full map ↗</button>
    </div>
  `;

  container.querySelector('#open-full-map-btn')?.addEventListener('click', () => {
    document.querySelector('button[data-tab="maps"]')?.click();
  });

  initHomeMap(location);
}

function initHomeMap(location) {
  if (homeMap) {
    try {
      homeMap.remove();
    } catch {
      // container already gone (innerHTML was replaced) — nothing to clean up
    }
    homeMap = null;
  }

  homeMap = L.map('home-radar-map', {
    center: [location.lat, location.lon],
    zoom: 7,
    scrollWheelZoom: false, // avoid hijacking the page scroll when the user scrolls past it
  });

  L.tileLayer(OSM_TILE_URL, { attribution: '&copy; OpenStreetMap contributors', maxZoom: 12 }).addTo(homeMap);
  L.tileLayer(RADAR_TILE_URL.replace('{time}', '900913'), {
    opacity: 0.65,
    attribution: 'Radar: Iowa Environmental Mesonet / NEXRAD',
  }).addTo(homeMap);
}

/** Called by app.js when the Home tab becomes active again, in case the map
 *  was (re)created while its container was hidden and sized itself to zero. */
export function refreshHomeMapSize() {
  homeMap?.invalidateSize();
}
