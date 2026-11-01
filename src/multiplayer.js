import * as THREE from 'three';

const VEHICLES = new Set(['bus', 'cab', 'police', 'boat']);
const lerp = THREE.MathUtils.lerp;

function labelSprite(text, { bubble = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = bubble ? 512 : 512;
  canvas.height = bubble ? 160 : 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bubble) {
    ctx.fillStyle = 'rgba(19, 23, 28, .92)';
    ctx.beginPath();
    ctx.roundRect(12, 8, 488, 124, 28);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(230, 130); ctx.lineTo(256, 158); ctx.lineTo(280, 130); ctx.fill();
    ctx.strokeStyle = 'rgba(235,190,100,.85)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = '600 34px system-ui, sans-serif';
  } else {
    ctx.fillStyle = 'rgba(16, 20, 24, .82)';
    ctx.beginPath(); ctx.roundRect(6, 8, 500, 78, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(234,190,102,.85)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = '700 34px system-ui, sans-serif';
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = bubble ? '#fff8e9' : '#ffe1a0';
  const maxWidth = 450;
  let display = String(text || '').slice(0, bubble ? 100 : 18);
  while (display.length > 4 && ctx.measureText(display).width > maxWidth) display = `${display.slice(0, -2)}…`;
  ctx.fillText(display, 256, bubble ? 68 : 48, maxWidth);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, sizeAttenuation: true }));
  sprite.scale.set(bubble ? 3.6 : 2.5, bubble ? 1.12 : .48, 1);
  return sprite;
}

function disposeSprite(sprite) {
  if (!sprite) return;
  sprite.parent?.remove(sprite);
  sprite.material?.map?.dispose();
  sprite.material?.dispose();
}

export class Multiplayer {
  constructor(scene, { makeHuman, animateHuman, makeVehicleMesh, onChat = () => {}, onPlayers = () => {}, toast = () => {} } = {}) {
    this.scene = scene;
    this.makeHuman = makeHuman;
    this.animateHuman = animateHuman;
    this.makeVehicleMesh = makeVehicleMesh;
    this.onChat = onChat;
    this.onPlayers = onPlayers;
    this.toast = toast;
    this.remotes = new Map();
    this.id = null;
    this.socket = null;
    this.name = 'Londoner';
    this.look = {};
    this._desired = true;
    this._reconnectTimer = 0;
    this._stateClock = 0;
    this._phase = 0;
    this._chatListeners = new Set();
    this._playerListeners = new Set();
    this._lastState = null;
  }

  connect(name, look) {
    this.name = String(name || 'Londoner').slice(0, 18);
    this.look = look || {};
    this._desired = true;
    this._openSocket();
  }

  _openSocket() {
    if (!this._desired || typeof WebSocket === 'undefined') return;
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try { ws = new WebSocket(`${scheme}//${location.host}/ws`); } catch { this._scheduleReconnect(); return; }
    this.socket = ws;
    ws.addEventListener('open', () => {
      if (ws !== this.socket) return;
      ws.send(JSON.stringify({ t: 'join', name: this.name, look: this.look }));
      if (this._lastState) this._stateClock = 0;
    });
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      this._message(message);
    });
    ws.addEventListener('close', () => {
      if (ws !== this.socket) return;
      this.socket = null;
      for (const id of this.remotes.keys()) this._removeRemote(id);
      this.id = null;
      this._notifyPlayers();
      this._scheduleReconnect();
    });
    ws.addEventListener('error', () => { try { ws.close(); } catch {} });
  }

  _scheduleReconnect() {
    if (!this._desired || this._reconnectTimer) return;
    this._reconnectTimer = window.setTimeout(() => {
      this._reconnectTimer = 0;
      this._openSocket();
    }, 1800);
  }

  _message(msg) {
    if (msg.t === 'welcome') {
      this.id = msg.id;
      for (const data of msg.players || []) this._addRemote(data);
      this._notifyPlayers();
      return;
    }
    if (msg.t === 'join') {
      this._addRemote(msg.player);
      this._notifyPlayers();
      if (msg.player?.name) this.toast(`${msg.player.name} joined London`);
      return;
    }
    if (msg.t === 'leave') {
      this._removeRemote(msg.id);
      this._notifyPlayers();
      return;
    }
    if (msg.t === 'state') {
      const remote = this.remotes.get(msg.id);
      if (!remote) return;
      remote.target = { x: finite(msg.x), y: finite(msg.y), z: finite(msg.z), h: finite(msg.h), vehicle: VEHICLES.has(msg.vehicle) ? msg.vehicle : null, speed: finite(msg.anim?.speed) };
      remote.samples.push({ ...remote.target, at: performance.now() });
      if (remote.samples.length > 4) remote.samples.shift();
      return;
    }
    if (msg.t === 'chat') {
      if (msg.id === this.id) return;
      const chat = { ...msg, text: String(msg.text || '').slice(0, 200), name: String(msg.name || 'Londoner').slice(0, 18) };
      for (const remote of this.remotes.values()) if (remote.id === msg.id) this._setBubble(remote, chat.text);
      this.onChat(chat);
      for (const listener of this._chatListeners) listener(chat);
    }
  }

  _addRemote(data) {
    if (!data?.id || data.id === this.id || this.remotes.has(data.id)) return;
    let human;
    try { human = this.makeHuman?.(data.look || {}); } catch { human = null; }
    if (!human?.group) return;
    const mesh = human.group;
    this.scene.add(mesh);
    const p = { x: finite(data.x), y: finite(data.y), z: finite(data.z), h: finite(data.h), vehicle: VEHICLES.has(data.vehicle) ? data.vehicle : null, speed: finite(data.anim?.speed) };
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.h;
    const nameTag = labelSprite(data.name || 'Londoner');
    nameTag.position.set(0, 2.25, 0); mesh.add(nameTag);
    const remote = { id: data.id, name: String(data.name || 'Londoner').slice(0, 18), human, mesh, nameTag, vehicleMesh: null, vehicleKind: null,
      bubble: null, bubbleUntil: 0, target: p, samples: [{ ...p, at: performance.now() }], position: mesh.position, phase: Math.random() * Math.PI * 2 };
    this.remotes.set(remote.id, remote);
    this._setVehicle(remote, p.vehicle);
  }

  _removeRemote(id) {
    const remote = this.remotes.get(id);
    if (!remote) return;
    this.scene.remove(remote.mesh);
    if (remote.vehicleMesh) this.scene.remove(remote.vehicleMesh);
    disposeSprite(remote.bubble);
    this.remotes.delete(id);
  }

  _setVehicle(remote, kind) {
    kind = VEHICLES.has(kind) ? kind : null;
    if (kind === remote.vehicleKind) return;
    if (remote.vehicleMesh) { this.scene.remove(remote.vehicleMesh); remote.vehicleMesh = null; }
    remote.vehicleKind = kind;
    remote.mesh.visible = !kind;
    if (kind && this.makeVehicleMesh) {
      try {
        remote.vehicleMesh = this.makeVehicleMesh(kind);
        remote.vehicleMesh.position.copy(remote.mesh.position);
        remote.vehicleMesh.rotation.y = remote.mesh.rotation.y;
        this.scene.add(remote.vehicleMesh);
        if (remote.bubble) {
          remote.vehicleMesh.add(remote.bubble);
          remote.bubble.position.y = kind === 'bus' ? 5.2 : 2.5;
        }
      } catch { remote.vehicleMesh = null; remote.mesh.visible = true; }
    }
  }

  _setBubble(remote, text) {
    disposeSprite(remote.bubble);
    remote.bubble = labelSprite(text, { bubble: true });
    remote.bubble.position.set(0, remote.vehicleKind === 'bus' ? 5.2 : remote.vehicleKind ? 2.5 : 2.95, 0);
    (remote.vehicleMesh || remote.mesh).add(remote.bubble);
    remote.bubbleUntil = performance.now() + 6000;
  }

  _notifyPlayers() {
    const count = this.remotes.size + (this.id ? 1 : 0);
    this.onPlayers(count);
    for (const listener of this._playerListeners) listener(count);
  }

  sendState(player, vehicleKind = null) {
    if (!player?.position) return;
    const p = player.position;
    this._lastState = { x: finite(p.x), y: finite(p.y), z: finite(p.z), h: finite(player.heading), vehicle: VEHICLES.has(vehicleKind) ? vehicleKind : null, anim: { speed: Math.abs(finite(player.speed)) } };
  }

  _send(state) {
    if (this.socket?.readyState === WebSocket.OPEN && this.id) this.socket.send(JSON.stringify({ t: 'state', ...state }));
  }

  sendChat(text) {
    const clean = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
    if (!clean) return;
    this._sendMessage({ t: 'chat', text: clean });
    if (this.id) {
      const msg = { id: this.id, name: this.name, text: clean, ts: Date.now() };
      this.onChat(msg);
      for (const listener of this._chatListeners) listener(msg);
    }
  }

  _sendMessage(message) {
    if (this.socket?.readyState === WebSocket.OPEN && this.id) this.socket.send(JSON.stringify(message));
  }

  update(dt) {
    this._stateClock += Math.max(0, dt || 0);
    if (this._stateClock >= .1) {
      this._stateClock %= .1;
      if (this._lastState) this._send(this._lastState);
    }
    const now = performance.now();
    for (const remote of this.remotes.values()) {
      const samples = remote.samples;
      let a = samples[0], b = samples[samples.length - 1];
      if (samples.length > 1) {
        const renderAt = now - 110;
        for (let i = 1; i < samples.length; i++) if (samples[i].at >= renderAt) { a = samples[i - 1]; b = samples[i]; break; }
      }
      const f = a === b ? 1 : THREE.MathUtils.clamp((now - 110 - a.at) / Math.max(1, b.at - a.at), 0, 1);
      const target = { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f), h: a.h + Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h)) * f, speed: lerp(a.speed, b.speed, f), vehicle: b.vehicle };
      const alpha = 1 - Math.exp(-12 * Math.max(0, dt || 0));
      remote.mesh.position.x = lerp(remote.mesh.position.x, target.x, alpha);
      remote.mesh.position.y = lerp(remote.mesh.position.y, target.y, alpha);
      remote.mesh.position.z = lerp(remote.mesh.position.z, target.z, alpha);
      remote.mesh.rotation.y += Math.atan2(Math.sin(target.h - remote.mesh.rotation.y), Math.cos(target.h - remote.mesh.rotation.y)) * alpha;
      this._setVehicle(remote, target.vehicle);
      if (remote.vehicleMesh) {
        remote.vehicleMesh.position.copy(remote.mesh.position);
        remote.vehicleMesh.rotation.y = remote.mesh.rotation.y;
      }
      const walking = target.vehicle ? 0 : THREE.MathUtils.clamp(target.speed / 3.5, 0, 1);
      remote.phase += dt * (5 + Math.min(8, target.speed * 1.5));
      this.animateHuman?.(remote.human, remote.phase, walking);
      if (remote.bubble && now >= remote.bubbleUntil) { disposeSprite(remote.bubble); remote.bubble = null; }
    }
  }

  nearestRemote(pos, maxDist) {
    let nearest = null; let best = maxDist;
    for (const remote of this.remotes.values()) {
      const dx = remote.mesh.position.x - pos.x, dz = remote.mesh.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < best) { best = d; nearest = { name: remote.name, position: remote.mesh.position, distance: d, id: remote.id }; }
    }
    return nearest;
  }
}

function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

export function mountChatUI(mp) {
  const style = document.createElement('style');
  style.textContent = `
    #london-chat{position:fixed;z-index:20;left:16px;bottom:56px;width:min(280px,calc(100vw - 32px));font:500 13px/1.4 system-ui,sans-serif;color:#fff8ea;pointer-events:none}
    #london-chat *{box-sizing:border-box} #london-chat .lc-card{background:linear-gradient(145deg,rgba(17,21,25,.94),rgba(29,27,25,.88));border:1px solid rgba(238,191,102,.42);border-radius:13px;box-shadow:0 12px 38px #0008;overflow:hidden;pointer-events:auto;backdrop-filter:blur(12px)}
    #london-chat .lc-top{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #ffffff16;color:#f4d69a;font-weight:750;letter-spacing:.04em;text-transform:uppercase;font-size:11px}
    #london-chat .lc-count{color:#c8d9ca;font-weight:600;text-transform:none;letter-spacing:0} #london-chat .lc-dot{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#79d69e;box-shadow:0 0 9px #79d69e}
    #london-chat .lc-log{height:84px;overflow:auto;padding:8px 11px;display:flex;flex-direction:column;gap:5px;scrollbar-width:thin;scrollbar-color:#b28b50 transparent}
    #london-chat .lc-line{overflow-wrap:anywhere;color:#f7f0e4} #london-chat .lc-line b{color:#edc57d;margin-right:5px} #london-chat .lc-hint{color:#a9a39b;font-size:11px;padding:0 11px 7px}
    #london-chat input{width:100%;border:0;border-top:1px solid #ffffff19;background:#0e1115;color:#fff;padding:10px 12px;outline:none;font:inherit} #london-chat input::placeholder{color:#99938b} #london-chat input:focus{box-shadow:inset 0 0 0 1px #d4a75f}
    #london-chat.lc-collapsed .lc-log,#london-chat.lc-collapsed .lc-hint,#london-chat.lc-collapsed input{display:none}
  `;
  document.head.appendChild(style);
  const root = document.createElement('section');
  root.id = 'london-chat';
  root.innerHTML = `<div class="lc-card"><div class="lc-top"><span>💬 Chat · Enter</span><span class="lc-count"><i class="lc-dot"></i><span data-count>1</span> online</span></div><div class="lc-log" aria-live="polite"></div><div class="lc-hint">Enter to chat · Esc to close</div><input aria-label="Chat with Londoners" maxlength="200" placeholder="Say something to the city…" /></div>`;
  document.body.appendChild(root);
  const input = root.querySelector('input'), log = root.querySelector('.lc-log');
  const append = (msg) => {
    const line = document.createElement('div'); line.className = 'lc-line';
    const who = document.createElement('b'); who.textContent = `${msg.name || 'Londoner'}:`;
    const text = document.createElement('span'); text.textContent = String(msg.text || '').slice(0, 200);
    line.append(who, text); log.appendChild(line);
    while (log.children.length > 6) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  };
  const chatListener = (msg) => append(msg);
  mp._chatListeners?.add(() => root.classList.remove('lc-collapsed'));
  const countListener = (count) => { root.querySelector('[data-count]').textContent = String(count); };
  mp._chatListeners?.add(chatListener); mp._playerListeners?.add(countListener);
  root.querySelector('.lc-count').addEventListener('click', () => root.classList.toggle('lc-collapsed'));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { input.blur(); root.classList.add('lc-collapsed'); event.stopPropagation(); }
    else if (event.key === 'Enter') {
      const value = input.value.trim();
      if (value) { mp.sendChat(value); input.value = ''; }
      input.blur(); root.classList.remove('lc-collapsed'); event.stopPropagation();
    }
  });
  window.addEventListener('keydown', (event) => {
    const introOpen = document.querySelector('#intro') && !document.querySelector('#intro').classList.contains('hidden');
    if (event.key === 'Enter' && !introOpen && !/INPUT|TEXTAREA/.test(event.target?.tagName || '') && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '') && performance.now() - (window.__gameStartedAt || 0) > 800) {
      event.preventDefault(); root.classList.remove('lc-collapsed'); input.focus();
    }
  });
  countListener(mp.remotes.size + (mp.id ? 1 : 0));
  return root;
}
