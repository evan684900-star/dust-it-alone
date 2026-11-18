import * as THREE from 'three';
import type { Collector, Prop } from '../data/rooms';
import { PAL } from './palette';
import { fabric, mat, metal, plastic, solid } from './materials';
import { colored, roundedBox } from './geometry';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Un meuble du grenier. Coordonnées du sol : x, y de la simulation → x, z en 3D. */
export function buildProp(p: Prop): THREE.Object3D {
  const { x, y } = p.rect;
  // Les meubles « tournés » sont construits dans le sens de la longueur puis pivotés.
  const w = p.rot ? p.rect.h : p.rect.w;
  const h = p.rot ? p.rect.w : p.rect.h;
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
      // Point lumineux : une des lumières dynamiques viendra s'y placer.
      bulb.userData.torch = true;
      g.add(shade, stem, foot, bulb);
      break;
    }
    case 'bookshelf': {
      const H = 300;
      const wood = mat(0x5a3220, { roughness: 0.7 });
      // Meuble ouvert : fond, côtés et chapeau (les livres se voient de face).
      const back = solid(roundedBox(w, H, 8, 2), wood);
      back.position.set(0, H / 2, -h / 2 + 4);
      g.add(back);
      for (const sx of [-1, 1]) {
        const side = solid(roundedBox(10, H, h, 2), wood);
        side.position.set(sx * (w / 2 - 5), H / 2, 0);
        g.add(side);
      }
      const top = solid(roundedBox(w + 12, 14, h + 8, 3), wood);
      top.position.set(0, H + 7, 0);
      g.add(top);
      // Rangées de livres : une seule géométrie colorée par étagère (léger à afficher).
      const books: THREE.BufferGeometry[] = [];
      const colors = [0x8a2a2a, 0x2a4a7a, 0x2a6a4a, 0x7a6a2a, 0x5a2a6a, 0xa8742a, 0x3a3a3a, 0x9a3a1a];
      let seed = Math.floor(x * 7 + y * 13);
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      for (let shelf = 0; shelf < 5; shelf++) {
        const sy = 18 + shelf * 56;
        let bx = -w / 2 + 10;
        while (bx < w / 2 - 14) {
          const bw = 5 + rnd() * 6;
          const bh = 34 + rnd() * 14;
          const b = new THREE.BoxGeometry(bw, bh, h * 0.72);
          b.translate(bx + bw / 2, sy + bh / 2, -h / 2 + 8 + h * 0.36 + rnd() * 4);
          books.push(colored(b, colors[Math.floor(rnd() * colors.length)]));
          bx += bw + 0.6;
        }
        const plank = new THREE.BoxGeometry(w - 16, 4, h - 6);
        plank.translate(0, sy - 2, 0);
        books.push(colored(plank, 0x6a3a22));
      }
      const merged = mergeGeometries(books);
      if (merged) {
        const m = solid(merged, mat(0xffffff, { vertexColors: true, roughness: 0.75 }));
        m.castShadow = false;
        g.add(m);
      }
      break;
    }
    case 'readingTable': {
      const top = solid(roundedBox(w, 8, h, 3), mat(0x6a3a22, { roughness: 0.45 }));
      top.position.y = 80;
      g.add(top);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = solid(new THREE.CylinderGeometry(5, 4, 76, 10), mat(0x4a2a18, { roughness: 0.5 }));
        leg.position.set(sx * (w / 2 - 15), 38, sz * (h / 2 - 15));
        g.add(leg);
      }
      const book = solid(roundedBox(40, 5, 28, 1.5), mat(0xe8dcc0, { roughness: 0.8 }));
      book.position.set(-30, 87, 0);
      book.rotation.y = 0.3;
      const candle = solid(new THREE.CylinderGeometry(3, 3, 20, 10), mat(0xf4ecd8, { roughness: 0.6 }));
      candle.position.set(60, 94, -20);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(3) }));
      flame.scale.y = 1.8;
      flame.position.set(60, 109, -20);
      g.add(book, candle, flame);
      break;
    }
    case 'globe': {
      const ball = solid(new THREE.SphereGeometry(30, 24, 16), mat(0x3a7aa8, { roughness: 0.4 }));
      ball.position.y = 100;
      const ring = solid(new THREE.TorusGeometry(34, 2.5, 8, 32), metal(0xc9a24a, 0.35));
      ring.position.y = 100;
      ring.rotation.x = 1.2;
      const foot = solid(new THREE.CylinderGeometry(6, 22, 66, 12), mat(0x5a3220, { roughness: 0.5 }));
      foot.position.y = 33;
      g.add(ball, ring, foot);
      break;
    }
    case 'bed': {
      const frame = solid(roundedBox(w, 45, h, 8), mat(0x6a2a1a, { roughness: 0.5 }));
      frame.position.y = 25;
      const mattress = solid(roundedBox(w - 20, 30, h - 30, 12), fabric(0xf1ebe0));
      mattress.position.set(0, 60, 8);
      const cover = solid(roundedBox(w - 10, 12, h * 0.62, 6), fabric(0x8a1a2a));
      cover.position.set(0, 76, h * 0.17);
      g.add(frame, mattress, cover);
      for (const sx of [-1, 1]) {
        const pillow = solid(roundedBox(w * 0.36, 18, 60, 9), fabric(0xffffff));
        pillow.position.set(sx * w * 0.22, 82, -h / 2 + 55);
        g.add(pillow);
      }
      // Baldaquin.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const post = solid(new THREE.CylinderGeometry(6, 6, 300, 12), mat(0x6a2a1a, { roughness: 0.45 }));
        post.position.set(sx * (w / 2 - 6), 150, sz * (h / 2 - 6));
        g.add(post);
      }
      const canopy = solid(roundedBox(w + 10, 14, h + 10, 4), fabric(0x8a1a2a));
      canopy.position.y = 300;
      g.add(canopy);
      for (const sx of [-1, 1]) {
        const curtain = solid(roundedBox(6, 220, h * 0.9, 3), fabric(0xa82a3a));
        curtain.position.set(sx * (w / 2 + 2), 190, 0);
        g.add(curtain);
      }
      const head = solid(roundedBox(w, 120, 12, 5), mat(0x6a2a1a, { roughness: 0.5 }));
      head.position.set(0, 60, -h / 2 + 6);
      g.add(head);
      break;
    }
    case 'wardrobe': {
      const body = solid(roundedBox(w, 230, h, 6), mat(0x5a2a1a, { roughness: 0.55 }));
      body.position.y = 115;
      g.add(body);
      for (const sx of [-1, 1]) {
        const knob = solid(new THREE.SphereGeometry(4, 10, 8), metal(0xc9a24a, 0.3));
        knob.position.set(sx * 10, 120, h / 2 + 3);
        g.add(knob);
      }
      break;
    }
    case 'chest': {
      const body = solid(roundedBox(w, 60, h, 6), mat(0x7a4a22, { roughness: 0.55 }));
      body.position.y = 30;
      const lid = solid(roundedBox(w + 4, 14, h + 4, 5), mat(0x8a5a2a, { roughness: 0.5 }));
      lid.position.y = 66;
      g.add(body, lid);
      for (const sx of [-w * 0.32, w * 0.32]) {
        const band = solid(roundedBox(10, 76, h + 6, 2), metal(0x555555, 0.5));
        band.position.set(sx, 37, 0);
        g.add(band);
      }
      break;
    }
    case 'pillar': {
      const stone = mat(0xb8a894, { roughness: 0.85 });
      const shaft = solid(new THREE.CylinderGeometry(w * 0.36, w * 0.4, 900, 20), stone);
      shaft.position.y = 450;
      const base = solid(roundedBox(w, 30, h, 4), stone);
      base.position.y = 15;
      const cap = solid(roundedBox(w, 30, h, 4), stone);
      cap.position.y = 880;
      g.add(shaft, base, cap);
      break;
    }
    case 'armor': {
      const steel = metal(0xb8bcc4, 0.3);
      const torso = solid(roundedBox(46, 70, 28, 12), steel);
      torso.position.y = 120;
      const helmet = solid(new THREE.SphereGeometry(16, 16, 12), steel);
      helmet.position.y = 172;
      const plume = solid(new THREE.ConeGeometry(6, 30, 8), fabric(0xc02a2a));
      plume.position.y = 198;
      g.add(torso, helmet, plume);
      for (const sx of [-1, 1]) {
        const leg = solid(new THREE.CylinderGeometry(8, 7, 85, 10), steel);
        leg.position.set(sx * 12, 42, 0);
        const arm = solid(new THREE.CylinderGeometry(6, 6, 64, 10), steel);
        arm.position.set(sx * 30, 115, 0);
        g.add(leg, arm);
      }
      const spear = solid(new THREE.CylinderGeometry(2, 2, 230, 6), mat(0x5a3a22, { roughness: 0.6 }));
      spear.position.set(36, 115, 6);
      const tip = solid(new THREE.ConeGeometry(5, 22, 6), steel);
      tip.position.set(36, 240, 6);
      g.add(spear, tip);
      const stand = solid(roundedBox(w, 8, h, 2), mat(0x3a2a22, { roughness: 0.6 }));
      stand.position.y = 4;
      g.add(stand);
      break;
    }
    case 'bench': {
      const seat = solid(roundedBox(w, 10, h, 4), fabric(0x7a1a2a));
      seat.position.y = 45;
      g.add(seat);
      for (const sx of [-1, 1]) {
        const leg = solid(roundedBox(10, 42, h - 10, 3), mat(0x4a2a18, { roughness: 0.5 }));
        leg.position.set(sx * (w / 2 - 12), 21, 0);
        g.add(leg);
      }
      break;
    }
    case 'longTable': {
      const top = solid(roundedBox(w, 10, h, 4), mat(0x6a3a22, { roughness: 0.4 }));
      top.position.y = 82;
      g.add(top);
      for (let k = 0; k < 4; k++) {
        const leg = solid(roundedBox(14, 78, h - 30, 4), mat(0x4a2a18, { roughness: 0.5 }));
        leg.position.set(-w / 2 + 40 + (k * (w - 80)) / 3, 39, 0);
        g.add(leg);
      }
      for (let k = 0; k < 3; k++) {
        const c = solid(new THREE.CylinderGeometry(4, 5, 34, 10), metal(0xc9a24a, 0.3));
        c.position.set(-w / 3 + (k * w) / 3, 104, 0);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(3.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(3) }));
        flame.scale.y = 1.8;
        flame.position.set(-w / 3 + (k * w) / 3, 126, 0);
        g.add(c, flame);
      }
      break;
    }
    case 'stove': {
      const brick = mat(0x8a3a2a, { roughness: 0.9 });
      const body = solid(roundedBox(w, 120, h, 6), brick);
      body.position.y = 60;
      const top = solid(roundedBox(w + 10, 12, h + 10, 3), metal(0x2a2622, 0.5));
      top.position.y = 126;
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.4, 50), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a2a).multiplyScalar(2.5) }));
      mouth.position.set(0, 45, h / 2 + 1);
      const hood = solid(new THREE.CylinderGeometry(w * 0.25, w * 0.5, 140, 4, 1, true).rotateY(Math.PI / 4), mat(0x6a4a3a, { side: THREE.DoubleSide }));
      hood.position.y = 210;
      g.add(body, top, mouth, hood);
      mouth.userData.torch = true;
      break;
    }
    case 'cauldron': {
      const pot = solid(new THREE.SphereGeometry(w * 0.45, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), metal(0x2a2622, 0.6));
      pot.material = metal(0x2a2622, 0.6);
      (pot.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      pot.position.y = 60;
      pot.rotation.x = Math.PI;
      const soup = new THREE.Mesh(new THREE.CircleGeometry(w * 0.36, 20).rotateX(-Math.PI / 2), mat(0x8ab83a, { emissive: 0x3a6a10, emissiveIntensity: 0.6 }));
      soup.position.y = 75;
      const fire = new THREE.Mesh(new THREE.ConeGeometry(18, 30, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(3) }));
      fire.position.y = 15;
      g.add(pot, soup, fire);
      break;
    }
    case 'counter': {
      const top = solid(roundedBox(w, 12, h, 3), mat(0xc9a878, { roughness: 0.5 }));
      top.position.y = 92;
      const body = solid(roundedBox(w - 10, 86, h - 10, 4), mat(0x7a4a22, { roughness: 0.6 }));
      body.position.y = 43;
      g.add(top, body);
      for (let k = 0; k < 4; k++) {
        const jar = solid(new THREE.CylinderGeometry(9, 11, 26, 12), mat([0xd88a3a, 0x8ab8d8, 0xe8d8b8, 0xb84a3a][k], { roughness: 0.3 }));
        jar.position.set(-w / 2 + 60 + k * ((w - 120) / 3), 111, -h * 0.15);
        g.add(jar);
      }
      break;
    }
    case 'pew': {
      const wood = mat(0x6a3a22, { roughness: 0.55 });
      const seat = solid(roundedBox(w, 10, h * 0.6, 3), wood);
      seat.position.set(0, 45, h * 0.1);
      const back = solid(roundedBox(w, 70, 8, 3), wood);
      back.position.set(0, 80, -h * 0.3);
      g.add(seat, back);
      for (const sx of [-1, 1]) {
        const end = solid(roundedBox(10, 95, h, 3), wood);
        end.position.set(sx * (w / 2 - 5), 47, 0);
        g.add(end);
      }
      break;
    }
    case 'altar': {
      const stone = solid(roundedBox(w, 100, h, 6), mat(0xe8e0d0, { roughness: 0.6 }));
      stone.position.y = 50;
      const cloth = solid(roundedBox(w + 6, 6, h * 0.6, 2), fabric(0x8a1a3a));
      cloth.position.y = 103;
      g.add(stone, cloth);
      for (const sx of [-1, 1]) {
        const c = solid(new THREE.CylinderGeometry(5, 6, 50, 10), metal(0xc9a24a, 0.3));
        c.position.set(sx * w * 0.35, 131, 0);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(4.5, 14, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(3) }));
        flame.position.set(sx * w * 0.35, 163, 0);
        g.add(c, flame);
      }
      break;
    }
    case 'tree': {
      const trunk = solid(new THREE.CylinderGeometry(w * 0.12, w * 0.18, 380, 12), mat(0x6a4a2a, { roughness: 0.9 }));
      trunk.position.y = 190;
      g.add(trunk);
      const leaves = [0xd8742a, 0xe8a030, 0xc84a2a, 0x9aa83a];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const ball = solid(new THREE.IcosahedronGeometry(w * (0.32 + (k % 3) * 0.06), 1), mat(leaves[k % leaves.length], { roughness: 0.85, flatShading: true }));
        ball.position.set(Math.cos(a) * w * 0.3, 400 + (k % 2) * 60, Math.sin(a) * w * 0.3);
        g.add(ball);
      }
      const top = solid(new THREE.IcosahedronGeometry(w * 0.4, 1), mat(0xe08a2a, { roughness: 0.85, flatShading: true }));
      top.position.y = 500;
      g.add(top);
      break;
    }
    case 'fountain': {
      const stone = mat(0xc8b8a0, { roughness: 0.85 });
      const basin = solid(new THREE.CylinderGeometry(w / 2, w / 2 + 6, 50, 32, 1, true), stone);
      (basin.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      basin.position.y = 25;
      const rim = solid(new THREE.TorusGeometry(w / 2, 9, 8, 32).rotateX(Math.PI / 2), stone);
      rim.position.y = 50;
      const water = new THREE.Mesh(new THREE.CircleGeometry(w / 2 - 4, 32).rotateX(-Math.PI / 2), mat(0x5ec8f2, { roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.8 }));
      water.position.y = 40;
      const column = solid(new THREE.CylinderGeometry(14, 20, 120, 16), stone);
      column.position.y = 60;
      const bowl = solid(new THREE.CylinderGeometry(50, 20, 20, 24), stone);
      bowl.position.y = 125;
      g.add(basin, rim, water, column, bowl);
      break;
    }
    case 'well': {
      const stone = mat(0xa89c8e, { roughness: 0.9 });
      const ring = solid(new THREE.CylinderGeometry(w / 2, w / 2, 80, 20, 1, true), stone);
      (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      ring.position.y = 40;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(w / 2 - 6, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0808 }));
      hole.position.y = 30;
      g.add(ring, hole);
      for (const sx of [-1, 1]) {
        const post = solid(roundedBox(12, 180, 12, 3), mat(0x6a4a2a));
        post.position.set(sx * (w / 2 - 6), 90, 0);
        g.add(post);
      }
      const roof = solid(new THREE.ConeGeometry(w * 0.7, 60, 4).rotateY(Math.PI / 4), mat(0x8a3a2a));
      roof.position.y = 210;
      g.add(roof);
      break;
    }
    case 'barrel': {
      const wood = mat(0x8a5a30, { roughness: 0.7 });
      const body = solid(new THREE.CylinderGeometry(w * 0.45, w * 0.45, h * 1.1, 16), wood);
      body.rotation.z = Math.PI / 2;
      body.position.y = w * 0.45;
      g.add(body);
      for (const sx of [-0.35, 0, 0.35]) {
        const hoop = solid(new THREE.TorusGeometry(w * 0.46, 2.5, 6, 20).rotateY(Math.PI / 2), metal(0x3a3430, 0.5));
        hoop.position.set(sx * h, w * 0.45, 0);
        g.add(hoop);
      }
      break;
    }
    case 'bars': {
      // Barreaux de cellule, le long de z.
      const iron = metal(0x3a3a3e, 0.45);
      for (let z = -h / 2 + 15; z < h / 2; z += 30) {
        const bar = solid(new THREE.CylinderGeometry(3, 3, 300, 8), iron);
        bar.position.set(0, 150, z);
        g.add(bar);
      }
      for (const y of [20, 290]) {
        const rail = solid(roundedBox(12, 10, h, 2), iron);
        rail.position.y = y;
        g.add(rail);
      }
      break;
    }
    case 'gear': {
      const brass = metal(0xc9a24a, 0.35);
      const teeth = 18;
      const wheel = solid(new THREE.CylinderGeometry(w / 2, w / 2, 24, 32), brass);
      wheel.position.y = 60;
      g.add(wheel);
      for (let k = 0; k < teeth; k++) {
        const a = (k / teeth) * Math.PI * 2;
        const tooth = solid(roundedBox(22, 24, 26, 3), brass);
        tooth.position.set(Math.cos(a) * (w / 2 + 8), 60, Math.sin(a) * (w / 2 + 8));
        tooth.rotation.y = -a;
        g.add(tooth);
      }
      const axle = solid(new THREE.CylinderGeometry(10, 10, 140, 12), metal(0x3a3430, 0.5));
      axle.position.y = 70;
      g.add(axle);
      g.userData.spin = true;
      break;
    }
    case 'throne': {
      const gold = metal(0xd8b860, 0.3);
      const velvet = fabric(0x8a1a2a);
      const dais = solid(roundedBox(w, 30, h, 6), mat(0xd8d0c0, { roughness: 0.6 }));
      dais.position.y = 15;
      const seat = solid(roundedBox(w * 0.55, 50, h * 0.55, 8), velvet);
      seat.position.set(0, 75, 0);
      const back = solid(roundedBox(w * 0.55, 220, 20, 8), gold);
      back.position.set(0, 160, -h * 0.25);
      const cushion = solid(roundedBox(w * 0.45, 150, 10, 8), velvet);
      cushion.position.set(0, 160, -h * 0.25 + 14);
      g.add(dais, seat, back, cushion);
      for (const sx of [-1, 1]) {
        const arm = solid(roundedBox(18, 50, h * 0.5, 6), gold);
        arm.position.set(sx * w * 0.3, 110, 0);
        g.add(arm);
      }
      const crown = solid(new THREE.CylinderGeometry(22, 26, 24, 10, 1, true), gold);
      (crown.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      crown.position.set(0, 290, -h * 0.25);
      g.add(crown);
      break;
    }
  }
  if (p.rot) g.rotation.y = (p.rot * Math.PI) / 2;
  g.position.set(x + p.rect.w / 2, 0, y + p.rect.h / 2);
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
  if (c.facing === 'left' || c.facing === 'right') g.scale.x = dir;
  // Ouverture vers +z (« down ») ou vers -z (« up ») : on tourne la pelle.
  else g.rotation.y = c.facing === 'down' ? -Math.PI / 2 : Math.PI / 2;
  g.position.set(c.mouth.x, 0, c.mouth.y);
  return g;
}

/** Balai : la brosse est à l'origine, le manche monte vers +Y local. */
export function buildBroom(): { root: THREE.Group; head: THREE.Group; handle: THREE.Group; heads: Record<string, THREE.Group> } {
  const root = new THREE.Group();
  const head = new THREE.Group();
  const broomHead = new THREE.Group();
  head.add(broomHead);
  // Brosse en paille : plein de petites mèches.
  const straw = mat(0xe2b553, { roughness: 0.85 });
  const bristles = solid(roundedBox(70, 26, 20, 5), straw);
  bristles.position.y = 13;
  broomHead.add(bristles);
  for (let k = 0; k < 14; k++) {
    const tuft = solid(new THREE.CylinderGeometry(1.5, 2.5, 10, 5), straw);
    tuft.position.set(-32 + k * 5, 2, (k % 2 ? 1 : -1) * 4);
    tuft.rotation.z = (k - 7) * 0.03;
    broomHead.add(tuft);
  }
  const band = solid(roundedBox(62, 12, 23, 4), plastic(PAL.tomato));
  band.position.y = 30;
  broomHead.add(band);

  // Plumeau : un bouquet de plumes colorées.
  const duster = new THREE.Group();
  const plumeColors = [0xff8a6e, 0xffc93c, 0x5ec8f2, 0xc38bff, 0xf4ecdc];
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const f = solid(new THREE.ConeGeometry(5, 34, 6), fabric(plumeColors[k % plumeColors.length]));
    f.position.set(Math.cos(a) * 9, 22, Math.sin(a) * 9);
    f.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    duster.add(f);
  }
  const dusterCore = solid(new THREE.SphereGeometry(10, 12, 8), fabric(0xf4ecdc));
  dusterCore.position.y = 30;
  duster.add(dusterCore);
  // Éponge : un pavé jaune et vert.
  const sponge = new THREE.Group();
  const spongeBody = solid(roundedBox(40, 16, 26, 5), mat(0xffd84a, { roughness: 0.95 }));
  spongeBody.position.y = 10;
  const scrub = solid(roundedBox(40, 6, 26, 2), mat(0x4aa84a, { roughness: 1 }));
  scrub.position.y = 3;
  sponge.add(spongeBody, scrub);
  // Aspirateur : une large buse plate.
  const vacuum = new THREE.Group();
  const nozzle = solid(roundedBox(56, 10, 18, 4), plastic(0x5ec8f2));
  nozzle.position.y = 6;
  const neck = solid(new THREE.CylinderGeometry(6, 8, 30, 12), plastic(0x3a8ab8));
  neck.position.y = 24;
  vacuum.add(nozzle, neck);
  // Souffleur : un cône qui pointe vers l'avant.
  const blower = new THREE.Group();
  const cone = solid(new THREE.CylinderGeometry(6, 16, 46, 14, 1, true).rotateX(Math.PI / 2), plastic(0xff8a6e));
  cone.position.set(0, 26, -18);
  const motor = solid(roundedBox(26, 22, 26, 6), plastic(0xd84a3a));
  motor.position.set(0, 26, 10);
  blower.add(cone, motor);
  for (const h of [duster, sponge, vacuum, blower]) {
    h.visible = false;
    head.add(h);
  }
  const heads = { broom: broomHead, duster, sponge, vacuum, blower };
  const handle = new THREE.Group();
  // Manche de longueur fixe (pas d'étirement : ça perturbait le calcul des ombres).
  const stick = solid(new THREE.CylinderGeometry(3.5, 3.5, 260, 12).translate(0, 130, 0), mat(0xb8692a, { roughness: 0.45 }));
  stick.castShadow = false;
  handle.add(stick);
  root.add(head, handle);
  return { root, head, handle, heads };
}
