import * as THREE from 'three';
import { buildWorld, createComposer, ROADS, landBlocked, waterBlocked, isWater, findLandNear, resolveCircle, cellAt } from './world.js';
import { makeHuman, animateHuman } from './human.js';
import { Vehicle, VEHICLE_SPECS, makeVehicleMesh } from './vehicles.js';
import { Multiplayer, mountChatUI } from './multiplayer.js';
import { GameAudio } from './audio.js';
import { MISSIONS } from './npcData.js';
import { spawnNPCs } from './npcs.js';
import { Traffic } from './traffic.js';
import { Missions } from './missions.js';
import { Talk } from './talk.js';
import { HUD } from './hud.js';
import './style.css';
import { ImageStudio } from './imagegen.js';
import { Billboards } from './billboards.js';
import { Phone } from './phone.js';
import { BusStop } from './busstop.js';
import { RouteGuide } from './route.js';
import { BoatRace } from './race.js';
import { BusRoutes } from './busroutes.js';
import { addShop, nearestShop, openShop, isShopOpen, closeShop, updateShops } from './shop.js';

const container = document.querySelector('#game');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1800);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.domElement.tabIndex = 0;
container.appendChild(renderer.domElement);

const world = buildWorld(scene, renderer);
// Real Tesco Express, Bridge Street (from OpenStreetMap) — shopfront faces the street (south).
{ const spot = findLandNear(-45, -37, 0.6, 12);
  addShop(scene, { name: 'Tesco Express', deliverooUrl: 'https://deliveroo.co.uk/menu/London/pimlico/tesco-5714-pimlico-express', address: '1 Bridge Street, Westminster, London SW1A 2JR', postcode: 'Bridge Street SW1A', hours: 'Open 7:00–23:00', x: spot.x, z: spot.z - 1.8, facing: 0, colors: ['#00539f', '#ee1c2e'] }); }
const physicsWorld = { ...world, landBlocked, waterBlocked, resolveCircle };
const npcs = spawnNPCs(scene);
const traffic = new Traffic(scene, ROADS);
const keys = Object.create(null), clock = new THREE.Clock();
const FIXED_DT = 1 / 60;
let accumulator = 0;
const state = { name: 'Alex', money: 50, xp: 0, age: 21, level: 1 };
const player = { position: new THREE.Vector3(-34, 0, -37), heading: -2.36 }; // Bridge St, facing Big Ben
{ const sp = new URLSearchParams(location.search).get('spawn'); if (sp) { const [x, z, h] = sp.split(',').map(Number); const p = findLandNear(x, z, 0.6, 30); player.position.set(p.x, 0, p.z); player.heading = h || 0; } } // debug: ?spawn=x,z,heading
const outfits = {
  classic: { shirt: '#bd483c', pants: '#292d2b', skin: '#d9a77f', hair: '#38251c', hat: null },
  bright: { shirt: '#e1ae4e', pants: '#ece6d8', skin: '#bd815e', hair: '#33271e', hat: 'cap' },
  night: { shirt: '#416a79', pants: '#222630', skin: '#e1b18b', hair: '#201b19', hat: 'beanie' },
};
let selectedOutfit = 'classic', driven = null, talk = null, elapsed = 0, walkPhase = 0;
let cameraYaw = player.heading, cameraDistance = 8, cameraHeight = 3.2, dragging = false, lastPointerX = 0, lastPointerY = 0;
let walkSpeed = 0, verticalSpeed = 0, grounded = true, jumpRequested = false, landingSquash = 0, cameraShake = 0;
let avatar = makeHuman(outfits[selectedOutfit]); avatar.group.position.copy(player.position); scene.add(avatar.group);

const fleet = [
  { kind: 'bus', x: -108, z: -140, h: 0 },
  { kind: 'cab', x: -230, z: -48, h: -Math.PI / 2 },
  { kind: 'police', x: -60, z: -27, h: -Math.PI / 2 },
  { kind: 'boat', x: 90, z: -80, h: 0 },
].map(({ kind, x, z, h }) => new Vehicle(kind, scene, x, z, h));
const hud = new HUD(); hud.setName(state.name);
const audio = new GameAudio();
const missions = new Missions(scene, {
  onComplete: mission => {
    dayLog.push(`${state.name || 'You'} completed "${mission.title}" and earned £${mission.reward}`);
    studio.newspaper(mission, { playerName: state.name, age: state.age, level: state.level, money: state.money });
    state.money += mission.reward; state.xp += mission.reward; state.age += 1; state.level = 1 + Math.floor(state.xp / 300);
    audio.chime(); hud.toast(`Gig complete · +£${mission.reward} · You're now ${state.age}`, 5000);
    if (state.level > 1) hud.toast(`Level up · Level ${state.level}`, 4200);
  },
  onFail: mission => hud.toast(`Gig ended · ${mission.title}`, 3500),
  onMessage: text => hud.toast(text),
});
talk = new Talk({
  getCtx: () => ({ playerName: state.name, age: state.age, level: state.level, money: state.money,
    londonTime: new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }), history: [] }),
  onAcceptMission: missionId => {
    const result = missions.start(missionId, { level: state.level });
    if (result.ok) hud.toast(`Gig accepted · ${MISSIONS[missionId]?.title || 'On your way'}`);
    else hud.toast(result.reason || 'You cannot take that gig yet');
  },
  onClose: () => renderer.domElement.focus(),
});

function activePosition() { return driven ? driven.position : player.position; }
function syncPlayer() {
  const p = activePosition(); player.position.set(p.x, p.y, p.z);
  if (driven) player.heading = driven.heading;
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function nearestVehicle(max = 5.2) {
  let best = null, bestD = max;
  for (const vehicle of fleet) {
    if (vehicle.kind === 'boat') continue;
    const d = distance(player.position, vehicle.position);
    if (d < bestD) { best = vehicle; bestD = d; }
  }
  const boat = fleet.find(v => v.kind === 'boat');
  if (boat && !driven && !isWater(player.position.x, player.position.z) && !landBlocked(player.position.x, player.position.z, 0.4)) {
    const shore = findLandNear(boat.position.x, boat.position.z, 0.6, 80);
    if (!landBlocked(shore.x, shore.z, 0.6) && distance(shore, boat.position) <= 25 && distance(player.position, boat.position) <= 22) return boat;
  }
  return best;
}
function nearbyNPC(max = 3.8) { return npcs.nearest(player.position, max); }
function exitVehicle() {
  const vehicle = driven;
  if (!vehicle) return;
  if (vehicle.kind === 'boat') {
    const shore = findLandNear(vehicle.position.x, vehicle.position.z, 0.6, 100);
    if (landBlocked(shore.x, shore.z, 0.6) || distance(shore, vehicle.position) > 25) {
      hud.toast('Get closer to the bank'); return;
    }
    player.position.set(shore.x, 0, shore.z);
  } else {
    const offsets = [vehicle.heading + Math.PI / 2, vehicle.heading - Math.PI / 2, vehicle.heading + Math.PI, vehicle.heading];
    let exit = null;
    for (const h of offsets) {
      const candidate = new THREE.Vector3(vehicle.position.x + Math.sin(h) * 2.5, 0, vehicle.position.z - Math.cos(h) * 2.5);
      if (!landBlocked(candidate.x, candidate.z, 0.6) && !resolveCircle(candidate, 0.6, world.colliders)) { exit = candidate; break; }
    }
    if (!exit) { hud.toast('There is no safe space to get out here'); return; }
    player.position.copy(exit);
  }
  player.heading = vehicle.heading; avatar.group.visible = true; driven = null;
  hud.setRole('WANDERER'); audio.setEngine(null, 0); audio.setSiren(false);
}
function enterExit() {
  if (driven) { exitVehicle(); return; }
  const vehicle = nearestVehicle(5.2);
  if (!vehicle) return;
  if (vehicle.kind === 'boat') {
    if (isWater(player.position.x, player.position.z) || landBlocked(player.position.x, player.position.z, 0.4)) return;
    const shore = findLandNear(vehicle.position.x, vehicle.position.z, 0.6, 80);
    if (landBlocked(shore.x, shore.z, 0.6) || distance(shore, vehicle.position) > 25) { hud.toast('Get closer to the bank'); return; }
  } else if (landBlocked(player.position.x, player.position.z, 0.5)) return;
  driven = vehicle; vehicle.speed = 0; avatar.group.visible = false;
  if (vehicle.kind === 'bus' && !vehicle.routeLine && !missions.active) { missions.start('bus11', { level: state.level }); hud.toast('Route 11 shift started — follow the glowing lane to each stop', 5000); }
  hud.setRole(vehicle.kind === 'boat' ? 'THAMES SKIPPER' : `${vehicle.kind} DRIVER`);
  if (vehicle.kind === 'police') audio.setSiren(vehicle.siren);
}
function tryTalk() {
  if (talk.isOpen()) { talk.close(); return; }
  const entry = nearbyNPC(5); if (entry) talk.open(entry.data);
}

document.querySelectorAll('.swatch').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('selected', b === button)); selectedOutfit = button.dataset.outfit;
}));
document.querySelector('#player-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); document.querySelector('#start-game').click(); } });
document.body.classList.add('intro-open');
document.querySelector('#start-game').addEventListener('click', () => {
  document.body.classList.remove('intro-open'); window.dispatchEvent(new Event('game:started'));
  state.name = document.querySelector('#player-name').value.trim().slice(0, 18) || 'Alex';
  scene.remove(avatar.group); avatar = makeHuman(outfits[selectedOutfit]); avatar.group.position.copy(player.position); scene.add(avatar.group);
  hud.setName(state.name); document.querySelector('#intro').classList.add('hidden'); window.__gameStartedAt = performance.now(); document.activeElement?.blur?.(); renderer.domElement.focus({ preventScroll: true }); setTimeout(() => { if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) document.activeElement.blur(); renderer.domElement.focus({ preventScroll: true }); }, 50); audio.start();
  hud.toast(`Welcome to Westminster, ${state.name}. Walk up to anyone and press T to talk.`, 5200);
  mp.connect(state.name, outfits[selectedOutfit]);
});

const mp = new Multiplayer(scene, { makeHuman, animateHuman, makeVehicleMesh, toast: (t) => hud.toast(t, 3500), onPlayers: (n) => {} });
mountChatUI(mp);
// Thames Sprint: multiplayer boat race — stand in the glowing circle at Westminster Pier.
const race = new BoatRace(scene, {
  mp, Vehicle, physicsWorld, hud: { toast: (t, ms) => hud.toast(t, ms || 3500) },
  getPlayer: () => ({ position: driven ? driven.position : player.position, onFoot: !driven }),
  enterBoat: (boat) => { if (driven) { driven.speed = 0; } if (!fleet.includes(boat)) fleet.push(boat); driven = boat; boat.speed = 0; avatar.group.visible = false; hud.setRole('THAMES SPRINT'); },
  exitBoat: () => {
    const b = driven; if (!b) return;
    const shore = findLandNear(56, -64, 0.6, 30); player.position.set(shore.x, 0, shore.z);
    driven = null; avatar.group.visible = true; hud.setRole('WANDERER');
    const i = fleet.indexOf(b); if (i >= 0 && b !== fleet.find((v) => v.kind === 'boat')) fleet.splice(i, 1);
  },
  onState: (text) => {},
});
const phone = new Phone({
  getCtx: () => ({ playerName: state.name, money: state.money, level: state.level, age: state.age }), toast: (t) => hud.toast(t, 3000),
  getEvents: () => [
    race.eventInfo,
    ...busRoutes.eventInfos,
    { id: 'bus-11', title: 'Route 11 shift', subtitle: 'Drive the real 11 from Westminster up Whitehall', where: 'Stop H, Bridge Street', status: `LIVE · next 11 in ${busStop.next().minutes} min`, players: 1, location: [busStop.entrance.x, busStop.entrance.z] },
    { id: 'gazette', title: "Today's Westminster Gazette", subtitle: "Tap to read today's real headlines", where: 'News stand next to Tesco, Bridge Street', status: 'Open', players: 0, location: [billboards.kiosk.position.x, billboards.kiosk.position.z] },
  ],
  onNavigate: (ev) => { if (ev?.id === 'gazette') { phone.toggle(false); billboards.openGazette(); return; } if (!driven && ev?.location) { routeGuide.show([player.position.x, player.position.z], [ev.location]); hud.route = routeGuide.points; navTarget = ev.location; } },
});
let navTarget = null;
window.__game = { player, get driven() { return driven; }, keys, get yaw() { return cameraYaw; }, get walkSpeed() { return walkSpeed; }, get elapsed() { return elapsed; }, get grounded() { return grounded; }, fleet, get routeGuide() { return routeGuide; }, get talking() { return talk.isOpen(); }, world }; // debug handle
// Real TfL Stop H (route 11), Bridge Street — live countdown; press E to board and drive the 11.
const stopSpot = findLandNear(-20, -35, 0.6, 10);
const busStop = new BusStop(scene, { x: stopSpot.x, z: stopSpot.z, facing: 0 });
const routeGuide = new RouteGuide(scene); let routeKey = '';
function updateRouteGuide() {
  const a = missions.active;
  const key = a && driven && driven.kind === a.def.vehicle ? `${a.def.id}:${a.index}` : '';
  if (key === routeKey) return; routeKey = key;
  if (!key || a.def.water) { routeGuide.clear(); hud.route = null; return; }
  routeGuide.show([driven.position.x, driven.position.z], a.def.points.slice(a.index));
  hud.route = routeGuide.points;
}
function boardBus() {
  const bus = fleet.find((v) => v.kind === 'bus'); if (!bus) return;
  const next = busStop.next();
  bus.position.set(busStop.entrance.x, 0, -27); bus.heading = Math.PI / 2; bus.speed = 0; bus.mesh.rotation.y = bus.heading;
  driven = bus; avatar.group.visible = false; hud.setRole('BUS DRIVER · ROUTE 11');
  const r = missions.start('bus11', { level: state.level });
  hud.toast(`You're driving the ${next.line} towards ${next.destination}. Real next ${next.line}: ${next.minutes <= 0 ? 'due now' : next.minutes + ' min'} (TfL live).`, 7000);
  if (r && r.ok === false && r.reason) hud.toast(r.reason, 3000);
}
// Real TfL bus routes (11, 12, 24, 88, 148, 159, 453, 87): one bus per route at its real first stop.
const busRoutes = new BusRoutes(scene, {
  Vehicle, fleet, get routeGuide() { return routeGuide; }, hud: { toast: (t, ms) => hud.toast(t, ms || 3500), setRole: (t) => hud.setRole(t) },
  getPlayer: () => ({ position: driven ? driven.position : player.position, driven }),
  enterVehicle: (v) => { driven = v; v.speed = 0; avatar.group.visible = false; },
  onEvent: (e) => { if (e?.type === 'route-complete') { state.money += e.pay || 0; state.xp += e.pay || 0; state.age += 1; state.level = 1 + Math.floor(state.xp / 300); audio.chime(); hud.toast(`Route ${e.line} complete · +£${e.pay} · You're now ${state.age}`, 5000); } },
});
busRoutes.load();
hud.pois = [
  { x: busStop.entrance.x, z: busStop.entrance.z, color: '#d4141c', icon: '🚌' },
  { x: 56, z: -60, color: '#ff8b36', icon: '🚤' },
  { x: -45, z: -37, color: '#00539f', icon: '🛒' },
];
const billboards = new Billboards(scene, { toast: (t) => hud.toast(t, 4500) });
hud.pois?.push({ x: billboards.kiosk.position.x, z: billboards.kiosk.position.z, color: '#1f4d3a', icon: '📰' });
// GPT Image 2.5: P = postcard of this moment, C = comic of your day, gigs → newspaper front page.
const dayLog = [];
const studio = new ImageStudio({ renderer, getCtx: () => ({ playerName: state.name, age: state.age, level: state.level, money: state.money }), toast: (t) => hud.toast(t, 3000) });
window.addEventListener('game:started', () => { setTimeout(() => hud.toast('Press F for your phone — contacts and live events', 6000), 5000); setTimeout(() => document.body.classList.add('hints-faded'), 30000); document.querySelector('#london-chat')?.classList.add('lc-collapsed'); });
// Physical key positions → logical keys (works on any keyboard layout / caps lock).
const CODE_KEYS = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', Space: ' ', ShiftLeft: 'shift', ShiftRight: 'shift', KeyE: 'e', KeyT: 't', KeyH: 'h', KeyF: 'f', KeyP: 'p', KeyC: 'c', KeyM: 'm', ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright', Escape: 'escape' };
const keyOf = (event) => CODE_KEYS[event.code] || event.key.toLowerCase();
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
renderer.domElement.addEventListener('pointerdown', () => { const a = document.activeElement; if (a && a !== renderer.domElement && /INPUT|TEXTAREA/.test(a.tagName)) a.blur(); renderer.domElement.focus({ preventScroll: true }); }, true);
window.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA'].includes(event.target?.tagName)) return;
  const key = keyOf(event);
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
  keys[key] = true; if (event.repeat) return;
  if (key === ' ') jumpRequested = true;
  if (key === 'e' && !driven && !talk.isOpen() && nearestShop(player.position)) { isShopOpen() ? closeShop() : openShop(nearestShop(player.position)); return; }
  if (key === 'escape') { closeShop(); billboards.closeAll(); }
  if (key === 'e' && !driven && billboards.nearKiosk(player.position)) { billboards.openGazette(); return; }
  if (key === 'e' && !driven && busStop.near(player.position)) { boardBus(); return; }
  if (key === 'f' && !talk.isOpen()) { phone.toggle(); return; }
  if (key === 'e') { if (talk.isOpen()) return; const npc = nearbyNPC(3.8); if (!driven && npc) talk.open(npc.data); else enterExit(); }
  if (key === 't') tryTalk();
  if (key === 'p' && !talk.isOpen()) { dayLog.push('Snapped a postcard near ' + (driven ? 'the ' + driven.kind : 'Big Ben')); studio.openPostcard({ caption: 'Greetings from Westminster', onCapture: () => { post?.render(); return renderer.domElement.toDataURL('image/jpeg', 0.85); } }); }
  if (key === 'c' && !talk.isOpen()) studio.comic(dayLog.length ? dayLog : [`${state.name || 'A newcomer'} arrives at Big Ben`, 'Meets Maggie the flower seller', 'Explores Westminster Bridge', 'Watches the sunset over the Thames']);
  if (key === 'h' && driven?.kind === 'police') { driven.siren = !driven.siren; audio.setSiren(driven.siren); hud.toast(driven.siren ? 'Siren on' : 'Siren off', 1400); }
  if (key === 'm') hud.setAudio(audio.toggleMute());
  if (key === 'escape' && talk.isOpen()) talk.close();
});
window.addEventListener('keyup', event => { keys[keyOf(event)] = false; if (event.key) keys[event.key.toLowerCase()] = false; });
renderer.domElement.addEventListener('pointerdown', event => { if (event.button !== 0 || talk.isOpen()) return; dragging = true; lastPointerX = event.clientX; lastPointerY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); });
renderer.domElement.addEventListener('pointermove', event => {
  if (!dragging) return;
  cameraYaw -= (event.clientX - lastPointerX) * 0.006;
  cameraHeight = THREE.MathUtils.clamp(cameraHeight + (event.clientY - lastPointerY) * 0.025, 1.1, 9);
  lastPointerX = event.clientX; lastPointerY = event.clientY;
});
renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('wheel', event => { cameraDistance = THREE.MathUtils.clamp(cameraDistance + Math.sign(event.deltaY) * 0.8, 3, 14); }, { passive: true });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); post?.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()); });

const cameraLook = new THREE.Vector3();
function step(dt) {
  elapsed += dt; world.update(dt, elapsed); updateShops(elapsed); billboards.update(dt); race.update(dt, elapsed); busRoutes.update(dt, elapsed); if (talk.isOpen() && talk.npc) { const e = npcs.list.find((n) => n.data.id === talk.npc.id); if (e) talk.distanceCheck?.(player.position, e.position); } if (navTarget && !driven && Math.hypot(player.position.x - navTarget[0], player.position.z - navTarget[1]) < 6) { navTarget = null; routeGuide.clear(); hud.route = null; routeKey = ''; } if (!navTarget) updateRouteGuide(); routeGuide.update(dt); mp.update(dt); mp.sendState({ position: driven ? driven.position : player.position, heading: driven ? driven.heading : player.heading, speed: driven ? driven.speed : (typeof walkSpeed === 'number' ? walkSpeed : 0) }, driven?.kind || null);
  const forward = !!(keys.w || keys.arrowup), back = !!(keys.s || keys.arrowdown);
  const left = !!(keys.a || keys.arrowleft), right = !!(keys.d || keys.arrowright);
  if (driven) {
    jumpRequested = false;
    physicsWorld.trafficCars = traffic.cars; physicsWorld.npcs = npcs.list;
    physicsWorld.otherVehicles = fleet.filter(v => v !== driven).map(v => ({ position:v.position, mesh:v.mesh, radius:VEHICLE_SPECS[v.kind]?.radius || 2.5, mass:VEHICLE_SPECS[v.kind]?.mass || 1, _velocity:v._velocity }));
    if (driven.update(dt, { forward, back, left, right, handbrake: !!keys[' '] }, physicsWorld, elapsed)) cameraShake = Math.min(.45, cameraShake + .22);
    audio.setEngine(driven.kind, driven.speed);
    if (driven.kind === 'police') audio.setSiren(driven.siren);
  } else {
    const f = Number(forward) - Number(back), s = Number(right) - Number(left);
    let dx = -Math.sin(cameraYaw) * f + Math.cos(cameraYaw) * s;
    let dz = -Math.cos(cameraYaw) * f - Math.sin(cameraYaw) * s;
    const magnitude = Math.hypot(dx, dz), hasInput = magnitude > .01;
    if(hasInput){dx/=magnitude;dz/=magnitude;}
    const topSpeed=keys.shift?7.8:(hasInput&&f>0?4.8:3.1);
    walkSpeed=THREE.MathUtils.damp(walkSpeed,hasInput?topSpeed:0,hasInput?13:17,dt);
    const moveX=dx*walkSpeed*dt,moveZ=dz*walkSpeed*dt;
    if(grounded){
      const next=player.position.clone();next.x+=moveX;next.z+=moveZ;
      if(!landBlocked(next.x,next.z,.55)&&!resolveCircle(next,.55,world.colliders)){player.position.x=next.x;player.position.z=next.z;}
      else{
        const xOnly=player.position.clone();xOnly.x+=moveX;
        if(!landBlocked(xOnly.x,xOnly.z,.55)&&!resolveCircle(xOnly,.55,world.colliders))player.position.x=xOnly.x;
        const zOnly=player.position.clone();zOnly.z+=moveZ;
        if(!landBlocked(zOnly.x,zOnly.z,.55)&&!resolveCircle(zOnly,.55,world.colliders))player.position.z=zOnly.z;
      }
      // Capsule push-out against pedestrians and parked/moving vehicles.
      const pushBodies = [
        ...npcs.list.map(entry => ({ position:entry.position, radius:entry.radius||.48, entry })),
        ...fleet.filter(v=>v!==driven&&v.kind!=='boat').map(v=>({position:v.position,radius:(VEHICLE_SPECS[v.kind]?.radius||1.2)+.2,vehicle:v})),
        ...traffic.cars.map(v=>({position:v.position,radius:(v.radius||2.35)*.62,vehicle:v})),
      ];
      for(const body of pushBodies){
        const ox=player.position.x-body.position.x,oz=player.position.z-body.position.z,d=Math.hypot(ox,oz),min=.55+body.radius;
        if(d>=min)continue;
        const nx=d>.001?ox/d:1,nz=d>.001?oz/d:0,overlap=min-d;
        player.position.x+=nx*overlap;player.position.z+=nz*overlap;
        if(body.entry){body.entry.position.x-=nx*overlap*.72;body.entry.position.z-=nz*overlap*.72;body.entry.stumbleUntil=elapsed+1.05;body.entry.stumbleX=nx;body.entry.stumbleZ=nz;}
        if(body.vehicle?._velocity){body.vehicle._velocity.x-=nx*Math.max(0,walkSpeed)*.12;body.vehicle._velocity.y-=nz*Math.max(0,walkSpeed)*.12;}
      }
    }
    if(hasInput&&walkSpeed>.18){const h=Math.atan2(-dx,-dz),delta=((h-player.heading+Math.PI*3)%(Math.PI*2))-Math.PI;player.heading+=delta*(1-Math.exp(-14*dt));}
    if(jumpRequested&&grounded&&!talk.isOpen()){verticalSpeed=7.6;grounded=false;}
    jumpRequested=false;
    if(!grounded){verticalSpeed-=20*dt;player.position.y+=verticalSpeed*dt;if(player.position.y<=0){player.position.y=0;verticalSpeed=0;grounded=true;landingSquash=.22;}}
    landingSquash=Math.max(0,landingSquash-dt*1.8);
    walkPhase+=dt*walkSpeed*2.55;animateHuman(avatar,walkPhase,THREE.MathUtils.clamp(walkSpeed/5,0,1));
    avatar.group.position.set(player.position.x,player.position.y,player.position.z);avatar.group.rotation.y=player.heading;avatar.group.scale.y=1-landingSquash;audio.setEngine(null,0);
  }
  syncPlayer();
  const npc = driven ? null : nearbyNPC(4), vehicleNear = driven ? null : nearestVehicle(5.2);
  const shopNear = !driven && nearestShop(player.position); const kioskNear = !driven && billboards.nearKiosk(player.position);
  const stopNear = !driven && busStop.near(player.position);
  const interaction = stopNear ? { label: `Board the ${busStop.next().line} to ${busStop.next().destination} · ${busStop.next().minutes <= 0 ? 'due' : busStop.next().minutes + ' min'}` } : shopNear ? { label: `Enter ${shopNear.name}` } : kioskNear ? { label: 'Read the Westminster Gazette' } : (npc || vehicleNear);
  if (!driven && interaction?.data) hud.setRole('WANDERER');
  missions.update(dt, { vehicleKind: driven?.kind || null, position: player.position, speed: driven?.speed || 0 });
  const target = missions.target(); npcs.update(dt, player.position, elapsed);
  const obstacles = [{ position: player.position, radius: driven ? (VEHICLE_SPECS[driven.kind]?.radius || 2.5) : 0.7 },
    ...fleet.filter(v => v !== driven).map(v => ({ position: v.position, radius: VEHICLE_SPECS[v.kind]?.radius || 2.5 }))];
  traffic.update(dt, obstacles);
  for(const v of fleet)if(v!==driven)v.idle(dt,elapsed);
  for(const entry of npcs.list){if(entry.stumbleUntil>elapsed){
    entry.human.group.rotation.z=THREE.MathUtils.damp(entry.human.group.rotation.z||0,.42,4,dt);
    entry.human.group.rotation.y=Math.atan2(-entry.stumbleX,-entry.stumbleZ);animateHuman(entry.human,elapsed*10,Math.min(1,entry.stumbleUntil-elapsed));
    entry.human.armL.rotation.x=-1.25+Math.sin(elapsed*14)*.12;entry.human.armR.rotation.x=-1.05-Math.sin(elapsed*14)*.12;
  }else {entry.human.group.rotation.z=THREE.MathUtils.damp(entry.human.group.rotation.z||0,0,5,dt);if(entry.human.group.rotation.z<.03&&entry.human.group.rotation.z>-.03)entry.human.group.rotation.z=0;}}
  if (world.sun) world.sun.position.set(player.position.x + 80, 120, player.position.z + 60);
  const chaseDist = driven ? (VEHICLE_SPECS[driven.kind]?.camDist || 10) : cameraDistance;
  const chaseHeight = driven ? (VEHICLE_SPECS[driven.kind]?.camHeight || 3.8) : cameraHeight;
  const followYaw = cameraYaw + (driven ? driven.heading : 0);
  let desired = new THREE.Vector3(player.position.x + Math.sin(followYaw) * chaseDist, player.position.y + chaseHeight, player.position.z + Math.cos(followYaw) * chaseDist);
  for(let i=1;i<=Math.ceil(chaseDist*2);i++){const u=i/Math.ceil(chaseDist*2),x=player.position.x+(desired.x-player.position.x)*u,z=player.position.z+(desired.z-player.position.z)*u;if(cellAt(x,z)===2){const d=Math.max(2.4,chaseDist*u-.8);desired.set(player.position.x+Math.sin(followYaw)*d,player.position.y+chaseHeight*Math.min(1,d/chaseDist),player.position.z+Math.cos(followYaw)*d);break;}}
  desired.y=Math.max(.8,desired.y);cameraShake=THREE.MathUtils.damp(cameraShake,0,4,dt);desired.x+=(Math.random()-.5)*cameraShake;desired.y+=(Math.random()-.5)*cameraShake*.45;
  camera.position.lerp(desired, 1 - Math.exp(-6.5 * dt));
  cameraLook.set(player.position.x, player.position.y + (driven ? 1.2 : 1.35), player.position.z); camera.lookAt(cameraLook);
  if (document.body.classList.contains('intro-open')) { // cinematic orbit of Big Ben & the Thames behind the title screen
    const a = elapsed * 0.045 + 0.6, r = 230;
    camera.position.set(110 + Math.cos(a) * r, 58 + Math.sin(elapsed * 0.11) * 10, -40 + Math.sin(a) * r);
    camera.lookAt(40, 38, 20);
  }
  if (target) {
    const targetAngle = Math.atan2(-(target[0] - player.position.x), -(target[1] - player.position.z));
    const relative = targetAngle - cameraYaw;
    const arrow = document.querySelector('#target-arrow');
    arrow.style.left = `${THREE.MathUtils.clamp(50 + Math.sin(relative) * 38, 12, 88)}%`;
  }
  hud.update({ player, state, vehicle: driven, nearby: interaction, mission: missions, target, npcs: npcs.list, vehicles: fleet, time: elapsed });
}

// Post-processing (AO + bloom); drops to plain rendering if the frame rate stays low. Add ?quality=low to force.
let post = null, slowFrames = 0;
const wantLow = new URLSearchParams(location.search).get('quality') === 'low';
function frame() {
  requestAnimationFrame(frame); // schedule first so one bad frame can never freeze the game
  const dt = Math.min(clock.getDelta(), 0.1); accumulator += dt;
  let ticks=0; try { while(accumulator>=FIXED_DT&&ticks<6){step(FIXED_DT);accumulator-=FIXED_DT;ticks++;} } catch (err) { accumulator = 0; if (!window.__stepErr) console.error('step failed:', err); window.__stepErr = String(err?.stack || err); }
  try {
    if (!post) post = createComposer(renderer, scene, camera, wantLow ? 'low' : 'high');
    post.render();
  } catch (err) {
    if (!window.__renderErr) console.error('render failed, falling back to plain rendering:', err);
    window.__renderErr = String(err?.stack || err);
    post = { render: () => renderer.render(scene, camera), setSize: () => {}, high: false };
  }
  if (!wantLow && post.high !== false) { slowFrames = dt > 1 / 30 ? slowFrames + 1 : Math.max(0, slowFrames - 1); if (slowFrames > 20) { post = createComposer(renderer, scene, camera, 'low'); post.high = false; renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); console.info('Low frame rate: switched to performance mode'); } }
}
camera.position.set(player.position.x, 4, player.position.z + 8); camera.lookAt(player.position.x, 1, player.position.z);
requestAnimationFrame(frame);
