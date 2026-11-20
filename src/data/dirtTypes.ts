export type DirtId = 'dust' | 'bunny' | 'star' | 'crumb' | 'leaf' | 'rubble' | 'soot' | 'web' | 'stain';

/** Outil nécessaire pour retirer une saleté « fixée » (toile, tache). */
export type ToolId = 'broom' | 'duster' | 'sponge' | 'vacuum' | 'blower' | 'widebroom' | 'handpan' | 'whirl';

export interface DirtType {
  id: DirtId;
  name: string;
  /** Valeur de base en pièces. */
  value: number;
  /** Plus c'est lourd, moins le balai le pousse. */
  mass: number;
  /** Rayon visuel/physique en unités du monde. */
  radius: number;
  /** Poids dans le calcul du % de propreté. */
  dirtWeight: number;
  /** Frottement au sol (plus c'est grand, plus ça s'arrête vite). */
  friction: number;
  /** Saleté fixée au sol : on ne la pousse pas, on la retire avec un outil. */
  fixed?: { tool: ToolId; hp: number };
}

export const DIRT_TYPES: Record<DirtId, DirtType> = {
  dust: { id: 'dust', name: 'Poussière', value: 1, mass: 1, radius: 4, dirtWeight: 1, friction: 5.5 },
  bunny: { id: 'bunny', name: 'Mouton', value: 5, mass: 2.6, radius: 13, dirtWeight: 4, friction: 3.2 },
  star: { id: 'star', name: "Poussière d'étoile", value: 100, mass: 0.8, radius: 7, dirtWeight: 0, friction: 4.5 },
  crumb: { id: 'crumb', name: 'Miettes', value: 2, mass: 0.9, radius: 4.5, dirtWeight: 1, friction: 6 },
  leaf: { id: 'leaf', name: 'Feuille morte', value: 8, mass: 0.5, radius: 9, dirtWeight: 2, friction: 2.2 },
  rubble: { id: 'rubble', name: 'Gravats', value: 30, mass: 6, radius: 8, dirtWeight: 5, friction: 9 },
  soot: { id: 'soot', name: 'Suie', value: 20, mass: 1.2, radius: 5, dirtWeight: 2, friction: 7 },
  web: { id: 'web', name: "Toile d'araignée", value: 15, mass: 99, radius: 26, dirtWeight: 6, friction: 99, fixed: { tool: 'duster', hp: 1.2 } },
  stain: { id: 'stain', name: 'Tache', value: 40, mass: 99, radius: 30, dirtWeight: 8, friction: 99, fixed: { tool: 'sponge', hp: 260 } },
};

export const DIRT_ORDER: DirtId[] = ['dust', 'bunny', 'star', 'crumb', 'leaf', 'rubble', 'soot', 'web', 'stain'];

/** Les saletés « libres » (qu'on pousse) et « fixées » (qu'on retire à l'outil). */
export const LOOSE_DIRT: DirtId[] = DIRT_ORDER.filter((d) => !DIRT_TYPES[d].fixed);

export interface ToolDef {
  id: ToolId;
  name: string;
  icon: string;
  /** Nœud de l'arbre qui débloque l'outil (aucun = disponible dès le départ). */
  node?: string;
  hint: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'broom', name: 'Balai', icon: '🧹', hint: 'Pousse la poussière vers les pelles' },
  { id: 'duster', name: 'Plumeau', icon: '🪶', node: 'tool-duster', hint: 'Maintiens le clic sur une toile d’araignée' },
  { id: 'sponge', name: 'Éponge', icon: '🧽', node: 'tool-sponge', hint: 'Frotte une tache (va-et-vient, clic maintenu)' },
  { id: 'vacuum', name: 'Aspirateur', icon: '🌀', node: 'tool-vacuum', hint: 'Aspire tout seul ; vide le réservoir à une pelle (E)' },
  { id: 'blower', name: 'Souffleur', icon: '💨', node: 'tool-blower', hint: 'Souffle fort devant toi (parfait pour les feuilles)' },
  { id: 'widebroom', name: 'Grand balai-brosse', icon: '🧹', node: 'tool-widebroom', hint: 'Une brosse deux fois plus large : idéale pour rabattre de grandes rangées' },
  { id: 'handpan', name: 'Pelle à main', icon: '🪣', node: 'tool-handpan', hint: 'Clic maintenu : ramasse directement le petit tas devant toi' },
  { id: 'whirl', name: 'Balai magique de Gustave', icon: '🌪️', node: 'tool-whirl', hint: 'Clic maintenu : un tourbillon attire et avale la poussière autour' },
];
