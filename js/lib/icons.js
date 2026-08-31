// Weather condition icons, drawn as inline SVG.
//
// Emoji were the previous approach and caused two real problems: some glyphs
// (notably the ZWJ "face in clouds" sequence) rendered as a blank box on
// Windows, and emoji can't take the theme's colour. These are stroke-based on
// a 24px grid, sized with `width: 1em` so an ancestor's font-size still
// controls them, and stroked with `currentColor` so they inherit text colour.

const S = 'stroke-linecap="round" stroke-linejoin="round"';

function svg(paths, extraClass = '') {
  return `<svg class="wx-icon ${extraClass}" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ${S} aria-hidden="true">${paths}</svg>`;
}

const CLOUD = 'M7 18.5h10.6a3.6 3.6 0 0 0 .2-7.2 5.4 5.4 0 0 0-10.2-1.6A4.2 4.2 0 0 0 7 18.5Z';
const CLOUD_RAISED = 'M7 16.3h10.6a3.6 3.6 0 0 0 .2-7.2 5.4 5.4 0 0 0-10.2-1.6A4.2 4.2 0 0 0 7 16.3Z';
const CLOUD_SMALL = 'M6 19h9.4a3.4 3.4 0 0 0 .2-6.8 5.1 5.1 0 0 0-9.6-1.5A4 4 0 0 0 6 19Z';
const THERMOMETER = 'M14 14.6V5.2a2 2 0 1 0-4 0v9.4a4.2 4.2 0 1 0 4 0Z';

const GLYPHS = {
  sun: `<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M5.4 5.4 7 7M17 17l1.6 1.6"/>`,
  moon: `<path d="M20.5 14.6A8.3 8.3 0 0 1 9.4 3.5a7.3 7.3 0 1 0 11.1 11.1Z"/>`,
  sunCloud: `<circle cx="16.5" cy="7.5" r="2.9"/><path d="M16.5 2.4v1.5M21.6 7.5h-1.5M20.1 3.9l-1 1M20.1 11.1l-1-1"/><path d="${CLOUD_SMALL}"/>`,
  moonCloud: `<path d="M19.8 9.6a5 5 0 0 1-6.4-6.4 4.4 4.4 0 1 0 6.4 6.4Z"/><path d="${CLOUD_SMALL}"/>`,
  cloud: `<path d="${CLOUD}"/>`,
  rain: `<path d="${CLOUD_RAISED}"/><path d="M9 19.2 8.1 21.4M13 19.2l-.9 2.2M17 19.2l-.9 2.2"/>`,
  thunder: `<path d="M7 14.5h10.6a3.6 3.6 0 0 0 .2-7.2 5.4 5.4 0 0 0-10.2-1.6A4.2 4.2 0 0 0 7 14.5Z"/><path d="M13.2 16 10.8 19.4h2.7L11.6 22.6"/>`,
  snow: `<path d="${CLOUD_RAISED}"/><path d="M9 19.2v3M7.7 19.9l2.6 1.5M10.3 19.9l-2.6 1.5M15 19.2v3M13.7 19.9l2.6 1.5M16.3 19.9l-2.6 1.5"/>`,
  sleet: `<path d="${CLOUD_RAISED}"/><path d="M9.2 19.2l-.9 2.2M16.2 19.2l-.9 2.2"/><circle cx="12.7" cy="20.9" r="1"/>`,
  fog: `<path d="M4 8.5h13M7.5 12.5h13M4 16.5h11M9 20.5h9"/>`,
  tornado: `<path d="M4 5h16M6.5 9h11M9 13h6M10.8 17h2.4M11.6 21h.8"/>`,
  hurricane: `<circle cx="12" cy="12" r="1.7"/><path d="M13.5 10.5a5.6 5.6 0 0 1 7.1-3.3 8.1 8.1 0 0 0-9.8-4.3M10.5 13.5a5.6 5.6 0 0 1-7.1 3.3 8.1 8.1 0 0 0 9.8 4.3"/>`,
  hot: `<path d="${THERMOMETER}"/><path d="M12 8.4v8"/>`,
  cold: `<path d="${THERMOMETER}"/><path d="M12 13v3.4"/>`,
  droplet: `<path d="M12 3.6c3 4 5 6.5 5 9.1a5 5 0 0 1-10 0c0-2.6 2-5.1 5-9.1Z"/>`,
  // Paired for the windows recommendation: a shut window vs. air moving through.
  windowClosed: `<rect x="3.5" y="3.5" width="17" height="17" rx="1.6"/><path d="M12 3.5v17M3.5 12h17"/>`,
  windowOpen: `<path d="M3 8h11.2a2.9 2.9 0 1 0-2.9-2.9"/><path d="M3 12h15.1a2.9 2.9 0 1 1-2.9 2.9"/><path d="M3 16h8.6a2.5 2.5 0 1 1-2.5 2.5"/>`,
  unknown: `<circle cx="12" cy="12" r="9"/><path d="M12 16.2v-4.4M12 8.2v.1"/>`,
};

// NWS icon code -> { day glyph, night glyph, label }
const CONDITION_MAP = {
  skc: { day: 'sun', night: 'moon', label: 'Clear' },
  few: { day: 'sunCloud', night: 'moonCloud', label: 'Mostly Clear' },
  sct: { day: 'sunCloud', night: 'moonCloud', label: 'Partly Cloudy' },
  bkn: { day: 'cloud', night: 'cloud', label: 'Mostly Cloudy' },
  ovc: { day: 'cloud', night: 'cloud', label: 'Overcast' },
  rain_showers: { day: 'rain', night: 'rain', label: 'Rain Showers' },
  rain_showers_hi: { day: 'rain', night: 'rain', label: 'Rain Showers' },
  rain: { day: 'rain', night: 'rain', label: 'Rain' },
  tsra: { day: 'thunder', night: 'thunder', label: 'Thunderstorms' },
  tsra_sct: { day: 'thunder', night: 'thunder', label: 'Scattered Thunderstorms' },
  tsra_hi: { day: 'thunder', night: 'thunder', label: 'Isolated Thunderstorms' },
  snow: { day: 'snow', night: 'snow', label: 'Snow' },
  rain_snow: { day: 'sleet', night: 'sleet', label: 'Rain/Snow' },
  sleet: { day: 'sleet', night: 'sleet', label: 'Sleet' },
  rain_sleet: { day: 'sleet', night: 'sleet', label: 'Rain/Sleet' },
  snow_sleet: { day: 'sleet', night: 'sleet', label: 'Snow/Sleet' },
  fzra: { day: 'sleet', night: 'sleet', label: 'Freezing Rain' },
  rain_fzra: { day: 'sleet', night: 'sleet', label: 'Rain/Freezing Rain' },
  snow_fzra: { day: 'sleet', night: 'sleet', label: 'Snow/Freezing Rain' },
  blizzard: { day: 'snow', night: 'snow', label: 'Blizzard' },
  fog: { day: 'fog', night: 'fog', label: 'Fog' },
  haze: { day: 'fog', night: 'fog', label: 'Haze' },
  dust: { day: 'fog', night: 'fog', label: 'Dust' },
  smoke: { day: 'fog', night: 'fog', label: 'Smoke' },
  tornado: { day: 'tornado', night: 'tornado', label: 'Tornado' },
  hurricane: { day: 'hurricane', night: 'hurricane', label: 'Hurricane' },
  tropical_storm: { day: 'hurricane', night: 'hurricane', label: 'Tropical Storm' },
  hot: { day: 'hot', night: 'hot', label: 'Hot' },
  cold: { day: 'cold', night: 'cold', label: 'Cold' },
};

const DEFAULT = { day: 'unknown', night: 'unknown', label: 'Unknown' };

/** Standalone icon by glyph name, for non-forecast uses (precip, wind, UI). */
export function icon(name, extraClass = '') {
  return svg(GLYPHS[name] || GLYPHS.unknown, extraClass);
}

/**
 * @param {string} iconUrl - NWS forecast `icon` field
 * @returns {{symbol: string, label: string, glyph: string, isNight: boolean, highWind: boolean}}
 */
export function parseIconUrl(iconUrl) {
  if (!iconUrl) {
    return { symbol: icon('unknown'), label: DEFAULT.label, glyph: 'unknown', isNight: false, highWind: false };
  }

  try {
    const url = new URL(iconUrl);
    const parts = url.pathname.split('/').filter(Boolean); // ["icons","land","day","tsra,40"]
    const isNight = parts.includes('night');
    const lastSegment = parts[parts.length - 1] || '';
    let code = lastSegment.split(',')[0];
    const highWind = code.startsWith('wind_');
    if (highWind) code = code.replace('wind_', '');

    const entry = CONDITION_MAP[code] || DEFAULT;
    const glyph = entry[isNight ? 'night' : 'day'];
    return { symbol: icon(glyph), label: entry.label, glyph, isNight, highWind };
  } catch {
    return { symbol: icon('unknown'), label: DEFAULT.label, glyph: 'unknown', isNight: false, highWind: false };
  }
}

/**
 * Sky-cover-only symbol, deliberately ignoring precipitation — used for the
 * Daily tab, which decides on its own (via dailySymbol.js) whether a day's
 * icon should show rain at all, rather than trusting NWS's per-period icon
 * (which shows rain for the whole day even when the odds are low/brief).
 */
export function symbolFromSkyCover(percent, isDaytime) {
  let code;
  if (percent <= 12) code = 'skc';
  else if (percent <= 37) code = 'few';
  else if (percent <= 62) code = 'sct';
  else if (percent <= 87) code = 'bkn';
  else code = 'ovc';

  const entry = CONDITION_MAP[code];
  const glyph = entry[isDaytime ? 'day' : 'night'];
  return { symbol: icon(glyph), label: entry.label, glyph };
}

/** Precipitation icon for a forecast period, chosen from its text description. */
export function precipSymbol(shortForecast) {
  const text = (shortForecast || '').toLowerCase();
  if (text.includes('thunder')) return icon('thunder');
  if (text.includes('snow') || text.includes('blizzard')) return icon('snow');
  if (text.includes('sleet') || text.includes('freezing') || text.includes('ice')) return icon('sleet');
  return icon('rain');
}
