import * as THREE from 'three';
import { findLandNear } from './world.js';

const LINE_IDS = ['11', '24', '88', '159', '12', '453', '148', '87'];
const RED = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.42 });
const NAVY = new THREE.MeshStandardMaterial({ color: 0x182a55, roughness: 0.48 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0x343a40, metalness: 0.68, roughness: 0.3 });
const GLASS = new THREE.MeshPhysicalMaterial({ color: 0xc8e5ec, roughness: 0.1, transparent: true, opacity: 0.28, metalness: 0.08, transmission: 0.12 });
const CREAM = new THREE.MeshStandardMaterial({ color: 0xf5e8c8, roughness: 0.72 });
const poleGeo = new THREE.CylinderGeometry(0.055, 0.07, 3.35, 10);
const shelterPostGeo = new THREE.BoxGeometry(0.075, 2.45, 0.075);
const shelterRoofGeo = new THREE.BoxGeometry(4.25, 0.12, 1.55);
const shelterGlassGeo = new THREE.BoxGeometry(3.85, 2.05, 0.045);
const shelterSideGeo = new THREE.BoxGeometry(0.04, 1.95, 1.35);
const benchGeo = new THREE.BoxGeometry(2.25, 0.09, 0.38);
const roundelGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.07, 36);
const roundelRingGeo = new THREE.TorusGeometry(0.46, 0.105, 10, 36);
const roundelBarGeo = new THREE.BoxGeometry(0.9, 0.18, 0.045);
const flagGeo = new THREE.PlaneGeometry(1.05, 0.79);
const nameSignGeo = new THREE.PlaneGeometry(3.2, 0.7);
const stopMaterials = new Map();

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function stopTexture(stop, route) {
  const key = `${stop.id}|${stop.letter}|${route}`;
  if (stopMaterials.has(key)) return stopMaterials.get(key);
  const texture = canvasTexture(512, 384, (ctx, w, h) => {
    ctx.fillStyle = '#fffdf7'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8102e'; ctx.fillRect(0, 0, w, 18);
    ctx.fillStyle = '#172a54'; ctx.font = 'bold 34px Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('BUS STOP', w / 2, 66);
    ctx.strokeStyle = '#c8102e'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(w / 2, 145, 69, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#172a54'; ctx.fillRect(w / 2 - 92, 132, 184, 28);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial, sans-serif'; ctx.fillText('LONDON', w / 2, 153);
    ctx.fillStyle = '#15191d'; ctx.font = 'bold 48px Arial, sans-serif'; ctx.fillText(stop.letter || '•', w / 2, 236);
    ctx.fillStyle = '#c8102e'; ctx.fillRect(18, 258, w - 36, 108);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 64px Arial, sans-serif'; ctx.fillText(route, w / 2, 336);
  });
  stopMaterials.set(key, texture);
  return texture;
}

function nameTexture(name) {
  return canvasTexture(512, 112, (ctx, w, h) => {
    ctx.fillStyle = '#16274d'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f3dfaa'; ctx.fillRect(0, 0, w, 7);
    ctx.fillStyle = '#fff9eb'; ctx.font = 'bold 34px Arial, sans-serif'; ctx.textAlign = 'center';
    let label = name;
    while (ctx.measureText(label).width > w - 30 && label.length > 12) label = `${label.slice(0, -4)}…`;
    ctx.fillText(label, w / 2, 69);
  });
}

function addMesh(group, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  return mesh;
}

function makeStop(scene, stop, line, snapped) {
  const group = new THREE.Group();
  group.position.set(snapped.x, 0, snapped.z);
  const pole = addMesh(group, poleGeo, STEEL, -2.55, 1.68, 0);
  pole.castShadow = false;
  addMesh(group, roundelGeo, CREAM, -2.55, 3.05, -0.025, Math.PI / 2);
  addMesh(group, roundelRingGeo, RED, -2.55, 3.05, -0.071, 0, 0, 0);
  // The ring is rotated into the sign plane and the navy bar carries the stop name/letter.
  group.children[group.children.length - 1].rotation.set(Math.PI / 2, 0, 0);
  addMesh(group, roundelBarGeo, NAVY, -2.55, 3.05, -0.085);
  const flagTex = stopTexture(stop, line);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }));
  flag.position.set(-2.55, 2.0, 0.09); flag.castShadow = false; group.add(flag);

  // Compact TfL-style shelter with glazed sides, red canopy, bench and stop-name panel.
  for (const x of [-1.85, 1.85]) addMesh(group, shelterPostGeo, STEEL, x, 1.22, -0.72);
  const rearGlass = addMesh(group, shelterGlassGeo, GLASS, 0, 1.28, -0.72);
  rearGlass.castShadow = false;
  for (const x of [-1.9, 1.9]) {
    const side = addMesh(group, shelterSideGeo, GLASS, x, 1.25, -0.03);
    side.castShadow = false;
  }
  addMesh(group, shelterRoofGeo, RED, 0, 2.5, -0.05);
  addMesh(group, benchGeo, STEEL, 0, 0.48, -0.38);
  const signMap = nameTexture(stop.name);
  const sign = new THREE.Mesh(nameSignGeo, new THREE.MeshBasicMaterial({ map: signMap, side: THREE.DoubleSide }));
  sign.position.set(0, 2.03, 0.84); group.add(sign);
  scene.add(group);

  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 512; labelCanvas.height = 128;
  const labelTexture = new THREE.CanvasTexture(labelCanvas); labelTexture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: true, depthWrite: false }));
  label.scale.set(5, 1.25, 1); label.position.set(snapped.x, 9, snapped.z); label.renderOrder = 20; label.visible = false;
  scene.add(label);
  return { group, position: [stop.x, stop.z], placed: [snapped.x, snapped.z], stop, label, labelCanvas, labelTexture };
}

function paintTarget(target) {
  const ctx = target.labelCanvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(12, 25, 48, .92)';
  ctx.beginPath(); ctx.roundRect(8, 10, 496, 108, 20); ctx.fill();
  ctx.strokeStyle = '#cf142b'; ctx.lineWidth = 8; ctx.stroke();
  ctx.fillStyle = '#f8d98e'; ctx.font = 'bold 34px Arial, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`NEXT: ${target.stop.name} ${target.stop.letter || ''}`.trim(), 256, 75, 460);
  target.labelTexture.needsUpdate = true;
}

function headingTo(from, to) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  return Math.atan2(-dx, -dz);
}

function playDoorChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audio = new AudioCtx();
    const now = audio.currentTime;
    for (const [i, frequency] of [740, 988].entries()) {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.13 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.13 + 0.32);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(now + i * 0.13); oscillator.stop(now + i * 0.13 + 0.34);
    }
    setTimeout(() => audio.close().catch(() => {}), 900);
  } catch { /* audio may be unavailable until the browser receives a gesture */ }
}

export class BusRoutes {
  constructor(scene, { Vehicle, fleet = [], routeGuide, hud = {}, getPlayer = () => ({}), enterVehicle = () => {}, onEvent = () => {} } = {}) {
    this.scene = scene; this.Vehicle = Vehicle; this.fleet = fleet; this.routeGuide = routeGuide;
    this.hud = hud; this.getPlayer = getPlayer; this.enterVehicle = enterVehicle; this.onEvent = onEvent;
    this.routes = []; this.stops = []; this.shifts = new Map(); this.active = null;
    this.loaded = false; this.panel = null; this.panelTimer = 0; this.lastRole = null;
    this.eventInfos = [];
    this._createPanel();
  }

  _createPanel() {
    if (typeof document === 'undefined') return;
    const panel = document.createElement('section');
    panel.id = 'bus-route-shift';
    panel.style.cssText = 'position:fixed;left:20px;top:142px;z-index:30;width:min(320px,calc(100vw - 40px));padding:13px 16px 14px;background:linear-gradient(135deg,rgba(18,29,47,.96),rgba(8,15,26,.93));border:1px solid rgba(229,191,112,.6);border-left:5px solid #c8102e;border-radius:5px;color:#fff5dd;font:12px/1.4 Arial,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.34);backdrop-filter:blur(10px);display:none;pointer-events:none';
    panel.innerHTML = '<div data-role="title" style="font:bold 16px Georgia,serif;color:#f3d590;margin-bottom:8px"></div><div data-role="next" style="font-size:13px;font-weight:bold"></div><div data-role="distance" style="color:#d8dce2;margin-top:3px"></div><div data-role="stops" style="margin-top:8px;color:#f2d89e"></div><div data-role="clock" style="margin-top:3px;color:#c8d5e3"></div><div data-role="fares" style="margin-top:3px;color:#d9e8d3"></div><div style="height:4px;background:rgba(255,255,255,.13);margin-top:10px"><div data-role="progress" style="height:100%;width:0;background:linear-gradient(90deg,#c8102e,#f3d590);transition:width .2s"></div></div>';
    document.body.append(panel); this.panel = panel;
  }

  async load() {
    try {
      const response = await fetch('/api/transit/routes');
      if (!response.ok) throw new Error(`Route service returned ${response.status}`);
      const data = await response.json();
      this.routes = (Array.isArray(data.routes) ? data.routes : []).filter((route) => route?.line && Array.isArray(route.stops) && route.stops.length >= 3);
      this.eventInfos = this.routes.map((route) => ({
        id: `bus-${route.line}`,
        title: `Route ${route.line} to ${route.destination}`,
        subtitle: `${route.stops.length} stops · TfL route`,
        where: route.stops[0].name,
        status: `LIVE · next in ${Number.isFinite(route.nextMinutes) ? route.nextMinutes : '—'} min`,
        players: 1,
        location: [route.stops[0].x, route.stops[0].z],
      }));
      this._spawnRoutes();
      this.loaded = true;
    } catch (error) {
      console.warn('[bus routes] Could not load TfL routes:', error.message);
      this.routes = []; this.eventInfos = []; this.loaded = true;
    }
    return this.routes;
  }

  _spawnRoutes() {
    if (!this.Vehicle || !this.fleet) return;
    for (const route of this.routes) {
      const lineStops = [];
      for (const stop of route.stops) {
        const snapped = findLandNear(stop.x, stop.z, 0.7, 50);
        const entry = makeStop(this.scene, stop, String(route.line), snapped);
        lineStops.push(entry); this.stops.push(entry);
      }
      const first = route.stops[0], second = route.stops[1];
      const h0 = headingTo([first.x, first.z], [second.x, second.z]);
      const queued = this.fleet.filter((v) => v.routeLine && Math.hypot(v.position.x - first.x, v.position.z - first.z) < 40).length; // queue buses that share a stop
      const back = queued * 14;
      const parking = findLandNear(first.x + Math.sin(h0) * back, first.z + Math.cos(h0) * back, 2.65, 65);
      const bus = new this.Vehicle('bus', this.scene, parking.x, parking.z, h0);
      bus.mesh.userData.route = String(route.line);
      bus.routeLine = String(route.line);
      bus.speed = 0;
      this.fleet.push(bus);
      this.shifts.set(String(route.line), {
        route, bus, stops: lineStops, index: 0, served: 0, elapsed: 0, dwell: 0, fare: 0,
        passengers: 0, missedIndex: -1, missedUntil: 0, completed: false,
      });
    }
  }

  get eventInfos() { return this._eventInfos || []; }
  set eventInfos(value) { this._eventInfos = value; }

  update(dt, t) {
    if (!this.loaded) return;
    const player = this.getPlayer?.() || {};
    const driven = player.driven || null;
    const shift = driven ? [...this.shifts.values()].find((item) => item.bus === driven) || null : null;
    if (this.active && this.active !== shift) {
      this.active.active = false;
      if (this.lastRole && this.lastRole !== 'WANDERER') this.hud.setRole?.('WANDERER');
      this.lastRole = null;
      this._hideTarget();
    }
    this.active = shift;
    if (!shift || shift.completed) {
      if (this.panel) this.panel.style.display = 'none';
      return;
    }
    if (!shift.active) {
      shift.active = true; shift.dwell = 0; shift.missedIndex = -1;
      this.lastRole = `BUS DRIVER · ROUTE ${shift.route.line}`;
      this.hud.setRole?.(this.lastRole);
      this.hud.toast?.(`Route ${shift.route.line} shift started · ${shift.route.destination}`, 4000);
      this._showRoute(shift);
    }
    shift.elapsed += dt;
    const target = shift.stops[shift.index];
    if (!target) return;
    const pos = driven.position;
    const distance = Math.hypot(pos.x - target.stop.x, pos.z - target.stop.z);
    const speed = Math.abs(Number(driven.speed) || 0);
    if (distance <= 10 && speed < 2) {
      shift.dwell += dt;
      if (shift.dwell >= 1) this._serveStop(shift, t);
    } else {
      shift.dwell = 0;
      if (distance <= 15 && speed >= 2 && shift.missedIndex !== shift.index && t >= shift.missedUntil) {
        shift.missedIndex = shift.index; shift.missedUntil = t + 4;
        this.hud.toast?.(`Stop! You missed ${target.stop.name}`, 2600);
      }
      if (distance > 20 && shift.missedIndex === shift.index) shift.missedIndex = -1;
    }
    this._paintPanel(shift, distance, dt);
  }

  _serveStop(shift, t) {
    const stop = shift.stops[shift.index];
    shift.dwell = 0; shift.served++;
    const board = 1 + Math.floor(Math.random() * 5), alight = Math.min(shift.passengers, Math.floor(Math.random() * 4));
    shift.passengers = Math.max(0, shift.passengers + board - alight);
    shift.fare += board * 2.2;
    shift.index++;
    shift.missedIndex = -1;
    playDoorChime();
    this.hud.toast?.(`Doors open · ${board} on, ${alight} off · +£${(board * 2.2).toFixed(2)}`, 2500);
    if (this.routeGuide) this.routeGuide.show([shift.bus.position.x, shift.bus.position.z], shift.stops.slice(shift.index).map((item) => item.position));
    this._hideTarget();
    if (shift.index >= shift.stops.length) {
      shift.completed = true; shift.active = false;
      const pay = Math.round(shift.fare + shift.served * 4);
      this.routeGuide?.clear();
      this.hud.toast?.(`Route complete · ${shift.served} stops · £${pay} earned · fares £${shift.fare.toFixed(2)}`, 6500);
      this.onEvent?.({ type: 'route-complete', line: shift.route.line, pay });
      return;
    }
    this._showTarget(shift.stops[shift.index]);
    this._showRoute(shift);
  }

  _showRoute(shift) {
    if (!this.routeGuide || !shift.stops.length) return;
    this.routeGuide.show([shift.bus.position.x, shift.bus.position.z], shift.stops.slice(shift.index).map((item) => item.position));
    this._showTarget(shift.stops[shift.index]);
  }

  _showTarget(target) {
    if (!target) return;
    const pp = this.getPlayer()?.position; // hide the sign once you're close so it never covers the bus
    for (const stop of this.stops) stop.label.visible = stop === target && !(pp && Math.hypot(pp.x - stop.placed[0], pp.z - stop.placed[1]) < 22);
    paintTarget(target);
  }

  _hideTarget() { for (const stop of this.stops) stop.label.visible = false; }

  _paintPanel(shift, distance, dt) {
    if (!this.panel) return;
    this.panel.style.display = 'block';
    this.panelTimer = (this.panelTimer || 0) - dt;
    if (this.panelTimer > 0) return;
    this.panelTimer = 0.12;
    const target = shift.stops[shift.index]?.stop;
    const schedule = shift.route.stops.reduce((sum, stop, index, list) => index ? sum + Math.hypot(stop.x - list[index - 1].x, stop.z - list[index - 1].z) / 7 + 18 : sum, 0);
    const delta = shift.elapsed - schedule;
    const punctuality = Math.abs(delta) < 45 ? 'ON TIME' : delta < 0 ? `${Math.ceil(-delta)}s early` : `${Math.floor(delta / 60)}m late`;
    this.panel.querySelector('[data-role="title"]').textContent = `Route ${shift.route.line} → ${shift.route.destination}`;
    this.panel.querySelector('[data-role="next"]').textContent = target ? `${target.name}${target.letter ? ` · ${target.letter}` : ''}` : 'Route complete';
    this.panel.querySelector('[data-role="distance"]').textContent = target ? `${distance.toFixed(0)} m to stop · ${Math.max(0, 1 - shift.dwell).toFixed(1)} s door check` : '';
    this.panel.querySelector('[data-role="stops"]').textContent = `Stops served ${shift.served} / ${shift.stops.length}  ·  ${punctuality}`;
    this.panel.querySelector('[data-role="clock"]').textContent = `Shift ${Math.floor(shift.elapsed / 60)}:${String(Math.floor(shift.elapsed % 60)).padStart(2, '0')}  ·  ${shift.passengers} passengers aboard`;
    this.panel.querySelector('[data-role="fares"]').textContent = `Fare total  £${shift.fare.toFixed(2)}`;
    this.panel.querySelector('[data-role="progress"]').style.width = `${Math.min(100, shift.served / shift.stops.length * 100)}%`;
  }
}
