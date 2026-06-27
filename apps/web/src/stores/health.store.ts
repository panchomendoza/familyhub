import { create } from "zustand";

export type TabKey = "Controls" | "Vaccines" | "Exams" | "Visits" | "Attachments" | "Charts";

interface HealthUIState {
  selectedChildId: string | null;
  activeTab:       TabKey;

  setSelectedChild: (id: string) => void;
  setActiveTab:     (tab: TabKey) => void;
}

export const useHealthStore = create<HealthUIState>((set) => ({
  selectedChildId: null,
  activeTab:       "Controls",

  setSelectedChild: (id)  => set({ selectedChildId: id }),
  setActiveTab:     (tab) => set({ activeTab: tab }),
}));
