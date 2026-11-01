# London Lives — build contract (READ FULLY BEFORE CODING)

Hackathon demo: a GTA-style 3D browser game set in a ~1km area around Big Ben, Westminster, London.
Walk around, drive a red double-decker bus / black cab / police car, race a speedboat on the Thames
under Westminster Bridge, and TALK (voice via OpenAI Realtime API, or text) to AI characters.
Take "gigs" (missions) from characters, earn money/XP, level up, and age (+1 year per gig).

Stack: Vite + three@0.170 (ES modules, `import * as THREE from 'three'`, addons via `three/addons/...`),
Node express server (`server.js`, port 8787, Vite proxies `/api`). No other npm deps allowed
(already installed: three, express, dotenv, vite, concurrently). No external asset files: everything
procedural (BoxGeometry etc. + CanvasTexture). Must run with no OpenAI key (fallback lines).

Each worker owns ONLY its listed files. Do not create or edit other files. Code against the exact
exports below. Keep code clean, working, no TODO stubs.

## Coordinates & world facts (shared constants, exported from src/world.js)
- Metres. +x = east, -z = north, y up. Ground y=0.
- Heading convention: object `rotation.y = h`; forward vector = (-sin h, 0, -cos h). h=0 faces north.
  All vehicle/human meshes are modelled with their FRONT toward -z.
- WORLD bounds: x -420..540, z -520..520.
- RIVER Thames: x 80..280 (full z). Water surface y = WATER_Y = -6. Walkable land: west x<78.5, east x>281.5,
  except Westminster Bridge deck: x 80..280, z -12..12, deck top at y=0 (walkable/drivable where |z|<11.5).
- Bridge piers (block boats): boxes centred x = 110, 150, 190, 230, 260, 5m wide in x, z -13..13, under the deck.
  Clearance under deck: water y -6 to deck bottom y -2.
- Westminster Pier pontoon: x 80..96, z -60..-32 (blocks boats). Boarding spot on land: (76, -46).
- ROADS (axis-aligned, centre line + width w):
  1. Bridge St/Westminster Bridge: (-420,0)->(540,0) w20   2. Parliament St/Whitehall: (-10,-520)->(-10,0) w18
  3. Abingdon St: (-10,0)->(-10,520) w16                    4. Victoria Embankment: (65,-520)->(65,0) w16
  5. East bank York Rd: (330,-520)->(330,520) w18           6. Horse Guards Ave: (-420,-250)->(65,-250) w14
  7. Great Smith St: (-420,250)->(-10,250) w14              8. West road: (-200,-520)->(-200,520) w14
  UK traffic drives on the LEFT.
- Landmarks: Big Ben (Elizabeth Tower) centred (55, 22), 12x12 shaft, ~96m + spire, clock faces show live London time.
  Palace of Westminster x 22..74, z 36..330, h~24, Victoria Tower (45,318) ~100m. Parliament Square grass x -150..-25, z 12..100.
  Westminster Abbey x -150..-60, z 130..230. London Eye centre (302,-110), radius 62, hub y 70, wheel in YZ plane, rotating.
  County Hall x 345..435, z -155..-15. St Thomas' Hospital x 345..435, z 20..300. Other cells filled with procedural London buildings.

## src/world.js  (exports)
```js
export const WORLD, RIVER, BRIDGE, WATER_Y, ROADS;           // ROADS: [{x1,z1,x2,z2,w,name}]
export function buildWorld(scene, renderer) -> {
  colliders,       // [{minX,maxX,minZ,maxZ}] land obstacles (buildings, towers, statues, phone boxes, Eye legs)
  boatColliders,   // [{minX,maxX,minZ,maxZ}] piers + pontoon
  sun,             // THREE.DirectionalLight (castShadow, shadow camera ±120; main.js moves it to follow player)
  update(dt, t),   // animate water normal scroll, London Eye rotation, Big Ben clock hands
}
export function landBlocked(x, z, r=0) -> bool   // true if outside WORLD or in river and not on bridge (|z|<11.5)
export function waterBlocked(x, z, r=0) -> bool  // true if outside river x 82..278 or |z|>510
export function resolveCircle(pos /*Vector3*/, r, colliders) -> bool // push pos.x/z out of boxes; true if hit
```
buildWorld also sets scene.background/sky (three/addons/objects/Sky.js, golden-hour sun), scene.environment
(PMREM of sky), scene.fog, hemisphere light. Use merged geometries (BufferGeometryUtils.mergeGeometries) for filler buildings.

## src/human.js
```js
export function makeHuman(look) -> { group, legL, legR, armL, armR, head }
// look: {shirt, pants, skin, hair, hat: null|'police'|'captain'|'cap'|'tophat'|'cowboy'|'beanie'}; ~1.8m tall, front -z
export function animateHuman(h, phase, amount)  // walk cycle; amount 0 = idle pose
```
## src/vehicles.js
```js
export const VEHICLE_SPECS = { bus:{...}, cab:{...}, police:{...}, boat:{...} } // maxSpeed, accel, brake, turn, grip, circles:[zOffsets], radius, camDist, camHeight, label
export function makeVehicleMesh(kind, opts) -> THREE.Group  // kinds: 'bus' (red Routemaster-style double-decker, "11" sign),
   // 'cab' (black London taxi, yellow TAXI light), 'police' (white, blue/yellow battenburg, flashing light bar), 'boat' (speedboat), 'car' (opts.color, traffic)
export class Vehicle {
  constructor(kind, scene, x, z, heading)
  kind, mesh, position /*= mesh.position*/, heading, speed, siren(bool)
  update(dt, input /*{forward,back,left,right,handbrake}*/, world /*{colliders,boatColliders,landBlocked,waterBlocked,resolveCircle}*/, t)
     // arcade physics with drift (velocity heading lags heading by grip), body roll, wheel spin,
     // boat bobs at WATER_Y with wake particles; collisions revert/bounce; police lights flash when siren
  idle(dt, t)   // when not driven: bob boat / flash lights
}
```
## src/audio.js
```js
export class GameAudio { start(); setEngine(kind|null, speed); setSiren(on); chime(); toggleMute() -> bool }  // WebAudio synth only
```
## src/npcData.js (also imported by server.js in Node — no DOM usage!)
```js
export const NPCS = [{ id, name, role, emoji, pos:[x,z], face /*heading*/, voice /*realtime voice: alloy|ash|ballad|coral|echo|sage|shimmer|verse|marin|cedar*/,
   look, persona, fallback:[lines], mission /*id or null*/ }]
export const MISSIONS = { [id]: { id, title, giver, vehicle:'bus'|'cab'|'police'|'boat', minLevel, time, reward, desc,
   points:[[x,z]], names:[label per point], mustStop:bool, water:bool } }
export function buildInstructions(npc, ctx /*{playerName, age, level, money, londonTime, history:[{who,text}]}*/) -> string
```
Required NPCs (positions are safe): maggie flower seller (38,-13.5); pc_davies Met officer, hat 'police' (8,60) mission 'patrol';
kev bus driver (-23,-75) mission 'bus11'; rosie boat captain, hat 'captain' (76,-45) mission 'boatRace'; jamal busker on bridge (160,-10.8);
priya coffee-cart barista (-40,18); hank Texan tourist, hat 'cowboy' (-90,55); lord_pemberton eccentric peer, hat 'tophat' (-45,128);
dot black-cab driver (-120,-13.5) mission 'cabFare'. Rich, funny, distinct personas that know real Westminster.
Missions: bus11 (bus, stops [[-10,-150],[-110,-250],[-200,-80],[-60,0],[40,0]], mustStop, time 180, reward 180),
cabFare (cab, [[-200,150],[330,-110]] pickup->London Eye drop, mustStop, 120s, 140),
boatRace (boat, water, [[180,-140],[170,0],[180,140],[200,260],[120,200],[130,0],[110,-110]], 100s, 250),
patrol (police, minLevel 2, [[330,-250],[-150,250],[-10,-450]], 150s, 320).

## server.js
- `GET /api/status` -> {hasKey}
- `POST /api/chat` {npcId, ctx, messages:[{role:'user'|'assistant',content}]} -> {reply}  (Chat Completions, model env OPENAI_TEXT_MODEL default gpt-4.1-mini; fallback random line if no key/error)
- `POST /api/realtime/session` {npcId, ctx} -> {value /*ephemeral key*/, model}
  via POST https://api.openai.com/v1/realtime/client_secrets body
  {session:{type:'realtime', model, instructions, audio:{input:{transcription:{model:'gpt-4o-mini-transcribe'}, turn_detection:{type:'server_vad'}}, output:{voice}}}}
  model env OPENAI_REALTIME_MODEL default gpt-realtime. 400 {error} if no key.

## src/talk.js
```js
export class Talk {
  constructor({ getCtx /*()=>ctx*/, onAcceptMission /*(missionId)=>void*/, onClose })
  open(npc /*NPCS entry*/)  // fills #talk panel, shows history, "Accept gig" button if npc.mission
  close(); isOpen()
}
```
Voice: WebRTC to `https://api.openai.com/v1/realtime/calls?model=...` with ephemeral key (SDP, Content-Type application/sdp),
mic track, remote audio element, data channel 'oai-events'; send `response.create` on open so NPC greets;
append transcripts (events `response.output_audio_transcript.done` / `response.audio_transcript.done` for NPC,
`conversation.item.input_audio_transcription.completed` for user). Text: POST /api/chat. Per-NPC history kept in memory.
DOM ids (in index.html): #talk, #talk-emoji, #talk-name, #talk-role, #talk-log, #talk-input, #talk-send, #talk-mic, #talk-accept, #talk-close.

## src/npcs.js, src/traffic.js, src/missions.js
```js
export function spawnNPCs(scene) -> { list:[{data, human, position}], update(dt, playerPos, t), nearest(pos, maxDist) -> entry|null }
   // mission givers get a floating "★ Name — Role" sprite tag; others "Name — Role". Face the player when near.
   // + ~24 ambient pedestrians wandering Parliament Square, bridge pavements, embankment (x 73..78), east promenade (x 284..318).
export class Traffic { constructor(scene, ROADS); update(dt, obstacles /*[{position, radius}]*/); cars /*[{position, radius}]*/ }
   // ~18 cars + 2 buses (use makeVehicleMesh), left-hand lanes, wrap at road ends, slow/stop if obstacle ahead.
export class Missions {
  constructor(scene, { onComplete(mission), onFail(mission), onMessage(text) })
  start(missionId, player /*{level}*/) -> {ok, reason}
  update(dt, ctx /*{vehicleKind|null, position, speed}*/)   // timer runs only when in the right vehicle
  active /*null or {def, index, timeLeft, started}*/; target() -> [x,z]|null; objectiveText()
}  // markers: glowing translucent beam + ring (water: big vertical torus); bus/cab stops require speed<2.5 inside 9m.
```
## index.html, src/style.css, src/hud.js, src/main.js (integrator)
Intro screen "LONDON LIVES" (name input, 3 outfit swatches, Start). HUD: money/age/level/XP bar/role (top-left),
mission panel with timer (top-right), interaction prompt (bottom-centre), toasts, speedometer, minimap canvas (bottom-right,
north-up, roads/river/landmarks/NPCs/target), help line. Talk panel markup with the ids above. Stylish, London-themed (red/black/gold).
main.js: renderer (ACES tone mapping, shadows), camera follow with mouse-drag orbit + wheel zoom, walk (WASD, Shift sprint),
E enter/exit nearest vehicle (bus (-10,-80) h0, cab (-120,-4) h -PI/2, police (-10,70) h0, boat (104,-46) h0 boarded from (76,-46)),
T talk, Space handbrake, H siren, M mute. Player state {name, money:50, xp:0, age:21, level = 1+floor(xp/300)}.
Mission complete: +money, +xp, +1 age, toast "You're now 22". Shadow camera follows player. Arrow above player pointing at target.
