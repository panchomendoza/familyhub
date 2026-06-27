import { create } from "zustand";
import type { User, Family } from "@familyhub/types";

interface AuthState {
  user:              User | null;
  currentFamily:     Family | null;
  families:          Family[];
  isLoading:         boolean;
  isHydrated:        boolean;
  /** ISO string: cuándo expira el access token actual */
  accessExpiresAt:   string | null;
  /** ISO string: límite absoluto de la sesión (sin extensión en auto-refresh) */
  sessionExpiresAt:  string | null;
  /** true si el usuario ya usó su única renovación manual */
  renewalUsed:       boolean;

  setUser:             (user: User | null) => void;
  setCurrentFamily:    (family: Family | null) => void;
  setFamilies:         (families: Family[]) => void;
  setLoading:          (loading: boolean) => void;
  setHydrated:         (v: boolean) => void;
  setAccessExpiresAt:  (v: string | null) => void;
  setSessionExpiresAt: (v: string | null) => void;
  setRenewalUsed:      (v: boolean) => void;
  logout:              () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:             null,
  currentFamily:    null,
  families:         [],
  isLoading:        true,
  isHydrated:       false,
  accessExpiresAt:  null,
  sessionExpiresAt: null,
  renewalUsed:      false,

  setUser:             (user)             => set({ user }),
  setCurrentFamily:    (family)           => set({ currentFamily: family }),
  setFamilies:         (families)         => set({ families }),
  setLoading:          (isLoading)        => set({ isLoading }),
  setHydrated:         (isHydrated)       => set({ isHydrated }),
  setAccessExpiresAt:  (accessExpiresAt)  => set({ accessExpiresAt }),
  setSessionExpiresAt: (sessionExpiresAt) => set({ sessionExpiresAt }),
  setRenewalUsed:      (renewalUsed)      => set({ renewalUsed }),

  logout: () =>
    set({
      user:             null,
      currentFamily:    null,
      families:         [],
      isLoading:        false,
      isHydrated:       true,
      accessExpiresAt:  null,
      sessionExpiresAt: null,
      renewalUsed:      false,
    }),
}));
