import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Medicine, TreatmentPlan } from "@familyhub/types";

/* ════════════════════════════════════
   Input types (payloads del API)
   ════════════════════════════════════ */

export interface MedicineInput {
  name:                  string;
  categoryId:            string;
  dosage?:               string;
  quantity?:             number;
  minimum?:              number;
  unit?:                 string;
  expiryDate:            string;  // "YYYY-MM-DD"
  location?:             string;
  forMember?:            string;
  frequencyHours?:       number | null;
  indications?:          string | null;
  requiresPrescription?: boolean;
  disposed?:             boolean;
  notes?:                string | null;
}

export interface PlanEntryInput {
  medicineId:     string;
  frequencyHours: number;
  reminderTimes:  string[];
  unitsPerDose:   number;
  notes?:         string | null;
}

export interface PlanInput {
  name:          string;
  forMember?:    string;
  prescribedBy?: string | null;
  startDate:     string;         // "YYYY-MM-DD"
  days:          number | null;  // null = crónico
  notes?:        string | null;
  archived?:     boolean;
  entries:       PlanEntryInput[];
}

/* ════════════════════════════════════
   Query key factory
   ════════════════════════════════════ */

export const medicineKeys = {
  items: (fid: string) => ["medicines-items", fid] as const,
  plans: (fid: string) => ["medicines-plans", fid] as const,
};

/* ════════════════════════════════════
   Cache helpers
   ════════════════════════════════════ */

type QC = ReturnType<typeof useQueryClient>;

function patchMedicine(qc: QC, familyId: string, item: Medicine) {
  qc.setQueryData<Medicine[]>(medicineKeys.items(familyId), old =>
    old?.map(m => m.id === item.id ? item : m) ?? old,
  );
}

/* ════════════════════════════════════
   Queries
   ════════════════════════════════════ */

export function useMedicines(familyId: string | undefined) {
  return useQuery({
    queryKey: medicineKeys.items(familyId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<{ items: Medicine[] }>(`/medicines/${familyId}/items`);
      return data.items;
    },
    enabled: !!familyId,
  });
}

export function useTreatmentPlans(familyId: string | undefined) {
  return useQuery({
    queryKey: medicineKeys.plans(familyId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<{ plans: TreatmentPlan[] }>(`/medicines/${familyId}/plans`);
      return data.plans;
    },
    enabled: !!familyId,
  });
}

/* ════════════════════════════════════
   Mutations — Medicines
   ════════════════════════════════════ */

export function useCreateMedicine(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MedicineInput) =>
      api.post<{ item: Medicine }>(`/medicines/${familyId}/items`, input),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      qc.setQueryData<Medicine[]>(medicineKeys.items(familyId), old =>
        old ? [...old, data.item] : [data.item],
      );
    },
  });
}

export function useUpdateMedicine(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<MedicineInput> }) =>
      api.patch<{ item: Medicine }>(`/medicines/${familyId}/items/${id}`, data),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      patchMedicine(qc, familyId, data.item);
    },
  });
}

export function useAdjustMedicineQuantity(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      api.patch<{ item: Medicine }>(`/medicines/${familyId}/items/${id}/cantidad`, { delta }),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      patchMedicine(qc, familyId, data.item);
    },
  });
}

export function useDeleteMedicine(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/medicines/${familyId}/items/${id}`),
    onSuccess: (_res, itemId) => {
      if (!familyId) return;
      qc.setQueryData<Medicine[]>(medicineKeys.items(familyId), old =>
        old?.filter(m => m.id !== itemId) ?? old,
      );
      // Las entries del medicamento se eliminan en cascada — refrescar planes
      qc.invalidateQueries({ queryKey: medicineKeys.plans(familyId) });
    },
  });
}

/* ════════════════════════════════════
   Mutations — Treatment plans
   ════════════════════════════════════ */

export function useCreatePlan(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanInput) =>
      api.post<{ plan: TreatmentPlan }>(`/medicines/${familyId}/plans`, input),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      qc.setQueryData<TreatmentPlan[]>(medicineKeys.plans(familyId), old =>
        old ? [data.plan, ...old] : [data.plan],
      );
      // El backend descuenta stock al crear planes finitos — refrescar medicinas
      if (data.plan.days !== null) {
        qc.invalidateQueries({ queryKey: medicineKeys.items(familyId) });
      }
    },
  });
}

export function useUpdatePlan(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PlanInput> }) =>
      api.patch<{ plan: TreatmentPlan }>(`/medicines/${familyId}/plans/${id}`, data),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      qc.setQueryData<TreatmentPlan[]>(medicineKeys.plans(familyId), old =>
        old?.map(p => p.id === data.plan.id ? data.plan : p) ?? old,
      );
    },
  });
}

export function useDeletePlan(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/medicines/${familyId}/plans/${id}`),
    onSuccess: (_res, planId) => {
      if (!familyId) return;
      qc.setQueryData<TreatmentPlan[]>(medicineKeys.plans(familyId), old =>
        old?.filter(p => p.id !== planId) ?? old,
      );
    },
  });
}
