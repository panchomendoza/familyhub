import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/* ════════════════════════════════════
   Types
   ════════════════════════════════════ */

export interface StockItem {
  id:          string;
  familyId:    string;
  categoryId:  string;
  name:        string;
  quantity:    number;
  minimum:     number;
  unit:        string;
  location:    string | null;
  barcodes:    string[];
  notes:       string | null;
  createdAt:   string;
  updatedAt:   string;
}

export interface StockCategory {
  id:       string;
  familyId: string;
  label:    string;
  icon:     string;
  color:    string;
  order:    number;
  items:    StockItem[];
}

export interface ItemInput {
  categoryId:  string;
  name:        string;
  quantity?:   number;
  minimum?:    number;
  unit?:       string;
  location?:   string | null;
  barcodes?:   string[];
  notes?:      string | null;
}

export interface CatInput {
  label: string;
  icon:  string;
  color: string;
}

/* ════════════════════════════════════
   Query key factory
   ════════════════════════════════════ */

export const stockKeys = {
  categories:    (fid: string) => ["stock-cats",  fid] as const,
  items:         (fid: string) => ["stock-items", fid] as const,
  shoppingList:  (fid: string) => ["stock-lista", fid] as const,
};

/* ════════════════════════════════════
   Cache helpers
   ════════════════════════════════════ */

type QC = ReturnType<typeof useQueryClient>;

/** Actualiza un ítem en la lista plana y dentro de su categoría anidada */
function patchItem(qc: QC, familyId: string, item: StockItem) {
  qc.setQueryData<StockItem[]>(stockKeys.items(familyId), old =>
    old?.map(i => i.id === item.id ? item : i) ?? old,
  );
  qc.setQueryData<StockCategory[]>(stockKeys.categories(familyId), old =>
    old?.map(cat => ({
      ...cat,
      items: cat.items.map(i => i.id === item.id ? item : i),
    })) ?? old,
  );
}

/** Agrega un ítem a la lista plana y a su categoría */
function addItem(qc: QC, familyId: string, item: StockItem) {
  qc.setQueryData<StockItem[]>(stockKeys.items(familyId), old =>
    old ? [...old, item] : [item],
  );
  qc.setQueryData<StockCategory[]>(stockKeys.categories(familyId), old =>
    old?.map(cat =>
      cat.id === item.categoryId
        ? { ...cat, items: [...cat.items, item] }
        : cat,
    ) ?? old,
  );
}

/** Elimina un ítem de la lista plana y de su categoría */
function removeItem(qc: QC, familyId: string, itemId: string) {
  qc.setQueryData<StockItem[]>(stockKeys.items(familyId), old =>
    old?.filter(i => i.id !== itemId) ?? old,
  );
  qc.setQueryData<StockCategory[]>(stockKeys.categories(familyId), old =>
    old?.map(cat => ({
      ...cat,
      items: cat.items.filter(i => i.id !== itemId),
    })) ?? old,
  );
}

/* ════════════════════════════════════
   Queries
   ════════════════════════════════════ */

export function useStockCategories(familyId: string | undefined) {
  return useQuery({
    queryKey: stockKeys.categories(familyId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<{ categories: StockCategory[] }>(
        `/stock/${familyId}/categories`
      );
      return data.categories;
    },
    enabled: !!familyId,
  });
}

export function useStockItems(familyId: string | undefined) {
  return useQuery({
    queryKey: stockKeys.items(familyId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<{ items: StockItem[] }>(
        `/stock/${familyId}/items`
      );
      return data.items;
    },
    enabled: !!familyId,
  });
}

/* ════════════════════════════════════
   Mutations — Categories
   ════════════════════════════════════ */

export function useSeedStockCategories(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ categories: StockCategory[] }>(`/stock/${familyId}/categories/seed`, {}),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      // Normalizar por si el API no incluye items (defensivo)
      const normalized = data.categories.map(c => ({ ...c, items: c.items ?? [] }));
      qc.setQueryData<StockCategory[]>(stockKeys.categories(familyId), normalized);
    },
  });
}

export function useCreateStockCategory(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CatInput) =>
      api.post<{ category: Omit<StockCategory, "items"> }>(`/stock/${familyId}/categories`, input),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      const newCat: StockCategory = { ...data.category, items: [] };
      qc.setQueryData<StockCategory[]>(stockKeys.categories(familyId), old =>
        old ? [...old, newCat] : [newCat],
      );
    },
  });
}

export function useDeleteStockCategory(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (catId: string) => api.delete(`/stock/${familyId}/categories/${catId}`),
    onSuccess: (_res, catId) => {
      if (!familyId) return;
      qc.setQueryData<StockCategory[]>(stockKeys.categories(familyId), old =>
        old?.filter(cat => cat.id !== catId) ?? old,
      );
    },
  });
}

/* ════════════════════════════════════
   Mutations — Items
   ════════════════════════════════════ */

export function useCreateStockItem(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ItemInput) =>
      api.post<{ item: StockItem }>(`/stock/${familyId}/items`, input),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      addItem(qc, familyId, data.item);
    },
  });
}

export function useUpdateStockItem(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ItemInput> }) =>
      api.patch<{ item: StockItem }>(`/stock/${familyId}/items/${id}`, data),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      patchItem(qc, familyId, data.item);
    },
  });
}

export function useAdjustQuantity(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      api.patch<{ item: StockItem }>(`/stock/${familyId}/items/${id}/cantidad`, { delta }),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      patchItem(qc, familyId, data.item);
    },
  });
}

export function useDeleteStockItem(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/stock/${familyId}/items/${id}`),
    onSuccess: (_res, itemId) => {
      if (!familyId) return;
      removeItem(qc, familyId, itemId);
    },
  });
}

export function useAddBarcode(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, barcode }: { id: string; barcode: string }) =>
      api.patch<{ item: StockItem }>(`/stock/${familyId}/items/${id}/barcodes`, { barcode }),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      patchItem(qc, familyId, data.item);
    },
  });
}

export async function searchStockItems(familyId: string, q: string): Promise<StockItem[]> {
  const { data } = await api.get<{ items: StockItem[] }>(
    `/stock/${familyId}/items/search?q=${encodeURIComponent(q)}`
  );
  return data.items;
}

/* ════════════════════════════════════
   Stock status helpers
   ════════════════════════════════════ */

export function stockStatus(item: Pick<StockItem, "quantity" | "minimum">) {
  if (item.quantity <= 0)           return { label: "Sin stock",  color: "#F74F7B", bg: "#FFF0F3", dot: "#F74F7B" };
  if (item.quantity < item.minimum) return { label: "Bajo stock", color: "#F7874F", bg: "#FFF5EE", dot: "#F7874F" };
  return                                   { label: "OK",         color: "#34C78A", bg: "#F0FBF6", dot: "#34C78A" };
}
