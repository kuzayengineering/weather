import * as nws from '../api/nws.js';
import { parseIconUrl } from '../lib/icons.js';
import { formatTemp } from '../lib/units.js';
import { valueAt, gridWindMph } from '../lib/griddata.js';
import { windArrowSize } from '../lib/wind.js';

const HOURS_SHOWN = 36;
const COL_WIDTH = 62; // px — keep in sync with css/styles.css .hourly-col width
const ROW_HEIGHT = 80; // px — height of each chart row (temp / humidity / wind)

function parseWindSpeedMph(str) {
  // forecastHourly windSpeed is a string like "8 mph" or "10 to 15 mph" — take the first number
  const match = str?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

let charts = { temp: null, humidity: null, wind: null };

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
    const rh = h.relativeHumidity?.value ?? null;
    const windMph = parseWindSpeedMph(h.windSpeed);
    const gustMph = valueAt(gridGust, start) != null ? gridWindMph(gridGust, start) : null;
    const dirDeg = valueAt(gridWindDir, start);

    const prevDate = i > 0 ? new Date(hours[i - 1].startTime) : null;
    const isNewDay = !prevDate || prevDate.toDateString() !== start.toDateString();

    return {
      start,
      icon,
      rh,
      windMph,
      gustMph,
      dirDeg,
      tempF: h.temperature,
      dayLabel: isNewDay ? start.toLocaleDateString([], { weekday: 'short' }) : '',
    };
  });

  container.innerHTML = `
    <div class="card" style="padding-bottom:0.5rem;">
      <h2>Next ${hours.length} Hours</h2>
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

          <div class="hourly-chart-label">Humidity</div>
          <canvas id="hourly-humidity-chart" height="${ROW_HEIGHT}"></canvas>

          <div class="hourly-chart-label">Wind Speed / Gust</div>
          <canvas id="hourly-wind-chart" height="${ROW_HEIGHT}"></canvas>

          <div class="hourly-columns hourly-row-wind-dir">
            ${rows
              .map((r) => {
                if (r.dirDeg == null) return '<div class="hourly-col"></div>';
                const size = windArrowSize(r.windMph);
                return `<div class="hourly-col"><span class="wind-arrow" style="font-size:${size}px; transform: rotate(${(r.dirDeg + 180) % 360}deg)">↑</span></div>`;
              })
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  drawTempChart(rows, units, totalWidth);
  drawHumidityChart(rows, totalWidth);
  drawWindChart(rows, totalWidth);
  enableDragScroll(document.getElementById('hourly-scroll'));
}

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
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
      ctx.font = '11px system-ui, sans-serif';
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
  const color = cssVar('--accent', '#5aa2f0');

  charts.temp = new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map(() => ''),
      datasets: [{ data: values, borderColor: color, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.3 }],
    },
    options: baseChartOptions(),
    plugins: [pointLabelPlugin(labels, cssVar('--text', '#fff'))],
  });
}

function drawHumidityChart(rows, totalWidth) {
  const canvas = document.getElementById('hourly-humidity-chart');
  canvas.width = totalWidth;
  charts.humidity?.destroy();

  const labels = rows.map((r) => (r.rh != null ? `${Math.round(r.rh)}%` : ''));
  const values = rows.map((r) => r.rh ?? 0);
  const color = '#4fc3f7';

  charts.humidity = new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map(() => ''),
      datasets: [{ data: values, borderColor: color, backgroundColor: 'rgba(79,195,247,0.15)', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.3 }],
    },
    options: { ...baseChartOptions(), scales: { x: { display: false, offset: false }, y: { display: false, min: 0, max: 100 } } },
    plugins: [pointLabelPlugin(labels, cssVar('--text', '#fff'))],
  });
}

function drawWindChart(rows, totalWidth) {
  const canvas = document.getElementById('hourly-wind-chart');
  canvas.width = totalWidth;
  charts.wind?.destroy();

  const speeds = rows.map((r) => r.windMph ?? 0);
  const gustDeltas = rows.map((r) => Math.max((r.gustMph ?? r.windMph ?? 0) - (r.windMph ?? 0), 0));
  const labels = rows.map((r) => (r.windMph != null ? `${Math.round(r.windMph)}${r.gustMph ? `/${Math.round(r.gustMph)}` : ''}` : ''));

  charts.wind = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map(() => ''),
      datasets: [
        { data: speeds, backgroundColor: '#66bb6a', stack: 'wind', barPercentage: 0.6 },
        { data: gustDeltas, backgroundColor: 'rgba(102,187,106,0.4)', stack: 'wind', barPercentage: 0.6 },
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
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillStyle = cssVar('--text-muted', '#99a6b3');
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
