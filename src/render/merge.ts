import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Signature d'un matériau : deux matériaux identiques peuvent être fusionnés. */
function signature(m: THREE.Material): string {
  const s = m as THREE.MeshPhysicalMaterial;
  const parts: (string | number | boolean | undefined)[] = [
    m.type,
    m.side,
    m.transparent,
    s.color?.getHex(),
    s.map?.uuid,
    s.bumpMap?.uuid,
    s.bumpScale,
    s.roughness,
    s.metalness,
    s.emissive?.getHex(),
    s.emissiveIntensity,
    s.vertexColors,
    s.sheen,
    s.clearcoat,
  ];
  return parts.join('|');
}

/**
 * Fusionne tous les objets immobiles d'une pièce qui partagent le même matériau :
 * des centaines d'appels de dessin deviennent une poignée. Énorme gain sur les
 * puces graphiques intégrées.
 */
export function mergeStatic(root: THREE.Object3D, skip: Set<THREE.Object3D>): number {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  const remove: THREE.Mesh[] = [];
  const tmp = new THREE.Matrix4();

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (skip.has(p)) return;
    const mat = mesh.material as THREE.Material;
    if (mat.transparent) return;
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geo.applyMatrix4(tmp.multiplyMatrices(inv, mesh.matrixWorld));
    geo.morphAttributes = {};
    const attrs = Object.keys(geo.attributes).sort().join(',');
    const key = `${signature(mat)}#${attrs}#${mesh.castShadow}${mesh.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) {
      b = { mat, geos: [], cast: mesh.castShadow, receive: mesh.receiveShadow };
      buckets.set(key, b);
    }
    b.geos.push(geo);
    remove.push(mesh);
  });

  for (const m of remove) m.parent?.remove(m);
  let count = 0;
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    root.add(mesh);
    count++;
  }
  return count;
}
