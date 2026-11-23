import { describe, expect, it } from 'vitest';
import { CineCam, shotView } from '../../src/render/cinecam';

describe('caméra de cinéma', () => {
  const shot = { cx: 0, cz: 0, lookY: 100, radius: 300, eye: 200, angle: 0, spin: 0.1 };
  it('regarde toujours le centre de la scène', () => {
    for (const t of [0, 3, 10]) {
      const v = shotView(shot, t);
      // L'avant (−sin, −cos) pointe vers le centre.
      const fx = -Math.sin(v.yaw);
      const fz = -Math.cos(v.yaw);
      expect(fx * (0 - v.x) + fz * (0 - v.z)).toBeCloseTo(Math.hypot(v.x, v.z), 3);
      expect(v.pitch).toBeLessThan(0);
    }
  });
  it('part de la vue du joueur et y revient en douceur', () => {
    const cam = new CineCam();
    const player = { x: 1000, z: 1000, eye: 170, yaw: 1, pitch: 0 };
    cam.start(player, shot);
    const first = cam.update(0.001, player);
    expect(first.x).toBeCloseTo(1000, 0);
    let v = first;
    for (let k = 0; k < 300; k++) v = cam.update(1 / 60, player);
    expect(Math.hypot(v.x, v.z)).toBeLessThan(310);
    cam.finish(1);
    for (let k = 0; k < 70; k++) v = cam.update(1 / 60, player);
    expect(cam.active).toBe(false);
    expect(v).toEqual(player);
  });
});
