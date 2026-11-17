import { describe, expect, it } from 'vitest';
import { loadSave, migrate, SAVE_KEY, writeSave } from '../../src/save/save';

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('sauvegarde', () => {
  it('écrit puis relit les données', () => {
    const s = memoryStore();
    writeSave({ ...migrate(null), coins: 123, totalCoins: 456, roomCleanedOnce: true }, s);
    const loaded = loadSave(s);
    expect(loaded.coins).toBe(123);
    expect(loaded.totalCoins).toBe(456);
    expect(loaded.roomCleanedOnce).toBe(true);
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
    expect(d.roomCleanedOnce).toBe(false);
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
