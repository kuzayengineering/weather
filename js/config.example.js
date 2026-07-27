// Copy this file to config.local.js (gitignored — never commit real keys here)
// to test the AQI layer locally against the real AirNow API.
//
// IMPORTANT: this is a *local development only* mechanism. The public deployed
// site must NOT call AirNow directly from client-side code with a key present
// here, since anything in this repo's client-side JS is publicly visible.
// Before AQI goes live on weather.kuzayeng.com, requests need to be proxied
// through a small server-side function (planned as part of the push
// notification backend) that holds the key server-side instead.

export const AIRNOW_API_KEY = null;
