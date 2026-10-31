import { GAME_ACCURACY } from './config';

function stdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Précision de la partie pour un joueur.
 * winsWhite : Win % côté blancs pour chaque position (position initiale incluse), soit n+1 valeurs pour n coups.
 * moveAccuracies : précision de chaque coup (n valeurs) ; colors : camp de chaque coup.
 * Résultat : moyenne de la moyenne pondérée par la volatilité et de la moyenne harmonique.
 */
export function gameAccuracy(
  winsWhite: number[],
  moveAccuracies: number[],
  colors: ('w' | 'b')[],
  player: 'w' | 'b',
): number | null {
  const n = moveAccuracies.length;
  if (!n) return null;
  const windowSize = Math.max(GAME_ACCURACY.minWindow, Math.min(GAME_ACCURACY.maxWindow, Math.floor(n / 10)));
  // Fenêtres : les premières fenêtres sont complétées pour que chaque coup en ait une.
  const windows: number[][] = [];
  const firstCount = Math.min(windowSize, winsWhite.length) - 2;
  for (let i = 0; i < firstCount; i++) windows.push(winsWhite.slice(0, windowSize));
  for (let i = 0; i + windowSize <= winsWhite.length; i++) windows.push(winsWhite.slice(i, i + windowSize));
  const weights = windows.map((w) => Math.max(GAME_ACCURACY.minWeight, Math.min(GAME_ACCURACY.maxWeight, stdDev(w))));

  let wSum = 0;
  let wTotal = 0;
  let harmDen = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (colors[i] !== player) continue;
    const acc = moveAccuracies[i];
    const weight = weights[i] ?? GAME_ACCURACY.minWeight;
    wSum += acc * weight;
    wTotal += weight;
    harmDen += 1 / Math.max(acc, 1);
    count++;
  }
  if (!count) return null;
  const weighted = wSum / wTotal;
  const harmonic = count / harmDen;
  return (weighted + harmonic) / 2;
}

/** Arrondi au dixième, affiché à la française (« 87,4 % »). */
export function formatAccuracy(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return `${value.toFixed(1).replace('.', ',')} %`;
}
