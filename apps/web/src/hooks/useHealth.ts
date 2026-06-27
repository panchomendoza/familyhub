import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Child, Control, Vaccine, Visit, Exam, Attachment } from "@familyhub/types";

/* ════════════════════════════════════
   Types
   ════════════════════════════════════ */

export interface ChildDetail {
  child:       Child;
  controls:    Control[];
  vaccines:    Vaccine[];
  visits:      Visit[];
  exams:       Exam[];
  attachments: Attachment[];
}

export interface ControlInput {
  date:      string;
  doctor?:   string | null;
  center?:   string | null;
  weight?:   number | null;
  height?:   number | null;
  headCirc?: number | null;
  notes?:    string | null;
}

export interface VaccineInput {
  date:    string;
  name:    string;
  dose?:   string | null;
  batch?:  string | null;
  notes?:  string | null;
}

export interface VisitInput {
  date:        string;
  reason:      string;
  doctor?:     string | null;
  center?:     string | null;
  diagnosis?:  string | null;
  treatment?:  string | null;
  notes?:      string | null;
}

export interface ExamInput {
  date:        string;
  type:        string;
  laboratory?: string | null;
  result?:     string | null;
  controlId?:  string | null;
  visitId?:    string | null;
}

export interface ChildInput {
  name:           string;
  birthdate?:     string | null;
  gender?:        "M" | "F" | null;
  birthplace?:    string | null;
  birthWeight?:   number | null;
  birthHeight?:   number | null;
  birthHeadCirc?: number | null;
  bloodType?:     string | null;
  notes?:         string | null;
}

export interface AttachmentInput {
  name:       string;
  type:       "prescription" | "result" | "indication" | "other";
  date:       string;
  fileName:   string;
  fileSize:   number;
  mimeType:   string;
  storageKey: string;
  notes?:     string | null;
  controlId?: string | null;
  visitId?:   string | null;
}

/* ════════════════════════════════════
   Query keys factory
   ════════════════════════════════════ */

export const healthKeys = {
  children:    (familyId: string)                  => ["children",    familyId]           as const,
  childDetail: (familyId: string, childId: string) => ["childDetail", familyId, childId]  as const,
};

/* ════════════════════════════════════
   Cache helper — patch sub-lista del detalle
   ════════════════════════════════════ */

type QC = ReturnType<typeof useQueryClient>;

function patchDetailList<K extends keyof ChildDetail>(
  qc:        QC,
  familyId:  string,
  childId:   string,
  key:       K,
  updater:   (old: ChildDetail[K]) => ChildDetail[K],
) {
  qc.setQueryData<ChildDetail>(healthKeys.childDetail(familyId, childId), old => {
    if (!old) return old;
    return { ...old, [key]: updater(old[key]) };
  });
}

/* ════════════════════════════════════
   Children
   ════════════════════════════════════ */

export function useChildren(familyId: string | undefined) {
  return useQuery({
    queryKey: healthKeys.children(familyId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<{ children: Child[] }>(`/health/${familyId}/children`);
      return data.children;
    },
    enabled: !!familyId,
  });
}

export function useChildDetail(familyId: string | undefined, childId: string | undefined) {
  return useQuery({
    queryKey: healthKeys.childDetail(familyId ?? "", childId ?? ""),
    queryFn:  async () => {
      const { data } = await api.get<ChildDetail>(
        `/health/${familyId}/children/${childId}`
      );
      return data;
    },
    enabled: !!familyId && !!childId,
  });
}

export function useCreateChild(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChildInput) =>
      api.post<{ child: Child }>(`/health/${familyId}/children`, input),
    onSuccess: ({ data }) => {
      if (!familyId) return;
      qc.setQueryData<Child[]>(healthKeys.children(familyId), old =>
        old ? [...old, data.child] : [data.child],
      );
    },
  });
}

export function useUpdateChild(familyId: string | undefined, childId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ChildInput>) =>
      api.patch<{ child: Child }>(`/health/${familyId}/children/${childId}`, input),
    onSuccess: ({ data }) => {
      if (!familyId || !childId) return;
      // Actualizar en la lista
      qc.setQueryData<Child[]>(healthKeys.children(familyId), old =>
        old?.map(c => c.id === data.child.id ? data.child : c) ?? old,
      );
      // Actualizar campo child en el detalle (conservar sub-listas)
      qc.setQueryData<ChildDetail>(healthKeys.childDetail(familyId, childId), old =>
        old ? { ...old, child: data.child } : old,
      );
    },
  });
}

export function useDeleteChild(familyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (childId: string) =>
      api.delete(`/health/${familyId}/children/${childId}`),
    onSuccess: (_res, childId) => {
      if (!familyId) return;
      qc.setQueryData<Child[]>(healthKeys.children(familyId), old =>
        old?.filter(c => c.id !== childId) ?? old,
      );
      qc.removeQueries({ queryKey: healthKeys.childDetail(familyId, childId) });
    },
  });
}

/* ════════════════════════════════════
   Sub-recursos: factory genérica con setQueryData
   ════════════════════════════════════ */

function makeSubHooks<TInput, TRecord extends { id: string }>(
  resource:    string,
  responseKey: string,
  detailKey:   keyof ChildDetail,
) {
  return {
    useCreate: (familyId: string | undefined, childId: string | undefined) => {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: (input: TInput) =>
          api.post<Record<string, TRecord>>(
            `/health/${familyId}/children/${childId}/${resource}`, input,
          ),
        onSuccess: ({ data }) => {
          if (!familyId || !childId) return;
          const record = data[responseKey] as TRecord;
          patchDetailList(qc, familyId, childId, detailKey, old =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [...(old as any[]), record] as ChildDetail[typeof detailKey],
          );
        },
      });
    },

    useUpdate: (familyId: string | undefined, childId: string | undefined) => {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<TInput> }) =>
          api.patch<Record<string, TRecord>>(
            `/health/${familyId}/children/${childId}/${resource}/${id}`, data,
          ),
        onSuccess: ({ data }) => {
          if (!familyId || !childId) return;
          const record = data[responseKey] as TRecord;
          patchDetailList(qc, familyId, childId, detailKey, old =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (old as any[]).map((item: any) => item.id === record.id ? record : item) as ChildDetail[typeof detailKey],
          );
        },
      });
    },

    useDelete: (familyId: string | undefined, childId: string | undefined) => {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: (id: string) =>
          api.delete(`/health/${familyId}/children/${childId}/${resource}/${id}`),
        onSuccess: (_res, id) => {
          if (!familyId || !childId) return;
          patchDetailList(qc, familyId, childId, detailKey, old =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (old as any[]).filter((item: any) => item.id !== id) as ChildDetail[typeof detailKey],
          );
        },
      });
    },
  };
}

const controlsSub = makeSubHooks<ControlInput, Control>("checkups",  "control", "controls");
const vaccinesSub = makeSubHooks<VaccineInput, Vaccine>("vaccines",  "vaccine", "vaccines");
const visitsSub   = makeSubHooks<VisitInput,   Visit>  ("visits",   "visit",   "visits");
const examsSub    = makeSubHooks<ExamInput,    Exam>   ("exams",    "exam",    "exams");

export const {
  useCreate: useCreateControl,
  useUpdate: useUpdateControl,
  useDelete: useDeleteControl,
} = controlsSub;

export const {
  useCreate: useCreateVaccine,
  useUpdate: useUpdateVaccine,
  useDelete: useDeleteVaccine,
} = vaccinesSub;

export const {
  useCreate: useCreateVisit,
  useUpdate: useUpdateVisit,
  useDelete: useDeleteVisit,
} = visitsSub;

export const {
  useCreate: useCreateExam,
  useUpdate: useUpdateExam,
  useDelete: useDeleteExam,
} = examsSub;

/* ════════════════════════════════════
   Attachments
   ════════════════════════════════════ */

export function useCreateAttachment(familyId: string | undefined, childId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AttachmentInput) =>
      api.post<{ attachment: Attachment }>(
        `/health/${familyId}/children/${childId}/attachments`, input,
      ),
    onSuccess: ({ data }) => {
      if (!familyId || !childId) return;
      patchDetailList(qc, familyId, childId, "attachments", old =>
        [...old, data.attachment],
      );
    },
  });
}

export function useDeleteAttachment(familyId: string | undefined, childId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete(`/health/${familyId}/children/${childId}/attachments/${attachmentId}`),
    onSuccess: (_res, attachmentId) => {
      if (!familyId || !childId) return;
      patchDetailList(qc, familyId, childId, "attachments", old =>
        old.filter(a => a.id !== attachmentId),
      );
    },
  });
}
