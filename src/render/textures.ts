import { Rectangle, Texture } from 'pixi.js';
import { PAL } from './palette';

export interface Atlas {
  grains: Texture[];
  bunny: Texture;
  star: Texture;
  mote: Texture;
  confetti: Texture;
}

/** Échelle de dessin des textures (2× pour rester net sur les grands écrans). */
export const TEX_SCALE = 2;

/**
 * Dessine toutes les petites images du jeu sur un seul canevas (atlas),
 * pour que des milliers de particules s'affichent en un seul appel GPU.
 */
export function buildAtlas(): Atlas {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const ink = PAL.inkCss;

  // ── Grains de poussière : petites formes bancales avec contour.
  const grainFrames: Rectangle[] = [];
  for (let k = 0; k < 4; k++) {
    const ox = k * 20 + 2;
    const oy = 2;
    g.save();
    g.translate(ox + 8, oy + 8);
    g.beginPath();
    const pts = 6;
    for (let p = 0; p <= pts; p++) {
      const a = (p / pts) * Math.PI * 2;
      const r = 5.2 + Math.sin(a * (k + 2) + k) * 1.3;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * (0.8 + k * 0.06);
      if (p === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillStyle = ['#a99bbd', '#b8a99a', '#9c94ae', '#c2b5c9'][k];
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = ink;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.arc(-1.8, -1.8, 1.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
    grainFrames.push(new Rectangle(ox, oy, 16, 16));
  }

  // ── Mouton de poussière : boule duveteuse avec des yeux.
  {
    const cx = 120;
    const cy = 34;
    g.save();
    g.fillStyle = 'rgba(43,26,46,0.25)';
    g.beginPath();
    g.ellipse(cx + 3, cy + 6, 25, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    const tufts = 16;
    for (let p = 0; p <= tufts; p++) {
      const a = (p / tufts) * Math.PI * 2;
      const r = p % 2 === 0 ? 26 : 21;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (p === 0) g.moveTo(px, py);
      else g.quadraticCurveTo(cx + Math.cos(a - 0.2) * (r + 3), cy + Math.sin(a - 0.2) * (r + 3), px, py);
    }
    g.closePath();
    g.fillStyle = '#b4a8c6';
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = ink;
    g.stroke();
    // yeux
    for (const ex of [-7, 7]) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(cx + ex, cy - 3, 5, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = ink;
      g.beginPath();
      g.arc(cx + ex + 1.2, cy - 2, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  const bunnyFrame = new Rectangle(90, 4, 60, 60);

  // ── Poussière d'étoile : étoile dorée qui brille.
  {
    const cx = 178;
    const cy = 20;
    g.save();
    g.beginPath();
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
      const r = p % 2 === 0 ? 14 : 6;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (p === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillStyle = '#ffd23f';
    g.fill();
    g.lineWidth = 2.5;
    g.lineJoin = 'round';
    g.strokeStyle = ink;
    g.stroke();
    g.fillStyle = '#fffbe0';
    g.beginPath();
    g.arc(cx - 3, cy - 3, 2.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const starFrame = new Rectangle(162, 4, 32, 32);

  // ── Grain de lumière flottant (doux, sans contour).
  {
    const grad = g.createRadialGradient(220, 16, 0, 220, 16, 12);
    grad.addColorStop(0, 'rgba(255,248,220,1)');
    grad.addColorStop(1, 'rgba(255,248,220,0)');
    g.fillStyle = grad;
    g.fillRect(208, 4, 24, 24);
  }
  const moteFrame = new Rectangle(208, 4, 24, 24);

  // ── Confetti (rectangle blanc, teinté au rendu).
  g.fillStyle = '#fff';
  g.fillRect(2, 80, 12, 7);
  const confettiFrame = new Rectangle(2, 80, 12, 7);

  const base = Texture.from(c);
  const sub = (frame: Rectangle) => new Texture({ source: base.source, frame });
  return {
    grains: grainFrames.map(sub),
    bunny: sub(bunnyFrame),
    star: sub(starFrame),
    mote: sub(moteFrame),
    confetti: sub(confettiFrame),
  };
}

/** Petit tremblement « fait main » pour les lignes. */
function wobble(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, amp: number) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(2, Math.floor(len / 40));
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  g.moveTo(x0, y0);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const j = s === steps ? 0 : (Math.random() * 2 - 1) * amp;
    g.lineTo(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j);
  }
}

/** Sol du grenier : planches de bois cartoon avec contours bancals. */
export function buildAtticFloor(width: number, height: number): Texture {
  const S = TEX_SCALE;
  const c = document.createElement('canvas');
  c.width = width * S;
  c.height = height * S;
  const g = c.getContext('2d')!;
  g.scale(S, S);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  const plankH = 75;
  const woods = [PAL.woodA, PAL.woodB, PAL.woodC];
  for (let row = 0, y = 0; y < height; row++, y += plankH) {
    let x = row % 2 === 0 ? -120 : -40 - (row * 37) % 160;
    while (x < width) {
      const w = 260 + ((row * 131 + x * 7) % 220 + 220) % 220;
      g.fillStyle = woods[(((row * 3 + Math.floor(x / 97)) % 3) + 3) % 3];
      g.fillRect(x, y, w, plankH);
      // veinage
      g.strokeStyle = 'rgba(138,74,34,0.35)';
      g.lineWidth = 2.5;
      for (let v = 0; v < 3; v++) {
        const vy = y + 16 + v * 20 + Math.random() * 6;
        g.beginPath();
        g.moveTo(x + 20, vy);
        g.bezierCurveTo(x + w * 0.3, vy - 6, x + w * 0.6, vy + 6, x + w - 20, vy);
        g.stroke();
      }
      // nœud du bois
      if (Math.random() < 0.35) {
        const kx = x + 40 + Math.random() * (w - 80);
        const ky = y + 20 + Math.random() * (plankH - 40);
        g.fillStyle = 'rgba(138,74,34,0.55)';
        g.beginPath();
        g.ellipse(kx, ky, 11, 6, 0, 0, Math.PI * 2);
        g.fill();
      }
      // clous
      g.fillStyle = PAL.inkCss;
      for (const nx of [x + 14, x + w - 14]) {
        g.beginPath();
        g.arc(nx, y + plankH / 2, 3, 0, Math.PI * 2);
        g.fill();
      }
      // jointure verticale
      g.strokeStyle = PAL.inkCss;
      g.lineWidth = 4;
      g.beginPath();
      wobble(g, x, y, x, y + plankH, 1.5);
      g.stroke();
      x += w;
    }
    g.strokeStyle = PAL.inkCss;
    g.lineWidth = 4;
    g.beginPath();
    wobble(g, 0, y, width, y, 2);
    g.stroke();
  }

  // Tache de lumière de la lucarne.
  const light = g.createRadialGradient(width * 0.55, height * 0.38, 20, width * 0.55, height * 0.38, 420);
  light.addColorStop(0, 'rgba(255,240,190,0.45)');
  light.addColorStop(1, 'rgba(255,240,190,0)');
  g.fillStyle = light;
  g.fillRect(0, 0, width, height);

  // Ombres dans les coins.
  const shade = g.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.62);
  shade.addColorStop(0, 'rgba(43,26,46,0)');
  shade.addColorStop(1, 'rgba(43,26,46,0.45)');
  g.fillStyle = shade;
  g.fillRect(0, 0, width, height);

  // Bordure épaisse.
  g.strokeStyle = PAL.inkCss;
  g.lineWidth = 10;
  g.strokeRect(5, 5, width - 10, height - 10);

  const tex = Texture.from(c);
  return tex;
}
