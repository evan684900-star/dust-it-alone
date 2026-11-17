import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Boîte aux arêtes arrondies : plus « cartoon », et son contour n'a pas de trous. */
export function roundedBox(w: number, h: number, d: number, r = 6, seg = 2): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const hd = d / 2 - r;
  const v = new THREE.Vector3();
  const inner = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
    const dir = v.clone().sub(inner);
    if (dir.lengthSq() > 0) v.copy(inner.add(dir.normalize().multiplyScalar(r)));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const merged = mergeVertices(geo);
  merged.computeVertexNormals();
  return merged;
}

/** Ajoute une couleur par sommet (pour fusionner des pièces de couleurs différentes). */
export function colored(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

/** Mouton de poussière : boule duveteuse + deux grands yeux. Rayon 1. */
export function dustBunnyGeometry(): THREE.BufferGeometry {
  const body = new THREE.IcosahedronGeometry(1, 2);
  const p = body.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.16 * Math.sin(v.x * 9 + v.y * 7) * Math.cos(v.z * 8 - v.y * 5);
    v.multiplyScalar(n);
    v.y *= 0.82;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  body.computeVertexNormals();
  const parts = [colored(body, 0xb4a8c6)];
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.3, 12, 8);
    eye.scale(1, 1.2, 0.6);
    eye.translate(side * 0.32, 0.18, 0.86);
    parts.push(colored(eye, 0xffffff));
    const pupil = new THREE.SphereGeometry(0.15, 10, 6);
    pupil.scale(1, 1.2, 0.6);
    pupil.translate(side * 0.3, 0.14, 1.03);
    parts.push(colored(pupil, 0x2b1a2e));
  }
  return mergeGeometries(parts)!;
}

/** Grain de poussière : petit caillou mou et aplati. Rayon 1. */
export function grainGeometry(): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(1, 0);
  g.scale(1, 0.55, 0.85);
  return g;
}

/** Étoile 3D (poussière d'étoile). Rayon 1. */
export function starGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
    const r = k % 2 === 0 ? 1 : 0.45;
    if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 });
  g.translate(0, 0, -0.15);
  g.computeVertexNormals();
  return g;
}
