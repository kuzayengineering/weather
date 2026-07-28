// Shared wind-arrow rendering: used by the Hourly tab's wind-direction row and
// the Home tab's Current/Upcoming conditions. Arrow size scales with speed so
// a glance at size alone gives a rough read on how windy it is.

export function windArrowSize(mph) {
  if (mph == null) return 14;
  return Math.max(12, Math.min(30, 12 + mph * 0.8));
}

/** @param {number|null} dirDeg - meteorological wind direction (degrees FROM which wind blows) */
export function windArrowHtml(dirDeg, mph, extraClass = '') {
  if (dirDeg == null) return '';
  const size = windArrowSize(mph);
  return `<span class="wind-arrow ${extraClass}" style="font-size:${size}px; transform: rotate(${(dirDeg + 180) % 360}deg)">↑</span>`;
}
