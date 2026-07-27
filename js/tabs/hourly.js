import * as nws from '../api/nws.js';
import { parseIconUrl } from '../lib/icons.js';
import { formatTemp } from '../lib/units.js';
import { valueAt, gridWindMph } from '../lib/griddata.js';

const HOURS_SHOWN = 36;
const COL_WIDTH = 62; // px — keep in sync with css/styles.css .hourly-col width

function parseWindSpeedMph(str) {
  // forecastHourly windSpeed is a string like "8 mph" or "10 to 15 mph" — take the first number
  const match = str?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

let chartInstance = null;

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

  const rows = hours.map((h) => {
    const start = new Date(h.startTime);
    const icon = parseIconUrl(h.icon);
    const pop = h.probabilityOfPrecipitation?.value ?? 0;
    const rh = h.relativeHumidity?.value;
    const windMph = parseWindSpeedMph(h.windSpeed);
    const gustKmh = valueAt(gridGust, start);
    const gustMph = gustKmh != null ? gridWindMph(gridGust, start) : null;
    const dirDeg = valueAt(gridWindDir, start);
    return { start, icon, pop, rh, windMph, gustMph, dirDeg, tempF: h.temperature };
  });

  container.innerHTML = `
    <div class="card" style="padding-bottom:0.5rem;">
      <h2>Next ${hours.length} Hours</h2>
      <div class="hourly-scroll">
        <div class="hourly-inner" style="width:${totalWidth}px;">
          <canvas id="hourly-temp-chart" height="90"></canvas>
          <div class="hourly-columns">
            ${rows
              .map(
                (r) => `
              <div class="hourly-col">
                <div class="hourly-symbol">${r.icon.symbol}</div>
                <div class="hourly-pop">${r.pop > 0 ? Math.round(r.pop) + '%' : ''}</div>
                <div class="hourly-rh">${r.rh != null ? Math.round(r.rh) + '%' : '—'}</div>
                <div class="hourly-wind">
                  ${
                    r.dirDeg != null
                      ? `<span class="wind-arrow" style="transform: rotate(${(r.dirDeg + 180) % 360}deg)">↑</span>`
                      : ''
                  }
                  <span>${r.windMph != null ? Math.round(r.windMph) : '—'}${r.gustMph ? ` / ${Math.round(r.gustMph)}` : ''}</span>
                </div>
                <div class="hourly-time">${r.start.toLocaleTimeString([], { hour: 'numeric' })}</div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  drawTempChart(rows, units, totalWidth);
}

function drawTempChart(rows, units, totalWidth) {
  const canvas = document.getElementById('hourly-temp-chart');
  canvas.width = totalWidth;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const labels = rows.map((r) => formatTemp(r.tempF, units));
  const values = rows.map((r) => (units === 'metric' ? ((r.tempF - 32) * 5) / 9 : r.tempF));

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map(() => ''),
      datasets: [
        {
          data: values,
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5aa2f0',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        datalabels: false,
      },
      scales: {
        x: { display: false, offset: false },
        y: { display: false },
      },
      layout: { padding: { top: 18, bottom: 4 } },
      elements: { point: { radius: 0 } },
    },
    plugins: [
      {
        id: 'tempLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(0);
          ctx.save();
          ctx.font = '11px system-ui, sans-serif';
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#fff';
          ctx.textAlign = 'center';
          meta.data.forEach((point, i) => {
            ctx.fillText(labels[i], point.x, point.y - 8);
          });
          ctx.restore();
        },
      },
    ],
  });
}
