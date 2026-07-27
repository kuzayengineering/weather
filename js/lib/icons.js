// Maps NWS icon URLs (e.g. https://api.weather.gov/icons/land/day/tsra,40?size=medium)
// to a symbol + label. Emoji-based placeholder set — swap for a real icon set later.

const CONDITION_MAP = {
  skc: { day: '☀️', night: '🌙', label: 'Clear' },
  few: { day: '🌤️', night: '🌙☁️', label: 'Mostly Clear' },
  sct: { day: '⛅', night: '☁️🌙', label: 'Partly Cloudy' },
  bkn: { day: '🌥️', night: '☁️', label: 'Mostly Cloudy' },
  ovc: { day: '☁️', night: '☁️', label: 'Overcast' },
  rain_showers: { day: '🌦️', night: '🌧️', label: 'Rain Showers' },
  rain_showers_hi: { day: '🌦️', night: '🌧️', label: 'Rain Showers' },
  rain: { day: '🌧️', night: '🌧️', label: 'Rain' },
  tsra: { day: '⛈️', night: '⛈️', label: 'Thunderstorms' },
  tsra_sct: { day: '⛈️', night: '⛈️', label: 'Scattered Thunderstorms' },
  tsra_hi: { day: '⛈️', night: '⛈️', label: 'Isolated Thunderstorms' },
  snow: { day: '❄️', night: '❄️', label: 'Snow' },
  rain_snow: { day: '🌨️', night: '🌨️', label: 'Rain/Snow' },
  sleet: { day: '🧊', night: '🧊', label: 'Sleet' },
  rain_sleet: { day: '🧊', night: '🧊', label: 'Rain/Sleet' },
  snow_sleet: { day: '🧊', night: '🧊', label: 'Snow/Sleet' },
  fzra: { day: '🧊', night: '🧊', label: 'Freezing Rain' },
  rain_fzra: { day: '🧊', night: '🧊', label: 'Rain/Freezing Rain' },
  blizzard: { day: '🌨️', night: '🌨️', label: 'Blizzard' },
  fog: { day: '🌫️', night: '🌫️', label: 'Fog' },
  haze: { day: '😶‍🌫️', night: '😶‍🌫️', label: 'Haze' },
  dust: { day: '🌪️', night: '🌪️', label: 'Dust' },
  smoke: { day: '🌫️', night: '🌫️', label: 'Smoke' },
  tornado: { day: '🌪️', night: '🌪️', label: 'Tornado' },
  hurricane: { day: '🌀', night: '🌀', label: 'Hurricane' },
  tropical_storm: { day: '🌀', night: '🌀', label: 'Tropical Storm' },
  hot: { day: '🥵', night: '🥵', label: 'Hot' },
  cold: { day: '🥶', night: '🥶', label: 'Cold' },
};

const DEFAULT = { day: '❓', night: '❓', label: 'Unknown' };

/**
 * @param {string} iconUrl - NWS forecast `icon` field
 * @returns {{symbol: string, label: string, highWind: boolean}}
 */
export function parseIconUrl(iconUrl) {
  if (!iconUrl) return { symbol: DEFAULT.day, label: DEFAULT.label, highWind: false };

  try {
    const url = new URL(iconUrl);
    const parts = url.pathname.split('/').filter(Boolean); // ["icons","land","day","tsra,40"]
    const timeOfDay = parts.includes('night') ? 'night' : 'day';
    const lastSegment = parts[parts.length - 1] || '';
    let code = lastSegment.split(',')[0];
    const highWind = code.startsWith('wind_');
    if (highWind) code = code.replace('wind_', '');

    const entry = CONDITION_MAP[code] || DEFAULT;
    return { symbol: entry[timeOfDay], label: entry.label, highWind };
  } catch {
    return { symbol: DEFAULT.day, label: DEFAULT.label, highWind: false };
  }
}

/**
 * Sky-cover-only symbol, deliberately ignoring precipitation — used for the
 * Daily tab, which decides on its own (via dailySymbol.js) whether a day's
 * icon should show rain at all, rather than trusting NWS's per-period icon
 * (which shows rain for the whole day even when the odds are low/brief).
 */
export function symbolFromSkyCover(percent, isDaytime) {
  const timeOfDay = isDaytime ? 'day' : 'night';
  let code;
  if (percent <= 12) code = 'skc';
  else if (percent <= 37) code = 'few';
  else if (percent <= 62) code = 'sct';
  else if (percent <= 87) code = 'bkn';
  else code = 'ovc';
  return { symbol: CONDITION_MAP[code][timeOfDay], label: CONDITION_MAP[code].label };
}
