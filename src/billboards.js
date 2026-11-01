// Giant roadside billboards (GPT Image 2.5 posters, rotating), an "Advertise here" panel
// for businesses, and a Westminster Gazette newspaper kiosk where you read your front pages.
import * as THREE from 'three';
import { findLandNear, LONDON_EYE } from './world.js';

const CSS = `
.ll-modal{position:fixed;inset:0;display:none;place-items:center;background:rgba(8,7,5,.6);backdrop-filter:blur(6px);z-index:70}
.ll-modal.open{display:grid}
.ll-card{width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;background:#15130f;color:#f3ead6;border:1px solid #3a3226;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6);padding:20px}
.ll-card h2{margin:0 0 4px;font:700 24px Georgia,serif}.ll-card p.sub{margin:0 0 14px;color:#bfb39b;font-size:13px}
.ll-card label{display:block;font-size:12px;color:#bfb39b;margin:10px 0 4px}
.ll-card input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #3a3226;background:#0f0d0a;color:#f3ead6;font-size:14px}
.ll-row{display:flex;gap:8px;margin-top:14px}.ll-btn{flex:1;padding:11px;border-radius:9px;border:0;font-weight:700;cursor:pointer;font-size:14px}
.ll-primary{background:#c8102e;color:#fff}.ll-ghost{background:#2a241c;color:#f3ead6}
.ll-preview{margin-top:14px;border-radius:10px;overflow:hidden;background:#0f0d0a;min-height:40px;display:grid;place-items:center;color:#8f846f;font-size:13px}
.ll-preview img{width:100%;display:block}
.ll-shimmer{height:220px;width:100%;background:linear-gradient(90deg,#1b1813 25%,#2b251c 50%,#1b1813 75%);background-size:200% 100%;animation:llsh 1.2s infinite}
@keyframes llsh{to{background-position:-200% 0}}
.ll-paper img{width:100%;border-radius:6px;display:block}.ll-editions{display:flex;gap:6px;overflow-x:auto;margin:10px 0}
.ll-editions button{flex:none;width:64px;height:64px;padding:0;border:2px solid transparent;border-radius:6px;overflow:hidden;cursor:pointer;background:#0f0d0a}
.ll-editions button.on{border-color:#c9a548}.ll-editions img{width:100%;height:100%;object-fit:cover}
`;

function modal(id) {
  if (!document.getElementById('ll-style')) { const s = document.createElement('style'); s.id = 'll-style'; s.textContent = CSS; document.head.appendChild(s); }
  let m = document.getElementById(id);
  if (!m) { m = document.createElement('div'); m.id = id; m.className = 'll-modal'; document.body.appendChild(m); m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('open'); }); }
  return m;
}

export class Billboards {
  constructor(scene, { toast = () => {} } = {}) {
    this.scene = scene; this.toast = toast; this.boards = []; this.ads = []; this.idx = 0; this.timer = 0;
    this.loader = new THREE.TextureLoader(); this.editions = [];
    // Real roadside spots on the map; each board faces its traffic.
    const spots = [
      { at: [348, -48], look: [200, -20] },    // east end of Westminster Bridge, facing bridge traffic
      { at: [-82, -205], look: [-105, -60] },  // Parliament Street, facing south
      { at: [42, -150], look: [60, -40] },     // Victoria Embankment by the pier
      { at: [-236, -12], look: [-100, -25] },  // Parliament Square west side
    ];
    for (const s of spots) this.boards.push(this.makeBoard(s));
    this.boards.push(this.makeEyeBanner());
    this.kiosk = this.makeKiosk(findLandNear(-55, -35, 1.4, 12)); // next to Tesco Express, Bridge Street
    this.refresh();
    window.addEventListener('studio:image', (e) => {
      if (e.detail?.endpoint === '/api/image/newspaper') {
        this.editions.unshift({ dataUrl: e.detail.dataUrl, headline: e.detail.payload?.headline || 'Latest edition', ts: Date.now() });
        this.toast('New Westminster Gazette on the stands — read it at the kiosk by Big Ben');
      }
    });
  }

  makeBoard({ at, look }) {
    const p = findLandNear(at[0], at[1], 2.5, 30);
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    const steel = new THREE.MeshStandardMaterial({ color: '#2b2e31', metalness: 0.7, roughness: 0.35 });
    const W = 16, H = 10.7, Y = 9;
    for (const sx of [-4.5, 4.5]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, Y, 10), steel); leg.position.set(sx, Y / 2, -0.6); leg.castShadow = true; g.add(leg); }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, H + 0.8, 0.8), steel); frame.position.set(0, Y + H / 2, -0.7); frame.castShadow = true; g.add(frame);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0.22 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat); panel.position.set(0, Y + H / 2, -0.28); g.add(panel);
    const walk = new THREE.Mesh(new THREE.BoxGeometry(W, 0.15, 1.2), steel); walk.position.set(0, Y - 0.1, 0.2); g.add(walk);
    for (const sx of [-5.5, 0, 5.5]) { // lamp arms
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4), new THREE.MeshStandardMaterial({ color: '#fff4d0', emissive: '#ffe7a8', emissiveIntensity: 1.2 }));
      lamp.position.set(sx, Y + H + 0.9, 0.8); g.add(lamp);
    }
    g.lookAt(look[0], 0, look[1]);
    this.scene.add(g);
    return { group: g, mat };
  }

  /** Huge banner hung between the London Eye's A-frame legs, facing Big Ben across the Thames. */
  makeEyeBanner() {
    const g = new THREE.Group(); g.position.set(LONDON_EYE.x, 0, LONDON_EYE.z); g.rotation.y = -0.23;
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.25, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(33, 22), mat);
    banner.position.set(20.5, 24, 0); banner.rotation.y = -Math.PI / 2; g.add(banner);
    const cable = new THREE.MeshStandardMaterial({ color: '#dfe5ea', metalness: 0.6, roughness: 0.3 });
    for (const z of [-16.5, 16.5]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 22, 6), cable); c.position.set(20.5, 24, z); g.add(c); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 34, 8), cable); bar.rotation.x = Math.PI / 2; bar.position.set(20.5, 35.2, 0); g.add(bar);
    this.scene.add(g);
    return { group: g, mat };
  }

  makeKiosk(p) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    const green = new THREE.MeshStandardMaterial({ color: '#1f4d3a', roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 1.8), green); body.position.y = 1.2; body.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 2.4), green); roof.position.y = 2.55;
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
    x.fillStyle = '#f3ead6'; x.fillRect(0, 0, 512, 96); x.fillStyle = '#111'; x.font = 'bold 44px Georgia'; x.textAlign = 'center'; x.fillText('WESTMINSTER GAZETTE', 256, 62);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.52), new THREE.MeshStandardMaterial({ map: t, emissive: '#fff', emissiveMap: t, emissiveIntensity: 0.35 }));
    sign.position.set(0, 2.95, 0.9);
    const papers = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.4), new THREE.MeshStandardMaterial({ color: '#e9e2d0' })); papers.position.set(0, 1.0, 1.05); papers.rotation.x = -0.4;
    g.add(body, roof, sign, papers);
    // A-board showing today's real front page (from /api/news/today) + a floating NEWS marker
    const boardMat = new THREE.MeshStandardMaterial({ color: '#f3ead6', roughness: 0.8, emissive: '#ffffff', emissiveIntensity: 0.15 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.25), boardMat); board.position.set(2.3, 1.25, 1.1); board.rotation.x = -0.12; g.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.62, 2.37, 0.06), green); frame.position.set(2.3, 1.25, 1.06); frame.rotation.x = -0.12; g.add(frame);
    fetch('/api/news/today').then((r) => r.json()).then((d) => { if (d.imageUrl) this.loader.load(d.imageUrl, (t) => { t.colorSpace = THREE.SRGBColorSpace; boardMat.map = t; boardMat.emissiveMap = t; boardMat.needsUpdate = true; }); }).catch(() => {});
    const mc = document.createElement('canvas'); mc.width = 256; mc.height = 96; const mx = mc.getContext('2d');
    mx.fillStyle = '#1f4d3a'; mx.beginPath(); mx.roundRect(4, 4, 248, 88, 20); mx.fill(); mx.fillStyle = '#fff'; mx.font = 'bold 40px system-ui'; mx.textAlign = 'center'; mx.fillText("📰 TODAY'S NEWS", 128, 62);
    const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, transparent: true })); marker.scale.set(3.2, 1.2, 1); marker.position.set(0, 4.4, 0); g.add(marker); this.newsMarker = marker;
    g.lookAt(p.x, 0, p.z + 10); this.scene.add(g);
    return { group: g, position: g.position };
  }

  async refresh() {
    try { const r = await fetch('/api/ads/list'); const d = await r.json(); if (d.ads?.length) this.ads = d.ads; } catch { /* offline */ }
    if (!this.ads.length) this.ads = [{ id: 'fanta', url: '/ads/fanta.jpg', business: 'Fanta' }];
    this.show(0);
  }

  show(i) {
    const ad = this.ads[i % this.ads.length]; if (!ad) return;
    this.loader.load(ad.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      this.boards.forEach((b, k) => { // stagger: neighbouring boards show different ads when there are several
        const a = this.ads[(i + k) % this.ads.length];
        if (a === ad || this.ads.length === 1) { b.mat.map = tex; b.mat.emissiveMap = tex; b.mat.needsUpdate = true; }
        else this.loader.load(a.url, (t2) => { t2.colorSpace = THREE.SRGBColorSpace; b.mat.map = t2; b.mat.emissiveMap = t2; b.mat.needsUpdate = true; });
      });
    });
  }

  update(dt) { if (this.newsMarker) this.newsMarker.position.y = 4.4 + Math.sin(performance.now() / 500) * 0.15; if (this.ads.length > 1 && (this.timer += dt) > 14) { this.timer = 0; this.idx++; this.show(this.idx); } }
  nearKiosk(pos, d = 3.5) { return Math.hypot(pos.x - this.kiosk.position.x, pos.z - this.kiosk.position.z) < d; }

  /** "Advertise on London Lives" — business uploads product, GPT Image 2.5 designs the billboard. */
  openAdvertise() {
    const m = modal('ll-advertise'); let photo = null;
    m.innerHTML = `<div class="ll-card"><h2>Advertise in Westminster</h2><p class="sub">Upload your product — GPT Image 2.5 designs a billboard and it goes live on every board in the city.</p>
      <label>Business name</label><input id="ad-biz" placeholder="e.g. Maggie's Flowers" maxlength="60">
      <label>Product</label><input id="ad-prod" placeholder="e.g. Fresh tulip bouquets" maxlength="80">
      <label>Headline (optional)</label><input id="ad-tag" placeholder="e.g. Bloom where you are, London" maxlength="60">
      <label>Product photo (optional)</label><input id="ad-photo" type="file" accept="image/png,image/jpeg,image/webp">
      <div class="ll-preview" id="ad-prev">Your poster appears here</div>
      <div class="ll-row"><button class="ll-btn ll-ghost" id="ad-close">Close</button><button class="ll-btn ll-primary" id="ad-go">Create billboard</button></div></div>`;
    m.classList.add('open');
    m.querySelector('#ad-close').onclick = () => m.classList.remove('open');
    m.querySelector('#ad-photo').onchange = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { photo = r.result; }; r.readAsDataURL(f); };
    m.querySelector('#ad-go').onclick = async () => {
      const prev = m.querySelector('#ad-prev'), go = m.querySelector('#ad-go');
      const body = { business: m.querySelector('#ad-biz').value, product: m.querySelector('#ad-prod').value, tagline: m.querySelector('#ad-tag').value, imageDataUrl: photo };
      if (!body.business.trim()) { prev.textContent = 'Add a business name first.'; return; }
      go.disabled = true; go.textContent = 'Designing…'; prev.innerHTML = '<div class="ll-shimmer"></div>';
      try {
        const r = await fetch('/api/ads/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
        prev.innerHTML = `<img src="${d.ad.url}" alt="Billboard poster">`;
        this.ads.unshift(d.ad); this.idx = 0; this.show(0);
        go.textContent = 'Live on the billboards ✓'; this.toast(`${d.ad.business} is now on the Westminster billboards`);
      } catch (err) { prev.textContent = err.message; go.disabled = false; go.textContent = 'Try again'; }
    };
  }

  /** Today's real news, designed into a front page by GPT Image 2.5 (cached once per day on the server). */
  async openGazette() {
    const m = modal('ll-gazette');
    m.innerHTML = `<div class="ll-card ll-paper"><h2>The Westminster Gazette</h2><p class="sub" id="gz-sub">Fetching today's news from the wire… (first edition of the day takes about a minute)</p>
      <div id="gz-page"><div class="ll-shimmer" style="height:420px"></div></div><div id="gz-list"></div>
      <div class="ll-row"><button class="ll-btn ll-ghost" id="gz-close">Close</button></div></div>`;
    m.classList.add('open');
    m.querySelector('#gz-close').onclick = () => m.classList.remove('open');
    try {
      const r = await fetch('/api/news/today'); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'The presses are jammed');
      if (!m.classList.contains('open')) return;
      m.querySelector('#gz-sub').textContent = `${d.pretty || d.date} · today's real headlines`;
      m.querySelector('#gz-page').innerHTML = `<img src="${d.imageUrl}" alt="Front page: ${(d.lead?.title || '').replace(/"/g, '')}">`;
      const items = [d.lead, ...(d.stories || [])].filter(Boolean);
      m.querySelector('#gz-list').innerHTML = items.map((x) => `<a href="${x.url}" target="_blank" rel="noopener" style="display:block;padding:10px 0;border-bottom:1px solid #2a241c;color:#f3ead6;text-decoration:none"><b>${x.title}</b><br><span style="color:#bfb39b;font-size:13px">${x.summary || ''} — ${x.source || ''} ↗</span></a>`).join('');
    } catch (err) { m.querySelector('#gz-page').innerHTML = `<p class="sub">${err.message}</p>`; }
  }
  isOpen() { return ['ll-advertise', 'll-gazette'].some((id) => document.getElementById(id)?.classList.contains('open')); }
  closeAll() { ['ll-advertise', 'll-gazette'].forEach((id) => document.getElementById(id)?.classList.remove('open')); }
}
