import { describe, expect, it } from 'vitest';
import { RoomSim } from '../../src/sim/roomSim';
import { ROOMS } from '../../src/data/rooms';

const idle = { active: false, x: 0, y: 0, pressed: false };

describe('RoomSim', () => {
  it('remplit la pièce selon les capacités', () => {
    const sim = new RoomSim(ROOMS[0], 1);
    sim.fill(1);
    expect(sim.pool.aliveCount.dust).toBe(ROOMS[0].capacity.dust);
    expect(sim.cleanliness).toBeLessThan(0.05);
  });

  it('ramasse une particule poussée dans la pelle et rapporte des pièces', () => {
    const sim = new RoomSim({ ...ROOMS[0], respawn: {} }, 2);
    const pan = ROOMS[0].collectors[0];
    const i = sim.pool.spawn('dust', pan.mouth.x + 150, pan.mouth.y);
    sim.pool.vx[i] = -900;
    let coins = 0;
    for (let t = 0; t < 120; t++) {
      sim.step(1 / 60, idle);
      coins += sim.drainEvents().reduce((s, e) => s + e.coins, 0);
    }
    expect(sim.pool.alive[i]).toBe(0);
    expect(coins).toBeGreaterThanOrEqual(1);
  });

  // Lacet pour que l'avant de la brosse regarde vers +x (direction (-sin, -cos) = (1, 0)).
  const FACE_PLUS_X = -Math.PI / 2;

  it('la brosse pousse de face la poussière qu’elle rencontre', () => {
    const sim = new RoomSim({ ...ROOMS[0], respawn: {} }, 3);
    const i = sim.pool.spawn('dust', 800, 450);
    for (let k = 0; k < 20; k++) sim.step(1 / 60, { active: true, x: 700 + k * 15, y: 450, pressed: true, yaw: FACE_PLUS_X });
    expect(sim.pool.x[i]).toBeGreaterThan(900);
  });

  it('la hitbox est un rectangle : un grain sur le côté de la brosse n’est pas touché', () => {
    const sim = new RoomSim({ ...ROOMS[0], respawn: {} }, 6);
    // La brosse fait 74 cm de large (le long de y ici) : un grain à 60 cm du centre est hors de la brosse…
    const outside = sim.pool.spawn('dust', 800, 450 + 60);
    // … alors qu'un cercle de 58 cm de rayon l'aurait balayé à l'ancienne.
    const inside = sim.pool.spawn('dust', 800, 450 + 25);
    for (let k = 0; k < 20; k++) sim.step(1 / 60, { active: true, x: 700 + k * 15, y: 450, pressed: true, yaw: FACE_PLUS_X });
    expect(sim.pool.x[outside]).toBe(800);
    expect(sim.pool.x[inside]).toBeGreaterThan(900);
  });

  it('balayer de côté (le long des poils) entraîne beaucoup moins que de face', () => {
    const run = (yaw: number) => {
      const sim = new RoomSim({ ...ROOMS[0], respawn: {} }, 7);
      const i = sim.pool.spawn('dust', 800, 450);
      for (let k = 0; k < 20; k++) sim.step(1 / 60, { active: true, x: 700 + k * 15, y: 450, pressed: true, yaw });
      return sim.pool.x[i] - 800;
    };
    const facing = run(FACE_PLUS_X);
    const sideways = run(0); // brosse tournée de 90° : elle glisse sur le grain
    expect(sideways).toBeLessThan(facing * 0.5);
  });

  it('sans clic, la brosse est levée : elle ne balaie rien', () => {
    const sim = new RoomSim({ ...ROOMS[0], respawn: {} }, 9);
    const i = sim.pool.spawn('dust', 800, 450);
    for (let k = 0; k < 20; k++) sim.step(1 / 60, { active: true, x: 700 + k * 15, y: 450, pressed: false, yaw: FACE_PLUS_X });
    expect(sim.pool.x[i]).toBe(800);
  });

  it('tourner la tête balaie : la rotation pousse les grains au bout de la brosse', () => {
    const sim = new RoomSim({ ...ROOMS[0], respawn: {} }, 8);
    // Grain au bout de la brosse (côté +y), brosse immobile qui pivote sur elle-même.
    const i = sim.pool.spawn('dust', 800, 450 + 30);
    for (let k = 0; k < 15; k++) sim.step(1 / 60, { active: true, x: 800, y: 450, pressed: true, yaw: FACE_PLUS_X + k * 0.06 });
    const moved = Math.hypot(sim.pool.x[i] - 800, sim.pool.y[i] - 480);
    expect(moved).toBeGreaterThan(15);
  });

  it('la saleté réapparaît avec le temps', () => {
    const sim = new RoomSim(ROOMS[0], 4);
    for (let t = 0; t < 60 * 5; t++) sim.step(1 / 60, idle);
    expect(sim.pool.aliveCount.dust).toBeGreaterThan(50);
  });
});

describe('obstacles', () => {
  it('la poussière rebondit sur les meubles', () => {
    const room = { ...ROOMS[0], respawn: {} };
    const sim = new RoomSim(room, 5);
    const box = room.obstacles[0].rect;
    const i = sim.pool.spawn('dust', box.x + box.w + 60, box.y + box.h / 2);
    sim.pool.vx[i] = -1200;
    for (let t = 0; t < 120; t++) sim.step(1 / 60, idle);
    const x = sim.pool.x[i];
    const y = sim.pool.y[i];
    const insideBox = x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h;
    expect(insideBox).toBe(false);
  });
});

describe('reprise de partie', () => {
  it('une pièce nettoyée revient avec exactement la même quantité de poussière', () => {
    const sim = new RoomSim(ROOMS[0], 11);
    sim.fill(1);
    // On « nettoie » presque tout.
    let n = 0;
    for (let i = 0; i < sim.pool.cap && n < sim.pool.cap - 50; i++) if (sim.pool.alive[i] && sim.pool.typeOf(i) !== 'star') { sim.pool.kill(i); n++; }
    const saved = sim.dirtCounts();
    const reloaded = new RoomSim(ROOMS[0], 12);
    reloaded.fillCounts(saved);
    expect(reloaded.dirtCounts()).toEqual(saved);
    expect(reloaded.cleanliness).toBeCloseTo(sim.cleanliness, 5);
  });
});

describe('outils', () => {
  const room = { ...ROOMS[0], respawn: {}, capacity: { ...ROOMS[0].capacity, web: 4, stain: 4, leaf: 4 } };
  const at = { active: true, x: 800, y: 450, pressed: true, yaw: 0 };

  it('le balai ne pousse pas une toile d’araignée', () => {
    const sim = new RoomSim(room, 21);
    const i = sim.pool.spawn('web', 800, 450);
    for (let k = 0; k < 20; k++) sim.step(1 / 60, { ...at, x: 700 + k * 15, yaw: -Math.PI / 2 });
    expect(sim.pool.alive[i]).toBe(1);
    expect(sim.pool.x[i]).toBe(800);
  });

  it('le plumeau retire une toile en restant dessus, et elle rapporte sur place', () => {
    const sim = new RoomSim(room, 22);
    const i = sim.pool.spawn('web', 800, 450);
    let coins = 0;
    for (let k = 0; k < 120 && sim.pool.alive[i]; k++) {
      sim.step(1 / 60, { ...at, tool: 'duster' });
      coins += sim.drainEvents().reduce((s, e) => s + e.coins, 0);
    }
    expect(sim.pool.alive[i]).toBe(0);
    expect(coins).toBeGreaterThan(0);
  });

  it("l'éponge ne nettoie une tache qu'en frottant", () => {
    const still = new RoomSim(room, 23);
    const a = still.pool.spawn('stain', 800, 450);
    for (let k = 0; k < 200; k++) still.step(1 / 60, { ...at, tool: 'sponge' });
    expect(still.pool.alive[a]).toBe(1);
    const scrub = new RoomSim(room, 24);
    const b = scrub.pool.spawn('stain', 800, 450);
    for (let k = 0; k < 200 && scrub.pool.alive[b]; k++) scrub.step(1 / 60, { ...at, tool: 'sponge', x: 800 + (k % 2 ? 12 : -12) });
    expect(scrub.pool.alive[b]).toBe(0);
  });

  it("l'aspirateur ramasse jusqu'à ce que son réservoir soit plein", () => {
    const sim = new RoomSim(room, 25);
    sim.mods.vacuumCap = 5;
    for (let k = 0; k < 12; k++) sim.pool.spawn('dust', 800 + (k % 4) * 6, 450 + Math.floor(k / 4) * 6);
    for (let k = 0; k < 120; k++) sim.step(1 / 60, { ...at, tool: 'vacuum' });
    expect(sim.vacuumLoad).toBe(5);
    expect(sim.emptyVacuum()).toBe(5);
    expect(sim.vacuumLoad).toBe(0);
  });

  it('le souffleur pousse les feuilles loin devant', () => {
    const sim = new RoomSim(room, 26);
    // Regard vers +x (yaw = −π/2) : la feuille est devant.
    const i = sim.pool.spawn('leaf', 900, 450);
    for (let k = 0; k < 30; k++) sim.step(1 / 60, { ...at, tool: 'blower', x: 820, yaw: -Math.PI / 2 });
    expect(sim.pool.x[i]).toBeGreaterThan(1000);
  });
});
