import { PAL } from './palette';

/** Petit tremblement « fait main » pour les lignes. */
function wobble(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, amp: number) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
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

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return { c, g };
}

/**
 * Planches de bois cartoon (sol, murs, toit).
 * `width`/`height` en unités du monde (cm), `px` = pixels par unité.
 */
export function drawPlanks(
  width: number,
  height: number,
  opts: { px?: number; plank?: number; woods?: string[]; grain?: string; ink?: string; vertical?: boolean; nails?: boolean } = {},
): HTMLCanvasElement {
  const px = opts.px ?? 1.5;
  const { c, g } = canvas(Math.round(width * px), Math.round(height * px));
  g.scale(px, px);
  const plankH = opts.plank ?? 75;
  const woods = opts.woods ?? [PAL.woodA, PAL.woodB, PAL.woodC];
  const grain = opts.grain ?? 'rgba(138,74,34,0.35)';
  const ink = opts.ink ?? PAL.inkCss;
  if (opts.vertical) {
    // On dessine à l'horizontale dans un repère tourné.
    g.translate(width, 0);
    g.rotate(Math.PI / 2);
    [width, height] = [height, width];
  }
  for (let row = 0, y = 0; y < height; row++, y += plankH) {
    let x = row % 2 === 0 ? -120 : -40 - ((row * 37) % 160);
    while (x < width) {
      const w = 260 + ((((row * 131 + x * 7) % 220) + 220) % 220);
      g.fillStyle = woods[(((row * 3 + Math.floor(x / 97)) % woods.length) + woods.length) % woods.length];
      g.fillRect(x, y, w, plankH);
      g.strokeStyle = grain;
      g.lineWidth = 2.5;
      for (let v = 0; v < 3; v++) {
        const vy = y + plankH * (0.22 + v * 0.27) + Math.random() * 6;
        g.beginPath();
        g.moveTo(x + 20, vy);
        g.bezierCurveTo(x + w * 0.3, vy - 6, x + w * 0.6, vy + 6, x + w - 20, vy);
        g.stroke();
      }
      if (Math.random() < 0.35) {
        g.fillStyle = grain;
        g.beginPath();
        g.ellipse(x + 40 + Math.random() * (w - 80), y + plankH * (0.3 + Math.random() * 0.4), 11, 6, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (opts.nails !== false) {
        g.fillStyle = ink;
        for (const nx of [x + 14, x + w - 14]) {
          g.beginPath();
          g.arc(nx, y + plankH / 2, 3, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.strokeStyle = ink;
      g.lineWidth = 4;
      g.beginPath();
      wobble(g, x, y, x, y + plankH, 1.5);
      g.stroke();
      x += w;
    }
    g.strokeStyle = ink;
    g.lineWidth = 4;
    g.beginPath();
    wobble(g, 0, y, width, y, 2);
    g.stroke();
  }
  return c;
}

/** Texture ronde et douce (grains de lumière). */
export function softDot(): HTMLCanvasElement {
  const { c, g } = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,248,220,1)');
  grad.addColorStop(1, 'rgba(255,248,220,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** Ombre de contact (dégradé sombre) sous les objets. */
export function blobShadow(): HTMLCanvasElement {
  const { c, g } = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 62);
  grad.addColorStop(0, 'rgba(43,26,46,0.55)');
  grad.addColorStop(1, 'rgba(43,26,46,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

/** Carton : couleur kraft + scotch + petit dessin. */
export function cardboard(label: string): HTMLCanvasElement {
  const { c, g } = canvas(256, 256);
  g.fillStyle = '#d9a35b';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(138,74,34,0.25)';
  for (let k = 0; k < 18; k++) g.fillRect(0, k * 14 + 4, 256, 3);
  g.fillStyle = '#f2d9a0';
  g.fillRect(108, 0, 40, 256);
  g.strokeStyle = PAL.inkCss;
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 246);
  g.fillStyle = PAL.inkCss;
  g.font = '44px "Lilita One", sans-serif';
  g.textAlign = 'center';
  g.save();
  g.translate(128, 170);
  g.rotate(-0.12);
  g.fillText(label, 0, 0);
  g.restore();
  return c;
}
