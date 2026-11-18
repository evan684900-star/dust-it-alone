import { ROOMS } from './rooms';

/** Les branches de l'Arbre des Souvenirs (angle en degrés, 0 = en haut, sens horaire). */
export type BranchId = 'broom' | 'pickup' | 'memory' | 'castle' | 'plume' | 'helpers';

export const BRANCHES: Record<BranchId, { name: string; icon: string; angle: number; color: string }> = {
  broom: { name: 'Balai', icon: '🧹', angle: 0, color: '#ffc93c' },
  pickup: { name: 'Ramassage', icon: '🗑️', angle: 72, color: '#5ec8f2' },
  memory: { name: 'Mémoire', icon: '✨', angle: 144, color: '#c38bff' },
  castle: { name: 'Château', icon: '🏰', angle: 216, color: '#7bd651' },
  plume: { name: 'Plume', icon: '👟', angle: 288, color: '#ff8a6e' },
  helpers: { name: 'Assistants', icon: '🐑', angle: 180, color: '#b8a99a' },
};

/** ● petit nœud (plusieurs niveaux), ◆ grand nœud (déblocage), ◇ jonction entre deux branches. */
export type NodeKind = 'small' | 'big' | 'junction';

/** Condition de jeu (en plus des parents). */
export type Requirement = { room: string } | { soon: true };

export interface TreeNode {
  id: string;
  name: string;
  icon: string;
  branch: BranchId;
  kind: NodeKind;
  /** Parents : il faut au moins 1 niveau dans chacun (au max pour un grand nœud). */
  parents: string[];
  maxLevel: number;
  base: number;
  growth: number;
  /** Phrase d'ambiance. */
  flavor: string;
  /** Effet en clair pour un niveau donné (affiché « avant → après »). */
  effect: (level: number) => string;
  /** Position dans l'arbre : distance à la racine (anneaux) et décalage sur le côté. */
  depth: number;
  side?: number;
  /** Pour les jonctions : angle propre (degrés). */
  angle?: number;
  requires?: Requirement;
  /** Les deux nœuds d'une fourche s'excluent : on en choisit un seul. */
  fork?: string;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;
const cm = (v: number) => `${Math.round(v)} cm`;
const mult = (v: number) => `×${v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}`;

/** Les nœuds fixes de l'arbre (les branches du château sont ajoutées pièce par pièce, plus bas). */
const BASE_NODES: TreeNode[] = [
  // ───────────── 🧹 Balai ─────────────
  { id: 'broom-wide-1', name: 'Brosse large I', icon: '🧹', branch: 'broom', kind: 'small', parents: [], maxLevel: 5, base: 25, growth: 1.5, depth: 1,
    flavor: "L'art oublié de Gustave, balayeur en chef du Roi : « Plus c'est large, moins on repasse. »",
    effect: (l) => `Largeur de la brosse : ${cm(74 + 8 * l)}` },
  { id: 'broom-grip', name: 'Poils durs', icon: '🪮', branch: 'broom', kind: 'small', parents: ['broom-wide-1'], maxLevel: 5, base: 120, growth: 1.6, depth: 2, side: 0.6,
    flavor: 'Des poils de sanglier, comme autrefois. Même les moutons les plus dodus suivent.',
    effect: (l) => `Prise de la brosse : ${pct(0.85 + 0.05 * l)}` },
  { id: 'broom-wide-2', name: 'Brosse large II', icon: '🧹', branch: 'broom', kind: 'small', parents: ['broom-grip'], maxLevel: 5, base: 900, growth: 1.6, depth: 3, side: 0.5,
    flavor: 'Gustave balayait la Galerie en trois coups. Trois !',
    effect: (l) => `Largeur en plus : +${cm(10 * l)}` },
  { id: 'broom-giant', name: 'Brosse géante', icon: '🦣', branch: 'broom', kind: 'big', parents: ['broom-wide-2'], maxLevel: 1, base: 25000, growth: 1, depth: 4, side: 0, fork: 'broom-fork',
    flavor: "Une brosse si large qu'il faut la tenir à deux mains. Moins précise, mais quelle allure.",
    effect: (l) => (l ? '+60 cm de largeur, −10 % de prise' : 'Fourche : +60 cm de largeur, −10 % de prise') },
  { id: 'broom-precise', name: 'Brosse de précision', icon: '🎯', branch: 'broom', kind: 'big', parents: ['broom-wide-2'], maxLevel: 1, base: 25000, growth: 1, depth: 4, side: 1, fork: 'broom-fork',
    flavor: 'Chaque poil sait exactement où aller.',
    effect: (l) => (l ? '+30 % de prise' : 'Fourche : +30 % de prise') },
  { id: 'broom-push', name: 'Coup de balai', icon: '💪', branch: 'broom', kind: 'small', parents: ['broom-wide-1'], maxLevel: 5, base: 600, growth: 1.8, depth: 2, side: -0.6,
    flavor: 'Le geste sec et franc des grandes lessives de printemps.',
    effect: (l) => `Force de poussée : ${mult(1 + 0.15 * l)}` },
  { id: 'broom-reach', name: 'Manche télescopique', icon: '📏', branch: 'broom', kind: 'small', parents: ['broom-push'], maxLevel: 3, base: 400, growth: 2.2, depth: 3, side: -0.9, requires: { room: 'gallery' },
    flavor: 'Pour atteindre les moutons qui se cachent sous les meubles.',
    effect: (l) => `Portée du balai : ${cm(230 + 25 * l)}` },
  { id: 'tool-duster', name: 'Plumeau', icon: '🪶', branch: 'broom', kind: 'big', parents: ['broom-reach'], maxLevel: 1, base: 4000, growth: 1, depth: 4, side: -1.4, requires: { soon: true },
    flavor: 'Pour les toiles d’araignée. Les araignées, elles, ne sont pas ravies.', effect: () => 'Débloque le plumeau (toiles d’araignée)' },
  { id: 'tool-sponge', name: 'Éponge', icon: '🧽', branch: 'broom', kind: 'big', parents: ['tool-duster'], maxLevel: 1, base: 30000, growth: 1, depth: 5, side: -1.6, requires: { soon: true },
    flavor: 'Frotte, frotte… la tache finit toujours par céder.', effect: () => 'Débloque l’éponge (taches)' },
  { id: 'tool-vacuum', name: 'Aspirateur', icon: '🌀', branch: 'broom', kind: 'big', parents: ['tool-sponge'], maxLevel: 1, base: 150000, growth: 1, depth: 6, side: -1.8, requires: { soon: true },
    flavor: 'Une invention moderne. Les portraits trouvent ça bruyant.', effect: () => 'Débloque l’aspirateur' },

  // ───────────── 🗑️ Ramassage ─────────────
  { id: 'pan-size-1', name: 'Pelles géantes I', icon: '🗑️', branch: 'pickup', kind: 'small', parents: [], maxLevel: 5, base: 40, growth: 1.55, depth: 1,
    flavor: 'Une grande pelle pardonne les gestes maladroits.',
    effect: (l) => `Taille des pelles : ${pct(1 + 0.15 * l)}` },
  { id: 'pan-pull', name: 'Aspiration magique', icon: '🧲', branch: 'pickup', kind: 'small', parents: ['pan-size-1'], maxLevel: 5, base: 200, growth: 1.6, depth: 2,
    flavor: 'Les pelles ont faim. La poussière qui passe à côté finit dedans.',
    effect: (l) => `Rayon d’aspiration : ${cm(120 + 30 * l)}` },
  { id: 'pan-size-2', name: 'Pelles géantes II', icon: '🗑️', branch: 'pickup', kind: 'small', parents: ['pan-pull'], maxLevel: 5, base: 1500, growth: 1.6, depth: 3,
    flavor: 'À ce stade, ce ne sont plus des pelles, ce sont des baignoires.',
    effect: (l) => `Taille en plus : +${pct(0.15 * l)}` },
  { id: 'pan-magnet', name: 'Pelle aimantée', icon: '🌪️', branch: 'pickup', kind: 'big', parents: ['pan-size-2'], maxLevel: 1, base: 60000, growth: 1, depth: 4,
    flavor: 'Toute la poussière de la pièce glisse lentement vers les pelles.',
    effect: () => 'Les pelles attirent doucement la poussière de toute la pièce' },

  // ───────────── ✨ Mémoire ─────────────
  { id: 'value-1', name: 'Poussière précieuse I', icon: '💎', branch: 'memory', kind: 'small', parents: [], maxLevel: 5, base: 100, growth: 1.9, depth: 1,
    flavor: 'Chaque grain contient un tout petit souvenir. Certains valent plus que d’autres.',
    effect: (l) => `Valeur de la poussière : ${mult(Math.pow(1.25, l))}` },
  { id: 'value-2', name: 'Poussière précieuse II', icon: '💎', branch: 'memory', kind: 'small', parents: ['value-1'], maxLevel: 5, base: 3000, growth: 2, depth: 2, side: 0.6,
    flavor: 'Des souvenirs de bal, de fêtes, de premières neiges…',
    effect: (l) => `Valeur en plus : ${mult(Math.pow(1.3, l))}` },
  { id: 'star-luck', name: 'Chance dorée', icon: '⭐', branch: 'memory', kind: 'small', parents: ['value-2'], maxLevel: 5, base: 800, growth: 1.8, depth: 3, side: 0.9,
    flavor: 'La poussière d’étoile aime les balayeurs chanceux.',
    effect: (l) => `Poussière d’étoile : ${(0.15 + 0.1 * l).toFixed(2).replace('.', ',')} %` },
  { id: 'bunny-fat', name: 'Moutons dodus', icon: '🐑', branch: 'memory', kind: 'small', parents: ['value-2'], maxLevel: 5, base: 1200, growth: 1.7, depth: 3, side: 0.2, requires: { room: 'gallery' },
    flavor: 'Plus un mouton a mangé de poussière, plus il vaut cher.',
    effect: (l) => `Valeur d’un mouton : ${5 + 4 * l}` },
  { id: 'star-rain', name: 'Pluie d’étoiles', icon: '🌠', branch: 'memory', kind: 'big', parents: ['star-luck'], maxLevel: 1, base: 120000, growth: 1, depth: 4, side: 1.1, requires: { soon: true },
    flavor: 'Parfois, le ciel se souvient aussi.', effect: () => 'Débloque l’événement « pluie d’étoiles »' },

  // ───────────── 👟 Plume ─────────────
  { id: 'plume-speed', name: 'Chaussons de feutre', icon: '🥿', branch: 'plume', kind: 'small', parents: [], maxLevel: 5, base: 200, growth: 1.9, depth: 1,
    flavor: 'Silencieux, rapides, et ils ne rayent pas le parquet.',
    effect: (l) => `Vitesse de marche : ${pct(1 + 0.08 * l)}` },
  { id: 'plume-sprint', name: 'Souffle du vent', icon: '💨', branch: 'plume', kind: 'small', parents: ['plume-speed'], maxLevel: 3, base: 3000, growth: 2.5, depth: 2, requires: { room: 'hall' },
    flavor: 'Le Grand Hall est grand. Très grand.',
    effect: (l) => `Course (Maj) : ${pct(1 + 0.25 * l)}` },
  { id: 'plume-feet', name: 'Pas léger', icon: '🦶', branch: 'plume', kind: 'big', parents: ['plume-sprint'], maxLevel: 1, base: 20000, growth: 1, depth: 3, requires: { soon: true },
    flavor: 'Même tes pieds font le ménage.', effect: () => 'En marchant, tes pieds poussent un peu la poussière' },

  // ───────────── ◇ Jonctions ─────────────
  { id: 'junction-scoop', name: 'Coup de pelle', icon: '🎳', branch: 'broom', kind: 'junction', parents: ['broom-wide-1', 'pan-size-1'], maxLevel: 1, base: 8000, growth: 1, depth: 2.2, angle: 36,
    flavor: 'Balayer droit dans la pelle, c’est tout un art.',
    effect: () => 'La poussière poussée par le balai droit dans une pelle vaut +25 %' },
  { id: 'junction-places', name: 'Mémoire des lieux', icon: '🏛️', branch: 'memory', kind: 'junction', parents: ['value-1', 'castle-root'], maxLevel: 1, base: 15000, growth: 1, depth: 2.2, angle: 180,
    flavor: 'Une pièce qui se souvient aide les autres à se souvenir.',
    effect: () => '+5 % de valeur partout pour chaque pièce impeccable' },
  { id: 'junction-march', name: 'Marche du balayeur', icon: '🚶', branch: 'plume', kind: 'junction', parents: ['plume-speed', 'broom-wide-1'], maxLevel: 1, base: 6000, growth: 1, depth: 2.2, angle: 324,
    flavor: 'Avancer en balayant : le geste des pros.',
    effect: () => 'Balayer en avançant pousse 20 % plus fort' },

  // ───────────── 🐑 Assistants (plus tard) ─────────────
  { id: 'helpers-root', name: '???', icon: '🐑', branch: 'helpers', kind: 'big', parents: [], maxLevel: 1, base: 1, growth: 1, depth: 1.5, angle: 252, requires: { soon: true },
    flavor: 'On entend des petits bêlements derrière les murs…', effect: () => 'Bientôt : les assistants' },

  // ───────────── 🏰 Château (racine) ─────────────
  { id: 'castle-root', name: 'Cœur du château', icon: '🏰', branch: 'castle', kind: 'small', parents: [], maxLevel: 1, base: 60, growth: 1, depth: 1,
    flavor: 'Le château a un cœur. Il bat très, très doucement.',
    effect: (l) => (l ? 'Les branches des pièces peuvent pousser' : 'Ouvre les branches des pièces du château') },
];

/** Branche d'une pièce : 3 nœuds, prix multipliés par la valeur de la pièce. */
function roomBranch(roomId: string, index: number, total: number): TreeNode[] {
  const room = ROOMS.find((r) => r.id === roomId)!;
  const v = room.valueMult;
  const short = room.name.replace(/^(La |Le |Les |L’|L')/, '');
  const side = (index - (total - 1) / 2) * 0.75;
  return [
    { id: `airflow:${roomId}`, name: `Courants d’air · ${short}`, icon: '🌬️', branch: 'castle', kind: 'small', parents: ['castle-root'], maxLevel: 5, base: 60 * v, growth: 1.6, depth: 2, side, requires: { room: roomId },
      flavor: 'Une fenêtre entrouverte, et la poussière revient… pour être ramassée.',
      effect: (l) => `Poussière qui retombe dans la pièce : ${pct(1 + 0.15 * l)}` },
    { id: `shine:${roomId}`, name: `Lustre · ${short}`, icon: '💡', branch: 'castle', kind: 'small', parents: [`airflow:${roomId}`], maxLevel: 5, base: 120 * v, growth: 1.7, depth: 3, side: side * 1.15, requires: { room: roomId },
      flavor: 'Une pièce bien éclairée, c’est une pièce dont on se souvient.',
      effect: (l) => `Valeur de la poussière de la pièce : ${pct(1 + 0.1 * l)}` },
    { id: `echo:${roomId}`, name: `Écho du lieu · ${short}`, icon: '🔔', branch: 'castle', kind: 'big', parents: [`shine:${roomId}`], maxLevel: 1, base: 5000 * v, growth: 1, depth: 4, side: side * 1.3, requires: { room: roomId },
      flavor: 'Quand la pièce est impeccable, elle chante.',
      effect: () => 'Bonus « pièce impeccable » doublé' },
  ];
}

export const TREE_NODES: TreeNode[] = [...BASE_NODES, ...ROOMS.flatMap((r, i) => roomBranch(r.id, i, ROOMS.length))];
export const NODE_BY_ID = new Map(TREE_NODES.map((n) => [n.id, n]));
