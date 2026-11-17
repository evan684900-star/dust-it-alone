import * as THREE from 'three';
import type { Collector, Prop } from '../data/rooms';
import { PAL } from './palette';
import { fabric, mat, metal, plastic, solid } from './materials';
import { roundedBox } from './geometry';

/** Un meuble du grenier. Coordonnées du sol : x, y de la simulation → x, z en 3D. */
export function buildProp(p: Prop): THREE.Object3D {
  const { x, y, w, h } = p.rect;
  const g = new THREE.Group();
  switch (p.kind) {
    case 'boxes': {
      const sizes: [number, number, number, number, number, number][] = [
        [w * 0.55, 80, h * 0.6, -w * 0.2, 40, -h * 0.15],
        [w * 0.45, 70, h * 0.55, w * 0.25, 35, h * 0.18],
        [w * 0.42, 60, h * 0.48, -w * 0.15, 110, -h * 0.1],
      ];
      const kraft = [0xc8914c, 0xb98445, 0xd39f5c];
      sizes.forEach(([bw, bh, bd, ox, oy, oz], k) => {
        const box = new THREE.Group();
        box.add(solid(roundedBox(bw, bh, bd, 3), mat(kraft[k], { roughness: 0.92 })));
        const tape = solid(roundedBox(18, 3, bd + 1.5, 1), mat(0xe8d4a8, { roughness: 0.35 }));
        tape.position.y = bh / 2;
        box.add(tape);
        box.position.set(ox, oy, oz);
        box.rotation.y = (k - 1) * 0.18;
        g.add(box);
      });
      break;
    }
    case 'trunk': {
      const body = solid(roundedBox(w, 70, h, 6), mat(0x7a3328, { roughness: 0.55 }));
      body.position.y = 35;
      const lidGeo = new THREE.CylinderGeometry(h / 2, h / 2, w, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2);
      const lid = solid(lidGeo, mat(0x8f3d2f, { roughness: 0.5 }));
      lid.position.y = 70;
      g.add(body, lid);
      for (const sx of [-w * 0.3, w * 0.3]) {
        const strap = solid(roundedBox(14, 74, h + 4, 3), metal(0xc9a24a));
        strap.position.set(sx, 37, 0);
        g.add(strap);
      }
      const lock = solid(roundedBox(22, 26, 8, 3), metal(0xd8b25a, 0.25));
      lock.position.set(0, 62, h / 2 + 3);
      g.add(lock);
      break;
    }
    case 'armchair': {
      const cloth = fabric(0x2f9c84);
      const seat = solid(roundedBox(w * 0.8, 40, h * 0.75, 12), cloth);
      seat.position.set(0, 40, h * 0.05);
      const back = solid(roundedBox(w * 0.8, 100, 30, 12), cloth);
      back.position.set(0, 90, -h * 0.38);
      g.add(seat, back);
      for (const sx of [-1, 1]) {
        const arm = solid(roundedBox(26, 60, h * 0.8, 10), fabric(0x25806b));
        arm.position.set(sx * w * 0.42, 55, 0);
        g.add(arm);
        for (const sz of [-1, 1]) {
          const leg = solid(new THREE.CylinderGeometry(4, 3, 22, 8), mat(0x5a3220, { roughness: 0.5 }));
          leg.position.set(sx * w * 0.38, 11, sz * h * 0.32);
          g.add(leg);
        }
      }
      // Drap blanc à moitié tombé : très « grenier ».
      const sheet = solid(roundedBox(w * 0.6, 4, h * 0.5, 2).rotateZ(0.25), fabric(0xf1ebe0));
      sheet.position.set(-w * 0.1, 64, h * 0.05);
      g.add(sheet);
      g.rotation.y = Math.PI;
      break;
    }
    case 'crate': {
      const crate = solid(roundedBox(w * 0.85, 90, h * 0.85, 4), mat(0xa8652e, { roughness: 0.85 }));
      crate.position.y = 45;
      g.add(crate);
      for (const sy of [20, 70]) {
        const slat = solid(roundedBox(w * 0.88, 12, h * 0.88, 3), mat(0x7e4520, { roughness: 0.85 }));
        slat.position.y = sy;
        g.add(slat);
      }
      // Vieille lampe posée dessus (abat-jour lumineux).
      const shade = solid(new THREE.CylinderGeometry(18, 30, 36, 24, 1, true), mat(PAL.tomato, { side: THREE.DoubleSide, emissive: 0xff7a3a, emissiveIntensity: 0.6, roughness: 0.8 }));
      shade.position.set(10, 132, 0);
      const stem = solid(new THREE.CylinderGeometry(2.5, 2.5, 40, 8), metal(0x444444, 0.4));
      stem.position.set(10, 110, 0);
      const foot = solid(new THREE.CylinderGeometry(14, 16, 6, 20), metal(0xc9a24a, 0.3));
      foot.position.set(10, 93, 0);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd27a, emissiveIntensity: 4 }));
      bulb.position.set(10, 128, 0);
      const light = new THREE.PointLight(0xffb060, 25000, 700, 2);
      light.position.set(10, 125, 0);
      g.add(shade, stem, foot, bulb, light);
      break;
    }
  }
  g.position.set(x + w / 2, 0, y + h / 2);
  return g;
}

/** Grosse pelle jaune posée contre le mur. Origine = bouche de la pelle. */
export function buildDustpan(c: Collector): THREE.Group {
  const dir = c.facing === 'right' ? 1 : -1;
  const g = new THREE.Group();
  const yellow = plastic(PAL.mustard);
  const shape = new THREE.Shape();
  shape.moveTo(-12, -48);
  shape.lineTo(66, -74);
  shape.lineTo(66, 74);
  shape.lineTo(-12, 48);
  shape.closePath();
  const base = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2 });
  base.rotateX(Math.PI / 2);
  const baseMesh = solid(base, yellow);
  baseMesh.position.y = 5;
  g.add(baseMesh);
  // Parois latérales, le long des bords biseautés.
  const edgeLen = Math.hypot(78, 26);
  for (const side of [-1, 1]) {
    const wallShape = new THREE.Shape();
    wallShape.moveTo(0, 0);
    wallShape.lineTo(edgeLen, 0);
    wallShape.lineTo(0, 46);
    wallShape.closePath();
    const wall = new THREE.ExtrudeGeometry(wallShape, { depth: 4, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2 });
    wall.translate(0, 0, -2);
    const m = solid(wall, yellow);
    m.rotation.y = -Math.atan2(26 * side, 78);
    m.position.set(-12, 0, 48 * side);
    g.add(m);
  }
  const back = solid(roundedBox(8, 46, 100, 3), yellow);
  back.position.set(-14, 23, 0);
  g.add(back);
  const handle = solid(new THREE.CylinderGeometry(7, 7, 120, 16), plastic(0xd9672c));
  handle.rotation.z = Math.PI / 2.6;
  handle.position.set(-40, 60, 0);
  g.add(handle);
  g.scale.x = dir;
  g.position.set(c.mouth.x, 0, c.mouth.y);
  return g;
}

/** Balai : la brosse est à l'origine, le manche monte vers +Y local. */
export function buildBroom(): { root: THREE.Group; head: THREE.Group; handle: THREE.Group } {
  const root = new THREE.Group();
  const head = new THREE.Group();
  // Brosse en paille : plein de petites mèches.
  const straw = mat(0xe2b553, { roughness: 0.85 });
  const bristles = solid(roundedBox(70, 26, 20, 5), straw);
  bristles.position.y = 13;
  head.add(bristles);
  for (let k = 0; k < 14; k++) {
    const tuft = solid(new THREE.CylinderGeometry(1.5, 2.5, 10, 5), straw);
    tuft.position.set(-32 + k * 5, 2, (k % 2 ? 1 : -1) * 4);
    tuft.rotation.z = (k - 7) * 0.03;
    head.add(tuft);
  }
  const band = solid(roundedBox(62, 12, 23, 4), plastic(PAL.tomato));
  band.position.y = 30;
  head.add(band);
  const handle = new THREE.Group();
  // Manche de longueur fixe (pas d'étirement : ça perturbait le calcul des ombres).
  const stick = solid(new THREE.CylinderGeometry(3.5, 3.5, 260, 12).translate(0, 130, 0), mat(0xb8692a, { roughness: 0.45 }));
  stick.castShadow = false;
  handle.add(stick);
  root.add(head, handle);
  return { root, head, handle };
}
