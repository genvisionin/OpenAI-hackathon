import express from 'express';

const router = express.Router();
const MODEL = () => process.env.OPENAI_AGENT_MODEL || 'gpt-5.4-mini';
const REALTIME_MODEL = () => process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const CONTACTS = [
  { id: 'jobs', name: 'Tara', subtitle: 'Jobs Coach · London careers', emoji: '💼', voice: 'marin', persona: 'You are Tara, an encouraging, practical London jobs coach. Find real current London job listings, explain pay and location, and offer a useful next step.' },
  { id: 'travel', name: 'Leo', subtitle: 'Travel Agent · London & beyond', emoji: '🚆', voice: 'cedar', persona: 'You are Leo, a resourceful London travel agent. Find real train, flight, hotel and Eurostar options with prices and direct links. For London transport use live TfL Unified API information when useful.' },
  { id: 'estate', name: 'Priya', subtitle: 'Estate Agent · London homes', emoji: '🏡', voice: 'coral', persona: 'You are Priya, a warm, candid London estate agent. Find real rooms and flats to rent or buy in London, with prices, areas and direct listing links.' },
];
const contactFor = id => CONTACTS.find(contact => contact.id === id);
const safe = (value, max = 500) => String(value ?? '').slice(0, max);
const headers = key => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

async function openai(path, body, timeout = 50000) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('This feature needs an OpenAI API key.');
  const response = await fetch(`https://api.openai.com/v1/${path}`, { method: 'POST', headers: headers(key), body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI request failed (${response.status})`);
  return data;
}
function parseResponse(data) {
  const texts = [], annotations = [];
  for (const item of data?.output || []) for (const content of item?.content || []) {
    if (content?.type === 'output_text' || content?.type === 'text') {
      if (content.text) texts.push(content.text);
      for (const a of content.annotations || []) annotations.push(a);
    }
  }
  let text = data?.output_text || texts.join('\n'), cards = [];
  text = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (block, body) => {
    if (!/"cards"\s*:/.test(body)) return block;
    try { const parsed = JSON.parse(body.trim()); if (Array.isArray(parsed.cards)) cards = parsed.cards; return ''; } catch { return ''; }
  }).trim();
  if (!cards.length) cards = annotations.map(a => ({ title: a.title || a.url_citation?.title || 'Open source', subtitle: 'Live web result', url: a.url || a.url_citation?.url, meta: '' }));
  cards = cards.filter(c => /^https?:\/\//i.test(String(c?.url || ''))).slice(0, 5).map(c => ({ title: safe(c.title || 'Open result', 120), subtitle: safe(c.subtitle, 180), url: safe(c.url, 1000), meta: safe(c.meta, 100) }));
  return { summary: text || 'I found some useful options.', reply: text || 'I found some useful options.', cards };
}
async function tflContext(query) {
  const text = safe(query, 700), parts = [];
  const get = async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`TfL API ${response.status}`);
    return data;
  };
  if (/tube|underground|line|status|delay|disruption|elizabeth|overground|dlr/i.test(text)) {
    try {
      const lines = await get('https://api.tfl.gov.uk/Line/Mode/tube,elizabeth-line,dlr,overground/Status');
      parts.push(`Live TfL Unified API line status: ${JSON.stringify(lines).slice(0, 7000)}`);
    } catch { parts.push('TfL live line status is temporarily unavailable.'); }
  }
  const match = text.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:[?.!,]|$)/i) || text.match(/\bbetween\s+(.+?)\s+and\s+(.+?)(?:[?.!,]|$)/i);
  if (match) {
    try {
      const route = await get(`https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(match[1].trim())}/to/${encodeURIComponent(match[2].trim())}`);
      parts.push(`Live TfL Unified API journeys: ${JSON.stringify((route.journeys || []).slice(0, 3).map(j => ({ duration: j.duration, arrivalDateTime: j.arrivalDateTime, legs: (j.legs || []).map(l => ({ mode: l.mode?.name, from: l.departurePoint?.commonName, to: l.arrivalPoint?.commonName, instruction: l.instruction?.summary })) }))).slice(0, 7000)}`);
    } catch { parts.push('The TfL journey planner is temporarily unavailable.'); }
  }
  return parts.join('\n');
}
function instructions(contact, ctx = {}, extra = '') {
  return `${contact.persona} The player is ${safe(ctx.playerName || 'Alex', 40)} in London. Write like a text message: plain text, max 3 short sentences, NO markdown (no asterisks, no bullet lists, no links or URLs in the text — the result cards carry the links). Use web_search for current options; never invent listings, prices, availability or links. Return a short conversational answer followed by a fenced JSON block: {"cards":[{"title":"...","subtitle":"area, provider or route","url":"https://...","meta":"price or useful detail"}]}. ${extra}`;
}

router.get('/contacts', (_req, res) => res.json({ contacts: CONTACTS.map(({ id, name, subtitle, emoji, persona }) => ({ id, name, subtitle, emoji, persona })) }));
router.post('/chat', async (req, res) => {
  const contact = contactFor(req.body?.contactId);
  if (!contact) return res.status(400).json({ error: 'Unknown contact' });
  if (!process.env.OPENAI_API_KEY) return res.json({ reply: `Hi, I'm ${contact.name}. Tell me what you need and I’ll find current London options for you.`, cards: [] });
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-16).map(m => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: safe(m?.content, 1200) })) : [];
    const liveTfL = contact.id === 'travel' ? await tflContext(messages.at(-1)?.content || '') : '';
    const data = await openai('responses', { model: MODEL(), instructions: instructions(contact, req.body?.ctx, `Give practical options that fit the player’s request. ${liveTfL}`), input: messages.length ? messages : 'Say hello and ask what they need.', tools: [{ type: 'web_search' }] });
    res.json(parseResponse(data));
  } catch (error) { res.json({ reply: `Sorry, my live search is unavailable just now. ${safe(error.message, 180)}`, cards: [] }); }
});

router.post('/realtime', async (req, res) => {
  const contact = contactFor(req.body?.contactId);
  if (!contact) return res.status(400).json({ error: 'Unknown contact' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Voice calling needs an OpenAI API key.' });
  const session = { type: 'realtime', model: REALTIME_MODEL(), instructions: `${contact.persona} Speak briefly; when the user asks for real options call the web_search tool, then summarise the top results out loud.`, audio: { input: { transcription: { model: 'gpt-4o-mini-transcribe' }, turn_detection: { type: 'server_vad' } }, output: { voice: contact.voice } }, tools: [{ type: 'function', name: 'web_search', description: 'Search the live web for real listings/options', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }] };
  try { const data = await openai('realtime/client_secrets', { session }); res.json({ value: data.value, model: REALTIME_MODEL() }); }
  catch (error) { res.status(502).json({ error: safe(error.message, 300) }); }
});

router.post('/search', async (req, res) => {
  const contact = contactFor(req.body?.contactId);
  if (!contact) return res.status(400).json({ error: 'Unknown contact' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Live search needs an OpenAI API key.' });
  try {
    const query = safe(req.body?.query, 600);
    const liveTfL = contact.id === 'travel' ? await tflContext(query) : '';
    const data = await openai('responses', { model: MODEL(), instructions: instructions(contact, {}, `Answer this specific search query. Include a concise summary and useful direct links. ${liveTfL}`), input: query, tools: [{ type: 'web_search' }] });
    res.json(parseResponse(data));
  } catch (error) { res.status(502).json({ error: safe(error.message, 300) }); }
});

router.post('/task', async (req, res) => {
  const contact = contactFor(req.body?.contactId);
  if (!contact) return res.status(400).json({ error: 'Unknown contact' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Background tasks need an OpenAI API key.' });
  const task = safe(req.body?.task, 1600);
  if (!task.trim()) return res.status(400).json({ error: 'Write a task first.' });
  try {
    const data = await openai('responses', { model: MODEL(), background: true, store: true, instructions: instructions(contact, req.body?.ctx, 'Complete the requested task end-to-end. Return a short report and JSON cards block.'), input: task, tools: [{ type: 'web_search' }] });
    res.json({ taskId: data.id });
  } catch (error) { res.status(502).json({ error: safe(error.message, 300) }); }
});
router.get('/task/:id', async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: 'Background task polling needs an OpenAI API key.' });
  try {
    const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(req.params.id)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `OpenAI request failed (${response.status})`);
    const parsed = parseResponse(data);
    res.json({ status: data.status, reply: parsed.reply, cards: parsed.cards });
  } catch (error) { res.status(502).json({ error: safe(error.message, 300) }); }
});

export default router;
