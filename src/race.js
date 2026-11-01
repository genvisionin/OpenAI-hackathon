import * as THREE from 'three';

const PIER = { x: 56, z: -60 };
// Clear loop: pier → under the WEST arch → south turn buoy → back under the EAST arch → north turn buoy → FINISH at the pier gantry.
const COURSE = [[140, -17], [150, 110], [175, 225], [250, 110], [252, -15], [235, -230], [112, -95]];
const GATE_NAMES = ['Westminster Bridge · west arch', 'Lambeth reach', 'South turn buoy', 'Albert Embankment', 'Westminster Bridge · east arch', 'North turn buoy', 'FINISH · Westminster Pier'];
const GATE_RADIUS = 14;
const SLOTS = [[95, -70], [95, -55], [110, -70], [110, -55], [125, -70], [125, -55]];
const ownId = (mp) => mp?.id || 'solo';
const distance = (a, b) => Math.hypot(a.x - b[0], a.z - b[1]);
const AI_NAMES = ['The Harrier', 'River Rocket', 'Thames Typhoon', 'Big Ben Bullet'];
const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export class BoatRace {
  constructor(scene, { mp, Vehicle, physicsWorld, hud, getPlayer, enterBoat, exitBoat, onState }) {
    this.scene = scene; this.mp = mp; this.Vehicle = Vehicle; this.physicsWorld = physicsWorld;
    this.hud = hud || {}; this.getPlayer = getPlayer || (() => null); this.enterBoat = enterBoat || (() => {});
    this.exitBoat = exitBoat || (() => {}); this.onState = onState || (() => {});
    this.ready = new Map(); this.progress = new Map(); this.localReady = false; this.readyClock = 0; this.phase = 'Lobby';
    this.countdownStart = 0; this.startAt = 0; this.racers = []; this.boats = new Map(); this.ai = [];
    this.cp = 0; this.raceStartedAt = 0; this.firstFinisherAt = 0; this.finished = new Map();
    this.finishUntil = 0; this.overlayUntil = 0; this.lastProgressSend = 0; this.status = 'Open lobby';
    this.aiRemote = new Map(); this.aiBroadcastAt = 0; this.wrongWayTime = 0; this._lastCPDistance = null; this._countBeeped = -1;
    this.guidePoints = [[SLOTS[0][0], SLOTS[0][1]], ...COURSE.map(p => [...p])];
    // R = reset the boat to the last gate (if you get wedged on a pier or wall)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyR' || this.phase !== 'Racing' || !this.localBoat || /INPUT|TEXTAREA/.test(e.target?.tagName || '')) return;
      const prev = this.cp > 0 ? COURSE[this.cp - 1] : SLOTS[0], next = COURSE[Math.min(this.cp, COURSE.length - 1)];
      const b = this.localBoat; b.position.x = prev[0] + (next[0] - prev[0]) * 0.15; b.position.z = prev[1] + (next[1] - prev[1]) * 0.15;
      b.heading = Math.atan2(-(next[0] - b.position.x), -(next[1] - b.position.z)); b.speed = 0; b._velocity?.set?.(0, 0); b.mesh.rotation.y = b.heading;
      this.hud?.toast?.('Boat reset to your last gate', 1500);
    });
    this._buildLobby(); this._buildRings(); this._buildGuide(); this._buildDressing(); this._buildUI(); this._buildRaceFX();
    this._socket = null;
    this._messageHandler = (event) => { try { this._receive(JSON.parse(event.data)); } catch {} };
    this._attachSocket();
  }

  _attachSocket() {
    if (this._socket === this.mp?.socket) return;
    if (this._socket) this._socket.removeEventListener?.('message', this._messageHandler);
    this._socket = this.mp?.socket || null;
    this._socket?.addEventListener?.('message', this._messageHandler);
  }

  _send(t, data = {}) {
    const socket = this.mp?.socket;
    if (socket?.readyState === 1) socket.send(JSON.stringify({ t, ...data }));
  }

  _buildLobby() {
    const g = new THREE.Group(); g.position.set(PIER.x, 0.06, PIER.z); this.lobby = g;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshBasicMaterial({ color: 0x2ccebb, transparent: true, opacity: .13, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, .12, 10, 72), new THREE.MeshBasicMaterial({ color: 0x66ffe4, transparent: true, opacity: .9 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .08; g.add(ring); this.lobbyRing = ring;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(3.55, .035, 6, 72), new THREE.MeshBasicMaterial({ color: 0xffcf77, transparent: true, opacity: .55 }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = .09; g.add(halo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.035, .42, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x51e8db, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 7; g.add(beam);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 14, 8), new THREE.MeshBasicMaterial({ color: 0x98fff0, transparent: true, opacity: .48 })); core.position.y = 7; g.add(core);
    const light = new THREE.PointLight(0x42f2dc, 32, 16, 2); light.position.y = 2.8; g.add(light);
    this.label = this._sprite('THAMES SPRINT  ·  STAND HERE'); this.label.position.set(0, 9.1, 0); this.label.scale.set(8, 1.35, 1); g.add(this.label);
    this.scene.add(g);
  }

  _sprite(text) {
    const c = document.createElement('canvas'); c.width = 768; c.height = 128;
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(9,20,27,.86)'; x.beginPath(); x.roundRect(5, 5, 758, 118, 32); x.fill();
    x.strokeStyle = 'rgba(110,255,226,.72)'; x.lineWidth = 4; x.stroke();
    x.font = '800 34px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ddfff7'; x.fillText(text, 384, 65);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: true }));
  }

  _buildRings() {
    this.rings = COURSE.map(([x, z], i) => {
      const g = new THREE.Group(); g.position.set(x, -1.1, z); this.scene.add(g);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6, .32, 12, 56), new THREE.MeshStandardMaterial({ color: 0x9de9ed, emissive: 0x2c929a, emissiveIntensity: .55, metalness: .5, roughness: .25, transparent: true, opacity: .3 }));
      const prev = COURSE[Math.max(0, i - 1)], next = COURSE[Math.min(COURSE.length - 1, i + 1)];
      ring.rotation.y = Math.atan2(-(next[0] - prev[0]), -(next[1] - prev[1])); g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.06, .42, 12, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff9b45, transparent: true, opacity: .15, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 2; g.add(beam);
      const glow = new THREE.PointLight(0xff923e, 0, 20, 2); glow.position.y = 2; g.add(glow);
      return { group: g, ring, beam, glow };
    });
  }

  _buildUI() {
    const style = document.createElement('style');
    style.textContent = `
      #thames-race-ui{position:fixed;z-index:48;inset:0;pointer-events:none;font:600 13px/1.35 system-ui,sans-serif;color:#f6f2e8}
      #thames-race-panel{position:absolute;top:18px;left:50%;transform:translateX(-50%);width:min(410px,calc(100vw - 28px));padding:13px 16px 12px;border:1px solid #f4c97866;border-radius:14px;background:linear-gradient(135deg,#101c22ed,#182226e8);box-shadow:0 12px 42px #0008;backdrop-filter:blur(12px);display:none}
      .tr-head{display:flex;justify-content:space-between;align-items:center;color:#ffda91;letter-spacing:.12em;font-size:10px;text-transform:uppercase}.tr-title{font-size:19px;letter-spacing:.01em;color:#fff7e7;margin:2px 0 8px}.tr-metrics{display:flex;gap:18px;color:#bac9c7;font-size:12px}.tr-metrics b{color:#fff}.tr-list{display:grid;grid-template-columns:1fr auto;gap:3px 12px;margin-top:8px;padding-top:8px;border-top:1px solid #fff2;color:#d9e3df;font-size:11px}.tr-list span:last-child{text-align:right;color:#ffd28b}
      #thames-race-count{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;text-shadow:0 6px 30px #000; font-weight:900;font-size:min(21vw,150px);color:#ffe3a0;letter-spacing:-.07em}
      .tr-lights{display:flex;justify-content:center;gap:16px;margin:0 0 14px}.tr-light{width:26px;height:26px;border-radius:50%;background:#311b19;border:2px solid #ffffff55;box-shadow:inset 0 0 8px #000}.tr-light.on{background:#ff3d30;box-shadow:0 0 22px #ff3828}.tr-light.go{background:#49ff8a;box-shadow:0 0 26px #49ff8a}
      #thames-wrong{position:absolute;top:27%;left:50%;transform:translateX(-50%);color:#ff564b;font-weight:900;letter-spacing:.2em;font-size:18px;text-shadow:0 2px 14px #000;display:none}
      #thames-speedlines{position:absolute;inset:0;opacity:0;background:radial-gradient(transparent 55%,#d9f8ff66);box-shadow:inset 0 0 100px 30px #d8f7ff66;transition:opacity .2s}
      #thames-race-count small{display:block;font-size:14px;letter-spacing:.28em;color:#fff8e9;text-shadow:none;text-transform:uppercase}
      #thames-race-board{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#071116a8;pointer-events:auto;backdrop-filter:blur(8px)}
      .tr-card{width:min(470px,calc(100vw - 32px));padding:25px;border:1px solid #f0c77477;border-radius:20px;background:linear-gradient(150deg,#17252b,#10171c);box-shadow:0 25px 90px #000b;text-align:center}.tr-card h2{margin:0;color:#ffdb96;font-size:28px}.tr-card p{margin:5px 0 18px;color:#b8c9c6}.tr-results{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;text-align:left;margin:10px 0 20px}.tr-results span{padding:9px 10px;border-bottom:1px solid #fff1}.tr-results .winner{color:#ffdc8d}.tr-card button{border:0;border-radius:999px;background:linear-gradient(110deg,#ffcc72,#e99a50);padding:12px 20px;color:#251c11;font:800 13px system-ui;cursor:pointer;box-shadow:0 7px 24px #e99a5050}
      @media(max-width:600px){#thames-race-panel{top:8px;padding:10px 12px}.tr-list{font-size:10px}.tr-title{font-size:16px}}
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div'); this.root.id = 'thames-race-ui';
    this.root.innerHTML = `<div id="thames-speedlines"></div><div id="thames-wrong">↶ WRONG WAY</div><section id="thames-race-panel"><div class="tr-head"><span>THAMES SPRINT</span><span data-status>OPEN LOBBY</span></div><div class="tr-title">Thames Sprint · Lap 1</div><div class="tr-metrics"><span>Position <b data-place>—</b></span><span>Checkpoint <b data-cp>—</b></span><span>Time <b data-time>0:00.0</b></span></div><div class="tr-list" data-list></div></section><div id="thames-race-count"><div><div class="tr-lights"><i class="tr-light"></i><i class="tr-light"></i><i class="tr-light"></i></div><small>Thames Sprint</small><span data-count>5</span></div></div><div id="thames-race-board"><section class="tr-card"><h2>Race results</h2><p>Thames Sprint · Westminster</p><div class="tr-results" data-results></div><button type="button">Back to the pier</button></section></div>`;
    document.body.appendChild(this.root);
    this.panel = this.root.querySelector('#thames-race-panel'); this.countEl = this.root.querySelector('#thames-race-count'); this.board = this.root.querySelector('#thames-race-board');
    this.root.querySelector('button').addEventListener('click', () => this._reset());
  }

  _buildGuide() {
    const pts = this.guidePoints.map(([x,z]) => new THREE.Vector3(x, -5.85, z));
    this.guideCurve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', .18);
    this.guideMeshes = [];
    const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=64;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#e7f4f3';ctx.fillRect(0,0,256,64);ctx.fillStyle='#ff8b36';
    for(let x=-32;x<288;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+38,32);ctx.lineTo(x,64);ctx.lineTo(x+20,64);ctx.lineTo(x+58,32);ctx.lineTo(x+20,0);ctx.fill();}
    this.guideTexture=new THREE.CanvasTexture(canvas);this.guideTexture.wrapS=this.guideTexture.wrapT=THREE.RepeatWrapping;this.guideTexture.repeat.set(1,1);this.guideTexture.colorSpace=THREE.SRGBColorSpace;
    const n=COURSE.length, samples=200;
    for(let seg=0;seg<n;seg++){
      const verts=[],uv=[],ids=[]; const start=Math.floor(seg*samples/n),end=Math.floor((seg+1)*samples/n);
      for(let i=start;i<=end;i++){const u=i/samples,p=this.guideCurve.getPoint(u),tan=this.guideCurve.getTangent(u),nx=-tan.z,nz=tan.x;verts.push(p.x+nx*1.5,p.y,p.z+nz*1.5,p.x-nx*1.5,p.y,p.z-nz*1.5);uv.push(0,u*42,1,u*42);if(i<end){const k=(i-start)*2;ids.push(k,k+1,k+2,k+1,k+3,k+2);}}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ids);geo.computeVertexNormals();
      const mat=new THREE.MeshBasicMaterial({map:this.guideTexture,transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});const mesh=new THREE.Mesh(geo,mat);mesh.renderOrder=2;this.scene.add(mesh);this.guideMeshes.push(mesh);
    }
  }

  _buildDressing() {
    this.buoys=[];
    const buoyGeo=new THREE.CylinderGeometry(.48,.62,1.05,12);const red=new THREE.MeshStandardMaterial({color:0xe64134,roughness:.45}),white=new THREE.MeshStandardMaterial({color:0xf7f1df,roughness:.4});
    COURSE.forEach(([x,z],i)=>{const prev=COURSE[Math.max(0,i-1)],next=COURSE[Math.min(COURSE.length-1,i+1)],dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz)||1,nx=dz/len,nz=-dx/len;for(const side of [-1,1]){const b=new THREE.Group();b.position.set(x+nx*7*side,-5.4,z+nz*7*side);const m=new THREE.Mesh(buoyGeo,side<0?red:white);b.add(m);const band=new THREE.Mesh(new THREE.CylinderGeometry(.51,.58,.2,12),side<0?white:red);band.position.y=.05;b.add(band);this.scene.add(b);this.buoys.push(b);}});
    this.gantry=new THREE.Group();this.gantry.position.set(110,-5.5,-83);for(const x of [-16,16]){const post=new THREE.Mesh(new THREE.BoxGeometry(.7,7,.7),new THREE.MeshStandardMaterial({color:0xd8d6c7,metalness:.3}));post.position.set(x,3.5,0);this.gantry.add(post);}const banner=new THREE.Mesh(new THREE.BoxGeometry(32,2.1,.5),new THREE.MeshBasicMaterial({map:this._bannerTexture()}));banner.position.y=6.4;this.gantry.add(banner);const strip=new THREE.Mesh(new THREE.BoxGeometry(32,.08,2),new THREE.MeshBasicMaterial({map:this._checkerTexture()}));strip.position.set(0,.03,0);this.gantry.add(strip);this.scene.add(this.gantry);
    const arch=new THREE.Group();arch.position.set(...[COURSE[COURSE.length-1][0],-5.5,COURSE[COURSE.length-1][1]]);for(const x of [-8,8]){const post=new THREE.Mesh(new THREE.BoxGeometry(.4,8,.4),new THREE.MeshStandardMaterial({color:0xffe7bb}));post.position.set(x,4,0);arch.add(post);}const top=new THREE.Mesh(new THREE.BoxGeometry(16,.7,.6),new THREE.MeshBasicMaterial({map:this._checkerTexture()}));top.position.y=8;arch.add(top);this.scene.add(arch);this.finishArch=arch;
  }
  _bannerTexture(){const c=document.createElement('canvas');c.width=1024;c.height=96;const x=c.getContext('2d');x.fillStyle='#102027';x.fillRect(0,0,1024,96);x.fillStyle='#e7a35b';x.font='900 54px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('THAMES SPRINT',512,49);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
  _checkerTexture(){const c=document.createElement('canvas');c.width=128;c.height=128;const x=c.getContext('2d');for(let y=0;y<8;y++)for(let a=0;a<8;a++){x.fillStyle=(a+y)%2?'#f6f0df':'#171b1c';x.fillRect(a*16,y*16,16,16);}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
  _buildRaceFX(){this.wake=[];this.spray=[];for(let i=0;i<36;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(.35,.9),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));m.visible=false;this.scene.add(m);this.wake.push({mesh:m,life:0});}for(let i=0;i<24;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.12,0),new THREE.MeshBasicMaterial({color:0xd8f7ff,transparent:true,opacity:.75}));m.visible=false;this.scene.add(m);this.spray.push({mesh:m,life:0,vel:new THREE.Vector3()});}}
  _beep(freq=440){try{const C=window.AudioContext||window.webkitAudioContext;if(!this._audio)this._audio=new C();const o=this._audio.createOscillator(),g=this._audio.createGain();o.frequency.value=freq;g.gain.setValueAtTime(.08,this._audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,this._audio.currentTime+.16);o.connect(g);g.connect(this._audio.destination);o.start();o.stop(this._audio.currentTime+.17);}catch{}}

  get eventInfo() {
    const players = this.phase === 'Lobby' ? this._visibleReady().length : this.racers.length;
    const status=this.phase==='Racing'?'Racing':this.phase==='Countdown'?`Countdown ${Math.max(0,Math.ceil((this.startAt-Date.now())/1000))}s`:this.phase==='Finished'?'Finished':'Open lobby';
    return { id: 'thames-race', title: 'Thames Sprint', subtitle: 'Nine checkpoints · two passes under Westminster Bridge', where: 'Westminster Pier, under Westminster Bridge', status, players: players+this.ai.length, location: [PIER.x, PIER.z] };
  }
  isRacing() { return ['Countdown', 'Racing', 'Finished'].includes(this.phase); }

  _receive(msg) {
    if (!msg?.t?.startsWith('race:')) return;
    const id = msg.from || (msg.name === this.mp?.name ? ownId(this.mp) : null);
    if (msg.t === 'race:ready' && id) this.ready.set(id, { name: msg.name || this._nameFor(id), seen: Date.now() });
    else if (msg.t === 'race:unready' && id) this.ready.delete(id);
    else if (msg.t === 'race:start' && Array.isArray(msg.racers)) this._start(msg);
    else if (msg.t === 'race:progress' && id) this.progress.set(id, { cp: Math.max(0, Math.min(COURSE.length, Number(msg.cp) || 0)), time: Number(msg.time) || 0, name: msg.name || this._nameFor(id), seen: Date.now() });
    else if (msg.t === 'race:finish' && id) this._finishRemote(id, Number(msg.time) || 0, msg.name || this._nameFor(id));
    else if(msg.t==='race:ai'&&Array.isArray(msg.boats)) this._receiveAI(msg.boats);
  }
  _receiveAI(boats){for(const b of boats){if(!b?.id)continue;let a=this.aiRemote.get(b.id);if(!a){const boat=new this.Vehicle('boat',this.scene,b.x,b.z,b.h||0);a={id:b.id,name:b.name||AI_NAMES[0],boat,target:null,cp:0};this.aiRemote.set(b.id,a);}a.target={x:b.x,z:b.z,h:b.h||0,speed:b.speed||0,cp:b.cp||0,at:performance.now()};a.name=b.name||a.name;this.progress.set(b.id,{cp:a.target.cp,time:0,name:a.name,seen:Date.now()});if(a.target.cp>=COURSE.length&&!this.finished.has(b.id)){a.finished=true;this.finished.set(b.id,{id:b.id,name:a.name,time:Infinity});this.firstFinisherAt ||= Date.now();this._maybeResults();}}}

  _nameFor(id) { return id === ownId(this.mp) ? (this.mp?.name || 'You') : (this.mp?.remotes?.get(id)?.name || 'Racer'); }
  _visibleReady() {
    const now = Date.now();
    for (const [id, entry] of this.ready) {
      if (now - entry.seen > 6200 || (id !== ownId(this.mp) && !this.mp?.remotes?.has(id))) this.ready.delete(id);
    }
    if (this.localReady) this.ready.set(ownId(this.mp), { name: this.mp?.name || 'You', seen: now });
    return [...this.ready.entries()].map(([id, v]) => ({ id, ...v }));
  }

  _host() { return this._visibleReady().map((p) => p.id).sort()[0] || ownId(this.mp); }

  _start(msg) {
    if (this.phase === 'Countdown' || this.phase === 'Racing' || this.phase === 'Finished') return;
    this.racers = msg.racers.slice(0, 5); if (!this.racers.length) return;
    this.phase = 'Countdown'; this.status = 'Countdown 5s'; this.startAt = Number(msg.startAt) || Date.now() + 5000;
    this.localReady = false; this.ready.clear(); this.countdownStart = 0;
    this.progress.clear(); this.finished.clear(); this.cp = 0; this.onState('Thames Sprint: countdown');
    for (const id of this.racers) this.progress.set(id, { cp: 0, time: 0, name: this._nameFor(id), seen: Date.now() });
    const local = ownId(this.mp), index = this.racers.indexOf(local);
    if (index < 0) return;
    const [x, z] = SLOTS[index % SLOTS.length];
    const boat = new this.Vehicle('boat', this.scene, x, z, Math.PI);
    this.boats.set(local, boat); this.localBoat = boat;
    this._boatUpdate = boat.update;
    boat.update = (dt, _input, _world, t) => {
      if (this.phase === 'Countdown') { boat.speed = 0; boat._velocity?.set(0, 0); boat.idle(dt, t); return false; }
      return this._boatUpdate.call(boat, dt, _input, _world, t);
    };
    this.enterBoat(boat);
    this.isRaceHost = this.racers[0] === ownId(this.mp); if(this.isRaceHost)this._spawnAI(Math.max(0,5-this.racers.length));
    this.panel.style.display = 'block'; this.board.style.display = 'none';
    this.raceStartedAt = this.startAt + 5000;
  }

  _spawnAI(count=4) {
    for (let i = 0; i < count; i++) {
      const [x, z] = SLOTS[(this.racers.length+i) % SLOTS.length]; const boat = new this.Vehicle('boat', this.scene, x, z, Math.PI);
      this.ai.push({ id: `ai-${i + 1}`, name: AI_NAMES[i%AI_NAMES.length], boat, cp: 0, variance: [-.22,.1,.34,-.08][i%4], time: 0, finished: false, wobble:i*2.1 });
    }
  }

  _go() {
    this.phase = 'Racing'; this.status = 'Racing'; this.raceStartedAt = Date.now();
    if (this.localBoat && this._boatUpdate) this.localBoat.update = this._boatUpdate;
    this.onState('Thames Sprint: GO!'); this._renderCount('GO');
    setTimeout(() => { if (this.phase === 'Racing') this.countEl.style.display = 'none'; }, 900);
  }

  _renderCount(value) { this.countEl.querySelector('[data-count]').textContent = value; this.countEl.style.display = 'flex'; }

  _sendProgress() {
    const time = Math.max(0, (Date.now() - this.raceStartedAt) / 1000);
    this._send('race:progress', { cp: this.cp, time });
    this.progress.set(ownId(this.mp), { cp: this.cp, time, name: this.mp?.name || 'You', seen: Date.now() });
  }

  _finishLocal() {
    if (this.finished.has(ownId(this.mp))) return;
    const time = Math.max(0, (Date.now() - this.raceStartedAt) / 1000);
    this.finished.set(ownId(this.mp), { id: ownId(this.mp), name: this.mp?.name || 'You', time });
    this._send('race:finish', { time }); this.firstFinisherAt ||= Date.now(); this.status = 'Racing';
    const place = 1 + [...this.finished.values()].filter((f) => f.id !== ownId(this.mp) && f.time <= time).length;
    this._renderCount(`FINISHED · ${ordinal(place)}`); setTimeout(() => this._renderCount(''), 2600);
    if (this.localBoat) { this.localBoat.speed = 0; this._boatUpdate && (this.localBoat.update = (dt, i, w, t) => { this.localBoat.speed *= 0.9; this.localBoat.idle(dt, t); return false; }); }
    if (this.arrow) this.arrow.visible = false; if (this.gateLabel) this.gateLabel.style.display = 'none';
    this.onState('Thames Sprint: finished');
    setTimeout(() => this._showResults(), 2500);
  }

  _finishRemote(id, time, name) {
    if (this.finished.has(id)) return;
    this.finished.set(id, { id, name, time }); this.firstFinisherAt ||= Date.now(); this._maybeResults();
  }

  _maybeResults() {
    const eligible = this.racers.length + this.ai.length;
    if ((eligible && this.finished.size >= eligible) || (this.firstFinisherAt && Date.now() - this.firstFinisherAt >= 90000)) this._showResults();
  }

  _showResults() {
    if (this.overlayUntil) return;
    const rows = [...this.finished.values()];
    for (const p of [...this.progress.entries()]) if (!this.finished.has(p[0])) rows.push({ id: p[0], name: p[1].name, time: p[1].time || Infinity });
    for (const ai of this.ai) if (!ai.finished && !rows.some((r) => r.id === ai.id)) rows.push({ id: ai.id, name: ai.name, time: Infinity });
    rows.sort((a, b) => a.time - b.time);
    const target = this.root.querySelector('[data-results]'); target.innerHTML = '';
    rows.forEach((r, i) => {
      const place = document.createElement('span'), name = document.createElement('span'), time = document.createElement('span');
      place.textContent = i === 0 ? '🏆' : ordinal(i + 1); name.textContent = r.name;
      time.textContent = Number.isFinite(r.time) ? `${r.time.toFixed(1)}s` : 'racing…'; if (i === 0) name.className = 'winner';
      target.append(place, name, time);
    });
    this.phase = 'Finished'; this.status = 'Finished'; this.board.style.display = 'flex'; this.overlayUntil = Date.now() + 10000;
    this.onState('Thames Sprint: results');
    setTimeout(() => { if (this.phase === 'Finished' && Date.now() >= this.overlayUntil) this._reset(); }, 10000);
  }

  _reset() {
    const wasDriving = !!this.localBoat; if (this.arrow) this.arrow.visible = false; if (this.gateLabel) this.gateLabel.style.display = 'none';
    if (wasDriving) this.exitBoat();
    if (this.localBoat) { if (this._boatUpdate) this.localBoat.update = this._boatUpdate; this.scene.remove(this.localBoat.mesh); this.localBoat = null; this._boatUpdate = null; }
    for (const ai of this.ai) this.scene.remove(ai.boat.mesh);
    this.ai = []; for(const a of this.aiRemote.values())this.scene.remove(a.boat.mesh);this.aiRemote.clear();for(const w of this.wake||[])this.scene.remove(w.mesh);for(const s of this.spray||[])this.scene.remove(s.mesh);this.wake=[];this.spray=[];this.boats.clear(); this.exitBoat(); this.panel.style.display = 'none'; this.board.style.display = 'none'; this.countEl.style.display = 'none';
    this.phase = 'Lobby'; this.status = 'Open lobby'; this.localReady = false; this.ready.clear(); this.progress.clear(); this.finished.clear();
    this.countdownStart = 0; this.firstFinisherAt = 0; this.overlayUntil = 0;this.isRaceHost=false;this._lastCPDistance=null;this.wrongWayTime=0; this.onState('Thames Sprint: open lobby');
  }

  _updateAI(dt, t) {
    for (const ai of this.ai) {
      if (ai.finished) { ai.boat.idle(dt, t); continue; }
      ai.time += dt; const [tx, tz] = COURSE[Math.min(ai.cp, COURSE.length - 1)];const nxt=COURSE[Math.min(ai.cp+1,COURSE.length-1)],look=ai.cp<COURSE.length-1?.27:0;
      const desired = Math.atan2(-((tx+(nxt[0]-tx)*look)-ai.boat.position.x),-((tz+(nxt[1]-tz)*look)-ai.boat.position.z));
      const delta = Math.atan2(Math.sin(desired - ai.boat.heading), Math.cos(desired - ai.boat.heading));
      const steer = delta + Math.sin(t * 1.7 + ai.wobble) * 0.02;
      const sharp = Math.abs(delta) > 0.9;
      ai.boat.update(dt, { forward: true, back: sharp && Math.abs(ai.boat.speed) > 14, left: steer > 0.04, right: steer < -0.04 }, this.physicsWorld, t);
      const cap = 31 * (0.80 + ai.variance * 0.35); // each rival has its own top speed (some beat a casual player)
      if (ai.boat.speed > cap) ai.boat.speed = cap;
      // unstick: if a rival is pinned against a wall/pier, nudge it back toward its line
      ai.stuck = Math.abs(ai.boat.speed) < 3 ? (ai.stuck || 0) + dt : 0;
      if (ai.stuck > 1.5) { ai.boat.position.x += Math.sin(-desired) * -4 * -1; ai.boat.position.z += -Math.cos(desired) * 4; ai.boat.heading = desired; ai.boat.speed = 8; ai.stuck = 0; }
      if (distance(ai.boat.position, COURSE[ai.cp]) < GATE_RADIUS) {
        ai.cp++; this.progress.set(ai.id, { cp: ai.cp, time: ai.time, name: ai.name, seen: Date.now() });
        if (ai.cp >= COURSE.length) { ai.finished = true; this.finished.set(ai.id, { id: ai.id, name: ai.name, time: ai.time }); this.firstFinisherAt ||= Date.now(); }
      }
    }
  }

  _updateHUD(now) {
    const entries = [...this.progress.entries()].filter(([id]) => this.racers.includes(id) || id.startsWith('ai-'));
    if (!entries.some(([id]) => id === ownId(this.mp))) entries.push([ownId(this.mp), { cp: this.cp, time: (now - this.raceStartedAt) / 1000, name: this.mp?.name || 'You' }]);
    entries.sort((a, b) => b[1].cp - a[1].cp || a[1].time - b[1].time);
    const place = Math.max(0, entries.findIndex(([id]) => id === ownId(this.mp)));
    this.root.querySelector('[data-place]').textContent = `${ordinal(place + 1)} / ${Math.max(entries.length, this.racers.length + this.ai.length)}`;
    this.root.querySelector('[data-cp]').textContent = `${Math.min(this.cp + 1, COURSE.length)} / ${COURSE.length}`;
    const elapsed = Math.max(0, (now - this.raceStartedAt) / 1000);
    this.root.querySelector('[data-time]').textContent = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}.${Math.floor(elapsed % 1 * 10)}`;
    const list = this.root.querySelector('[data-list]'); list.innerHTML = '';
    entries.forEach(([id, p]) => { const a = document.createElement('span'), b = document.createElement('span'); a.textContent = `${ordinal(entries.findIndex((x) => x[0] === id) + 1)}  ${p.name}`; b.textContent = `${Math.min(p.cp, COURSE.length)}/${COURSE.length}`; list.append(a, b); });
  }

  update(dt, t) {
    this._attachSocket(); const now = Date.now();
    const p = this.getPlayer()?.position;
    const canJoin = p && !this.isRacing() && !this.getPlayer()?.vehicle && !this.getPlayer()?.vehicleKind;
    const standing = Boolean(canJoin && Math.hypot(p.x - PIER.x, p.z - PIER.z) <= 4);
    if (standing && !this.localReady) { this.localReady = true; this.readyClock = 2; this._send('race:ready'); this.ready.set(ownId(this.mp), { name: this.mp?.name || 'You', seen: now }); }
    else if (!standing && this.localReady) { this.localReady = false; this._send('race:unready'); this.ready.delete(ownId(this.mp)); }
    if (this.localReady) { this.readyClock += dt; if (this.readyClock >= 2) { this.readyClock %= 2; this._send('race:ready'); this.ready.set(ownId(this.mp), { name: this.mp?.name || 'You', seen: now }); } }
    const ready = this._visibleReady();
    if (this.racers.length) for (const id of this.racers) {
      if (id !== ownId(this.mp) && !this.mp?.remotes?.has(id) && !this.finished.has(id)) {
        this.finished.set(id, { id, name: this._nameFor(id), time: Infinity });
      }
    }
    const host = this._host();
    this._ready = ready; this._hostId = host;
    if (this.phase === 'Lobby') { this.status = ready.length ? `Lobby · ${ready.length} waiting` : 'Open lobby'; this._renderLobby(ready, host); }
    else if (this.lobbyPanel) this.lobbyPanel.style.display = 'none';
    if (this.phase === 'Countdown') {
      const n = Math.ceil((this.startAt - now) / 1000);
      this.status = `Countdown ${Math.max(0, n)}s`;
      if (n > 0) {this._renderCount(String(n));if(n<=3&&n!==this._countBeeped){this._countBeeped=n;this._beep(320+n*70);}const lights=[...this.root.querySelectorAll('.tr-light')];lights.forEach((l,i)=>{l.classList.toggle('on',i>=3-n);l.classList.remove('go');});} else if (this.phase === 'Countdown') {this._beep(880);this.root.querySelectorAll('.tr-light').forEach(l=>{l.classList.remove('on');l.classList.add('go');});this._go();}
    }
    this.lobbyRing.material.opacity = .55 + .35 * (Math.sin(t * 2.4) + 1) / 2;
    this.lobby.scale.setScalar(1 + .025 * Math.sin(t * 2.4));
    this.rings.forEach((r, i) => {
      const active = this.phase === 'Racing' && i === this.cp;
      const passed = this.phase === 'Racing' && i < this.cp;
      r.group.visible = this.phase === 'Racing' ? (i === this.cp || i === this.cp + 1) : (this.phase === 'Countdown' && i === 0);
      r.ring.material.opacity = active ? .98 : .26;
      r.ring.material.color.set(active ? 0xffa340 : 0xa8e8ed);
      r.ring.material.emissive.set(active ? 0xff5b13 : 0x24777c);
      r.ring.material.emissiveIntensity = active ? 1.9 : .45;
      r.beam.material.opacity = active ? .4 + .18 * Math.sin(t * 4) : .1;
      r.glow.intensity = active ? 28 : 0;
    });
    this.guideTexture.offset.x=(this.guideTexture.offset.x+dt*.42)%1;
    this.guideMeshes.forEach((m,i)=>{const racing=this.phase==='Racing';const o=racing?(i===this.cp?.75:i===this.cp+1?.2:0):(this.phase==='Countdown'?(i===0?.7:0):0);m.material.opacity=o;m.visible=o>0;});
    this.buoys.forEach((b,i)=>{b.position.y=-5.4+Math.sin(t*1.8+i*.7)*.16;});
    for(const a of this.aiRemote.values())if(a.target){const boat=a.boat,blend=1-Math.exp(-dt*8);boat.position.x=THREE.MathUtils.lerp(boat.position.x,a.target.x,blend);boat.position.z=THREE.MathUtils.lerp(boat.position.z,a.target.z,blend);boat.heading+=Math.atan2(Math.sin(a.target.h-boat.heading),Math.cos(a.target.h-boat.heading))*blend;boat.speed=THREE.MathUtils.lerp(boat.speed,a.target.speed,blend);boat.idle(dt,t);}
    if (this.phase === 'Racing') {
      if (this.localBoat) {
        this.localBoat.speed = this.localBoat.speed;
        if (distance(this.localBoat.position, COURSE[this.cp]) < GATE_RADIUS) {
          this.cp++; this._sendProgress(); this._beep(this.cp >= COURSE.length ? 880 : 620);
          if (this.cp >= COURSE.length) this._finishLocal(); else this.hud?.toast?.(`Gate ${this.cp}/${COURSE.length} ✓ — next: ${GATE_NAMES[this.cp]}`, 1800);
        }
        this._updateArrow(t);
      }
      if(this.isRaceHost){this._updateAI(dt,t);if(now-this.aiBroadcastAt>100){this.aiBroadcastAt=now;this._send('race:ai',{boats:this.ai.map(a=>({id:a.id,name:a.name,x:a.boat.position.x,z:a.boat.position.z,h:a.boat.heading,speed:a.boat.speed,cp:a.cp}))});}}
      this._updateEffects(dt,t); this._wrongWay(dt); this._updateHUD(now); this._maybeResults();
    }
    if (this.phase === 'Racing') this.status = this.finished.has(ownId(this.mp)) ? 'Finished' : 'Racing';
    if (this.phase === 'Finished') this.status = 'Finished';
    this.onState(this.status);
  }

  /** Lobby card: shows who's standing in the circle; the host presses Start race when everyone is in. */
  _renderLobby(ready, host) {
    if (!this.lobbyPanel) {
      const el = document.createElement('div'); el.id = 'thames-lobby';
      el.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:32;width:340px;padding:16px 18px;border-radius:16px;background:rgba(14,22,27,.92);border:1px solid #f0c77466;color:#f5ead6;font:500 14px system-ui;box-shadow:0 20px 50px rgba(0,0,0,.45);display:none';
      el.innerHTML = '<div style="font:800 12px system-ui;letter-spacing:.16em;color:#ffb35c">THAMES SPRINT · LOBBY</div><div data-sub style="margin:6px 0 10px;color:#c9bca3;font-size:13px"></div><div data-list style="display:grid;gap:6px;margin-bottom:12px"></div><button data-start style="width:100%;padding:11px;border:0;border-radius:10px;background:#ff8b36;color:#1b0f05;font:800 15px system-ui;cursor:pointer">▶ Start race</button><div data-wait style="text-align:center;color:#c9bca3;font-size:13px"></div><div style="margin-top:8px;text-align:center;color:#8d8270;font-size:12px">Empty spots are filled by AI rivals · 5 boats</div>';
      el.querySelector('[data-start]').onclick = () => { if (this._hostId !== ownId(this.mp) || this.phase !== 'Lobby') return; const racers = this._ready.map((r) => r.id).sort(); const now = Date.now(); this._send('race:start', { startAt: now + 5000, racers }); this._start({ startAt: now + 5000, racers }); };
      document.body.appendChild(el); this.lobbyPanel = el;
    }
    const el = this.lobbyPanel, me = ownId(this.mp), inside = this.localReady;
    el.style.display = inside ? 'block' : 'none'; if (!inside) return;
    el.querySelector('[data-sub]').textContent = ready.length > 1 ? `${ready.length} racers in the circle` : 'Waiting for friends to join the circle…';
    el.querySelector('[data-list]').innerHTML = ready.map((r) => `<div style="display:flex;justify-content:space-between;padding:7px 10px;border-radius:8px;background:#ffffff0d"><span>🚤 ${String(r.name || 'Racer').replace(/</g, '')}${r.id === me ? ' (you)' : ''}</span><span style="color:#ffb35c">${r.id === host ? 'HOST' : 'ready'}</span></div>`).join('');
    const isHost = host === me;
    el.querySelector('[data-start]').style.display = isHost ? 'block' : 'none';
    el.querySelector('[data-wait]').textContent = isHost ? '' : `Waiting for ${(ready.find((r) => r.id === host)?.name) || 'the host'} to start…`;
  }

  _updateArrow(t) {
    const b = this.localBoat; if (!b || this.cp >= COURSE.length) return;
    if (!this.arrow) {
      const g = new THREE.Group();
      const head = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 4), new THREE.MeshBasicMaterial({ color: 0xffa340 }));
      head.rotation.x = -Math.PI / 2; head.position.z = -1.2; g.add(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 1.8), new THREE.MeshBasicMaterial({ color: 0xffa340 })); tail.position.z = 0.6; g.add(tail);
      this.scene.add(g); this.arrow = g;
      this.gateLabel = document.createElement('div');
      this.gateLabel.style.cssText = 'position:fixed;left:50%;top:132px;transform:translateX(-50%);z-index:31;padding:8px 16px;border-radius:999px;background:rgba(16,23,28,.82);color:#ffd59a;font:700 15px system-ui;letter-spacing:.04em;border:1px solid #ffa34066;pointer-events:none';
      document.body.appendChild(this.gateLabel);
    }
    const [tx, tz] = COURSE[this.cp];
    this.arrow.visible = true; this.arrow.position.set(b.position.x, -1.2 + Math.sin(t * 4) * 0.25, b.position.z);
    this.arrow.rotation.y = Math.atan2(-(tx - b.position.x), -(tz - b.position.z));
    const d = Math.round(distance(b.position, COURSE[this.cp]));
    const last = this.cp === COURSE.length - 1;
    this.gateLabel.style.display = 'block';
    this.gateLabel.textContent = (last ? `🏁 FINISH · ${d} m` : `GATE ${this.cp + 1}/${COURSE.length} · ${GATE_NAMES[this.cp]} · ${d} m`) + '   ·   R = reset';
  }

  _wrongWay(dt){const boat=this.localBoat;if(!boat||this.cp>=COURSE.length)return;const d=distance(boat.position,COURSE[this.cp]);if(this._lastCPDistance!==null&&d>this._lastCPDistance+.025&&Math.abs(boat.speed)>.8)this.wrongWayTime+=dt;else this.wrongWayTime=Math.max(0,this.wrongWayTime-dt*2);this._lastCPDistance=d;this.root.querySelector('#thames-wrong').style.display=this.wrongWayTime>2?'block':'none';}
  _updateEffects(dt,t){const b=this.localBoat;if(!b)return;const f=new THREE.Vector3(-Math.sin(b.heading),0,-Math.cos(b.heading)),stern=b.position.clone().addScaledVector(f,-2);for(const w of this.wake){w.life-=dt;if(w.life<=0&&Math.abs(b.speed)>1&&Math.random()<.45){w.life=.9+Math.random()*.5;w.mesh.position.set(stern.x+(Math.random()-.5)*.7,-5.72,stern.z+(Math.random()-.5)*.7);w.mesh.rotation.set(-Math.PI/2,0,b.heading);w.mesh.material.opacity=.38;}if(w.life>0){w.mesh.visible=true;w.mesh.material.opacity=Math.min(.45,w.life*.5);w.mesh.scale.setScalar(1.2-w.life*.4);}else w.mesh.visible=false;}
    const rate=THREE.MathUtils.clamp(Math.abs(b.speed)/5,0,1);for(const s of this.spray){s.life-=dt;if(s.life<=0&&Math.random()<rate*.55){s.life=.35+Math.random()*.3;s.mesh.position.set(b.position.x+f.x*2+(Math.random()-.5)*1.3,-5.55,b.position.z+f.z*2+(Math.random()-.5)*1.3);s.vel.set((Math.random()-.5)*1.5,.8+Math.random()*1.5,(Math.random()-.5)*1.5);}if(s.life>0){s.mesh.visible=true;s.mesh.position.addScaledVector(s.vel,dt);s.mesh.material.opacity=Math.min(.8,s.life*2);}else s.mesh.visible=false;}
    const spec=this.Vehicle?.SPECS?.boat;const max=spec?.maxSpeed||24;this.root.querySelector('#thames-speedlines').style.opacity=Math.abs(b.speed)>max*.8?String(Math.min(.9,(Math.abs(b.speed)/max-.8)*3)):'0';}
}
