import { describe, expect, it } from 'vitest';
import { DOORS, ROOMS, STAIRS, START } from '../../src/data/rooms';
import { Navigation } from '../../src/world/nav';

function nav(unlocked: string[]) {
  return new Navigation(ROOMS, DOORS, STAIRS, (id) => unlocked.includes(id));
}

describe('le château', () => {
  it('le point de départ est dans les combles, et on peut y marcher', () => {
    const n = nav(['attic']);
    expect(n.canStand(START.x, START.z, 400)).toBe(400);
    expect(n.roomAt(START.x, START.z, 400)?.id).toBe('attic');
  });

  it("l'escalier du donjon descend des combles (400) jusqu'à l'étage (0)", () => {
    const n = nav(['attic']);
    expect(n.canStand(-100, 210, 360)).toBeCloseTo(350, 0);
    expect(n.canStand(-400, 210, 200)).toBeCloseTo(200, 0);
    expect(n.canStand(-790, 210, 10)).toBeCloseTo(5, 0);
  });

  it('la porte de la galerie bloque tant qu’elle est verrouillée', () => {
    const locked = nav(['attic']);
    expect(locked.canStand(-850, 210, 0)).toBeNull();
    expect(locked.lockedDoorNear(-760, 210, 0)?.room).toBe('gallery');
    const open = nav(['attic', 'gallery']);
    expect(open.canStand(-850, 210, 0)).toBe(0);
    expect(open.canStand(-1300, 100, 0)).toBe(0);
  });

  it('on ne traverse pas les murs entre deux pièces', () => {
    const n = nav(['attic', 'gallery', 'library']);
    // Mur nord de la galerie, loin de la porte de la bibliothèque.
    expect(n.canStand(-2700, -150, 0)).toBeNull();
    // Par la porte, ça passe.
    expect(n.canStand(-2130, -150, 0)).toBe(0);
  });

  it("le grand escalier mène au Grand Hall, 4 m plus bas", () => {
    const n = nav(['attic', 'gallery', 'hall']);
    expect(n.canStand(-3600, 175, -200)).toBeCloseTo(-200, 0);
    expect(n.roomAt(-5000, 0, -400)?.id).toBe('hall');
    expect(n.canStand(-5000, 0, -400)).toBe(-400);
  });

  it('les meubles bloquent le passage', () => {
    const n = nav(['attic']);
    const trunk = ROOMS[0].obstacles.find((o) => o.kind === 'trunk')!.rect;
    expect(n.canStand(trunk.x + trunk.w / 2, trunk.y + trunk.h / 2, 400)).toBeNull();
  });

  it('les pièces ne se chevauchent pas', () => {
    for (const a of ROOMS) for (const b of ROOMS) {
      if (a === b) continue;
      const overlap = a.origin.x < b.origin.x + b.width && b.origin.x < a.origin.x + a.width && a.origin.z < b.origin.z + b.height && b.origin.z < a.origin.z + a.height;
      expect(overlap, `${a.id} / ${b.id}`).toBe(false);
    }
  });
});
