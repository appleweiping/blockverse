// Procedurally synthesized sound effects (WebAudio). No audio files —
// every sound is generated from noise bursts and oscillators.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.5;
    this._noiseBuf = null;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // 1s of white noise, reused by every noise-based effect
      const len = this.ctx.sampleRate;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  resume() {
    if (this.ensure() && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // Filtered noise burst: the workhorse for digging/steps.
  noise({ freq = 800, q = 1, dur = 0.1, gain = 0.5, type = 'bandpass', pitchDrop = 0 }) {
    if (!this.ensure() || this.ctx.state === 'suspended') return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (pitchDrop) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq - pitchDrop), t + dur);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  tone({ freq = 440, endFreq = null, dur = 0.15, gain = 0.25, type = 'square' }) {
    if (!this.ensure() || this.ctx.state === 'suspended') return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Per-material noise colors for block sounds.
  materialParams(block) {
    switch (block) {
      case 'stone': return { freq: 520, q: 0.8, type: 'bandpass' };
      case 'dirt': return { freq: 300, q: 0.6, type: 'lowpass' };
      case 'sand': return { freq: 900, q: 0.4, type: 'highpass' };
      case 'wood': return { freq: 380, q: 2.2, type: 'bandpass' };
      case 'leaf': return { freq: 1600, q: 0.5, type: 'highpass' };
      case 'glass': return { freq: 2400, q: 3, type: 'bandpass' };
      case 'cloth': return { freq: 500, q: 0.3, type: 'lowpass' };
      default: return { freq: 600, q: 1, type: 'bandpass' };
    }
  }

  play(name, opts = {}) {
    const m = this.materialParams(opts.block ?? 'stone');
    const detune = 0.85 + Math.random() * 0.3;
    switch (name) {
      case 'hit':
        this.noise({ ...m, freq: m.freq * detune, dur: 0.06, gain: 0.22 });
        break;
      case 'break':
        this.noise({ ...m, freq: m.freq * detune, dur: 0.16, gain: 0.5, pitchDrop: m.freq * 0.4 });
        break;
      case 'place':
        this.noise({ ...m, freq: m.freq * detune * 1.1, dur: 0.1, gain: 0.4 });
        break;
      case 'step':
        this.noise({ ...m, freq: m.freq * detune * 0.8, dur: 0.05, gain: 0.12 });
        break;
      case 'hurt':
        this.tone({ freq: 260 * detune, endFreq: 130, dur: 0.22, gain: 0.3, type: 'sawtooth' });
        break;
      case 'pickup':
        this.tone({ freq: 620 * detune, endFreq: 1240, dur: 0.09, gain: 0.18, type: 'sine' });
        break;
      case 'eat':
        this.noise({ freq: 420 * detune, q: 1.5, dur: 0.09, gain: 0.3, type: 'bandpass' });
        setTimeout(() => this.noise({ freq: 380, q: 1.5, dur: 0.09, gain: 0.25, type: 'bandpass' }), 130);
        break;
      case 'click':
        this.tone({ freq: 880, dur: 0.04, gain: 0.12, type: 'square' });
        break;
      case 'toolbreak':
        this.tone({ freq: 500, endFreq: 120, dur: 0.3, gain: 0.35, type: 'square' });
        break;
      case 'gust':
        this.noise({ freq: 900, q: 0.5, dur: 0.7, gain: 0.22, type: 'bandpass', pitchDrop: 650 });
        break;
      case 'splash':
        this.noise({ freq: 1100, q: 0.4, dur: 0.25, gain: 0.35, type: 'highpass', pitchDrop: 600 });
        break;
    }
  }
}
