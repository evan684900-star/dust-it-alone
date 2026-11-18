import { describe, expect, it } from 'vitest';
import { RoomSim } from '../../src/sim/roomSim';
import { ROOMS } from '../../src/data/rooms';
import { EventDirector, FIRST_EVENT } from '../../src/story/events';
import { computeModifiers } from '../../src/economy/modifiers';

const idle = { active: false, x: 0, y: 0, pressed: false };

function setup(starRain = false) {
  const def = { ...ROOMS[0], respawn: {} };
  const sim = new RoomSim(def, 3);
  const earned: number[] = [];
  let bonus: unknown = 'none';
  const player = { x: 0, z: 0, y: def.floorY };
  const ev = new EventDirector({
    rooms: [{ def, sim }],
    currentRoom: () => 0,
    player,
    income: () => 10,
    starRain: () => starRain,
    earn: (v) => earned.push(v),
    world: { setBonus: (b) => (bonus = b) },
    sound: { wind() {}, crash() {}, coin() {}, sparkle() {} },
    random: () => 0.5,
  });
  return { def, sim, ev, earned, player, bonus: () => bonus };
}

describe('Événements aléatoires', () => {
  it('le courant d’air déplace la poussière libre', () => {
    const { sim } = setup();
    const i = sim.pool.spawn('dust', 600, 600);
    sim.gust(0, 3);
    for (let t = 0; t < 120; t++) sim.step(1 / 60, idle);
    expect(sim.pool.x[i]).toBeGreaterThan(620);
    expect(sim.windActive).toBe(true);
  });

  it('le chat renverse un pot : de la saleté apparaît', () => {
    const { sim, ev } = setup();
    const before = sim.pool.aliveCount.dust;
    ev.trigger('cat', 0);
    expect(sim.pool.aliveCount.dust).toBeGreaterThan(before + 10);
  });

  it('la pièce brillante se ramasse et rapporte une minute de gains', () => {
    const { def, ev, earned, player, bonus } = setup();
    ev.trigger('coin', 0);
    const b = bonus() as { x: number; y: number };
    expect(ev.coinActive).toBe(true);
    player.x = def.origin.x + b.x;
    player.z = def.origin.z + b.y;
    ev.update(0.1);
    expect(earned).toEqual([600]);
    expect(ev.coinActive).toBe(false);
    expect(bonus()).toBeNull();
  });

  it('la pièce brillante finit par disparaître', () => {
    const { ev } = setup();
    ev.trigger('coin', 0);
    for (let t = 0; t < 50; t++) ev.update(1);
    expect(ev.coinActive).toBe(false);
  });

  it('pluie d’étoiles seulement si débloquée dans l’arbre', () => {
    expect(setup(false).ev.available()).not.toContain('starRain');
    expect(setup(true).ev.available()).toContain('starRain');
    const { sim, ev } = setup(true);
    ev.trigger('starRain', 0);
    expect(sim.pool.aliveCount.star).toBeGreaterThan(10);
    expect(computeModifiers({ 'star-rain': 1 }, 0).events.starRain).toBe(true);
  });

  it('un événement arrive au bout de quelques minutes', () => {
    const { sim, ev } = setup();
    const before = sim.pool.aliveCount.dust + sim.pool.aliveCount.star;
    for (let t = 0; t < FIRST_EVENT + 2; t++) ev.update(1);
    // L'un des événements a eu lieu (vent, chat, pièce ou étoiles).
    expect(sim.windActive || ev.coinActive || sim.pool.aliveCount.dust + sim.pool.aliveCount.star > before).toBe(true);
  });

  it('pas léger : les pieds écartent la poussière', () => {
    const { sim } = setup();
    const i = sim.pool.spawn('dust', 610, 600);
    sim.kickFeet(600, 600);
    for (let t = 0; t < 30; t++) sim.step(1 / 60, idle);
    expect(sim.pool.x[i]).toBeGreaterThan(615);
    expect(computeModifiers({ 'plume-feet': 1 }, 0).player.feet).toBe(true);
  });
});
