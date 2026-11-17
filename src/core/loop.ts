/**
 * Boucle à pas fixe : la logique tourne toujours à `hz` images/s,
 * quelle que soit la fréquence de l'écran.
 */
export function createFixedLoop(step: (dt: number) => void, hz = 60) {
  const dt = 1 / hz;
  const maxSteps = 8;
  let acc = 0;
  return (elapsedSeconds: number): number => {
    acc += Math.min(elapsedSeconds, 0.25);
    let n = 0;
    while (acc >= dt && n < maxSteps) {
      step(dt);
      acc -= dt;
      n++;
    }
    if (n === maxSteps) acc = 0;
    return acc / dt; // facteur d'interpolation
  };
}
