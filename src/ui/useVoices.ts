import { useEffect, useState } from 'react';
import { allVoices, speechAvailable } from './speech';

/** Voix de l'appareil, mises à jour sur l'événement voiceschanged (Safari les charge tardivement). */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(allVoices);
  useEffect(() => {
    if (!speechAvailable()) return;
    const update = () => setVoices(allVoices());
    update();
    speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, []);
  return voices;
}
