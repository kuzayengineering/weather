import * as nws from '../api/nws.js';
import { getNearbyAqi, aqiColor } from '../lib/airnow.js';
import { OSM_TILE_URL, RADAR_TILE_URL, CLOUD_TILE_URL } from '../lib/mapTiles.js';

const ALERT_COLORS = {
  Extreme: '#7e0023',
  Severe: '#ff0000',
  Moderate: '#ff7e00',
  Minor: '#ffff00',
  Unknown: '#5aa2f0',
};

let map = null;
let radarLayer = null;
let radarFrameTimer = null;
let radarFrameIndex = 0;
let radarFrames = ['900913']; // fallback: latest only

export async function renderMapsTab(container, location) {
  if (map) {
    // Already initialized — just recenter, and re-measure in case the container
    // was hidden (display:none on an inactive tab) when it was last sized.
    map.invalidateSize();
    map.setView([location.lat, location.lon]);
    return;
  }

  container.innerHTML = `
    <div class="card" style="padding:0;">
      <div id="leaflet-map" style="height:70vh; border-radius:12px; overflow:hidden;"></div>
      <div class="map-controls">
        <button id="radar-play-btn">▶ Animate Radar</button>
        <span id="radar-frame-label" class="meta"></span>
      </div>
    </div>
  `;

  map = L.map('leaflet-map').setView([location.lat, location.lon], 7);

  L.tileLayer(OSM_TILE_URL, {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 12,
  }).addTo(map);

  radarLayer = L.tileLayer(RADAR_TILE_URL.replace('{time}', '900913'), {
    opacity: 0.65,
    attribution: 'Radar: Iowa Environmental Mesonet / NEXRAD',
  }).addTo(map);

  const cloudLayer = L.tileLayer(CLOUD_TILE_URL, {
    opacity: 0.5,
    attribution: 'Satellite: Iowa Environmental Mesonet / GOES-East',
  });

  const advisoriesLayer = L.layerGroup();
  const aqiLayer = L.layerGroup();

  L.control
    .layers(
      null,
      {
        'Radar': radarLayer,
        'Cloud Cover': cloudLayer,
        'Advisories': advisoriesLayer,
        'Air Quality': aqiLayer,
      },
      { collapsed: false }
    )
    .addTo(map);

  L.control.scale({ imperial: true, metric: true }).addTo(map);

  loadRadarFrameList();
  container.querySelector('#radar-play-btn').addEventListener('click', toggleRadarAnimation);

  loadAdvisories(location, advisoriesLayer);
  loadAqi(location, aqiLayer);
}

async function loadRadarFrameList() {
  // IEM frame naming: nexrad-n0q-YYYYMMDDHHMI (5-minute steps, UTC). Build the
  // last ~12 frames (1 hour) ending on the most recent 5-minute mark.
  const now = new Date();
  now.setUTCSeconds(0, 0);
  now.setUTCMinutes(now.getUTCMinutes() - (now.getUTCMinutes() % 5));

  const frames = [];
  for (let i = 11; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 5 * 60000);
    const stamp = t.toISOString().slice(0, 16).replace(/[-T:]/g, '');
    frames.push(stamp);
  }
  radarFrames = frames;
}

function toggleRadarAnimation() {
  const btn = document.getElementById('radar-play-btn');
  const label = document.getElementById('radar-frame-label');

  if (radarFrameTimer) {
    clearInterval(radarFrameTimer);
    radarFrameTimer = null;
    btn.textContent = '▶ Animate Radar';
    label.textContent = '';
    radarLayer.setUrl(RADAR_TILE_URL.replace('{time}', '900913'));
    return;
  }

  btn.textContent = '⏸ Stop';
  radarFrameIndex = 0;
  radarFrameTimer = setInterval(() => {
    const stamp = radarFrames[radarFrameIndex];
    radarLayer.setUrl(RADAR_TILE_URL.replace('{time}', stamp));
    label.textContent = `${stamp.slice(4, 6)}/${stamp.slice(6, 8)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)} UTC`;
    radarFrameIndex = (radarFrameIndex + 1) % radarFrames.length;
  }, 500);
}

async function loadAdvisories(location, layerGroup) {
  try {
    const alerts = await nws.getActiveAlerts(location.lat, location.lon);
    const features = alerts.data.features || [];
    const zoneCache = new Map();

    for (const feature of features) {
      let geometry = feature.geometry;

      if (!geometry) {
        const zoneUrl = feature.properties.affectedZones?.[0];
        if (!zoneUrl) continue;
        if (!zoneCache.has(zoneUrl)) {
          try {
            const zone = await nws.getZone(zoneUrl);
            zoneCache.set(zoneUrl, zone.data.geometry);
          } catch {
            zoneCache.set(zoneUrl, null);
          }
        }
        geometry = zoneCache.get(zoneUrl);
      }
      if (!geometry) continue;

      const color = ALERT_COLORS[feature.properties.severity] || ALERT_COLORS.Unknown;
      const layer = L.geoJSON(geometry, {
        style: { color, weight: 1, fillOpacity: 0.2 },
      });
      layer.bindPopup(`<strong>${feature.properties.event}</strong><br/>${feature.properties.headline || ''}`);
      layer.addTo(layerGroup);
    }
  } catch (err) {
    console.error('Failed to load advisories layer', err);
  }
}

async function loadAqi(location, layerGroup) {
  try {
    const result = await getNearbyAqi(location.lat, location.lon, 100);
    if (!result.available) return;

    for (const reading of result.readings) {
      const marker = L.circleMarker([reading.Latitude, reading.Longitude], {
        radius: 10,
        color: aqiColor(reading.Category.Number),
        fillColor: aqiColor(reading.Category.Number),
        fillOpacity: 0.8,
        weight: 1,
      });
      marker.bindPopup(
        `<strong>${reading.ReportingArea}</strong><br/>${reading.ParameterName} AQI: ${reading.AQI} (${reading.Category.Name})`
      );
      marker.addTo(layerGroup);
    }
  } catch (err) {
    console.error('Failed to load AQI layer', err);
  }
}
