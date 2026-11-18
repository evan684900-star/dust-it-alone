import { ROOMS } from './rooms';

/** Les branches de l'Arbre des Souvenirs (angle en degrés, 0 = en haut, sens horaire). */
export type BranchId = 'broom' | 'pickup' | 'memory' | 'castle' | 'plume' | 'helpers';

export const BRANCHES: Record<BranchId, { name: string; icon: string; angle: number; color: string }> = {
  broom: { name: 'Balai', icon: '🧹', angle: 0, color: '#ffc93c' },
  pickup: { name: 'Ramassage', icon: '🗑️', angle: 72, color: '#5ec8f2' },
  memory: { name: 'Mémoire', icon: '✨', angle: 144, color: '#c38bff' },
  castle: { name: 'Château', icon: '🏰', angle: 216, color: '#7bd651' },
  plume: { name: 'Plume', icon: '👟', angle: 288, color: '#ff8a6e' },
  helpers: { name: 'Assistants', icon: '🐑', angle: 252, color: '#b8a99a' },
};

/** ● petit nœud (plusieurs niveaux), ◆ grand nœud (déblocage), ◇ jonction entre deux branches. */
export type NodeKind = 'small' | 'big' | 'junction';

/** Condition de jeu (en plus des parents). */
export type Requirement = { room: string } | { soon: true };

/**
 * Ce que fait un nœud, par niveau. `add` s'additionne, `mul` se multiplie (per^niveau).
 * `room` : l'effet ne concerne qu'une pièce.
 */
export type StatKey =
  | 'broomWidth' | 'broomGrip' | 'pushPower' | 'reach'
  | 'panScale' | 'panPull' | 'magnet'
  | 'value' | 'bunnyValue' | 'starChance' | 'starValue' | 'scoop' | 'places'
  | 'respawn' | 'roomValue' | 'echo'
  | 'walk' | 'sprint' | 'march'
  | 'duster' | 'sponge' | 'blower' | 'vacuumCap';
export interface Stat { key: StatKey; per: number; mode: 'add' | 'mul'; room?: string }

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
  flavor: string;
  /** Effet en clair pour un niveau donné (affiché « avant → après »). */
  effect: (level: number) => string;
  stats: Stat[];
  /** Position : distance à la racine (anneaux) et couloir sur le côté. */
  depth: number;
  side?: number;
  /** Jonctions : angle propre (degrés). */
  angle?: number;
  requires?: Requirement;
  /** Les deux nœuds d'une fourche s'excluent : on en choisit un seul. */
  fork?: string;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;
const cm = (v: number) => `${Math.round(v)} cm`;
const fmtMult = (v: number) => `×${v < 10 ? v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',') : Math.round(v)}`;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

interface ChainSpec {
  /** Préfixe des identifiants : `${prefix}-1`, `${prefix}-2`… */
  prefix: string;
  name: string;
  icon: string;
  branch: BranchId;
  /** Premier parent de la chaîne (null = la racine). */
  root: string | null;
  tiers: number;
  levels: number;
  /** Prix de base du palier I, puis multiplié par `tierMult` à chaque palier. */
  base: number;
  tierMult: number;
  growth: number;
  /** Effet par niveau pour le palier t (0 = palier I). */
  per: (t: number) => number;
  key: StatKey;
  mode: 'add' | 'mul';
  room?: string;
  depth0: number;
  side: number;
  /** Décalage latéral un palier sur deux (la chaîne serpente un peu pour respirer). */
  drift?: number;
  flavors: string[];
  effect: (perLevel: number, level: number) => string;
  requires?: (t: number) => Requirement | undefined;
}

/** Une chaîne de paliers I, II, III… : chaque palier demande le précédent. */
function chain(c: ChainSpec): TreeNode[] {
  const out: TreeNode[] = [];
  for (let t = 0; t < c.tiers; t++) {
    const id = `${c.prefix}-${t + 1}`;
    const per = c.per(t);
    out.push({
      id,
      name: `${c.name} ${ROMAN[t]}`,
      icon: c.icon,
      branch: c.branch,
      kind: 'small',
      parents: t === 0 ? (c.root ? [c.root] : []) : [`${c.prefix}-${t}`],
      maxLevel: c.levels,
      base: c.base * Math.pow(c.tierMult, t),
      growth: c.growth,
      flavor: c.flavors[Math.min(t, c.flavors.length - 1)],
      effect: (l) => c.effect(per, l),
      stats: [{ key: c.key, per, mode: c.mode, room: c.room }],
      depth: c.depth0 + t,
      side: c.side + (c.drift ?? 0) * (t % 2 === 0 ? 0 : 1),
      requires: c.requires?.(t),
    });
  }
  return out;
}

// ───────────────────────────── 🧹 Balai ─────────────────────────────

const BROOM: TreeNode[] = [
  ...chain({
    prefix: 'broom-wide', name: 'Brosse large', icon: '🧹', branch: 'broom', root: null, tiers: 6, levels: 5,
    base: 25, tierMult: 26, growth: 1.85, per: (t) => 6 + t * 2, key: 'broomWidth', mode: 'add', depth0: 1, side: 0,
    flavors: [
      "L'art oublié de Gustave, balayeur en chef du Roi : « Plus c'est large, moins on repasse. »",
      'Gustave balayait la Galerie en trois coups. Trois !',
      'Des poils tissés à la main par les nonnes de la chapelle.',
      'On raconte que cette brosse a balayé un dragon. Un petit.',
      'Il faut bien deux bras pour la porter. Heureusement, tu en as deux.',
      'La brosse la plus large du royaume. Elle a sa propre ombre.',
    ],
    effect: (per, l) => `+${per} cm de largeur par niveau (+${cm(per * l)})`,
  }),
  ...chain({
    prefix: 'broom-grip', name: 'Poils durs', icon: '🪮', branch: 'broom', root: 'broom-wide-1', tiers: 3, levels: 5,
    base: 120, tierMult: 70, growth: 2, per: () => 0.04, key: 'broomGrip', mode: 'add', depth0: 2, side: 1.1, drift: 0.3,
    flavors: ['Des poils de sanglier, comme autrefois.', 'Même les moutons les plus dodus suivent.', 'Rien ne glisse sous ces poils-là.'],
    effect: (per, l) => `+${pct(per)} de prise par niveau (+${pct(per * l)})`,
  }),
  ...chain({
    prefix: 'broom-push', name: 'Coup de balai', icon: '💪', branch: 'broom', root: 'broom-wide-1', tiers: 4, levels: 5,
    base: 600, tierMult: 55, growth: 2, per: () => 0.08, key: 'pushPower', mode: 'add', depth0: 2, side: -1.1, drift: -0.3,
    flavors: ['Le geste sec et franc des grandes lessives de printemps.', 'Un coup de poignet, et la poussière s’envole.', 'Les moutons en tremblent.', 'Le légendaire « coup du Roi ».'],
    effect: (per, l) => `+${pct(per)} de force de poussée par niveau (+${pct(per * l)})`,
  }),
  ...chain({
    prefix: 'broom-reach', name: 'Manche télescopique', icon: '📏', branch: 'broom', root: 'broom-push-1', tiers: 2, levels: 3,
    base: 900, tierMult: 120, growth: 2.2, per: () => 25, key: 'reach', mode: 'add', depth0: 3, side: -2.1,
    flavors: ['Pour atteindre les moutons qui se cachent sous les meubles.', 'Un manche en bois d’ébène, poli par des siècles de ménage.'],
    effect: (per, l) => `+${per} cm de portée par niveau (+${cm(per * l)})`,
    requires: (t) => (t === 0 ? { room: 'gallery' } : undefined),
  }),
  // Les outils : chacun se débloque quand la saleté qu'il traite apparaît dans le château.
  { id: 'tool-duster', name: 'Plumeau', icon: '🪶', branch: 'broom', kind: 'big', parents: ['broom-push-1'], maxLevel: 1, base: 2500, growth: 1, depth: 3.5, side: -2.7, requires: { room: 'gallery' }, stats: [],
    flavor: 'Pour les toiles d’araignée. Les araignées, elles, ne sont pas ravies.', effect: () => 'Débloque le plumeau (touche 2) : retire les toiles d’araignée' },
  { id: 'tool-sponge', name: 'Éponge', icon: '🧽', branch: 'broom', kind: 'big', parents: ['tool-duster'], maxLevel: 1, base: 40000, growth: 1, depth: 4.6, side: -2.9, requires: { room: 'bedroom' }, stats: [],
    flavor: 'Frotte, frotte… la tache finit toujours par céder.', effect: () => 'Débloque l’éponge (touche 3) : frotte les taches' },
  { id: 'tool-vacuum', name: 'Aspirateur', icon: '🌀', branch: 'broom', kind: 'big', parents: ['tool-sponge'], maxLevel: 1, base: 4e6, growth: 1, depth: 5.7, side: -3.1, requires: { room: 'hall' }, stats: [],
    flavor: 'Une invention moderne. Les portraits trouvent ça bruyant.', effect: () => 'Débloque l’aspirateur (touche 4) : aspire tout, vide-le à une pelle' },
  { id: 'tool-blower', name: 'Souffleur', icon: '💨', branch: 'broom', kind: 'big', parents: ['tool-vacuum'], maxLevel: 1, base: 6e7, growth: 1, depth: 6.8, side: -3.3, requires: { room: 'courtyard' }, stats: [],
    flavor: 'Le vent, en boîte. Les feuilles mortes n’ont aucune chance.', effect: () => 'Débloque le souffleur (touche 5) : souffle tout devant toi' },
  { id: 'duster-power', name: 'Plumes d’autruche', icon: '🪶', branch: 'broom', kind: 'small', parents: ['tool-duster'], maxLevel: 5, base: 6000, growth: 1.9, depth: 4, side: -3.8, stats: [{ key: 'duster', per: 0.3, mode: 'add' }],
    flavor: 'Plus douces, plus efficaces.', effect: (l) => `Le plumeau va +30 % plus vite par niveau (+${Math.round(30 * l)} %)` },
  { id: 'sponge-power', name: 'Éponge magique', icon: '🫧', branch: 'broom', kind: 'small', parents: ['tool-sponge'], maxLevel: 5, base: 90000, growth: 1.9, depth: 5.1, side: -4, stats: [{ key: 'sponge', per: 0.3, mode: 'add' }],
    flavor: 'Elle mousse toute seule.', effect: (l) => `L’éponge frotte +30 % plus fort par niveau (+${Math.round(30 * l)} %)` },
  { id: 'vacuum-cap', name: 'Réservoir XXL', icon: '🛢️', branch: 'broom', kind: 'small', parents: ['tool-vacuum'], maxLevel: 5, base: 8e6, growth: 1.9, depth: 6.2, side: -4.2, stats: [{ key: 'vacuumCap', per: 200, mode: 'add' }],
    flavor: 'Plus besoin de le vider toutes les deux minutes.', effect: (l) => `+200 grains dans le réservoir par niveau (${300 + 200 * l})` },
  { id: 'blower-power', name: 'Souffleur turbo', icon: '🌪️', branch: 'broom', kind: 'small', parents: ['tool-blower'], maxLevel: 5, base: 1.2e8, growth: 1.9, depth: 7.3, side: -4.4, stats: [{ key: 'blower', per: 0.25, mode: 'add' }],
    flavor: 'Vroum.', effect: (l) => `Le souffleur pousse +25 % plus fort par niveau (+${Math.round(25 * l)} %)` },
  { id: 'broom-giant', name: 'Brosse géante', icon: '🦣', branch: 'broom', kind: 'big', parents: ['broom-wide-3'], maxLevel: 1, base: 3e5, growth: 1, depth: 4.2, side: 1.9, fork: 'broom-fork',
    stats: [{ key: 'broomWidth', per: 60, mode: 'add' }, { key: 'broomGrip', per: -0.1, mode: 'add' }],
    flavor: "Une brosse si large qu'il faut la tenir à deux mains. Moins précise, mais quelle allure.",
    effect: () => 'Fourche : +60 cm de largeur, −10 % de prise' },
  { id: 'broom-precise', name: 'Brosse de précision', icon: '🎯', branch: 'broom', kind: 'big', parents: ['broom-wide-3'], maxLevel: 1, base: 3e5, growth: 1, depth: 5.2, side: 2.3, fork: 'broom-fork',
    stats: [{ key: 'broomGrip', per: 0.3, mode: 'add' }, { key: 'pushPower', per: 0.2, mode: 'add' }],
    flavor: 'Chaque poil sait exactement où aller.', effect: () => 'Fourche : +30 % de prise, +20 % de force' },
];

// ───────────────────────────── 🗑️ Ramassage ─────────────────────────────

const PICKUP: TreeNode[] = [
  ...chain({
    prefix: 'pan-size', name: 'Pelles géantes', icon: '🗑️', branch: 'pickup', root: null, tiers: 5, levels: 5,
    base: 40, tierMult: 36, growth: 1.9, per: () => 0.08, key: 'panScale', mode: 'add', depth0: 1, side: 0,
    flavors: ['Une grande pelle pardonne les gestes maladroits.', 'À ce stade, ce ne sont plus des pelles, ce sont des baignoires.', 'Le forgeron du château serait fier.', 'On pourrait y garer un carrosse.', 'Des pelles si grandes qu’elles ont leur propre nom.'],
    effect: (per, l) => `+${pct(per)} de taille des pelles par niveau (+${pct(per * l)})`,
  }),
  ...chain({
    prefix: 'pan-pull', name: 'Aspiration magique', icon: '🧲', branch: 'pickup', root: 'pan-size-1', tiers: 4, levels: 5,
    base: 200, tierMult: 45, growth: 1.9, per: () => 20, key: 'panPull', mode: 'add', depth0: 2, side: 1.2, drift: 0.3,
    flavors: ['Les pelles ont faim.', 'La poussière qui passe à côté finit dedans.', 'Un petit vent magique souffle vers la pelle.', 'Même les moutons se laissent aspirer.'],
    effect: (per, l) => `+${per} cm d’aspiration autour des pelles par niveau (+${cm(per * l)})`,
  }),
  { id: 'pan-magnet', name: 'Pelle aimantée', icon: '🌪️', branch: 'pickup', kind: 'big', parents: ['pan-pull-3'], maxLevel: 1, base: 4e6, growth: 1, depth: 4.6, side: 2.4,
    stats: [{ key: 'magnet', per: 1, mode: 'add' }],
    flavor: 'Toute la poussière de la pièce glisse lentement vers les pelles.', effect: () => 'Les pelles attirent doucement la poussière de toute la pièce' },
  { id: 'pan-gold', name: 'Pelle en or', icon: '👑', branch: 'pickup', kind: 'big', parents: ['pan-size-5'], maxLevel: 1, base: 1e10, growth: 1, depth: 6, side: 0,
    stats: [{ key: 'value', per: 1.5, mode: 'mul' }],
    flavor: 'La pelle du Roi en personne. Tout ce qui y tombe vaut plus cher.', effect: () => 'Toute la poussière vaut ×1,5' },
];

// ───────────────────────────── ✨ Mémoire ─────────────────────────────

const MEMORY: TreeNode[] = [
  ...chain({
    prefix: 'value', name: 'Poussière précieuse', icon: '💎', branch: 'memory', root: null, tiers: 8, levels: 5,
    base: 100, tierMult: 11, growth: 1.6, per: (t) => 1.1 + t * 0.005, key: 'value', mode: 'mul', depth0: 1, side: 0,
    flavors: [
      'Chaque grain contient un tout petit souvenir.',
      'Des souvenirs de bal, de fêtes, de premières neiges…',
      'Un rire d’enfant, un parfum de tarte aux pommes.',
      'La voix du Roi qui chantait faux, le soir.',
      'Des lettres jamais envoyées.',
      'Le premier pas d’Élise dans la Galerie.',
      'Une promesse faite sous la lune.',
      'Le jour où tout le château riait ensemble.',
    ],
    effect: (per, l) => `Valeur de la poussière ${fmtMult(per)} par niveau (${fmtMult(Math.pow(per, l))})`,
  }),
  ...chain({
    prefix: 'star-luck', name: 'Chance dorée', icon: '⭐', branch: 'memory', root: 'value-1', tiers: 3, levels: 5,
    base: 800, tierMult: 90, growth: 1.8, per: () => 0.0008, key: 'starChance', mode: 'add', depth0: 2, side: 1.2, drift: 0.3,
    flavors: ['La poussière d’étoile aime les balayeurs chanceux.', 'Le ciel laisse tomber ses miettes.', 'Il pleut presque des étoiles.'],
    effect: (per) => `+${(per * 100).toFixed(2).replace('.', ',')} % de poussière d’étoile par niveau`,
  }),
  ...chain({
    prefix: 'star-value', name: 'Étoiles précieuses', icon: '🌟', branch: 'memory', root: 'star-luck-1', tiers: 2, levels: 5,
    base: 60000, tierMult: 160, growth: 2, per: () => 1.3, key: 'starValue', mode: 'mul', depth0: 3, side: 2.2,
    flavors: ['Une étoile vaut cent grains. Ou plus.', 'Des étoiles qui scintillent encore dans la pelle.'],
    effect: (per, l) => `Valeur des étoiles ${fmtMult(per)} par niveau (${fmtMult(Math.pow(per, l))})`,
  }),
  ...chain({
    prefix: 'bunny-fat', name: 'Moutons dodus', icon: '🐑', branch: 'memory', root: 'value-1', tiers: 3, levels: 5,
    base: 1200, tierMult: 75, growth: 1.7, per: (t) => 3 + t * 3, key: 'bunnyValue', mode: 'add', depth0: 2, side: -1.2, drift: -0.3,
    flavors: ['Plus un mouton a mangé de poussière, plus il vaut cher.', 'Des moutons bien nourris.', 'Des moutons… impressionnants.'],
    effect: (per, l) => `+${per} par mouton et par niveau (+${per * l})`,
    requires: (t) => (t === 0 ? { room: 'gallery' } : undefined),
  }),
  { id: 'star-rain', name: 'Pluie d’étoiles', icon: '🌠', branch: 'memory', kind: 'big', parents: ['star-luck-3'], maxLevel: 1, base: 3e6, growth: 1, depth: 5, side: 1.8, requires: { soon: true }, stats: [],
    flavor: 'Parfois, le ciel se souvient aussi.', effect: () => 'Débloque l’événement « pluie d’étoiles »' },
  { id: 'memory-heart', name: 'Cœur de mémoire', icon: '💖', branch: 'memory', kind: 'big', parents: ['value-8'], maxLevel: 1, base: 2e10, growth: 1, depth: 9.2, side: 0,
    stats: [{ key: 'value', per: 2, mode: 'mul' }],
    flavor: 'Le souvenir le plus précieux du château. Celui qu’Élise a laissé derrière elle.', effect: () => 'Toute la poussière vaut ×2' },
];

// ───────────────────────────── 👟 Plume ─────────────────────────────

const PLUME: TreeNode[] = [
  ...chain({
    prefix: 'plume-speed', name: 'Chaussons de feutre', icon: '🥿', branch: 'plume', root: null, tiers: 3, levels: 5,
    base: 200, tierMult: 90, growth: 1.9, per: () => 0.05, key: 'walk', mode: 'add', depth0: 1, side: 0,
    flavors: ['Silencieux, rapides, et ils ne rayent pas le parquet.', 'Des semelles de nuage.', 'On dit qu’ils ont appartenu à un fantôme.'],
    effect: (per, l) => `+${pct(per)} de vitesse par niveau (+${pct(per * l)})`,
  }),
  ...chain({
    prefix: 'plume-sprint', name: 'Souffle du vent', icon: '💨', branch: 'plume', root: 'plume-speed-1', tiers: 2, levels: 3,
    base: 6000, tierMult: 150, growth: 2.5, per: () => 0.15, key: 'sprint', mode: 'add', depth0: 2, side: 1.1,
    flavors: ['Le Grand Hall est grand. Très grand.', 'Plume file comme un courant d’air.'],
    effect: (per, l) => `Course (Maj) +${pct(per)} par niveau (+${pct(per * l)})`,
    requires: (t) => (t === 0 ? { room: 'hall' } : undefined),
  }),
  { id: 'plume-feet', name: 'Pas léger', icon: '🦶', branch: 'plume', kind: 'big', parents: ['plume-speed-3'], maxLevel: 1, base: 1e6, growth: 1, depth: 4, side: 0, requires: { soon: true }, stats: [],
    flavor: 'Même tes pieds font le ménage.', effect: () => 'En marchant, tes pieds poussent un peu la poussière' },
];

// ───────────────────────────── ◇ Jonctions ─────────────────────────────

const JUNCTIONS: TreeNode[] = [
  { id: 'junction-scoop', name: 'Coup de pelle', icon: '🎳', branch: 'broom', kind: 'junction', parents: ['broom-wide-2', 'pan-size-2'], maxLevel: 1, base: 30000, growth: 1, depth: 3, angle: 36,
    stats: [{ key: 'scoop', per: 0.25, mode: 'add' }],
    flavor: 'Balayer droit dans la pelle, c’est tout un art.', effect: () => 'La poussière poussée par le balai droit dans une pelle vaut +25 %' },
  { id: 'junction-scoop-2', name: 'Coup de pelle royal', icon: '🎳', branch: 'broom', kind: 'junction', parents: ['junction-scoop', 'broom-wide-4', 'pan-size-4'], maxLevel: 1, base: 2e9, growth: 1, depth: 5.2, angle: 36,
    stats: [{ key: 'scoop', per: 0.5, mode: 'add' }],
    flavor: 'Gustave et la pelle ne faisaient qu’un.', effect: () => 'Encore +50 % pour la poussière poussée droit dans une pelle' },
  { id: 'junction-places', name: 'Mémoire des lieux', icon: '🏛️', branch: 'memory', kind: 'junction', parents: ['value-2', 'castle-root'], maxLevel: 1, base: 2e5, growth: 1, depth: 3, angle: 180,
    stats: [{ key: 'places', per: 0.05, mode: 'add' }],
    flavor: 'Une pièce qui se souvient aide les autres à se souvenir.', effect: () => '+5 % de valeur partout pour chaque pièce impeccable' },
  { id: 'junction-march', name: 'Marche du balayeur', icon: '🚶', branch: 'plume', kind: 'junction', parents: ['plume-speed-1', 'broom-wide-1'], maxLevel: 1, base: 25000, growth: 1, depth: 2.4, angle: 324,
    stats: [{ key: 'march', per: 0.2, mode: 'add' }],
    flavor: 'Avancer en balayant : le geste des pros.', effect: () => 'Balayer en avançant pousse 20 % plus fort' },
  { id: 'junction-spring', name: 'Grand ménage de printemps', icon: '🌷', branch: 'pickup', kind: 'junction', parents: ['pan-pull-2', 'value-3'], maxLevel: 1, base: 5e7, growth: 1, depth: 4, angle: 108,
    stats: [{ key: 'value', per: 1.25, mode: 'mul' }],
    flavor: 'Le château entier sent le propre.', effect: () => 'Toute la poussière vaut ×1,25' },
];

// ───────────────────────────── 🐑 Assistants (plus tard) ─────────────────────────────

const HELPERS: TreeNode[] = [
  { id: 'helpers-root', name: '???', icon: '🐑', branch: 'helpers', kind: 'big', parents: [], maxLevel: 1, base: 1, growth: 1, depth: 1.5, requires: { soon: true }, stats: [],
    flavor: 'On entend des petits bêlements derrière les murs…', effect: () => 'Bientôt : les assistants' },
];

// ───────────────────────────── 🏰 Château ─────────────────────────────

/** Branche d'une pièce : prix multipliés selon la valeur de la pièce. */
function roomBranch(roomId: string, index: number, total: number): TreeNode[] {
  const room = ROOMS.find((r) => r.id === roomId)!;
  const v = Math.pow(room.valueMult, 2.2);
  const short = room.name.replace(/^(La |Le |Les |L’|L')/, '');
  // Les pièces se rangent en rangées, de plus en plus loin du tronc : 3, puis 4, 4 et 3 pièces.
  // Plus on s'éloigne, plus le secteur du Château est large : les rangées lointaines ont plus de place.
  void total;
  const ROWS = [3, 4, 4, 3];
  let row = 0;
  let k = index;
  while (row < ROWS.length - 1 && k >= ROWS[row]) k -= ROWS[row++];
  const lanes = ROWS[row] === 4 ? [-1.2, 1.2, -3.6, 3.6] : [0, 1.7, -1.7];
  const side = lanes[k] ?? 0;
  const d0 = 3 + row * 4.5;
  const req = () => ({ room: roomId });
  return [
    ...chain({
      prefix: `airflow:${roomId}`, name: `Courants d’air · ${short}`, icon: '🌬️', branch: 'castle', root: 'castle-root', tiers: 3, levels: 5,
      base: 60 * v, tierMult: 60, growth: 1.9, per: () => 0.1, key: 'respawn', mode: 'add', room: roomId, depth0: d0, side,
      flavors: ['Une fenêtre entrouverte, et la poussière revient… pour être ramassée.', 'Le vent apporte la poussière du dehors.', 'Une vraie tempête de poussière.'],
      effect: (per, l) => `+${pct(per)} de poussière qui retombe par niveau (+${pct(per * l)})`,
      requires: req,
    }),
    ...chain({
      prefix: `shine:${roomId}`, name: `Lustre · ${short}`, icon: '💡', branch: 'castle', root: `airflow:${roomId}-1`, tiers: 3, levels: 5,
      base: 150 * v, tierMult: 60, growth: 2, per: () => 0.08, key: 'roomValue', mode: 'add', room: roomId, depth0: d0 + 1, side: side + 0.75,
      flavors: ['Une pièce bien éclairée, c’est une pièce dont on se souvient.', 'Le lustre brille de mille feux.', 'La pièce rayonne.'],
      effect: (per, l) => `+${pct(per)} de valeur dans la pièce par niveau (+${pct(per * l)})`,
      requires: req,
    }),
    { id: `echo:${roomId}`, name: `Écho du lieu · ${short}`, icon: '🔔', branch: 'castle', kind: 'big', parents: [`shine:${roomId}-3`], maxLevel: 1, base: 2e6 * v, growth: 1, depth: d0 + 4, side: side + 0.4, requires: req(),
      stats: [{ key: 'echo', per: 1, mode: 'add', room: roomId }],
      flavor: 'Quand la pièce est impeccable, elle chante.', effect: () => 'Bonus « pièce impeccable » doublé' },
  ];
}

const CASTLE: TreeNode[] = [
  { id: 'castle-root', name: 'Cœur du château', icon: '🏰', branch: 'castle', kind: 'small', parents: [], maxLevel: 1, base: 60, growth: 1, depth: 1, stats: [],
    flavor: 'Le château a un cœur. Il bat très, très doucement.', effect: (l) => (l ? 'Les branches des pièces peuvent pousser' : 'Ouvre les branches des pièces du château') },
  ...ROOMS.flatMap((r, i) => roomBranch(r.id, i, ROOMS.length)),
];

/**
 * Multiplicateur de prix de toutes les améliorations : le bouton « difficulté » de l'économie.
 * Réglé avec le simulateur de progression (tools/pacing.ts) pour une partie d'au moins 10 h.
 */
export const COST_SCALE = 1.6;

export const TREE_NODES: TreeNode[] = [...BROOM, ...PICKUP, ...MEMORY, ...PLUME, ...JUNCTIONS, ...HELPERS, ...CASTLE].map((n) => ({
  ...n,
  base: n.base * COST_SCALE,
}));
export const NODE_BY_ID = new Map(TREE_NODES.map((n) => [n.id, n]));
