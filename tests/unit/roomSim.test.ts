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

  it('le balai pousse la poussière dans sa direction', () => {
    const sim = new RoomSim({ ...ROOMS[0], respawn: {} }, 3);
    const i = sim.pool.spawn('dust', 800, 450);
    // Le balai traverse la particule de gauche à droite.
    for (let k = 0; k < 20; k++) sim.step(1 / 60, { active: true, x: 700 + k * 15, y: 450, pressed: false });
    expect(sim.pool.x[i]).toBeGreaterThan(820);
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
