import { describe, expect, it } from 'vitest';
import { DOORS, ROOMS, STAIRS, START, roomById } from '../../src/data/rooms';
import { Navigation } from '../../src/world/nav';

function nav(unlocked: string[]) {
  return new Navigation(ROOMS, DOORS, STAIRS, (id) => unlocked.includes(id));
}
const door = (id: string) => DOORS.find((d) => d.id === id)!;
const stair = (id: string) => STAIRS.find((s) => s.id === id)!;
const mid = (d: { from: number; to: number }) => (d.from + d.to) / 2;

describe('le château', () => {
  it('le point de départ est dans les combles, et on peut y marcher', () => {
    const n = nav(['attic']);
    expect(n.canStand(START.x, START.z, 400)).toBe(400);
    expect(n.roomAt(START.x, START.z, 400)?.id).toBe('attic');
  });

  it("l'escalier du donjon descend des combles (400) jusqu'à l'étage (0)", () => {
    const n = nav(['attic']);
    const s = stair('keep-stair');
    const z = s.rect.y + s.rect.h / 2;
    const at = (t: number) => s.rect.x + s.rect.w * t;
    expect(n.canStand(at(0.75), z, 300)).toBeCloseTo(300, 0);
    expect(n.canStand(at(0.5), z, 200)).toBeCloseTo(200, 0);
    expect(n.canStand(at(0.25), z, 100)).toBeCloseTo(100, 0);
  });

  it('la porte de la galerie bloque tant qu’elle est verrouillée', () => {
    const d = door('gallery-east');
    const inside = d.at - 50;
    const locked = nav(['attic']);
    expect(locked.canStand(inside, mid(d), 0)).toBeNull();
    expect(locked.lockedDoorNear(d.at + 90, mid(d), 0)?.room).toBe('gallery');
    const open = nav(['attic', 'gallery']);
    expect(open.canStand(inside, mid(d), 0)).toBe(0);
  });

  it('on ne traverse pas les murs entre deux pièces', () => {
    const n = nav(['attic', 'gallery', 'library']);
    const d = door('library');
    const g = roomById('gallery')!;
    // Mur nord de la galerie, loin de la porte de la bibliothèque.
    expect(n.canStand(g.origin.x + 300, d.at, 0)).toBeNull();
    // Par la porte, ça passe.
    expect(n.canStand(mid(d), d.at, 0)).toBe(0);
  });

  it("le grand escalier mène au Grand Hall, 4 m plus bas", () => {
    const n = nav(['attic', 'gallery', 'hall']);
    const s = stair('grand-stair');
    const z = s.rect.y + s.rect.h / 2;
    expect(n.canStand(s.rect.x + s.rect.w / 2, z, -200)).toBeCloseTo(-200, 0);
    const h = roomById('hall')!;
    const cx = h.origin.x + 200;
    const cz = h.origin.z + h.height / 2 + 300;
    expect(n.roomAt(cx, cz, -400)?.id).toBe('hall');
    expect(n.canStand(cx, cz, -400)).toBe(-400);
  });

  it('les meubles bloquent le passage', () => {
    const n = nav(['attic']);
    const attic = ROOMS[0];
    const trunk = attic.obstacles.find((o) => o.kind === 'trunk')!.rect;
    expect(n.canStand(attic.origin.x + trunk.x + trunk.w / 2, attic.origin.z + trunk.y + trunk.h / 2, 400)).toBeNull();
  });

  it('les pièces ne se chevauchent pas', () => {
    for (const a of ROOMS) for (const b of ROOMS) {
      if (a === b) continue;
      const overlap = a.origin.x < b.origin.x + b.width && b.origin.x < a.origin.x + a.width && a.origin.z < b.origin.z + b.height && b.origin.z < a.origin.z + a.height;
      expect(overlap, `${a.id} / ${b.id}`).toBe(false);
    }
  });

  it('chaque porte s’ouvre bien dans le mur des pièces qu’elle relie', () => {
    for (const d of DOORS) {
      const onWall = ROOMS.some((r) => {
        if (Math.abs(r.floorY - d.floorY) > 1) return false;
        if (d.axis === 'x') return (d.at === r.origin.x || d.at === r.origin.x + r.width) && d.from >= r.origin.z && d.to <= r.origin.z + r.height;
        return (d.at === r.origin.z || d.at === r.origin.z + r.height) && d.from >= r.origin.x && d.to <= r.origin.x + r.width;
      });
      expect(onWall, d.id).toBe(true);
    }
  });

  it('les meubles et les pelles restent dans leur pièce', () => {
    for (const r of ROOMS) {
      for (const o of [...r.obstacles.map((x) => x.rect), ...r.collectors.map((c) => c.rect)]) {
        expect(o.x, r.id).toBeGreaterThanOrEqual(0);
        expect(o.y, r.id).toBeGreaterThanOrEqual(0);
        expect(o.x + o.w, r.id).toBeLessThanOrEqual(r.width + 0.01);
        expect(o.y + o.h, r.id).toBeLessThanOrEqual(r.height + 0.01);
      }
    }
  });
});
