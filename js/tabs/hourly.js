import * as nws from '../api/nws.js';
import { parseIconUrl } from '../lib/icons.js';
import { formatTemp } from '../lib/units.js';
import { valueAt, gridWindMph } from '../lib/griddata.js';
import { windArrowHtml } from '../lib/wind.js';

const HOURS_SHOWN = 36;
const COL_WIDTH = 58; // px — keep in sync with css/styles.css .hourly-col width
const ROW_HEIGHT = 80; // px — height of each chart row (temp / humidity / wind)

function parseWindSpeedMph(str) {
  // forecastHourly windSpeed is a string like "8 mph" or "10 to 15 mph" — take the first number
  const match = str?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

let charts = { temp: null, pop: null, humidity: null, wind: null };

export async function renderHourlyTab(container, location, settings) {
  container.innerHTML = '<p class="loading">Loading hourly forecast…</p>';

  try {
    const points = await nws.getPoints(location.lat, location.lon);
    const [hourlyRes, gridRes] = await Promise.all([nws.getHourlyForecast(points), nws.getGridData(points)]);

    const hours = hourlyRes.data.properties.periods.slice(0, HOURS_SHOWN);
    const gridGust = gridRes.data.properties.windGust;
    const gridWindDir = gridRes.data.properties.windDirection;

    renderContent(container, { hours, gridGust, gridWindDir, units: settings.units });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="error">Couldn't load the hourly forecast.${err.offline ? ' You appear to be offline and no cached data is available yet.' : ''}</p>`;
  }
}

function renderContent(container, { hours, gridGust, gridWindDir, units }) {
  const totalWidth = hours.length * COL_WIDTH;

  const rows = hours.map((h, i) => {
    const start = new Date(h.startTime);
    const icon = parseIconUrl(h.icon);
    const pop = h.probabilityOfPrecipitation?.value ?? null;
    const rh = h.relativeHumidity?.value ?? null;
    const windMph = parseWindSpeedMph(h.windSpeed);
    const gustMph = valueAt(gridGust, start) != null ? gridWindMph(gridGust, start) : null;
    const dirDeg = valueAt(gridWindDir, start);

    const prevDate = i > 0 ? new Date(hours[i - 1].startTime) : null;
    const isNewDay = !prevDate || prevDate.toDateString() !== start.toDateString();

    return {
      start,
      icon,
      pop,
      rh,
      windMph,
      gustMph,
      dirDeg,
      tempF: h.temperature,
      dayLabel: isNewDay ? start.toLocaleDateString([], { weekday: 'short' }) : '',
    };
  });

  container.innerHTML = `
    <div class="tab-head">
      <h1 class="tab-title">Next ${hours.length} hours</h1>
      <p class="tab-sub">Drag sideways to scan ahead</p>
    </div>
    <div class="hourly-scroll" id="hourly-scroll">
        <div class="hourly-inner" style="width:${totalWidth}px;">
          <div class="hourly-columns hourly-row-day">
            ${rows.map((r) => `<div class="hourly-col">${r.dayLabel}</div>`).join('')}
          </div>
          <div class="hourly-columns hourly-row-time">
            ${rows.map((r) => `<div class="hourly-col">${r.start.toLocaleTimeString([], { hour: 'numeric' })}</div>`).join('')}
          </div>
          <div class="hourly-columns hourly-row-symbol">
            ${rows.map((r) => `<div class="hourly-col"><span class="hourly-symbol">${r.icon.symbol}</span></div>`).join('')}
          </div>

          <div class="hourly-chart-label">Temperature</div>
          <canvas id="hourly-temp-chart" height="${ROW_HEIGHT}"></canvas>

          <div class="hourly-chart-label">Chance of rain</div>
          <canvas id="hourly-pop-chart" height="${ROW_HEIGHT}"></canvas>

          <div class="hourly-chart-label">Humidity</div>
          <canvas id="hourly-humidity-chart" height="${ROW_HEIGHT}"></canvas>

          <div class="hourly-chart-label">Wind &amp; gusts <span class="unit">mph</span></div>
          <canvas id="hourly-wind-chart" height="${ROW_HEIGHT}"></canvas>

          <div class="hourly-columns hourly-row-wind-dir">
            ${rows
              .map((r) => `<div class="hourly-col">${windArrowHtml(r.dirDeg, r.windMph)}</div>`)
              .join('')}
        </div>
      </div>
    </div>
  `;

  drawTempChart(rows, units, totalWidth);
  drawPopChart(rows, totalWidth);
  drawHumidityChart(rows, totalWidth);
  drawWindChart(rows, totalWidth);
  enableDragScroll(document.getElementById('hourly-scroll'));
}

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** "#e8c98a" -> "232,201,138", so tokens can drive canvas gradients. */
function rgbOf(hex) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Vertical fade used under the line charts. */
function areaGradient(canvas, hex, topAlpha) {
  const g = canvas.getContext('2d').createLinearGradient(0, 0, 0, canvas.height);
  const rgb = rgbOf(hex);
  g.addColorStop(0, `rgba(${rgb},${topAlpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  return g;
}

function baseChartOptions() {
  return {
    responsive: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false, offset: false },
      y: { display: false },
    },
    layout: { padding: { top: 18, bottom: 4 } },
  };
}

function pointLabelPlugin(labels, color) {
  return {
    id: 'pointLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font = '600 11px "Bricolage Grotesque", system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      meta.data.forEach((point, i) => {
        if (labels[i]) ctx.fillText(labels[i], point.x, point.y - 8);
      });
      ctx.restore();
    },
  };
}

function drawTempChart(rows, units, totalWidth) {
  const canvas = document.getElementById('hourly-temp-chart');
  canvas.width = totalWidth;
  charts.temp?.destroy();

  const labels = rows.map((r) => formatTemp(r.tempF, units));
  const values = rows.map((r) => (units === 'metric' ? ((r.tempF - 32) * 5) / 9 : r.tempF));
  const color = cssVar('--warm', '#e8c98a');

  charts.temp = new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map(() => ''),
      datasets: [{ data: values, borderColor: color, backgroundColor: areaGradient(canvas, color, 0.22), fill: true, borderWidth: 2, pointRadius: 0, tension: 0.3 }],
    },
    options: baseChartOptions(),
    plugins: [pointLabelPlugin(labels, cssVar('--ink', '#f7f4e6'))],
  });
}

function drawPopChart(rows, totalWidth) {
  const canvas = document.getElementById('hourly-pop-chart');
  canvas.width = totalWidth;
  charts.pop?.destroy();

  const labels = rows.map((r) => (r.pop != null && r.pop > 0 ? `${Math.round(r.pop)}%` : ''));
  const values = rows.map((r) => r.pop ?? 0);
  const color = cssVar('--cool', '#9ec6ef');

  charts.pop = new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map(() => ''),
      datasets: [{ data: values, borderColor: color, backgroundColor: areaGradient(canvas, color, 0.26), fill: true, borderWidth: 2, pointRadius: 0, tension: 0.3 }],
    },
    options: { ...baseChartOptions(), scales: { x: { display: false, offset: false }, y: { display: false, min: 0, max: 100 } } },
    plugins: [pointLabelPlugin(labels, cssVar('--ink', '#f7f4e6'))],
  });
}

function drawHumidityChart(rows, totalWidth) {
  const canvas = document.getElementById('hourly-humidity-chart');
  canvas.width = totalWidth;
  charts.humidity?.destroy();

  const labels = rows.map((r) => (r.rh != null ? `${Math.round(r.rh)}%` : ''));
  const values = rows.map((r) => r.rh ?? 0);
  const color = cssVar('--ink-3', '#8e9fae');

  charts.humidity = new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map(() => ''),
      datasets: [{ data: values, borderColor: color, backgroundColor: 'transparent', borderWidth: 1.8, pointRadius: 0, tension: 0.3 }],
    },
    options: { ...baseChartOptions(), scales: { x: { display: false, offset: false }, y: { display: false, min: 0, max: 100 } } },
    plugins: [pointLabelPlugin(labels, cssVar('--ink', '#f7f4e6'))],
  });
}

function drawWindChart(rows, totalWidth) {
  const canvas = document.getElementById('hourly-wind-chart');
  canvas.width = totalWidth;
  charts.wind?.destroy();

  const speeds = rows.map((r) => r.windMph ?? 0);
  const gustDeltas = rows.map((r) => Math.max((r.gustMph ?? r.windMph ?? 0) - (r.windMph ?? 0), 0));
  const labels = rows.map((r) => (r.windMph != null ? `${Math.round(r.windMph)}${r.gustMph ? `/${Math.round(r.gustMph)}` : ''}` : ''));
  const windColor = cssVar('--cool', '#9ec6ef');

  charts.wind = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map(() => ''),
      datasets: [
        { data: speeds, backgroundColor: windColor, stack: 'wind', barPercentage: 0.55, borderRadius: 3 },
        { data: gustDeltas, backgroundColor: `rgba(${rgbOf(windColor)},0.2)`, stack: 'wind', barPercentage: 0.55, borderRadius: 3 },
      ],
    },
    options: {
      ...baseChartOptions(),
      scales: { x: { display: false, offset: false, stacked: true }, y: { display: false, stacked: true } },
    },
    plugins: [
      {
        id: 'windLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(1);
          ctx.save();
          ctx.font = '500 10px "Bricolage Grotesque", system-ui, sans-serif';
          ctx.fillStyle = cssVar('--ink-3', '#8e9fae');
          ctx.textAlign = 'center';
          meta.data.forEach((point, i) => {
            if (labels[i]) ctx.fillText(labels[i], point.x, point.y - 6);
          });
          ctx.restore();
        },
      },
    ],
  });
}

/** Click-and-drag horizontal panning for desktop mouse users (touch/scrollbar already work natively). */
function enableDragScroll(el) {
  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;

  el.addEventListener('mousedown', (e) => {
    isDown = true;
    el.classList.add('dragging');
    startX = e.clientX;
    startScrollLeft = el.scrollLeft;
  });

  window.addEventListener('mouseup', () => {
    isDown = false;
    el.classList.remove('dragging');
  });

  el.addEventListener('mouseleave', () => {
    isDown = false;
    el.classList.remove('dragging');
  });

  el.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    el.scrollLeft = startScrollLeft - (e.clientX - startX);
  });
}
