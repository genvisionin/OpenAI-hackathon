export class GameAudio {
  constructor() {
    this.ctx=null;this.master=null;this.engineKind=null;this.engineNodes=null;this.sirenOn=false;this.sirenNodes=null;this.muted=false;this._speed=0;
  }
  start() {
    if(!this.ctx){
      const Ctx=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Ctx)return false;
      this.ctx=new Ctx();
      this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:.68;this.master.connect(this.ctx.destination);
    }
    if(this.ctx.state==='suspended')this.ctx.resume();
    return true;
  }
  _stopEngine(){
    if(!this.engineNodes)return;
    const {oscillators,gain,filter}=this.engineNodes,t=this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(0,t,.035);
    for(const o of oscillators){try{o.stop(t+.18);}catch{}}
    this.engineNodes=null;this.engineKind=null;
  }
  _makeEngine(kind){
    const ctx=this.ctx,oscillators=[];const gain=ctx.createGain();gain.gain.value=0;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=900;
    for(const [type,ratio,volume] of [['sawtooth',1,.42],['triangle',2,.18],['sine',.5,.26]]){
      const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;g.gain.value=volume;o.connect(g);g.connect(filter);o.start();oscillators.push(o);
    }
    filter.connect(gain);gain.connect(this.master);gain.gain.setTargetAtTime(.105,ctx.currentTime,.12);
    this.engineNodes={oscillators,gain,filter};this.engineKind=kind;
  }
  setEngine(kind,speed=0){
    if(!this.start())return;
    this._speed=Number.isFinite(speed)?Math.abs(speed):0;
    if(!kind){this._stopEngine();return;}
    if(kind!==this.engineKind){this._stopEngine();this._makeEngine(kind);}
    const n=this.engineNodes;if(!n)return;
    const t=this.ctx.currentTime,boat=kind==='boat',bus=kind==='bus',base=boat?52:bus?36:kind==='police'?48:43;
    const rpm=Math.min(1.7,this._speed/(boat?22:bus?20:24));
    const freq=base+rpm*(boat?104:bus?70:108);
    n.oscillators[0].frequency.setTargetAtTime(freq,t,.065);
    n.oscillators[1].frequency.setTargetAtTime(freq*2.013,t,.065);
    n.oscillators[2].frequency.setTargetAtTime(freq*.5,t,.08);
    n.filter.frequency.setTargetAtTime(420+rpm*1700,t,.1);
    n.gain.gain.setTargetAtTime(.075+Math.min(.055,rpm*.04),t,.09);
  }
  _stopSiren(){
    if(!this.sirenNodes)return;
    const {osc,gain,lfo}=this.sirenNodes,t=this.ctx.currentTime;gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(0,t,.03);
    try{osc.stop(t+.14);lfo.stop(t+.14);}catch{}this.sirenNodes=null;
  }
  setSiren(on){
    this.sirenOn=!!on;if(!this.start())return;
    if(!this.sirenOn){this._stopSiren();return;}
    if(this.sirenNodes)return;
    const c=this.ctx,osc=c.createOscillator(),lfo=c.createOscillator(),depth=c.createGain(),gain=c.createGain(),filter=c.createBiquadFilter();
    osc.type='square';osc.frequency.value=680;lfo.type='sine';lfo.frequency.value=.72;depth.gain.value=300;
    lfo.connect(depth);depth.connect(osc.frequency);filter.type='lowpass';filter.frequency.value=1450;gain.gain.value=0;osc.connect(filter);filter.connect(gain);gain.connect(this.master);
    const t=c.currentTime;gain.gain.setTargetAtTime(.065,t,.06);osc.start();lfo.start();this.sirenNodes={osc,lfo,gain};
  }
  chime(){
    if(!this.start())return;
    const c=this.ctx,now=c.currentTime;
    // A little Westminster clock / cash-register flourish: soft, bright and brief.
    [659.25,830.61,987.77].forEach((hz,i)=>{
      const t=now+i*.105,o=c.createOscillator(),g=c.createGain(),filter=c.createBiquadFilter();
      o.type='sine';o.frequency.setValueAtTime(hz,t);filter.type='lowpass';filter.frequency.value=2500;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(i===2?.12:.075,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.52);
      o.connect(filter);filter.connect(g);g.connect(this.master);o.start(t);o.stop(t+.55);
    });
  }
  toggleMute(){
    this.muted=!this.muted;if(this.master&&this.ctx){this.master.gain.setTargetAtTime(this.muted?0:.68,this.ctx.currentTime,.025);}return this.muted;
  }
}
