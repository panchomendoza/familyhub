import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Child, Control, Vaccine, Visit, Exam, Attachment } from "@familyhub/types";
import { useAuthStore } from "@/stores/auth.store";
import { useHealthStore, type TabKey } from "@/stores/health.store";
import { useTheme } from "@/lib/theme";
import { useWindowWidth } from "@/hooks/useWindowWidth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { HealthSidebarSkeleton, HealthContentSkeleton } from "@/components/ui/DashboardSkeletons";
import {
  useChildren, useChildDetail,
  useCreateChild, useUpdateChild, useDeleteChild,
  useCreateControl, useUpdateControl, useDeleteControl,
  useCreateVaccine,  useUpdateVaccine,  useDeleteVaccine,
  useCreateVisit,    useUpdateVisit,    useDeleteVisit,
  useCreateExam,     useUpdateExam,     useDeleteExam,
  useCreateAttachment, useDeleteAttachment,
  type ChildInput, type ControlInput, type VaccineInput,
  type VisitInput, type ExamInput, type AttachmentInput,
} from "@/hooks/useHealth";
import { GrowthChart } from "./GrowthChart";
import styles from "./HealthDashboard.module.css";

/* ════════════════════════════════════
   CSS-var shortcuts
   ════════════════════════════════════ */
const V = {
  text:       "var(--text)",
  textMuted:  "var(--text-muted)",
  textHint:   "var(--text-hint)",
  surface:    "var(--surface)",
  surfaceAlt: "var(--surface-alt)",
  border:     "var(--border)",
  borderLight:"var(--border-light)",
  inputBg:    "var(--input-bg)",
  dangerBg:   "var(--danger-bg)",
  dangerText: "var(--danger-text)",
  accentBg:   "var(--accent-bg)",
  accentText: "var(--accent-text)",
  cardShadow: "var(--card-shadow)",
  sidebarBg:  "var(--sidebar-bg)",
} as const;

/* Shared input style (no T needed) */
const IS: React.CSSProperties = {
  width:"100%", padding:"9px 12px", borderRadius:8,
  border:`1.5px solid ${V.border}`, fontFamily:"'Plus Jakarta Sans', sans-serif",
  fontSize:14, color:V.text, outline:"none", boxSizing:"border-box",
  background:V.inputBg,
};

/* ════════════════════════════════════
   Date / text helpers
   ════════════════════════════════════ */
function isoToDate(iso?: string | null): string { return iso ? iso.slice(0, 10) : ""; }
function dateToIso(d: string): string { return d ? new Date(d + "T12:00:00").toISOString() : ""; }
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, dd] = iso.slice(0, 10).split("-");
  return dd && m && y ? `${dd}/${m}/${y}` : "—";
}
function calcAgeAt(birth?: string | null, at?: string): string {
  if (!birth || !at) return "";
  const bd = new Date(birth), at2 = new Date(at);
  if (isNaN(bd.getTime()) || isNaN(at2.getTime())) return "";
  let m = (at2.getFullYear() - bd.getFullYear()) * 12 + (at2.getMonth() - bd.getMonth());
  if (at2.getDate() < bd.getDate()) m--;
  if (m < 0) return "";
  if (m < 24) return `${m} ${m === 1 ? "mes" : "meses"}`;
  const y = Math.floor(m / 12), r = m % 12;
  return r === 0 ? `${y} ${y === 1 ? "año" : "años"}` : `${y} años ${r} meses`;
}
function calcAge(b?: string | null) { return calcAgeAt(b, new Date().toISOString()); }
function getColor(name: string) {
  const C = ["#4F7BF7","#34C78A","#F7874F","#A44FF7","#F74F7B","#4FC8F7"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return C[Math.abs(h) % C.length];
}
function normalize(s: string) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
const ATTACHMENT_TYPE_LABEL: Record<string, string> = {
  prescription:"Receta", result:"Resultado", indication:"Indicación", other:"Otro",
};
const ATTACHMENT_TYPE_COLOR: Record<string, string> = {
  prescription:"#34C78A", result:"#F7874F", indication:"#4F7BF7", other:"#8A93A8",
};
const TABS: { key: TabKey; icon: string }[] = [
  { key:"Controls",    icon:"📋" },
  { key:"Vaccines",    icon:"💉" },
  { key:"Exams",       icon:"🧪" },
  { key:"Visits",      icon:"🏥" },
  { key:"Attachments", icon:"📎" },
  { key:"Charts",      icon:"📈" },
];

/* ════════════════════════════════════
   Micro components
   ════════════════════════════════════ */
function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const ini = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className={styles.avatar} style={{ width:size, height:size, background:getColor(name), fontSize:size * 0.35 }}>
      {ini}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className={styles.vaccineBadge} style={{ background:color+"18", color, border:`1px solid ${color}40` }}>
      {children}
    </span>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.infoItem}>
      <div className={styles.infoLabel}>{label}</div>
      <div className={styles.infoValue}>{value || "—"}</div>
    </div>
  );
}

function SModal({ open, title, onClose, bottomSheet = false, children }: {
  open: boolean; title: string; onClose: () => void; bottomSheet?: boolean; children: React.ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} bottomSheet={bottomSheet} maxWidth={520}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <span className="fh-text" style={{ fontWeight:700, fontSize:17 }}>{title}</span>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color:V.textMuted, lineHeight:1 }}>✕</button>
      </div>
      {children}
    </Modal>
  );
}

function SCard({ children, color, onEdit, onDelete }: {
  children: React.ReactNode; color: string;
  onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className={styles.recordCard} style={{ borderLeft:`4px solid ${color}` }}>
      <div style={{ flex:1, minWidth:0 }}>{children}</div>
      <div className={styles.recordActions}>
        <button onClick={onEdit}   className={styles.btnEdit}>✏️</button>
        <button onClick={onDelete} className={styles.btnDelete}>🗑️</button>
      </div>
    </div>
  );
}

function ExamChip({ exam, onEdit, onDelete }: {
  exam: Exam; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"space-between", padding:"6px 10px", background:V.surfaceAlt, borderRadius:8, border:`1px solid ${V.border}` }}>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontSize:13, fontWeight:700, color:"#F7874F" }}>🧪 {exam.type}</span>
        {exam.laboratory && <span style={{ fontSize:11, color:V.textMuted }}>{exam.laboratory}</span>}
        {exam.result && <span style={{ fontSize:11, fontWeight:600, color:V.text }}>→ {exam.result}</span>}
      </div>
      <div style={{ display:"flex", gap:4, flexShrink:0 }}>
        <button onClick={onEdit}   style={{ background:V.accentBg,  border:"none", borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:12 }}>✏️</button>
        <button onClick={onDelete} style={{ background:V.dangerBg,  border:"none", borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:12 }}>🗑️</button>
      </div>
    </div>
  );
}

function AttachmentChip({ attachment, onDelete }: {
  attachment: Attachment; onDelete?: () => void;
}) {
  const color = ATTACHMENT_TYPE_COLOR[attachment.type] || "#8A93A8";
  const lbl   = ATTACHMENT_TYPE_LABEL[attachment.type] || "Archivo";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"space-between", padding:"6px 10px", background:V.surfaceAlt, borderRadius:8, border:`1px solid ${color}30` }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", flex:1, minWidth:0 }}>
        <span style={{ fontSize:13 }}>📎</span>
        <span style={{ fontSize:13, fontWeight:700, color, whiteSpace:"nowrap" }}>{lbl}</span>
        <span style={{ fontSize:12, color:V.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{attachment.name}</span>
        {attachment.fileName && <span style={{ fontSize:10, color:V.textMuted, whiteSpace:"nowrap" }}>· {attachment.fileName}</span>}
      </div>
      {onDelete && <button onClick={onDelete} style={{ background:V.dangerBg, border:"none", borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:12, flexShrink:0 }}>🗑️</button>}
    </div>
  );
}

/* ════════════════════════════════════
   Search + pagination
   ════════════════════════════════════ */
function useSearch<T extends Record<string, unknown>>(items: T[], keys: (keyof T)[], perPage = 5) {
  const [query, setQuery] = useState("");
  const [page,  setPage]  = useState(1);
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items;
    return items.map(item => {
      let best = 0;
      for (const k of keys) {
        const v = normalize(String(item[k] ?? ""));
        if (!v) continue;
        if (v === q) { best = 3; break; }
        if (v.startsWith(q)) best = Math.max(best, 2);
        else if (v.includes(q)) best = Math.max(best, 1);
      }
      return { item, score: best };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.item);
  }, [items, query]);
  const total    = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, total);
  const paged    = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  function onQuery(q: string) { setQuery(q); setPage(1); }
  return { paged, filtered, query, onQuery, page: safePage, total, setPage };
}

function SearchBar({ query, onQuery, placeholder }: {
  query: string; onQuery: (q: string) => void; placeholder?: string;
}) {
  return (
    <div style={{ position:"relative", marginBottom:14 }}>
      <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", fontSize:14, color:V.textMuted, pointerEvents:"none" }}>🔍</span>
      <input
        className="fh-input"
        style={{ paddingLeft:34 }}
        placeholder={placeholder || "Buscar..."}
        value={query}
        onChange={e => onQuery(e.target.value)}
      />
      {query && (
        <button onClick={() => onQuery("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:16, color:V.textMuted, lineHeight:1 }}>✕</button>
      )}
    </div>
  );
}

function PageBar({ page, total, setPage }: {
  page: number; total: number; setPage: (fn: (p: number) => number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:16 }}>
      <button
        onClick={() => setPage(p => Math.max(1, p - 1))}
        disabled={page === 1}
        style={{ background: page===1 ? V.surfaceAlt : V.surface, border:`1.5px solid ${V.border}`, borderRadius:8, padding:"6px 12px", cursor: page===1 ? "default":"pointer", color: page===1 ? V.textHint : "#4F7BF7", fontWeight:600, fontSize:14 }}
      >‹</button>
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <button key={n} onClick={() => setPage(() => n)} style={{ width:32, height:32, borderRadius:8, border:"1.5px solid", borderColor: page===n ? "#4F7BF7" : V.border, background: page===n ? "#4F7BF7" : V.surface, color: page===n ? "#fff" : V.textMuted, fontWeight:600, fontSize:13, cursor:"pointer" }}>{n}</button>
      ))}
      <button
        onClick={() => setPage(p => Math.min(total, p + 1))}
        disabled={page === total}
        style={{ background: page===total ? V.surfaceAlt : V.surface, border:`1.5px solid ${V.border}`, borderRadius:8, padding:"6px 12px", cursor: page===total ? "default":"pointer", color: page===total ? V.textHint : "#4F7BF7", fontWeight:600, fontSize:14 }}
      >›</button>
    </div>
  );
}

function FilteredSection<T extends Record<string, unknown>>({
  title, onAdd, emptyText, items, keys, perPage = 5, placeholder, renderItem,
}: {
  title: string; onAdd?: () => void; emptyText: string; items: T[];
  keys: (keyof T)[]; perPage?: number; placeholder?: string;
  renderItem: (item: T) => React.ReactNode;
}) {
  const { paged, filtered, query, onQuery, page, total, setPage } = useSearch(items, keys, perPage);
  const empty = items.length === 0, noRes = !empty && filtered.length === 0;
  return (
    <div>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>{title}</span>
        {onAdd && <button className={styles.btnAdd} onClick={onAdd}>+ Agregar</button>}
      </div>
      {!empty && <SearchBar query={query} onQuery={onQuery} {...(placeholder ? { placeholder } : {})} />}
      {empty
        ? <div className={styles.emptyState}>{emptyText}</div>
        : noRes
        ? <div className={styles.emptyState}>Sin resultados para <strong>"{query}"</strong></div>
        : <>
            <div className={styles.recordList}>{paged.map(item => renderItem(item))}</div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12 }}>
              <span style={{ fontSize:11, color:V.textMuted }}>
                {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}{query ? ` para "${query}"` : ""}
              </span>
              <PageBar page={page} total={total} setPage={setPage} />
            </div>
          </>
      }
    </div>
  );
}

/* ════════════════════════════════════
   Sidebar
   ════════════════════════════════════ */
function ChildSidebar({ kids, selectedId, setSelected, setTab, onAdd, onSelect, onBack, isDark, toggleTheme }: {
  kids: Child[]; selectedId: string | null;
  setSelected: (id: string) => void; setTab: (t: TabKey) => void;
  onAdd: () => void; onSelect?: () => void; onBack: () => void;
  isDark: boolean; toggleTheme: () => void;
}) {
  return (
    <div className={styles.sidebarWrap}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}>
          <span style={{ fontSize:22 }}>🩺</span>
          <span className={styles.sidebarTitle}>Salud Hijos</span>
        </div>
        <span className={styles.sidebarSubtitle}>Control pediátrico familiar</span>
      </div>

      <div className={styles.sidebarTopActions}>
        <button className={styles.btnNav} onClick={onBack}>← Inicio</button>
        <button className={styles.btnTheme} onClick={toggleTheme}>{isDark ? "☀️" : "🌙"}</button>
      </div>

      <div style={{ padding:"14px 12px 6px", fontSize:11, fontWeight:700, color:V.textMuted, letterSpacing:1, textTransform:"uppercase" }}>
        Mis hijos
      </div>

      <div className={styles.childListWrap}>
        {kids.map(c => (
          <div
            key={c.id}
            onClick={() => { setSelected(c.id); setTab("Controls"); onSelect?.(); }}
            className={`${styles.childItem} ${selectedId === c.id ? styles.childItemActive : ""}`}
          >
            <Avatar name={c.name} size={34} />
            <div style={{ flex:1, minWidth:0 }}>
              <div className={styles.childName}>{c.name}</div>
              <div className={styles.childAge}>{calcAge(c.birthdate)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.sidebarBottom}>
        <button className={styles.btnAddChild} onClick={onAdd}>+ Agregar hijo</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   Form state
   ════════════════════════════════════ */
interface FormState {
  name?: string; date?: string; doctor?: string; center?: string;
  weight?: string; height?: string; headCirc?: string; notes?: string;
  vaccineName?: string; dose?: string; batch?: string;
  reason?: string; diagnosis?: string; treatment?: string;
  examType?: string; laboratory?: string; result?: string;
  controlId?: string | null; visitId?: string | null;
  attachmentType?: "prescription" | "result" | "indication" | "other"; fileName?: string;
  birthdate?: string; gender?: "M" | "F"; birthplace?: string;
  birthWeight?: string; birthHeight?: string; birthHeadCirc?: string; bloodType?: string;
}
type ModalType = "control" | "vaccine" | "exam" | "visit" | "child" | "attachment" | null;

const TODAY = new Date().toISOString().slice(0, 10);

/* ════════════════════════════════════
   Dashboard
   ════════════════════════════════════ */
export default function HealthDashboard() {
  const navigate = useNavigate();
  const { currentFamily } = useAuthStore();
  const { selectedChildId, activeTab, setSelectedChild, setActiveTab } = useHealthStore();
  const { isDark, toggle: toggleTheme } = useTheme();
  const W = useWindowWidth();
  const isDesktop = W >= 1024;
  const familyId  = currentFamily?.id;

  const { data: kids = [], isLoading: loadingList } = useChildren(familyId);
  useEffect(() => {
    if (!selectedChildId && kids.length > 0) setSelectedChild(kids[0]!.id);
  }, [kids, selectedChildId, setSelectedChild]);
  const { data: detail, isLoading: loadingDetail } = useChildDetail(familyId, selectedChildId ?? undefined);

  const createChild      = useCreateChild(familyId);
  const updateChild      = useUpdateChild(familyId, selectedChildId ?? undefined);
  const deleteChildM     = useDeleteChild(familyId);
  const createControl    = useCreateControl(familyId, selectedChildId ?? undefined);
  const updateControl    = useUpdateControl(familyId, selectedChildId ?? undefined);
  const deleteControl    = useDeleteControl(familyId, selectedChildId ?? undefined);
  const createVaccine    = useCreateVaccine(familyId, selectedChildId ?? undefined);
  const updateVaccine    = useUpdateVaccine(familyId, selectedChildId ?? undefined);
  const deleteVaccine    = useDeleteVaccine(familyId, selectedChildId ?? undefined);
  const createVisit      = useCreateVisit(familyId, selectedChildId ?? undefined);
  const updateVisit      = useUpdateVisit(familyId, selectedChildId ?? undefined);
  const deleteVisit      = useDeleteVisit(familyId, selectedChildId ?? undefined);
  const createExam       = useCreateExam(familyId, selectedChildId ?? undefined);
  const updateExam       = useUpdateExam(familyId, selectedChildId ?? undefined);
  const deleteExam       = useDeleteExam(familyId, selectedChildId ?? undefined);
  const createAttachment = useCreateAttachment(familyId, selectedChildId ?? undefined);
  const deleteAttachment = useDeleteAttachment(familyId, selectedChildId ?? undefined);

  const [modal,  setModal]  = useState<ModalType>(null);
  const [form,   setForm]   = useState<FormState>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  const ff = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));

  function openAdd(type: Exclude<ModalType, null>) {
    const base: FormState = {};
    if (type === "control" || type === "visit") base.date = TODAY;
    if (type === "child") base.gender = "M";
    setForm(base); setEditId(null); setModal(type);
  }
  function openEdit(type: Exclude<ModalType, null>, item: Record<string, unknown>) {
    const m: FormState = {};
    for (const k in item) {
      const v = item[k];
      if (v === null || v === undefined) continue;
      if (k === "date" || k === "birthdate") (m as Record<string, unknown>)[k] = isoToDate(v as string);
      else if (typeof v === "number")        (m as Record<string, unknown>)[k] = String(v);
      else                                   (m as Record<string, unknown>)[k] = v;
    }
    setForm(m); setEditId(item.id as string); setModal(type);
  }

  const child       = detail?.child;
  const controls    = detail?.controls    ?? [];
  const vaccines    = detail?.vaccines    ?? [];
  const visits      = detail?.visits      ?? [];
  const exams       = detail?.exams       ?? [];
  const attachments = detail?.attachments ?? [];

  async function saveControl() {
    if (!form.date) return;
    const d: ControlInput = {
      date: dateToIso(form.date), doctor: form.doctor || null, center: form.center || null,
      weight: form.weight ? +form.weight : null, height: form.height ? +form.height : null,
      headCirc: form.headCirc ? +form.headCirc : null, notes: form.notes || null,
    };
    try { if (editId) await updateControl.mutateAsync({ id:editId, data:d }); else await createControl.mutateAsync(d); setModal(null); }
    catch { alert("Error al guardar el control"); }
  }
  async function saveVaccine() {
    if (!form.vaccineName || !form.date) return;
    const d: VaccineInput = {
      date: dateToIso(form.date), name: form.vaccineName,
      dose: form.dose || null, batch: form.batch || null, notes: form.notes || null,
    };
    try { if (editId) await updateVaccine.mutateAsync({ id:editId, data:d }); else await createVaccine.mutateAsync(d); setModal(null); }
    catch { alert("Error al guardar la vacuna"); }
  }
  async function saveVisit() {
    if (!form.reason || !form.date) return;
    const d: VisitInput = {
      date: dateToIso(form.date), reason: form.reason, doctor: form.doctor || null,
      center: form.center || null, diagnosis: form.diagnosis || null,
      treatment: form.treatment || null, notes: form.notes || null,
    };
    try { if (editId) await updateVisit.mutateAsync({ id:editId, data:d }); else await createVisit.mutateAsync(d); setModal(null); }
    catch { alert("Error al guardar la visita"); }
  }
  async function saveExam() {
    if (!form.examType || !form.date) return;
    const d: ExamInput = {
      date: dateToIso(form.date), type: form.examType,
      laboratory: form.laboratory || null, result: form.result || null,
      controlId: form.controlId || null, visitId: form.visitId || null,
    };
    try { if (editId) await updateExam.mutateAsync({ id:editId, data:d }); else await createExam.mutateAsync(d); setModal(null); }
    catch { alert("Error al guardar el examen"); }
  }
  async function saveAttachment() {
    if (!form.name || !form.date) return;
    const storageKey = `pending/${crypto.randomUUID()}`;
    const d: AttachmentInput = {
      name: form.name, type: (form.attachmentType || "other") as AttachmentInput["type"],
      date: dateToIso(form.date), fileName: form.fileName || form.name,
      fileSize: 0, mimeType: "application/octet-stream",
      storageKey, notes: form.notes || null,
      controlId: form.controlId || null, visitId: form.visitId || null,
    };
    try { await createAttachment.mutateAsync(d); setModal(null); }
    catch { alert("Error al guardar el archivo"); }
  }
  async function saveChild() {
    if (!form.name) return;
    const d: ChildInput = {
      name: form.name, birthdate: form.birthdate ? dateToIso(form.birthdate) : null,
      gender: form.gender || null, birthplace: form.birthplace || null,
      birthWeight: form.birthWeight ? +form.birthWeight : null,
      birthHeight: form.birthHeight ? +form.birthHeight : null,
      birthHeadCirc: form.birthHeadCirc ? +form.birthHeadCirc : null,
      bloodType: form.bloodType || null, notes: form.notes || null,
    };
    try {
      if (editId) await updateChild.mutateAsync(d);
      else { const r = await createChild.mutateAsync(d); if (r.data.child?.id) setSelectedChild(r.data.child.id); }
      setModal(null);
    } catch { alert("Error al guardar los datos del hijo/a"); }
  }
  async function handleDeleteChild(id: string) {
    if (!confirm("¿Eliminar este hijo y todos sus registros?")) return;
    await deleteChildM.mutateAsync(id);
    const remaining = kids.filter(c => c.id !== id);
    if (remaining.length > 0) setSelectedChild(remaining[0]!.id);
  }
  function onChangeLinked(e: React.ChangeEvent<HTMLSelectElement>) {
    const [t, id] = e.target.value.split("|");
    setForm(p => ({ ...p, controlId: t === "control" ? (id ?? null) : null, visitId: t === "visit" ? (id ?? null) : null } as FormState));
  }

  const isLoading = loadingList || loadingDetail;

  /* Shared button styles */
  const btnPrimary: React.CSSProperties   = { background:"#4F7BF7", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"'Plus Jakarta Sans', sans-serif" };
  const btnSecondary: React.CSSProperties = { background:V.accentBg, color:V.accentText, border:`1.5px solid #4F7BF730`, borderRadius:8, padding:"9px 16px", fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"'Plus Jakarta Sans', sans-serif" };

  return (
    <DashboardLayout
      isDesktop={isDesktop}
      drawerOpen={drawer}
      onOpenDrawer={() => setDrawer(true)}
      onCloseDrawer={() => setDrawer(false)}
      sidebarContent={
        loadingList
          ? <HealthSidebarSkeleton dark={isDark} />
          : <ChildSidebar
              kids={kids} selectedId={selectedChildId}
              setSelected={setSelectedChild} setTab={setActiveTab}
              onAdd={() => openAdd("child")} onBack={() => navigate("/home")}
              isDark={isDark} toggleTheme={toggleTheme}
            />
      }
      mobileTitle={<>
        <span style={{ fontSize:22 }}>🩺</span>
        <span className="fh-text" style={{ fontWeight:800, fontSize:16 }}>Salud Hijos</span>
      </>}
      mobileActions={<>
        {child && <>
          <Avatar name={child.name} size={28} />
          <span className="fh-text" style={{ fontWeight:600, fontSize:14 }}>{child.name}</span>
        </>}
        <button onClick={toggleTheme} className="fh-btn fh-btn-ghost" style={{ padding:"5px 9px", fontSize:14 }}>{isDark ? "☀️" : "🌙"}</button>
        <button onClick={() => navigate("/home")} className="fh-btn fh-btn-ghost" style={{ padding:"5px 10px", fontSize:12, fontWeight:600, color:"#4F7BF7" }}>🏠</button>
      </>}
    >
      <div style={{ padding: isDesktop ? "24px 28px 90px" : "16px 14px 90px" }}>

        {isLoading && !child && <HealthContentSkeleton dark={isDark} />}

        {!isLoading && kids.length === 0 && (
          <div className={styles.emptyState} style={{ border:"none" }}>
            <div className={styles.emptyIcon}>👶</div>
            <div className={styles.emptyTitle}>Sin hijos registrados</div>
            <button style={btnPrimary} onClick={() => openAdd("child")}>+ Agregar primer hijo</button>
          </div>
        )}

        {child && (
          <div className="fh-page-enter">
            {/* Child header */}
            <div className={styles.childHeader}>
              <Avatar name={child.name} size={56} />
              <div className={styles.childHeaderInfo}>
                <h1 className={styles.childHeaderName}>{child.name}</h1>
                <div className={styles.childHeaderMeta}>
                  <Badge color="#4F7BF7">{calcAge(child.birthdate) || "Sin fecha"}</Badge>
                  <Badge color="#34C78A">{child.gender === "F" ? "Niña" : "Niño"}</Badge>
                  {child.bloodType && <Badge color="#F7874F">{child.bloodType}</Badge>}
                  {child.birthdate && <span className={styles.childHeaderMetaItem}>{fmtDate(child.birthdate)}</span>}
                </div>
                {(child.birthplace || child.birthWeight || child.birthHeight || child.birthHeadCirc) && (
                  <div className={styles.infoGrid} style={{ marginTop:10, padding:"10px 14px", background:V.surfaceAlt, borderRadius:10, border:`1.5px solid ${V.borderLight}` }}>
                    {child.birthplace   && <InfoItem label="Lugar"         value={child.birthplace} />}
                    {child.birthWeight  && <InfoItem label="Peso al nacer" value={`${child.birthWeight} kg`} />}
                    {child.birthHeight  && <InfoItem label="Talla"         value={`${child.birthHeight} cm`} />}
                    {child.birthHeadCirc && <InfoItem label="P. cefálico"  value={`${child.birthHeadCirc} cm`} />}
                  </div>
                )}
                {child.notes && <div style={{ marginTop:8, fontSize:12, color:V.textMuted }}>{child.notes}</div>}
              </div>
              <div className={styles.childHeaderActions}>
                <button className={styles.btnHeaderAction} style={{ fontSize:13 }} onClick={() => openEdit("child", child as unknown as Record<string, unknown>)}>✏️ Editar</button>
                {kids.length > 1 && (
                  <button className={`${styles.btnHeaderAction} ${styles.btnHeaderDanger}`} style={{ fontSize:13 }} onClick={() => handleDeleteChild(child.id)}>🗑️</button>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className={styles.statsGrid} style={{ gridTemplateColumns: isDesktop ? "repeat(5,1fr)" : "repeat(3,1fr)", marginBottom:22 }}>
              {[
                { label:"Controles",  value:controls.length,    icon:"📋", color:"#4F7BF7", tab:"Controls"    as TabKey },
                { label:"Vacunas",    value:vaccines.length,    icon:"💉", color:"#34C78A", tab:"Vaccines"    as TabKey },
                { label:"Exámenes",   value:exams.length,       icon:"🧪", color:"#F7874F", tab:"Exams"       as TabKey },
                { label:"Visitas",    value:visits.length,      icon:"🏥", color:"#A44FF7", tab:"Visits"      as TabKey },
                { label:"Archivos",   value:attachments.length, icon:"📎", color:"#4FC8F7", tab:"Attachments" as TabKey },
              ].map(s => (
                <div
                  key={s.label}
                  className={styles.statCard}
                  style={{ cursor:"pointer", border:`2px solid ${activeTab === s.tab ? s.color : V.borderLight}`, display:"flex", alignItems:"center", gap:12 }}
                  onClick={() => setActiveTab(s.tab)}
                >
                  <span style={{ fontSize:26 }}>{s.icon}</span>
                  <div>
                    <div className={styles.statValue} style={{ color:s.color }}>{s.value}</div>
                    <div className={styles.statLabel}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabs bar */}
            <div className={styles.tabs}>
              {TABS.map(({ key, icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`${styles.tab} ${activeTab === key ? styles.tabActive : ""}`}
                >
                  {icon} {key}
                </button>
              ))}
            </div>

            {/* Tab: Controls */}
            {activeTab === "Controls" && (
              <FilteredSection
                title="Controles médicos" onAdd={() => openAdd("control")}
                emptyText="Sin controles registrados aún."
                items={controls as unknown as Record<string, unknown>[]}
                keys={["date","doctor","center","weight","height","notes"]}
                placeholder="Buscar por fecha, médico, peso..."
                renderItem={ctrl => {
                  const c = ctrl as unknown as Control;
                  const relatedExams       = exams.filter(ex => ex.controlId === c.id);
                  const relatedAttachments = attachments.filter(a => a.controlId === c.id);
                  return (
                    <SCard key={c.id} color="#4F7BF7"
                      onEdit={() => openEdit("control", c as unknown as Record<string, unknown>)}
                      onDelete={() => deleteControl.mutate(c.id)}
                    >
                      <div className={styles.infoGrid}>
                        <InfoItem label="Fecha" value={fmtDate(c.date)} />
                        <InfoItem label="Edad"  value={calcAgeAt(child.birthdate, c.date)} />
                        {c.doctor  && <InfoItem label="Médico" value={c.doctor} />}
                        {c.center  && <InfoItem label="Centro" value={c.center} />}
                        {c.weight  && <InfoItem label="Peso"   value={`${c.weight} kg`} />}
                        {c.height  && <InfoItem label="Talla"  value={`${c.height} cm`} />}
                        {c.headCirc && <InfoItem label="P.C."  value={`${c.headCirc} cm`} />}
                      </div>
                      {c.notes && (
                        <div style={{ marginTop:8, padding:"7px 10px", background:V.surfaceAlt, borderRadius:8, fontSize:12, color:V.text }}>{c.notes}</div>
                      )}
                      {relatedExams.length > 0 && (
                        <div style={{ marginTop:10 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:V.textMuted, letterSpacing:0.5, marginBottom:6, textTransform:"uppercase" }}>Exámenes</div>
                          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            {relatedExams.map(ex => (
                              <ExamChip key={ex.id} exam={ex}
                                onEdit={() => openEdit("exam", ex as unknown as Record<string, unknown>)}
                                onDelete={() => deleteExam.mutate(ex.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {relatedAttachments.length > 0 && (
                        <div style={{ marginTop:8 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:V.textMuted, letterSpacing:0.5, marginBottom:6, textTransform:"uppercase" }}>Archivos</div>
                          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            {relatedAttachments.map(a => (
                              <AttachmentChip key={a.id} attachment={a} onDelete={() => deleteAttachment.mutate(a.id)} />
                            ))}
                          </div>
                        </div>
                      )}
                    </SCard>
                  );
                }}
              />
            )}

            {/* Tab: Vaccines */}
            {activeTab === "Vaccines" && (
              <FilteredSection
                title="Vacunas" onAdd={() => openAdd("vaccine")}
                emptyText="Sin vacunas registradas aún."
                items={vaccines as unknown as Record<string, unknown>[]}
                keys={["name","dose","date","batch","notes"]}
                placeholder="Buscar por nombre, dosis, lote..."
                renderItem={v => {
                  const vac = v as unknown as Vaccine;
                  return (
                    <SCard key={vac.id} color="#34C78A"
                      onEdit={() => openEdit("vaccine", vac as unknown as Record<string, unknown>)}
                      onDelete={() => deleteVaccine.mutate(vac.id)}
                    >
                      <div className={styles.infoGrid}>
                        <div className={styles.infoItem} style={{ gridColumn:"span 2" }}>
                          <span className={styles.infoValue} style={{ fontSize:14 }}>💉 {vac.name}</span>
                        </div>
                        {vac.dose  && <InfoItem label="Dosis" value={vac.dose} />}
                        <InfoItem label="Fecha" value={fmtDate(vac.date)} />
                        {vac.batch && <InfoItem label="Lote"  value={vac.batch} />}
                      </div>
                      {vac.notes && <div style={{ marginTop:6, fontSize:12, color:V.textMuted }}>{vac.notes}</div>}
                    </SCard>
                  );
                }}
              />
            )}

            {/* Tab: Exams */}
            {activeTab === "Exams" && (
              <FilteredSection
                title="Exámenes" onAdd={() => openAdd("exam")}
                emptyText="Sin exámenes registrados."
                items={exams as unknown as Record<string, unknown>[]}
                keys={["type","date","laboratory","result"]}
                placeholder="Buscar por tipo, laboratorio, resultado..."
                renderItem={e => {
                  const ex = e as unknown as Exam;
                  const linkedControl = ex.controlId ? controls.find(c => c.id === ex.controlId) : null;
                  const linkedVisit   = ex.visitId   ? visits.find(v => v.id === ex.visitId)     : null;
                  const linkedLabel   = linkedControl
                    ? `Control ${fmtDate(linkedControl.date)} — ${calcAgeAt(child.birthdate, linkedControl.date)}`
                    : linkedVisit
                    ? `Visita ${fmtDate(linkedVisit.date)} — ${linkedVisit.reason}`
                    : null;
                  return (
                    <SCard key={ex.id} color="#F7874F"
                      onEdit={() => openEdit("exam", ex as unknown as Record<string, unknown>)}
                      onDelete={() => deleteExam.mutate(ex.id)}
                    >
                      <div className={styles.infoGrid}>
                        <div className={styles.infoItem} style={{ gridColumn:"span 2" }}>
                          <span className={styles.infoValue} style={{ fontSize:14 }}>🧪 {ex.type}</span>
                        </div>
                        <InfoItem label="Fecha" value={fmtDate(ex.date)} />
                        {ex.laboratory && <InfoItem label="Lab"       value={ex.laboratory} />}
                        {ex.result     && <InfoItem label="Resultado" value={ex.result} />}
                      </div>
                      {linkedLabel && (
                        <div style={{ marginTop:6, fontSize:11, color:V.textMuted }}>
                          📌 Solicitado en: <span style={{ fontWeight:600, color:"#4F7BF7" }}>{linkedLabel}</span>
                        </div>
                      )}
                    </SCard>
                  );
                }}
              />
            )}

            {/* Tab: Visits */}
            {activeTab === "Visits" && (
              <FilteredSection
                title="Visitas médicas" onAdd={() => openAdd("visit")}
                emptyText="Sin visitas registradas."
                items={visits as unknown as Record<string, unknown>[]}
                keys={["reason","date","doctor","center","diagnosis","treatment","notes"]}
                placeholder="Buscar por motivo, diagnóstico, médico..."
                renderItem={v => {
                  const vis = v as unknown as Visit;
                  const relatedExams       = exams.filter(ex => ex.visitId === vis.id);
                  const relatedAttachments = attachments.filter(a => a.visitId === vis.id);
                  return (
                    <SCard key={vis.id} color="#A44FF7"
                      onEdit={() => openEdit("visit", vis as unknown as Record<string, unknown>)}
                      onDelete={() => deleteVisit.mutate(vis.id)}
                    >
                      <div className={styles.infoGrid}>
                        <div className={styles.infoItem} style={{ gridColumn:"span 2" }}>
                          <div className={styles.infoLabel}>Motivo</div>
                          <div className={styles.infoValue} style={{ fontSize:14 }}>🏥 {vis.reason}</div>
                        </div>
                        <InfoItem label="Fecha" value={fmtDate(vis.date)} />
                        <InfoItem label="Edad"  value={calcAgeAt(child.birthdate, vis.date)} />
                        {vis.doctor && <InfoItem label="Médico" value={vis.doctor} />}
                        {vis.center && <InfoItem label="Centro" value={vis.center} />}
                      </div>
                      {vis.diagnosis && (
                        <div style={{ marginTop:8, padding:"7px 10px", background:"#A44FF714", borderRadius:8, fontSize:12, color:V.text }}>
                          <span style={{ fontWeight:700, color:"#A44FF7" }}>Diagnóstico: </span>{vis.diagnosis}
                        </div>
                      )}
                      {vis.treatment && (
                        <div style={{ marginTop:6, padding:"7px 10px", background:V.surfaceAlt, borderRadius:8, fontSize:12, color:V.text }}>
                          <span style={{ fontWeight:700, color:"#4F7BF7" }}>Tratamiento: </span>{vis.treatment}
                        </div>
                      )}
                      {vis.notes && <div style={{ marginTop:6, fontSize:12, color:V.textMuted }}>{vis.notes}</div>}
                      {relatedExams.length > 0 && (
                        <div style={{ marginTop:10 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:V.textMuted, letterSpacing:0.5, marginBottom:6, textTransform:"uppercase" }}>Exámenes</div>
                          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            {relatedExams.map(ex => (
                              <ExamChip key={ex.id} exam={ex}
                                onEdit={() => openEdit("exam", ex as unknown as Record<string, unknown>)}
                                onDelete={() => deleteExam.mutate(ex.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {relatedAttachments.length > 0 && (
                        <div style={{ marginTop:8 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:V.textMuted, letterSpacing:0.5, marginBottom:6, textTransform:"uppercase" }}>Archivos</div>
                          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            {relatedAttachments.map(a => (
                              <AttachmentChip key={a.id} attachment={a} onDelete={() => deleteAttachment.mutate(a.id)} />
                            ))}
                          </div>
                        </div>
                      )}
                    </SCard>
                  );
                }}
              />
            )}

            {/* Tab: Attachments */}
            {activeTab === "Attachments" && (
              <div>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Archivos adjuntos</span>
                  <button className={styles.btnAdd} onClick={() => openAdd("attachment")}>+ Adjuntar</button>
                </div>
                {attachments.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div style={{ fontSize:36, marginBottom:12 }}>📎</div>
                    <div style={{ fontWeight:600, marginBottom:6 }}>Sin archivos adjuntos</div>
                    <div style={{ fontSize:12 }}>Adjunta recetas, resultados de exámenes, indicaciones y más.</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {attachments.map(a => {
                      const linkedControl = a.controlId ? controls.find(c => c.id === a.controlId) : null;
                      const linkedVisit   = a.visitId   ? visits.find(v => v.id === a.visitId)     : null;
                      const linkedLabel   = linkedControl
                        ? `Control ${fmtDate(linkedControl.date)}`
                        : linkedVisit
                        ? `Visita ${fmtDate(linkedVisit.date)} — ${linkedVisit.reason}`
                        : null;
                      const attachColor   = ATTACHMENT_TYPE_COLOR[a.type] || "#8A93A8";
                      return (
                        <div key={a.id} className={styles.recordCard} style={{ borderLeft:`4px solid ${attachColor}` }}>
                          <AttachmentChip attachment={a} onDelete={() => deleteAttachment.mutate(a.id)} />
                          <div className={styles.infoGrid} style={{ marginTop:8 }}>
                            <InfoItem label="Fecha" value={fmtDate(a.date)} />
                            {linkedLabel && <InfoItem label="Asociado a" value={linkedLabel} />}
                          </div>
                          {a.notes && <div style={{ marginTop:6, fontSize:12, color:V.textMuted }}>{a.notes}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Charts */}
            {activeTab === "Charts" && <GrowthChart child={child} controls={controls} isDark={isDark} />}
          </div>
        )}
      </div>

      {/* Mobile bottom nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:100, background:V.sidebarBg, borderTop:`1.5px solid ${V.borderLight}`, display:"flex", padding:"8px 0 env(safe-area-inset-bottom, 8px)" }} className="lg:hidden">
        {TABS.map(({ key, icon }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, padding:"4px 0" }}>
            <span style={{ fontSize:20 }}>{icon}</span>
            <span style={{ fontSize:10, fontWeight: activeTab === key ? 700 : 500, color: activeTab === key ? "#4F7BF7" : V.textMuted }}>{key}</span>
            {activeTab === key && <div style={{ width:18, height:3, background:"#4F7BF7", borderRadius:99 }} />}
          </button>
        ))}
      </div>

      {/* ══ Modals ══ */}

      {modal === "control" && (
        <SModal open title={editId ? "Editar control" : "Nuevo control"} onClose={() => setModal(null)} bottomSheet={!isDesktop}>
          <div className="grid grid-cols-2 gap-3 mb-3.5">
            <div style={{ marginBottom:14 }}>
              <label className={styles.formLabel}>Fecha</label>
              <input style={IS} type="date" value={form.date || ""} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label className={styles.formLabel}>Edad</label>
              <input style={{ ...IS, background: form.date && child?.birthdate ? (isDark ? "#1e2d4a" : "#EEF3FF") : IS.background }} readOnly value={form.date && child ? calcAgeAt(child.birthdate, form.date) : ""} placeholder="Auto-calculada" />
            </div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Médico</label><input style={IS} placeholder="Dr. Apellido" value={form.doctor || ""} onChange={ff("doctor")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Centro</label><input style={IS} placeholder="CESFAM, Clínica..." value={form.center || ""} onChange={ff("center")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Peso (kg)</label><input style={IS} type="number" step="0.1" min="0" placeholder="Ej: 10.5" value={form.weight || ""} onChange={ff("weight")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Talla (cm)</label><input style={IS} type="number" min="0" placeholder="Ej: 75" value={form.height || ""} onChange={ff("height")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>P. cefálico (cm)</label><input style={IS} type="number" step="0.1" min="0" placeholder="Ej: 44" value={form.headCirc || ""} onChange={ff("headCirc")} /></div>
            <div style={{ marginBottom:14 }} className="col-span-full"><label className={styles.formLabel}>Observaciones</label><textarea style={{ ...IS, minHeight:65, resize:"vertical" }} placeholder="Notas..." value={form.notes || ""} onChange={ff("notes")} /></div>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
            <button className={styles.btnSave}   onClick={saveControl}>Guardar</button>
          </div>
        </SModal>
      )}

      {modal === "vaccine" && (
        <SModal open title={editId ? "Editar vacuna" : "Registrar vacuna"} onClose={() => setModal(null)} bottomSheet={!isDesktop}>
          <div className="grid grid-cols-2 gap-3 mb-3.5">
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Vacuna</label><input style={IS} placeholder="Ej: Hexavalente" value={form.vaccineName || ""} onChange={ff("vaccineName")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Dosis</label><input style={IS} placeholder="Ej: 1ª" value={form.dose || ""} onChange={ff("dose")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Fecha</label><input style={IS} type="date" value={form.date || ""} onChange={ff("date")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Lote</label><input style={IS} placeholder="Nº de lote" value={form.batch || ""} onChange={ff("batch")} /></div>
            <div style={{ marginBottom:14 }} className="col-span-full"><label className={styles.formLabel}>Notas</label><input style={IS} placeholder="Ej: sin reacciones" value={form.notes || ""} onChange={ff("notes")} /></div>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
            <button className={styles.btnSave}   onClick={saveVaccine}>Guardar</button>
          </div>
        </SModal>
      )}

      {modal === "exam" && (
        <SModal open title={editId ? "Editar examen" : "Registrar examen"} onClose={() => setModal(null)} bottomSheet={!isDesktop}>
          <div style={{ marginBottom:14 }}>
            <label className={styles.formLabel}>Solicitado en</label>
            <select style={IS} value={`${form.controlId ? "control" : form.visitId ? "visit" : ""}|${form.controlId || form.visitId || ""}`} onChange={onChangeLinked}>
              <option value="|">— Selecciona control o visita —</option>
              <optgroup label="Controles">{controls.map(c => <option key={c.id} value={`control|${c.id}`}>Control {fmtDate(c.date)} — {calcAgeAt(child?.birthdate, c.date)}</option>)}</optgroup>
              <optgroup label="Visitas">{visits.map(v => <option key={v.id} value={`visit|${v.id}`}>Visita {fmtDate(v.date)} — {v.reason}</option>)}</optgroup>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3.5">
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Tipo</label><input style={IS} placeholder="Ej: Hemograma" value={form.examType || ""} onChange={ff("examType")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Fecha</label><input style={IS} type="date" value={form.date || ""} onChange={ff("date")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Laboratorio</label><input style={IS} placeholder="Nombre del lab" value={form.laboratory || ""} onChange={ff("laboratory")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Resultado</label><input style={IS} placeholder="Ej: Normal" value={form.result || ""} onChange={ff("result")} /></div>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
            <button className={styles.btnSave}   onClick={saveExam}>Guardar</button>
          </div>
        </SModal>
      )}

      {modal === "visit" && (
        <SModal open title={editId ? "Editar visita" : "Registrar visita"} onClose={() => setModal(null)} bottomSheet={!isDesktop}>
          <div className="grid grid-cols-2 gap-3 mb-3.5">
            <div style={{ marginBottom:14 }} className="col-span-full"><label className={styles.formLabel}>Motivo de consulta</label><input style={IS} placeholder="Ej: Fiebre, revisión..." value={form.reason || ""} onChange={ff("reason")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Fecha</label><input style={IS} type="date" value={form.date || ""} onChange={ff("date")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Médico</label><input style={IS} placeholder="Dr. Apellido" value={form.doctor || ""} onChange={ff("doctor")} /></div>
            <div style={{ marginBottom:14 }} className="col-span-full"><label className={styles.formLabel}>Centro</label><input style={IS} placeholder="Centro de salud" value={form.center || ""} onChange={ff("center")} /></div>
            <div style={{ marginBottom:14 }} className="col-span-full"><label className={styles.formLabel}>Diagnóstico</label><textarea style={{ ...IS, minHeight:55, resize:"vertical" }} placeholder="Diagnóstico médico..." value={form.diagnosis || ""} onChange={ff("diagnosis")} /></div>
            <div style={{ marginBottom:14 }} className="col-span-full"><label className={styles.formLabel}>Tratamiento</label><textarea style={{ ...IS, minHeight:55, resize:"vertical" }} placeholder="Medicamentos, indicaciones..." value={form.treatment || ""} onChange={ff("treatment")} /></div>
            <div style={{ marginBottom:14 }} className="col-span-full"><label className={styles.formLabel}>Notas</label><textarea style={{ ...IS, minHeight:50, resize:"vertical" }} placeholder="Observaciones adicionales..." value={form.notes || ""} onChange={ff("notes")} /></div>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
            <button className={styles.btnSave}   onClick={saveVisit}>Guardar</button>
          </div>
        </SModal>
      )}

      {modal === "attachment" && (
        <SModal open title="Adjuntar archivo" onClose={() => setModal(null)} bottomSheet={!isDesktop}>
          <div style={{ marginBottom:14 }}>
            <label className={styles.formLabel}>Asociado a</label>
            <select style={IS} value={`${form.controlId ? "control" : form.visitId ? "visit" : ""}|${form.controlId || form.visitId || ""}`} onChange={onChangeLinked}>
              <option value="|">— Selecciona control o visita —</option>
              <optgroup label="Controles">{controls.map(c => <option key={c.id} value={`control|${c.id}`}>Control {fmtDate(c.date)}{c.doctor ? ` — ${c.doctor}` : ""}</option>)}</optgroup>
              <optgroup label="Visitas">{visits.map(v => <option key={v.id} value={`visit|${v.id}`}>Visita {fmtDate(v.date)} — {v.reason}</option>)}</optgroup>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3.5">
            <div style={{ marginBottom:14 }}>
              <label className={styles.formLabel}>Tipo de documento</label>
              <select style={IS} value={form.attachmentType || "other"} onChange={ff("attachmentType")}>
                <option value="prescription">Receta</option>
                <option value="result">Resultado de examen</option>
                <option value="indication">Indicación médica</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div style={{ marginBottom:14 }}>
              <label className={styles.formLabel}>Fecha del documento</label>
              <input style={IS} type="date" value={form.date || ""} onChange={ff("date")} />
            </div>
          </div>
          <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Nombre o descripción</label><input style={IS} placeholder="Ej: Receta amoxicilina, Informe ecografía..." value={form.name || ""} onChange={ff("name")} /></div>
          <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Nombre del archivo (opcional)</label><input style={IS} placeholder="Ej: receta_amoxicilina.pdf" value={form.fileName || ""} onChange={ff("fileName")} /></div>
          <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Notas adicionales</label><input style={IS} placeholder="Ej: Válida por 30 días, resultado normal..." value={form.notes || ""} onChange={ff("notes")} /></div>
          <div style={{ marginBottom:14, padding:"10px 14px", background: isDark ? "#1e2d4a" : "#EEF3FF", borderRadius:10, border:`1px solid ${V.border}`, fontSize:12, color:V.textMuted }}>
            ℹ️ El almacenamiento de archivos requiere configuración de S3. Por ahora se registra el metadato.
          </div>
          <div className={styles.modalActions}>
            <button className={styles.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
            <button className={styles.btnSave}   onClick={saveAttachment}>Guardar</button>
          </div>
        </SModal>
      )}

      {modal === "child" && (
        <SModal open title={editId ? "Editar hijo/a" : "Agregar hijo/a"} onClose={() => setModal(null)} bottomSheet={!isDesktop}>
          <div className="grid grid-cols-2 gap-3 mb-3.5">
            <div style={{ marginBottom:14 }} className="col-span-full"><label className={styles.formLabel}>Nombre completo</label><input style={IS} placeholder="Nombre" value={form.name || ""} onChange={ff("name")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Fecha de nacimiento</label><input style={IS} type="date" value={form.birthdate || ""} onChange={ff("birthdate")} /></div>
            <div style={{ marginBottom:14 }}>
              <label className={styles.formLabel}>Sexo</label>
              <select style={IS} value={form.gender || "M"} onChange={ff("gender")}>
                <option value="M">Niño</option>
                <option value="F">Niña</option>
              </select>
            </div>
            <div style={{ marginBottom:14 }} className="col-span-full"><label className={styles.formLabel}>Lugar de nacimiento</label><input style={IS} placeholder="Ej: Santiago" value={form.birthplace || ""} onChange={ff("birthplace")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Peso al nacer (kg)</label><input style={IS} type="number" step="0.1" placeholder="Ej: 3.2" value={form.birthWeight || ""} onChange={ff("birthWeight")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>Talla al nacer (cm)</label><input style={IS} type="number" placeholder="Ej: 49" value={form.birthHeight || ""} onChange={ff("birthHeight")} /></div>
            <div style={{ marginBottom:14 }}><label className={styles.formLabel}>P. cefálico al nacer (cm)</label><input style={IS} type="number" step="0.1" placeholder="Ej: 34" value={form.birthHeadCirc || ""} onChange={ff("birthHeadCirc")} /></div>
            <div style={{ marginBottom:14 }}>
              <label className={styles.formLabel}>Grupo sanguíneo</label>
              <select style={IS} value={form.bloodType || ""} onChange={ff("bloodType")}>
                <option value="">— No sé —</option>
                {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:14 }} className="col-span-full"><label className={styles.formLabel}>Notas (alergias, condiciones...)</label><textarea style={{ ...IS, minHeight:60, resize:"vertical" }} placeholder="Ej: Alérgico a penicilina..." value={form.notes || ""} onChange={ff("notes")} /></div>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
            <button className={styles.btnSave}   onClick={saveChild}>Guardar</button>
          </div>
        </SModal>
      )}
    </DashboardLayout>
  );
}
