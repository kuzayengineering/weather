// Shared wind-arrow rendering: used by the Hourly tab's wind-direction row and
// the Home tab's Current/Upcoming conditions. Arrow size scales with speed so
// a glance at size alone gives a rough read on how windy it is.

// Power curve rather than linear: the marginal size increase per mph grows
// with speed, so the jump from calm to average wind is modest but average-to-
// high wind is dramatic — a bigger, more exaggerated spread than a flat rate.
// Tuned so ~10 mph (a typical "average" wind) lands at 40px.
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
  // +180 because NWS reports the direction wind comes FROM; the arrow points
  // the way the air is actually moving.
  const rotation = (dirDeg + 180) % 360;
  return `<span class="wind-arrow ${extraClass}" style="width:${size}px;height:${size}px;transform:rotate(${rotation}deg)"><svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V5"/><path d="M6 11l6-6 6 6"/></svg></span>`;
}
