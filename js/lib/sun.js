// Sunrise/sunset calculator (NOAA Solar Calculator algorithm, public-domain formulas).
// Used to determine "daylight hours" for the daily-forecast rain-symbol logic.

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function julianCentury(jd) {
  return (jd - 2451545) / 36525;
}

function geomMeanLongSun(t) {
  let l = 280.46646 + t * (36000.76983 + t * 0.0003032);
  return ((l % 360) + 360) % 360;
}

function geomMeanAnomalySun(t) {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t);
}

function eccentricityEarthOrbit(t) {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
}

function sunEqOfCenter(t) {
  const m = toRad(geomMeanAnomalySun(t));
  return (
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289
  );
}

function sunTrueLong(t) {
  return geomMeanLongSun(t) + sunEqOfCenter(t);
}

function sunAppLong(t) {
  return sunTrueLong(t) - 0.00569 - 0.00478 * Math.sin(toRad(125.04 - 1934.136 * t));
}

function meanObliquityOfEcliptic(t) {
  return (
    23 +
    (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  );
}

function obliquityCorrection(t) {
  return meanObliquityOfEcliptic(t) + 0.00256 * Math.cos(toRad(125.04 - 1934.136 * t));
}

function sunDeclination(t) {
  const e = toRad(obliquityCorrection(t));
  const lambda = toRad(sunAppLong(t));
  return toDeg(Math.asin(Math.sin(e) * Math.sin(lambda)));
}

function equationOfTime(t) {
  const epsilon = toRad(obliquityCorrection(t));
  const l0 = toRad(geomMeanLongSun(t));
  const e = eccentricityEarthOrbit(t);
  const m = toRad(geomMeanAnomalySun(t));
  const y = Math.tan(epsilon / 2) ** 2;

  const eTime =
    y * Math.sin(2 * l0) -
    2 * e * Math.sin(m) +
    4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * e * e * Math.sin(2 * m);
  return 4 * toDeg(eTime); // minutes
}

function hourAngleSunrise(lat, decl) {
  const latRad = toRad(lat);
  const declRad = toRad(decl);
  const cosH =
    Math.cos(toRad(90.833)) / (Math.cos(latRad) * Math.cos(declRad)) -
    Math.tan(latRad) * Math.tan(declRad);
  return toDeg(Math.acos(Math.min(1, Math.max(-1, cosH))));
}

/**
 * @returns {{sunrise: Date, sunset: Date} | null} null for polar day/night
 */
export function getSunTimes(date, lat, lon) {
  const jd = julianDay(date);
  const t = julianCentury(jd);
  const decl = sunDeclination(t);
  const eqTime = equationOfTime(t);
  const ha = hourAngleSunrise(lat, decl);
  if (Number.isNaN(ha)) return null; // polar day or night

  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  const solarNoonUtcMinutes = 720 - 4 * lon - eqTime;
  const sunriseUtcMinutes = solarNoonUtcMinutes - 4 * ha;
  const sunsetUtcMinutes = solarNoonUtcMinutes + 4 * ha;

  const sunrise = new Date(dayStart.getTime() + sunriseUtcMinutes * 60000);
  const sunset = new Date(dayStart.getTime() + sunsetUtcMinutes * 60000);
  return { sunrise, sunset };
}

export function isDaylight(date, lat, lon) {
  const times = getSunTimes(date, lat, lon);
  if (!times) return true;
  return date >= times.sunrise && date <= times.sunset;
}
