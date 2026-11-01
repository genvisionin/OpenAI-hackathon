// Today's real news → a beautiful front page of "The Westminster Gazette" (fictional masthead).
// 1) Responses API + web_search pulls today's top stories. 2) GPT Image 2.5 designs the page.
// Generated once per day and cached in public/news/<date>.png + .json.
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

const router = express.Router();
const DIR = path.resolve('public/news');
let pending = null;

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()); // YYYY-MM-DD
const prettyDate = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

async function openai(pathname, body) {
  const res = await fetch(`https://api.openai.com/v1/${pathname}`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  return data;
}

function firstJson(text) { // first balanced {...} block, string-aware
  const start = text.indexOf('{'); if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

async function fetchHeadlines() {
  const data = await openai('responses', {
    model: process.env.OPENAI_NEWS_MODEL || 'gpt-5.4',
    tools: [{ type: 'web_search' }],
    input: `Today is ${prettyDate()}. Search the web (e.g. BBC News, Reuters, The Guardian, Sky News) for the 6 most important LATEST news stories (published in the last 48 hours) for people in London (mix: UK politics/Westminster, London, world, business, culture, sport). ` +
      `Return ONLY a JSON object, no prose: {"lead":{"title":"","summary":"2 sentences","source":"","url":""},"stories":[{"title":"","summary":"1 sentence","section":"","source":"","url":""}]} with 5 stories. Use real stories you found in search results with their real article URLs. Always return 5 stories — never refuse; if unsure of exact dates, use the most recent stories you found.`,
  });
  const text = data.output_text || (data.output || []).flatMap((o) => o.content || []).map((c) => c.text || '').join('');
  const json = firstJson(text);
  if (!json) throw new Error('No headlines returned');
  const news = JSON.parse(json);
  if (!news?.lead?.title || !Array.isArray(news.stories) || news.stories.length < 3 || /no reliable|couldn.t|could not/i.test(news.lead.title)) throw new Error('News wire unavailable, try again');
  return news;
}

async function designPage(news) {
  const lines = news.stories.map((s, i) => `${i + 1}. [${s.section}] ${s.title}`).join('\n');
  const data = await openai('images/generations', {
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare', size: '1024x1536', quality: 'high',
    prompt: `A beautiful, realistic broadsheet newspaper front page, photographed flat, classic British design. Masthead in elegant blackletter: "The Westminster Gazette". ` +
      `Dateline under the masthead: "${prettyDate()} · London · Price £1.20". Lead story headline in large bold serif: "${news.lead.title}", with a large hand-drawn editorial illustration (pen-and-ink with a light watercolour wash) illustrating the theme — symbolic scenes and places, no realistic depictions of real people's faces — and a two-line standfirst: "${news.lead.summary}". ` +
      `Below, a tidy multi-column grid of shorter stories with these headlines, each with a small pen-and-ink editorial illustration (symbolic objects and places, no realistic portraits of real people):\n${lines}\n` +
      `Fine column rules, readable headlines, realistic newsprint texture, warm off-white paper. Spell every headline exactly as given. No other brand names.`,
  });
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image returned');
  return Buffer.from(b64, 'base64');
}

router.get('/today', async (_req, res) => {
  const date = today(), png = path.join(DIR, `${date}.png`), meta = path.join(DIR, `${date}.json`);
  try {
    const cached = JSON.parse(await fs.readFile(meta, 'utf8'));
    return res.json({ ...cached, imageUrl: `/news/${date}.png` });
  } catch { /* not generated yet */ }
  if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'OPENAI_API_KEY is not set' });
  try {
    pending ||= (async () => {
      const news = await fetchHeadlines();
      const img = await designPage(news);
      await fs.mkdir(DIR, { recursive: true });
      await fs.writeFile(png, img);
      const out = { date, pretty: prettyDate(), ...news };
      await fs.writeFile(meta, JSON.stringify(out, null, 2));
      return out;
    })();
    const out = await pending;
    res.json({ ...out, imageUrl: `/news/${date}.png` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally { pending = null; }
});

export default router;
