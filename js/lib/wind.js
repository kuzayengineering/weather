// Shared wind-arrow rendering: used by the Hourly tab's wind-direction row and
// the Home tab's Current/Upcoming conditions. Arrow size scales with speed so
// a glance at size alone gives a rough read on how windy it is.

// Power curve rather than linear: the marginal size increase per mph grows
// with speed, so the jump from calm to average wind is modest but average-to-
// high wind is dramatic — a bigger, more exaggerated spread than a flat rate.
// Tuned so ~10 mph (a typical "average" wind) lands at 40px, double the old
// flat-rate formula's result at that speed.
const MIN_SIZE = 16;
const MAX_SIZE = 80;
const REFERENCE_MPH = 10;
const REFERENCE_SIZE = 40;
const EXPONENT = 1.5;
const SCALE = (REFERENCE_SIZE - MIN_SIZE) / REFERENCE_MPH ** EXPONENT;

export function windArrowSize(mph) {
  if (mph == null) return MIN_SIZE + 2;
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, MIN_SIZE + mph ** EXPONENT * SCALE));
}

/** @param {number|null} dirDeg - meteorological wind direction (degrees FROM which wind blows) */
export function windArrowHtml(dirDeg, mph, extraClass = '') {
  if (dirDeg == null) return '';
  const size = windArrowSize(mph);
  return `<span class="wind-arrow ${extraClass}" style="font-size:${size}px; transform: rotate(${(dirDeg + 180) % 360}deg)">↑</span>`;
}
