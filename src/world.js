// Westminster 3D world built from real OpenStreetMap data (see tools/bake_osm.py)
// plus hand-modelled landmarks: Elizabeth Tower (Big Ben), Victoria Tower, London Eye.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
let WATER_MESH = null, CLOUDS = null;
import DATA from './data/westminster.json';

// ---------------------------------------------------------------- constants
const [BX0, BX1, BZ0, BZ1] = DATA.bounds;
export const WORLD = { x0: BX0 + 10, x1: BX1 - 10, z0: BZ0 + 10, z1: BZ1 - 10 };
export const WATER_Y = -6;
export const BIG_BEN = { x: DATA.special['Elizabeth Tower'][0], z: DATA.special['Elizabeth Tower'][1] };
export const VICTORIA_TOWER = { x: DATA.special['Victoria Tower'][0], z: DATA.special['Victoria Tower'][1] };
export const LONDON_EYE = { x: DATA.special['London Eye'][0], z: DATA.special['London Eye'][1] };

// ---------------------------------------------------------------- terrain mask (0 land, 1 water, 2 building, 3 bridge)
const M = DATA.mask;
const MASK = Uint8Array.from(atob(M.data), (c) => c.charCodeAt(0));
export function cellAt(x, z) {
  const i = Math.floor((x - M.x0) / M.cell), j = Math.floor((z - M.z0) / M.cell);
  if (i < 0 || j < 0 || i >= M.w || j >= M.h) return 9;
  return MASK[j * M.w + i];
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
const inWorld = (x, z) => x > WORLD.x0 && x < WORLD.x1 && z > WORLD.z0 && z < WORLD.z1;
const landOK = (v) => v === 0 || v === 3;
const waterOK = (v) => v === 1 || v === 3;
export function landBlocked(x, z, r = 0) {
  if (!inWorld(x, z) || !landOK(cellAt(x, z))) return true;
  if (r > 0) for (const [dx, dz] of DIRS) if (!landOK(cellAt(x + dx * r, z + dz * r))) return true;
  return false;
}
export function waterBlocked(x, z, r = 0) {
  if (!inWorld(x, z) || !waterOK(cellAt(x, z))) return true;
  if (r > 0) for (const [dx, dz] of DIRS) if (!waterOK(cellAt(x + dx * r, z + dz * r))) return true;
  return false;
}
export const isWater = (x, z) => waterOK(cellAt(x, z));
export const isOnBridge = (x, z) => cellAt(x, z) === 3;
/** Nearest walkable land point (spiral search) — use to place spawns safely. */
export function findLandNear(x, z, r = 0.6, maxR = 60) {
  if (!landBlocked(x, z, r)) return { x, z };
  for (let d = 2; d <= maxR; d += 2) for (let a = 0; a < 16; a++) {
    const px = x + Math.cos(a / 16 * Math.PI * 2) * d, pz = z + Math.sin(a / 16 * Math.PI * 2) * d;
    if (!landBlocked(px, pz, r)) return { x: px, z: pz };
  }
  return { x, z };
}
/** Push a circle out of AABB colliders. Returns true if it hit anything. */
export function resolveCircle(pos, r, colliders) {
  let hit = false;
  for (const b of colliders || []) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX)), cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; }
      else { pos.x += r; }
    }
  }
  return hit;
}

// ---------------------------------------------------------------- roads
const MAIN = new Set(['trunk', 'primary', 'secondary', 'tertiary']);
/** Drivable polylines for traffic: [{pts:[[x,z]..], w, name, bridge, oneway}] */
export const ROAD_PATHS = DATA.roads.filter((r) => MAIN.has(r.hw) && r.p.length >= 2)
  .map((r) => ({ pts: r.p, w: r.w, name: r.n, bridge: !!r.b, oneway: !!r.o }));
/** All drivable roads (for routing). */
export const DATA_ROADS = DATA.roads.filter((r) => !['pedestrian', 'service'].includes(r.hw));
/** Legacy straight segments {x1,z1,x2,z2,w,name} (minimap + traffic). */
export const ROADS = [];
for (const r of DATA.roads) {
  if (!MAIN.has(r.hw) && r.hw !== 'residential') continue;
  for (let i = 0; i < r.p.length - 1; i++) {
    const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1];
    if (Math.hypot(x2 - x1, z2 - z1) < 1) continue;
    ROADS.push({ x1, z1, x2, z2, w: r.w, name: r.n || '', main: MAIN.has(r.hw) });
  }
}
/** Map data for the minimap/HUD. */
export const MAP = { river: DATA.river, grass: DATA.grass, buildings: DATA.buildings, roads: DATA.roads, bounds: DATA.bounds };

// Legacy approximations (river band where Westminster Bridge crosses).
function bridgeInfo() {
  const segs = DATA.roads.filter((r) => r.b && /Westminster Bridge/.test(r.n));
  const pts = segs.flatMap((r) => r.p);
  const zs = pts.map((p) => p[1]), xs = pts.map((p) => p[0]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs) - 12, z1: Math.max(...zs) + 12, zc: zs.reduce((a, b) => a + b, 0) / zs.length };
}
export const BRIDGE = bridgeInfo();
export const RIVER = { x0: BRIDGE.x0, x1: BRIDGE.x1 };

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function speckle(g, w, h, n, a, rand = Math.random) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${a * rand()})` : `rgba(255,255,255,${a * rand()})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}
// one texture tile = 4m wide x 4m (one storey) tall
const FACADES = {
  stone:    { wall: '#d6ccb4', win: '#2c3946', frame: '#efe8d8', ww: 0.42, wh: 0.55, lit: 0.12 },
  brick:    { wall: '#8e4c38', win: '#232d36', frame: '#efe6d6', ww: 0.38, wh: 0.52, lit: 0.10 },
  georgian: { wall: '#c4ab84', win: '#1e2830', frame: '#f6f1e6', ww: 0.34, wh: 0.62, lit: 0.10 },
  cream:    { wall: '#ebe2cc', win: '#344450', frame: '#ffffff', ww: 0.40, wh: 0.56, lit: 0.12 },
  glass:    { wall: '#4f6675', win: '#88a9bd', frame: '#2c3a44', ww: 0.92, wh: 0.78, lit: 0.06 },
};
function drawFacade(g, w, h, f, rough) {
  const rand = rng(f.wall.charCodeAt(1) * 97);
  g.fillStyle = rough ? '#e6e6e6' : f.wall; g.fillRect(0, 0, w, h);
  if (!rough) speckle(g, w, h, 1500, 0.10, rand);
  const fh = h / 4;
  for (let s = 0; s < 4; s++) {
    const y0 = s * fh;
    if (!rough) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, y0 + fh - 8, w, 8); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y0 + fh - 10, w, 2); }
    const ww = w * f.ww, wh = fh * f.wh, x = (w - ww) / 2, y = y0 + (fh - wh) / 2 - 4;
    const lit = rand() < f.lit;
    if (rough) { g.fillStyle = '#1c1c1c'; g.fillRect(x, y, ww, wh); continue; }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 5, y - 5, ww + 10, wh + 12); // reveal shadow
    g.fillStyle = f.frame; g.fillRect(x - 4, y - 4, ww + 8, wh + 8);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 6, y + wh + 4, ww + 12, 5); // sill
    const grad = g.createLinearGradient(0, y, 0, y + wh);
    grad.addColorStop(0, lit ? '#ffe2a0' : f.win); grad.addColorStop(1, lit ? '#d9a355' : '#10161b');
    g.fillStyle = grad; g.fillRect(x, y, ww, wh);
    g.fillStyle = f.frame; g.fillRect(x + ww / 2 - 2, y, 4, wh); g.fillRect(x, y + wh * 0.42, ww, 4);
    if (f.ww < 0.9 && rand() < 0.5) { g.fillStyle = 'rgba(240,235,225,0.55)'; g.fillRect(x + 2, y + 2, ww - 4, wh * 0.18); } // blinds
  }
}
function facadeTexture(f) {
  const map = canvasTex(128, 512, (g, w, h) => drawFacade(g, w, h, f, false));
  const rough = canvasTex(128, 512, (g, w, h) => drawFacade(g, w, h, f, true), { srgb: false });
  return { map, rough };
}
const SHOP_COLOURS = ['#1f4d3a', '#7a1f24', '#1c2c4a', '#2b2b2b', '#6b4a1f', '#3d5c6b'];
function shopTexture(col, i) { // one tile = 4m wide x 4.5m tall
  return canvasTex(128, 144, (g, w, h) => {
    const rand = rng(100 + i);
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 22, w, 2);
    g.fillStyle = '#e9dcc0'; g.font = 'bold 11px Georgia'; g.fillText(['CAFÉ', 'PUB', 'NEWS', 'BAKERY', 'GIFTS', 'PHARMACY'][i % 6], 10, 15);
    const grad = g.createLinearGradient(0, 30, 0, h - 10);
    grad.addColorStop(0, '#9fb9c4'); grad.addColorStop(0.5, '#3c4e57'); grad.addColorStop(1, '#ffd9a0');
    g.fillStyle = grad; g.fillRect(8, 30, 70, h - 40);
    g.fillStyle = '#2a1f17'; g.fillRect(88, 34, 32, h - 34); // door
    g.fillStyle = '#c9a548'; g.fillRect(114, 80, 3, 8);
    g.fillStyle = col; g.fillRect(41, 30, 4, h - 40);
    for (let k = 0; k < 6; k++) { g.fillStyle = `hsl(${rand() * 360},40%,${40 + rand() * 30}%)`; g.fillRect(14 + k * 10, h - 26, 7, 12); } // goods
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, h - 10, w, 10);
  });
}
// gothic tile = 4m wide x 8m tall (Perpendicular Gothic panelling, honey Anston limestone)
function gothicTexture() { // 4m x 8m: Perpendicular Gothic panelling with narrow lancets
  return canvasTex(128, 256, (g, w, h) => {
    const rand = rng(11);
    g.fillStyle = '#cdb07a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3000, 0.12, rand);
    for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(90,70,40,0.08)'; g.fillRect(0, y, w, 1); } // ashlar courses
    const panel = (x0, x1, y0, y1, dark) => {
      const mid = (x0 + x1) / 2;
      g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, y0 + 10); g.quadraticCurveTo(x0, y0, mid, y0 - 6); g.quadraticCurveTo(x1, y0, x1, y0 + 10); g.lineTo(x1, y1); g.closePath();
      g.fillStyle = dark; g.fill(); g.strokeStyle = 'rgba(255,238,200,0.55)'; g.lineWidth = 1.5; g.stroke();
    };
    for (const [y0, y1, glass] of [[18, 112, true], [146, 242, true]]) {
      for (let k = 0; k < 4; k++) {
        const x0 = 10 + k * 27, x1 = x0 + 21;
        panel(x0, x1, y0, y1, glass && (k === 1 || k === 2) ? '#2b2925' : 'rgba(110,85,50,0.30)');
        if (glass && (k === 1 || k === 2)) { g.fillStyle = 'rgba(150,175,190,0.22)'; g.fillRect(x0 + 3, y0 + 14, 5, y1 - y0 - 18); g.fillStyle = '#cdb07a'; g.fillRect(x0, y0 + (y1 - y0) * 0.5, x1 - x0, 2); }
      }
    }
    g.fillStyle = 'rgba(80,60,30,0.45)'; g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);   // buttress shadow
    g.fillStyle = 'rgba(255,240,205,0.35)'; g.fillRect(5, 0, 2, h);
    g.fillStyle = 'rgba(70,52,28,0.5)'; g.fillRect(0, 124, w, 8); g.fillStyle = 'rgba(255,240,205,0.3)'; g.fillRect(0, 122, w, 2); // string course
    for (let x = 4; x < w; x += 16) { g.fillStyle = 'rgba(60,45,25,0.35)'; g.fillRect(x, 0, 8, 6); } // crenellation hint
  });
}
const T = {};
function textures() {
  T.pavement = canvasTex(256, 256, (g, w, h) => { // 4m
    g.fillStyle = '#bdb9b0'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4000, 0.10);
    g.strokeStyle = 'rgba(70,65,60,0.28)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    for (let r = 0; r < 4; r++) for (let i = 0; i <= 4; i++) { const x = i * 64 + (r % 2) * 32; g.beginPath(); g.moveTo(x, r * 64); g.lineTo(x, r * 64 + 64); g.stroke(); }
  });
  T.asphalt = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#3d3e42'; g.fillRect(0, 0, w, h); speckle(g, w, h, 9000, 0.16); });
  T.grass = canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#5e8f3e' : '#679a44'; g.fillRect(0, i * 32, w, 32); } // mown stripes
    speckle(g, w, h, 6000, 0.12);
  });
  T.roof = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#6d7075'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2000, 0.15);
    g.strokeStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); } });
  T.gothic = gothicTexture();
  T.facades = Object.fromEntries(Object.entries(FACADES).map(([k, f]) => [k, facadeTexture(f)]));
  T.shops = SHOP_COLOURS.map((c, i) => shopTexture(c, i));
  T.waterNormal = canvasTex(256, 256, (g, w, h) => {
    const hgt = new Float32Array(w * h), waves = [];
    for (let i = 0; i < 14; i++) waves.push([Math.round(1 + Math.random() * 6) * (Math.random() < .5 ? -1 : 1), Math.round(Math.random() * 6) * (Math.random() < .5 ? -1 : 1), Math.random() * 6.28, 1 / (1 + i * 0.4)]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 0; for (const [a, b, p, amp] of waves) v += Math.sin((a * x / w + b * y / h) * Math.PI * 2 + p) * amp; hgt[y * w + x] = v;
    }
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = hgt[y * w + ((x + 1) % w)] - hgt[y * w + ((x - 1 + w) % w)];
      const dy = hgt[((y + 1) % h) * w + x] - hgt[((y - 1 + h) % h) * w + x];
      const n = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize(), k = (y * w + x) * 4;
      img.data[k] = (n.x * 0.5 + 0.5) * 255; img.data[k + 1] = (n.y * 0.5 + 0.5) * 255; img.data[k + 2] = (n.z * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
  T.clock = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#1d1a16'; g.fillRect(0, 0, w, w);
    g.fillStyle = '#c9a548'; g.beginPath(); g.arc(c, c, 124, 0, 7); g.fill();
    g.fillStyle = '#f4ecd6'; g.beginPath(); g.arc(c, c, 112, 0, 7); g.fill();
    g.strokeStyle = '#1d1a16'; g.lineWidth = 2;
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r1 = i % 5 ? 100 : 92; g.beginPath(); g.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); g.lineTo(c + Math.sin(a) * 108, c - Math.cos(a) * 108); g.stroke(); }
    g.fillStyle = '#1d1a16'; g.font = 'bold 18px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((s, i) => { const a = i / 12 * Math.PI * 2; g.fillText(s, c + Math.sin(a) * 76, c - Math.cos(a) * 76); });
    g.strokeStyle = 'rgba(30,26,22,0.25)'; g.lineWidth = 1; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.sin(a) * 60, c - Math.cos(a) * 60); g.stroke(); }
  });
  T.flag = canvasTex(256, 128, (g, w, h) => { // Union flag
    g.fillStyle = '#012169'; g.fillRect(0, 0, w, h);
    const X = (col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke(); };
    X('#fff', 26); X('#C8102E', 9);
    g.fillStyle = '#fff'; g.fillRect(w / 2 - 22, 0, 44, h); g.fillRect(0, h / 2 - 22, w, 44);
    g.fillStyle = '#C8102E'; g.fillRect(w / 2 - 13, 0, 26, h); g.fillRect(0, h / 2 - 13, w, 26);
  });
}

// ---------------------------------------------------------------- geometry helpers
function signedArea(ring) { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length]; a += x1 * z2 - x2 * z1; } return a / 2; }
const ccw = (ring) => (signedArea(ring) > 0 ? ring : ring.slice().reverse());
/** Vertical walls around a ring, outward-facing, UV in metres / (uScale, vScale). */
function wallGeometry(ring, y0, y1, uScale = 4, vScale = 4) {
  ring = ccw(ring);
  const pos = [], uv = [], idx = []; let u = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.05) continue;
    const n = pos.length / 3;
    pos.push(ax, y0, az, ax, y1, az, bx, y1, bz, bx, y0, bz);
    const u0 = -u / uScale, u1 = -(u + len) / uScale; u += len;
    uv.push(u0, y0 / vScale, u0, y1 / vScale, u1, y1 / vScale, u1, y0 / vScale);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Flat horizontal polygon (with holes) at height y, UV in metres / uvScale. */
function flatGeometry(ring, holes, y, uvScale = 4) {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes || []) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / uvScale, uv.getY(i) / uvScale);
  return g;
}
/** Road ribbon along a polyline. */
function ribbonGeometry(pts, width, y, uvScale = 8) {
  const pos = [], uv = [], idx = []; let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const nx = -dz * width / 2, nz = dx * width / 2;
    pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
    uv.push(0, dist / uvScale, width / uvScale, dist / uvScale);
    if (i > 0) { const n = i * 2; idx.push(n - 2, n - 1, n, n - 1, n + 1, n); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // make sure the ribbon faces up
  const nrm = g.attributes.normal; if (nrm.count && nrm.getY(0) < 0) { g.setIndex(idx.map((v, k) => idx[k - (k % 3) + [0, 2, 1][k % 3]])); g.computeVertexNormals(); }
  return g;
}
function tint(geo, r, g, b) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
}
function mergedMesh(geos, mat, { cast = true, receive = true } = {}) {
  if (!geos.length) return null;
  const g = mergeGeometries(geos.map((x) => (x.index ? x : x)), false);
  geos.forEach((x) => x.dispose());
  const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = receive; return m;
}
function polyCentroid(ring) { let x = 0, z = 0; for (const p of ring) { x += p[0]; z += p[1]; } return [x / ring.length, z / ring.length]; }
function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- landmarks
const stoneMat = () => new THREE.MeshStandardMaterial({ map: T.gothic, roughness: 0.85 });
function boxUV(w, h, d, us = 4, vs = 8) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv;
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * spans[f][0] / us, uv.getY(k) * spans[f][1] / vs); }
  return g;
}
function buildElizabethTower(scene) {
  const g = new THREE.Group(); g.position.set(BIG_BEN.x, 0, BIG_BEN.z);
  const stone = stoneMat();
  const gold = new THREE.MeshStandardMaterial({ color: '#c9a548', metalness: 0.8, roughness: 0.3 });
  const slate = new THREE.MeshStandardMaterial({ color: '#33413d', metalness: 0.4, roughness: 0.5 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(boxUV(13, 4, 13), stone, 0, 2, 0);
  add(boxUV(12, 52, 12), stone, 0, 30, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(boxUV(1.6, 54, 1.6, 2, 8), stone, sx * 6.1, 29, sz * 6.1); // corner buttresses
  add(boxUV(14, 1.2, 14), stone, 0, 56.6, 0);
  add(boxUV(13.6, 14, 13.6), stone, 0, 64, 0); // clock stage
  add(boxUV(14.4, 1.2, 14.4), stone, 0, 71.6, 0);
  add(boxUV(11, 9, 11), stone, 0, 76.6, 0); // belfry
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // pinnacles
    add(new THREE.ConeGeometry(0.8, 6, 6), gold, sx * 6.6, 75, sz * 6.6);
    add(new THREE.ConeGeometry(0.6, 4, 6), slate, sx * 5.2, 83, sz * 5.2);
  }
  const roof = add(new THREE.ConeGeometry(8.2, 20, 4), slate, 0, 91, 0); roof.rotation.y = Math.PI / 4;
  add(new THREE.CylinderGeometry(0.25, 0.6, 6, 8), gold, 0, 103, 0);
  add(new THREE.SphereGeometry(0.6, 12, 8), gold, 0, 106.4, 0);
  // clock faces with live hands
  const faceMat = new THREE.MeshStandardMaterial({ map: T.clock, roughness: 0.6, emissive: '#fff4cc', emissiveIntensity: 0.18, emissiveMap: T.clock });
  const handMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 });
  const hands = [];
  [[0, 0], [Math.PI / 2, 0], [Math.PI, 0], [-Math.PI / 2, 0]].forEach(([ry]) => {
    const f = new THREE.Group(); f.rotation.y = ry; g.add(f);
    const face = new THREE.Mesh(new THREE.CircleGeometry(5.6, 48), faceMat); face.position.set(0, 64, 6.85); f.add(face);
    const mk = (len, wid) => { const geo = new THREE.BoxGeometry(wid, len, 0.12); geo.translate(0, len / 2 - 0.4, 0); const m = new THREE.Mesh(geo, handMat); m.position.set(0, 64, 6.95); f.add(m); return m; };
    hands.push({ hour: mk(3.0, 0.38), minute: mk(4.6, 0.24) });
  });
  scene.add(g);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false });
  return () => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const h = +parts.hour % 12, m = +parts.minute, s = +parts.second;
    const ma = (m + s / 60) / 60 * Math.PI * 2, ha = (h + m / 60) / 12 * Math.PI * 2;
    for (const k of hands) { k.minute.rotation.z = -ma; k.hour.rotation.z = -ha; }
  };
}
function buildVictoriaTower(scene) {
  const g = new THREE.Group(); g.position.set(VICTORIA_TOWER.x, 0, VICTORIA_TOWER.z);
  const stone = stoneMat();
  const slate = new THREE.MeshStandardMaterial({ color: '#3b3f3c', roughness: 0.6 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(boxUV(22, 86, 22), stone, 0, 43, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(boxUV(3, 92, 3, 2, 8), stone, sx * 10.5, 46, sz * 10.5);
    add(new THREE.ConeGeometry(1.8, 8, 8), slate, sx * 10.5, 96, sz * 10.5);
  }
  add(new THREE.CylinderGeometry(0.2, 0.25, 16, 6), slate, 0, 94, 0);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5, 12, 4), new THREE.MeshStandardMaterial({ map: T.flag, side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(4.6, 99.5, 0); g.add(flag);
  scene.add(g);
  const base = flag.geometry.attributes.position.array.slice();
  return (t) => { // wave the flag
    const p = flag.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = base[i * 3] + 4.5; p.setZ(i, Math.sin(x * 0.9 - t * 4) * 0.35 * (x / 9)); }
    p.needsUpdate = true;
  };
}
function buildLondonEye(scene, colliders) {
  // Wheel plane runs along the river (roughly NNW-SSE here); axis is horizontal across the river.
  const g = new THREE.Group(); g.position.set(LONDON_EYE.x, 0, LONDON_EYE.z); g.rotation.y = -0.23;
  const white = new THREE.MeshStandardMaterial({ color: '#f2f4f5', metalness: 0.6, roughness: 0.35 });
  const R = 62, HUB = 70;
  const wheel = new THREE.Group(); wheel.position.y = HUB; g.add(wheel);
  for (const off of [-2.2, 2.2]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.6, 8, 120), white); rim.rotation.y = Math.PI / 2; rim.position.x = off; wheel.add(rim); }
  const spokes = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; spokes.push(0, 0, 0, (i % 2 ? 2.2 : -2.2), Math.sin(a) * R, Math.cos(a) * R); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3));
  wheel.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: '#dfe5ea' })));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 7, 16), white); hub.rotation.z = Math.PI / 2; wheel.add(hub);
  const podGeo = new THREE.CapsuleGeometry(1.6, 4.5, 4, 10); podGeo.rotateZ(Math.PI / 2);
  const podMat = new THREE.MeshStandardMaterial({ color: '#cfe6f2', metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.85 });
  const pods = new THREE.InstancedMesh(podGeo, podMat, 32); const o = new THREE.Object3D();
  for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; o.position.set(0, Math.sin(a) * (R + 2), Math.cos(a) * (R + 2)); o.updateMatrix(); pods.setMatrixAt(i, o.matrix); }
  wheel.add(pods);
  // A-frame legs on the land side (+x local)
  for (const s of [-1, 1]) {
    const foot = new THREE.Vector3(26, 0, s * 26), top = new THREE.Vector3(4, HUB, 0);
    const len = foot.distanceTo(top); const leg = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.6, len, 10), white);
    leg.position.copy(foot).add(top).multiplyScalar(0.5); leg.lookAt(top); leg.rotateX(Math.PI / 2); leg.castShadow = true; g.add(leg);
    const wp = foot.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    colliders.push({ minX: wp.x - 2, maxX: wp.x + 2, minZ: wp.z - 2, maxZ: wp.z + 2 });
  }
  scene.add(g);
  return (dt) => { wheel.rotation.x += dt * 0.012; };
}

// ---------------------------------------------------------------- city
function buildCity(scene, colliders, boatColliders) {
  // ground (two river banks) + river bed + water
  const pave = new THREE.MeshStandardMaterial({ map: T.pavement, roughness: 0.95 });
  const land = mergedMesh(DATA.land.map((l) => flatGeometry(l.p, l.holes, 0, 4)), pave, { cast: false });
  scene.add(land);
  const grassMat = new THREE.MeshStandardMaterial({ map: T.grass, roughness: 1 });
  scene.add(mergedMesh(DATA.grass.map((r) => flatGeometry(r, [], 0.04, 8)), grassMat, { cast: false }));
  const [x0, x1, z0, z1] = DATA.bounds;
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: '#2a2f2a' }));
  bed.rotation.x = -Math.PI / 2; bed.position.set((x0 + x1) / 2, -14, (z0 + z1) / 2); scene.add(bed);
  // Thames: natural river surface — rolling waves (vertex) + two scrolling ripple layers, soft sky sheen, no mirror.
  T.waterNormal.wrapS = T.waterNormal.wrapT = THREE.RepeatWrapping; T.waterNormal.repeat.set(60, 60);
  const waterGeo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 220, 190);
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2a4a50', roughness: 0.32, metalness: 0.0, normalMap: T.waterNormal, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 0.35, transparent: true, opacity: 0.97 });
  waterMat.userData.time = { value: 0 };
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterMat.userData.time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float w1 = sin(position.x * 0.045 + uTime * 1.1) * 0.16;
      float w2 = sin(position.y * 0.06 - uTime * 0.8 + position.x * 0.02) * 0.12;
      float w3 = sin((position.x + position.y) * 0.13 + uTime * 1.9) * 0.05;
      transformed.z += w1 + w2 + w3;`);
    sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `
      vec3 n1 = texture2D(normalMap, vNormalMapUv + vec2(uTime * 0.010, uTime * 0.016)).xyz * 2.0 - 1.0;
      vec3 n2 = texture2D(normalMap, vNormalMapUv * 1.7 - vec2(uTime * 0.013, -uTime * 0.008)).xyz * 2.0 - 1.0;
      vec3 mapN = normalize(vec3((n1.xy + n2.xy) * normalScale, n1.z * n2.z));
      normal = normalize(tbn * mapN);`);
  };
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set((x0 + x1) / 2, WATER_Y, (z0 + z1) / 2); water.receiveShadow = true; scene.add(water);
  WATER_MESH = water;
  // embankment walls (granite) along the river edge, skipping the map border
  const onBorder = ([x, z]) => Math.abs(x - x0) < 0.5 || Math.abs(x - x1) < 0.5 || Math.abs(z - z0) < 0.5 || Math.abs(z - z1) < 0.5;
  const graniteTex = canvasTex(256, 128, (g, w, h) => { // Victorian granite blocks, 4m x 2m per tile
    g.fillStyle = '#8f8a80'; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, 0.18);
    g.strokeStyle = 'rgba(40,36,30,0.45)'; g.lineWidth = 3;
    for (let r = 0; r < 4; r++) { const y = r * 32; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      for (let x = (r % 2) * 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } }
    const grad = g.createLinearGradient(0, h * 0.55, 0, h); grad.addColorStop(0, 'rgba(30,40,30,0)'); grad.addColorStop(1, 'rgba(30,45,30,0.55)'); g.fillStyle = grad; g.fillRect(0, 0, w, h); // tide stain
  });
  const granite = new THREE.MeshStandardMaterial({ color: '#ffffff', map: graniteTex, roughness: 0.9 });
  const wallGeos = [];
  for (const ring of DATA.river) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (onBorder(a) && onBorder(b)) continue;
      const geo = wallGeometry([b, a], -14, 0.02, 4, 4); // two-point ring → one quad; make it double-sided via material
      wallGeos.push(geo);
    }
  }
  const walls = mergedMesh(wallGeos, granite.clone()); walls.material.side = THREE.DoubleSide; scene.add(walls);
  // river parapet: low wall on the embankment edge
  const parapetGeos = [];
  for (const ring of DATA.river) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]; if (onBorder(a) || onBorder(b)) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (isOnBridge(mx, mz) || cellAt(mx, mz) === 3) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.5) continue;
    const geo = new THREE.BoxGeometry(len, 1.1, 0.7); geo.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0])); geo.translate(mx, 0.55, mz); parapetGeos.push(geo);
  }
  scene.add(mergedMesh(parapetGeos, granite));

  // roads
  const asphalt = new THREE.MeshStandardMaterial({ map: T.asphalt, roughness: 0.9 });
  const rank = { trunk: 6, primary: 5, secondary: 4, tertiary: 3, residential: 2, unclassified: 2, pedestrian: 1, service: 1 };
  const kerbGeos = [], roadGeos = [], plazaGeos = [], deckGeos = [], fasciaGeos = [], dashGeos = [], railGeos = [], greenRailGeos = [];
  for (const r of DATA.roads) {
    const y = 0.05 + rank[r.hw] * 0.012;
    if (r.hw === 'pedestrian') { plazaGeos.push(ribbonGeometry(r.p, r.w, 0.03)); continue; }
    roadGeos.push(ribbonGeometry(r.p, r.w, y, 8));
    if (!r.b && rank[r.hw] >= 2) for (const side of [-1, 1]) { // granite kerb stones
      const off = r.p.map((p, i) => { const a = r.p[Math.max(0, i - 1)], b = r.p[Math.min(r.p.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * side * (r.w / 2 + 0.15), p[1] + dx / l * side * (r.w / 2 + 0.15)]; });
      kerbGeos.push(ribbonGeometry(off, 0.32, 0.14, 1));
    }
    if (r.b) { // bridge deck over the water
      deckGeos.push(ribbonGeometry(r.p, r.w + 6, 0.02, 4));
      for (const side of [-1, 1]) {
        const off = r.p.map((p, i) => { const a = r.p[Math.max(0, i - 1)], b = r.p[Math.min(r.p.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * side * (r.w / 2 + 3), p[1] + dx / l * side * (r.w / 2 + 3)]; });
        for (let i = 0; i < off.length - 1; i++) {
          fasciaGeos.push(wallGeometry([off[i], off[i + 1]], -2.2, 0.02, 4, 4));
          const [ax, az] = off[i], [bx, bz] = off[i + 1], len = Math.hypot(bx - ax, bz - az);
          const geo = new THREE.BoxGeometry(len, 1.2, 0.35); geo.rotateY(-Math.atan2(bz - az, bx - ax)); geo.translate((ax + bx) / 2, 0.6, (az + bz) / 2);
          (/Westminster/.test(r.n) ? greenRailGeos : railGeos).push(geo);
        }
      }
      // piers every ~38m
      let acc = 0;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1], len = Math.hypot(bx - ax, bz - az);
        for (let s = (38 - acc); s < len; s += 38) {
          const px = ax + (bx - ax) * s / len, pz = az + (bz - az) * s / len;
          if (!isWater(px, pz)) continue;
          const ang = Math.atan2(bz - az, bx - ax);
          const geo = new THREE.BoxGeometry(4.5, 12, r.w + 8); geo.rotateY(-ang); geo.translate(px, -8.2, pz); fasciaGeos.push(geo);
          const hw = Math.abs(Math.cos(ang)) * 2.25 + Math.abs(Math.sin(ang)) * (r.w / 2 + 4), hd = Math.abs(Math.sin(ang)) * 2.25 + Math.abs(Math.cos(ang)) * (r.w / 2 + 4);
          boatColliders.push({ minX: px - hw, maxX: px + hw, minZ: pz - hd, maxZ: pz + hd });
        }
        acc = (acc + len) % 38;
      }
    }
    // centre dashes on bigger roads
    if (rank[r.hw] >= 3 && !r.o) {
      let carry = 0;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1], len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
        for (let s = carry; s < len; s += 9) {
          const geo = new THREE.PlaneGeometry(3, 0.18); geo.rotateX(-Math.PI / 2); geo.rotateY(-ang);
          geo.translate(ax + (bx - ax) * s / len, y + 0.01, az + (bz - az) * s / len); dashGeos.push(geo);
        }
        carry = ((carry - len) % 9 + 9) % 9;
      }
    }
  }
  scene.add(mergedMesh(plazaGeos, new THREE.MeshStandardMaterial({ map: T.pavement, color: '#d8d0bf', roughness: 0.95 }), { cast: false }));
  const deck = mergedMesh(deckGeos, new THREE.MeshStandardMaterial({ map: T.pavement, color: '#c9c3b5' }), { cast: false }); if (deck) scene.add(deck);
  const fascia = mergedMesh(fasciaGeos, new THREE.MeshStandardMaterial({ color: '#6f7f74', roughness: 0.7, side: THREE.DoubleSide })); if (fascia) scene.add(fascia);
  scene.add(mergedMesh(roadGeos, asphalt, { cast: false }));
  const kerbs = mergedMesh(kerbGeos, new THREE.MeshStandardMaterial({ color: '#a9a49a', roughness: 0.8 }), { cast: false }); if (kerbs) scene.add(kerbs);
  scene.add(mergedMesh(dashGeos, new THREE.MeshBasicMaterial({ color: '#e9e6da' }), { cast: false, receive: false }));
  const rails = mergedMesh(railGeos, new THREE.MeshStandardMaterial({ color: '#8b8a84' })); if (rails) scene.add(rails);
  const green = mergedMesh(greenRailGeos, new THREE.MeshStandardMaterial({ color: '#2f6b4f', roughness: 0.5, metalness: 0.3 })); if (green) scene.add(green);

  // buildings: shopfront ground floor, facade, parapet, roof; merged per material
  const groups = Object.fromEntries([...Object.keys(FACADES), 'gothic'].map((k) => [k, []]));
  const shopGroups = T.shops.map(() => []), roofParapets = [], roofGeos = [], pinnacles = [], units = [];
  const brand = rng(99);
  let palace = null;
  for (const b of DATA.buildings) {
    let h = b.h;
    if (b.n && /Abbey/.test(b.n) && !/Centre|School/.test(b.n)) h = 32;
    const area = Math.abs(signedArea(b.p));
    if (b.k === 'gothic') {
      groups.gothic.push(tint(wallGeometry(b.p, 0, h, 4, 8), 1, 1, 1));
      for (const hole of b.holes || []) groups.gothic.push(tint(wallGeometry(hole.slice().reverse(), 0, h, 4, 8), 0.95, 0.95, 0.95));
      const step = b.n === 'Palace of Westminster' ? 1 : 2;
      b.p.forEach((p, i) => { if (i % step === 0) pinnacles.push([p[0], h, p[1]]); });
      for (const hole of b.holes || []) hole.forEach((p, i) => { if (i % 2 === 0) pinnacles.push([p[0], h, p[1]]); });
    } else {
      const shop = h > 9 && area > 90 && brand() < 0.55;
      const y0 = shop ? 4.5 : 0;
      if (shop) shopGroups[Math.floor(brand() * T.shops.length)].push(wallGeometry(b.p, 0, 4.5, 4, 4.5));
      const k = 0.82 + brand() * 0.3, warm = (brand() - 0.5) * 0.08; // subtle per-building colour variation
      groups[b.k].push(tint(wallGeometry(b.p, y0, h, 4, 16), k + warm, k, k - warm));
      if (h > 6) roofParapets.push(wallGeometry(b.p, h, h + 0.9, 4, 4));
      if (area > 300 && h > 10) { // rooftop plant / chimneys
        const xs = b.p.map((p) => p[0]), zs = b.p.map((p) => p[1]);
        for (let k = 0, n = Math.min(6, area / 250 | 0); k < 20 && n > 0; k++) {
          const x = Math.min(...xs) + brand() * (Math.max(...xs) - Math.min(...xs)), z = Math.min(...zs) + brand() * (Math.max(...zs) - Math.min(...zs));
          if (pointInRing(x, z, b.p)) { units.push([x, h, z, 1 + brand() * 2.5, 0.8 + brand() * 1.8]); n--; }
        }
      }
    }
    roofGeos.push(flatGeometry(b.p, b.holes, h + 0.02, 6));
    if (b.n === 'Palace of Westminster' && (!palace || signedArea(b.p) ** 2 > signedArea(palace.p) ** 2)) palace = b;
    if (b.n && /Abbey/.test(b.n) && !/Centre|School|Choir/.test(b.n)) { // twin west towers
      const minX = Math.min(...b.p.map((p) => p[0])); const west = b.p.filter((p) => p[0] < minX + 14);
      const zc = west.reduce((a, p) => a + p[1], 0) / west.length;
      for (const dz of [-9, 9]) { const tg = boxUV(10, 69, 10); tg.translate(minX + 6, 34.5, zc + dz); groups.gothic.push(tint(tg, 1, 1, 1)); for (const sx of [-4, 4]) for (const sz of [-4, 4]) pinnacles.push([minX + 6 + sx, 69, zc + dz + sz]); }
    }
  }
  for (const [k, geos] of Object.entries(groups)) {
    const mat = k === 'gothic'
      ? new THREE.MeshStandardMaterial({ map: T.gothic, roughness: 0.85, vertexColors: true })
      : new THREE.MeshStandardMaterial({ map: T.facades[k].map, roughnessMap: T.facades[k].rough, roughness: 1, metalness: k === 'glass' ? 0.55 : 0.12, envMapIntensity: 1.4, vertexColors: true });
    const m = mergedMesh(geos, mat); if (m) scene.add(m);
  }
  shopGroups.forEach((geos, i) => { const m = mergedMesh(geos, new THREE.MeshStandardMaterial({ map: T.shops[i], roughness: 0.45, metalness: 0.1 })); if (m) scene.add(m); });
  const parapet = mergedMesh(roofParapets, new THREE.MeshStandardMaterial({ color: '#c9c0ad', roughness: 0.9 })); if (parapet) scene.add(parapet);
  scene.add(mergedMesh(roofGeos, new THREE.MeshStandardMaterial({ map: T.roof, roughness: 0.9 })));
  const unitGeo = new THREE.BoxGeometry(1, 1, 1); unitGeo.translate(0, 0.5, 0);
  const unitMesh = new THREE.InstancedMesh(unitGeo, new THREE.MeshStandardMaterial({ color: '#9a9c9e', roughness: 0.6, metalness: 0.3 }), units.length);
  const uo = new THREE.Object3D();
  units.forEach(([x, y, z, w, hh], i) => { uo.position.set(x, y, z); uo.scale.set(w, hh, w * 0.8); uo.rotation.y = brand() * 3; uo.updateMatrix(); unitMesh.setMatrixAt(i, uo.matrix); });
  unitMesh.castShadow = true; scene.add(unitMesh);
  const pinGeo = new THREE.ConeGeometry(0.7, 5, 6); pinGeo.translate(0, 2.5, 0);
  const pin = new THREE.InstancedMesh(pinGeo, new THREE.MeshStandardMaterial({ map: T.gothic, roughness: 0.8 }), pinnacles.length);
  const o = new THREE.Object3D();
  pinnacles.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); pin.setMatrixAt(i, o.matrix); });
  pin.castShadow = true; scene.add(pin);
  // Palace central tower (octagonal lantern + spire) at the palace centroid
  if (palace) {
    const [cx, cz] = polyCentroid(palace.p);
    const oct = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7, 30, 8), stoneMat()); oct.position.set(cx, 45, cz);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(6.5, 30, 8), new THREE.MeshStandardMaterial({ color: '#3b3f3c' })); spire.position.set(cx, 75, cz);
    oct.castShadow = spire.castShadow = true; scene.add(oct, spire);
  }
  return { pave };
}

// ---------------------------------------------------------------- street furniture & trees
function buildStreetLife(scene) {
  const rand = rng(42);
  const trees = [], lamps = [];
  // plane trees + Victorian lamps along the embankments
  for (const ring of DATA.river) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 2) continue;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    for (let s = 6; s < len; s += 13) {
      const px = a[0] + dx * s, pz = a[1] + dz * s;
      for (const side of [1, -1]) {
        const tx = px - dz * side * 6, tz = pz + dx * side * 6;
        if (cellAt(tx, tz) === 0 && cellAt(px - dz * side * 3, pz + dx * side * 3) === 0 && !isWater(tx, tz)) {
          trees.push([tx, tz, 0.9 + rand() * 0.4]);
          lamps.push([px - dz * side * 2.2, pz + dx * side * 2.2]);
        }
      }
    }
  }
  // trees scattered in parks / squares
  for (const ring of DATA.grass) {
    const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const area = Math.abs(signedArea(ring)); const n = Math.min(60, Math.floor(area / 380));
    for (let k = 0, tries = 0; k < n && tries < n * 6; tries++) {
      const x = minX + rand() * (maxX - minX), z = minZ + rand() * (maxZ - minZ);
      if (pointInRing(x, z, ring) && cellAt(x, z) === 0) { trees.push([x, z, 0.8 + rand() * 0.6]); k++; }
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 6); trunkGeo.translate(0, 2.5, 0);
  const blob = (r, x, y, z) => { const b = new THREE.IcosahedronGeometry(r, 1); b.translate(x, y, z); return b; };
  const crownGeo = mergeGeometries([blob(3.0, 0, 7.6, 0), blob(2.4, 1.9, 6.6, 0.8), blob(2.3, -1.7, 6.8, -0.9), blob(2.1, 0.3, 9.3, -0.4), blob(2.0, -0.6, 6.4, 1.9)]);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#6b5a48' }), trees.length);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: '#58803a', roughness: 1, flatShading: true }), trees.length);
  const o = new THREE.Object3D(), col = new THREE.Color();
  trees.forEach(([x, z, s], i) => {
    o.position.set(x, 0, z); o.scale.set(s, s * (0.9 + rand() * 0.3), s); o.rotation.y = rand() * 6; o.updateMatrix();
    trunk.setMatrixAt(i, o.matrix); crown.setMatrixAt(i, o.matrix);
    crown.setColorAt(i, col.setHSL(0.24 + rand() * 0.06, 0.38 + rand() * 0.15, 0.30 + rand() * 0.08));
  });
  trunk.castShadow = crown.castShadow = true; crown.receiveShadow = true;
  scene.add(trunk, crown);
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 4.2, 6); poleGeo.translate(0, 2.1, 0);
  const globeGeo = new THREE.SphereGeometry(0.32, 10, 8); globeGeo.translate(0, 4.4, 0);
  const pole = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: '#1f3a2d', metalness: 0.5, roughness: 0.4 }), lamps.length);
  const globe = new THREE.InstancedMesh(globeGeo, new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffcf7a', emissiveIntensity: 0.6 }), lamps.length);
  lamps.forEach(([x, z], i) => { o.position.set(x, 0, z); o.scale.set(1, 1, 1); o.rotation.y = 0; o.updateMatrix(); pole.setMatrixAt(i, o.matrix); globe.setMatrixAt(i, o.matrix); });
  scene.add(pole, globe);
  // benches (facing the river) and litter bins along the embankment
  const benchGeo = mergeGeometries([new THREE.BoxGeometry(1.8, 0.08, 0.45).translate(0, 0.46, 0), new THREE.BoxGeometry(1.8, 0.4, 0.06).translate(0, 0.72, -0.22), new THREE.BoxGeometry(0.08, 0.46, 0.4).translate(-0.8, 0.23, 0), new THREE.BoxGeometry(0.08, 0.46, 0.4).translate(0.8, 0.23, 0)]);
  const binGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.95, 10).translate(0, 0.48, 0);
  const benchSpots = lamps.filter((_, i) => i % 3 === 1), binSpots = lamps.filter((_, i) => i % 5 === 3);
  const benches = new THREE.InstancedMesh(benchGeo, new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 0.8 }), benchSpots.length);
  const bins = new THREE.InstancedMesh(binGeo, new THREE.MeshStandardMaterial({ color: '#1d2a22', roughness: 0.5, metalness: 0.3 }), binSpots.length);
  benchSpots.forEach(([x, z], i) => { o.position.set(x + 1.6, 0, z); o.scale.set(1, 1, 1); let best = 0, bd = 1e9; for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2, wx = x + Math.sin(ang) * 10, wz = z + Math.cos(ang) * 10; if (isWater(wx, wz)) { bd = 0; best = ang; break; } } o.rotation.y = best; o.updateMatrix(); benches.setMatrixAt(i, o.matrix); });
  binSpots.forEach(([x, z], i) => { o.position.set(x - 1.2, 0, z); o.rotation.y = 0; o.updateMatrix(); bins.setMatrixAt(i, o.matrix); });
  benches.castShadow = bins.castShadow = true; scene.add(benches, bins);
  // a few red phone boxes and post boxes near Parliament Square / Big Ben
  const red = new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe1e8', roughness: 0.1, metalness: 0.2 });
  const spots = [[-30, 30], [-60, -40], [40, -45], [-120, 40], [-20, 90]];
  const colliders = [];
  for (const [sx, sz] of spots) {
    const p = findLandNear(sx, sz, 1.2); const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2.5, 1), red); body.position.y = 1.25; body.castShadow = true;
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.4, 0.8), glass); win.position.y = 1.4;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.25, 4, 1, false, Math.PI / 4), red); top.position.y = 2.6;
    g.add(body, win, top); scene.add(g);
    colliders.push({ minX: p.x - 0.6, maxX: p.x + 0.6, minZ: p.z - 0.6, maxZ: p.z + 0.6 });
  }
  return colliders;
}

// ---------------------------------------------------------------- sky & lighting
function buildSky(scene, renderer) {
  const sky = new Sky(); sky.scale.setScalar(10000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4.5; u.rayleigh.value = 2.2; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.86;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 22), THREE.MathUtils.degToRad(215));
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(10000);
    Object.keys(u).forEach((k) => { if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = u[k].value; });
    envScene.add(sky2);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.4;
  }
  scene.fog = new THREE.Fog('#d6dbe0', 380, 1600);
  // soft drifting clouds (billboard sprites lit warm by the low sun)
  const ct = canvasTex(256, 128, (g, w, h) => {
    for (let i = 0; i < 28; i++) { const x = 40 + Math.random() * 176, y = 50 + Math.random() * 40, r = 18 + Math.random() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,248,238,0.55)'); gr.addColorStop(1, 'rgba(255,248,238,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  });
  ct.wrapS = ct.wrapT = THREE.ClampToEdgeWrapping;
  const clouds = new THREE.Group(); clouds.name = 'clouds';
  for (let i = 0; i < 46; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, color: new THREE.Color().setHSL(0.08, 0.45, 0.92 + Math.random() * 0.06), transparent: true, depthWrite: false, fog: false, opacity: 0.6 + Math.random() * 0.35 }));
    const a = Math.random() * Math.PI * 2, d = 600 + Math.random() * 2600;
    m.position.set(Math.cos(a) * d, 320 + Math.random() * 260, Math.sin(a) * d); const sc = 500 + Math.random() * 900; m.scale.set(sc, sc * 0.42, 1);
    clouds.add(m);
  }
  scene.add(clouds); CLOUDS = clouds;
  scene.add(new THREE.HemisphereLight('#ffe9cf', '#5b6470', 0.55));
  const sun = new THREE.DirectionalLight('#ffd7a3', 3.4);
  sun.position.copy(sunDir).multiplyScalar(200);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera; c.left = -140; c.right = 140; c.top = 140; c.bottom = -140; c.near = 1; c.far = 600;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.25;
  scene.add(sun, sun.target);
  sun.userData.dir = sunDir.clone();
  return sun;
}

// ---------------------------------------------------------------- entry point
export function buildWorld(scene, renderer) {
  textures();
  const colliders = [], boatColliders = [];
  const sun = buildSky(scene, renderer);
  buildCity(scene, colliders, boatColliders);
  const updClock = buildElizabethTower(scene);
  const updFlag = buildVictoriaTower(scene);
  const updEye = buildLondonEye(scene, colliders);
  colliders.push(...buildStreetLife(scene));
  boatColliders.__boat = true;
  let clockTimer = 0;
  // Keep the sun direction fixed while following a target (main.js sets sun.position near the player).
  const origSet = sun.position.set.bind(sun.position);
  sun.position.set = (x, y, z) => { // re-aim: interpret (x,_,z) as focus point
    const d = sun.userData.dir; sun.target.position.set(x - 80, 0, z - 60); sun.target.updateMatrixWorld();
    return origSet(x - 80 + d.x * 250, d.y * 250, z - 60 + d.z * 250);
  };
  updClock();
  return {
    colliders, boatColliders, sun,
    update(dt, t) {
      if (WATER_MESH) WATER_MESH.material.userData.time.value = t;
      if (CLOUDS) for (const c of CLOUDS.children) { c.position.x += dt * 4; if (c.position.x > 3200) c.position.x = -3200; }
      updEye(dt); updFlag(t);
      if ((clockTimer -= dt) <= 0) { clockTimer = 1; updClock(); }
    },
  };
}

// ---------------------------------------------------------------- post-processing (AO + bloom + filmic output)
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
/** Returns {render(), setSize(w,h)}. Falls back to plain rendering on weak GPUs (quality='low'). */
export function createComposer(renderer, scene, camera, quality = 'high') {
  if (quality === 'low') return { render: () => renderer.render(scene, camera), setSize: () => {} };
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.18, 0.5, 0.92));
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass({ // filmic grade: a little contrast + saturation, soft vignette
    uniforms: { tDiffuse: { value: null }, sat: { value: 1.14 }, con: { value: 1.07 }, vig: { value: 0.32 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, con, vig; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(vec3(l), c.rgb, sat); c.rgb = (c.rgb - 0.5) * con + 0.5;
        float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - vig * smoothstep(0.35, 0.85, d); gl_FragColor = c; }`,
  }));
  return {
    render: () => composer.render(),
    setSize: (w, h) => { composer.setSize(w, h); },
  };
}
