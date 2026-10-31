// Clé compacte d'une position (placement, trait, roques, prise en passant), hachage FNV-1a 32 bits en base 36.
export function positionKey(fen) {
  const s = fen.split(' ').slice(0, 4).join(' ');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
