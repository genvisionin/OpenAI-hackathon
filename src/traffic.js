import * as THREE from 'three';
import { ROAD_PATHS } from './world.js';
import { makeVehicleMesh } from './vehicles.js';

const CAR_COLORS = [0x1c2730, 0x344b59, 0x747d78, 0xb5a58a, 0x6b3c35, 0xe1ddd2, 0x273b35, 0x565a67, 0x233a59];
const CAR_COUNT = 22;
const BUS_COUNT = 3;
const MIN_PATH_LENGTH = 80;
const TAU = Math.PI * 2;

function pathInfo(path, index) {
  const pts = (path.pts || []).filter((p) => Array.isArray(p) && p.length >= 2);
  const segments = [];
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    segments.push({ start: length, end: length + len, len, x0: a[0], z0: a[1], ux: dx / len, uz: dz / len });
    length += len;
  }
  return length >= MIN_PATH_LENGTH ? { path, index, segments, length } : null;
}

function samplePath(route, distance) {
  const d = THREE.MathUtils.clamp(distance, 0, route.length);
  let seg = route.segments[route.segments.length - 1];
  for (const candidate of route.segments) {
    if (d <= candidate.end) { seg = candidate; break; }
  }
  const t = THREE.MathUtils.clamp((d - seg.start) / seg.len, 0, 1);
  return { x: seg.x0 + seg.ux * seg.len * t, z: seg.z0 + seg.uz * seg.len * t, ux: seg.ux, uz: seg.uz };
}

function wrapAngle(a) { return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; }
function headingFor(ux, uz) { return Math.atan2(-ux, -uz); }

export class Traffic {
  // `roads` remains in the signature for the game integrator's existing call;
  // the old straight-segment format is intentionally ignored.
  constructor(scene, roads) {
    this.scene = scene;
    this.roads = roads;
    this.routes = ROAD_PATHS.map(pathInfo).filter(Boolean);
    this.units = [];
    this.clock = 0;
    this.cars = [];
    if (!this.routes.length) return;

    const occupied = [];
    const count = CAR_COUNT + BUS_COUNT;
    for (let i = 0; i < count; i++) {
      const kind = i >= CAR_COUNT ? 'bus' : 'car';
      const route = this._chooseRoute(occupied, i);
      if (!route) continue;
      const dir = route.path.oneway ? 1 : (Math.random() < 0.5 ? -1 : 1);
      const dist = this._chooseDistance(route, occupied, dir, i);
      const sample = samplePath(route, dist);
      const lane = route.path.w / 4;
      const laneX = sample.uz * lane * dir;
      const laneZ = -sample.ux * lane * dir;
      // Real London bus routes for the road this bus drives on.
      const ROUTES = { Whitehall: ['11', '24', '88', '453'], 'Parliament Street': ['11', '24', '88', '159'], 'Bridge Street': ['12', '159', '453'], 'Westminster Bridge': ['12', '53', '159', '453'], 'Westminster Bridge Road': ['12', '53', '148', '453'], 'Victoria Street': ['11', '24', '148', '507'], 'Millbank': ['87', 'C10'], 'Lambeth Palace Road': ['77', 'C10'] };
      const pool = ROUTES[route.path.name] || ['159', '12', '24'];
      const mesh = makeVehicleMesh(kind, kind === 'car' ? { color: CAR_COLORS[i % CAR_COLORS.length] } : { route: pool[i % pool.length] });
      mesh.position.set(sample.x + laneX, 0.035, sample.z + laneZ);
      mesh.rotation.y = headingFor(sample.ux * dir, sample.uz * dir);
      scene.add(mesh);
      const unit = {
        route, distance: dist, dir, lane, mesh, kind,
        radius: kind === 'bus' ? 5.1 : 2.35,
        cruise: kind === 'bus' ? 8.5 + Math.random() * 2.5 : 12 + Math.random() * 6,
        speed: 0, heading: mesh.rotation.y, phase: Math.random() * TAU,
      };
      this.units.push(unit);
      occupied.push(unit);
    }
    this.cars = this.units.map((u) => ({ position: u.mesh.position, radius: u.radius, mesh: u.mesh }));
  }

  _chooseRoute(occupied, seed) {
    // Prefer distributing traffic across the map while keeping long routes busy.
    const candidates = this.routes.slice().sort(() => Math.random() - 0.5);
    for (const route of candidates) {
      const onRoute = occupied.filter((u) => u.route === route).length;
      if (onRoute < Math.max(2, Math.floor(route.length / 95))) return route;
    }
    return candidates[seed % candidates.length] || null;
  }

  _chooseDistance(route, occupied, dir, seed) {
    const margin = Math.min(6, route.length * 0.04);
    for (let attempt = 0; attempt < 24; attempt++) {
      const d = margin + Math.random() * Math.max(0.1, route.length - margin * 2);
      const crowded = occupied.some((u) => u.route === route && Math.abs(u.distance - d) < 16);
      if (!crowded) return d;
    }
    return margin + ((seed * 0.61803398875) % 1) * (route.length - margin * 2);
  }

  _position(unit, sample = samplePath(unit.route, unit.distance)) {
    const travel = unit.dir;
    const x = sample.x + sample.uz * unit.lane * travel;
    const z = sample.z - sample.ux * unit.lane * travel;
    return { x, z, ux: sample.ux * travel, uz: sample.uz * travel };
  }

  _distanceAhead(unit, other) {
    if (unit === other) return Infinity;
    const a = this._position(unit), b = this._position(other);
    const dx = b.x - a.x, dz = b.z - a.z;
    const ahead = dx * a.ux + dz * a.uz;
    if (ahead <= 0 || ahead > 18) return Infinity;
    const lateral = Math.abs(dx * -a.uz + dz * a.ux);
    return lateral < (unit.radius * 0.42 + other.radius * 0.42 + 1.25) ? ahead : Infinity;
  }

  update(dt, obstacles = []) {
    const step = Math.min(Math.max(0, dt || 0), 0.1);
    this.clock += step;
    for (const unit of this.units) {
      const pos = this._position(unit);
      let nearest = Infinity;

      for (const obstacle of obstacles) {
        if (!obstacle?.position) continue;
        const dx = obstacle.position.x - pos.x, dz = obstacle.position.z - pos.z;
        const ahead = dx * pos.ux + dz * pos.uz;
        if (ahead <= 0 || ahead > 9) continue;
        const lateral = Math.abs(dx * -pos.uz + dz * pos.ux);
        if (lateral < unit.radius * 0.42 + (obstacle.radius || 0.8) + 0.65) nearest = Math.min(nearest, ahead);
      }
      for (const other of this.units) nearest = Math.min(nearest, this._distanceAhead(unit, other));

      const brakingRange = Number.isFinite(nearest) ? Math.min(9, nearest) : Infinity;
      const targetSpeed = Number.isFinite(brakingRange)
        ? unit.cruise * THREE.MathUtils.clamp((brakingRange - 1.7) / 6.3, 0, 1)
        : unit.cruise;
      const response = targetSpeed < unit.speed ? 2.5 : 0.65;
      unit.speed += (targetSpeed - unit.speed) * (1 - Math.exp(-response * step));
      if (unit.speed < 0.035) unit.speed = 0;

      unit.distance += unit.speed * unit.dir * step;
      if (unit.distance >= unit.route.length) {
        unit.distance = unit.route.length;
        unit.dir = -1;
      } else if (unit.distance <= 0) {
        unit.distance = 0;
        unit.dir = 1;
      }

      const tangent = samplePath(unit.route, unit.distance);
      const next = this._position(unit, tangent);
      const targetHeading = headingFor(next.ux, next.uz);
      const turnBlend = 1 - Math.exp(-Math.max(1.4, unit.speed * 0.48) * step);
      unit.heading += wrapAngle(targetHeading - unit.heading) * turnBlend;
      unit.mesh.position.set(next.x, 0.035 + Math.sin(this.clock * 2.2 + unit.phase) * 0.012, next.z);
      unit.mesh.rotation.y = unit.heading;
      unit.mesh.rotation.z = THREE.MathUtils.clamp(wrapAngle(targetHeading - unit.heading) * -0.12, -0.045, 0.045);
      for (const wheel of unit.mesh.userData.wheels || []) wheel.rotation.x += unit.speed * step * 1.8;
    }
  }
}
