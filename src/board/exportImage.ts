/** Rend l'échiquier affiché (avec le thème actif) en image PNG. */
export async function boardToPng(svg: SVGSVGElement, size = 1024): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(size));
  clone.setAttribute('height', String(size));
  // Les variables CSS du thème ne sont pas lues dans une image autonome : on les remplace par leurs valeurs.
  const styles = getComputedStyle(document.documentElement);
  let markup = new XMLSerializer().serializeToString(clone);
  markup = markup.replace(/var\((--[\w-]+)\)/g, (_m, name: string) => styles.getPropertyValue(name).trim() || '#888');
  markup = markup.replace('<svg', `<svg style="font-family:system-ui,sans-serif"`);
  // Les animations en cours ne doivent pas figer une pièce à mi-chemin.
  markup = markup.replace(/class="[^"]*piece-moving[^"]*"/g, 'class="piece"').replace(/class="badge"/g, '');
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image impossible à créer'))), 'image/png'));
}
