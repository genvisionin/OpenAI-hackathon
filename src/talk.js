const VOICE_STYLE = 'Speak in short, natural spoken sentences in the character’s accent. React directly to what the player says, and mention nearby Westminster places naturally when relevant.';

const voiceStyles = `
.voice-card{position:fixed;z-index:8;left:50%;bottom:24px;transform:translateX(-50%);width:min(560px,calc(100vw - 28px));padding:14px 16px 12px;color:#f5f0e7;background:linear-gradient(135deg,rgba(20,25,25,.96),rgba(31,34,31,.94));border:1px solid rgba(236,226,201,.22);border-top:2px solid #d3483d;box-shadow:0 18px 56px #0009;backdrop-filter:blur(16px);animation:voiceCardIn .24s ease both}
.voice-card[hidden]{display:none}.voice-card__top{display:flex;align-items:center;gap:11px}.voice-card__emoji{display:grid;place-items:center;flex:none;width:43px;height:43px;border:1px solid #d9b35e66;background:#d8b15b1c;border-radius:50%;font-size:22px}.voice-card__identity{min-width:0;flex:1}.voice-card__identity strong{display:block;font:600 15px 'Playfair Display',serif}.voice-card__identity span{display:block;margin-top:3px;color:#b5b4aa;font:9px var(--mono);letter-spacing:.06em}.voice-card__state{display:flex;align-items:center;gap:6px;color:#d3bd83;font:8px var(--mono);letter-spacing:.1em;text-transform:uppercase}.voice-card__state i{width:6px;height:6px;border-radius:50%;background:#daa84e;box-shadow:0 0 9px #e9b95d;animation:voiceDot 1.4s ease-in-out infinite}.voice-card__visual{height:26px;display:flex;align-items:center;justify-content:center;gap:3px;margin:10px 0 7px;color:#dcaf54}.voice-card__bar{width:3px;height:5px;border-radius:4px;background:currentColor;opacity:.82;transform-origin:center;transition:height .08s linear}.voice-card.is-speaking .voice-card__bar{animation:voiceWave .6s ease-in-out infinite alternate}.voice-card__mic{position:absolute;right:19px;top:61px;width:12px;height:12px;border-radius:50%;border:2px solid #a7bf9d;box-shadow:0 0 0 0 #86c07800;opacity:.3;transition:opacity .12s,box-shadow .12s}.voice-card.is-listening .voice-card__mic{opacity:1;box-shadow:0 0 0 5px #86c07826;animation:micPulse .9s ease-out infinite}.voice-card__subtitles{min-height:33px;display:flex;flex-direction:column;gap:3px;padding:7px 9px;background:#ffffff0a;border-left:2px solid #c99a43;color:#ebe6da;font-size:11px;line-height:1.35}.voice-card__line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.voice-card__line[data-who="user"]{color:#b8c4ad}.voice-card__line:empty{display:none}.voice-card__controls{display:flex;align-items:center;gap:7px;margin-top:10px}.voice-card__controls button{height:31px;padding:0 11px;border:1px solid #ffffff22;background:#ffffff0b;color:#eee8dc;font-size:10px;transition:background .15s,border-color .15s}.voice-card__controls button:hover{background:#ffffff19;border-color:#ffffff55}.voice-card__controls .voice-card__gig{margin-left:auto;background:#d6ae5c;border-color:#d6ae5c;color:#25251f;font-weight:700}.voice-card__controls .voice-card__end{background:#b63a32;border-color:#b63a32;color:white}.voice-card__controls button[hidden]{display:none}.voice-card__notice{display:none;margin-top:7px;color:#f2bd72;font:10px var(--mono)}.voice-card__notice:not(:empty){display:block}.voice-card.is-muted .voice-card__state{color:#aaa}.voice-card.is-muted .voice-card__state i{background:#8a8a82;box-shadow:none;animation:none}
@keyframes voiceWave{from{transform:scaleY(.55);opacity:.6}to{transform:scaleY(1.65);opacity:1}}@keyframes micPulse{0%{box-shadow:0 0 0 2px #86c07855}100%{box-shadow:0 0 0 9px #86c07800}}@keyframes voiceDot{50%{opacity:.4}}@keyframes voiceCardIn{from{opacity:0;translate:0 10px}to{opacity:1;translate:0 0}}@media(max-width:560px){.voice-card{bottom:12px;padding:11px}.voice-card__controls button{padding:0 8px;font-size:9px}.voice-card__emoji{width:38px;height:38px}.voice-card__mic{top:54px;right:15px}}
`;

export class Talk {
  constructor({ getCtx, onAcceptMission, onClose }) {
    this.getCtx = getCtx || (() => ({}));
    this.onAcceptMission = onAcceptMission || (() => {});
    this.onClose = onClose || (() => {});
    this.panel = document.querySelector('#talk');
    this.form = document.querySelector('#talk-form');
    this.log = document.querySelector('#talk-log');
    this.input = document.querySelector('#talk-input');
    this.sendButton = document.querySelector('#talk-send');
    this.micButton = document.querySelector('#talk-mic');
    this.acceptButton = document.querySelector('#talk-accept');
    this.closeButton = document.querySelector('#talk-close');
    this.history = new Map();
    this.npc = null;
    this.peer = null;
    this.channel = null;
    this.stream = null;
    this.audio = null;
    this.busy = false;
    this.openToken = 0;
    this.lastVoiceResponse = null;
    this.voiceLines = [];
    this.localMuted = false;
    this.audioContext = null;
    this.localAnalyser = null;
    this.remoteAnalyser = null;
    this.localSource = null;
    this.remoteSource = null;
    this.analysisFrame = 0;
    this.voiceCard = this.createVoiceCard();

    this.handleSend = () => this.sendText();
    this.handleSubmit = (event) => { event.preventDefault(); this.sendText(); };
    this.handleKey = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.sendText();
      }
    };
    this.handleAccept = () => {
      if (!this.npc?.mission) return;
      this.onAcceptMission(this.npc.mission);
      this.close();
    };
    this.handleClose = () => this.close();
    this.sendButton?.addEventListener('click', this.handleSend);
    this.form?.addEventListener('submit', this.handleSubmit);
    this.input?.addEventListener('keydown', this.handleKey);
    this.acceptButton?.addEventListener('click', this.handleAccept);
    this.closeButton?.addEventListener('click', this.handleClose);
  }

  createVoiceCard() {
    if (!document.querySelector('#talk-voice-style')) {
      const style = document.createElement('style');
      style.id = 'talk-voice-style';
      style.textContent = voiceStyles;
      document.head.append(style);
    }
    const card = document.createElement('section');
    card.className = 'voice-card';
    card.hidden = true;
    card.setAttribute('aria-label', 'Voice conversation');
    card.innerHTML = '<div class="voice-card__top"><div class="voice-card__emoji" data-slot="emoji"></div><div class="voice-card__identity"><strong data-slot="name"></strong><span data-slot="role"></span></div><span class="voice-card__state"><i></i><span data-slot="state">Connecting</span></span></div><div class="voice-card__visual" aria-label="Character voice level"></div><span class="voice-card__mic" aria-label="Microphone activity"></span><div class="voice-card__subtitles" aria-live="polite"><div class="voice-card__line" data-who="assistant"></div><div class="voice-card__line" data-who="user"></div></div><div class="voice-card__notice" role="status"></div><div class="voice-card__controls"><button type="button" data-action="mute">Mute</button><button type="button" data-action="type">Type instead</button><button type="button" class="voice-card__gig" data-action="gig">Take the gig</button><button type="button" class="voice-card__end" data-action="end">End</button></div>';
    for (let i = 0; i < 25; i++) {
      const bar = document.createElement('i');
      bar.className = 'voice-card__bar';
      bar.style.animationDelay = `${(i % 8) * -0.09}s`;
      card.querySelector('.voice-card__visual').append(bar);
    }
    card.querySelector('[data-action="mute"]').addEventListener('click', () => this.toggleMute());
    card.querySelector('[data-action="type"]').addEventListener('click', () => this.showTextPanel());
    card.querySelector('[data-action="gig"]').addEventListener('click', () => this.handleAccept());
    card.querySelector('[data-action="end"]').addEventListener('click', () => this.close());
    document.body.append(card);
    return card;
  }

  open(npc) {
    if (!npc || !this.panel) return;
    this.teardownVoice();
    this.npc = npc;
    const token = ++this.openToken;
    this.lastVoiceResponse = null;
    this.voiceLines = [];
    this.voiceCard.hidden = false;
    this.voiceCard.classList.remove('is-speaking', 'is-listening', 'is-muted');
    this.voiceCard.querySelector('[data-slot="emoji"]').textContent = npc.emoji || '💬';
    this.voiceCard.querySelector('[data-slot="name"]').textContent = npc.name;
    this.voiceCard.querySelector('[data-slot="role"]').textContent = npc.role;
    this.voiceCard.querySelector('[data-slot="state"]').textContent = 'Connecting';
    this.voiceCard.querySelector('.voice-card__notice').textContent = '';
    this.voiceCard.querySelector('[data-action="gig"]').hidden = !npc.mission;
    const subtitle = this.voiceCard.querySelector('.voice-card__subtitles');
    subtitle.querySelectorAll('.voice-card__line').forEach((line) => { line.textContent = ''; });
    this.panel.hidden = true;
    this.panel.classList.add('hidden');
    this.panel.classList.remove('is-open');
    this.panel.setAttribute('aria-hidden', 'true');
    this.panel.dataset.character = npc.id;
    this.panel.querySelector('#talk-emoji')?.replaceChildren(document.createTextNode(npc.emoji || '💬'));
    const name = document.querySelector('#talk-name');
    const role = document.querySelector('#talk-role');
    if (name) name.textContent = npc.name;
    if (role) role.textContent = npc.role;
    if (this.acceptButton) {
      this.acceptButton.hidden = !npc.mission;
      this.acceptButton.disabled = false;
      this.acceptButton.textContent = 'Take the gig';
    }
    document.querySelector('#talk-accept-wrap')?.classList.toggle('hidden', !npc.mission);
    if (this.log) {
      this.log.replaceChildren();
      const history = this.history.get(npc.id) || [];
      history.forEach((item) => this.appendMessage(item.who, item.text, false));
    }
    if (this.input) {
      this.input.value = '';
      this.input.disabled = false;
      this.input.placeholder = `Message ${npc.name}…`;
    }
    if (this.micButton) {
      this.micButton.textContent = '◖';
      this.micButton.setAttribute('aria-label', 'Start voice chat');
      this.micButton.onclick = () => this.connectVoice();
    }
    if (token === this.openToken) this.connectVoice(token);
  }

  showTextPanel() {
    if (!this.isOpen()) return;
    this.panel.hidden = false;
    this.panel.classList.remove('hidden');
    this.panel.classList.add('is-open');
    this.panel.setAttribute('aria-hidden', 'false');
    this.log.scrollTop = this.log.scrollHeight;
    this.input?.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen()) return;
    this.openToken++;
    this.teardownVoice();
    this.voiceCard.hidden = true;
    this.panel.hidden = true;
    this.panel.classList.add('hidden');
    this.panel.classList.remove('is-open');
    this.panel.setAttribute('aria-hidden', 'true');
    this.npc = null;
    this.onClose();
  }

  isOpen() {
    return Boolean(this.npc && (this.voiceCard && !this.voiceCard.hidden || this.panel && !this.panel.hidden));
  }

  distanceCheck(playerPos, npcPos) {
    if (!this.isOpen() || !playerPos || !npcPos) return false;
    const px = Number(playerPos.x ?? playerPos[0]);
    const pz = Number(playerPos.z ?? playerPos[1]);
    const nx = Number(npcPos.x ?? npcPos[0]);
    const nz = Number(npcPos.z ?? npcPos[1]);
    if (![px, pz, nx, nz].every(Number.isFinite)) return false;
    if (Math.hypot(px - nx, pz - nz) > 8) {
      this.close();
      return true;
    }
    return false;
  }

  appendMessage(who, text, save = true) {
    if (!text || !this.npc) return;
    if (this.log) {
      const row = document.createElement('div');
      row.className = `talk-message ${who}`;
      row.dataset.who = who;
      const label = document.createElement('span');
      label.className = 'speaker';
      label.textContent = who === 'user' ? 'YOU' : who === 'assistant' ? this.npc.name : 'LONDON LIVES';
      const body = document.createElement('p');
      body.className = 'talk-message__text';
      body.textContent = text;
      row.append(label, body);
      this.log.append(row);
      this.log.scrollTop = this.log.scrollHeight;
    }
    if (save && (who === 'user' || who === 'assistant')) {
      const history = this.history.get(this.npc.id) || [];
      history.push({ who, text });
      this.history.set(this.npc.id, history.slice(-40));
    }
  }

  setBusy(busy) {
    this.busy = busy;
    if (this.sendButton) this.sendButton.disabled = busy;
    if (this.input) this.input.disabled = busy;
  }

  async sendText() {
    if (!this.npc || !this.input || this.busy) return;
    const text = this.input.value.trim();
    if (!text) return;
    const npc = this.npc;
    const token = this.openToken;
    this.input.value = '';
    this.appendMessage('user', text);
    if (this.channel?.readyState === 'open') {
      this.channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }));
      this.channel.send(JSON.stringify({ type: 'response.create' }));
      return;
    }
    this.setBusy(true);
    try {
      const history = this.history.get(npc.id) || [];
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npcId: npc.id, ctx: { ...this.getCtx(), history: history.slice(-10) }, messages: history.slice(-12).map((item) => ({ role: item.who, content: item.text })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not reach the character. Try again.');
      if (token === this.openToken && this.npc?.id === npc.id) this.appendMessage('assistant', data.reply || 'Sorry, I lost my train of thought.');
    } catch (error) {
      if (token === this.openToken) this.appendMessage('system', error.message || 'Text chat is unavailable right now.');
    } finally {
      if (token === this.openToken) {
        this.setBusy(false);
        this.input?.focus({ preventScroll: true });
      }
    }
  }

  async connectVoice(expectedToken = this.openToken) {
    if (!this.npc || this.peer || expectedToken !== this.openToken) return;
    const npc = this.npc;
    const token = this.openToken;
    this.voiceCard.querySelector('[data-slot="state"]').textContent = 'Connecting';
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') throw new Error(!window.isSecureContext ? 'Voice needs a secure page — open the game at https://… (or localhost)' : 'Mic unavailable');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== this.openToken || this.npc?.id !== npc.id) return this.teardownVoice();
      const sessionResponse = await fetch('/api/realtime/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npcId: npc.id, ctx: { ...this.getCtx(), history: (this.history.get(npc.id) || []).slice(-10) } }),
      });
      const session = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || !session.value) throw new Error(session.error || 'Voice key unavailable');
      if (token !== this.openToken || this.npc?.id !== npc.id) return this.teardownVoice();
      const peer = new RTCPeerConnection();
      this.peer = peer;
      this.channel = peer.createDataChannel('oai-events');
      this.channel.addEventListener('open', () => {
        if (token !== this.openToken) return;
        const ctx = this.getCtx() || {};
        const recent = (this.history.get(npc.id) || []).slice(-8)
          .map((item) => `${item.who === 'user' ? (ctx.playerName || 'Player') : npc.name}: ${item.text}`).join('\n');
        const mission = npc.mission ? `You can offer the gig ${npc.mission}. The player chooses it with the Take the gig button.` : 'You have no gig to offer.';
        const instructions = [
          `You are ${npc.name}, ${npc.role}, in a playful, grounded game set in real Westminster, London.`,
          npc.persona || '',
          VOICE_STYLE,
          'Answer the player’s actual question, stay in character, and never claim to control game state or have completed an action. You know Big Ben (Elizabeth Tower), the Palace of Westminster, Westminster Abbey, Parliament Square, the Thames, Westminster Bridge, Whitehall, and the London Eye. Mention nearby places naturally when useful.',
          `The player is ${ctx.playerName || 'Visitor'}; age ${Number(ctx.age) || 21}; level ${Number(ctx.level) || 1}; £${Number(ctx.money) || 0}.`,
          ctx.londonTime ? `Local London time: ${ctx.londonTime}.` : '',
          mission,
          recent ? `Recent conversation:\n${recent}` : '',
        ].filter(Boolean).join('\n\n');
        this.channel.send(JSON.stringify({ type: 'session.update', session: { instructions } }));
        this.channel.send(JSON.stringify({ type: 'response.create' }));
        this.voiceCard.querySelector('[data-slot="state"]').textContent = 'Listening';
        this.startAnalysis();
      });
      this.channel.addEventListener('message', (event) => this.handleRealtimeEvent(event.data, token));
      this.channel.addEventListener('close', () => {
        if (token === this.openToken && this.peer) this.teardownVoice();
      });
      this.channel.addEventListener('error', () => this.showFallback('Voice connection hiccup. Mic blocked — allow microphone to talk by voice'));
      peer.addEventListener('track', (event) => {
        if (!this.audio) {
          this.audio = document.createElement('audio');
          this.audio.autoplay = true;
          this.audio.playsInline = true;
          this.audio.hidden = true;
          document.body.append(this.audio);
        }
        this.audio.srcObject = event.streams[0];
        this.audio.play().catch(() => {});
        if (this.audioContext) this.attachRemoteAnalyser(event.streams[0]);
        this.startAnalysis();
      });
      this.stream.getTracks().forEach((track) => peer.addTrack(track, this.stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await this.waitForIce(peer);
      const answerResponse = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(session.model)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.value}`, 'Content-Type': 'application/sdp' }, body: peer.localDescription.sdp,
      });
      const answer = await answerResponse.text();
      if (!answerResponse.ok) throw new Error(answer || `Voice connection failed (${answerResponse.status}).`);
      await peer.setRemoteDescription({ type: 'answer', sdp: answer });
      if (this.micButton) {
        this.micButton.onclick = () => this.toggleMute();
        this.micButton.textContent = 'Mute';
        this.micButton.setAttribute('aria-label', 'Mute microphone');
      }
    } catch (error) {
      if (token === this.openToken) this.showFallback('Mic blocked — allow microphone to talk by voice');
    }
  }

  showFallback(notice) {
    this.voiceCard.hidden = true;
    this.panel.hidden = false;
    this.panel.classList.remove('hidden');
    this.panel.classList.add('is-open');
    this.panel.setAttribute('aria-hidden', 'false');
    if (this.log) {
      this.log.querySelector('[data-voice-fallback="true"]')?.remove();
      const row = document.createElement('div');
      row.className = 'talk-message system';
      row.dataset.voiceFallback = 'true';
      const body = document.createElement('p');
      body.className = 'talk-message__text';
      body.textContent = notice;
      row.append(body);
      this.log.append(row);
    }
    this.teardownVoice();
    this.input?.focus({ preventScroll: true });
  }

  waitForIce(peer) {
    if (peer.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = window.setTimeout(done, 1400);
      function done() {
        window.clearTimeout(timeout);
        peer.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
      function check() { if (peer.iceGatheringState === 'complete') done(); }
      peer.addEventListener('icegatheringstatechange', check);
    });
  }

  handleRealtimeEvent(raw, token) {
    if (token !== this.openToken || !this.npc) return;
    let event;
    try { event = JSON.parse(raw); } catch { return; }
    const userPartial = event.type === 'conversation.item.input_audio_transcription.delta' ? event.delta : null;
    const assistantPartial = ['response.output_audio_transcript.delta', 'response.audio_transcript.delta'].includes(event.type) ? event.delta : null;
    if (userPartial != null) this.setSubtitle('user', userPartial, false);
    if (assistantPartial != null) this.setSubtitle('assistant', assistantPartial, false);
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      if (event.transcript?.trim()) {
        this.appendMessage('user', event.transcript.trim());
        this.setSubtitle('user', event.transcript.trim(), true);
      }
    } else if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.audio_transcript.done' || event.type === 'response.output_text.done') {
      const responseId = event.response_id || event.item_id || `${event.type}:${event.transcript || event.text}`;
      if (responseId === this.lastVoiceResponse) return;
      const text = (event.transcript || event.text || '').trim();
      if (text) {
        this.lastVoiceResponse = responseId;
        this.appendMessage('assistant', text);
        this.setSubtitle('assistant', text, true);
      }
    } else if (event.type === 'response.created') {
      this.voiceCard.classList.add('is-speaking');
      this.voiceCard.querySelector('[data-slot="state"]').textContent = 'Speaking';
    } else if (event.type === 'response.done') {
      this.voiceCard.classList.remove('is-speaking');
      this.voiceCard.querySelector('[data-slot="state"]').textContent = 'Listening';
    } else if (event.type === 'input_audio_buffer.speech_started') {
      this.voiceCard.querySelector('[data-slot="state"]').textContent = 'Listening';
    } else if (event.type === 'error') {
      this.showFallback('Mic blocked — allow microphone to talk by voice');
    }
  }

  setSubtitle(who, text, complete) {
    const line = this.voiceCard?.querySelector(`.voice-card__line[data-who="${who}"]`);
    if (!line) return;
    line.textContent = `${who === 'user' ? 'YOU' : this.npc?.name || 'LONDONER'}  ${text}`;
    if (complete) {
      this.voiceLines = [...this.voiceLines.filter((item) => item.who !== who || item.text !== text), { who, text }].slice(-2);
      const latest = this.voiceLines.slice(-2);
      this.voiceCard.querySelectorAll('.voice-card__line').forEach((node) => { node.textContent = ''; });
      latest.forEach((item) => {
        const node = this.voiceCard.querySelector(`.voice-card__line[data-who="${item.who}"]`);
        if (node) node.textContent = `${item.who === 'user' ? 'YOU' : this.npc?.name || 'LONDONER'}  ${item.text}`;
      });
    }
  }

  toggleMute() {
    if (!this.stream) return;
    this.localMuted = !this.localMuted;
    this.stream.getAudioTracks().forEach((track) => { track.enabled = !this.localMuted; });
    const button = this.voiceCard.querySelector('[data-action="mute"]');
    button.textContent = this.localMuted ? 'Unmute' : 'Mute';
    this.voiceCard.classList.toggle('is-muted', this.localMuted);
    this.voiceCard.querySelector('[data-slot="state"]').textContent = this.localMuted ? 'Mic muted' : 'Listening';
    this.micButton?.setAttribute('aria-label', this.localMuted ? 'Unmute microphone' : 'Mute microphone');
  }

  async startAnalysis() {
    if (!this.stream || !this.isOpen()) return;
    try {
      if (this.audioContext) {
        if (this.audio?.srcObject && !this.remoteAnalyser) this.attachRemoteAnalyser(this.audio.srcObject);
        return;
      }
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      const context = new Context();
      this.audioContext = context;
      await context.resume().catch(() => {});
      this.localAnalyser = context.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.localSource = context.createMediaStreamSource(this.stream);
      this.localSource.connect(this.localAnalyser);
      if (this.audio?.srcObject) this.attachRemoteAnalyser(this.audio.srcObject);
      const bars = [...this.voiceCard.querySelectorAll('.voice-card__bar')];
      const localData = new Uint8Array(this.localAnalyser.frequencyBinCount);
      let remoteData = new Uint8Array(this.remoteAnalyser?.frequencyBinCount || 0);
      const draw = () => {
        if (!this.isOpen() || !this.audioContext) return;
        this.analysisFrame = requestAnimationFrame(draw);
        if (this.remoteAnalyser && remoteData.length !== this.remoteAnalyser.frequencyBinCount) {
          remoteData = new Uint8Array(this.remoteAnalyser.frequencyBinCount);
        }
        let local = 0;
        if (this.localAnalyser) {
          this.localAnalyser.getByteFrequencyData(localData);
          local = localData.reduce((sum, value) => sum + value, 0) / localData.length / 255;
        }
        let remote = 0;
        if (this.remoteAnalyser) {
          this.remoteAnalyser.getByteFrequencyData(remoteData);
          remote = remoteData.reduce((sum, value) => sum + value, 0) / remoteData.length / 255;
        }
        this.voiceCard.classList.toggle('is-listening', local > 0.055 && !this.localMuted);
        if (this.remoteAnalyser) this.voiceCard.classList.toggle('is-speaking', remote > 0.035);
        bars.forEach((bar, index) => {
          const value = this.remoteAnalyser ? remoteData[Math.floor(index / bars.length * remoteData.length)] / 255 : 0;
          bar.style.height = `${4 + value * 20}px`;
          bar.style.opacity = value > 0.08 ? '1' : '.45';
        });
      };
      draw();
    } catch { /* Audio levels are an enhancement; voice remains usable without analyser support. */ }
  }

  attachRemoteAnalyser(stream) {
    if (!this.audioContext || this.remoteAnalyser || !stream) return;
    try {
      this.remoteAnalyser = this.audioContext.createAnalyser();
      this.remoteAnalyser.fftSize = 256;
      this.remoteSource = this.audioContext.createMediaStreamSource(stream);
      this.remoteSource.connect(this.remoteAnalyser);
    } catch { this.remoteAnalyser = null; }
  }

  teardownVoice() {
    if (this.analysisFrame) cancelAnimationFrame(this.analysisFrame);
    this.analysisFrame = 0;
    [this.localSource, this.remoteSource].forEach((source) => { try { source?.disconnect(); } catch {} });
    this.localSource = null;
    this.remoteSource = null;
    this.localAnalyser = null;
    this.remoteAnalyser = null;
    if (this.audioContext) this.audioContext.close().catch(() => {});
    this.audioContext = null;
    this.channel?.close();
    this.channel = null;
    this.peer?.close();
    this.peer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.localMuted = false;
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
      this.audio.remove();
      this.audio = null;
    }
    if (this.voiceCard) this.voiceCard.classList.remove('is-speaking', 'is-listening', 'is-muted');
    if (this.micButton) {
      this.micButton.textContent = '◖';
      this.micButton.setAttribute('aria-label', 'Start voice chat');
      this.micButton.onclick = () => this.connectVoice();
    }
  }
}
