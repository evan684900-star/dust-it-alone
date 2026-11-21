import { describe, expect, it } from 'vitest';
import { auditMoney, lastLoadTampered, createWorld, currentWorld, deleteWorld, findSaves, listWorlds, loadSave, migrate, renameWorld, restoreAsWorld, SAVE_KEY, setCurrentWorld, worldKey, writeSave } from '../../src/save/save';

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
    // Ancienne sauvegarde (non signée, d'avant la signature).
    s.setItem('dust-it-alone:save', JSON.stringify({ ...migrate(null), coins: 77, savedAt: 1000 }));
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

describe('Filet de sécurité et récupération', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  it('une sauvegarde qui perdrait beaucoup de progression est d’abord mise de côté', () => {
    const s = mem();
    writeSave({ ...migrate(null), coins: 5e6, totalCoins: 9e6 }, s);
    writeSave({ ...migrate(null), coins: 0, totalCoins: 0 }, s); // partie « vide » qui écrase
    writeSave({ ...migrate(null), coins: 1, totalCoins: 1 }, s); // et encore (la copie de secours est perdue)
    const found = findSaves(s);
    expect(found.some((f) => f.kind === 'mise de côté' && f.totalCoins === 9e6)).toBe(true);
  });
  it('pas de mise de côté pour une progression normale ni pour un Grand Ménage', () => {
    const s = mem();
    writeSave({ ...migrate(null), totalCoins: 9e6 }, s);
    writeSave({ ...migrate(null), totalCoins: 9.5e6 }, s);
    writeSave({ ...migrate(null), totalCoins: 0, prestiges: 1 }, s);
    expect(findSaves(s).some((f) => f.kind === 'mise de côté')).toBe(false);
  });
  it('restaurer crée un nouveau monde sans rien écraser', () => {
    const s = mem();
    writeSave({ ...migrate(null), coins: 42, totalCoins: 9e6 }, s);
    writeSave({ ...migrate(null), totalCoins: 0 }, s);
    const lost = findSaves(s).find((f) => f.totalCoins === 9e6)!;
    const id = restoreAsWorld(lost.key, s)!;
    expect(currentWorld(s)).toBe(id);
    expect(loadSave(s).coins).toBe(42);
    expect(loadSave(s).world.name).toContain('récupéré');
    expect(listWorlds(s).length).toBe(2);
  });
  it('un monde effacé reste récupérable', () => {
    const s = mem();
    const a = createWorld('A', false, true, null, s);
    writeSave({ ...loadSave(s), totalCoins: 777 }, s);
    createWorld('B', false, true, null, s);
    deleteWorld(a, s);
    expect(findSaves(s).some((f) => f.kind === 'mise de côté' && f.totalCoins === 777)).toBe(true);
  });
});

describe('Signature anti-triche', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  it('une sauvegarde modifiée à la main est écartée : on reprend la copie de secours', () => {
    const s = mem();
    writeSave({ ...migrate(null), coins: 100 }, s);
    writeSave({ ...migrate(null), coins: 200 }, s);
    const raw = JSON.parse(s.getItem(SAVE_KEY)!);
    raw.coins = 9e15;
    s.setItem(SAVE_KEY, JSON.stringify(raw));
    expect(loadSave(s).coins).toBe(100);
    expect(lastLoadTampered).toBe(true);
  });
  it('retirer la signature ne donne pas d’argent : il reste plafonné par le dernier argent connu', () => {
    const s = mem();
    writeSave({ ...migrate(null), coins: 100, totalCoins: 1000 }, s);
    const raw = JSON.parse(s.getItem(SAVE_KEY)!);
    delete raw.sig;
    raw.coins = 9e15;
    raw.totalCoins = 9e15;
    s.setItem(SAVE_KEY, JSON.stringify(raw));
    s.removeItem(SAVE_KEY + ':backup');
    expect(loadSave(s).coins).toBeLessThan(1e9);
  });
  it('JAMAIS de partie perdue : une sauvegarde sans signature d’un vieil onglet est gardée telle quelle', () => {
    const s = mem();
    const real = { ...migrate(null), coins: 4e6, totalCoins: 9e7, tree: { 'broom-wide-1': 5 }, souvenirs: ['attic-1'], savedAt: Date.now() };
    s.setItem(SAVE_KEY, JSON.stringify(real));
    const d = loadSave(s);
    expect(d.coins).toBe(4e6);
    expect(d.tree['broom-wide-1']).toBe(5);
    expect(d.souvenirs).toEqual(['attic-1']);
  });
  it('JAMAIS de partie perdue : même une sauvegarde suspecte garde ses pièces, son arbre et ses souvenirs', () => {
    const s = mem();
    writeSave({ ...migrate(null), coins: 10, totalCoins: 50, tree: { 'value-1': 3 } }, s);
    const raw = JSON.parse(s.getItem(SAVE_KEY)!);
    raw.coins = 9e15;
    s.setItem(SAVE_KEY, JSON.stringify(raw));
    s.removeItem(SAVE_KEY + ':backup');
    const d = loadSave(s);
    expect(d.tree['value-1']).toBe(3);
    expect(d.coins).toBeLessThanOrEqual(50 * 1.001 + 1000);
    expect(findSaves(s).length).toBeGreaterThan(0);
  });
  it('une sauvegarde normale se recharge sans souci, et une ancienne est acceptée puis signée', () => {
    const s = mem();
    writeSave({ ...migrate(null), coins: 123.456, totalCoins: 1e20 }, s);
    expect(loadSave(s).coins).toBe(123.456);
    expect(lastLoadTampered).toBe(false);
    s.setItem(SAVE_KEY, JSON.stringify({ ...migrate(null), coins: 5, totalCoins: 50, savedAt: 1000 }));
    const d = loadSave(s);
    expect(d.coins).toBe(5);
    writeSave(d, s);
    expect(typeof JSON.parse(s.getItem(SAVE_KEY)!).sig).toBe('string');
  });
  it('le repère d’une partie vide ne plafonne pas l’argent d’une vraie partie plus avancée (vieil onglet)', () => {
    const s = mem();
    writeSave(migrate(null), s); // partie vide écrite après le rechargement
    const real = { ...migrate(null), coins: 8e9, totalCoins: 5e10, tree: { 'broom-wide-1': 5, 'value-1': 5 }, rooms: { attic: { unlocked: true, cleaned: true }, gallery: { unlocked: true, cleaned: false } }, savedAt: Date.now() };
    s.setItem(SAVE_KEY, JSON.stringify(real));
    const d = loadSave(s);
    expect(d.coins).toBe(8e9);
    expect(d.tree['value-1']).toBe(5);
  });
  it('restaurer une sauvegarde non signée vérifie son argent', () => {
    const s = mem();
    s.setItem('dust-it-alone:rescue:1', JSON.stringify({ ...migrate(null), coins: 9e15, totalCoins: 100, savedAt: Date.now() }));
    const f = findSaves(s).find((x) => x.key === 'dust-it-alone:rescue:1')!;
    restoreAsWorld(f.key, s);
    expect(loadSave(s).coins).toBeLessThanOrEqual(100);
  });
});

describe('Argent plausible au chargement', () => {
  const play = (o: Partial<ReturnType<typeof migrate>['stats']> = {}, coins = 0, total = 0) => ({ ...migrate(null), coins, totalCoins: total, stats: { ...migrate(null).stats, ...o }, audit: { total: 0, play: 0, offline: 0, bonus: 0 } });
  it('une partie normale n’est jamais touchée', () => {
    const d = play({ bestRate: 2e4, playTime: 36000 }, 3e7, 5e8);
    expect(auditMoney(d).fixed).toBe(false);
    expect(auditMoney(play({}, 100, 5000)).fixed).toBe(false);
  });
  it('plus d’argent en poche que de total gagné : impossible', () => {
    const r = auditMoney(play({ bestRate: 100, playTime: 3600 }, 9e12, 2e5));
    expect(r.fixed).toBe(true);
    expect(r.save.coins).toBeLessThanOrEqual(2e5);
  });
  it('un total gagné absurde pour le temps de jeu est ramené à un niveau possible', () => {
    const r = auditMoney(play({ bestRate: 50, playTime: 600 }, 1e15, 1e15));
    expect(r.fixed).toBe(true);
    expect(r.save.totalCoins).toBeLessThan(1e9);
    expect(r.save.coins).toBeLessThanOrEqual(r.save.totalCoins);
  });
  it('une ancienne partie (d’avant la vérification) n’est pas jugée sur son passé', () => {
    const old = { ...play({ bestRate: 0, playTime: 0 }, 5e10, 9e11), audit: null };
    const r = auditMoney(old);
    expect(r.fixed).toBe(false);
    expect(r.save.audit?.total).toBe(9e11);
    // Mais un gros saut ensuite, oui.
    expect(auditMoney({ ...r.save, totalCoins: 9e15, coins: 9e15 }).fixed).toBe(true);
  });
  it('les gains hors-ligne et les bonus comptent', () => {
    expect(auditMoney(play({ bestRate: 10, playTime: 60, offlineEarned: 4e7, bonusEarned: 1e8 }, 1e8, 2e8)).fixed).toBe(false);
  });
});
