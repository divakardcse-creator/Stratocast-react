/* StratoCast shared logic. Data: Open-Meteo (forecast, geocoding, air quality) - no API key needed. */
const API = {
  fc: 'https://api.open-meteo.com/v1/forecast',
  geo: 'https://geocoding-api.open-meteo.com/v1/search',
  aq: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  rev: 'https://api.bigdatacloud.net/data/reverse-geocode-client'
};
const DEFAULT_PLACE = { name: 'Geneva', country: 'Switzerland', lat: 46.2044, lon: 6.1432 };
const DEFAULT_SETTINGS = { temp: 'C', wind: 'kmh', clock: '12', refresh: 10 };

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('sc:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sc:' + k, JSON.stringify(v)); } catch { /* private mode */ } }
};

/* ---------- network ---------- */
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function fetchWeather(p) {
  const q = new URLSearchParams({
    latitude: p.lat, longitude: p.lon, timezone: 'auto', forecast_days: 7, past_days: 1, wind_speed_unit: 'kmh',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,pressure_msl,visibility,uv_index,dew_point_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,daylight_duration'
  });
  const aqUrl = API.aq + '?' + new URLSearchParams({ latitude: p.lat, longitude: p.lon, current: 'us_aqi' });
  const [w, aq] = await Promise.all([getJSON(API.fc + '?' + q), getJSON(aqUrl).catch(() => null)]);
  return buildModel(p, w, aq);
}
async function searchCities(q) {
  const r = await getJSON(API.geo + '?' + new URLSearchParams({ name: q, count: 6, language: 'en', format: 'json' }));
  return (r.results || []).map(x => ({ name: x.name, admin: x.admin1 || '', country: x.country || '', lat: x.latitude, lon: x.longitude }));
}
async function reverseGeocode(lat, lon) {
  try {
    const r = await getJSON(API.rev + '?' + new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: 'en' }));
    return { name: r.city || r.locality || 'Current location', country: r.countryName || '' };
  } catch { return { name: 'Current location', country: '' }; }
}
function getPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej({ code: 0 });
    navigator.geolocation.getCurrentPosition(p => res(p.coords), rej, { timeout: 10000, maximumAge: 300000 });
  });
}

/* ---------- weather codes ---------- */
function wmo(code, day = true) {
  let kind = 'cloud', label = 'Overcast';
  if (code === 0) { kind = 'clear'; label = day ? 'Sunny' : 'Clear'; }
  else if (code === 1) { kind = 'clear'; label = day ? 'Mostly Sunny' : 'Mostly Clear'; }
  else if (code === 2) { kind = 'partly'; label = 'Partly Cloudy'; }
  else if (code === 3) { kind = 'cloud'; label = 'Overcast'; }
  else if (code === 45 || code === 48) { kind = 'fog'; label = 'Foggy'; }
  else if (code >= 51 && code <= 57) { kind = 'rain'; label = 'Drizzle'; }
  else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) { kind = 'rain'; label = code >= 80 ? 'Rain Showers' : 'Rainy'; }
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { kind = 'snow'; label = 'Snowy'; }
  else if (code >= 95) { kind = 'storm'; label = 'Thunderstorm'; }
  return { kind, label };
}

/* ---------- formatters ---------- */
const pad = n => String(n).padStart(2, '0');
const T = (c, u) => Math.round(u === 'F' ? c * 9 / 5 + 32 : c);
const Wd = (k, u) => u === 'mph' ? Math.round(k * 0.621371) : u === 'ms' ? (k / 3.6).toFixed(1) : Math.round(k);
const WU = { kmh: 'km/h', mph: 'mph', ms: 'm/s' };
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const DIRNAMES = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
const compass = d => DIRS[Math.round(d / 22.5) % 16];
const compass8 = d => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
function clockStr(s, fmt) {
  const h = +s.slice(11, 13), m = s.slice(14, 16);
  if (fmt === '24') return pad(h) + ':' + m;
  return ((h + 11) % 12 + 1) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
}
function hourLabel(h, fmt) { return fmt === '24' ? pad(h) + ':00' : ((h + 11) % 12 + 1) + (h >= 12 ? ' PM' : ' AM'); }
function durStr(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h + 'h ' + pad(m) + 'm'; }
function placeClock(tz, fmt) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      hour12: fmt !== '24', timeZoneName: 'short'
    }).formatToParts(new Date()).map(p => [p.type, p.value]));
    return `${parts.weekday}, ${parts.month} ${parts.day} \u2022 ${parts.hour}:${parts.minute}${parts.dayPeriod ? ' ' + parts.dayPeriod : ''} ${parts.timeZoneName}`;
  } catch { return new Date().toLocaleString(); }
}
function agoStr(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? m + (m === 1 ? ' min ago' : ' mins ago') : Math.floor(m / 60) + ' h ago';
}
const uvLabel = u => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very High' : 'Extreme';
const humLabel = h => h < 30 ? 'Dry' : h < 60 ? 'Comfortable' : h < 75 ? 'Humid' : 'Very humid';
const cloudLabel = c => c < 10 ? 'Clear skies' : c < 30 ? 'Mostly clear' : c < 70 ? 'Scattered cloud' : c < 90 ? 'Broken cloud' : 'Overcast';
const dewLabel = d => d < 10 ? 'Comfort level optimal \u2022 Dry margin' : d < 16 ? 'Comfortable \u2022 Pleasant air' : d < 20 ? 'Slightly humid \u2022 Muggy edge' : 'Oppressive \u2022 Very humid';
const visLabel = k => k >= 10 ? 'Clear line of sight \u2022 No inversion' : k >= 4 ? 'Good visibility \u2022 Light haze' : k >= 1 ? 'Reduced visibility \u2022 Mist' : 'Poor visibility \u2022 Fog risk';
function aqiInfo(a) {
  if (a == null) return null;
  if (a <= 50) return { t: 'Good', c: 'ok' };
  if (a <= 100) return { t: 'Moderate', c: 'warn' };
  if (a <= 150) return { t: 'Sensitive groups', c: 'warn' };
  return { t: 'Unhealthy', c: 'bad' };
}

/* ---------- model ---------- */
function buildModel(p, w, aq) {
  const c = w.current, H = w.hourly, D = w.daily;
  const hi = H.time.indexOf(c.time.slice(0, 13) + ':00');
  const di = D.time.indexOf(c.time.slice(0, 10));
  const isDayAt = t => {
    const i = D.time.indexOf(t.slice(0, 10)); if (i < 0) return true;
    const x = Date.parse(t); return x >= Date.parse(D.sunrise[i]) && x < Date.parse(D.sunset[i]);
  };
  const hours = [];
  for (let k = 0; k < 24 && H.time[hi + k] != null; k++) {
    const i = hi + k;
    hours.push({ h: +H.time[i].slice(11, 13), code: H.weather_code[i], day: isDayAt(H.time[i]), t: H.temperature_2m[i], pop: H.precipitation_probability[i] ?? 0 });
  }
  const days = [];
  for (let k = 0; k < 7 && D.time[di + k] != null; k++) {
    const i = di + k;
    days.push({ date: D.time[i], code: D.weather_code[i], min: D.temperature_2m_min[i], max: D.temperature_2m_max[i], pop: D.precipitation_probability_max[i] ?? 0 });
  }
  const sr = Date.parse(D.sunrise[di]), ss = Date.parse(D.sunset[di]), now = Date.parse(c.time);
  const rain24 = H.precipitation.slice(Math.max(0, hi - 23), hi + 1).reduce((a, b) => a + (b || 0), 0);
  const today = c.time.slice(0, 10);
  const uvHours = H.time.map((t, i) => [t, H.uv_index[i]]).filter(([t, u]) => t.startsWith(today) && u >= 3).map(([t]) => t.slice(11, 13));
  const press = c.pressure_msl, pressAgo = H.pressure_msl[hi - 3] ?? press;
  const dew = H.dew_point_2m[hi];
  const aqi = aq && aq.current ? aq.current.us_aqi : null;
  return {
    place: p, tz: w.timezone, elevation: Math.round(w.elevation), updatedAt: Date.now(),
    now: {
      t: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, day: !!c.is_day, hum: c.relative_humidity_2m,
      wind: c.wind_speed_10m, gust: c.wind_gusts_10m, dir: c.wind_direction_10m, press, cloud: c.cloud_cover,
      vis: (H.visibility[hi] ?? 24000) / 1000, uv: H.uv_index[hi] ?? 0, dew, pop: hours[0] ? hours[0].pop : 0
    },
    hi: D.temperature_2m_max[di], lo: D.temperature_2m_min[di], uvMax: D.uv_index_max[di],
    sunrise: D.sunrise[di], sunset: D.sunset[di], daylight: D.daylight_duration[di],
    remaining: Math.max(0, (ss - now) / 1000), frac: Math.min(1, Math.max(0, (now - sr) / (ss - sr))),
    rainToday: D.precipitation_sum[di] || 0, rain24, popMax: D.precipitation_probability_max[di] ?? 0,
    trend: press - pressAgo > 1 ? 'Rising' : press - pressAgo < -1 ? 'Falling' : 'Steady',
    cloudBase: Math.max(100, Math.round((c.temperature_2m - dew) * 125 / 10) * 10),
    uvAdvice: uvHours.length ? `Sun protection advised ${uvHours[0]}:00\u2013${uvHours[uvHours.length - 1]}:00` : 'No sun protection needed today',
    aqi, hours, days
  };
}
function placeholderModel() {
  const hours = Array.from({ length: 24 }, (_, i) => ({ h: (14 + i) % 24, code: 2, day: true, t: 19, pop: 10 }));
  const days = Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.now() + i * 864e5).toISOString().slice(0, 10), code: 2, min: 11, max: 22, pop: 10 }));
  return {
    place: DEFAULT_PLACE, tz: 'UTC', elevation: 0, updatedAt: Date.now(),
    now: { t: 19, feels: 18, code: 2, day: true, hum: 60, wind: 12, gust: 20, dir: 270, press: 1016, cloud: 40, vis: 20, uv: 3, dew: 9, pop: 10 },
    hi: 22, lo: 11, uvMax: 5, sunrise: '2000-01-01T07:46', sunset: '2000-01-01T18:38', daylight: 39120, remaining: 14760, frac: .5,
    rainToday: 0, rain24: 0, popMax: 10, trend: 'Steady', cloudBase: 1450, uvAdvice: 'Sun protection advised 11:00\u201316:00', aqi: 28, hours, days
  };
}

/* ---------- derived copy ---------- */
function describe(m, s) {
  const n = m.now, w = wmo(n.code, n.day).label.toLowerCase();
  const strong = n.wind >= 40 ? 'Strong' : n.wind >= 20 ? 'Moderate' : 'Light';
  const rainAt = m.hours.find((h, i) => i > 0 && h.pop >= 60);
  const rain = rainAt ? `Showers likely around ${hourLabel(rainAt.h, s.clock)} (${rainAt.pop}% chance).` : m.popMax >= 30 ? `A ${m.popMax}% chance of rain at some point today.` : 'Little chance of rain over the next 24 hours.';
  return `${w[0].toUpperCase() + w.slice(1)} conditions. ${strong} ${DIRNAMES[compass8(n.dir)]}erly winds around ${Wd(n.wind, s.wind)} ${WU[s.wind]}. ${rain}`.replace('northerly', 'northerly').replace('easterly', 'easterly');
}
function buildAlerts(m, s) {
  const n = m.now, out = [];
  const stormHour = m.hours.find(h => h.code >= 95);
  if (stormHour) out.push({ lvl: 3, tag: 'Severe Weather', title: 'Thunderstorm Warning', body: `Thunderstorms possible around ${hourLabel(stormHour.h, s.clock)}. Avoid open areas and secure loose objects.` });
  if (n.gust >= 75) out.push({ lvl: 3, tag: 'Wind Warning', title: 'Damaging Gusts Expected', body: `Gusts up to ${Wd(n.gust, s.wind)} ${WU[s.wind]}. Secure outdoor items and avoid travelling if possible.` });
  else if (n.gust >= 50) out.push({ lvl: 2, tag: 'Wind & Front Advisory', title: 'Gale Watch & Pre-Frontal Advisory', body: `Peak gusts approaching ${Wd(n.gust, s.wind)} ${WU[s.wind]} at your location.` });
  const wet = m.hours.slice(0, 12).filter(h => h.pop >= 70);
  if (wet.length) out.push({ lvl: 2, tag: 'Rain Advisory', title: 'Heavy Rain Likely', body: `Rain probability reaches ${Math.max(...wet.map(h => h.pop))}% within the next 12 hours. Carry an umbrella.` });
  if (m.uvMax >= 8) out.push({ lvl: 2, tag: 'UV Advisory', title: 'Very High UV Index', body: `UV peaks at ${Math.round(m.uvMax)} today. Use SPF 30+ and limit midday sun.` });
  if (n.t >= 35) out.push({ lvl: 3, tag: 'Heat Warning', title: 'Extreme Heat', body: `Temperature is ${T(n.t, s.temp)}\u00B0${s.temp}. Stay hydrated and avoid strenuous activity.` });
  if (n.t <= -10) out.push({ lvl: 3, tag: 'Cold Warning', title: 'Extreme Cold', body: `Temperature is ${T(n.t, s.temp)}\u00B0${s.temp}. Limit time outdoors.` });
  if (n.vis < 1) out.push({ lvl: 2, tag: 'Visibility Advisory', title: 'Dense Fog', body: `Visibility is only ${n.vis.toFixed(1)} km. Drive with care.` });
  if (!out.length) out.push({ lvl: 0, tag: 'All Clear', title: 'No active weather advisories', body: 'Conditions are stable for the next 24 hours.' });
  return out.sort((a, b) => b.lvl - a.lvl);
}

/* ---------- SVG builders (string) ---------- */
const ICONS = {
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>', chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>',
  gps: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  home: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  thermo: '<path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  chart: '<path d="m3 17 6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  sliders: '<path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M19 18h1"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>', down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  sunrise: '<path d="M17 18a5 5 0 0 0-10 0M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4"/>',
  sunset: '<path d="M17 18a5 5 0 0 0-10 0M12 9V2M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 5l-4 4-4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  drop: '<path d="M12 2.7s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11Z"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 6 19Z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  book: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>', check: '<path d="m5 12 5 5 9-10"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
  cloudOff: '<path d="m2 2 20 20M5.8 5.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 6 19h11.5M17.5 19a4.5 4.5 0 0 0 .6-8.9A6 6 0 0 0 11 6"/>',
  sliderState: '<path d="M4 7h16M4 12h16M4 17h10"/>'
};
function icon(n, size, cls) {
  return `<svg class="i ${cls || ''}" viewBox="0 0 24 24" width="${size || 16}" height="${size || 16}" aria-hidden="true">${ICONS[n]}</svg>`;
}
const CL = 'M7 19a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 10.5a4.25 4.25 0 0 1 .5 8.5Z';
const CT = 'M7 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 6.5a4.25 4.25 0 0 1 .5 8.5Z';
function wxSvg(kind, day = true, size = 22) {
  const cloud = (d, f = '#fff') => `<path d="${d}" fill="${f}" stroke="#8fa3c7" stroke-width="1.3"/>`;
  const sunRays = '<path d="M9 1.5V3M2.5 9H4M4.4 4.4l1 1M13.6 4.4l-1 1" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/>';
  const small = '<path d="M8 21a3.5 3.5 0 0 1-.5-6.96A4.8 4.8 0 0 1 16.8 14a3.7 3.7 0 0 1 .2 7Z" fill="#fff" stroke="#8fa3c7" stroke-width="1.3"/>';
  const moon = '<path d="M20 13.5A8 8 0 1 1 10.5 4 6.3 6.3 0 0 0 20 13.5Z" fill="#c7d2fe" stroke="#818cf8" stroke-width="1.3"/>';
  let b;
  if (kind === 'clear') b = day ? '<circle cx="12" cy="12" r="5" fill="#fbbf24"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="#f59e0b" stroke-width="1.7" stroke-linecap="round"/>' : moon;
  else if (kind === 'partly') b = day ? `<circle cx="9" cy="9" r="4" fill="#fbbf24"/>${sunRays}${small}` : `<path d="M13 3a5.5 5.5 0 1 0 5 8 4.5 4.5 0 0 1-5-8Z" fill="#c7d2fe" stroke="#818cf8" stroke-width="1.2"/>${small}`;
  else if (kind === 'cloud') b = cloud(CL, '#e6ebf7');
  else if (kind === 'rain') b = cloud(CT, '#dbe5f7') + '<path d="M8 17.5 7 20.5M12.5 17.5l-1 3M17 17.5l-1 3" stroke="#2563eb" stroke-width="1.7" stroke-linecap="round"/>';
  else if (kind === 'snow') b = cloud(CT, '#e6ebf7') + '<path d="M8 18v3M6.5 19.5h3M13 18v3M11.5 19.5h3M18 18v3M16.5 19.5h3" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round"/>';
  else if (kind === 'storm') b = cloud(CT, '#c9d3ea') + '<path d="m12.8 14.5-3 4.5h3l-1 3.8 3.9-5.3h-3l1.1-3Z" fill="#f59e0b"/>';
  else b = cloud(CT, '#e6ebf7') + '<path d="M4 18.5h16M6 21.5h12" stroke="#94a3b8" stroke-width="1.7" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${b}</svg>`;
}
function heroArt(kind, day) {
  const cloud = (w, h, o, f) => `<svg viewBox="0 0 176 110" width="${w}" height="${h}" style="opacity:${o}"><g fill="${f}"><circle cx="52" cy="72" r="28"/><circle cx="92" cy="54" r="38"/><circle cx="130" cy="74" r="26"/><rect x="38" y="72" width="114" height="30" rx="15"/></g></svg>`;
  const clouds = kind !== 'clear';
  const dark = kind === 'storm' ? '#b4bfd8' : kind === 'rain' || kind === 'cloud' || kind === 'fog' ? '#d5ddf0' : '#fff';
  const drops = (kind === 'rain' || kind === 'storm' || kind === 'snow')
    ? `<div class="art-drops ${kind}">${Array.from({ length: 7 }, (_, i) => `<i style="left:${34 + i * 18}px;animation-delay:${(i * .23).toFixed(2)}s"></i>`).join('')}</div>` : '';
  const dim = kind === 'cloud' || kind === 'rain' || kind === 'storm' || kind === 'fog' || kind === 'snow';
  return `<div class="art"><div class="art-disc ${day ? '' : 'night'}" style="${dim ? 'opacity:.35;transform:scale(.8)' : ''}"></div><div class="art-ring ${day ? '' : 'night'}"></div>`
    + (clouds ? `<div class="art-c1">${cloud(160, 112, .8, '#e3e9f8')}</div><div class="art-c2">${cloud(176, 110, .95, dark)}</div>` : '')
    + drops + `<div class="art-s1"></div><div class="art-s2"></div></div>`;
}
function solarSvg(frac) {
  // semicircle from (20,104) to (212,104), radius 96, centre (116,104)
  const a = Math.PI * (1 - frac), x = 116 + 96 * Math.cos(a), y = 104 - 96 * Math.sin(a);
  const done = `M20 104A96 96 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`;
  return `<svg viewBox="0 0 232 128" role="img" aria-label="Sun position along its daily arc"><line x1="8" y1="104" x2="224" y2="104" stroke="#bfc7d2" stroke-width="1.5"/>`
    + `<path d="M20 104A96 96 0 0 1 212 104" fill="none" stroke="#bfc7d2" stroke-width="1.6" stroke-dasharray="4 5"/>`
    + (frac > 0 ? `<path d="${done}" fill="none" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round"/>` : '')
    + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="#fbbf24" opacity=".28"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" fill="#fbbf24"/>`
    + `<circle cx="116" cy="8" r="2.4" fill="#bfc7d2"/><text x="124" y="12" font-size="8.7" fill="#3f4850" font-family="Inter,sans-serif">Solar Noon</text></svg>`;
}
function ringSvg(pct) {
  const r = 22, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><circle cx="28" cy="28" r="${r}" fill="none" stroke="#eaedff" stroke-width="5"/><circle cx="28" cy="28" r="${r}" fill="none" stroke="#006194" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * pct / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/></svg>`;
}

export { API, DEFAULT_PLACE, DEFAULT_SETTINGS, store, fetchWeather, searchCities, reverseGeocode, getPosition, wmo, pad, T, Wd, WU, compass, clockStr, hourLabel, durStr, placeClock, agoStr, uvLabel, humLabel, cloudLabel, dewLabel, visLabel, aqiInfo, placeholderModel, describe, buildAlerts, ICONS, icon, wxSvg, heroArt, solarSvg, ringSvg };
