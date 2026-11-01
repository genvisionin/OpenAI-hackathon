import * as THREE from 'three';
import { MISSIONS } from './npcData.js';

const VEHICLE_LABEL = { bus: 'the bus', cab: 'a black cab', police: 'a police car', boat: 'a speedboat' };
function makeMarker(scene) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 3.2, 9, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0xffbf47, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.position.y = 4.5; group.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.17, 10, 48), new THREE.MeshBasicMaterial({ color: 0xffd25e, transparent: true, opacity: 0.96 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; group.add(ring);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(5.1, 0.055, 8, 48), new THREE.MeshBasicMaterial({ color: 0xff8c3a, transparent: true, opacity: 0.76, blending: THREE.AdditiveBlending }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.13; group.add(halo);
  const waterRing = new THREE.Mesh(new THREE.TorusGeometry(7, 0.2, 12, 64), new THREE.MeshBasicMaterial({ color: 0x4bdcff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
  waterRing.position.y = 0.1; group.add(waterRing);
  const waterBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.7, 9, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x31cfff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  waterBeam.position.y = 4.5; group.add(waterBeam);
  scene.add(group); group.visible = false;
  return { group, beam, ring, halo, waterRing, waterBeam };
}

export class Missions {
  constructor(scene, { onComplete = () => {}, onFail = () => {}, onMessage = () => {} } = {}) {
    this.scene = scene; this.onComplete = onComplete; this.onFail = onFail; this.onMessage = onMessage;
    this.active = null; this.marker = makeMarker(scene);
  }

  start(missionId, player = { level: 1 }) {
    const def = MISSIONS[missionId];
    if (!def) return { ok: false, reason: 'That gig is unavailable.' };
    if (this.active) return { ok: false, reason: 'Finish your current gig first.' };
    if ((player.level || 1) < (def.minLevel || 1)) return { ok: false, reason: `Reach level ${def.minLevel} to take that gig.` };
    this.active = { def, index: 0, timeLeft: def.time, started: 0 };
    this._placeMarker();
    this.onMessage(`${def.title} started. Get to ${def.names?.[0] || 'the marker'} in ${VEHICLE_LABEL[def.vehicle] || def.vehicle}.`);
    return { ok: true };
  }

  target() {
    const point = this.active?.def.points[this.active.index];
    return point ? [point[0], point[1]] : null;
  }

  objectiveText() {
    if (!this.active) return '';
    const { def, index, timeLeft } = this.active;
    const name = def.names?.[index] || `Stop ${index + 1}`;
    return `${def.mustStop ? `Stop at ${name}` : `Reach ${name}`} · ${Math.max(0, Math.ceil(timeLeft))}s`;
  }

  update(dt, ctx = {}) {
    if (!this.active || ctx.vehicleKind !== this.active.def.vehicle) return;
    const mission = this.active, def = mission.def;
    mission.started += dt; mission.timeLeft -= dt;
    if (mission.timeLeft <= 0) {
      this.active = null; this.marker.group.visible = false;
      this.onMessage(`${def.title} timed out.`); this.onFail(def); return;
    }
    const point = def.points[mission.index];
    if (!point || !ctx.position) return;
    if (Math.hypot(ctx.position.x - point[0], ctx.position.z - point[1]) > 9) return;
    if (def.mustStop && Math.abs(ctx.speed || 0) >= 2.5) return;
    mission.index++;
    if (mission.index >= def.points.length) {
      this.active = null; this.marker.group.visible = false;
      this.onMessage(`${def.title} complete! £${def.reward} earned.`); this.onComplete(def); return;
    }
    this.onMessage(`${def.names?.[mission.index] || `Stop ${mission.index + 1}`} — keep it moving!`);
    this._placeMarker();
  }

  _placeMarker() {
    const point = this.target();
    if (!point) { this.marker.group.visible = false; return; }
    const water = !!this.active?.def.water;
    this.marker.group.position.set(point[0], water ? -6 : 0, point[1]);
    this.marker.beam.visible = false; this.marker.ring.visible = !water; this.marker.halo.visible = !water;
    this.marker.waterRing.visible = water; this.marker.waterBeam.visible = false;
    this.marker.group.visible = true;
  }
}
