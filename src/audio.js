/**
 * Everything is synthesised with the Web Audio API — no sound files to load.
 * Nothing starts until the first click, because browsers block audio before that.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.lastGatling = 0;
    this.lastStep = 0;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // a second of white noise, reused for everything percussive
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  /* ---------- primitives ---------- */

  noise({ dur = 0.1, gain = 0.3, type = 'lowpass', freq = 1200, q = 1, sweepTo = null }) {
    if (!this.ctx) return;
    const t = this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    filt.Q.value = q;
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  tone({ freq = 220, dur = 0.12, gain = 0.2, type = 'square', to = null }) {
    if (!this.ctx) return;
    const t = this.now;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /* ---------- the kit ---------- */

  gatling() {
    if (!this.ctx) return;
    // throttle: the gun fires faster than it needs distinct sounds
    if (this.now - this.lastGatling < 0.045) return;
    this.lastGatling = this.now;
    this.noise({ dur: 0.07, gain: 0.3, type: 'bandpass', freq: 1700, q: 0.9, sweepTo: 420 });
    this.tone({ freq: 150, to: 60, dur: 0.06, gain: 0.16, type: 'square' });
  }

  missileLaunch() {
    this.noise({ dur: 0.5, gain: 0.34, type: 'lowpass', freq: 900, sweepTo: 2600 });
    this.tone({ freq: 420, to: 90, dur: 0.35, gain: 0.14, type: 'sawtooth' });
  }

  explosion() {
    this.noise({ dur: 0.75, gain: 0.5, type: 'lowpass', freq: 1400, sweepTo: 70 });
    this.tone({ freq: 90, to: 28, dur: 0.6, gain: 0.3, type: 'square' });
  }

  rifle() {
    if (!this.ctx) return;
    this.noise({ dur: 0.09, gain: 0.16, type: 'bandpass', freq: 2400, q: 1.1, sweepTo: 600 });
    this.tone({ freq: 240, to: 70, dur: 0.07, gain: 0.08, type: 'square' });
  }

  enemyShoot() {
    this.tone({ freq: 760, to: 200, dur: 0.14, gain: 0.1, type: 'sawtooth' });
  }

  enemyHit() {
    this.noise({ dur: 0.05, gain: 0.17, type: 'bandpass', freq: 2600, q: 2 });
  }

  enemyDeath() {
    this.noise({ dur: 0.3, gain: 0.34, type: 'lowpass', freq: 700, sweepTo: 150 });
    this.tone({ freq: 300, to: 55, dur: 0.26, gain: 0.14, type: 'sawtooth' });
  }

  hit() {
    this.noise({ dur: 0.22, gain: 0.3, type: 'lowpass', freq: 500, sweepTo: 90 });
    this.tone({ freq: 110, to: 40, dur: 0.2, gain: 0.2, type: 'square' });
  }

  melee() {
    this.noise({ dur: 0.14, gain: 0.3, type: 'bandpass', freq: 900, q: 1.4 });
  }

  step() {
    if (!this.ctx) return;
    if (this.now - this.lastStep < 0.15) return;
    this.lastStep = this.now;
    this.noise({ dur: 0.2, gain: 0.26, type: 'lowpass', freq: 280, sweepTo: 55 });
    this.tone({ freq: 62, to: 32, dur: 0.17, gain: 0.22, type: 'square' });
  }

  land() {
    this.noise({ dur: 0.34, gain: 0.4, type: 'lowpass', freq: 400, sweepTo: 45 });
    this.tone({ freq: 70, to: 26, dur: 0.3, gain: 0.3, type: 'square' });
  }

  thruster() {
    this.noise({ dur: 0.34, gain: 0.26, type: 'highpass', freq: 500, sweepTo: 2800 });
  }

  reload() {
    this.tone({ freq: 480, to: 170, dur: 0.14, gain: 0.12, type: 'square' });
    this.noise({ dur: 0.18, gain: 0.14, type: 'bandpass', freq: 1100, q: 2 });
  }

  reloadDone() {
    this.tone({ freq: 300, to: 760, dur: 0.16, gain: 0.13, type: 'square' });
  }

  pickup() {
    this.tone({ freq: 520, to: 1200, dur: 0.2, gain: 0.14, type: 'triangle' });
  }

  waveStart() {
    this.tone({ freq: 160, to: 320, dur: 0.5, gain: 0.16, type: 'sawtooth' });
    this.noise({ dur: 0.6, gain: 0.12, type: 'lowpass', freq: 600 });
  }
}
