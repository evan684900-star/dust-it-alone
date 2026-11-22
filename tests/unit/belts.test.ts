import { describe, expect, it } from 'vitest';
import { RoomSim } from '../../src/sim/roomSim';
import { ROOMS } from '../../src/data/rooms';
import { computeModifiers } from '../../src/economy/modifiers';
import { migrate } from '../../src/save/save';

const idle = { active: false, x: 0, y: 0, pressed: false };

describe('tapis roulants et clochette', () => {
  it('un tapis emporte la poussière posée dessus, dans son sens', () => {
    const sim = new RoomSim({ ...ROOMS[0], respawn: {} }, 4);
    // Lacet −π/2 : le tapis avance vers +x.
    sim.setBelts([{ x: 1200, y: 700, yaw: -Math.PI / 2 }], 1);
    const on = sim.pool.spawn('dust', 1100, 700);
    const off = sim.pool.spawn('dust', 1200, 950);
    for (let k = 0; k < 30; k++) sim.step(1 / 60, idle);
    expect(sim.pool.x[on]).toBeGreaterThan(1150);
    expect(sim.pool.x[off]).toBe(1200);
    expect(sim.beltAt(1200, 700)).toBe(0);
    expect(sim.beltAt(1200, 950)).toBe(-1);
  });

  it('les nœuds donnent les tapis et la clochette', () => {
    const m = computeModifiers({ conveyor: 3, 'conveyor-speed': 1, 'helper-bell': 1, 'bell-long': 2, 'bell-cool': 1 }, 0);
    expect(m.belts.count).toBe(3);
    expect(m.belts.speed).toBeCloseTo(1.3);
    expect(m.bell).toEqual({ has: true, duration: 50, cooldown: 153 });
    expect(computeModifiers({}, 0).bell.has).toBe(false);
  });

  it('les tapis posés sont gardés dans la sauvegarde (et nettoyés)', () => {
    const s = migrate({ belts: [{ room: 'attic', x: 10, y: 20, yaw: 1 }, { room: 3 }, null], bellReadyAt: 5 });
    expect(s.belts).toEqual([{ room: 'attic', x: 10, y: 20, yaw: 1 }]);
    expect(s.bellReadyAt).toBe(5);
  });
});
