import * as THREE from 'three';

/**
 * Matériaux physiques (PBR) : ils réagissent à la lumière, aux ombres et à
 * l'éclairage d'environnement comme dans un vrai jeu 3D.
 */
export function mat(color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra });
}

/** Tissu doux (fauteuil, moutons de poussière) : reflet velouté sur les bords. */
export function fabric(color: THREE.ColorRepresentation, extra: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: 0x9a8fa0, ...extra });
}

/** Métal (laiton, ferrures). */
export function metal(color: THREE.ColorRepresentation, roughness = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.9 });
}

/** Plastique brillant (pelles, balai). */
export function plastic(color: THREE.ColorRepresentation): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 });
}

/** Objet plein qui projette et reçoit des ombres. */
export function solid(geo: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
