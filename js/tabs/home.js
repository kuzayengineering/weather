import * as nws from '../api/nws.js';
import { parseIconUrl } from '../lib/icons.js';
import { formatTemp, formatPrecip, formatWindSpeed, kmhToMph } from '../lib/units.js';
import { indoorEquivalentRH } from '../lib/psychro.js';
import { valueAt, valuesInRange, gridWindMph } from '../lib/griddata.js';
import { OSM_TILE_URL, RADAR_TILE_URL } from '../lib/mapTiles.js';
import { windArrowHtml } from '../lib/wind.js';
import { getCurrentAqi, getAqiForecast, aqiAt, formatAqi } from '../lib/airQuality.js';

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

const WINDOWS_OPEN_MAX_INDOOR_RH = 55;
const WINDOWS_OPEN_MAX_OUTDOOR_TEMP_F = 68;

/**
 * Highest outdoor temperature between 9 PM and 4 AM, in the forecast
 * location's own local time (not the browser's) — derived from `tonight`'s
 * ISO offset so this stays correct for a favorite location in another time zone.
 */
function getOvernightWindowMaxTempF(gridTemp, tonight) {
  if (!tonight?.startTime) return null;
  const datePart = tonight.startTime.slice(0, 10);
  const offsetPart = tonight.startTime.slice(19);
  const windowStart = new Date(`${datePart}T21:00:00${offsetPart}`);
  const windowEnd = new Date(windowStart.getTime() + 7 * 3600000); // 9 PM -> 4 AM

  const intervals = valuesInRange(gridTemp, windowStart, windowEnd);
  if (!intervals.length) return null;
  return Math.max(...intervals.map((i) => cToF(i.value)));
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
  if (wv) kind = wv.replace(/_/g, ' '); // grid data's raw enum values are underscore_separated

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

    // AQI is best-effort — shouldn't break the rest of the page if it fails.
    const [aqiCurrentResult, aqiForecastResult] = await Promise.allSettled([
      getCurrentAqi(location.lat, location.lon),
      getAqiForecast(location.lat, location.lon),
    ]);
    const aqiCurrent = aqiCurrentResult.status === 'fulfilled' ? aqiCurrentResult.value : { available: false };
    const aqiForecast = aqiForecastResult.status === 'fulfilled' ? aqiForecastResult.value : { available: false };

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
      aqiCurrent,
      aqiForecast,
      stale: anyStale,
      staleAgeMs: oldestAgeMs,
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="error">Couldn't load weather data. ${err.offline ? 'You appear to be offline and no cached data is available yet for this location.' : ''}</p>`;
  }
}

function renderContent(container, { location, settings, points, alerts, current, forecast, gridData, aqiCurrent, aqiForecast, stale, staleAgeMs }) {
  const units = settings.units;

  // --- Current conditions ---
  const currentTempF = current.properties.temperature.value != null ? cToF(current.properties.temperature.value) : null;
  const currentRH = current.properties.relativeHumidity.value;
  const icon = parseIconUrl(current.properties.icon);
  const alertFeatures = alerts.features || [];

  const currentWindMph = current.properties.windSpeed.value != null ? kmhToMph(current.properties.windSpeed.value) : null;
  const currentWindDir = current.properties.windDirection.value;

  const currentAqiText = aqiCurrent.available ? formatAqi(aqiCurrent.aqi) : null;

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
  const gridWindSpeed = gridData.properties.windSpeed;
  const gridWindDir = gridData.properties.windDirection;

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

  const tonightWindMph = tonightSampleTime ? gridWindMph(gridWindSpeed, tonightSampleTime) : null;
  const tonightWindDir = tonightSampleTime ? valueAt(gridWindDir, tonightSampleTime) : null;
  const tomorrowWindMph = tomorrowSampleTime ? gridWindMph(gridWindSpeed, tomorrowSampleTime) : null;
  const tomorrowWindDir = tomorrowSampleTime ? valueAt(gridWindDir, tomorrowSampleTime) : null;
  const tomorrowNightWindMph = tomorrowNightSampleTime ? gridWindMph(gridWindSpeed, tomorrowNightSampleTime) : null;
  const tomorrowNightWindDir = tomorrowNightSampleTime ? valueAt(gridWindDir, tomorrowNightSampleTime) : null;

  const tonightAqiText = aqiForecast.available && tonightSampleTime ? formatAqi(aqiAt(aqiForecast, tonightSampleTime)) : null;
  const tomorrowAqiText = aqiForecast.available && tomorrowSampleTime ? formatAqi(aqiAt(aqiForecast, tomorrowSampleTime)) : null;
  const tomorrowNightAqiText = aqiForecast.available && tomorrowNightSampleTime ? formatAqi(aqiAt(aqiForecast, tomorrowNightSampleTime)) : null;

  const overnightMaxTempF = tonight ? getOvernightWindowMaxTempF(gridTemp, tonight) : null;
  const windowsOpen =
    tonightIndoorRH != null &&
    tonightIndoorRH < WINDOWS_OPEN_MAX_INDOOR_RH &&
    overnightMaxTempF != null &&
    overnightMaxTempF < WINDOWS_OPEN_MAX_OUTDOOR_TEMP_F;

  const tonightIcon = tonight ? parseIconUrl(tonight.icon) : null;
  const tomorrowIcon = tomorrow ? parseIconUrl(tomorrow.icon) : null;
  const tomorrowNightIcon = tomorrowNight ? parseIconUrl(tomorrowNight.icon) : null;

  container.innerHTML = `
    <div class="stale-banner ${stale ? 'visible' : ''}">
      Showing cached data${staleAgeMs && Number.isFinite(staleAgeMs) ? ` from ${Math.round(staleAgeMs / 60000)} min ago` : ''}${staleAgeMs > 3600000 ? ' — this may be out of date.' : '.'}
    </div>

    <div class="card">
      <h2>Current Conditions in ${location.label}</h2>
      ${alertFeatures.map((f) => `<div class="alert-banner">⚠️ ${f.properties.event}: ${f.properties.headline || ''}</div>`).join('')}
      <div class="current-conditions">
        <div class="symbol">${icon.symbol}</div>
        <div>
          <div class="temp">${currentTempF != null ? formatTemp(currentTempF, units) : '—'}</div>
          <div class="meta">${icon.label}${current.properties.textDescription && current.properties.textDescription !== icon.label ? ` · ${current.properties.textDescription}` : ''}</div>
          <div class="meta">RH ${currentRH != null ? Math.round(currentRH) : '—'}%</div>
          <div class="meta">
            ${windArrowHtml(currentWindDir, currentWindMph, 'wind-arrow-inline')}
            Wind ${currentWindMph != null ? formatWindSpeed(currentWindMph, units) : '—'}
          </div>
          <div class="meta">AQI ${currentAqiText || '—'}</div>
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
          <div class="label">Tonight</div>
          ${tonightIcon ? `<div class="upcoming-symbol">${tonightIcon.symbol}</div>` : ''}
          <div class="value">${tonight ? formatTemp(tonight.temperatureUnit === 'F' ? tonight.temperature : cToF(tonight.temperature), units) : '—'}</div>
          <div class="sub">${tonightLowTime ? `at ${formatTime(tonightLowTime)}` : ''}</div>
          <div class="sub">Dew pt ${tonightDewF != null ? formatTemp(tonightDewF, units) : '—'}</div>
          <div class="sub">RH ${tonightRH != null ? Math.round(tonightRH) : '—'}%</div>
          <div class="sub">Indoor RH @70°F: ${tonightIndoorRH != null ? Math.round(tonightIndoorRH) + '%' : '—'}</div>
          <div class="sub sub-wind">
            ${windArrowHtml(tonightWindDir, tonightWindMph, 'wind-arrow-inline')}
            ${tonightWindMph != null ? formatWindSpeed(tonightWindMph, units) : '—'}
          </div>
          <div class="sub">AQI ${tonightAqiText || '—'}</div>
          <div class="windows-badge ${windowsOpen ? 'windows-open' : 'windows-closed'}">
            <span class="windows-symbol">${windowsOpen ? '🌬️' : '🪟'}</span>
            <span>${windowsOpen ? 'Windows Open' : 'Windows Closed'}</span>
          </div>
        </div>
        <div class="item">
          <div class="label">Tomorrow's High</div>
          ${tomorrowIcon ? `<div class="upcoming-symbol">${tomorrowIcon.symbol}</div>` : ''}
          <div class="value">${tomorrow ? formatTemp(tomorrow.temperatureUnit === 'F' ? tomorrow.temperature : cToF(tomorrow.temperature), units) : '—'}</div>
          <div class="sub">${tomorrowHighTime ? `at ${formatTime(tomorrowHighTime)}` : ''}</div>
          <div class="sub">RH ${tomorrowRH != null ? Math.round(tomorrowRH) : '—'}%</div>
          <div class="sub sub-wind">
            ${windArrowHtml(tomorrowWindDir, tomorrowWindMph, 'wind-arrow-inline')}
            ${tomorrowWindMph != null ? formatWindSpeed(tomorrowWindMph, units) : '—'}
          </div>
          <div class="sub">AQI ${tomorrowAqiText || '—'}</div>
        </div>
        <div class="item">
          <div class="label">Tomorrow Night's Low</div>
          ${tomorrowNightIcon ? `<div class="upcoming-symbol">${tomorrowNightIcon.symbol}</div>` : ''}
          <div class="value">${tomorrowNight ? formatTemp(tomorrowNight.temperatureUnit === 'F' ? tomorrowNight.temperature : cToF(tomorrowNight.temperature), units) : '—'}</div>
          <div class="sub">${tomorrowNightLowTime ? `at ${formatTime(tomorrowNightLowTime)}` : ''}</div>
          <div class="sub">RH ${tomorrowNightRH != null ? Math.round(tomorrowNightRH) : '—'}%</div>
          <div class="sub sub-wind">
            ${windArrowHtml(tomorrowNightWindDir, tomorrowNightWindMph, 'wind-arrow-inline')}
            ${tomorrowNightWindMph != null ? formatWindSpeed(tomorrowNightWindMph, units) : '—'}
          </div>
          <div class="sub">AQI ${tomorrowNightAqiText || '—'}</div>
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
