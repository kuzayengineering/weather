// The outline's core complaint about other weather apps: they show a rain
// symbol for a whole day based on the total daily precip odds, even when
// that just means "5% chance for 20 hours" or "90% chance for one hour
// overnight." This computes a symbol based on how many *daylight* hours
// actually cross a 50% precipitation threshold, not the flat daily total.

import { getSunTimes } from './sun.js';
import { valuesInRange } from './griddata.js';

const QUALIFYING_POP_THRESHOLD = 50;

/** Core logic shared by daytime and nighttime evaluation. */
function evaluatePrecipForWindow(gridPop, start, end) {
  if (!start || !end || end <= start) return { tier: 'dry', qualifyingHours: 0, maxPop: 0 };

  const intervals = valuesInRange(gridPop, start, end);
  const qualifying = intervals.filter((i) => (i.value || 0) >= QUALIFYING_POP_THRESHOLD);

  const qualifyingHours = qualifying.reduce((sum, i) => sum + (i.end - i.start) / 3600000, 0);
  const maxPop = qualifying.reduce((max, i) => Math.max(max, i.value || 0), 0);

  // "more than an hour" of >=50% precip odds = show it as a rain period.
  // A single qualifying hour = a short burst — flag it, but don't call the whole period rain.
  let tier = 'dry';
  if (qualifyingHours > 1) tier = 'rain';
  else if (qualifyingHours >= 1) tier = 'brief';

  return { tier, qualifyingHours: Math.round(qualifyingHours), maxPop: Math.round(maxPop) };
}

/**
 * @param {object} params
 * @param {object} params.gridPop - forecastGridData probabilityOfPrecipitation
 * @param {Date} params.dayDate - any Date within the calendar day being evaluated
 * @param {number} params.lat
 * @param {number} params.lon
 * @returns {{ tier: 'dry' | 'brief' | 'rain', qualifyingHours: number, maxPop: number }}
 */
export function evaluateDaylightPrecip({ gridPop, dayDate, lat, lon }) {
  const sun = getSunTimes(dayDate, lat, lon);
  if (!sun) return { tier: 'dry', qualifyingHours: 0, maxPop: 0 };
  return evaluatePrecipForWindow(gridPop, sun.sunrise, sun.sunset);
}

/** Same idea, for the overnight window from this day's sunset to the next day's sunrise. */
export function evaluateOvernightPrecip({ gridPop, dayDate, lat, lon }) {
  const today = getSunTimes(dayDate, lat, lon);
  const tomorrow = getSunTimes(new Date(dayDate.getTime() + 24 * 3600000), lat, lon);
  if (!today || !tomorrow) return { tier: 'dry', qualifyingHours: 0, maxPop: 0 };
  return evaluatePrecipForWindow(gridPop, today.sunset, tomorrow.sunrise);
}
