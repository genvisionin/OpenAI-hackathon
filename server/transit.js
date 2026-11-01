// Live TfL arrivals and real, projected route shapes for the Westminster game map.
import express from 'express';

const router = express.Router();
const arrivalsCache = new Map();
const routeCache = { expires: 0, routes: null };
const LINES = ['11', '24', '88', '159', '12', '453', '148', '87'];
const LAT0 = 51.500729;
const LON0 = -0.124625;
const COS_LAT0 = Math.cos(LAT0 * Math.PI / 180);
const BOUNDS = { minX: -690, maxX: 690, minZ: -590, maxZ: 590 };

function inBounds(stop) {
  return stop.x >= BOUNDS.minX && stop.x <= BOUNDS.maxX && stop.z >= BOUNDS.minZ && stop.z <= BOUNDS.maxZ;
}

function longestRun(stops) {
  let best = [], run = [];
  for (const stop of stops) {
    if (inBounds(stop)) run.push(stop);
    else { if (run.length > best.length) best = run; run = []; }
  }
  if (run.length > best.length) best = run;
  return best;
}

function projectedStops(sequence) {
  const list = Array.isArray(sequence?.stopPoint) ? sequence.stopPoint : [];
  const stops = list.map((stop) => {
    const lat = Number(stop.lat), lon = Number(stop.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      id: String(stop.naptanId || stop.id || ''),
      name: String(stop.name || stop.stationName || 'London bus stop'),
      letter: String(stop.stopLetter || stop.indicator || ''),
      x: (lon - LON0) * COS_LAT0 * 111320,
      z: -(lat - LAT0) * 110540,
    };
  }).filter((stop) => stop && stop.id);
  return longestRun(stops);
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`TfL returned ${response.status}`);
  return response.json();
}

async function routeShape(line) {
  for (const direction of ['outbound', 'inbound']) {
    try {
      const data = await fetchJson(`https://api.tfl.gov.uk/Line/${encodeURIComponent(line)}/Route/Sequence/${direction}`);
      const sequence = data?.stopPointSequences?.[0];
      const stops = projectedStops(sequence);
      if (stops.length >= 3) {
        return {
          line,
          destination: String(stops.at(-1)?.name || data?.lineName || `Route ${line}`),
          stops,
        };
      }
    } catch { /* try the opposite direction */ }
  }
  return null;
}

async function getRouteShapes() {
  if (routeCache.routes && routeCache.expires > Date.now()) return routeCache.routes;
  const routes = (await Promise.all(LINES.map(routeShape))).filter(Boolean);
  routeCache.routes = routes;
  routeCache.expires = Date.now() + 60 * 60 * 1000;
  return routes;
}

async function nextArrival(stopId, line) {
  const key = `${stopId}:${line}`;
  const hit = arrivalsCache.get(key);
  if (hit && Date.now() - hit.t < 25000) return hit.minutes;
  try {
    const list = await fetchJson(`https://api.tfl.gov.uk/StopPoint/${encodeURIComponent(stopId)}/Arrivals`);
    const match = (Array.isArray(list) ? list : [])
      .filter((arrival) => String(arrival.lineName || arrival.lineId) === line)
      .sort((a, b) => Number(a.timeToStation) - Number(b.timeToStation))[0];
    if (!match) return null;
    const minutes = Math.max(0, Math.round(Number(match.timeToStation || 0) / 60));
    arrivalsCache.set(key, { t: Date.now(), minutes });
    return minutes;
  } catch { return null; }
}

router.get('/arrivals', async (req, res) => {
  const stop = String(req.query.stop || '490014498S').replace(/[^A-Z0-9]/gi, '');
  const hit = arrivalsCache.get(stop);
  if (hit && Date.now() - hit.t < 25000 && hit.data) return res.json(hit.data);
  try {
    const list = await fetchJson(`https://api.tfl.gov.uk/StopPoint/${encodeURIComponent(stop)}/Arrivals`);
    const arrivals = (Array.isArray(list) ? list : []).map((a) => ({ line: a.lineName, destination: a.destinationName, minutes: Math.max(0, Math.round(a.timeToStation / 60)), vehicle: a.vehicleId }))
      .sort((a, b) => a.minutes - b.minutes).slice(0, 6);
    const data = { stop, name: list?.[0]?.stationName || 'Westminster Stn / Westminster Pier', letter: list?.[0]?.platformName || 'H', arrivals, live: true, ts: Date.now() };
    arrivalsCache.set(stop, { t: Date.now(), data });
    res.json(data);
  } catch {
    // Simulated timetable fallback keeps the existing countdown board useful offline.
    const m = new Date().getMinutes() % 8;
    res.json({ stop, name: 'Westminster Stn / Westminster Pier', letter: 'H', live: false, arrivals: [0, 8, 16].map((o) => ({ line: '11', destination: 'Liverpool Street', minutes: (8 - m + o) % 24 })) });
  }
});

router.get('/routes', async (_req, res) => {
  try {
    const routes = await getRouteShapes();
    const withLive = await Promise.all(routes.map(async (route) => ({
      ...route,
      nextMinutes: route.stops[0]?.id ? await nextArrival(route.stops[0].id, route.line) : null,
    })));
    res.json({ routes: withLive });
  } catch {
    res.json({ routes: [] });
  }
});

export default router;
