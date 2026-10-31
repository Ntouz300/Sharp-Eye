/**
 * Reconnaissance d'une position sur une image (capture d'écran d'un échiquier en 2D).
 * 1. Repère la grille : les 7 lignes intérieures de l'échiquier forment un motif de bords régulier.
 * 2. Pour chaque case, sépare la pièce du fond (couleur estimée sur le pourtour de la case).
 * 3. Couleur de la pièce par la clarté de sa silhouette, type par comparaison avec des modèles.
 */

export interface Img {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Grid {
  x: number;
  y: number;
  /** Taille d'une case en pixels. */
  size: number;
  score: number;
}

/** Silhouette binaire normalisée (N × N) d'une pièce. */
export type Mask = Uint8Array;
export const MASK_N = 24;
export type Templates = Record<string, Mask>; // clés : p n b r q k

export interface SquareRead {
  piece: string | null; // 'P', 'n'… ou null
  confidence: number;
}

export interface Recognition {
  grid: Grid;
  /** Rangées 8 à 1 telles que vues sur l'image (haut en premier). */
  squares: SquareRead[][];
  /** Les blancs semblent jouer vers le haut de l'image (échiquier vu depuis les blancs). */
  whiteAtBottom: boolean;
}

function gray(img: Img): Float32Array {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
  return g;
}

/** Profils des bords verticaux (par colonne) et horizontaux (par ligne). */
function profiles(img: Img) {
  const { width: W, height: H } = img;
  const g = gray(img);
  const col = new Float32Array(W);
  const row = new Float32Array(H);
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++) {
      const v = g[y * W + x];
      col[x] += Math.min(60, Math.abs(g[y * W + x + 1] - v));
      row[y] += Math.min(60, Math.abs(g[(y + 1) * W + x] - v));
    }
  return { col, row };
}

/** Meilleurs (décalage, pas) pour 9 lignes régulières sur un profil. */
function bestLines(prof: Float32Array, minP: number, maxP: number, top = 6) {
  const n = prof.length;
  const at = (x: number) => {
    const i = Math.round(x);
    return Math.max(prof[i - 1] ?? 0, prof[i] ?? 0, prof[i + 1] ?? 0);
  };
  const out: { o: number; p: number; s: number }[] = [];
  for (let p = minP; p <= maxP; p += 0.25) {
    for (let o = 0; o + 8 * p < n; o += 1) {
      let lines = 0;
      let mids = 0;
      let weakest = Infinity;
      for (let k = 0; k <= 8; k++) {
        const v = at(o + k * p);
        lines += v;
        if (k > 0 && k < 8) weakest = Math.min(weakest, v);
      }
      for (let k = 0; k < 8; k++) mids += prof[Math.round(o + (k + 0.5) * p)];
      // Toutes les lignes intérieures doivent être nettes : on ajoute la plus faible au score.
      const s = lines / 9 + weakest / 2 - mids / 8;
      if (out.length < top || s > out[out.length - 1].s) {
        // Garde des candidats distincts.
        const near = out.findIndex((c) => Math.abs(c.o - o) < p / 3 && Math.abs(c.p - p) < 1.5);
        if (near >= 0) {
          if (out[near].s < s) out[near] = { o, p, s };
        } else out.push({ o, p, s });
        out.sort((a, b) => b.s - a.s);
        if (out.length > top) out.pop();
      }
    }
  }
  return out;
}

export function findGrid(img: Img): Grid | null {
  const { col, row } = profiles(img);
  const minSide = Math.min(img.width, img.height);
  const minP = Math.max(8, minSide / 40);
  const maxP = minSide / 8;
  const xs = bestLines(col, minP, maxP, 8);
  const ys = bestLines(row, minP, maxP, 8);
  const top = xs[0] && ys[0] ? xs[0].s / img.height + ys[0].s / img.width : 1;
  let best: Grid | null = null;
  for (const a of xs)
    for (const b of ys) {
      if (Math.abs(a.p - b.p) / Math.max(a.p, b.p) > 0.06) continue;
      const size = (a.p + b.p) / 2;
      const edges = (a.s / img.height + b.s / img.width) / top;
      // Le damier doit alterner deux couleurs : un cadre décalé d'une case inclut une rangée hors de l'échiquier.
      const checker = checkerScore(img, a.o, b.o, size);
      const score = checker * 2 + edges * 0.5 + (size / maxP) * 0.1;
      if (!best || score > best.score) best = { x: a.o, y: b.o, size, score };
    }
  return best;
}

/** Part des cases dont la couleur de fond correspond à l'alternance clair/foncé attendue (0 à 1). */
function checkerScore(img: Img, x0: number, y0: number, size: number): number {
  const colors: [number, number, number][] = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const pts = [0.1, 0.9].flatMap((u) => [0.1, 0.9].map((v) => pixel(img, x0 + (f + u) * size, y0 + (r + v) * size)));
      colors.push([0, 1, 2].map((c) => median(pts.map((p) => p[c]))) as [number, number, number]);
    }
  const mean = (parity: number) => [0, 1, 2].map((c) => median(colors.filter((_, i) => ((i >> 3) + (i & 7)) % 2 === parity).map((p) => p[c])));
  const A = mean(0);
  const B = mean(1);
  const d = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  if (d(A, B) < 12) return 0;
  let ok = 0;
  colors.forEach((c, i) => {
    const own = ((i >> 3) + (i & 7)) % 2 === 0 ? A : B;
    const other = own === A ? B : A;
    if (d(c, own) < d(c, other)) ok++;
  });
  return ok / 64;
}

function pixel(img: Img, x: number, y: number): [number, number, number] {
  const i = (Math.min(img.height - 1, Math.max(0, Math.round(y))) * img.width + Math.min(img.width - 1, Math.max(0, Math.round(x)))) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1] ?? 0;
}

/** Silhouette de la pièce d'une case (S × S), fond = pixels proches de la couleur du pourtour, reliés au bord. */
export function squareSilhouette(img: Img, x0: number, y0: number, size: number, S = 40) {
  const px: [number, number, number][] = [];
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) px.push(pixel(img, x0 + ((i + 0.5) / S) * size, y0 + ((j + 0.5) / S) * size));
  // Couleur du fond : médiane d'un anneau près du bord (les pièces le touchent rarement).
  const ring: [number, number, number][] = [];
  for (let j = 1; j < S - 1; j++)
    for (let i = 1; i < S - 1; i++) {
      const d = Math.min(i, j, S - 1 - i, S - 1 - j);
      if (d >= 1 && d <= 3) ring.push(px[j * S + i]);
    }
  const bg = [0, 1, 2].map((c) => median(ring.map((p) => p[c])));
  const diff = px.map((p) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]) > 45);
  // Remplissage depuis le pourtour : ce qui n'est pas atteint fait partie de la pièce (trous bouchés).
  const outside = new Uint8Array(S * S);
  const stack: number[] = [];
  for (let k = 0; k < S; k++) stack.push(k, (S - 1) * S + k, k * S, k * S + S - 1);
  while (stack.length) {
    const k = stack.pop()!;
    if (outside[k] || diff[k]) continue;
    outside[k] = 1;
    const i = k % S;
    const j = (k / S) | 0;
    if (i > 0) stack.push(k - 1);
    if (i < S - 1) stack.push(k + 1);
    if (j > 0) stack.push(k - S);
    if (j < S - 1) stack.push(k + S);
  }
  // Écarte les petits blocs excentrés (coordonnées imprimées dans les coins) ; garde les morceaux
  // de la pièce, qu'un trait intérieur clair peut couper en deux.
  const label = new Int32Array(S * S);
  const comps: { size: number; cx: number; cy: number }[] = [{ size: 0, cx: 0, cy: 0 }];
  for (let k0 = 0; k0 < S * S; k0++) {
    if (outside[k0] || label[k0]) continue;
    const id = comps.length;
    let size = 0;
    let sx = 0;
    let sy = 0;
    const st = [k0];
    label[k0] = id;
    while (st.length) {
      const k = st.pop()!;
      size++;
      const i = k % S;
      const j = (k / S) | 0;
      sx += i;
      sy += j;
      for (const n of [i > 0 ? k - 1 : -1, i < S - 1 ? k + 1 : -1, j > 0 ? k - S : -1, j < S - 1 ? k + S : -1])
        if (n >= 0 && !outside[n] && !label[n]) {
          label[n] = id;
          st.push(n);
        }
    }
    comps.push({ size, cx: sx / size / S, cy: sy / size / S });
  }
  const largest = Math.max(0, ...comps.map((c) => c.size));
  const keep = comps.map((c) => c.size > 0 && (c.size >= largest * 0.5 || (c.cx > 0.25 && c.cx < 0.75 && c.size >= 4)));
  for (let k = 0; k < S * S; k++) if (!keep[label[k]]) outside[k] = 1;
  // On ignore la bande du bord (surlignage) pour mesurer la pièce.
  const mask = new Uint8Array(S * S);
  let dark = 0;
  let count = 0;
  let bright = 0;
  let minX = S;
  let minY = S;
  let maxX = -1;
  let maxY = -1;
  const m = Math.round(S * 0.08);
  for (let j = m; j < S - m; j++)
    for (let i = m; i < S - m; i++) {
      const k = j * S + i;
      if (outside[k]) continue;
      mask[k] = 1;
      count++;
      const [r, g, b] = px[k];
      // Couleur lue au centre de la pièce (les annotations se placent dans les coins).
      if (i > S * 0.25 && i < S * 0.75 && j > S * 0.3) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum > 150) bright++;
        else if (lum < 100) dark++;
      }
      minX = Math.min(minX, i);
      maxX = Math.max(maxX, i);
      minY = Math.min(minY, j);
      maxY = Math.max(maxY, j);
    }
  return { mask, S, count, fill: count / ((S - 2 * m) * (S - 2 * m)), brightFrac: bright + dark ? bright / (bright + dark) : 0, box: { minX, minY, maxX, maxY } };
}

/** Recadre une silhouette sur sa boîte englobante et l'étire en MASK_N × MASK_N. */
export function normalizeMask(mask: Uint8Array, S: number, box: { minX: number; minY: number; maxX: number; maxY: number }): Mask {
  const out = new Uint8Array(MASK_N * MASK_N);
  const w = box.maxX - box.minX + 1;
  const h = box.maxY - box.minY + 1;
  for (let j = 0; j < MASK_N; j++)
    for (let i = 0; i < MASK_N; i++) {
      const x = box.minX + Math.floor(((i + 0.5) / MASK_N) * w);
      const y = box.minY + Math.floor(((j + 0.5) / MASK_N) * h);
      out[j * MASK_N + i] = mask[y * S + x];
    }
  return out;
}

function iou(a: Mask, b: Mask) {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.length; i++) {
    inter += a[i] & b[i];
    uni += a[i] | b[i];
  }
  return uni ? inter / uni : 0;
}

export function readSquare(img: Img, x0: number, y0: number, size: number, templates: Templates): SquareRead {
  const s = squareSilhouette(img, x0, y0, size);
  if (s.fill < 0.07 || s.box.maxX - s.box.minX < s.S * 0.2) return { piece: null, confidence: 1 - s.fill / 0.07 };
  const norm = normalizeMask(s.mask, s.S, s.box);
  const heightRatio = (s.box.maxY - s.box.minY + 1) / s.S;
  let best = { type: 'p', score: -1 };
  let second = -1;
  for (const [type, t] of Object.entries(templates)) {
    let score = iou(norm, t);
    // Le pion est nettement plus petit que les autres pièces.
    if (type === 'p' && heightRatio > 0.78) score -= 0.15;
    if (type !== 'p' && heightRatio < 0.62) score -= 0.15;
    if (score > best.score) {
      second = best.score;
      best = { type, score };
    } else if (score > second) second = score;
  }
  const white = s.brightFrac > 0.45;
  return { piece: white ? best.type.toUpperCase() : best.type, confidence: Math.max(0, Math.min(1, (best.score - second) * 4 + 0.3)) };
}

export function recognize(img: Img, templates: Templates, grid = findGrid(img)): Recognition | null {
  if (!grid) return null;
  const squares: SquareRead[][] = [];
  for (let r = 0; r < 8; r++) {
    const row: SquareRead[] = [];
    for (let f = 0; f < 8; f++) row.push(readSquare(img, grid.x + f * grid.size, grid.y + r * grid.size, grid.size, templates));
    squares.push(row);
  }
  // Orientation : les pions blancs (et le roi blanc) sont en général dans la moitié du bas.
  let bottomWhite = 0;
  let topWhite = 0;
  squares.forEach((row, r) =>
    row.forEach((s) => {
      if (!s.piece) return;
      const w = s.piece === s.piece.toUpperCase() ? 1 : -1;
      if (r >= 4) bottomWhite += w;
      else topWhite += w;
    }),
  );
  return { grid, squares, whiteAtBottom: bottomWhite >= topWhite };
}

/** Partie « placement » d'une FEN à partir de la lecture (orientation corrigée). */
export function placementFrom(squares: (string | null)[][], whiteAtBottom: boolean): string {
  const rows = whiteAtBottom ? squares : [...squares].reverse().map((r) => [...r].reverse());
  return rows
    .map((row) => {
      let s = '';
      let empty = 0;
      for (const p of row) {
        if (!p) empty++;
        else {
          if (empty) s += empty;
          empty = 0;
          s += p;
        }
      }
      return s + (empty || '');
    })
    .join('/');
}

/** Roques plausibles d'après la place des rois et des tours. */
export function castlingFor(placement: string): string {
  const rows = placement.split('/').map((r) => r.replace(/\d/g, (d) => '.'.repeat(Number(d))));
  const at = (sq: string) => rows[8 - Number(sq[1])]?.['abcdefgh'.indexOf(sq[0])];
  let c = '';
  if (at('e1') === 'K' && at('h1') === 'R') c += 'K';
  if (at('e1') === 'K' && at('a1') === 'R') c += 'Q';
  if (at('e8') === 'k' && at('h8') === 'r') c += 'k';
  if (at('e8') === 'k' && at('a8') === 'r') c += 'q';
  return c || '-';
}
