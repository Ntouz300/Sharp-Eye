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

const REGIONS: Record<string, string> = { FR: 'France', CA: 'Canada', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg' };
const FRENCH_ORDER = ['fr-FR', 'fr-CA', 'fr-BE', 'fr-CH'];
const norm = (lang: string) => lang.replace('_', '-');

/** Région lisible d'une voix : « France », « Canada »… ou le code de langue. */
export function voiceRegion(v: Pick<SpeechSynthesisVoice, 'lang'>): string {
  const [lang, region] = norm(v.lang).split('-');
  if (lang === 'fr') return REGIONS[region?.toUpperCase()] ?? 'Français';
  return norm(v.lang);
}

export function allVoices(): SpeechSynthesisVoice[] {
  return speechAvailable() ? speechSynthesis.getVoices() : [];
}

/** Voix françaises, de France d'abord, puis Canada, Belgique, Suisse. */
export function frenchVoices(list = allVoices()): SpeechSynthesisVoice[] {
  const rank = (v: SpeechSynthesisVoice) => {
    const i = FRENCH_ORDER.indexOf(norm(v.lang));
    return i < 0 ? FRENCH_ORDER.length : i;
  };
  return list.filter((v) => norm(v.lang).startsWith('fr')).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * Voix à utiliser : celle choisie si elle existe encore sur l'appareil, sinon la première voix française.
 * La liste est relue à chaque phrase : Safari charge ses voix après le démarrage.
 */
export function resolveVoice(voiceURI: string, list = allVoices()): { voice?: SpeechSynthesisVoice; missing: boolean } {
  const chosen = voiceURI ? list.find((v) => v.voiceURI === voiceURI) : undefined;
  return { voice: chosen ?? frenchVoices(list)[0], missing: !!voiceURI && list.length > 0 && !chosen };
}

let prefs = { voiceURI: '', rate: 1.05 };
/** Voix et vitesse choisies dans les Réglages. */
export function setSpeechPrefs(p: { voiceURI: string; rate: number }) {
  prefs = p;
}

/** Lit un texte ; la promesse se résout à la fin de la lecture (ou tout de suite si la synthèse est absente). */
export function speak(text: string, override?: { voiceURI?: string; rate?: number }): Promise<void> {
  if (!speechAvailable()) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const { voice } = resolveVoice(override?.voiceURI ?? prefs.voiceURI);
    u.lang = voice?.lang ?? 'fr-FR';
    if (voice) u.voice = voice;
    u.rate = override?.rate ?? prefs.rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (speechAvailable()) speechSynthesis.cancel();
}

/** Phrase d'exemple du bouton « Écouter ». */
export const SAMPLE_SENTENCE = 'Cavalier f3. Imprécision. Mieux valait d4.';
