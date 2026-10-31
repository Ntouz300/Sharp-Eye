const PIECES: Record<string, string> = { K: 'Roi', Q: 'Dame', R: 'Tour', B: 'Fou', N: 'Cavalier' };
const PROMO: Record<string, string> = { Q: 'dame', R: 'tour', B: 'fou', N: 'cavalier' };

/** Coup en SAN anglaise lu à voix haute en français : « Cavalier prend f3, échec ». */
export function spokenSan(san: string): string {
  const check = san.endsWith('#') ? ', mat' : san.includes('+') ? ', échec' : '';
  const s = san.replace(/[+#!?]/g, '');
  if (s === 'O-O') return 'petit roque' + check;
  if (s === 'O-O-O') return 'grand roque' + check;
  const m = /^([KQRBN])?([a-h]?[1-8]?)(x)?([a-h][1-8])(?:=([QRBN]))?$/.exec(s);
  if (!m) return san;
  const [, piece, from, capture, to, promo] = m;
  const parts = [piece ? PIECES[piece] : from && !piece ? `pion ${from}` : 'pion'];
  if (piece && from) parts.push(from);
  parts.push(capture ? `prend ${to}` : to);
  if (promo) parts.push(`promotion en ${PROMO[promo]}`);
  return parts.join(' ') + check;
}

export const speechAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

let voice: SpeechSynthesisVoice | undefined;
function frenchVoice() {
  if (!voice) voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('fr'));
  return voice;
}

/** Lit un texte ; la promesse se résout à la fin de la lecture (ou tout de suite si la synthèse est absente). */
export function speak(text: string): Promise<void> {
  if (!speechAvailable()) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    const v = frenchVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (speechAvailable()) speechSynthesis.cancel();
}
