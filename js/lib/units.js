// Unit conversions. NWS `forecast`/`forecastHourly` already come back in US units;
// `forecastGridData` (raw grid) comes back in SI units and needs converting.

export const cToF = (c) => (c * 9) / 5 + 32;
export const fToC = (f) => ((f - 32) * 5) / 9;
export const kmhToMph = (kmh) => kmh * 0.621371;
export const mphToKmh = (mph) => mph / 0.621371;
export const mmToIn = (mm) => mm / 25.4;
export const inToMm = (inches) => inches * 25.4;
export const metersToMiles = (m) => m / 1609.344;

export function formatTemp(valueF, units) {
  const v = units === 'metric' ? fToC(valueF) : valueF;
  return `${Math.round(v)}°`;
}

export function formatWindSpeed(valueMph, units) {
  const v = units === 'metric' ? mphToKmh(valueMph) : valueMph;
  return `${Math.round(v)} ${units === 'metric' ? 'km/h' : 'mph'}`;
}

export function formatPrecip(valueIn, units) {
  const v = units === 'metric' ? inToMm(valueIn) : valueIn;
  const decimals = units === 'metric' ? 0 : 1;
  return `${v.toFixed(decimals)} ${units === 'metric' ? 'mm' : 'in'}`;
}

export function formatDistance(valueMiles, units) {
  const v = units === 'metric' ? valueMiles * 1.60934 : valueMiles;
  return `${Math.round(v)} ${units === 'metric' ? 'km' : 'mi'}`;
}
