/**
 * All sounds are synthesised with Web Audio: no files, nothing to download.
 *
 * - peg:    short metallic tick, pitch rises as the ball goes down; rate-limited so
 *           50 balls make a soft rattle, not a buzz;
 * - land:   amp "thump" (falling sine + noise), brighter for better multipliers;
 * - bigWin: distorted power chord with a rising sweep.
 *
 * A compressor on the master bus keeps many overlapping sounds from clipping.
 * The AudioContext is created on the first user gesture (browser autoplay rules).
 */

const PEG_MIN_GAP = 0.028; // s between peg ticks, across all balls
const LAND_MIN_GAP = 0.04;

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private distortion: WaveShaperNode | null = null;
  private muted = false;
  private lastPeg = 0;
  private lastLand = 0;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
    }
  }

  /** Call from a user gesture (pointerdown / keydown). Safe to call many times. */
  unlock(): void {
    if (!this.ctx) this.create();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private create(): void {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 6;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.8;
      master.connect(compressor).connect(ctx.destination);

      const noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      const distortion = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 6);
      }
      distortion.curve = curve;

      this.ctx = ctx;
      this.master = master;
      this.noise = noise;
      this.distortion = distortion;
    } catch {
      this.ctx = null;
    }
  }

  private ready(): AudioContext | null {
    if (this.muted || !this.ctx || !this.master || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  /** Ball touched a peg on `row` of `rows`. */
  peg(row: number, rows: number): void {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    if (t - this.lastPeg < PEG_MIN_GAP) return;
    this.lastPeg = t;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 1100 + (row / rows) * 700 + Math.random() * 60;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  /** Ball landed in a bin paying `multiplier`. */
  land(multiplier: number): void {
    const ctx = this.ready();
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    if (t - this.lastLand < LAND_MIN_GAP) return;
    this.lastLand = t;
    const win = multiplier >= 1;

    // Kick: falling sine.
    const kick = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kick.frequency.setValueAtTime(win ? 150 : 110, t);
    kick.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    kickGain.gain.setValueAtTime(win ? 0.45 : 0.3, t);
    kickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    kick.connect(kickGain).connect(this.master);
    kick.start(t);
    kick.stop(t + 0.25);

    // Grille rattle: short band-passed noise.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = win ? 2400 : 900;
    band.Q.value = 1.2;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(win ? 0.12 : 0.06, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    noise.connect(band).connect(noiseGain).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.15);

    // Winning bins add a short bright pluck; higher multiplier, higher note.
    if (win) {
      const note = 330 * 2 ** (Math.min(4, Math.log2(multiplier + 1)) / 2);
      this.pluck(ctx, t, note, 0.08, 0.25);
    }
  }

  /** Big win: distorted E5 power chord with a rising sweep. */
  bigWin(): void {
    const ctx = this.ready();
    if (!ctx || !this.master || !this.distortion) return;
    const t = ctx.currentTime;

    const pre = ctx.createGain();
    pre.gain.value = 0.35;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(900, t);
    tone.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
    out.gain.setValueAtTime(0.32, t + 0.5);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    pre.connect(this.distortion).connect(tone).connect(out).connect(this.master);

    for (const freq of [82.41, 123.47, 164.81]) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.connect(pre);
        osc.start(t);
        osc.stop(t + 1.7);
      }
    }
    this.pluck(ctx, t + 0.08, 659.25, 0.12, 0.6);
    this.pluck(ctx, t + 0.2, 987.77, 0.1, 0.7);
  }

  private pluck(ctx: AudioContext, t: number, freq: number, level: number, length: number) {
    if (!this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 6, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.5, t + length);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
}
