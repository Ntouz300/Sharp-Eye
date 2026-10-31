import { PIECE_URL } from '../../board/Board';
import { normalizeMask, type Img, type Templates } from './recognize';

const MAX_SIDE = 720;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Image illisible. Essaie une capture d’écran en PNG ou en JPEG.'));
    im.src = src;
  });
}

/** Charge une image (fichier, photo, capture collée) réduite à 720 px au plus. */
export async function imageFromBlob(blob: Blob): Promise<{ img: Img; url: string; scale: number }> {
  const url = URL.createObjectURL(blob);
  const im = await loadImg(url);
  const scale = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.round(im.naturalWidth * scale);
  const h = Math.round(im.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(im, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { img: { width: w, height: h, data: data.data }, url, scale };
}

let cached: Promise<Templates> | null = null;

/** Silhouettes de référence tirées du jeu de pièces de l'app. */
export function pieceTemplates(): Promise<Templates> {
  cached ??= (async () => {
    const S = 40;
    const out: Templates = {};
    for (const t of ['p', 'n', 'b', 'r', 'q', 'k']) {
      const im = await loadImg(PIECE_URL['w' + t]);
      const c = document.createElement('canvas');
      c.width = S;
      c.height = S;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(im, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      const mask = new Uint8Array(S * S);
      const box = { minX: S, minY: S, maxX: -1, maxY: -1 };
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++)
          if (d[(j * S + i) * 4 + 3] > 100) {
            mask[j * S + i] = 1;
            box.minX = Math.min(box.minX, i);
            box.maxX = Math.max(box.maxX, i);
            box.minY = Math.min(box.minY, j);
            box.maxY = Math.max(box.maxY, j);
          }
      out[t] = normalizeMask(mask, S, box);
    }
    return out;
  })();
  return cached;
}
