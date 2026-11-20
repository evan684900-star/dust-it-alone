import { describe, expect, it } from 'vitest';
import { RoomSim, newBroomState } from '../../src/sim/roomSim';
import { ROOMS } from '../../src/data/rooms';
import { applySnapshot, encodeSnapshot, newMemory } from '../../src/net/snapshot';
import { normalizeCode, randomCode } from '../../src/net/session';

describe('Multijoueur : photos de la poussière', () => {
  it('une photo complète recopie la pièce de l’hôte chez l’invité', () => {
    const host = new RoomSim(ROOMS[0], 1);
    host.fill(0.6);
    const guest = new RoomSim(ROOMS[0], 2);
    guest.fill(1);
    const mem = newMemory(host.pool.cap);
    expect(applySnapshot(guest, encodeSnapshot(host, true, mem))).toBe(true);
    expect(guest.pool.aliveCount).toEqual(host.pool.aliveCount);
    for (let i = 0; i < host.pool.cap; i++) {
      expect(guest.pool.alive[i]).toBe(host.pool.alive[i]);
      if (host.pool.alive[i]) expect(Math.abs(guest.pool.x[i] - host.pool.x[i])).toBeLessThanOrEqual(0.5);
    }
  });

  it('ensuite, seuls les grains qui bougent sont envoyés (petites photos)', () => {
    const host = new RoomSim({ ...ROOMS[0], respawn: {} }, 3);
    host.fill(1);
    const mem = newMemory(host.pool.cap);
    const full = encodeSnapshot(host, true, mem);
    const idle = encodeSnapshot(host, false, mem);
    expect(idle.byteLength).toBeLessThan(full.byteLength / 10);
    // Un grain poussé : il apparaît dans la photo suivante, et l'invité le voit bouger.
    const guest = new RoomSim(ROOMS[0], 4);
    applySnapshot(guest, full);
    const i = host.pool.alive.indexOf(1);
    host.pool.x[i] += 50;
    applySnapshot(guest, encodeSnapshot(host, false, mem));
    expect(Math.round(guest.pool.x[i])).toBe(Math.round(host.pool.x[i]));
    // Un grain ramassé chez l'hôte disparaît chez l'invité.
    host.pool.kill(i);
    applySnapshot(guest, encodeSnapshot(host, false, mem));
    expect(guest.pool.alive[i]).toBe(0);
    expect(guest.pool.aliveCount).toEqual(host.pool.aliveCount);
  });

  it('refuse une photo d’une autre pièce', () => {
    const a = new RoomSim(ROOMS[0], 5);
    const b = new RoomSim(ROOMS[3], 6);
    expect(applySnapshot(b, encodeSnapshot(a, true, newMemory(a.pool.cap)))).toBe(false);
  });
});

describe('Multijoueur : à qui reviennent les grains', () => {
  it('un grain poussé dans la pelle par un invité lui est attribué', () => {
    const room = { ...ROOMS[0], respawn: {} };
    const sim = new RoomSim(room, 7);
    const pan = room.collectors[0];
    const i = sim.pool.spawn('dust', pan.mouth.x + 140, pan.mouth.y);
    const st = newBroomState();
    // L'invité (joueur 2) balaie vers la pelle de gauche (regard vers −x : yaw = +π/2).
    for (let k = 0; k < 60; k++) {
      sim.applyRemote(1 / 60, { active: true, pressed: true, x: pan.mouth.x + 200 - k * 4, y: pan.mouth.y, yaw: Math.PI / 2, tool: 'broom' }, st, 2, { width: 74, depth: 22, grip: 0.85 });
      sim.step(1 / 60, { active: false, x: 0, y: 0, pressed: false });
    }
    const ev = sim.drainEvents();
    expect(sim.pool.alive[i]).toBe(0);
    expect(ev.some((e) => e.owner === 2)).toBe(true);
  });

  it('les grains que je ramasse moi-même restent à moi', () => {
    const sim = new RoomSim({ ...ROOMS[0], respawn: {} }, 8);
    for (let k = 0; k < 5; k++) sim.pool.spawn('dust', 800 + k * 4, 450);
    sim.step(1 / 60, { active: true, x: 800, y: 450, pressed: true, yaw: 0, tool: 'handpan' });
    const ev = sim.drainEvents();
    expect(ev.length).toBe(5);
    expect(ev.every((e) => !e.owner)).toBe(true);
  });
});

describe('Multijoueur : codes de partie', () => {
  it('des codes lisibles, et on tolère les fautes de frappe courantes', () => {
    const c = randomCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(normalizeCode(' ab-cd e ')).toBe('ABCDE');
  });
});
