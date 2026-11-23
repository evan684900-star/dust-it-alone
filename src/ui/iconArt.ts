/**
 * Icônes dessinées à la main pour remplacer les emojis (même style que le jeu :
 * gros contour encre, couleurs franches, petites imperfections).
 * Chaque icône est un morceau de SVG dans une boîte 32 × 32.
 */

const INK = '#2b1a2e';
const C = {
  cream: '#fff3d6',
  paper: '#f6e7c4',
  gold: '#ffd35a',
  goldD: '#e8a83a',
  orange: '#ff9a4a',
  red: '#ff5a4e',
  redD: '#c9372c',
  green: '#7bd651',
  greenD: '#4aa63a',
  blue: '#5ec8f2',
  blueD: '#3a8ab8',
  purple: '#c38bff',
  pink: '#ff8ad8',
  brown: '#a0663a',
  brownD: '#6a3f22',
  grey: '#b7adb9',
  greyD: '#7d7480',
  white: '#ffffff',
  dark: '#3a2a44',
  skin: '#f2c9a0',
};

// Petites briques de dessin.
const circ = (cx: number, cy: number, r: number, f: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"/>`;
const ell = (cx: number, cy: number, rx: number, ry: number, f: string, rot = 0) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''}/>`;
const rect = (x: number, y: number, w: number, h: number, f: string, rx = 2, rot = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f}"${rot ? ` transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"` : ''}/>`;
const path = (d: string, f = 'none') => `<path d="${d}" fill="${f}"/>`;
const poly = (pts: string, f: string) => `<polygon points="${pts}" fill="${f}"/>`;
const line = (x1: number, y1: number, x2: number, y2: number, w = 2.2) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke-width="${w}"/>`;
/** Trait sans contour (reflets, détails). */
const shine = (d: string, f = 'rgba(255,255,255,0.7)') => `<path d="${d}" fill="${f}" stroke="none"/>`;
/** Étoile à 5 branches. */
function star5(cx: number, cy: number, R: number, r: number, f: string): string {
  let pts = '';
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r : R;
    pts += `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)} `;
  }
  return poly(pts, f);
}
/** Étoile à 4 branches (scintillement). */
function star4(cx: number, cy: number, R: number, f: string): string {
  const r = R * 0.32;
  return path(`M${cx} ${cy - R}Q${cx + r * 0.4} ${cy - r * 0.4} ${cx + R} ${cy}Q${cx + r * 0.4} ${cy + r * 0.4} ${cx} ${cy + R}Q${cx - r * 0.4} ${cy + r * 0.4} ${cx - R} ${cy}Q${cx - r * 0.4} ${cy - r * 0.4} ${cx} ${cy - R}Z`, f);
}
/** Engrenage. */
function gear(cx: number, cy: number, R: number, f: string): string {
  let d = '';
  const teeth = 8;
  for (let k = 0; k < teeth * 2; k++) {
    const a0 = (k * Math.PI) / teeth;
    const a1 = ((k + 1) * Math.PI) / teeth;
    const r = k % 2 ? R * 0.78 : R;
    d += `${k ? 'L' : 'M'}${(cx + Math.cos(a0) * r).toFixed(1)} ${(cy + Math.sin(a0) * r).toFixed(1)}L${(cx + Math.cos(a1) * r).toFixed(1)} ${(cy + Math.sin(a1) * r).toFixed(1)}`;
  }
  return path(d + 'Z', f) + circ(cx, cy, R * 0.32, C.cream);
}
const heart = (cx: number, cy: number, s: number, f: string) =>
  path(`M${cx} ${cy + 9 * s}C${cx - 13 * s} ${cy + 1 * s} ${cx - 9 * s} ${cy - 10 * s} ${cx} ${cy - 4 * s}C${cx + 9 * s} ${cy - 10 * s} ${cx + 13 * s} ${cy + 1 * s} ${cx} ${cy + 9 * s}Z`, f);
const eyes = (x1: number, x2: number, y: number, r = 1.4) => `<circle cx="${x1}" cy="${y}" r="${r}" fill="${INK}" stroke="none"/><circle cx="${x2}" cy="${y}" r="${r}" fill="${INK}" stroke="none"/>`;

const BROOM = line(25, 4, 13, 18, 3) + `<path d="M25 4L13 18" stroke="${C.brown}" stroke-width="1.4" fill="none"/>` + path('M9 15L17 22L12 29L3 24Z', C.gold) + path('M9 15L17 22L15.5 24L7.5 17Z', C.red) + line(6, 25, 9, 21, 1.2) + line(9, 27, 12, 23, 1.2);
const COIN = circ(16, 16, 12, C.gold) + circ(16, 16, 8, C.goldD) + star4(16, 16, 5.5, C.gold) + shine('M8 12Q10 6 15 5Q11 7.5 9.5 12Z');
const STAR = star5(16, 17, 13, 5.6, C.gold) + shine('M13 9L15 5L16 10Z');
const SPARK = star4(13, 17, 11, C.gold) + star4(24, 8, 5.5, C.cream) + star4(25, 24, 3.6, C.gold);
const TREE = rect(13.5, 18, 5, 11, C.brown, 1) + circ(10, 15, 6.5, C.greenD) + circ(22, 15, 6.5, C.greenD) + circ(16, 10, 8, C.green) + shine('M11 7Q14 4 18 5Q14 6 12 9Z');
const SHEEP = circ(9, 15, 5, C.white) + circ(15, 12, 6, C.white) + circ(21, 14, 5.5, C.white) + circ(14, 19, 6, C.white) + circ(21, 19, 5, C.white) + ell(7, 18, 4, 4.8, C.dark) + eyes(5.5, 8.5, 17.5, 0.9) + line(12, 24, 12, 28) + line(20, 23, 20, 28);
const LOCK = path('M10 15V11Q10 5 16 5Q22 5 22 11V15', 'none') + rect(7, 14, 18, 14, C.gold, 3) + circ(16, 20, 2.2, C.dark) + line(16, 21, 16, 24, 2);
const UNLOCK = path('M10 15V10Q10 4 16 4Q21 4 22 8', 'none') + rect(7, 14, 18, 14, C.gold, 3) + circ(16, 20, 2.2, C.dark) + line(16, 21, 16, 24, 2);
const FEATHER = path('M7 27Q8 13 22 4Q27 11 18 20Q13 25 7 27Z', C.cream) + path('M7 27Q14 17 21 8', 'none') + line(13, 18, 17, 20, 1.3) + line(15, 14, 19, 15, 1.3);
const BOOK = path('M3 8Q9 6 16 9Q23 6 29 8V26Q23 24 16 27Q9 24 3 26Z', C.cream) + line(16, 9, 16, 27) + line(6, 12, 13, 13, 1.2) + line(6, 16, 13, 17, 1.2) + line(19, 13, 26, 12, 1.2) + line(19, 17, 26, 16, 1.2);
const SCROLL = path('M8 6H24Q27 6 27 9V24Q27 27 24 27H11', C.paper) + rect(5, 4, 6, 25, C.gold, 3) + line(14, 11, 23, 11, 1.4) + line(14, 15, 23, 15, 1.4) + line(14, 19, 21, 19, 1.4);
const CASTLE = rect(5, 13, 22, 15, C.grey, 1) + path('M4 13V6H8V9H11V6H15V13Z', C.grey) + path('M17 13V6H21V9H24V6H28V13Z', C.grey) + path('M12 28V22Q16 17 20 22V28Z', C.brownD) + rect(7, 16, 3, 4, C.dark, 1) + rect(22, 16, 3, 4, C.dark, 1);
const PEOPLE = circ(11, 10, 5, C.skin) + path('M3 27Q3 17 11 17Q19 17 19 27Z', C.blue) + circ(22, 12, 4.5, C.skin) + path('M15 28Q15 19 22 19Q29 19 29 28Z', C.orange);
const DOOR = path('M8 29V11Q8 4 16 4Q24 4 24 11V29Z', C.brown) + line(16, 6, 16, 29, 1.4) + line(8, 15, 24, 15, 1.4) + circ(20, 19, 1.6, C.gold) + line(4, 29, 28, 29);
const TRASH = rect(8, 10, 16, 18, C.grey, 2) + rect(6, 6, 20, 4, C.greyD, 1.5) + rect(13, 3, 6, 3, C.greyD, 1) + line(12, 14, 12, 24, 1.6) + line(16, 14, 16, 24, 1.6) + line(20, 14, 20, 24, 1.6);
const SWIRL = `<path d="M16 16Q16 13 19 13Q23 13 23 17Q23 22 17 22Q10 22 10 16Q10 8 18 8Q27 8 27 17Q27 27 17 27" stroke-width="5.5" fill="none"/><path d="M16 16Q16 13 19 13Q23 13 23 17Q23 22 17 22Q10 22 10 16Q10 8 18 8Q27 8 27 17Q27 27 17 27" stroke="${C.blue}" stroke-width="2.6" fill="none"/>`;
const WIND = path('M4 11H19Q24 11 24 7Q24 4 21 4Q18 4 18 7', 'none') + path('M3 17H25Q29 17 29 21Q29 25 25 25Q22 25 22 22', 'none') + path('M6 23H14', 'none');
const TORNADO = ell(16, 6, 12, 3.5, C.grey) + ell(15, 12, 9, 3, C.grey) + ell(17, 17.5, 6.5, 2.6, C.grey) + ell(15, 22.5, 4, 2.2, C.grey) + ell(16, 27, 2, 1.6, C.grey);
const TROPHY = path('M9 5H23V12Q23 19 16 19Q9 19 9 12Z', C.gold) + path('M9 7H5Q4 13 10 14M23 7H27Q28 13 22 14', 'none') + rect(14, 19, 4, 5, C.goldD, 1) + rect(9, 24, 14, 4, C.brown, 1.5) + shine('M11 7H13V13Q12 14 11 12Z');
const GEM = poly('16,28 3,12 9,5 23,5 29,12', C.blue) + path('M3 12H29M9 5L13 12L16 28L19 12L23 5', 'none') + shine('M10 7H13L11 11Z');
const BELL = path('M8 23Q9 20 9 14Q9 7 16 7Q23 7 23 14Q23 20 24 23Z', C.gold) + rect(6, 22, 20, 3.5, C.goldD, 1.5) + circ(16, 27, 2.4, C.goldD) + circ(16, 5, 1.8, C.goldD);
const CROWN = path('M4 24L6 10L11 17L16 7L21 17L26 10L28 24Z', C.gold) + rect(4, 23, 24, 4, C.goldD, 1) + circ(16, 20, 1.8, C.red) + circ(10, 21, 1.4, C.blue) + circ(22, 21, 1.4, C.green);
const HOURGLASS = rect(7, 3, 18, 3, C.brown, 1) + rect(7, 26, 18, 3, C.brown, 1) + path('M9 6Q9 14 16 16Q9 18 9 26H23Q23 18 16 16Q23 14 23 6Z', C.cream) + path('M12 23Q16 19 20 23V26H12Z', C.gold) + path('M12 9H20Q19 13 16 14Q13 13 12 9Z', C.gold);
const KEY = circ(9, 16, 6, C.gold) + circ(9, 16, 2.2, C.cream) + rect(14, 14.5, 15, 3.5, C.gold, 1) + rect(23, 17, 2.6, 5, C.gold, 0.5) + rect(27, 17, 2.4, 4, C.gold, 0.5);
const FLOWER = circ(16, 9, 4.5, C.white) + circ(23, 14, 4.5, C.white) + circ(20, 22, 4.5, C.white) + circ(12, 22, 4.5, C.white) + circ(9, 14, 4.5, C.white) + circ(16, 16, 4.5, C.gold);
const SPROUT = path('M16 28V16', 'none') + path('M16 18Q8 19 6 11Q14 9 16 18Z', C.green) + path('M16 15Q19 6 27 6Q27 15 16 15Z', C.greenD) + path('M9 28H23', 'none');
const CAT = path('M8 28Q6 17 10 13L9 6L14 10H18L23 6L22 13Q26 17 24 28Z', C.orange) + eyes(13, 19, 17, 1.5) + path('M14.5 21L16 22.5L17.5 21', 'none') + line(5, 20, 10, 21, 1.1) + line(27, 20, 22, 21, 1.1) + path('M24 26Q30 24 28 18', 'none');
const SHOOT = star5(21, 11, 8, 3.4, C.gold) + path('M15 15L4 26', 'none') + path('M17 18L9 28', 'none') + path('M12 12L3 19', 'none');
const BUBBLES = circ(11, 19, 7, 'rgba(94,200,242,0.35)') + circ(22, 11, 5, 'rgba(94,200,242,0.35)') + circ(23, 23, 3.5, 'rgba(94,200,242,0.35)') + shine('M8 16Q9 14 11 14', 'none') + `<path d="M7.5 16.5Q8.5 14 11 14" stroke="#fff" stroke-width="1.4" fill="none"/>`;
const OLDKEY = circ(8, 9, 5.5, C.gold) + circ(8, 9, 2, C.cream) + path('M11.5 12.5L26 27', 'none') + `<path d="M11.5 12.5L26 27" stroke="${C.gold}" stroke-width="1.6" fill="none"/>` + line(21, 22, 24, 19, 2.4) + line(24, 25, 27, 22, 2.4);
const TAG = path('M4 15V5H14L28 19L18 29Z', C.gold) + circ(9, 10, 2.2, C.cream) + line(14, 17, 19, 22, 1.4);
const SPARKHEART = heart(15, 17, 1.05, C.pink) + star4(25, 7, 4, C.gold) + star4(6, 6, 3, C.gold) + shine('M9 12Q10 9 13 10Q10 11 10 13Z');
const MONEYBAG = path('M9 12Q3 18 5 25Q7 29 16 29Q25 29 27 25Q29 18 23 12Z', C.goldD) + path('M10 12L8 5Q12 7 16 5Q20 7 24 5L22 12Z', C.goldD) + line(9, 12, 23, 12, 2.4) + `<text x="16" y="25" font-size="11" font-weight="900" text-anchor="middle" fill="${INK}" stroke="none">€</text>`;
const BANK = poly('16,3 29,10 3,10', C.grey) + rect(4, 10, 24, 3, C.greyD, 0.5) + rect(6, 14, 3, 10, C.cream, 0.5) + rect(11.5, 14, 3, 10, C.cream, 0.5) + rect(17.5, 14, 3, 10, C.cream, 0.5) + rect(23, 14, 3, 10, C.cream, 0.5) + rect(3, 24, 26, 4, C.greyD, 1);
const SNEAKER = path('M3 22Q3 14 8 13L12 17Q17 14 20 16L27 19Q30 21 29 25H4Q3 24 3 22Z', C.blue) + rect(3, 24, 26, 4, C.white, 1.5) + line(12, 17, 14, 20, 1.3) + line(15, 16, 17, 19, 1.3);
const SLIPPER = path('M3 24Q3 17 11 16Q18 15 23 17Q29 19 29 24Q29 27 25 27H6Q3 27 3 24Z', C.pink) + path('M5 19Q12 12 21 17', 'none') + circ(13, 15, 2.5, C.white);
const MOON = path('M20 4Q10 6 10 16Q10 26 20 28Q8 30 4 20Q1 8 12 4Q16 3 20 4Z', C.gold) + star4(24, 11, 3.5, C.gold) + star4(25, 22, 2.4, C.cream);
const CART = path('M3 6H7L11 21H25L28 10H9', 'none') + path('M9 10H28L25 21H11Z', C.blue) + circ(12, 26, 2.4, C.grey) + circ(23, 26, 2.4, C.grey);
const JAR = rect(9, 4, 14, 4, C.brown, 1.5) + path('M8 10Q6 12 6 16V25Q6 29 10 29H22Q26 29 26 25V16Q26 12 24 10Z', 'rgba(210,235,255,0.6)') + rect(8, 8, 16, 3, C.grey, 1) + shine('M10 14V24', 'none') + `<path d="M10 14V24" stroke="#fff" stroke-width="1.6" fill="none"/>`;
const HAND = path('M9 29Q5 24 6 17L7 11Q8 9 10 10V16L11 6Q12 4 14 5V15L15 4Q17 3 18 5V15L19 6Q21 5 22 7V17L24 14Q27 13 27 16Q24 22 22 26Q20 29 16 29Z', C.skin);
const WAVE = HAND + path('M24 5Q28 7 28 11M3 6Q2 10 4 13', 'none');
const TOOLS = line(6, 26, 20, 12, 3.2) + rect(16, 4, 12, 7, C.grey, 1.5, 45) + line(26, 26, 13, 13, 3) + `<path d="M26 26L13 13" stroke="${C.brown}" stroke-width="1.6" fill="none"/>` + path('M9 11Q5 11 4 7Q6 9 8 8Q9 6 7 4Q11 5 11 9Z', C.grey);
const PLAY = path('M9 5L26 16L9 27Z', C.green);
const PENCIL = rect(5, 12, 22, 7, C.gold, 1, -45) + path('M5 27L7 21L11 25Z', C.skin) + rect(21, 3, 6, 7, C.pink, 1.5, -45);
const CHECK = `<path d="M5 17L12 24L27 8" stroke-width="6.5" fill="none"/><path d="M5 17L12 24L27 8" stroke="${C.green}" stroke-width="3" fill="none"/>`;
const CROSS = `<path d="M8 8L24 24M24 8L8 24" stroke-width="6.5" fill="none"/><path d="M8 8L24 24M24 8L8 24" stroke="${C.red}" stroke-width="3" fill="none"/>`;
const WARN = path('M16 4L29 27H3Z', C.gold) + rect(14.6, 11, 2.8, 9, INK, 1) + circ(16, 23.5, 1.7, INK);
const PALETTE = path('M16 4Q29 4 29 15Q29 21 23 21Q20 21 20 24Q20 28 16 28Q4 28 4 16Q4 4 16 4Z', C.paper) + circ(10, 13, 2.6, C.red) + circ(16, 9, 2.6, C.gold) + circ(22, 11, 2.6, C.green) + circ(10, 20, 2.6, C.blue);
const CAMERA = rect(3, 10, 26, 17, C.greyD, 3) + rect(10, 6, 9, 5, C.greyD, 1) + circ(16, 18.5, 6, C.dark) + circ(16, 18.5, 3.5, C.blue) + circ(24, 14, 1.3, C.gold);
const NOTE = path('M12 24V7L26 4V21', 'none') + `<path d="M12 7L26 4" stroke-width="4" fill="none"/>` + ell(9, 24, 4, 3, C.purple, -20) + ell(23, 21, 4, 3, C.purple, -20);
const ARROW_DOWN = path('M12 4H20V16H26L16 28L6 16H12Z', C.green);
const ARROW_UP = path('M12 28H20V16H26L16 4L6 16H12Z', C.blue);
const FOLDER = path('M3 9Q3 6 6 6H12L15 9H26Q29 9 29 12V25Q29 27 27 27H5Q3 27 3 25Z', C.gold) + path('M3 15H29', 'none');
const STOPWATCH = circ(16, 18, 11, C.cream) + rect(13, 3, 6, 3, C.grey, 1) + line(16, 18, 16, 11, 2.2) + line(16, 18, 21, 20, 2.2) + line(24, 8, 26, 6, 2.2);
const CHART_UP = rect(4, 18, 5, 10, C.blue, 1) + rect(11.5, 13, 5, 15, C.green, 1) + rect(19, 8, 5, 20, C.gold, 1) + path('M4 14L13 7L18 10L27 3', 'none') + path('M23 3H27V7', 'none');
const CHART = rect(4, 16, 6, 12, C.blue, 1) + rect(13, 8, 6, 20, C.orange, 1) + rect(22, 12, 6, 16, C.green, 1) + line(3, 28, 29, 28);
const STAR_OUTLINE = star5(16, 17, 13, 5.6, 'none');
const SPEAKER = path('M4 12H10L17 5V27L10 20H4Z', C.grey) + path('M21 11Q24 16 21 21M24 8Q29 16 24 24', 'none');
const MUTE = path('M4 12H10L17 5V27L10 20H4Z', C.grey) + path('M21 12L28 20M28 12L21 20', 'none') + `<path d="M21 12L28 20M28 12L21 20" stroke="${C.red}" stroke-width="2.4" fill="none"/>`;
const REFRESH = path('M25 13Q23 6 16 6Q8 6 6 14', 'none') + poly('25,6 27,15 19,13', C.green) + path('M7 19Q9 26 16 26Q24 26 26 18', 'none') + poly('7,26 5,17 13,19', C.green);
const SUITCASE = rect(4, 10, 24, 17, C.brown, 3) + path('M12 10V6H20V10', 'none') + rect(4, 15, 24, 3, C.gold, 0) + line(10, 10, 10, 27, 1.4) + line(22, 10, 22, 27, 1.4);
const CRAYON = rect(9, 4, 9, 22, C.red, 1.5, 35) + path('M3 28L5 22L9 25Z', C.redD) + rect(11, 8, 9, 3, C.white, 0, 35);
const RIBBON = path('M16 15Q6 5 4 11Q3 18 16 15Z', C.pink) + path('M16 15Q26 5 28 11Q29 18 16 15Z', C.pink) + path('M15 16L10 28L14 25L16 28', C.pink) + path('M17 16L22 28L18 25L16 28', C.pink) + circ(16, 15, 3, C.red);
const REDBOOK = rect(6, 4, 19, 24, C.red, 2) + rect(9, 4, 2.5, 24, C.redD, 0) + rect(13, 9, 9, 4, C.gold, 1) + path('M25 25H8Q6 25 6 27', 'none');
const TUBE = path('M12 3V22Q12 28 16 28Q20 28 20 22V3', C.cream) + path('M12 15H20V22Q20 28 16 28Q12 28 12 22Z', C.green) + line(10, 3, 22, 3) + circ(15, 21, 1.2, C.white);
const LOVELETTER = rect(4, 8, 24, 17, C.cream, 2) + path('M4 9L16 18L28 9', 'none') + heart(16, 20, 0.45, C.red);
const ENVELOPE = rect(4, 8, 24, 17, C.cream, 2) + path('M4 9L16 18L28 9', 'none');
const SHOE = path('M3 21Q3 15 7 15L13 18Q18 17 22 19Q29 21 29 25H3Z', C.brownD) + rect(3, 24, 26, 3, INK, 1) + line(10, 17, 13, 20, 1.2);
const PIE = path('M3 18Q16 8 29 18Z', C.gold) + path('M3 18H29L26 26H6Z', C.brown) + path('M8 15Q12 12 16 15Q20 12 24 15', 'none');
const SPOON = ell(10, 10, 5, 7, C.grey, 40) + line(13.5, 14, 26, 27, 3.2) + `<path d="M13.5 14L26 27" stroke="${C.grey}" stroke-width="1.6" fill="none"/>`;
const BASKET = path('M8 14Q8 5 16 5Q24 5 24 14', 'none') + path('M4 14H28L25 28H7Z', C.goldD) + line(6, 18, 26, 18, 1.4) + line(7, 23, 25, 23, 1.4) + line(12, 14, 13, 28, 1.4) + line(20, 14, 19, 28, 1.4);
const WINE = path('M9 4H23Q24 14 16 17Q8 14 9 4Z', C.redD) + path('M9.5 8H22.5Q22 14 16 16Q10 14 9.5 8Z', C.red) + line(16, 17, 16, 26, 2.4) + ell(16, 27, 6, 2, C.cream);
const CANDLE = rect(11, 12, 10, 16, C.cream, 2) + path('M16 3Q20 8 16 11Q12 8 16 3Z', C.gold) + line(16, 11, 16, 12, 1.4) + rect(7, 27, 18, 3, C.goldD, 1);
const ROPE = circ(11, 13, 7, 'none') + circ(21, 13, 7, 'none') + `<circle cx="11" cy="13" r="7" stroke="${C.goldD}" stroke-width="2.4" fill="none"/><circle cx="21" cy="13" r="7" stroke="${C.goldD}" stroke-width="2.4" fill="none"/>` + path('M12 19L7 29M20 19L25 29', 'none') + `<path d="M12 19L7 29M20 19L25 29" stroke="${C.goldD}" stroke-width="2.4" fill="none"/>` + circ(16, 18, 3, C.goldD);
const BOTTLE = rect(13, 3, 6, 6, C.greenD, 1) + path('M13 9Q8 12 8 18V27Q8 29 10 29H22Q24 29 24 27V18Q24 12 19 9Z', C.greenD) + rect(9, 17, 14, 7, C.cream, 1) + star4(26, 6, 3, C.gold);
const POSTBOX = rect(8, 6, 16, 22, C.red, 4) + rect(11, 12, 10, 2.5, INK, 1) + rect(6, 26, 20, 3, C.greyD, 1);
const CHAIR = rect(8, 4, 16, 13, C.brown, 2) + rect(6, 16, 20, 4, C.brownD, 1) + line(8, 20, 8, 29, 2.6) + line(24, 20, 24, 29, 2.6);
const TELESCOPE = rect(3, 9, 24, 6, C.blue, 2, -25) + rect(21, 4, 8, 7, C.blueD, 2, -25) + line(13, 15, 8, 29, 2) + line(14, 15, 19, 29, 2);
const FLAG = line(7, 3, 7, 29, 2.6) + path('M7 4Q13 1 18 5Q23 9 28 6V17Q23 20 18 16Q13 12 7 15Z', C.red);
const MOUNTAIN = poly('2,28 12,8 18,18 22,13 30,28', C.greyD) + poly('12,8 15,14 12,13 9,14', C.white) + poly('22,13 24,17 22,16 20,17', C.white);
const GALAXY = circ(16, 16, 13, C.dark) + path('M8 20Q12 10 24 12Q16 14 14 20Q12 24 8 20Z', C.purple) + star4(11, 10, 3, C.gold) + star4(23, 21, 2.6, C.cream) + circ(20, 8, 1, C.white);
const WEB = path('M16 3V29M3 16H29M6 6L26 26M26 6L6 26', 'none') + path('M16 8L22 10L24 16L22 22L16 24L10 22L8 16L10 10Z', 'none') + path('M16 12L19 13L20 16L19 19L16 20L13 19L12 16L13 13Z', 'none');
const LEAVES = path('M5 27Q4 13 16 8Q20 20 5 27Z', C.orange) + path('M5 27Q10 18 15 11', 'none') + path('M14 25Q18 10 28 9Q27 22 14 25Z', C.redD) + path('M14 25Q20 16 26 11', 'none');
const BRAIN = path('M16 6Q12 3 8 6Q3 7 4 13Q2 18 6 21Q7 27 13 26Q16 28 16 25Z', C.pink) + path('M16 6Q20 3 24 6Q29 7 28 13Q30 18 26 21Q25 27 19 26Q16 28 16 25Z', C.pink) + path('M9 12Q12 14 10 17M22 12Q20 15 23 18M16 6V25', 'none');
const GHOST = path('M6 28V14Q6 4 16 4Q26 4 26 14V28L22 25L19 28L16 25L13 28L10 25Z', C.white) + ell(12, 14, 2, 3, INK) + ell(20, 14, 2, 3, INK) + ell(16, 20, 2, 1.6, INK);
const DRAGON = path('M5 20Q4 10 14 8L13 3L18 7L23 5L22 10Q29 13 28 20Q27 27 18 27Q8 28 5 20Z', C.green) + path('M8 22Q14 24 20 22', 'none') + eyes(13, 20, 15, 1.6) + path('M6 12L3 9M24 8L28 4', 'none') + path('M10 18Q11 19 12 18M20 18Q21 19 22 18', 'none');
const HANDSHAKE = path('M3 13L9 9L15 13L21 9L29 13V19L21 25L16 22L11 25L3 19Z', C.skin) + path('M9 9L16 17Q18 19 20 17L15 12', 'none') + line(13, 20, 15, 22, 1.4) + line(10, 18, 12, 20, 1.4);
const MANTELCLOCK = path('M5 28V14Q5 4 16 4Q27 4 27 14V28Z', C.brown) + circ(16, 15, 8, C.cream) + line(16, 15, 16, 10, 2) + line(16, 15, 20, 17, 2) + rect(4, 26, 24, 3, C.brownD, 1);
const COMB = rect(4, 8, 24, 7, C.purple, 2) + [0, 1, 2, 3, 4, 5, 6].map((k) => line(7 + k * 3, 15, 7 + k * 3, 25, 2)).join('');
const MUSCLE = path('M4 26Q4 18 9 16L13 7Q15 4 18 6L17 13Q22 9 27 13Q30 17 27 22Q23 27 15 27Z', C.skin) + path('M13 17Q17 15 20 18', 'none');
const RULER = rect(3, 11, 26, 10, C.gold, 1.5, -20) + [0, 1, 2, 3, 4, 5].map((k) => line(7 + k * 4, 12 - k * 1.45 + 2, 7 + k * 4 + 1, 12 - k * 1.45 + 6, 1.3)).join('');
const BARREL = path('M7 5H25Q28 16 25 27H7Q4 16 7 5Z', C.brown) + line(6, 10, 26, 10, 2.2) + line(6, 22, 26, 22, 2.2) + ell(16, 5, 9, 1.6, C.brownD);
const MAMMOTH = path('M4 24Q3 12 13 10Q22 8 26 14Q29 18 27 22L27 28H23V24H11V28H7Z', C.brown) + path('M26 17Q30 22 27 27', 'none') + path('M23 19Q27 22 24 25', 'none') + `<path d="M23 19Q27 22 24 25" stroke="${C.cream}" stroke-width="1.8" fill="none"/>` + circ(23, 15, 1.4, INK);
const TARGET = circ(16, 16, 13, C.red) + circ(16, 16, 9, C.white) + circ(16, 16, 5, C.red) + circ(16, 16, 1.8, C.white) + path('M16 16L28 4', 'none') + poly('26,3 29,3 29,6', C.brown);
const MAGNET = path('M6 4H13V18Q13 21 16 21Q19 21 19 18V4H26V18Q26 28 16 28Q6 28 6 18Z', C.red) + rect(6, 4, 7, 5, C.grey, 0.5) + rect(19, 4, 7, 5, C.grey, 0.5);
const FOOT = path('M10 29Q4 27 6 18Q7 11 12 10Q18 10 19 17Q20 26 14 29Z', C.skin) + circ(12, 6, 2.4, C.skin) + circ(16.5, 6, 2, C.skin) + circ(20.5, 8, 1.8, C.skin) + circ(23.5, 11, 1.5, C.skin);
const TEMPLE = poly('16,3 29,10 3,10', C.cream) + rect(4, 10, 24, 3, C.paper, 0.5) + rect(6, 14, 3, 10, C.white, 0.5) + rect(11.5, 14, 3, 10, C.white, 0.5) + rect(17.5, 14, 3, 10, C.white, 0.5) + rect(23, 14, 3, 10, C.white, 0.5) + rect(3, 24, 26, 4, C.paper, 1);
const WALKER = circ(17, 6, 3.5, C.skin) + path('M17 10L15 19L19 23L18 29M15 19L11 28M16 12L11 17M17 12L22 16', 'none');
const TULIP = path('M16 18V29', 'none') + path('M16 24Q10 23 9 18Q14 18 16 24Z', C.green) + path('M9 6L12 9L16 4L20 9L23 6Q24 18 16 18Q8 18 9 6Z', C.pink);
const BOLT = poly('18,2 6,18 14,18 11,30 26,12 17,12', C.gold);
const ROBOT = rect(7, 9, 18, 15, C.grey, 4) + circ(12, 15, 2.6, C.blue) + circ(20, 15, 2.6, C.blue) + rect(12, 19.5, 8, 2, INK, 1) + line(16, 9, 16, 5) + circ(16, 4, 1.8, C.red) + rect(4, 13, 3, 6, C.greyD, 1) + rect(25, 13, 3, 6, C.greyD, 1) + rect(11, 24, 10, 5, C.greyD, 1);
const BULB = path('M11 20Q6 16 6 11Q6 3 16 3Q26 3 26 11Q26 16 21 20V23H11Z', C.gold) + rect(11, 23, 10, 5, C.grey, 1) + path('M13 13L16 17L19 13', 'none') + shine('M10 8Q12 5 15 5Q12 7 11 10Z');
const HOUSE = poly('16,3 29,15 3,15', C.red) + rect(6, 14, 20, 14, C.cream, 1) + rect(13, 19, 6, 9, C.brown, 1) + rect(8, 17, 4, 4, C.blue, 0.5);
const FLOPPY = rect(4, 4, 24, 24, C.blue, 3) + rect(9, 4, 14, 8, C.grey, 1) + rect(18, 5.5, 3, 5, C.dark, 0.5) + rect(8, 16, 16, 12, C.white, 1);
const RETURN = path('M12 6L5 13L12 20', 'none') + path('M5 13H20Q27 13 27 20Q27 27 20 27H12', 'none');
const ZZZ = `<text x="5" y="27" font-size="16" font-weight="900" fill="${C.blue}">Z</text><text x="15" y="18" font-size="12" font-weight="900" fill="${C.blue}">Z</text><text x="22" y="10" font-size="9" font-weight="900" fill="${C.blue}">z</text>`;
const GLOBE = circ(16, 16, 13, C.blue) + path('M8 8Q12 10 11 14Q8 16 9 21Q6 18 5 14Z', C.green) + path('M18 5Q22 9 20 12Q17 13 19 17Q23 18 22 24Q28 20 28 14Q26 8 18 5Z', C.green);
const MOUSE = rect(8, 3, 16, 26, C.grey, 8) + line(16, 3, 16, 13, 1.6) + line(8, 13, 24, 13, 1.6);
const FRAME = rect(3, 5, 26, 22, C.gold, 2) + rect(7, 9, 18, 14, C.blue, 1) + poly('7,23 14,14 19,19 22,16 25,23', C.green) + circ(20, 12, 1.8, C.cream);
const CONFUSED = circ(16, 16, 13, C.gold) + eyes(11.5, 20.5, 13, 1.7) + path('M10 22Q16 19 22 23', 'none');
const BOOT = path('M8 3H17V17Q22 18 26 20Q29 22 29 25V28H6V25Q8 22 8 17Z', C.brown) + rect(6, 26, 23, 3, INK, 1) + line(8, 9, 17, 9, 1.4);
const DIE = rect(5, 5, 22, 22, C.white, 5) + circ(11, 11, 2, INK) + circ(21, 21, 2, INK) + circ(16, 16, 2, INK) + circ(21, 11, 2, INK) + circ(11, 21, 2, INK);
const CLAPPER = rect(4, 13, 24, 15, C.dark, 2) + path('M4 13L5 6L28 3L28 10Z', C.white) + path('M9 5.5L11 11M15 4.7L17 10.2M21 3.9L23 9.4', 'none') + line(8, 19, 24, 19, 1.4);
const BUOY = circ(16, 16, 13, C.red) + circ(16, 16, 6, C.cream) + path('M7 7L11.5 11.5M25 7L20.5 11.5M7 25L11.5 20.5M25 25L20.5 20.5', 'none') + `<path d="M7 7L11.5 11.5M25 7L20.5 11.5M7 25L11.5 20.5M25 25L20.5 20.5" stroke="${C.white}" stroke-width="5" fill="none"/>`;
const CLIPBOARD = rect(6, 5, 20, 24, C.brown, 2) + rect(9, 9, 14, 17, C.white, 1) + rect(11, 3, 10, 5, C.grey, 1.5) + line(12, 14, 20, 14, 1.3) + line(12, 18, 20, 18, 1.3) + line(12, 22, 17, 22, 1.3);
const GLOWSTAR = star5(16, 16, 10, 4.3, C.gold) + path('M16 1V4M16 28V31M1 16H4M28 16H31M5 5L7 7M25 25L27 27M27 5L25 7M5 27L7 25', 'none');
const SPONGE = rect(4, 11, 24, 15, C.gold, 3) + rect(4, 7, 24, 5, C.green, 2) + circ(10, 17, 1.6, C.goldD) + circ(18, 20, 2, C.goldD) + circ(23, 15, 1.4, C.goldD) + circ(13, 22, 1.2, C.goldD);
const DUSTPAN = path('M3 14H22L26 26H7Z', C.blue) + path('M3 14Q3 26 7 26', 'none') + rect(21, 17, 9, 4, C.blueD, 2, -30) + line(10, 18, 18, 18, 1.2);
const TOOLBOX = rect(3, 11, 26, 16, C.red, 2) + path('M11 11V6H21V11', 'none') + rect(3, 16, 26, 3, C.redD, 0) + rect(14, 15, 4, 5, C.grey, 1);
const MAP = path('M3 7L11 4L21 7L29 4V25L21 28L11 25L3 28Z', C.paper) + line(11, 4, 11, 25, 1.4) + line(21, 7, 21, 28, 1.4) + path('M6 21Q10 15 15 18Q19 21 23 13', 'none') + `<path d="M6 21Q10 15 15 18Q19 21 23 13" stroke="${C.red}" stroke-dasharray="2 2" stroke-width="1.6" fill="none"/>` + path('M23 9L27 13M27 9L23 13', 'none');
const BOWLING = ell(10, 22, 7, 7, C.dark) + circ(8, 19, 1, C.grey) + circ(11, 18.5, 1, C.grey) + path('M22 3Q19 6 20 10Q17 14 18 22Q18 28 22 29Q26 28 26 22Q27 14 24 10Q25 6 22 3Z', C.white) + rect(19.7, 10, 4.6, 2, C.red, 0.5);
const CONVEYOR = rect(3, 13, 26, 9, C.dark, 4.5) + circ(8, 17.5, 3, C.grey) + circ(16, 17.5, 3, C.grey) + circ(24, 17.5, 3, C.grey) + ell(11, 10, 3.5, 2.4, C.grey) + ell(19, 9, 3, 2.2, C.cream) + path('M23 27H29M26 24L29 27L26 30', 'none');
const GIRL = path('M6 21Q4 6 16 5Q28 6 26 21Z', C.brown) + circ(5, 15, 3.5, C.brown) + circ(27, 15, 3.5, C.brown) + path('M8 30Q8 22 16 22Q24 22 24 30Z', C.pink) + circ(16, 14, 7.5, C.skin) + eyes(13, 19, 14) + path('M13.5 17.5Q16 19.5 18.5 17.5', 'none') + path('M9 10Q16 4 23 10', 'none');
const CHILD = path('M8 30Q8 22 16 22Q24 22 24 30Z', C.gold) + circ(16, 14, 7.5, C.skin) + path('M8.5 13Q9 5 16 5Q23 5 23.5 13Q20 9 16 10Q12 9 8.5 13Z', C.orange) + eyes(13, 19, 15) + path('M13.5 18Q16 20 18.5 18', 'none');
const STETHO = path('M8 4V12Q8 19 14 19Q20 19 20 12V4', 'none') + circ(8, 4, 1.8, C.grey) + circ(20, 4, 1.8, C.grey) + path('M14 19V23Q14 28 20 28Q24 28 24 24', 'none') + circ(24, 21, 4, C.grey) + circ(24, 21, 1.8, C.greyD);
const GAMEPAD = path('M8 10H24Q30 10 30 18Q31 27 26 27Q23 27 21 22H11Q9 27 6 27Q1 27 2 18Q2 10 8 10Z', C.grey) + rect(8, 15, 6, 2.4, C.dark, 0.6) + rect(9.8, 13.2, 2.4, 6, C.dark, 0.6) + circ(22, 14.5, 1.7, C.green) + circ(25, 17.5, 1.7, C.red) + circ(19, 17.5, 1.7, C.blue) + circ(22, 20.5, 1.7, C.gold);

/** Emoji → dessin. */
export const ICON_ART: Record<string, string> = {
  '✨': SPARK, '🪙': COIN, '🏰': CASTLE, '👥': PEOPLE, '🧹': BROOM, '📖': BOOK, '📜': SCROLL, '🌳': TREE, '🪶': FEATHER,
  '🐑': SHEEP, '🚪': DOOR, '🗑': TRASH, '⭐': STAR, '🌪': TORNADO, '💨': WIND, '⚙': gear(16, 16, 13, C.grey), '🔒': LOCK,
  '🗺': MAP, '🌬': WIND, '🧰': TOOLBOX, '🏆': TROPHY, '🎬': CLAPPER, '🛟': BUOY, '✔': CHECK, '📋': CLIPBOARD, '📊': CHART,
  '🌟': GLOWSTAR, '🌀': SWIRL, '🧽': SPONGE, '🪣': DUSTPAN, '👑': CROWN, '🏠': HOUSE, '💾': FLOPPY, '↩': RETURN, '🔓': UNLOCK,
  '💤': ZZZ, '🌍': GLOBE, '⏳': HOURGLASS, '🖱': MOUSE, '🖼': FRAME, '🔊': SPEAKER, '😕': CONFUSED, '🥾': BOOT, '🎲': DIE,
  '🌼': FLOWER, '🌱': SPROUT, '🐈': CAT, '🌠': SHOOT, '🫧': BUBBLES, '🗝': OLDKEY, '🏷': TAG, '💖': SPARKHEART, '💰': MONEYBAG,
  '🏦': BANK, '👟': SNEAKER, '🥿': SLIPPER, '🎳': BOWLING, '🌙': MOON, '🛒': CART, '🫙': JAR, '👋': WAVE, '🛠': TOOLS,
  '▶': PLAY, '✏': PENCIL, '🔑': KEY, '✖': CROSS, '✕': CROSS, '⚠': WARN, '🎨': PALETTE, '📷': CAMERA, '🎵': NOTE,
  '⬇': ARROW_DOWN, '⬆': ARROW_UP, '📂': FOLDER, '⏱': STOPWATCH, '📈': CHART_UP, '☆': STAR_OUTLINE, '🔇': MUTE, '🔄': REFRESH,
  '🧳': SUITCASE, '🖍': CRAYON, '🎀': RIBBON, '📕': REDBOOK, '🧪': TUBE, '💌': LOVELETTER, '👞': SHOE, '🥧': PIE, '🥄': SPOON,
  '🧺': BASKET, '🍷': WINE, '🕯': CANDLE, '✉': ENVELOPE, '🪢': ROPE, '🍾': BOTTLE, '📮': POSTBOX, '🪑': CHAIR, '🔭': TELESCOPE,
  '🚩': FLAG, '🏔': MOUNTAIN, '🌌': GALAXY, '🕸': WEB, '🍂': LEAVES, '🧠': BRAIN, '👻': GHOST, '🐉': DRAGON, '🤝': HANDSHAKE,
  '🕰': MANTELCLOCK, '🪮': COMB, '💪': MUSCLE, '📏': RULER, '🛢': BARREL, '🦣': MAMMOTH, '🎯': TARGET, '🧲': MAGNET, '💎': GEM,
  '🦶': FOOT, '🏛': TEMPLE, '🚶': WALKER, '🌷': TULIP, '⚡': BOLT, '🤖': ROBOT, '🖐': HAND, '💡': BULB, '🔔': BELL, '🛤': CONVEYOR, '👧': GIRL, '🎮': GAMEPAD, '🧒': CHILD, '🩺': STETHO,
};

/** Le dessin d'une icône, prêt à glisser dans un SVG 32 × 32 (contour encre commun à toutes les formes). */
export function iconInner(emoji: string): string | null {
  const art = ICON_ART[emoji.replace(/\uFE0F/g, '')];
  return art ? `<g stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${art}</g>` : null;
}

/** Le SVG complet d'une icône (contour encre commun à toutes les formes). */
export function iconSvg(emoji: string, size = 32): string | null {
  const art = ICON_ART[emoji.replace(/️/g, '')];
  if (!art) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}"><g stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${art}</g></svg>`;
}

/** Repère tous les emojis connus dans un texte (le plus long d'abord). */
const KEYS = Object.keys(ICON_ART).sort((a, b) => b.length - a.length);
export const ICON_RE = new RegExp(`(${KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\uFE0F?`, 'gu');
