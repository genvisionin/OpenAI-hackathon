// Billboard ads: any business uploads a product (photo optional) and GPT Image 2.5
// designs a billboard poster. Ads live in memory and rotate on the in-game billboards.
import express from 'express';

const router = express.Router();
const MODEL = () => process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare';
const ads = [
  { id: 'fanta', business: 'Fanta', title: 'Stay Orange, London', url: '/ads/fanta.jpg', ts: Date.now() },
];

function posterPrompt({ business, product, tagline, style }) {
  return `Wide landscape billboard advertisement poster for ${business}${product ? ` — ${product}` : ''}. ` +
    `Hero product shot, premium commercial photography, bold clean layout, vibrant colours, ` +
    `a subtle London touch (Big Ben or a red double-decker bus small in the background). ` +
    `Large bold headline text "${(tagline || `${product || business} — now in Westminster`).slice(0, 60)}" and the brand name "${business}". ` +
    `${style ? `Style: ${style}. ` : ''}Readable from a distance, no other text, no watermarks.`;
}

async function openai(path, init) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('OPENAI_API_KEY is not set'), { status: 400 });
  const res = await fetch(`https://api.openai.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || `OpenAI error ${res.status}`), { status: res.status });
  return data;
}

router.get('/list', (_req, res) => res.json({ ads: ads.map(({ id, business, title, url, ts }) => ({ id, business, title, url, ts })) }));

router.post('/create', async (req, res) => {
  try {
    const { business = '', product = '', tagline = '', style = '', imageDataUrl } = req.body || {};
    if (!String(business).trim()) return res.status(400).json({ error: 'Business name is required' });
    const prompt = posterPrompt({ business: String(business).slice(0, 60), product: String(product).slice(0, 80), tagline: String(tagline).slice(0, 60), style: String(style).slice(0, 80) });
    let data;
    if (imageDataUrl && /^data:image\/(png|jpe?g|webp);base64,/.test(imageDataUrl)) {
      const [meta, b64] = imageDataUrl.split(',');
      const type = meta.slice(5, meta.indexOf(';'));
      const form = new FormData();
      form.append('model', MODEL());
      form.append('prompt', `${prompt} Use the uploaded photo as the exact product — keep its packaging, logo and colours faithful.`);
      form.append('size', '1536x1024');
      form.append('quality', 'high');
      form.append('image', new Blob([Buffer.from(b64, 'base64')], { type }), `product.${type.split('/')[1]}`);
      data = await openai('images/edits', { method: 'POST', body: form });
    } else {
      data = await openai('images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL(), prompt, size: '1536x1024', quality: 'high' }) });
    }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image returned');
    const ad = { id: `ad${Date.now().toString(36)}`, business: String(business).slice(0, 60), title: String(tagline || product || business).slice(0, 60), url: `data:image/png;base64,${b64}`, ts: Date.now() };
    ads.unshift(ad); if (ads.length > 12) ads.pop();
    res.json({ ad });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not create the ad' });
  }
});

export default router;
