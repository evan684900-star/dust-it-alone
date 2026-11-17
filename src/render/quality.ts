/** Niveaux de qualité graphique, du plus beau au plus léger. */
export type QualityLevel = 'ultra' | 'high' | 'medium' | 'low' | 'minimal';
export type QualitySetting = QualityLevel | 'auto';

export const QUALITY_ORDER: QualityLevel[] = ['ultra', 'high', 'medium', 'low', 'minimal'];

export const QUALITY_LABELS: Record<QualitySetting, string> = {
  auto: 'Auto',
  ultra: 'Ultra',
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Basse',
  minimal: 'Minimale',
};

export const QUALITY_HINTS: Record<QualitySetting, string> = {
  auto: 'Choisit tout seul selon ta carte graphique et baisse si ça rame',
  ultra: 'Tout à fond : occlusion ambiante, ombres très fines (grosse carte graphique)',
  high: 'Ombres fines, halo lumineux, anticrénelage',
  medium: 'Bon compromis pour la plupart des PC',
  low: 'Ombres simples, éclairage simplifié, résolution 75 % (cartes graphiques intégrées)',
  minimal: 'Sans ombres, éclairage simplifié, résolution 50 % (PC très modestes)',
};

export interface QualityPreset {
  /** Plafond de la densité de pixels (1 = résolution native de l'écran en pixels CSS). */
  pixelRatio: number;
  /** 0 = pas d'ombres. */
  shadowMap: number;
  /** Les grains de poussière projettent-ils une ombre ? */
  dustShadows: boolean;
  /** Les moutons / étoiles projettent-ils une ombre ? */
  bigParticleShadows: boolean;
  gtao: boolean;
  bloom: boolean;
  /** Anticrénelage (MSAA) du post-traitement. */
  msaa: number;
  /** Matériaux riches (reflet velouté) sur les particules. */
  richParticles: boolean;
  /** Lumières d'appoint (lampe…). */
  extraLights: boolean;
  /** Grains de lumière flottants et rayon lumineux. */
  ambienceFx: boolean;
  /** Formes simplifiées pour les grains de poussière (beaucoup moins de triangles). */
  lowPolyDust: boolean;
  /** Matériaux simplifiés partout (éclairage bien moins coûteux, idéal pour les puces graphiques intégrées). */
  cheapMaterials: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  ultra: { pixelRatio: 2, shadowMap: 4096, dustShadows: true, bigParticleShadows: true, gtao: true, bloom: true, msaa: 4, richParticles: true, extraLights: true, ambienceFx: true, lowPolyDust: false, cheapMaterials: false },
  high: { pixelRatio: 1.5, shadowMap: 2048, dustShadows: true, bigParticleShadows: true, gtao: false, bloom: true, msaa: 4, richParticles: true, extraLights: true, ambienceFx: true, lowPolyDust: false, cheapMaterials: false },
  medium: { pixelRatio: 1, shadowMap: 2048, dustShadows: false, bigParticleShadows: true, gtao: false, bloom: true, msaa: 2, richParticles: false, extraLights: true, ambienceFx: true, lowPolyDust: false, cheapMaterials: false },
  low: { pixelRatio: 0.75, shadowMap: 1024, dustShadows: false, bigParticleShadows: false, gtao: false, bloom: false, msaa: 0, richParticles: false, extraLights: false, ambienceFx: true, lowPolyDust: true, cheapMaterials: true },
  minimal: { pixelRatio: 0.5, shadowMap: 0, dustShadows: false, bigParticleShadows: false, gtao: false, bloom: false, msaa: 0, richParticles: false, extraLights: false, ambienceFx: false, lowPolyDust: true, cheapMaterials: true },
};

export function isQualitySetting(v: unknown): v is QualitySetting {
  return typeof v === 'string' && (v === 'auto' || (QUALITY_ORDER as string[]).includes(v));
}

/** Qualité de départ du mode Auto (avant de connaître la carte graphique). */
export const AUTO_START: QualityLevel = 'medium';

/** Qualité de départ conseillée selon le nom de la carte graphique. */
export function autoStartFor(gpu: string): QualityLevel {
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return 'minimal';
  // Puces graphiques intégrées (Intel HD/UHD/Iris, petites Radeon intégrées, Mali…).
  if (/intel|uhd|iris|hd graphics|mali|adreno|vega \d|radeon\(tm\) graphics/i.test(gpu)) return 'low';
  if (/rtx|radeon rx|apple m\d (pro|max|ultra)/i.test(gpu)) return 'high';
  return 'medium';
}

/** Le niveau juste en dessous (ou null si on est déjà au minimum). */
export function lowerQuality(q: QualityLevel): QualityLevel | null {
  const i = QUALITY_ORDER.indexOf(q);
  return i < QUALITY_ORDER.length - 1 ? QUALITY_ORDER[i + 1] : null;
}
