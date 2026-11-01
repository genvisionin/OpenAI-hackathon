// Real-world supermarket you can walk into. Opens a panel that links to the store's real
// delivery listings (Uber Eats / Deliveroo search for this exact branch) in a new tab.
import * as THREE from 'three';

export const SHOPS = [];

const CSS = `
#shop-panel{position:fixed;inset:0;display:none;place-items:center;background:rgba(10,8,6,.55);backdrop-filter:blur(6px);z-index:60;font-family:inherit}
#shop-panel.open{display:grid}
#shop-panel .card{width:min(440px,calc(100vw - 32px));background:#15130f;color:#f3ead6;border:1px solid #3a3226;border-radius:14px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6)}
#shop-panel .hero{height:120px;display:flex;align-items:flex-end;padding:16px;background:linear-gradient(135deg,var(--c1),var(--c2))}
#shop-panel .hero h2{margin:0;font:700 26px Georgia,serif;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.4)}
#shop-panel .body{padding:16px 18px 18px}
#shop-panel .meta{font-size:13px;color:#bfb39b;line-height:1.5;margin-bottom:12px}
#shop-panel .aisles{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
#shop-panel .aisles span{font-size:12px;padding:4px 9px;border-radius:99px;background:#241f18;border:1px solid #3a3226}
#shop-panel .btn{display:block;width:100%;box-sizing:border-box;text-align:center;padding:12px;border-radius:10px;border:0;font-weight:700;font-size:15px;cursor:pointer;margin-top:8px;text-decoration:none}
#shop-panel .uber{background:#06c167;color:#04210f}
#shop-panel .roo{background:#00ccbc;color:#002b28}
#shop-panel .close{background:#2a241c;color:#f3ead6}
#shop-panel .note{font-size:11px;color:#8f846f;margin-top:10px;text-align:center}
`;

/**
 * addShop(scene, { name, address, x, z, facing, colors:[c1,c2], hours })
 * facing = heading the entrance faces (rad, 0 = north).
 */
export function addShop(scene, def) {
  const q = encodeURIComponent(`${def.name} ${def.postcode || 'Westminster London'}`);
  const shop = {
    ...def,
    uberUrl: def.uberUrl || `https://www.ubereats.com/gb/search?q=${q}`,
    deliverooUrl: def.deliverooUrl || `https://deliveroo.co.uk/search?q=${q}`,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
  // glowing entrance: sign board + door light + floor marker
  const g = new THREE.Group(); g.position.set(def.x, 0, def.z); g.rotation.y = def.facing || 0;
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d'); x.fillStyle = def.colors?.[0] || '#00539f'; x.fillRect(0, 0, 512, 96);
  x.fillStyle = '#fff'; x.font = 'bold 54px Helvetica, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(def.name, 256, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 0.25), [0, 0, 0, 0, 1, 1].map((i) => i ? new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.5 }) : new THREE.MeshStandardMaterial({ color: def.colors?.[0] || '#00539f' })));
  sign.position.set(0, 4.2, 0.2); g.add(sign);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.8), new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffe7a8', emissiveIntensity: 0.9 }));
  door.position.set(0, 1.4, 0.05); g.add(door);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 40), new THREE.MeshBasicMaterial({ color: '#06c167', transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.06, 1.8); g.add(ring);
  scene.add(g);
  shop.group = g; shop.ring = ring;
  shop.entrance = new THREE.Vector3(0, 0, 1.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
  SHOPS.push(shop);
  return shop;
}

let panel;
function ensurePanel() {
  if (panel) return panel;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  panel = document.createElement('div'); panel.id = 'shop-panel'; document.body.appendChild(panel);
  panel.addEventListener('click', (e) => { if (e.target === panel) closeShop(); });
  return panel;
}
export function isShopOpen() { return panel?.classList.contains('open'); }
export function closeShop() { panel?.classList.remove('open'); }
export function openShop(shop) {
  const p = ensurePanel();
  p.style.setProperty('--c1', shop.colors?.[0] || '#00539f'); p.style.setProperty('--c2', shop.colors?.[1] || '#ee1c2e');
  p.innerHTML = `<div class="card">
    <div class="hero"><h2>${shop.name}</h2></div>
    <div class="body">
      <div class="meta">${shop.address || ''}<br>${shop.hours || 'Open today'} · real store, real delivery</div>
      <div class="aisles">${['🥖 Bakery', '🥛 Dairy', '🍎 Fresh', '🥪 Meal deals', '🍫 Snacks', '🧃 Drinks'].map((a) => `<span>${a}</span>`).join('')}</div>
      <a class="btn uber" href="${shop.uberUrl}" target="_blank" rel="noopener">Order on Uber Eats ↗</a>
      <a class="btn roo" href="${shop.deliverooUrl}" target="_blank" rel="noopener">Order on Deliveroo ↗</a>
      <button class="btn close">Back to the street</button>
      <div class="note">Opens the delivery app in a new tab — you choose items and pay there.</div>
    </div></div>`;
  p.querySelector('.close').onclick = closeShop;
  p.classList.add('open');
}
/** Nearest shop entrance within maxDist of pos, or null. */
export function nearestShop(pos, maxDist = 3.5) {
  let best = null, bd = maxDist;
  for (const s of SHOPS) { const d = Math.hypot(pos.x - s.entrance.x, pos.z - s.entrance.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
export function updateShops(t) { for (const s of SHOPS) { s.ring.material.opacity = 0.5 + Math.sin(t * 3) * 0.3; } }
