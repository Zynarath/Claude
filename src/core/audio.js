// Tiny synthesized sound engine (no audio assets needed).
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.ambient = null;
  }

  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
    } catch {
      return false;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  resume() {
    if (this.ensure() && this.ctx.state === 'suspended') this.ctx.resume();
  }

  noise({ dur = 0.15, freq = 800, q = 1, type = 'bandpass', gain = 0.5, attack = 0.005, sweep = 0, distGain = 1 } = {}) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * distGain + 0.0001, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, dur = 0.2, type = 'sine', gain = 0.3, slide = 0, attack = 0.01, delay = 0, distGain = 1 } = {}) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * distGain + 0.0001, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, dist = 0) {
    const dg = Math.max(0, 1 - dist / 80);
    if (dg <= 0.01) return;
    switch (name) {
      case 'punch': this.noise({ dur: 0.12, freq: 300, q: 0.8, gain: 0.5, distGain: dg }); break;
      case 'wood': this.noise({ dur: 0.18, freq: 500, q: 2, gain: 0.6, distGain: dg }); this.tone({ freq: 180, dur: 0.12, type: 'triangle', gain: 0.2, distGain: dg }); break;
      case 'stone': this.noise({ dur: 0.14, freq: 1800, q: 3, gain: 0.5, distGain: dg }); this.tone({ freq: 900, dur: 0.06, type: 'square', gain: 0.05, distGain: dg }); break;
      case 'flesh': this.noise({ dur: 0.2, freq: 400, q: 1, gain: 0.55, sweep: 0.5, distGain: dg }); break;
      case 'swing': this.noise({ dur: 0.15, freq: 1200, q: 0.7, gain: 0.15, sweep: 0.4, type: 'bandpass', distGain: dg }); break;
      case 'pickup': this.tone({ freq: 660, dur: 0.08, type: 'triangle', gain: 0.12 }); this.tone({ freq: 990, dur: 0.1, type: 'triangle', gain: 0.1, delay: 0.05 }); break;
      case 'bush': this.noise({ dur: 0.25, freq: 2500, q: 0.6, gain: 0.25, sweep: 0.6, distGain: dg }); break;
      case 'craft': this.tone({ freq: 520, dur: 0.12, type: 'triangle', gain: 0.12 }); this.tone({ freq: 780, dur: 0.15, type: 'triangle', gain: 0.12, delay: 0.08 }); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.35, type: 'triangle', gain: 0.15, delay: i * 0.09 })); break;
      case 'ui': this.tone({ freq: 880, dur: 0.05, type: 'sine', gain: 0.08 }); break;
      case 'error': this.tone({ freq: 220, dur: 0.15, type: 'square', gain: 0.06 }); break;
      case 'hurt': this.noise({ dur: 0.25, freq: 250, q: 1, gain: 0.6 }); this.tone({ freq: 160, dur: 0.2, type: 'sawtooth', gain: 0.1, slide: 0.6 }); break;
      case 'eat': this.noise({ dur: 0.1, freq: 900, q: 2, gain: 0.3 }); this.noise({ dur: 0.1, freq: 700, q: 2, gain: 0.3 }); break;
      case 'drink': [0, 0.12, 0.24].forEach((d) => this.tone({ freq: 300, dur: 0.1, type: 'sine', gain: 0.15, slide: 1.8, delay: d })); break;
      case 'splash': this.noise({ dur: 0.4, freq: 1200, q: 0.5, gain: 0.4, sweep: 0.3, distGain: dg }); break;
      case 'bow': this.tone({ freq: 180, dur: 0.15, type: 'triangle', gain: 0.2, slide: 2 }); this.noise({ dur: 0.1, freq: 3000, q: 1, gain: 0.15 }); break;
      case 'gun': this.noise({ dur: 0.35, freq: 600, q: 0.4, gain: 0.9, sweep: 0.2, type: 'lowpass' }); break;
      case 'build': this.noise({ dur: 0.25, freq: 400, q: 1, gain: 0.5 }); this.tone({ freq: 140, dur: 0.2, type: 'triangle', gain: 0.25 }); break;
      case 'door': this.tone({ freq: 120, dur: 0.3, type: 'sawtooth', gain: 0.06, slide: 1.4 }); break;
      case 'fire': this.noise({ dur: 0.6, freq: 900, q: 0.3, gain: 0.2 }); break;
      case 'death': this.tone({ freq: 220, dur: 1.2, type: 'sawtooth', gain: 0.1, slide: 0.3 }); break;
      case 'tame': [392, 523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.5, type: 'sine', gain: 0.15, delay: i * 0.12 })); break;
      case 'whistle': this.tone({ freq: 1400, dur: 0.25, type: 'sine', gain: 0.12, slide: 1.4 }); break;
      case 'drop': this.tone({ freq: 90, dur: 0.6, type: 'sine', gain: 0.4, slide: 0.5 }); break;
      default: break;
    }
  }

  // Creature vocalisation shaped by size: small = chirp, large = roar
  creature(kind, size, dist) {
    const dg = Math.max(0, 1 - dist / (40 + size * 25));
    if (dg <= 0.02) return;
    const base = 900 / (0.6 + size);
    if (kind === 'roar') {
      this.noise({ dur: 0.6 + size * 0.2, freq: base * 0.8, q: 1.5, gain: 0.5, attack: 0.08, sweep: 0.6, distGain: dg, type: 'bandpass' });
      this.tone({ freq: base * 0.3, dur: 0.5 + size * 0.2, type: 'sawtooth', gain: 0.12, slide: 0.7, distGain: dg, attack: 0.05 });
    } else if (kind === 'chirp') {
      this.tone({ freq: base * 2, dur: 0.12, type: 'triangle', gain: 0.1, slide: 1.4, distGain: dg });
      this.tone({ freq: base * 2.4, dur: 0.1, type: 'triangle', gain: 0.08, slide: 1.2, delay: 0.12, distGain: dg });
    } else if (kind === 'hurt') {
      this.noise({ dur: 0.3, freq: base, q: 2, gain: 0.35, sweep: 1.5, distGain: dg });
    } else if (kind === 'bite') {
      this.noise({ dur: 0.12, freq: 500, q: 1, gain: 0.5, distGain: dg });
    }
  }

  startAmbient() {
    if (!this.ensure() || this.ambient) return;
    // wind / surf bed
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.ambient = { src, f, g };
  }

  setAmbient(intensity, rain) {
    if (!this.ambient) return;
    const t = this.ctx.currentTime;
    this.ambient.g.gain.setTargetAtTime(0.03 + intensity * 0.05 + rain * 0.12, t, 0.5);
    this.ambient.f.frequency.setTargetAtTime(400 + rain * 1800, t, 0.5);
  }
}
