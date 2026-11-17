import * as THREE from 'three';
import { formatNumber } from '../core/format';

interface Floater { el: HTMLDivElement; pos: THREE.Vector3; life: number; active: boolean }

/**
 * Les « +12 » qui s'envolent : de vrais éléments HTML (police cartoon nette),
 * placés à l'écran en projetant leur position 3D.
 */
export class Floaters {
  private layer: HTMLDivElement;
  private pool: Floater[] = [];
  private v = new THREE.Vector3();

  constructor(private camera: THREE.Camera) {
    this.layer = document.createElement('div');
    this.layer.className = 'floaters';
    document.body.appendChild(this.layer);
  }

  spawn(x: number, y: number, z: number, amount: number): void {
    let f = this.pool.find((p) => !p.active);
    if (!f) {
      const el = document.createElement('div');
      el.className = 'floater';
      this.layer.appendChild(el);
      f = { el, pos: new THREE.Vector3(), life: 0, active: false };
      this.pool.push(f);
    }
    f.el.textContent = '+' + formatNumber(amount);
    f.el.classList.toggle('big', amount >= 100);
    f.el.style.setProperty('--tilt', `${(Math.random() - 0.5) * 20}deg`);
    f.pos.set(x, y, z);
    f.life = 0;
    f.active = true;
    f.el.style.display = 'block';
  }

  update(dt: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const f of this.pool) {
      if (!f.active) continue;
      f.life += dt;
      f.pos.y += 90 * dt * Math.max(0, 1 - f.life);
      if (f.life > 1.1) {
        f.active = false;
        f.el.style.display = 'none';
        continue;
      }
      this.v.copy(f.pos).project(this.camera);
      if (this.v.z > 1) {
        f.el.style.display = 'none';
        continue;
      }
      f.el.style.display = 'block';
      const sx = (this.v.x * 0.5 + 0.5) * w;
      const sy = (-this.v.y * 0.5 + 0.5) * h;
      const pop = f.life < 0.15 ? 0.4 + (f.life / 0.15) * 0.8 : f.life < 0.25 ? 1.2 - ((f.life - 0.15) / 0.1) * 0.2 : 1;
      const alpha = f.life > 0.7 ? Math.max(0, 1 - (f.life - 0.7) / 0.4) : 1;
      f.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) rotate(var(--tilt)) scale(${pop})`;
      f.el.style.opacity = String(alpha);
    }
  }
}
