// Real TfL bus stop "Westminster Stn / Westminster Pier" (Stop H, route 11) with a live
// countdown board fed by the TfL Unified API. Press E at the stop to board the next 11.
import * as THREE from 'three';

export class BusStop {
  constructor(scene, { x, z, facing = 0, stopId = '490014498S' }) {
    this.stopId = stopId; this.data = null;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = facing; this.group = g;
    const red = new THREE.MeshStandardMaterial({ color: '#d4141c', roughness: 0.4 });
    const steel = new THREE.MeshStandardMaterial({ color: '#3a3d40', metalness: 0.6, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: '#cfe3ea', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 });
    // pole + roundel flag
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8), steel); pole.position.set(-2.6, 1.7, 0); g.add(pole);
    const rc = document.createElement('canvas'); rc.width = rc.height = 256; const r = rc.getContext('2d');
    r.fillStyle = '#fff'; r.fillRect(0, 0, 256, 256); r.strokeStyle = '#d4141c'; r.lineWidth = 34; r.beginPath(); r.arc(128, 100, 70, 0, 7); r.stroke();
    r.fillStyle = '#1b2a7a'; r.fillRect(20, 84, 216, 34); r.fillStyle = '#fff'; r.font = 'bold 26px Helvetica'; r.textAlign = 'center'; r.fillText('BUS STOP', 128, 110);
    r.fillStyle = '#111'; r.font = 'bold 54px Helvetica'; r.fillText('H', 128, 222); r.fillStyle = '#d4141c'; r.fillRect(170, 180, 70, 50); r.fillStyle = '#fff'; r.font = 'bold 38px Helvetica'; r.fillText('11', 205, 218);
    const rt = new THREE.CanvasTexture(rc); rt.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: rt, side: THREE.DoubleSide })); flag.position.set(-2.6, 3.2, 0); flag.rotation.y = Math.PI / 2; g.add(flag);
    // shelter
    for (const sx of [-1.9, 1.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 0.08), steel); p.position.set(sx, 1.25, -0.6); g.add(p); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.2, 0.04), glass); back.position.set(0, 1.25, -0.62); g.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.12, 1.6), red); roof.position.set(0, 2.55, -0.1); roof.castShadow = true; g.add(roof);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.4), steel); bench.position.set(0, 0.5, -0.4); g.add(bench);
    // live countdown board (Countdown-style dot-matrix)
    this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 256;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshStandardMaterial({ map: this.tex, emissive: '#ffffff', emissiveMap: this.tex, emissiveIntensity: 0.9 }));
    board.position.set(0.6, 2.1, -0.58); g.add(board);
    scene.add(g);
    this.entrance = new THREE.Vector3(0, 0, 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing).add(g.position);
    this.draw(); this.poll(); this.timer = setInterval(() => this.poll(), 30000);
  }

  async poll() {
    try { const r = await fetch(`/api/transit/arrivals?stop=${this.stopId}`); this.data = await r.json(); } catch { /* keep last */ }
    this.draw();
  }

  draw() {
    const c = this.canvas.getContext('2d'); c.fillStyle = '#0b0b0b'; c.fillRect(0, 0, 512, 256);
    c.fillStyle = '#ffb000'; c.font = 'bold 26px monospace';
    const rows = this.data?.arrivals?.length ? this.data.arrivals.slice(0, 4) : [];
    c.fillText(`STOP ${this.data?.letter || 'H'}  ${this.data?.live === false ? 'TIMETABLE' : 'LIVE'}  ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}`, 16, 36);
    c.fillRect(16, 48, 480, 2);
    if (!rows.length) c.fillText('Checking TfL…', 16, 100);
    rows.forEach((a, i) => {
      const y = 92 + i * 44;
      c.fillText(a.line.padEnd(4), 16, y);
      c.fillText((a.destination || '').slice(0, 20), 90, y);
      c.fillText(a.minutes <= 0 ? 'due' : `${a.minutes}min`, 410, y);
    });
    this.tex.needsUpdate = true;
  }

  near(pos, d = 4) { return Math.hypot(pos.x - this.entrance.x, pos.z - this.entrance.z) < d; }
  next() { return this.data?.arrivals?.[0] || { line: '11', destination: 'Liverpool Street', minutes: 3 }; }
}
