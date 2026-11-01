import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { NPCS, MISSIONS, buildInstructions } from './src/npcData.js';

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 8787;
const API_KEY = process.env.OPENAI_API_KEY;
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini';
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare';
const portraitCache = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

// Optional ad router is authored independently; keep the core server bootable without it.
try {
  const adsModule = await import('./server/ads.js');
  const adsRouter = adsModule.default || adsModule.router;
  if (adsRouter) app.use('/api/ads', adsRouter);
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') console.warn('[ads] router unavailable:', error.message);
}
for (const [mount, file] of [['/api/news', './server/news.js'], ['/api/transit', './server/transit.js']]) {
  try { const m = await import(file); if (m.default) app.use(mount, m.default); } catch (error) { console.warn(`[${mount}] unavailable:`, error.message); }
}
// AI phone contacts (Jobs Coach, GOV.UK Helper, TfL, Flat Finder, Mum).
try {
  const phoneModule = await import('./server/phone.js');
  if (phoneModule.default) app.use('/api/phone', phoneModule.default);
} catch (error) {
  console.warn('[phone] router unavailable:', error.message);
}

const getNpc = (id) => NPCS.find((npc) => npc.id === id);
const safeMessages = (messages) => (Array.isArray(messages) ? messages : [])
  .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
  .slice(-12)
  .map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));

function fallbackReply(npc, messages) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')?.content?.toLowerCase() || '';
  if (/gig|job|mission|work|earn/.test(lastUser) && npc.mission) {
    return `${npc.fallback[Math.floor(Math.random() * npc.fallback.length)]} I do have a gig for you if you fancy it.`;
  }
  return npc.fallback[Math.floor(Math.random() * npc.fallback.length)];
}

async function openAIImage({ prompt, imageDataUrl, size = '1024x1024' }) {
  if (!API_KEY) throw new Error('Image generation needs an OpenAI API key.');
  const editing = Boolean(imageDataUrl);
  const endpoint = editing ? 'https://api.openai.com/v1/images/edits' : 'https://api.openai.com/v1/images/generations';
  const common = { model: IMAGE_MODEL, prompt, size, quality: 'medium', n: 1 };
  let body;
  let headers = { Authorization: `Bearer ${API_KEY}` };
  if (editing) {
    const { mime, bytes } = decodeDataUrl(imageDataUrl);
    const form = new FormData();
    for (const [key, value] of Object.entries(common)) form.append(key, String(value));
    form.append('image', new Blob([bytes], { type: mime }), `source.${mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`);
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(common);
  }
  const response = await fetch(endpoint, { method: 'POST', headers, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Image service returned ${response.status}.`);
  const base64 = data.data?.[0]?.b64_json;
  if (!base64) throw new Error('Image service did not return image data.');
  return `data:image/png;base64,${base64}`;
}

function decodeDataUrl(value) {
  if (typeof value !== 'string' || value.length > 24 * 1024 * 1024) throw new Error('Image must be a valid image data URL under 24 MB.');
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error('Please provide a PNG, JPEG, or WebP image data URL.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) throw new Error('The supplied image is empty.');
  return { mime: match[1], bytes };
}

function asyncRoute(handler) {
  return async (req, res) => {
    try { await handler(req, res); }
    catch (error) {
      console.error('[image] request failed:', error.message);
      res.status(400).json({ error: error.message || 'Could not create the image. Please try again.' });
    }
  };
}

app.get('/api/status', (_req, res) => res.json({ hasKey: Boolean(API_KEY) }));

app.post('/api/chat', async (req, res) => {
  const npc = getNpc(req.body?.npcId);
  if (!npc) return res.status(400).json({ error: 'Unknown character.' });
  const messages = safeMessages(req.body?.messages);
  if (!messages.some((message) => message.role === 'user')) return res.status(400).json({ error: 'Send a message to start the conversation.' });
  if (!API_KEY) return res.json({ reply: fallbackReply(npc, messages), fallback: true });
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TEXT_MODEL, temperature: 0.9, max_tokens: 180,
        messages: [{ role: 'system', content: buildInstructions(npc, req.body?.ctx || {}) }, ...messages] }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || `OpenAI returned ${response.status}`);
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('OpenAI returned an empty reply');
    return res.json({ reply });
  } catch (error) {
    console.error('[chat] OpenAI request failed:', error.message);
    return res.json({ reply: fallbackReply(npc, messages), fallback: true });
  }
});

app.post('/api/realtime/session', async (req, res) => {
  const npc = getNpc(req.body?.npcId);
  if (!npc) return res.status(400).json({ error: 'Unknown character.' });
  if (!API_KEY) return res.status(400).json({ error: 'Voice chat needs an OpenAI API key. Text chat still works.' });
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST', headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: { type: 'realtime', model: REALTIME_MODEL,
        instructions: buildInstructions(npc, req.body?.ctx || {}),
        audio: { input: { transcription: { model: 'gpt-4o-mini-transcribe' }, turn_detection: { type: 'server_vad' } }, output: { voice: npc.voice } } } }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(400).json({ error: data.error?.message || `OpenAI returned ${response.status}` });
    const value = data.value || data.client_secret?.value;
    if (!value) return res.status(400).json({ error: 'OpenAI did not return an ephemeral session key.' });
    return res.json({ value, model: REALTIME_MODEL });
  } catch (error) {
    console.error('[realtime] OpenAI request failed:', error.message);
    return res.status(400).json({ error: 'Could not start voice chat. Please try again.' });
  }
});

app.post('/api/image/portrait', asyncRoute(async (req, res) => {
  const npc = getNpc(req.body?.npcId);
  if (!npc) return res.status(400).json({ error: 'Unknown character.' });
  if (portraitCache.has(npc.id)) return res.json({ dataUrl: portraitCache.get(npc.id) });
  const look = Object.entries(npc.look || {}).map(([key, value]) => `${key}: ${value || 'none'}`).join(', ');
  const dataUrl = await openAIImage({ prompt: `Create a polished hand-painted character portrait for a warm, witty London life game. Show ${npc.name}, a ${npc.role}. Persona: ${npc.persona} Appearance palette and clothing: ${look}. Bust portrait, expressive and recognizable, elegant vintage London illustrated book style, rich brush texture, soft warm golden-hour light, lovely detailed Westminster street background, no text, no lettering, square composition.`, size: '1024x1024' });
  portraitCache.set(npc.id, dataUrl);
  res.json({ dataUrl });
}));

app.post('/api/image/postcard', asyncRoute(async (req, res) => {
  const caption = String(req.body?.caption || 'Greetings from Westminster').slice(0, 140);
  const dataUrl = await openAIImage({ imageDataUrl: req.body?.imageDataUrl,
    prompt: `Transform the supplied in-game screenshot into a beautiful vintage illustrated London travel postcard. Preserve recognizable scene composition and Westminster landmarks, but reinterpret them as a richly painted mid-century travel illustration with cream paper, subtle aged print texture, tasteful red and navy accents, and elegant hand-lettered caption exactly reading: “${caption}”. Keep all lettering legible and inside the image; do not add other words or brands.`, size: '1536x1024' });
  res.json({ dataUrl });
}));

app.post('/api/image/newspaper', asyncRoute(async (req, res) => {
  const headline = String(req.body?.headline || 'A Westminster Day to Remember').slice(0, 180);
  const story = String(req.body?.story || 'A local newcomer made waves around Westminster.').slice(0, 900);
  const playerName = String(req.body?.playerName || 'The Player').slice(0, 60);
  const imageDataUrl = req.body?.imageDataUrl;
  const prompt = `Design a striking, fictional British tabloid front page for “The Westminster Gazette” (invented newspaper; do not use or imitate any real newspaper brand). Main headline, lettered exactly: “${headline}”. Byline/story text should identify ${playerName} and summarize: ${story}. About the player's latest London gig, playful celebratory tone, bold classic red masthead with the exact title The Westminster Gazette, vintage newsprint paper, striking illustrated central image of a London street or Thames scene, columns and small decorative details, typography arranged like a real front page, all words tasteful and readable. No other real publications or logos.`;
  const dataUrl = await openAIImage({ prompt, ...(imageDataUrl ? { imageDataUrl } : {}), size: '1024x1024' });
  res.json({ dataUrl });
}));

app.post('/api/image/comic', asyncRoute(async (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 8).map((event) => String(event).slice(0, 180)) : [];
  if (!events.length) return res.status(400).json({ error: 'Add at least one gig moment to illustrate.' });
  const playerName = String(req.body?.playerName || 'The Player').slice(0, 60);
  const dataUrl = await openAIImage({ prompt: `Create a charming four-panel comic strip titled “A Day in London Lives”, starring ${playerName} in a lively, playful fictional adventure around Westminster, London. Exactly four clearly separated panels, consistent character design throughout, vibrant ink-and-watercolor graphic novel style, accurate Big Ben, Westminster Bridge and Thames details as appropriate. Depict these moments in order: ${events.join(' | ')}. Include short legible speech bubbles or captions inspired by those events, tasteful London humor. Keep title and panel gutters clear, no real brand marks.`, size: '1536x1024' });
  res.json({ dataUrl });
}));

// A single process serves the production build and the realtime room.
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, 'dist');
try {
  const fs = await import('node:fs/promises');
  await fs.access(distDir);
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} catch { /* Development is served by Vite. */ }

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const rooms = new Map();
const cleanText = (value, limit, fallback = '') => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) || fallback;
const safeLook = (look) => {
  if (!look || typeof look !== 'object') return {};
  const allowed = ['shirt', 'pants', 'skin', 'hair', 'hat'];
  return Object.fromEntries(allowed.filter((key) => typeof look[key] === 'string' || typeof look[key] === 'number')
    .map((key) => [key, typeof look[key] === 'string' ? look[key].slice(0, 32) : look[key]]));
};
function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
function broadcast(room, message, except = null) {
  for (const player of room.values()) if (player.ws !== except) send(player.ws, message);
}
wss.on('connection', (ws, req) => {
  const roomName = cleanText(new URL(req.url, 'http://localhost').searchParams.get('room'), 48, 'london');
  if (!rooms.has(roomName)) rooms.set(roomName, new Map());
  const room = rooms.get(roomName);
  const id = randomUUID().slice(0, 12);
  const player = { id, ws, name: 'Londoner', look: {}, x: 0, y: 0, z: 0, h: 0, vehicle: null, anim: { speed: 0 }, lastStateAt: 0, alive: true };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'join') {
      if (player.joined) return;
      player.name = cleanText(msg.name, 18, 'Londoner');
      player.look = safeLook(msg.look);
      player.joined = true;
      const players = [...room.values()].filter((p) => p.joined).map(({ id: pid, name, look, x, y, z, h, vehicle, anim }) => ({ id: pid, name, look, x, y, z, h, vehicle, anim }));
      send(ws, { t: 'welcome', id, players });
      room.set(id, player);
      broadcast(room, { t: 'join', player: { id, name: player.name, look: player.look, x: 0, y: 0, z: 0, h: 0, vehicle: null, anim: { speed: 0 } } }, ws);
      return;
    }
    if (!player.joined) return;
    if (msg.t.startsWith('race:')) {
      broadcast(room, { ...msg, from: id, name: player.name, ts: Date.now() });
    } else if (msg.t === 'state') {
      const now = Date.now();
      if (now - player.lastStateAt < 90) return;
      const finite = (v, fallback) => Number.isFinite(Number(v)) ? Math.max(-10000, Math.min(10000, Number(v))) : fallback;
      player.x = finite(msg.x, player.x); player.y = finite(msg.y, player.y); player.z = finite(msg.z, player.z); player.h = finite(msg.h, player.h);
      player.vehicle = ['bus', 'cab', 'police', 'boat'].includes(msg.vehicle) ? msg.vehicle : null;
      player.anim = { speed: Math.max(0, Math.min(60, finite(msg.anim?.speed, 0))) };
      player.lastStateAt = now;
      broadcast(room, { t: 'state', id, x: player.x, y: player.y, z: player.z, h: player.h, vehicle: player.vehicle, anim: player.anim }, ws);
    } else if (msg.t === 'chat') {
      const text = cleanText(msg.text, 200);
      if (text) broadcast(room, { t: 'chat', id, name: player.name, text, ts: Date.now() });
    }
  });
  ws.on('close', () => {
    if (!player.joined) return;
    room.delete(id);
    broadcast(room, { t: 'leave', id });
    if (room.size === 0) rooms.delete(roomName);
  });
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  const status = error.status || 400;
  res.status(status).json({ error: status === 413 ? 'Request is too large. Please use an image under 24 MB.' : (error.message || 'Request could not be processed.') });
});

server.listen(PORT, () => console.log(`London Lives API listening on http://localhost:${PORT}${API_KEY ? '' : ' (no OpenAI key; text fallback enabled)'}`));
