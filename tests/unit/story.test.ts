import { describe, expect, it } from 'vitest';
import { ALL_SOUVENIRS, ENDING, INTRO, ROOM_STORY, SPEAKERS, THRONE_SOUVENIRS } from '../../src/data/story';
import { ROOMS } from '../../src/data/rooms';
import { RoomSim, grow, inside } from '../../src/sim/roomSim';
import { StoryDirector } from '../../src/story/director';
import { migrate } from '../../src/save/save';

describe("l'histoire", () => {
  it('chaque pièce du château a son message, ses 3 souvenirs et son écho', () => {
    for (const r of ROOMS) {
      const s = ROOM_STORY[r.id];
      expect(s, r.id).toBeDefined();
      expect(s.dustMessage.length, r.id).toBeGreaterThan(3);
      expect(s.souvenirs, r.id).toHaveLength(3);
      expect(s.echo.lines.length, r.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('les souvenirs ont des identifiants uniques', () => {
    const ids = ALL_SOUVENIRS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(42);
  });

  it('toutes les répliques sont dites par un personnage qui existe', () => {
    const lines = [...INTRO, ...ENDING.lines, ...Object.values(ROOM_STORY).flatMap((s) => [...s.enter, ...s.echo.lines])];
    for (const [who] of lines) expect(SPEAKERS[who], who).toBeDefined();
  });

  it('la Salle du trône demande des souvenirs, mais pas tous', () => {
    expect(THRONE_SOUVENIRS).toBeGreaterThan(20);
    expect(THRONE_SOUVENIRS).toBeLessThan(39);
  });

  it('chaque souvenir est caché dans sa pièce, pas sous un meuble ni dans une pelle', () => {
    const save = migrate(null);
    const rooms = ROOMS.map((def) => ({ def, sim: new RoomSim(def, 1) }));
    const d = new StoryDirector({
      save, rooms, isUnlocked: () => true, player: { x: 0, z: 0, y: 0 },
      world: { setDustMessage() {}, setSouvenirs() {}, collectSouvenir() {} }, onSouvenir() {}, persist() {}, playEcho() {}, canPlayCinematic: () => true,
    });
    const spots = (d as unknown as { positions: Map<string, { x: number; y: number }> }).positions;
    for (const s of ALL_SOUVENIRS) {
      const p = spots.get(s.id)!;
      const def = ROOMS.find((r) => r.id === s.room)!;
      expect(p.x, s.id).toBeGreaterThan(0);
      expect(p.x, s.id).toBeLessThan(def.width);
      expect(p.y, s.id).toBeLessThan(def.height);
      expect(def.obstacles.some((o) => inside(grow(o.rect, 40), p.x, p.y)), s.id).toBe(false);
    }
  });

  it('un écho ne se joue pas dans le dos du joueur : il attend qu’on entre dans la pièce', () => {
    const save = migrate(null);
    const rooms = ROOMS.map((def) => ({ def, sim: new RoomSim(def, 1) }));
    const played: number[] = [];
    const d = new StoryDirector({
      save, rooms, isUnlocked: () => true, player: { x: 0, z: 0, y: 0 },
      world: { setDustMessage() {}, setSouvenirs() {}, collectSouvenir() {} }, onSouvenir() {}, persist() {}, playEcho: (ri) => played.push(ri), canPlayCinematic: () => true,
    });
    const gi = rooms.findIndex((r) => r.def.id === 'gallery');
    d.onRoomClean(gi, false);
    expect(played).toEqual([]);
    expect(save.echoes).not.toContain('gallery');
    d.update(0.1, rooms[0].def);
    expect(played).toEqual([]);
    d.update(0.1, rooms[gi].def);
    expect(played).toEqual([gi]);
    expect(save.echoes).toContain('gallery');
    d.update(0.1, rooms[gi].def);
    expect(played).toEqual([gi]);
  });

  it('la sauvegarde garde les souvenirs, les échos et la fin', () => {
    const d = migrate({ souvenirs: ['attic-1', 'attic-1', 'gallery-2', 3], echoes: ['attic'], endingSeen: true });
    expect(d.souvenirs).toEqual(['attic-1', 'gallery-2']);
    expect(d.echoes).toEqual(['attic']);
    expect(d.endingSeen).toBe(true);
  });
});
