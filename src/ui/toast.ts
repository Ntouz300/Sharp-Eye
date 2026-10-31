import { create } from 'zustand';

/** Message bref affiché en bas de l'écran (export réussi, synchro terminée…). */
export const useToast = create<{ message: string | null; show: (m: string | null) => void }>((set) => {
  let t = 0;
  return {
    message: null,
    show: (message) => {
      window.clearTimeout(t);
      set({ message });
      if (message) t = window.setTimeout(() => set({ message: null }), 3500);
    },
  };
});
