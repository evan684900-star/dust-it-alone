import type { SaveData } from '../save/save';
import { ALL_SOUVENIRS } from './story';
import { ROOMS } from './rooms';

export interface AchievementContext {
  save: SaveData;
  /** Total des grains ramassés. */
  grains: number;
  cleanedRooms: number;
  unlockedRooms: number;
  helpers: number;
}

export interface Achievement {
  id: string;
  icon: string;
  name: string;
  text: string;
  /** Avancement entre 0 et 1 (1 = débloqué). */
  progress: (c: AchievementContext) => number;
}

const ratio = (v: number, goal: number) => Math.min(1, v / goal);
const g = (c: AchievementContext, id: keyof SaveData['stats']['grains']) => c.save.stats.grains[id] ?? 0;
const TOTAL_ROOMS = ROOMS.length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-grain', icon: '🌱', name: 'Un début à tout', text: 'Faire tomber un premier grain dans une pelle.', progress: (c) => ratio(c.grains, 1) },
  { id: 'grains-1k', icon: '🧹', name: 'Mille grains', text: 'Ramasser 1 000 grains.', progress: (c) => ratio(c.grains, 1e3) },
  { id: 'grains-100k', icon: '🏔️', name: 'Une montagne de poussière', text: 'Ramasser 100 000 grains.', progress: (c) => ratio(c.grains, 1e5) },
  { id: 'grains-1m', icon: '🌌', name: 'Un million de grains', text: 'Ramasser 1 000 000 de grains.', progress: (c) => ratio(c.grains, 1e6) },
  { id: 'bunnies', icon: '🐑', name: 'Berger du grenier', text: 'Ramasser 500 moutons de poussière.', progress: (c) => ratio(g(c, 'bunny'), 500) },
  { id: 'stars', icon: '⭐', name: 'Chasseur d’étoiles', text: 'Ramasser 100 poussières d’étoile.', progress: (c) => ratio(g(c, 'star'), 100) },
  { id: 'webs', icon: '🕸️', name: 'Les araignées déménagent', text: 'Enlever 200 toiles d’araignée.', progress: (c) => ratio(g(c, 'web'), 200) },
  { id: 'stains', icon: '🧽', name: 'Ça part !', text: 'Frotter 200 taches.', progress: (c) => ratio(g(c, 'stain'), 200) },
  { id: 'leaves', icon: '🍂', name: 'L’automne est fini', text: 'Ramasser 2 000 feuilles mortes.', progress: (c) => ratio(g(c, 'leaf'), 2000) },
  { id: 'room-1', icon: '✨', name: 'Impeccable', text: 'Rendre une pièce impeccable.', progress: (c) => ratio(c.cleanedRooms, 1) },
  { id: 'rooms-7', icon: '🏰', name: 'La moitié du château', text: 'Rendre 7 pièces impeccables.', progress: (c) => ratio(c.cleanedRooms, 7) },
  { id: 'rooms-all', icon: '👑', name: 'Le château brille', text: 'Rendre toutes les pièces impeccables.', progress: (c) => ratio(c.cleanedRooms, TOTAL_ROOMS) },
  { id: 'doors', icon: '🗝️', name: 'Trousseau complet', text: 'Ouvrir toutes les portes du château.', progress: (c) => ratio(c.unlockedRooms, TOTAL_ROOMS) },
  { id: 'souvenir-1', icon: '📜', name: 'Ça me revient…', text: 'Trouver un premier souvenir.', progress: (c) => ratio(c.save.souvenirs.length, 1) },
  { id: 'souvenirs-30', icon: '🧠', name: 'La mémoire du château', text: 'Trouver 30 souvenirs.', progress: (c) => ratio(c.save.souvenirs.length, 30) },
  { id: 'souvenirs-all', icon: '💖', name: 'Rien n’est oublié', text: 'Trouver tous les souvenirs.', progress: (c) => ratio(c.save.souvenirs.length, ALL_SOUVENIRS.length) },
  { id: 'echoes', icon: '👻', name: 'Échos du passé', text: 'Voir 5 échos du passé.', progress: (c) => ratio(c.save.echoes.length, 5) },
  { id: 'ending', icon: '🎬', name: 'Bienvenue à la maison', text: 'Voir la fin de l’histoire.', progress: (c) => (c.save.endingSeen ? 1 : 0) },
  { id: 'coins-1m', icon: '💰', name: 'Petit pécule', text: 'Gagner 1 million de pièces au total.', progress: (c) => ratio(c.save.totalCoins, 1e6) },
  { id: 'coins-1b', icon: '🏦', name: 'Trésor royal', text: 'Gagner 1 milliard de pièces au total.', progress: (c) => ratio(c.save.totalCoins, 1e9) },
  { id: 'coins-1t', icon: '🐉', name: 'Plus riche qu’un dragon', text: 'Gagner 1 000 milliards de pièces au total.', progress: (c) => ratio(c.save.totalCoins, 1e12) },
  { id: 'helpers', icon: '🤝', name: 'On n’est jamais seul', text: 'Engager un premier assistant.', progress: (c) => ratio(c.helpers, 1) },
  { id: 'tree-100', icon: '🌳', name: 'Jardinier de l’arbre', text: 'Acheter 100 niveaux dans l’arbre.', progress: (c) => ratio(c.save.stats.levelsBought, 100) },
  { id: 'coins-found', icon: '🪙', name: 'Œil de lynx', text: 'Ramasser 5 pièces brillantes.', progress: (c) => ratio(c.save.stats.coinsFound, 5) },
  { id: 'events', icon: '🎲', name: 'Imprévus', text: 'Vivre 15 événements.', progress: (c) => ratio(c.save.stats.events, 15) },
  { id: 'walked', icon: '🥾', name: 'Marathon du ménage', text: 'Marcher 5 km dans le château.', progress: (c) => ratio(c.save.stats.walked, 5000) },
  { id: 'time-1h', icon: '⏳', name: 'Une heure de ménage', text: 'Jouer une heure.', progress: (c) => ratio(c.save.stats.playTime, 3600) },
  { id: 'time-10h', icon: '🕰️', name: 'Gardien du château', text: 'Jouer dix heures.', progress: (c) => ratio(c.save.stats.playTime, 36000) },
  { id: 'prestige', icon: '🌟', name: 'Grand Ménage', text: 'Faire un Grand Ménage.', progress: (c) => ratio(c.save.prestiges, 1) },
];
