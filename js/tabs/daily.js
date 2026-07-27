import * as nws from '../api/nws.js';
import { symbolFromSkyCover } from '../lib/icons.js';
import { formatTemp } from '../lib/units.js';
import { valueAt } from '../lib/griddata.js';
import { getSunTimes } from '../lib/sun.js';
import { evaluateDaylightPrecip, evaluateOvernightPrecip } from '../lib/dailySymbol.js';

const DAYS_SHOWN = 7;
const BAR_TRACK_HEIGHT = 90; // px

function groupIntoDays(periods) {
  const days = [];
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (!p.isDaytime) continue;
    const next = periods[i + 1];
    days.push({
      date: new Date(p.startTime),
      dayPeriod: p,
      nightPeriod: next && !next.isDaytime ? next : null,
    });
    if (days.length >= DAYS_SHOWN) break;
  }
  return days;
}

function pickPrecipIcon(shortForecast) {
  const text = (shortForecast || '').toLowerCase();
  return text.includes('thunder') ? '⛈️' : '🌧️';
}

export async function renderDailyTab(container, location, settings) {
  container.innerHTML = '<p class="loading">Loading daily forecast…</p>';

  try {
    const points = await nws.getPoints(location.lat, location.lon);
    const [forecastRes, gridRes] = await Promise.all([nws.getForecast(points), nws.getGridData(points)]);

    const days = groupIntoDays(forecastRes.data.properties.periods);
    const gridPop = gridRes.data.properties.probabilityOfPrecipitation;
    const gridSkyCover = gridRes.data.properties.skyCover;

    const entries = days.map((day) => buildDayEntry(day, { gridPop, gridSkyCover, lat: location.lat, lon: location.lon }));
    renderContent(container, entries, settings.units);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="error">Couldn't load the daily forecast.${err.offline ? ' You appear to be offline and no cached data is available yet.' : ''}</p>`;
  }
}

function buildDayEntry(day, { gridPop, gridSkyCover, lat, lon }) {
  const sun = getSunTimes(day.date, lat, lon);

  const dayMidpoint = sun ? new Date((sun.sunrise.getTime() + sun.sunset.getTime()) / 2) : new Date(day.dayPeriod.startTime);
  const daySkyCover = valueAt(gridSkyCover, dayMidpoint) ?? 50;
  const dayPrecip = evaluateDaylightPrecip({ gridPop, dayDate: day.date, lat, lon });

  let daySymbol;
  if (dayPrecip.tier === 'rain') {
    daySymbol = pickPrecipIcon(day.dayPeriod.shortForecast);
  } else {
    const base = symbolFromSkyCover(daySkyCover, true);
    daySymbol = dayPrecip.tier === 'brief' ? `${base.symbol}💧` : base.symbol;
  }

  let nightSymbol = null;
  let nightPrecip = null;
  if (day.nightPeriod) {
    nightPrecip = evaluateOvernightPrecip({ gridPop, dayDate: day.date, lat, lon });
    if (nightPrecip.tier === 'rain') {
      nightSymbol = pickPrecipIcon(day.nightPeriod.shortForecast);
    } else {
      const nightMidpoint = sun ? new Date(sun.sunset.getTime() + 3 * 3600000) : new Date(day.nightPeriod.startTime);
      const nightSkyCover = valueAt(gridSkyCover, nightMidpoint) ?? 50;
      const base = symbolFromSkyCover(nightSkyCover, false);
      nightSymbol = nightPrecip.tier === 'brief' ? `${base.symbol}💧` : base.symbol;
    }
  }

  const highF = day.dayPeriod.temperatureUnit === 'F' ? day.dayPeriod.temperature : ((day.dayPeriod.temperature * 9) / 5 + 32);
  const lowF = day.nightPeriod
    ? day.nightPeriod.temperatureUnit === 'F'
      ? day.nightPeriod.temperature
      : (day.nightPeriod.temperature * 9) / 5 + 32
    : null;

  return {
    date: day.date,
    label: day.date.toLocaleDateString([], { weekday: 'short' }),
    highF,
    lowF,
    daySymbol,
    dayPrecip,
    nightSymbol,
    nightPrecip,
  };
}

function renderContent(container, entries, units) {
  const highs = entries.map((e) => e.highF);
  const lows = entries.filter((e) => e.lowF != null).map((e) => e.lowF);
  const globalMax = Math.max(...highs);
  const globalMin = Math.min(...lows, ...highs);
  const range = Math.max(globalMax - globalMin, 1);

  container.innerHTML = `
    <div class="card">
      <h2>${entries.length}-Day Forecast</h2>
      <div class="daily-scroll">
        <div class="daily-columns">
          ${entries
            .map((e) => {
              const lowF = e.lowF ?? globalMin;
              const topPct = 100 * (1 - (e.highF - globalMin) / range);
              const bottomPct = 100 * (1 - (lowF - globalMin) / range);
              const barTop = (topPct / 100) * BAR_TRACK_HEIGHT;
              const barHeight = Math.max(((bottomPct - topPct) / 100) * BAR_TRACK_HEIGHT, 4);

              return `
                <div class="daily-col">
                  <div class="daily-day-label">${e.label}</div>
                  <div class="daily-symbol">${e.daySymbol}</div>
                  <div class="daily-precip-label">${e.dayPrecip.tier !== 'dry' ? `${e.dayPrecip.maxPop}% / ${e.dayPrecip.qualifyingHours}h` : ''}</div>
                  <div class="daily-high">${formatTemp(e.highF, units)}</div>
                  <div class="daily-bar-track" style="height:${BAR_TRACK_HEIGHT}px;">
                    <div class="daily-bar" style="top:${barTop}px; height:${barHeight}px;"></div>
                  </div>
                  <div class="daily-low">${e.lowF != null ? formatTemp(e.lowF, units) : '—'}</div>
                  <div class="daily-symbol daily-symbol-night">${e.nightSymbol || ''}</div>
                  <div class="daily-precip-label">${e.nightPrecip && e.nightPrecip.tier !== 'dry' ? `${e.nightPrecip.maxPop}% / ${e.nightPrecip.qualifyingHours}h` : ''}</div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;
}
