const SUFFIXES = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Formate un nombre de façon lisible : 1 234 → 12,3 k → 4,56 M… */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 1000) return sign + Math.floor(n).toString();
  if (n < 10_000) return sign + Math.floor(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
  const tier = Math.min(Math.floor(Math.log10(n) / 3), SUFFIXES.length - 1);
  const scaled = n / Math.pow(1000, tier);
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  const factor = Math.pow(10, digits);
  const truncated = Math.floor(scaled * factor) / factor;
  return sign + truncated.toFixed(digits).replace('.', ',') + ' ' + SUFFIXES[tier];
}
