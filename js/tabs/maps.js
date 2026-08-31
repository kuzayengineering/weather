import * as nws from '../api/nws.js';
import { getCurrentAqi, aqiCategory, aqiColor } from '../lib/airQuality.js';
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
    <div class="map-layer-chips" id="map-layer-chips">
      <button class="map-chip active" data-layer="radar">Radar</button>
      <button class="map-chip" data-layer="cloud">Clouds</button>
      <button class="map-chip" data-layer="aqi">Air</button>
      <button class="map-chip" data-layer="advisories">Alerts</button>
    </div>
    <div id="leaflet-map"></div>
    <div class="map-controls">
      <div class="map-time">
        <span class="stamp" id="radar-frame-label">Latest</span>
        <span class="rel" id="radar-frame-rel">radar</span>
      </div>
      <button class="map-play" id="radar-play-btn">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5Z"/></svg>
        <span id="radar-play-text">Play</span>
      </button>
    </div>
    <div class="radar-legend">
      <span>Light</span>
      <span class="ramp"></span>
      <span>Heavy</span>
    </div>
  `;

  map = L.map('leaflet-map', { zoomControl: false }).setView([location.lat, location.lon], 7);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer(OSM_TILE_URL, {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 12,
  }).addTo(map);

  radarLayer = L.tileLayer(RADAR_TILE_URL.replace('{time}', '900913'), {
    opacity: 0.65,
    attribution: 'Radar: Iowa Environmental Mesonet / NEXRAD',
  }).addTo(map);

  const layers = {
    radar: radarLayer,
    cloud: L.tileLayer(CLOUD_TILE_URL, {
      opacity: 0.5,
      attribution: 'Satellite: Iowa Environmental Mesonet / GOES-East',
    }),
    advisories: L.layerGroup(),
    aqi: L.layerGroup(),
  };

  // Chips replace Leaflet's boxed layer control — same toggling, less chrome.
  container.querySelectorAll('.map-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const layer = layers[chip.dataset.layer];
      if (!layer) return;
      const on = map.hasLayer(layer);
      if (on) map.removeLayer(layer);
      else map.addLayer(layer);
      chip.classList.toggle('active', !on);
    });
  });

  L.control.scale({ imperial: true, metric: true, position: 'bottomleft' }).addTo(map);

  loadRadarFrameList();
  container.querySelector('#radar-play-btn').addEventListener('click', toggleRadarAnimation);

  loadAdvisories(location, layers.advisories);
  loadAqi(location, layers.aqi);
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
  const playText = document.getElementById('radar-play-text');
  const label = document.getElementById('radar-frame-label');
  const rel = document.getElementById('radar-frame-rel');

  if (radarFrameTimer) {
    clearInterval(radarFrameTimer);
    radarFrameTimer = null;
    playText.textContent = 'Play';
    label.textContent = 'Latest';
    rel.textContent = 'radar';
    radarLayer.setUrl(RADAR_TILE_URL.replace('{time}', '900913'));
    return;
  }

  playText.textContent = 'Pause';
  radarFrameIndex = 0;
  radarFrameTimer = setInterval(() => {
    const stamp = radarFrames[radarFrameIndex];
    radarLayer.setUrl(RADAR_TILE_URL.replace('{time}', stamp));

    // stamp is YYYYMMDDHHMM in UTC — show it in the viewer's own clock instead
    const frameTime = new Date(
      Date.UTC(
        +stamp.slice(0, 4),
        +stamp.slice(4, 6) - 1,
        +stamp.slice(6, 8),
        +stamp.slice(8, 10),
        +stamp.slice(10, 12)
      )
    );
    label.textContent = frameTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const minsAgo = Math.round((Date.now() - frameTime.getTime()) / 60000);
    rel.textContent = minsAgo <= 1 ? 'now' : `${minsAgo} min ago`;

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
    const result = await getCurrentAqi(location.lat, location.lon);
    if (!result.available) return;

    const category = aqiCategory(result.aqi);
    const marker = L.circleMarker([location.lat, location.lon], {
      radius: 12,
      color: aqiColor(category.number),
      fillColor: aqiColor(category.number),
      fillOpacity: 0.8,
      weight: 1,
    });
    marker.bindPopup(`<strong>Air Quality</strong><br/>AQI: ${result.aqi} (${category.name})`);
    marker.addTo(layerGroup);
  } catch (err) {
    console.error('Failed to load AQI layer', err);
  }
}
