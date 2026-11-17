import type { DirtId } from '../data/dirtTypes';

/** Gamme pentatonique : n'importe quelle suite de notes sonne bien. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

/**
 * Sons générés en direct avec Web Audio : pas de fichiers à télécharger.
 */
export class Synth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private swishGain!: GainNode;
  private swishFilter!: BiquadFilterNode;
  private lastBlip = 0;
  private muted = false;

  /** À appeler suite à un clic (les navigateurs l'exigent). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // « Shhh » du balai : bruit filtré en boucle dont on module le volume.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.6 + (Math.random() * 2 - 1) * 0.4;
      data[i] = last;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.swishFilter = ctx.createBiquadFilter();
    this.swishFilter.type = 'bandpass';
    this.swishFilter.frequency.value = 1600;
    this.swishFilter.Q.value = 0.8;
    this.swishGain = ctx.createGain();
    this.swishGain.gain.value = 0;
    src.connect(this.swishFilter).connect(this.swishGain).connect(this.master);
    src.start();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  /** Volume du balayage selon la vitesse et la quantité de poussière poussée. */
  swish(speed: number, pushed: number): void {
    if (!this.ctx) return;
    const s = Math.min(1, speed / 1400);
    const p = Math.min(1, pushed / 60);
    const target = 0.02 * s + 0.22 * s * p;
    const t = this.ctx.currentTime;
    this.swishGain.gain.setTargetAtTime(target, t, 0.06);
    this.swishFilter.frequency.setTargetAtTime(900 + 1800 * s, t, 0.08);
  }

  /** Petit « tic » de ramassage, plus aigu quand le combo monte. */
  collect(type: DirtId, comboLevel: number, count: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (type !== 'star' && now - this.lastBlip < 0.045) return;
    this.lastBlip = now;
    if (type === 'star') {
      [0, 4, 7, 12].forEach((n, k) => this.tone(880 * 2 ** (n / 12), now + k * 0.06, 0.18, 'triangle', 0.16));
      return;
    }
    if (type === 'bunny') {
      this.tone(220 + comboLevel * 30, now, 0.12, 'sine', 0.22, 0.5);
      return;
    }
    const step = PENTA[Math.min(PENTA.length - 1, comboLevel * 2 + Math.floor(Math.random() * 3))];
    const vol = Math.min(0.14, 0.05 + count * 0.004);
    this.tone(520 * 2 ** (step / 12), now, 0.07, 'triangle', vol);
  }

  /** Accord joyeux (pièce propre, achat…). */
  fanfare(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [0, 4, 7, 12, 16, 19, 24].forEach((n, k) => this.tone(392 * 2 ** (n / 12), now + k * 0.07, 0.35, 'square', 0.06));
  }

  click(): void {
    if (!this.ctx) return;
    this.tone(660, this.ctx.currentTime, 0.06, 'square', 0.05, 1.5);
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, slide = 1): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * slide, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }
}
