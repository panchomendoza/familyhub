// ══════════════════════════════════════════════════════════════════════════════
//   useVehicles.ts — React Query hooks para el dashboard de vehículos
//
//   Estrategia de cache: setQueryData inmediato en onSuccess (sin invalidateQueries)
//   → la UI se actualiza al instante, sin esperar un GET de refetch.
// ══════════════════════════════════════════════════════════════════════════════

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/* ════════════════════════════════════
   Types (espejo del schema Prisma)
   ════════════════════════════════════ */

export type VehicleType   = "car" | "motorcycle" | "truck" | "van" | "other";
export type FuelType      = "gasoline" | "diesel" | "electric" | "hybrid" | "gas";
export type TransType     = "manual" | "automatic";

export interface Vehicle {
  id:           string;
  familyId:     string;
  type:         VehicleType;
  brand:        string;
  model:        string;
  year:         number;
  engineCC:     number | null;
  fuelType:     FuelType | null;
  transmission: TransType | null;
  licensePlate: string;
  vin:          string | null;
  color:        string | null;
  currentKm:    number;
  doors:        number | null;
  sold:         boolean;
  soldDate:     string | null;
  soldPrice:    number | null;
  createdAt:    string;
  updatedAt:    string;
}

export interface VehicleWithRelations extends Vehicle {
  maintenances: VehicleMaintenance[];
  documents:    VehicleDocument[];
  expenses:     VehicleExpense[];
}

export interface VehicleMaintenance {
  id:          string;
  vehicleId:   string;
  type:        string;
  description: string;
  date:        string;
  odometer:    number;
  cost:        number | null;
  workshop:    string | null;
  nextKm:      number | null;
  nextDate:    string | null;
  createdAt:   string;
  updatedAt:   string;
}

export interface VehicleDocument {
  id:             string;
  vehicleId:      string;
  type:           string;
  issueDate:      string;
  expiryDate:     string;
  amount:         number | null;
  company:        string | null;
  notes:          string | null;
  attachmentName: string | null;
  attachmentData: string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface VehicleExpense {
  id:          string;
  vehicleId:   string;
  date:        string;
  category:    string;
  description: string;
  amount:      number;
  odometer:    number | null;
  liters:      number | null;
  createdAt:   string;
  updatedAt:   string;
}

/* ════════════════════════════════════
   Input types (para mutations)
   ════════════════════════════════════ */

export interface VehicleInput {
  type:          VehicleType;
  brand:         string;
  model:         string;
  year:          number;
  engineCC?:     number | null;
  fuelType?:     FuelType | null;
  transmission?: TransType | null;
  licensePlate:  string;
  vin?:          string | null;
  color?:        string | null;
  currentKm?:    number;
  doors?:        number | null;
}

export interface MaintenanceInput {
  type:        string;
  description: string;
  date:        string;
  odometer:    number;
  cost?:       number | null;
  workshop?:   string | null;
  nextKm?:     number | null;
  nextDate?:   string | null;
}

export interface DocumentInput {
  type:            string;
  issueDate:       string;
  expiryDate:      string;
  amount?:         number | null;
  company?:        string | null;
  notes?:          string | null;
  attachmentName?: string | null;
  attachmentData?: string | null;
}

export interface ExpenseInput {
  date:         string;
  category:     string;
  description?: string;
  amount:       number;
  odometer?:    number | null;
  liters?:      number | null;
}

/* ════════════════════════════════════
   Query key factory
   ════════════════════════════════════ */

export const vehicleKeys = {
  list:   (fid: string)              => ["vehicles", fid]      as const,
  detail: (fid: string, vid: string) => ["vehicles", fid, vid] as const,
};

/* ════════════════════════════════════
   Cache helpers — actualizan el cache
   inmediatamente con los datos del
   response, sin disparar un GET extra.
   ════════════════════════════════════ */

type QC = ReturnType<typeof useQueryClient>;

/** Reemplaza un vehículo en la lista y fusiona sus campos en el detalle */
function patchVehicleInCache(qc: QC, familyId: string, updated: Vehicle) {
  qc.setQueryData<Vehicle[]>(vehicleKeys.list(familyId), old =>
    old?.map(v => v.id === updated.id ? updated : v) ?? old,
  );
  qc.setQueryData<VehicleWithRelations>(vehicleKeys.detail(familyId, updated.id), old =>
    old ? { ...old, ...updated } : old,
  );
}

/** Agrega un vehículo recién creado a la lista */
function addVehicleToList(qc: QC, familyId: string, vehicle: Vehicle) {
  qc.setQueryData<Vehicle[]>(vehicleKeys.list(familyId), old =>
    old ? [...old, vehicle] : [vehicle],
  );
}

/** Elimina un vehículo de la lista y borra su detalle del cache */
function removeVehicleFromCache(qc: QC, familyId: string, vehicleId: string) {
  qc.setQueryData<Vehicle[]>(vehicleKeys.list(familyId), old =>
    old?.filter(v => v.id !== vehicleId) ?? old,
  );
  qc.removeQueries({ queryKey: vehicleKeys.detail(familyId, vehicleId) });
}

/** Modifica solo una sub-lista (maintenances / documents / expenses) del detalle */
function patchDetail<K extends "maintenances" | "documents" | "expenses">(
  qc:        QC,
  familyId:  string,
  vehicleId: string,
  key:       K,
  updater:   (old: VehicleWithRelations[K]) => VehicleWithRelations[K],
) {
  qc.setQueryData<VehicleWithRelations>(vehicleKeys.detail(familyId, vehicleId), old => {
    if (!old) return old;
    return { ...old, [key]: updater(old[key]) };
  });
}

/* ════════════════════════════════════
   Queries
   ════════════════════════════════════ */

export function useVehicles(familyId: string | undefined) {
  return useQuery({
    queryKey: vehicleKeys.list(familyId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<{ vehicles: Vehicle[] }>(`/vehicles/${familyId}`);
      return data.vehicles;
    },
    enabled: !!familyId,
  });
}

export function useVehicleDetail(
  familyId:  string | undefined,
  vehicleId: string | undefined,
) {
  return useQuery({
    queryKey: vehicleKeys.detail(familyId ?? "", vehicleId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<{ vehicle: VehicleWithRelations }>(
        `/vehicles/${familyId}/${vehicleId}`,
      );
      return data.vehicle;
    },
    enabled: !!familyId && !!vehicleId,
  });
}

/* ════════════════════════════════════
   Mutations — Vehicles
   ════════════════════════════════════ */

export function useCreateVehicle(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VehicleInput) =>
      api.post<{ vehicle: Vehicle }>(`/vehicles/${familyId}`, input),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      addVehicleToList(qc, familyId, data.vehicle);
    },
  });
}

export function useUpdateVehicle(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, data }: { vehicleId: string; data: Partial<VehicleInput> }) =>
      api.patch<{ vehicle: Vehicle }>(`/vehicles/${familyId}/${vehicleId}`, data),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      patchVehicleInCache(qc, familyId, data.vehicle);
    },
  });
}

export function useUpdateVehicleKm(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, currentKm }: { vehicleId: string; currentKm: number }) =>
      api.patch<{ vehicle: Vehicle }>(`/vehicles/${familyId}/${vehicleId}/km`, { currentKm }),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      patchVehicleInCache(qc, familyId, data.vehicle);
    },
  });
}

export function useSellVehicle(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, soldDate, soldPrice }: {
      vehicleId: string; soldDate: string; soldPrice?: number;
    }) =>
      api.patch<{ vehicle: Vehicle }>(`/vehicles/${familyId}/${vehicleId}/sell`, {
        soldDate,
        ...(soldPrice != null ? { soldPrice } : {}),
      }),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      patchVehicleInCache(qc, familyId, data.vehicle);
    },
  });
}

export function useUnsellVehicle(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: string) =>
      api.patch<{ vehicle: Vehicle }>(`/vehicles/${familyId}/${vehicleId}/unsell`, {}),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      patchVehicleInCache(qc, familyId, data.vehicle);
    },
  });
}

export function useDeleteVehicle(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: string) =>
      api.delete(`/vehicles/${familyId}/${vehicleId}`),
    onSuccess: (_res, vehicleId) => {
      if (!familyId) return;
      removeVehicleFromCache(qc, familyId, vehicleId);
    },
  });
}

/* ════════════════════════════════════
   Mutations — Maintenance
   ════════════════════════════════════ */

export function useCreateMaintenance(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, data }: { vehicleId: string; data: MaintenanceInput }) =>
      api.post<{ record: VehicleMaintenance }>(
        `/vehicles/${familyId}/${vehicleId}/maintenance`, data,
      ),
    onSuccess: ({ data }, { vehicleId }) => {
      if (!familyId) return;
      patchDetail(qc, familyId, vehicleId, "maintenances",
        old => [...old, data.record],
      );
    },
  });
}

export function useUpdateMaintenance(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, recordId, data }: {
      vehicleId: string; recordId: string; data: Partial<MaintenanceInput>;
    }) =>
      api.patch<{ record: VehicleMaintenance }>(
        `/vehicles/${familyId}/${vehicleId}/maintenance/${recordId}`, data,
      ),
    onSuccess: ({ data }, { vehicleId }) => {
      if (!familyId) return;
      patchDetail(qc, familyId, vehicleId, "maintenances",
        old => old.map(m => m.id === data.record.id ? data.record : m),
      );
    },
  });
}

export function useDeleteMaintenance(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, recordId }: { vehicleId: string; recordId: string }) =>
      api.delete(`/vehicles/${familyId}/${vehicleId}/maintenance/${recordId}`),
    onSuccess: (_res, { vehicleId, recordId }) => {
      if (!familyId) return;
      patchDetail(qc, familyId, vehicleId, "maintenances",
        old => old.filter(m => m.id !== recordId),
      );
    },
  });
}

/* ════════════════════════════════════
   Mutations — Documents
   ════════════════════════════════════ */

export function useCreateDocument(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, data }: { vehicleId: string; data: DocumentInput }) =>
      api.post<{ document: VehicleDocument }>(
        `/vehicles/${familyId}/${vehicleId}/documents`, data,
      ),
    onSuccess: ({ data }, { vehicleId }) => {
      if (!familyId) return;
      patchDetail(qc, familyId, vehicleId, "documents",
        old => [...old, data.document],
      );
    },
  });
}

export function useUpdateDocument(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, docId, data }: {
      vehicleId: string; docId: string; data: Partial<DocumentInput>;
    }) =>
      api.patch<{ document: VehicleDocument }>(
        `/vehicles/${familyId}/${vehicleId}/documents/${docId}`, data,
      ),
    onSuccess: ({ data }, { vehicleId }) => {
      if (!familyId) return;
      patchDetail(qc, familyId, vehicleId, "documents",
        old => old.map(d => d.id === data.document.id ? data.document : d),
      );
    },
  });
}

export function useDeleteDocument(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, docId }: { vehicleId: string; docId: string }) =>
      api.delete(`/vehicles/${familyId}/${vehicleId}/documents/${docId}`),
    onSuccess: (_res, { vehicleId, docId }) => {
      if (!familyId) return;
      patchDetail(qc, familyId, vehicleId, "documents",
        old => old.filter(d => d.id !== docId),
      );
    },
  });
}

/* ════════════════════════════════════
   Mutations — Expenses
   ════════════════════════════════════ */

export function useCreateExpense(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, data }: { vehicleId: string; data: ExpenseInput }) =>
      api.post<{ expense: VehicleExpense }>(
        `/vehicles/${familyId}/${vehicleId}/expenses`, data,
      ),
    onSuccess: ({ data }, { vehicleId }) => {
      if (!familyId) return;
      patchDetail(qc, familyId, vehicleId, "expenses",
        old => [...old, data.expense],
      );
    },
  });
}

export function useUpdateExpense(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, expenseId, data }: {
      vehicleId: string; expenseId: string; data: Partial<ExpenseInput>;
    }) =>
      api.patch<{ expense: VehicleExpense }>(
        `/vehicles/${familyId}/${vehicleId}/expenses/${expenseId}`, data,
      ),
    onSuccess: ({ data }, { vehicleId }) => {
      if (!familyId) return;
      patchDetail(qc, familyId, vehicleId, "expenses",
        old => old.map(e => e.id === data.expense.id ? data.expense : e),
      );
    },
  });
}

export function useDeleteExpense(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, expenseId }: { vehicleId: string; expenseId: string }) =>
      api.delete(`/vehicles/${familyId}/${vehicleId}/expenses/${expenseId}`),
    onSuccess: (_res, { vehicleId, expenseId }) => {
      if (!familyId) return;
      patchDetail(qc, familyId, vehicleId, "expenses",
        old => old.filter(e => e.id !== expenseId),
      );
    },
  });
}
