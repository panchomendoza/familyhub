import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ExpenseCategory } from "@familyhub/types";

/* ════════════════════════════════════
   Extended types
   ════════════════════════════════════ */

export interface ExpenseWithCategory {
  id:                  string;
  monthId:             string;
  categoryId:          string | null;
  name:                string;
  bank:                string;
  amount:              number;
  notes:               string | null;
  installments:        number;
  currentInstallment:  number;
  paid:                boolean;
  installmentGroupId:  string | null;
  recurring:           boolean;
  recurringUntil:      string | null;  // "YYYY-MM"
  createdAt:           string;
  category:            ExpenseCategory | null;
}

export interface MonthlyExpensesDetail {
  id:       string;
  familyId: string;
  year:     number;
  month:    number;
  income:   number;
  closed:   boolean;
  expenses: ExpenseWithCategory[];
}

export interface ExpenseInput {
  categoryId?: string | null;
  name:        string;
  bank?:       string;
  amount:      number;
  notes?:      string | null;
  installments?: number;
  paid?:       boolean;
  recurring?:      boolean;
  recurringUntil?: string | null;  // "YYYY-MM"
}

export interface CategoryInput {
  label: string;
  icon:  string;
  color: string;
}

export interface BankRecord {
  id:    string;
  name:  string;
  order: number;
}

export interface BankInput {
  name:   string;
  order?: number;
}

/* ════════════════════════════════════
   Query key factory
   ════════════════════════════════════ */

export const expensesKeys = {
  categories: (fid: string)                       => ["expenses-cat",    fid]        as const,
  banks:      (fid: string)                       => ["expenses-banks",  fid]        as const,
  month:      (fid: string, y: number, m: number) => ["expenses-month",  fid, y, m] as const,
  months:     (fid: string)                       => ["expenses-months", fid]        as const,
};

/* ════════════════════════════════════
   Cache helpers
   ════════════════════════════════════ */

type QC = ReturnType<typeof useQueryClient>;

/**
 * Enriquece un expense (sin category) con la category del cache.
 * La API de mutaciones devuelve expenses sin el join de category,
 * así que lo buscamos en el cache de categories.
 */
function enrichExpense(
  qc:       QC,
  familyId: string,
  expense:  Omit<ExpenseWithCategory, "category"> & { categoryId: string | null },
): ExpenseWithCategory {
  const cats = qc.getQueryData<ExpenseCategory[]>(expensesKeys.categories(familyId));
  const category = cats?.find(c => c.id === expense.categoryId) ?? null;
  return { ...expense, category };
}

/** Invalida los caches de todos los meses menos el activo (cuotas/fijos tocan meses futuros) */
function invalidateOtherMonths(qc: QC, familyId: string, year: number, month: number) {
  qc.invalidateQueries({
    predicate: q =>
      q.queryKey[0] === "expenses-month" &&
      q.queryKey[1] === familyId &&
      !(q.queryKey[2] === year && q.queryKey[3] === month),
  });
}

/* ════════════════════════════════════
   Queries
   ════════════════════════════════════ */

export function useCategories(familyId: string | undefined) {
  return useQuery({
    queryKey: expensesKeys.categories(familyId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<{ categories: ExpenseCategory[] }>(
        `/expenses/${familyId}/categories`
      );
      return data.categories;
    },
    enabled: !!familyId,
  });
}

export function useMonthExpenses(
  familyId: string | undefined,
  year: number,
  month: number
) {
  return useQuery({
    queryKey: expensesKeys.month(familyId ?? "", year, month),
    queryFn:  async () => {
      const { data } = await api.get<{ month: MonthlyExpensesDetail }>(
        `/expenses/${familyId}/months/${year}/${month + 1}`
      );
      return data.month;
    },
    enabled: !!familyId,
  });
}

export function useMonths(familyId: string | undefined) {
  return useQuery({
    queryKey: expensesKeys.months(familyId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<{ months: MonthlyExpensesDetail[] }>(
        `/expenses/${familyId}/months`
      );
      return data.months;
    },
    enabled: !!familyId,
  });
}

/* ════════════════════════════════════
   Mutations — Income
   ════════════════════════════════════ */

export function useUpdateIncome(
  familyId: string | undefined,
  year: number,
  month: number
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (income: number) =>
      api.patch(`/expenses/${familyId}/months/${year}/${month + 1}`, { income }),
    onSuccess: (_res, income) => {
      if (!familyId) return;
      // Actualizar campo income en el cache del mes actual
      qc.setQueryData<MonthlyExpensesDetail>(expensesKeys.month(familyId, year, month), old =>
        old ? { ...old, income } : old,
      );
      // Months list: invalidar en background (sidebar de navegación, no crítico)
      qc.invalidateQueries({ queryKey: expensesKeys.months(familyId) });
    },
  });
}

/* ════════════════════════════════════
   Mutations — Expenses CRUD
   ════════════════════════════════════ */

export function useCreateExpense(
  familyId: string | undefined,
  year: number,
  month: number
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseInput) =>
      api.post<{ expenses: (Omit<ExpenseWithCategory, "category"> & { categoryId: string | null })[] }>(
        `/expenses/${familyId}/months/${year}/${month + 1}/expenses`, input
      ),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      // Con cuotas el API devuelve una expense POR MES (mes actual + futuros).
      // Al cache de este mes solo se agregan las que pertenecen a él.
      qc.setQueryData<MonthlyExpensesDetail>(expensesKeys.month(familyId, year, month), old => {
        if (!old) return old;
        const ofThisMonth = data.expenses.filter(e => e.monthId === old.id);
        // La API devuelve expenses SIN el join de category → enriquecemos desde cache
        return { ...old, expenses: [...old.expenses, ...ofThisMonth.map(e => enrichExpense(qc, familyId, e))] };
      });
      // Cuotas futuras o copias de gasto fijo pueden haber caído en meses ya cargados → refrescarlos
      if (data.expenses.length > 1 || data.expenses.some(e => e.recurring)) {
        invalidateOtherMonths(qc, familyId, year, month);
      }
      qc.invalidateQueries({ queryKey: expensesKeys.months(familyId) });
    },
  });
}

export function useUpdateExpense(
  familyId: string | undefined,
  year: number,
  month: number
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExpenseInput> }) =>
      api.patch<{ expense: Omit<ExpenseWithCategory, "category"> & { categoryId: string | null } }>(
        `/expenses/${familyId}/expenses/${id}`, data
      ),
    onSuccess: ({ data }, { data: input }) => {
      if (!familyId) return;
      const updated = enrichExpense(qc, familyId, data.expense);
      qc.setQueryData<MonthlyExpensesDetail>(expensesKeys.month(familyId, year, month), old =>
        old
          ? { ...old, expenses: old.expenses.map(e => e.id === updated.id ? updated : e) }
          : old,
      );
      // Editar un gasto fijo (o quitarle la recurrencia) sincroniza copias en meses futuros
      if (data.expense.recurring || input.recurring !== undefined) {
        invalidateOtherMonths(qc, familyId, year, month);
      }
      qc.invalidateQueries({ queryKey: expensesKeys.months(familyId) });
    },
  });
}

export function useTogglePaid(
  familyId: string | undefined,
  year: number,
  month: number
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) =>
      api.patch<{ expense: Omit<ExpenseWithCategory, "category"> & { categoryId: string | null } }>(
        `/expenses/${familyId}/expenses/${expenseId}/paid`, {}
      ),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      qc.setQueryData<MonthlyExpensesDetail>(expensesKeys.month(familyId, year, month), old => {
        if (!old) return old;
        return {
          ...old,
          expenses: old.expenses.map(e =>
            // Conservar la category que ya tenemos en cache (no cambia al hacer toggle)
            e.id === data.expense.id ? { ...data.expense, category: e.category } : e
          ),
        };
      });
      qc.invalidateQueries({ queryKey: expensesKeys.months(familyId) });
    },
  });
}

export function useDeleteExpense(
  familyId: string | undefined,
  year: number,
  month: number
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, group }: { id: string; group?: boolean }) =>
      group
        ? api.delete(`/expenses/${familyId}/expenses/${id}/group`)
        : api.delete(`/expenses/${familyId}/expenses/${id}`),
    onSuccess: (_res, { id, group }) => {
      if (!familyId) return;
      if (group) {
        // Eliminación de grupo de cuotas: no sabemos qué ids se eliminaron → refetch
        qc.invalidateQueries({ queryKey: expensesKeys.month(familyId, year, month) });
      } else {
        qc.setQueryData<MonthlyExpensesDetail>(expensesKeys.month(familyId, year, month), old =>
          old ? { ...old, expenses: old.expenses.filter(e => e.id !== id) } : old,
        );
      }
      // Grupos de cuotas y gastos fijos tienen filas en meses futuros → refrescarlos
      invalidateOtherMonths(qc, familyId, year, month);
      qc.invalidateQueries({ queryKey: expensesKeys.months(familyId) });
    },
  });
}

/* ════════════════════════════════════
   Mutations — Categories
   ════════════════════════════════════ */

export function useUpdateCategory(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CategoryInput> }) =>
      api.patch<{ category: ExpenseCategory }>(`/expenses/${familyId}/categories/${id}`, data),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      qc.setQueryData<ExpenseCategory[]>(expensesKeys.categories(familyId), old =>
        old?.map(c => c.id === data.category.id ? data.category : c) ?? old,
      );
    },
  });
}

export function useCreateCategory(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput) =>
      api.post<{ category: ExpenseCategory }>(`/expenses/${familyId}/categories`, input),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      qc.setQueryData<ExpenseCategory[]>(expensesKeys.categories(familyId), old =>
        old ? [...old, data.category] : [data.category],
      );
    },
  });
}

export function useDeleteCategory(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (catId: string) =>
      api.delete(`/expenses/${familyId}/categories/${catId}`),
    onSuccess: (_res, catId) => {
      if (!familyId) return;
      // Quitar la categoría de la lista
      qc.setQueryData<ExpenseCategory[]>(expensesKeys.categories(familyId), old =>
        old?.filter(c => c.id !== catId) ?? old,
      );
      // El mes en curso puede tener expenses con esta category → refetch (operación rara)
      qc.invalidateQueries({ queryKey: ["expenses-month", familyId] });
    },
  });
}

export function useSeedCategories(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ categories: ExpenseCategory[] }>(`/expenses/${familyId}/categories/seed`, {}),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      qc.setQueryData<ExpenseCategory[]>(expensesKeys.categories(familyId), data.categories);
    },
  });
}

/* ════════════════════════════════════
   Queries & Mutations — Banks
   ════════════════════════════════════ */

export function useExpenseBanks(familyId: string | undefined) {
  return useQuery({
    queryKey: expensesKeys.banks(familyId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<{ banks: BankRecord[] }>(
        `/expenses/${familyId}/banks`
      );
      return data.banks;
    },
    enabled: !!familyId,
  });
}

export function useCreateBank(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BankInput) =>
      api.post<{ bank: BankRecord }>(`/expenses/${familyId}/banks`, input),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      qc.setQueryData<BankRecord[]>(expensesKeys.banks(familyId), old =>
        old ? [...old, data.bank] : [data.bank],
      );
    },
  });
}

export function useUpdateBank(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BankInput> }) =>
      api.patch<{ bank: BankRecord }>(`/expenses/${familyId}/banks/${id}`, data),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      qc.setQueryData<BankRecord[]>(expensesKeys.banks(familyId), old =>
        old?.map(b => b.id === data.bank.id ? data.bank : b) ?? old,
      );
    },
  });
}

export function useImportExpenses(familyId: string | undefined, year: number, month: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { fromYear: number; fromMonth: number; ids: string[] }) =>
      api.post<{ imported: number }>(`/expenses/${familyId}/months/${year}/${month + 1}/import`, {
        ...input,
        fromMonth: input.fromMonth + 1,
      }),
    onSuccess: () => {
      if (!familyId) return;
      // Import crea múltiples expenses que no podemos reconstruir → refetch necesario
      qc.invalidateQueries({ queryKey: expensesKeys.month(familyId, year, month) });
      qc.invalidateQueries({ queryKey: expensesKeys.months(familyId) });
    },
  });
}

export function useDeleteBank(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bankId: string) =>
      api.delete(`/expenses/${familyId}/banks/${bankId}`),
    onSuccess: (_res, bankId) => {
      if (!familyId) return;
      qc.setQueryData<BankRecord[]>(expensesKeys.banks(familyId), old =>
        old?.filter(b => b.id !== bankId) ?? old,
      );
    },
  });
}
