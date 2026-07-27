// Helpers for parsing NWS forecastGridData time-series values.
// Each grid property looks like:
//   { uom: "wmoUnit:degC", values: [{ validTime: "2026-07-27T18:00:00+00:00/PT1H", value: 21.1 }, ...] }
// `validTime` is an ISO-8601 interval: "<start>/<duration>". Duration is ISO-8601 too (PT1H, PT6H...).

import { cToF, kmhToMph, mmToIn } from './units.js';

const DURATION_RE = /^PT?(?:(\d+)D)?(?:(\d+)H)?(?:(\d+)M)?$/;

function parseIsoDuration(iso) {
  // Handles the subset NWS emits: P0D, PT1H, PT6H, P1DT6H, etc.
  const match = iso.replace('P', 'PT').replace('TT', 'T').match(DURATION_RE);
  if (!match) return 0;
  const [, days, hours, minutes] = match;
  return (Number(days || 0) * 24 + Number(hours || 0)) * 3600000 + Number(minutes || 0) * 60000;
}

/** Expands a grid property's compact interval list into { start, end, value } entries. */
export function expandIntervals(gridProperty) {
  if (!gridProperty?.values) return [];
  return gridProperty.values.map(({ validTime, value }) => {
    const [startIso, durationIso] = validTime.split('/');
    const start = new Date(startIso);
    const end = new Date(start.getTime() + parseIsoDuration(durationIso));
    return { start, end, value };
  });
}

/** Finds the interval covering `date`, or the nearest one if none matches exactly. */
export function valueAt(gridProperty, date) {
  const intervals = expandIntervals(gridProperty);
  const covering = intervals.find((i) => date >= i.start && date < i.end);
  if (covering) return covering.value;
  if (!intervals.length) return null;
  // fall back to nearest by start time
  return intervals.reduce((best, i) =>
    Math.abs(i.start - date) < Math.abs(best.start - date) ? i : best
  ).value;
}

/** All intervals whose [start,end) overlaps [rangeStart, rangeEnd). */
export function valuesInRange(gridProperty, rangeStart, rangeEnd) {
  return expandIntervals(gridProperty).filter((i) => i.end > rangeStart && i.start < rangeEnd);
}

// --- Unit-aware convenience getters (grid data is always SI) ---

export const gridTempF = (gridProperty, date) => {
  const c = valueAt(gridProperty, date);
  return c == null ? null : cToF(c);
};

export const gridWindMph = (gridProperty, date) => {
  const kmh = valueAt(gridProperty, date);
  return kmh == null ? null : kmhToMph(kmh);
};

export const gridPrecipIn = (gridProperty, date) => {
  const mm = valueAt(gridProperty, date);
  return mm == null ? null : mmToIn(mm);
};
