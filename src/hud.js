import { MAP, BIG_BEN } from './world.js';

const fmt = value => Math.max(0, Math.floor(value)).toLocaleString('en-GB');
const MAIN_HW = new Set(['trunk', 'primary', 'secondary', 'tertiary']);

export class HUD {
  constructor() {
    this.el = {
      root: document.querySelector('#hud'), name: document.querySelector('#hud-name'), role: document.querySelector('#hud-role'),
      money: document.querySelector('#hud-money'), age: document.querySelector('#hud-age'), level: document.querySelector('#hud-level'), xp: document.querySelector('#hud-xp'),
      mission: document.querySelector('#mission-card'), missionClock: document.querySelector('#mission-clock'), missionTitle: document.querySelector('#mission-title'),
      objective: document.querySelector('#mission-objective'), reward: document.querySelector('#mission-reward'), prompt: document.querySelector('#interaction-prompt'),
      promptText: document.querySelector('#interaction-prompt span'), toast: document.querySelector('#toast-stack'), map: document.querySelector('#minimap'),
      speed: document.querySelector('#speedometer'), speedValue: document.querySelector('#speed-value'), vehicle: document.querySelector('#vehicle-label'),
      arrow: document.querySelector('#target-arrow'), audio: document.querySelector('#audio-state'),
    };
    this.ctx = this.el.map?.getContext('2d'); this.lastMap = 0;
    this.el.root?.classList.remove('hidden');
  }

  setName(name) { if (this.el.name) this.el.name.textContent = name || 'Alex'; }
  setRole(text) { if (this.el.role) this.el.role.textContent = (text || 'WANDERER').toUpperCase(); }
  setAudio(muted) { if (this.el.audio) this.el.audio.textContent = muted ? 'OFF' : 'ON'; }

  toast(message, duration = 3400) {
    if (!this.el.toast) return;
    const node = document.createElement('div'); node.className = 'toast'; node.textContent = message; this.el.toast.append(node);
    window.setTimeout(() => { node.style.opacity = '0'; node.style.transform = 'translateY(-5px)'; window.setTimeout(() => node.remove(), 260); }, duration);
  }

  update({ player, state, vehicle = null, nearby = null, mission = null, target = null, npcs = [], vehicles = [], time = 0 }) {
    const level = 1 + Math.floor(state.xp / 300);
    this.el.money.textContent = `£${fmt(state.money)}`; this.el.age.textContent = state.age; this.el.level.textContent = level;
    this.el.xp.style.width = `${Math.min(100, ((state.xp % 300) / 300) * 100)}%`;
    this.el.speed.classList.toggle('hidden', !vehicle);
    if (vehicle) { this.el.speedValue.textContent = Math.round(Math.abs(vehicle.speed) * 3.6); this.el.vehicle.textContent = vehicle.kind === 'boat' ? 'SPEEDBOAT' : vehicle.kind.toUpperCase(); }
    this.el.prompt.classList.toggle('hidden', !nearby);
    if (nearby) this.el.promptText.textContent = nearby.label ? nearby.label : nearby.data ? `Talk · ${nearby.data.name}` : `Enter ${nearby.kind === 'boat' ? 'speedboat' : nearby.kind}`;
    if (mission?.active) {
      this.el.mission.classList.remove('hidden'); this.el.missionTitle.textContent = mission.active.def.title;
      this.el.objective.textContent = mission.objectiveText();
      const seconds = Math.max(0, Math.ceil(mission.active.timeLeft));
      this.el.missionClock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      this.el.reward.innerHTML = `£${fmt(mission.active.def.reward)} <span>·</span> +XP`;
    } else this.el.mission.classList.add('hidden');
    this.el.arrow.classList.toggle('hidden', !target);
    if (time - this.lastMap > 0.14) { this.drawMap(player, npcs, vehicles, target); this.lastMap = time; }
  }

  drawMap(player, npcs = [], vehicles = [], target = null) {
    const c = this.ctx, canvas = this.el.map;
    if (!c || !canvas || !player?.position) return;
    const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, scale = 0.35;
    const sx = x => cx + (x - player.position.x) * scale;
    const sy = z => cy + (z - player.position.z) * scale;
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#101b20'; c.fillRect(0, 0, w, h);
    c.save(); c.beginPath(); c.arc(cx, cy, Math.min(w, h) * 0.485, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#59665e'; c.fillRect(0, 0, w, h);
    const polygon = (ring, fill, stroke = null, lineWidth = 1) => {
      if (!Array.isArray(ring) || ring.length < 3) return;
      c.beginPath(); c.moveTo(sx(ring[0][0]), sy(ring[0][1]));
      for (let i = 1; i < ring.length; i++) c.lineTo(sx(ring[i][0]), sy(ring[i][1]));
      c.closePath(); c.fillStyle = fill; c.fill();
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth; c.stroke(); }
    };
    // Geographic layers use the real OSM polygons from world.js.
    for (const ring of MAP.grass || []) polygon(ring, '#64835a');
    for (const ring of MAP.river || []) polygon(ring, '#28617a');
    for (const building of MAP.buildings || []) polygon(building.p, '#bbc0bb');
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const road of MAP.roads || []) {
      if (!road.p?.length) continue;
      const main = MAIN_HW.has(road.hw) || road.hw === 'trunk' || road.b;
      c.beginPath(); c.moveTo(sx(road.p[0][0]), sy(road.p[0][1]));
      for (let i = 1; i < road.p.length; i++) c.lineTo(sx(road.p[i][0]), sy(road.p[i][1]));
      c.lineWidth = Math.max(main ? 2.1 : 0.75, (road.w || 4) * scale * (main ? 0.72 : 0.45));
      c.strokeStyle = road.b ? '#ddcaa0' : main ? '#d9d3bd' : '#9c9f91'; c.stroke();
    }
    // Big Ben location and clock marker.
    const bx = sx(BIG_BEN.x), bz = sy(BIG_BEN.z);
    c.fillStyle = '#f0c366'; c.strokeStyle = '#fff4d1'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(bx, bz, 4.2, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(240,195,102,.16)'; c.beginPath(); c.arc(bx, bz, 8, 0, Math.PI * 2); c.fill();
    if (this.route?.length > 1) { // planned route (sat-nav)
      c.save(); c.strokeStyle = '#ffc93c'; c.lineWidth = 4; c.lineJoin = 'round'; c.beginPath();
      this.route.forEach(([x, z], i) => (i ? c.lineTo(sx(x), sy(z)) : c.moveTo(sx(x), sy(z)))); c.stroke(); c.restore();
    }
    for (const poi of this.pois || []) { // labelled places: news, shop, bus stop, race
      const x = sx(poi.x), y = sy(poi.z); c.save(); c.fillStyle = poi.color; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); c.stroke(); c.font = '10px system-ui'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(poi.icon, x, y + 3.5); c.restore();
    }
    for (const npc of npcs) {
      const p = npc.position || npc.data?.pos; if (!p) continue;
      const x = Array.isArray(p) ? p[0] : p.x, z = Array.isArray(p) ? p[1] : p.z;
      c.fillStyle = npc.data?.mission ? '#ffd66e' : npc.ambient ? '#d99b7d' : '#f0a783';
      c.beginPath(); c.arc(sx(x), sy(z), npc.data?.mission ? 3.1 : npc.ambient ? 1.45 : 2.3, 0, Math.PI * 2); c.fill();
    }
    for (const v of vehicles) {
      if (!v?.position || v === player.vehicle) continue;
      const color = v.kind === 'boat' ? '#62dcf1' : v.kind === 'bus' ? '#e45b53' : v.kind === 'police' ? '#dce8ed' : '#f0d79a';
      c.fillStyle = color; c.beginPath(); c.arc(sx(v.position.x), sy(v.position.z), v.kind === 'bus' ? 3.1 : 2.35, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#172126'; c.lineWidth = 0.8; c.stroke();
    }
    if (target) {
      c.fillStyle = '#ff6559'; c.strokeStyle = '#fff1c5'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(sx(target[0]), sy(target[1]), 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // Player arrow stays north-up; heading is shown inside the marker.
    c.save(); c.translate(cx, cy); c.rotate(-player.heading);
    c.fillStyle = '#fff8dc'; c.strokeStyle = '#b93830'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2); c.lineTo(-5, 5); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.restore();
    c.strokeStyle = 'rgba(243,221,175,.72)'; c.lineWidth = 1.25; c.beginPath(); c.arc(cx, cy, Math.min(w, h) * 0.485, 0, Math.PI * 2); c.stroke();
  }
}
