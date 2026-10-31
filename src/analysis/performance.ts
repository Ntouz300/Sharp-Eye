import { speedOf } from '../pgn/parser';

/** Correspondance approximative précision → Elo, à cadence rapide (points interpolés linéairement). */
const POINTS: [number, number][] = [
  [40, 400],
  [50, 650],
  [60, 950],
  [70, 1300],
  [80, 1700],
  [85, 1950],
  [90, 2250],
  [95, 2600],
  [98, 2850],
  [100, 3000],
];

/** Plus la cadence est rapide, plus une même précision traduit un niveau élevé. */
const SPEED_BONUS: Record<string, number> = { bullet: 200, blitz: 100, rapid: 0, classical: -100, correspondence: -250, unknown: 0 };

/** Performance estimée (Elo approximatif) d'après la précision de la partie et la cadence. Simple estimation. */
export function estimatePerformance(accuracy: number, timeControl?: string): number {
  let elo = POINTS[0][1];
  for (let i = 1; i < POINTS.length; i++) {
    const [a0, e0] = POINTS[i - 1];
    const [a1, e1] = POINTS[i];
    if (accuracy <= a1) {
      elo = e0 + ((Math.max(accuracy, a0) - a0) / (a1 - a0)) * (e1 - e0);
      break;
    }
    elo = e1;
  }
  elo += SPEED_BONUS[speedOf(timeControl)] ?? 0;
  return Math.round(Math.max(100, Math.min(3200, elo)) / 25) * 25;
}
