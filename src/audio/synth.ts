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
  private lastUi = 0;
  private muted = false;
  private muffle!: BiquadFilterNode;
  private noiseBuf!: AudioBuffer;

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
    // Filtre « étouffé » : utilisé quand le jeu est en pause.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle).connect(comp).connect(ctx.destination);

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
    this.noiseBuf = buf;
  }

  // ───────────────────────────── Sons de l'interface ─────────────────────────────

  /** Survol d'un bouton : petit « tic » très discret. */
  hover(): void {
    if (!this.ready() || this.now() - this.lastUi < 0.04) return;
    this.lastUi = this.now();
    this.tone(1900 + Math.random() * 200, this.now(), 0.025, 'sine', 0.025);
  }

  /** Clic sur un bouton : « pop » qui descend. */
  press(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(880, t, 0.07, 'sine', 0.11, 0.55);
    this.tone(1760, t, 0.03, 'triangle', 0.03);
  }

  /** Ouverture d'un panneau : glissando qui monte + souffle. */
  open(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(330, t, 0.16, 'triangle', 0.07, 2.4);
    this.noise(t, 0.18, 600, 3200, 0.05);
  }

  /** Fermeture d'un panneau : glissando qui descend. */
  close(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(780, t, 0.14, 'triangle', 0.06, 0.45);
    this.noise(t, 0.14, 2800, 500, 0.04);
  }

  /** Carte du château : froissement de papier. */
  paper(): void {
    if (!this.ready()) return;
    const t = this.now();
    for (let k = 0; k < 4; k++) this.noise(t + k * 0.05 + Math.random() * 0.02, 0.06, 1500 + Math.random() * 2500, 900 + Math.random() * 3000, 0.07);
  }

  /** Notification : petit carillon à deux notes. */
  chime(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(1318.5, t, 0.25, 'triangle', 0.06);
    this.tone(1975.5, t + 0.09, 0.35, 'triangle', 0.05);
  }

  /** Arrivée dans un nouveau lieu : cloche douce. */
  bell(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(523.25, t, 0.9, 'sine', 0.06);
    this.tone(784, t, 0.7, 'sine', 0.035);
    this.tone(1046.5, t + 0.02, 0.5, 'sine', 0.02);
  }

  /** Changement d'outil : « swoosh » + note. */
  tool(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.noise(t, 0.1, 900, 4000, 0.05);
    this.tone(660, t + 0.03, 0.09, 'square', 0.035, 1.5);
  }

  /** Action impossible (outil verrouillé, pas assez de pièces) : « bonk » grave. */
  denied(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(196, t, 0.09, 'square', 0.05, 0.85);
    this.tone(147, t + 0.1, 0.14, 'square', 0.05, 0.85);
  }

  /** Cadenas qui saute puis porte qui grince. */
  unlockDoor(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(2400, t, 0.03, 'square', 0.06);
    this.tone(1600, t + 0.05, 0.05, 'square', 0.05);
    // Grincement : dent de scie grave qui ondule, filtrée.
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t + 0.15);
    osc.frequency.linearRampToValueAtTime(95, t + 0.9);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 23;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 14;
    lfo.connect(lfoGain).connect(osc.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    osc.connect(f).connect(g).connect(this.master);
    osc.start(t + 0.15);
    lfo.start(t + 0.15);
    osc.stop(t + 1);
    lfo.stop(t + 1);
  }

  /** Une porte verrouillée apparaît devant soi : cliquetis de cadenas. */
  rattle(): void {
    if (!this.ready()) return;
    const t = this.now();
    for (let k = 0; k < 3; k++) this.tone(2600 + k * 300, t + k * 0.045, 0.025, 'square', 0.025);
  }

  /** Le combo passe un palier : note qui monte avec le palier. */
  comboUp(level: number): void {
    if (!this.ready()) return;
    const t = this.now();
    const base = 523.25 * 2 ** ((level * 4) / 12);
    this.tone(base, t, 0.12, 'triangle', 0.07);
    this.tone(base * 1.5, t + 0.07, 0.18, 'triangle', 0.06);
  }

  /** « Voix » d'un personnage : un petit bip par lettre (hauteur propre à chacun). */
  voice(pitch: number, char: string): void {
    if (!this.ready()) return;
    if (/[\s.,!?…'’«»:;—-]/.test(char)) return;
    const t = this.now();
    // La hauteur varie selon la lettre : ça « parle » sans vraiment parler.
    const v = (char.toLowerCase().charCodeAt(0) % 7) / 7;
    this.tone(pitch * (0.85 + v * 0.35), t, 0.045, 'square', 0.022, 0.92);
  }

  /**
   * Achat d'un niveau dans l'arbre : « ka-tching » + une note de la gamme qui
   * monte avec la profondeur du nœud. Plus on avance dans l'arbre, plus l'arbre « chante ».
   */
  buy(depth: number, lvl: number): void {
    if (!this.ready()) return;
    const t = this.now();
    // Pièces qui tintent.
    this.tone(2637, t, 0.05, 'square', 0.035);
    this.tone(3136, t + 0.04, 0.08, 'square', 0.03);
    const step = PENTA[Math.min(PENTA.length - 1, Math.round(depth * 2) + (lvl % 3))];
    this.tone(523.25 * 2 ** (step / 12), t + 0.06, 0.35, 'triangle', 0.09);
  }

  /** Remboursement : les pièces reviennent (arpège qui descend). */
  refund(): void {
    if (!this.ready()) return;
    const t = this.now();
    [12, 7, 4, 0].forEach((n, k) => this.tone(523.25 * 2 ** (n / 12), t + k * 0.05, 0.16, 'triangle', 0.06));
    this.tone(3136, t + 0.22, 0.05, 'square', 0.03);
    this.tone(2637, t + 0.26, 0.08, 'square', 0.03);
  }

  /** Nœud au maximum : accord doux, le nœud fleurit. */
  nodeMaxed(): void {
    if (!this.ready()) return;
    const t = this.now();
    [0, 4, 7, 12].forEach((n, k) => this.tone(659.25 * 2 ** (n / 12), t + k * 0.03, 0.6, 'sine', 0.05));
    this.tone(2637, t, 0.05, 'square', 0.03);
  }

  /** Grand nœud débloqué : fanfare et cloche. */
  bigNode(): void {
    if (!this.ready()) return;
    this.fanfare();
    setTimeout(() => this.bell(), 350);
  }

  /** Ouverture de l'arbre : bruissement de feuilles. */
  leaves(): void {
    if (!this.ready()) return;
    const t = this.now();
    for (let k = 0; k < 7; k++) this.noise(t + k * 0.035 + Math.random() * 0.03, 0.09, 2500 + Math.random() * 3500, 1800 + Math.random() * 3000, 0.035);
    this.tone(392, t, 0.25, 'triangle', 0.05, 1.5);
  }

  /** Courant d'air : long souffle filtré. */
  wind(): void {
    if (!this.ready()) return;
    const t = this.now();
    for (let k = 0; k < 6; k++) this.noise(t + k * 0.35, 1.2, 300 + k * 60, 900 + k * 120, 0.03);
  }

  /** Pot renversé : choc sourd puis débris. */
  crash(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(110, t, 0.18, 'sine', 0.12, 0.5);
    this.noise(t, 0.25, 1200, 5000, 0.08);
    for (let k = 0; k < 6; k++) this.noise(t + 0.12 + k * 0.05 + Math.random() * 0.04, 0.05, 3000 + Math.random() * 3000, 2500, 0.03);
  }

  /** Pièce brillante : tintement métallique. */
  coin(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(1568, t, 0.12, 'square', 0.03);
    this.tone(2093, t + 0.07, 0.4, 'triangle', 0.05);
  }

  /** Pluie d'étoiles : arpège scintillant. */
  sparkle(): void {
    if (!this.ready()) return;
    const t = this.now();
    for (let k = 0; k < 8; k++) this.tone(1046.5 * 2 ** (PENTA[k] / 12), t + k * 0.07, 0.3, 'triangle', 0.035);
  }

  /** Pause : tout le son devient étouffé (comme à travers une porte). */
  setMuffled(on: boolean): void {
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(on ? 700 : 20000, this.ctx.currentTime, 0.12);
  }

  private ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  private now(): number {
    return this.ctx!.currentTime;
  }

  /** Souffle filtré (le filtre glisse de `f0` à `f1`). */
  private noise(at: number, dur: number, f0: number, f1: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(at, Math.random() * 1.5);
    src.stop(at + dur + 0.02);
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

/** Le synthétiseur du jeu (un seul pour tout le monde : jeu et interface). */
export const sfx = new Synth();
