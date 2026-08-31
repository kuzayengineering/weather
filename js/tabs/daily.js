import * as nws from '../api/nws.js';
import { symbolFromSkyCover, precipSymbol, icon as wxIcon } from '../lib/icons.js';
import { formatTemp } from '../lib/units.js';
import { valueAt } from '../lib/griddata.js';
import { getSunTimes } from '../lib/sun.js';
import { evaluateDaylightPrecip, evaluateOvernightPrecip } from '../lib/dailySymbol.js';

const DAYS_SHOWN = 7;

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
  let isWarmIcon = false;
  if (dayPrecip.tier === 'rain') {
    daySymbol = precipSymbol(day.dayPeriod.shortForecast);
  } else {
    const base = symbolFromSkyCover(daySkyCover, true);
    daySymbol = base.symbol;
    isWarmIcon = base.glyph === 'sun' || base.glyph === 'sunCloud';
  }

  let nightSymbol = null;
  let nightPrecip = null;
  if (day.nightPeriod) {
    nightPrecip = evaluateOvernightPrecip({ gridPop, dayDate: day.date, lat, lon });
    if (nightPrecip.tier === 'rain') {
      nightSymbol = precipSymbol(day.nightPeriod.shortForecast);
    } else {
      const nightMidpoint = sun ? new Date(sun.sunset.getTime() + 3 * 3600000) : new Date(day.nightPeriod.startTime);
      const nightSkyCover = valueAt(gridSkyCover, nightMidpoint) ?? 50;
      const base = symbolFromSkyCover(nightSkyCover, false);
      nightSymbol = base.symbol;
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
    isWarmIcon,
    dayPrecip,
    nightSymbol,
    nightPrecip,
  };
}

const dropletIcon = () => wxIcon('droplet');
const infoIcon = () => wxIcon('unknown');

function renderContent(container, entries, units) {
  const highs = entries.map((e) => e.highF);
  const lows = entries.filter((e) => e.lowF != null).map((e) => e.lowF);
  const globalMax = Math.max(...highs);
  const globalMin = Math.min(...lows, ...highs);
  const range = Math.max(globalMax - globalMin, 1);

  // A day whose icon stays dry while still carrying a short likely burst is
  // the whole point of the rain rule — call it out so the icon isn't read as
  // the app having missed the rain.
  const briefDay = entries.find((e) => e.dayPrecip.tier === 'brief');

  container.innerHTML = `
    <div class="tab-head">
      <h1 class="tab-title">${entries.length} days</h1>
      <p class="tab-sub">Rain only shows when it is likely for more than an hour of daylight</p>
    </div>

    <div class="daily-head">
      <div class="daily-day">Day</div>
      <div class="daily-symbol"></div>
      <div class="daily-precip">Rain</div>
      <div class="daily-low">Lo</div>
      <div class="daily-bar-track" style="background:none;"></div>
      <div class="daily-high">Hi</div>
    </div>

    ${entries
      .map((e, i) => {
        const lowF = e.lowF ?? globalMin;
        const leftPct = 100 * ((lowF - globalMin) / range);
        const widthPct = Math.max(100 * ((e.highF - lowF) / range), 3);

        const wet = e.dayPrecip.tier === 'rain';
        const brief = e.dayPrecip.tier === 'brief';
        const symbolClass = wet ? 'is-wet' : e.dayPrecip.tier === 'dry' && e.isWarmIcon ? 'is-warm' : '';

        return `
          <div class="daily-row ${i === 0 ? 'is-today' : ''}">
            <div class="daily-day">${i === 0 ? 'Today' : e.label}</div>
            <div class="daily-symbol ${symbolClass}">
              ${e.daySymbol}
              ${brief ? `<span class="daily-burst">${dropletIcon()}</span>` : ''}
            </div>
            <div class="daily-precip">
              ${
                e.dayPrecip.tier !== 'dry'
                  ? `<span class="chip ${brief ? 'is-brief' : ''}">${e.dayPrecip.maxPop}% &middot; ${e.dayPrecip.qualifyingHours}h</span>`
                  : ''
              }
            </div>
            <div class="daily-low">${e.lowF != null ? formatTemp(e.lowF, units).replace('°', '') : '—'}</div>
            <div class="daily-bar-track">
              <div class="daily-bar" style="left:${leftPct}%; width:${widthPct}%;"></div>
            </div>
            <div class="daily-high">${formatTemp(e.highF, units).replace('°', '')}</div>
          </div>
        `;
      })
      .join('')}

    ${
      briefDay
        ? `<div class="daily-note">
             ${infoIcon()}
             <div>
               <div class="note-title">${briefDay.label} keeps a dry icon</div>
               <div class="note-body">One likely hour in an otherwise dry day does not earn a rain icon &mdash; the chip carries it instead.</div>
             </div>
           </div>`
        : ''
    }
  `;
}
