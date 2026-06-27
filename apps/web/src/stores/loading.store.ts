import { create } from "zustand";

// ══════════════════════════════════════════════════════════════
//   loading.store — contador de peticiones API en vuelo
//
//   Uso:
//     - api.ts llama inc() antes de cada request y dec() en finally
//     - GlobalLoader lee pending > 0 para mostrar el overlay
//     - getState() funciona fuera de React (sin hooks)
// ══════════════════════════════════════════════════════════════

interface LoadingStore {
  /** Número de peticiones activas. 0 = sin carga. */
  pending: number;
  inc: () => void;
  dec: () => void;
}

export const useLoadingStore = create<LoadingStore>((set) => ({
  pending: 0,
  inc: () => set((s) => ({ pending: s.pending + 1 })),
  dec: () => set((s) => ({ pending: Math.max(0, s.pending - 1) })),
}));
