// Shortest path along the real road network (ROAD_PATHS) + a glowing animated
// route ribbon drawn on the road surface (sat-nav style) for bus routes / gigs.
import * as THREE from 'three';
import { ROAD_PATHS, DATA_ROADS } from './world.js';

// ---- graph: nodes = polyline vertices merged within 4m; edges = consecutive vertices
const SNAP = 4;
const nodes = []; const adj = []; const grid = new Map();
const key = (x, z) => `${Math.round(x / SNAP)},${Math.round(z / SNAP)}`;
function nodeAt(x, z) {
  const gx = Math.round(x / SNAP), gz = Math.round(z / SNAP);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    for (const id of grid.get(`${gx + dx},${gz + dz}`) || []) if (Math.hypot(nodes[id][0] - x, nodes[id][1] - z) < SNAP) return id;
  }
  const id = nodes.length; nodes.push([x, z]); adj.push([]);
  const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id);
  return id;
}
function densify(pts, step = 12) { // add vertices so junction snapping works mid-segment
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / step);
    for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  return out;
}
for (const r of (DATA_ROADS || ROAD_PATHS.map((p) => ({ p: p.pts })))) {
  const pts = densify(r.p || r.pts);
  let prev = nodeAt(...pts[0]);
  for (let i = 1; i < pts.length; i++) {
    const cur = nodeAt(...pts[i]); if (cur === prev) continue;
    const d = Math.hypot(nodes[cur][0] - nodes[prev][0], nodes[cur][1] - nodes[prev][1]);
    adj[prev].push([cur, d]); adj[cur].push([prev, d]); prev = cur;
  }
}
function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < nodes.length; i++) { const d = (nodes[i][0] - x) ** 2 + (nodes[i][1] - z) ** 2; if (d < bd && adj[i].length) { bd = d; best = i; } }
  return best;
}
/** Shortest road path between two points → [[x,z],...] (falls back to a straight line). */
export function roadPath(from, to) {
  const s = nearestNode(from[0], from[1]), t = nearestNode(to[0], to[1]);
  const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length);
  dist[s] = 0; const heap = [[0, s]];
  while (heap.length) {
    let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
    const [d, u] = heap.splice(bi, 1)[0]; if (done[u]) continue; done[u] = 1; if (u === t) break;
    for (const [v, w] of adj[u]) { const nd = d + w + Math.hypot(nodes[v][0] - to[0], nodes[v][1] - to[1]) * 0 ; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push([nd, v]); } }
  }
  if (prev[t] === -1 && s !== t) return [from, to];
  const out = []; for (let u = t; u !== -1; u = prev[u]) out.push(nodes[u]); out.reverse();
  return [from, ...out, to];
}

// ---- glowing chevron ribbon on the road
function chevronTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(255,190,40,0.35)'; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = '#ffd25a'; g.lineWidth = 10; g.lineCap = 'round';
  g.beginPath(); g.moveTo(10, 84); g.lineTo(32, 50); g.lineTo(54, 84); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class RouteGuide {
  constructor(scene) {
    this.scene = scene; this.mesh = null; this.points = null;
    this.tex = chevronTexture();
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0.9, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
  }
  /** Show the route from `from` through the remaining stops. */
  show(from, stops) {
    this.clear();
    const pts = []; let cur = from;
    for (const s of stops) { const seg = roadPath(cur, s); pts.push(...(pts.length ? seg.slice(1) : seg)); cur = s; }
    if (pts.length < 2) return;
    this.points = pts;
    const pos = [], uv = [], idx = []; let dist = 0; const W = 3.2, Y = 0.22;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (i) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      pos.push(pts[i][0] - dz * W / 2, Y, pts[i][1] + dx * W / 2, pts[i][0] + dz * W / 2, Y, pts[i][1] - dx * W / 2);
      uv.push(0, -dist / 4, 1, -dist / 4);
      if (i) { const n = i * 2; idx.push(n - 2, n, n - 1, n - 1, n, n + 1); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.material.side = THREE.DoubleSide; this.mesh.renderOrder = 5;
    this.scene.add(this.mesh);
  }
  clear() { if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; } this.points = null; }
  update(dt) { this.tex.offset.y -= dt * 1.6; }
}
