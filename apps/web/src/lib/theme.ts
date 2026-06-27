import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ══════════════════════════════════════════
//   Theme store (Zustand + persist)
// ══════════════════════════════════════════

interface ThemeStore {
  isDark: boolean;
  toggle: () => void;
}

const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      isDark: true,
      toggle: () => set({ isDark: !get().isDark }),
    }),
    { name: "fh-theme" },
  ),
);

// ══════════════════════════════════════════
//   useTheme hook — API pública
// ══════════════════════════════════════════

export function useTheme() {
  const { isDark, toggle } = useThemeStore();

  // Sincroniza la clase <html class="dark"> con el store
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return { isDark, toggle };
}
