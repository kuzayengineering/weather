// Psychrometric helpers. All public functions take/return Fahrenheit to match
// the rest of the app; Magnus-Tetens saturation vapor pressure math runs in Celsius internally.

function saturationVaporPressure(tempC) {
  return 6.112 * Math.exp((17.62 * tempC) / (243.12 + tempC));
}

// Relative humidity at a given air temp, from the dew point.
export function relativeHumidityFromDewPoint(tempF, dewPointF) {
  const tempC = ((tempF - 32) * 5) / 9;
  const dewC = ((dewPointF - 32) * 5) / 9;
  const rh = (100 * saturationVaporPressure(dewC)) / saturationVaporPressure(tempC);
  return Math.max(0, Math.min(100, rh));
}

// If outdoor air at a given dew point is brought indoors and heated to `indoorTempF`
// with no moisture added or removed, the dew point stays the same — only the RH% changes.
export function indoorEquivalentRH(dewPointF, indoorTempF = 70) {
  return relativeHumidityFromDewPoint(indoorTempF, dewPointF);
}
