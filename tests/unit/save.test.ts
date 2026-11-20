import { describe, expect, it } from 'vitest';
import { createWorld, currentWorld, deleteWorld, listWorlds, loadSave, migrate, renameWorld, SAVE_KEY, setCurrentWorld, worldKey, writeSave } from '../../src/save/save';

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('sauvegarde', () => {
  it('écrit puis relit les données', () => {
    const s = memoryStore();
    const data = migrate(null);
    data.rooms.gallery = { unlocked: true, cleaned: true };
    writeSave({ ...data, coins: 123, totalCoins: 456, player: { x: 1, z: 2, y: 3, yaw: 0.5 } }, s);
    const loaded = loadSave(s);
    expect(loaded.coins).toBe(123);
    expect(loaded.totalCoins).toBe(456);
    expect(loaded.rooms.gallery).toEqual({ unlocked: true, cleaned: true });
    expect(loaded.player).toEqual({ x: 1, z: 2, y: 3, yaw: 0.5 });
  });
  it('se rabat sur la copie de secours si la sauvegarde est abîmée', () => {
    const s = memoryStore();
    writeSave({ ...migrate(null), coins: 10 }, s);
    writeSave({ ...migrate(null), coins: 20 }, s);
    s.setItem(SAVE_KEY, '{oups');
    expect(loadSave(s).coins).toBe(10);
  });
  it('nettoie les valeurs absurdes', () => {
    const d = migrate({ coins: -5, totalCoins: 'beaucoup', roomCleanedOnce: 'oui' });
    expect(d.coins).toBe(0);
    expect(d.totalCoins).toBe(0);
    expect(d.rooms.attic.unlocked).toBe(true);
  });
  it('convertit une sauvegarde de la version 1 (une seule pièce)', () => {
    const d = migrate({ version: 1, coins: 50, roomCleanedOnce: true });
    expect(d.coins).toBe(50);
    expect(d.rooms.attic).toEqual({ unlocked: true, cleaned: true });
    expect(d.player).toBeNull();
  });
});

describe('réglages graphiques', () => {
  it('garde la qualité choisie et rejette les valeurs inconnues', () => {
    expect(migrate({ quality: 'low' }).quality).toBe('low');
    expect(migrate({ quality: 'turbo' }).quality).toBe('auto');
    expect(migrate({}).quality).toBe('auto');
    expect(migrate({ showFps: true }).showFps).toBe(true);
  });
});

describe('poussière restante', () => {
  it('la poussière qui reste dans chaque pièce est sauvegardée et relue', () => {
    const s = memoryStore();
    const data = migrate(null);
    data.rooms.attic.dirt = { dust: 120, bunny: 3, star: 0 };
    writeSave(data, s);
    expect(loadSave(s).rooms.attic.dirt).toEqual({ dust: 120, bunny: 3, star: 0 });
  });
  it('une valeur abîmée est ignorée (la pièce repart pleine plutôt que de planter)', () => {
    const d = migrate({ rooms: { attic: { unlocked: true, dirt: { dust: 'beaucoup', bunny: 1, star: 0 } } } });
    expect(d.rooms.attic.dirt).toBeUndefined();
  });
});

describe('Mondes (plusieurs sauvegardes)', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  it('l’ancienne sauvegarde unique devient le monde « Mon château »', () => {
    const s = mem();
    s.setItem('dust-it-alone:save', JSON.stringify({ ...migrate(null), coins: 77 }));
    const list = listWorlds(s);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'main', name: 'Mon château', coins: 77, multiplayer: false });
    expect(loadSave(s).coins).toBe(77);
  });
  it('on crée plusieurs mondes, chacun avec sa sauvegarde, et on passe de l’un à l’autre', () => {
    const s = mem();
    const a = createWorld('Le premier', false, true, null, s);
    writeSave({ ...loadSave(s), coins: 5 }, s);
    const b = createWorld('Avec les copains', true, false, null, s);
    expect(currentWorld(s)).toBe(b);
    expect(loadSave(s).coins).toBe(0);
    expect(loadSave(s).world).toEqual({ name: 'Avec les copains', multiplayer: true, isPublic: false });
    writeSave({ ...loadSave(s), coins: 9 }, s);
    setCurrentWorld(a, s);
    expect(loadSave(s).coins).toBe(5);
    const list = listWorlds(s);
    expect(list.map((w) => w.name).sort()).toEqual(['Avec les copains', 'Le premier']);
    expect(list.find((w) => w.id === b)).toMatchObject({ coins: 9, multiplayer: true });
  });
  it('effacer et renommer un monde', () => {
    const s = mem();
    const a = createWorld('A', false, true, null, s);
    const b = createWorld('B', false, true, null, s);
    renameWorld(a, 'Alpha', s);
    expect(listWorlds(s).find((w) => w.id === a)?.name).toBe('Alpha');
    deleteWorld(b, s);
    expect(listWorlds(s).map((w) => w.id)).toEqual([a]);
    expect(currentWorld(s)).toBe(a);
    expect(s.getItem(worldKey(b))).toBeNull();
  });
});
