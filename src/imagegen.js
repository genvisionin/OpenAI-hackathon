/**
 * ImageStudio API
 *   new ImageStudio({ renderer, getCtx, toast })
 *   openPostcard({ caption?, onCapture? }) -> Promise<void>
 *   newspaper(mission, ctx) -> Promise<void>  // call when a gig completes
 *   comic(events: string[]) -> Promise<void>
 *   portrait(npc) -> Promise<dataUrl>
 *
 * `openPostcard` reads renderer.domElement.toDataURL('image/png'). WebGL may
 * clear its drawing buffer after a frame, so integrations can supply
 * `onCapture(capture)`: register/invoke `capture` from the next render callback
 * and return its data URL (or a promise for it). Without that option, the
 * studio captures on the next animation frame, after the game’s usual render.
 */

const portraitCache = new Map();

export class ImageStudio {
  constructor({ renderer, getCtx, toast } = {}) {
    this.renderer = renderer;
    this.getCtx = getCtx || (() => ({}));
    this.toast = toast || (() => {});
    this.root = null;
    this.ensureStyles();
  }

  ensureStyles() {
    if (document.querySelector('#studio-style')) return;
    const style = document.createElement('style');
    style.id = 'studio-style';
    style.textContent = `
      #studio{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:22px;background:rgba(8,13,18,.78);backdrop-filter:blur(12px);color:#f7f0df;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
      #studio[hidden]{display:none} #studio .studio-card{width:min(880px,96vw);max-height:92vh;overflow:auto;position:relative;border:1px solid rgba(229,190,111,.36);border-radius:22px;background:linear-gradient(150deg,#202a31,#10171c 62%,#1b2224);box-shadow:0 28px 100px #0009;padding:clamp(20px,4vw,38px)}
      #studio .studio-kicker{color:#e7b758;font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:800} #studio h2{font-family:Georgia,serif;font-size:clamp(28px,5vw,46px);line-height:1.05;margin:10px 46px 8px 0;color:#fff5de} #studio .studio-sub{color:#b8b7ae;margin:0 0 24px}
      #studio .studio-close{position:absolute;right:20px;top:20px;width:42px;height:42px;border:1px solid #ffffff25;border-radius:50%;background:#ffffff0d;color:#fff;font-size:23px;cursor:pointer}
      #studio .studio-frame{min-height:270px;max-height:58vh;display:grid;place-items:center;overflow:hidden;border-radius:15px;background:linear-gradient(135deg,#2e3436,#171c20);border:1px solid #ffffff15}
      #studio .studio-frame img{display:block;max-width:100%;max-height:58vh;object-fit:contain} #studio .studio-loading{width:100%;height:340px;background:linear-gradient(110deg,#20282c 8%,#394246 18%,#20282c 33%);background-size:200% 100%;animation:studio-shimmer 1.2s linear infinite}
      @keyframes studio-shimmer{to{background-position-x:-200%}} #studio .studio-error{padding:35px;color:#ffb6a8;text-align:center}
      #studio .studio-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px} #studio .studio-btn{border:1px solid #ffffff29;border-radius:999px;padding:12px 19px;background:#ffffff0d;color:#f8f1e2;font-weight:750;cursor:pointer;text-decoration:none} #studio .studio-btn.primary{background:#c74638;color:white;border-color:#d95f4d;box-shadow:0 7px 22px #ad332c55} #studio .studio-btn:disabled{opacity:.45;cursor:wait}
      @media(max-width:560px){#studio{padding:10px}#studio .studio-card{padding:20px 15px}#studio .studio-frame{min-height:210px}#studio .studio-actions{flex-wrap:wrap}#studio .studio-btn{flex:1;text-align:center}}
    `;
    document.head.append(style);
  }

  makeModal(title, subtitle) {
    this.close();
    const root = document.createElement('section');
    root.id = 'studio';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'studio-title');
    root.innerHTML = `<div class="studio-card"><button class="studio-close" type="button" aria-label="Close image studio">×</button><div class="studio-kicker">London Lives · Keepsake Studio</div><h2 id="studio-title"></h2><p class="studio-sub"></p><div class="studio-frame" aria-live="polite"><div class="studio-loading"></div></div><div class="studio-actions"><button class="studio-btn" type="button" data-close>Close</button><a class="studio-btn primary" data-download hidden>Download image</a></div></div>`;
    root.querySelector('h2').textContent = title;
    root.querySelector('.studio-sub').textContent = subtitle;
    root.querySelector('.studio-close').addEventListener('click', () => this.close());
    root.querySelector('[data-close]').addEventListener('click', () => this.close());
    root.addEventListener('click', (event) => { if (event.target === root) this.close(); });
    document.addEventListener('keydown', this.handleEscape = (event) => { if (event.key === 'Escape') this.close(); }, { once: true });
    document.body.append(root);
    this.root = root;
    return root;
  }

  async showGenerated({ title, subtitle, endpoint, payload, filename }) {
    const root = this.makeModal(title, subtitle);
    const frame = root.querySelector('.studio-frame');
    const download = root.querySelector('[data-download]');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.dataUrl) throw new Error(data.error || 'The image could not be created. Please try again.');
      if (this.root !== root) return;
      const image = document.createElement('img');
      image.src = data.dataUrl; window.dispatchEvent(new CustomEvent('studio:image', { detail: { endpoint, dataUrl: data.dataUrl, payload } }));
      image.alt = title;
      frame.replaceChildren(image);
      download.href = data.dataUrl;
      download.download = filename;
      download.hidden = false;
      this.toast('Your London keepsake is ready.');
    } catch (error) {
      if (this.root !== root) return;
      frame.innerHTML = '';
      const message = document.createElement('p');
      message.className = 'studio-error';
      message.textContent = error.message || 'Could not create your keepsake.';
      frame.append(message);
    }
  }

  async captureCanvas(onCapture) {
    if (onCapture) {
      const capture = () => {
        const value = this.renderer?.domElement?.toDataURL('image/png');
        return value;
      };
      let callbackResolve;
      const callbackResult = new Promise((resolve) => { callbackResolve = resolve; });
      const renderCapture = () => {
        try {
          const value = capture();
          callbackResolve(value);
          return value;
        } catch (error) { callbackResolve(Promise.reject(error)); throw error; }
      };
      try {
        const supplied = await onCapture(renderCapture);
        if (typeof supplied === 'string' && supplied.startsWith('data:image/')) return supplied;
        if (supplied?.dataUrl) return supplied.dataUrl;
        // Also support onCapture(cb => register(cb)), where the render loop
        // calls cb on its next completed frame.
        const captured = await Promise.race([callbackResult, new Promise((resolve) => setTimeout(() => resolve(null), 900))]);
        if (typeof captured === 'string' && captured.startsWith('data:image/')) return captured;
      } catch (error) {
        if (error?.message) throw error;
      }
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = this.renderer?.domElement;
    if (!canvas) throw new Error('The game canvas is not available.');
    try { return canvas.toDataURL('image/png'); }
    catch { throw new Error('Could not capture the game view. Try again after the next frame.'); }
  }

  async openPostcard({ caption = 'Greetings from Westminster', onCapture } = {}) {
    const root = this.makeModal('Postcard from Westminster', 'Turning your view into a hand-painted London keepsake…');
    const frame = root.querySelector('.studio-frame');
    try {
      const imageDataUrl = await this.captureCanvas(onCapture);
      if (this.root !== root) return;
      const response = await fetch('/api/image/postcard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageDataUrl, caption }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.dataUrl) throw new Error(data.error || 'The postcard could not be created.');
      if (this.root !== root) return;
      const image = document.createElement('img'); image.src = data.dataUrl; image.alt = 'Illustrated London postcard'; frame.replaceChildren(image);
      const download = root.querySelector('[data-download]'); download.href = data.dataUrl; download.download = 'london-lives-postcard.png'; download.hidden = false;
      this.toast('Your Westminster postcard is ready.');
    } catch (error) {
      if (this.root !== root) return;
      frame.replaceChildren(Object.assign(document.createElement('p'), { className: 'studio-error', textContent: error.message || 'Could not create your postcard.' }));
    }
  }

  async newspaper(mission, ctx = this.getCtx()) {
    const def = mission?.def || mission || {};
    const player = ctx?.player || ctx?.state || ctx || {};
    const playerName = player.name || ctx?.playerName || 'The Player';
    const title = def.title || mission?.title || 'A Westminster Day to Remember';
    const reward = Number(def.reward || mission?.reward || 0);
    const story = `${playerName} completed “${title}” around Westminster${reward ? ` and earned £${reward}` : ''}. ${def.desc || mission?.desc || 'The latest gig brought an unforgettable day across London.'}`;
    await this.showGenerated({ title: 'The Westminster Gazette', subtitle: 'A front page celebrating your latest gig…', endpoint: '/api/image/newspaper', payload: { headline: `${playerName}: ${title}`, story, playerName }, filename: 'westminster-gazette.png' });
  }

  async comic(events = []) {
    const ctx = this.getCtx() || {};
    const player = ctx.player || ctx.state || ctx;
    await this.showGenerated({ title: 'A Day in London Lives', subtitle: 'Your Westminster adventure, in four panels…', endpoint: '/api/image/comic', payload: { events: Array.isArray(events) ? events : [String(events)], playerName: player.name || ctx.playerName || 'The Player' }, filename: 'a-day-in-london-lives.png' });
  }

  async portrait(npc) {
    if (!npc?.id) throw new Error('A character is required to create a portrait.');
    if (portraitCache.has(npc.id)) return portraitCache.get(npc.id);
    const response = await fetch('/api/image/portrait', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ npcId: npc.id }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.dataUrl) throw new Error(data.error || 'Portrait unavailable.');
    portraitCache.set(npc.id, data.dataUrl);
    return data.dataUrl;
  }

  close() {
    if (!this.root) return;
    document.removeEventListener('keydown', this.handleEscape);
    this.root.remove();
    this.root = null;
  }
}
