import { describe, expect, it } from 'vitest';
import { loadSave, migrate, SAVE_KEY, writeSave } from '../../src/save/save';

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
