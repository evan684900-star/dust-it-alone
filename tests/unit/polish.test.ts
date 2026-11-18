import { describe, expect, it } from 'vitest';
import { TipDirector, TIP_SECONDS } from '../../src/story/tips';
import { ACHIEVEMENTS } from '../../src/data/achievements';
import { defaultSave, exportSave, importSave, migrate } from '../../src/save/save';

describe('Bulles d’aide', () => {
  it('une bulle à la fois, une seule fois, et elle part quand on a compris', () => {
    let shown: string | null = null;
    let ready = false;
    let understood = false;
    const state = { seen: [] as string[], time: 0 };
    const tips = new TipDirector(
      [
        { id: 'a', icon: '1', text: 'A', when: () => ready, done: () => understood },
        { id: 'b', icon: '2', text: 'B', when: () => true },
      ],
      state,
      (t) => (shown = t?.id ?? null),
    );
    for (let i = 0; i < 10; i++) tips.update(1);
    // « b » passe en premier puisque « a » n'est pas prête.
    expect(shown).toBe('b');
    for (let i = 0; i < TIP_SECONDS + 1; i++) tips.update(1);
    expect(shown).toBeNull();
    ready = true;
    for (let i = 0; i < 10; i++) tips.update(1);
    expect(shown).toBe('a');
    understood = true;
    tips.update(0.1);
    expect(shown).toBeNull();
    expect(state.seen).toEqual(['b', 'a']);
  });

  it('une bulle déjà comprise n’est jamais montrée', () => {
    let shown: string | null = null;
    const state = { seen: [] as string[], time: 0 };
    const tips = new TipDirector([{ id: 'a', icon: '', text: '', when: () => true, done: () => true }], state, (t) => (shown = t?.id ?? null));
    for (let i = 0; i < 20; i++) tips.update(1);
    expect(shown).toBeNull();
    expect(state.seen).toEqual(['a']);
  });
});

describe('Succès', () => {
  const ctx = (patch: (s: ReturnType<typeof defaultSave>) => void, extra = {}) => {
    const save = defaultSave();
    patch(save);
    return { save, grains: 0, cleanedRooms: 0, unlockedRooms: 1, helpers: 0, ...extra };
  };
  it('ids uniques et progression entre 0 et 1', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const c = ctx(() => {});
    for (const a of ACHIEVEMENTS) {
      const p = a.progress(c);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
  it('se débloquent avec la partie', () => {
    const a = (id: string) => ACHIEVEMENTS.find((x) => x.id === id)!;
    expect(a('first-grain').progress(ctx(() => {}, { grains: 1 }))).toBe(1);
    expect(a('ending').progress(ctx((s) => (s.endingSeen = true)))).toBe(1);
    expect(a('stars').progress(ctx((s) => (s.stats.grains.star = 50)))).toBeCloseTo(0.5);
    expect(a('time-1h').progress(ctx((s) => (s.stats.playTime = 3600)))).toBe(1);
  });
});

describe('Export / import de sauvegarde', () => {
  it('un code exporté se recharge à l’identique', () => {
    const s = defaultSave();
    s.coins = 12345;
    s.souvenirs = ['attic-1'];
    s.settings.fov = 90;
    s.stats.walked = 42;
    s.achievements = ['first-grain'];
    const code = exportSave(s);
    expect(code.startsWith('DUST1:')).toBe(true);
    const back = importSave(code)!;
    expect(back.coins).toBe(12345);
    expect(back.souvenirs).toEqual(['attic-1']);
    expect(back.settings.fov).toBe(90);
    expect(back.stats.walked).toBe(42);
    expect(back.achievements).toEqual(['first-grain']);
    // Le JSON brut marche aussi.
    expect(importSave(JSON.stringify(s))!.coins).toBe(12345);
  });
  it('refuse un texte qui n’est pas une sauvegarde', () => {
    expect(importSave('bonjour')).toBeNull();
    expect(importSave('DUST1:%%%')).toBeNull();
    expect(importSave('{"a":1}')).toBeNull();
  });
  it('des réglages abîmés sont remis dans les clous', () => {
    const s = migrate({ coins: 1, settings: { fov: 500, sensitivity: -3, volume: 'fort', invertY: true } });
    expect(s.settings.fov).toBe(100);
    expect(s.settings.sensitivity).toBe(0.2);
    expect(s.settings.volume).toBe(0.8);
    expect(s.settings.invertY).toBe(true);
    expect(s.stats.playTime).toBe(0);
  });
});
