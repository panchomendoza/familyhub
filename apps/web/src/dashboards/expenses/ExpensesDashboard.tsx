import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { api, ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useWindowWidth } from "@/hooks/useWindowWidth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ExpensesSkeleton } from "@/components/ui/DashboardSkeletons";
import {
  useCategories, useMonthExpenses, useMonths,
  useUpdateIncome, useCreateExpense, useUpdateExpense,
  useTogglePaid, useDeleteExpense,
  useCreateCategory, useUpdateCategory, useDeleteCategory, useSeedCategories,
  useExpenseBanks, useCreateBank, useUpdateBank, useDeleteBank,
  useImportExpenses,
  expensesKeys,
  type ExpenseWithCategory, type ExpenseInput, type BankRecord, type MonthlyExpensesDetail,
} from "@/hooks/useExpenses";
import type { ExpenseCategory } from "@familyhub/types";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import styles from "./ExpensesDashboard.module.css";

/* ════════════════════════════════════
   Constants
   ════════════════════════════════════ */
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio",
                "Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function fmtCLP(n: number | undefined | null): string {
  if (n == null) return "—";
  return "$" + Math.round(Number(n)).toLocaleString("es-CL");
}

/* CSS-var helpers (usable in inline style props) */
const V = {
  text:       "var(--text)",
  textMuted:  "var(--text-muted)",
  textHint:   "var(--text-hint)",
  surface:    "var(--surface)",
  surfaceAlt: "var(--surface-alt)",
  border:     "var(--border)",
  borderLight:"var(--border-light)",
  inputBg:    "var(--input-bg)",
  modalBg:    "var(--modal-bg)",
  cardShadow: "var(--card-shadow)",
  dangerBg:   "var(--danger-bg)",
  dangerText: "var(--danger-text)",
  accentBg:   "var(--accent-bg)",
  accentText: "var(--accent-text)",
  sidebarBg:  "var(--sidebar-bg)",
} as const;

/* ════════════════════════════════════
   Sub-components
   ════════════════════════════════════ */
function StatCard({ label, value, sub, color, icon, onClick }: {
  label: string; value: string; sub?: string | undefined; color?: string | undefined;
  icon: string; onClick?: (() => void) | undefined;
}) {
  return (
    <div className={styles.summaryCard} onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div className={styles.summaryIcon}>{icon}</div>
        {sub && <span style={{ fontSize:11, color: V.textMuted }}>{sub}</span>}
      </div>
      <div className={styles.summaryValue} style={{ color: color || V.text, fontSize:22, marginTop:8 }}>{value}</div>
      <div className={styles.summaryLabel} style={{ marginTop:2 }}>{label}</div>
    </div>
  );
}

function ProgressBar({ value, max, color, bgColor, height = 8 }: {
  value: number; max: number; color: string; bgColor?: string; height?: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={styles.budgetTrack} style={{ height, background: bgColor ?? V.surfaceAlt }}>
      <div className={styles.budgetFill} style={{ width:`${pct}%`, background:color }} />
    </div>
  );
}

function InstallmentProgress({ installments, currentInstallment }: { installments: number; currentInstallment: number }) {
  return (
    <div style={{ display:"flex", gap:3 }}>
      {Array.from({ length: installments }).map((_, i) => (
        <div key={i} style={{ width:14, height:6, borderRadius:3, background: i < currentInstallment ? "#4F7BF7" : V.surfaceAlt }} />
      ))}
    </div>
  );
}

function ExpenseRow({ g, categories, onEdit, onDelete, onToggle }: {
  g: ExpenseWithCategory; categories: ExpenseCategory[];
  onEdit: (g: ExpenseWithCategory) => void;
  onDelete: (g: ExpenseWithCategory) => void;
  onToggle: (id: string) => Promise<void>;
}) {
  const [isToggling, setIsToggling] = useState(false);
  const cat = categories.find(c => c.id === g.categoryId) ?? categories[categories.length - 1];
  const hasInstallments = g.installments > 0;
  const paid = !!g.paid;
  const catColor = cat?.color ?? "#8A93A8";

  async function handleToggle() {
    if (isToggling) return;
    setIsToggling(true);
    try { await onToggle(g.id); } finally { setIsToggling(false); }
  }

  return (
    <div
      className={`${styles.expenseRow} ${paid ? styles.expensePaid : ""}`}
      style={{ borderLeft: `3px solid ${paid ? "#34C78A" : catColor}` }}
    >
      <button
        onClick={handleToggle}
        disabled={isToggling}
        title={paid ? "Marcar como pendiente" : "Marcar como pagado"}
        className={`${styles.toggleBtn} ${paid && !isToggling ? styles.toggleBtnPaid : ""}`}
        style={{
          borderColor: isToggling ? V.border : paid ? "#34C78A" : V.border,
          background: isToggling ? V.surfaceAlt : paid ? "#34C78A" : "transparent",
        }}
      >
        {isToggling
          ? <span className={styles.toggleSpinner} />
          : paid && <span style={{ color:"#fff", fontWeight:800, fontSize:11 }}>✓</span>
        }
      </button>

      <span style={{ fontSize:18, flexShrink:0 }}>{cat?.icon ?? "📦"}</span>

      <div className={styles.expenseBody}>
        <div className={styles.expenseNameRow}>
          <span className="fh-text" style={{
            fontWeight:600, fontSize:13,
            textDecoration: paid ? "line-through" : "none",
            opacity: paid ? 0.7 : 1,
          }}>{g.name}</span>
          {hasInstallments && <InstallmentProgress installments={g.installments} currentInstallment={g.currentInstallment} />}
        </div>
        <div className={styles.expenseMeta}>
          {g.bank && <span className={styles.expenseMetaText}>{g.bank}</span>}
          {g.notes && <span className={styles.expenseMetaText}>· {g.notes}</span>}
          {hasInstallments && <span style={{ fontSize:11, color:"#4F7BF7", fontWeight:600 }}>Cuota {g.currentInstallment}/{g.installments}</span>}
          {paid && <span style={{ fontSize:11, color:"#34C78A", fontWeight:700 }}>✓ Pagado</span>}
        </div>
      </div>

      <div style={{ fontWeight:700, fontSize:14, flexShrink:0, color: paid ? "#34C78A" : V.text, textDecoration: paid ? "line-through" : "none" }}>
        {fmtCLP(g.amount)}
      </div>

      {!hasInstallments && (
        <div className={styles.expenseActions}>
          <button onClick={() => onEdit(g)} className={styles.btnExpAction}>✏️</button>
          <button onClick={() => onDelete(g)} className={`${styles.btnExpAction} ${styles.btnExpActionDanger}`}>🗑️</button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════
   Modal: Agregar elemento (banco o categoría)
   ════════════════════════════════════ */
function ModalAddItem({ open, title, placeholder, icon, onSave, onClose }: {
  open: boolean; title: string; placeholder: string; icon: string;
  onSave: (name: string) => Promise<void>; onClose: () => void;
}) {
  const [name, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();

  async function handleSave() {
    if (!trimmed || saving) return;
    setSaving(true);
    try { await onSave(trimmed); setSaveName(""); }
    finally { setSaving(false); }
  }

  function handleClose() {
    if (saving) return;
    setSaveName(""); onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} maxWidth={360}>
      <p className={styles.modalTitle}>{icon} {title}</p>
      <label style={{ fontSize:11, fontWeight:700, color: V.textMuted, display:"block", marginBottom:5, textTransform:"uppercase" }}>Nombre</label>
      <input
        autoFocus className="fh-input" style={{ marginBottom:16 }}
        value={name}
        onChange={e => setSaveName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
        placeholder={placeholder}
      />
      <div className={styles.modalActions}>
        <button onClick={handleClose} disabled={saving} className={styles.btnModalCancel}>Cancelar</button>
        <button onClick={handleSave} disabled={!trimmed || saving} className={styles.btnModalConfirm}>
          {saving ? "Guardando…" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════
   Modal: Eliminar elemento (con manejo de 409)
   ════════════════════════════════════ */
function ModalDeleteItem({ open, itemName, onConfirm, onClose }: {
  open: boolean; itemName: string;
  onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleConfirm() {
    if (deleting) return;
    setDeleting(true); setError(null);
    try { await onConfirm(); }
    catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError((err.data as { error?: string }).error ?? "No se puede eliminar porque está en uso.");
      } else {
        setError("Ocurrió un error. Intenta de nuevo.");
      }
    } finally { setDeleting(false); }
  }

  function handleClose() { if (deleting) return; setError(null); onClose(); }

  return (
    <Modal open={open} onClose={handleClose} maxWidth={380}>
      <p className={styles.modalTitle}>¿Eliminar "{itemName}"?</p>
      {!error && <p className={styles.modalDesc}>Esta acción no se puede deshacer.</p>}
      {error && <div className="fh-alert-danger" style={{ marginBottom:16 }}>⚠️ {error}</div>}
      <div className={styles.modalActions}>
        <button onClick={handleClose} disabled={deleting} className={styles.btnModalCancel}>
          {error ? "Cerrar" : "Cancelar"}
        </button>
        {!error && (
          <button onClick={handleConfirm} disabled={deleting} className={`${styles.btnModalConfirm} ${styles.btnModalDanger}`}>
            {deleting ? "Eliminando…" : "Eliminar"}
          </button>
        )}
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════
   Modal: Importar gastos de mes anterior
   ════════════════════════════════════ */
function ModalImportExpenses({ open, onClose, onImport, familyId, fromYear, fromMonth, toMonthLabel, currentExpenses }: {
  open: boolean; onClose: () => void;
  onImport: (ids: string[]) => Promise<void>;
  familyId: string | undefined;
  fromYear: number; fromMonth: number;
  toMonthLabel: string;
  currentExpenses: ExpenseWithCategory[];
}) {
  const { data: sourceData, isLoading } = useMonthExpenses(familyId, fromYear, fromMonth);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);

  const alreadyInMonth = new Set(currentExpenses.map(e => e.name));
  const allImportable  = (sourceData?.expenses ?? []).filter(e => e.installments === 0);
  const importable     = allImportable;
  const selectable     = allImportable.filter(e => !alreadyInMonth.has(e.name));

  useEffect(() => {
    if (open) setSelected(new Set(selectable.map(e => e.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allChecked = selectable.length > 0 && selectable.every(e => selected.has(e.id));

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(selectable.map(e => e.id)));
  }

  async function handleImport() {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    try { await onImport([...selected]); onClose(); }
    finally { setSaving(false); }
  }

  const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const fromLabel = `${MONTHS_ES[fromMonth]} ${fromYear}`;

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} maxWidth={480}>
      <p className={styles.modalTitle}>📋 Copiar gastos a {toMonthLabel}</p>
      <p className={styles.modalDesc}>
        Selecciona los gastos de <strong style={{ color: V.text }}>{fromLabel}</strong> que quieres repetir. Se crearán como no pagados.
      </p>

      {isLoading && (
        <div style={{ textAlign:"center", padding:"24px 0", color: V.textMuted, fontSize:13 }}>Cargando gastos…</div>
      )}

      {!isLoading && importable.length === 0 && (
        <div style={{ textAlign:"center", padding:"24px 0", color: V.textMuted, fontSize:13 }}>
          No hay gastos simples en {fromLabel} para copiar.<br />
          <span style={{ fontSize:12 }}>(Las cuotas se heredan automáticamente.)</span>
        </div>
      )}

      {!isLoading && importable.length > 0 && (
        <>
          {selectable.length > 0 && (
            <div
              onClick={toggleAll}
              className={`${styles.importItem} ${allChecked ? styles.importItemSelected : ""}`}
              style={{ marginBottom:8 }}
            >
              <div className={`${styles.importCheckbox} ${allChecked ? styles.importCheckboxChecked : ""}`}>
                {allChecked && <span style={{ fontWeight:800, fontSize:12 }}>✓</span>}
              </div>
              <span style={{ fontSize:13, fontWeight:700, color: V.text }}>
                {allChecked ? "Deseleccionar todo" : "Seleccionar todo"} ({selectable.length})
              </span>
            </div>
          )}

          <div className={styles.importList}>
            {importable.map(e => {
              const isDuplicate = alreadyInMonth.has(e.name);
              const checked     = selected.has(e.id);
              return (
                <div
                  key={e.id}
                  onClick={isDuplicate ? undefined : () => toggle(e.id)}
                  className={`${styles.importItem} ${checked ? styles.importItemSelected : ""}`}
                  style={isDuplicate ? { opacity:0.5, cursor:"default" } : {}}
                >
                  <div className={`${styles.importCheckbox} ${checked ? styles.importCheckboxChecked : ""}`}
                    style={isDuplicate ? { borderColor: V.textMuted } : {}}>
                    {checked && !isDuplicate && <span style={{ fontWeight:800, fontSize:12 }}>✓</span>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className={styles.importName}>{e.name}</div>
                    <div style={{ fontSize:11, color: V.textMuted }}>{e.bank || "—"} · {e.category?.label ?? "Sin categoría"}</div>
                  </div>
                  {isDuplicate ? (
                    <span style={{ fontSize:11, color: V.textMuted, whiteSpace:"nowrap", marginLeft:8 }}>Ya en este mes</span>
                  ) : (
                    <div className={styles.importAmount}>${Math.round(e.amount).toLocaleString("es-CL")}</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className={styles.modalActions}>
        <button onClick={onClose} disabled={saving} className={styles.btnModalCancel}>Cancelar</button>
        {importable.length > 0 && (
          <button onClick={handleImport} disabled={selected.size === 0 || saving} className={styles.btnModalConfirm}
            style={{ flex:2, opacity: (selected.size === 0 || saving) ? 0.5 : 1 }}>
            {saving ? "Copiando…" : `Copiar ${selected.size} gasto${selected.size !== 1 ? "s" : ""}`}
          </button>
        )}
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════
   Modal: Income
   ════════════════════════════════════ */
function ModalIncome({ open, income, onSave, onClose }: {
  open: boolean; income: number; onSave: (n: number) => void; onClose: () => void;
}) {
  const [val, setVal] = useState(String(income || ""));
  return (
    <Modal open={open} onClose={onClose} maxWidth={360}>
      <p className={styles.modalTitle}>💰 Ingreso del mes</p>
      <label style={{ fontSize:11, fontWeight:700, color: V.textMuted, display:"block", marginBottom:5, textTransform:"uppercase" }}>Monto ($)</label>
      <input
        autoFocus type="number" className="fh-input" style={{ fontSize:18, fontWeight:700, marginBottom:16 }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSave(Number(val)); }}
      />
      <div className={styles.modalActions}>
        <button onClick={onClose} className={styles.btnModalCancel}>Cancelar</button>
        <button onClick={() => onSave(Number(val))} className={styles.btnModalConfirm} style={{ background:"#34C78A" }}>Guardar</button>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════
   Modal: Expense
   ════════════════════════════════════ */
type ExpenseForm = {
  name: string; amount: string; bank: string;
  categoryId: string; notes: string;
  installments: number; currentInstallment: number; paid: boolean;
};

const EMPTY_FORM: ExpenseForm = {
  name: "", amount: "", bank: "", categoryId: "",
  notes: "", installments: 0, currentInstallment: 1, paid: false,
};

function ModalExpense({ open, initial, categories, banks, onSave, onClose, isMobile }: {
  open: boolean; initial: ExpenseWithCategory | null; categories: ExpenseCategory[];
  banks: string[]; onSave: (d: ExpenseInput) => void;
  onClose: () => void; isMobile: boolean;
}) {
  const [form, setForm] = useState<ExpenseForm>(() =>
    initial
      ? { name: initial.name, amount: String(initial.amount), bank: initial.bank,
          categoryId: initial.categoryId ?? categories[0]?.id ?? "",
          notes: initial.notes ?? "", installments: initial.installments, currentInstallment: initial.currentInstallment,
          paid: initial.paid }
      : { ...EMPTY_FORM, bank: banks[0] ?? "", categoryId: categories[0]?.id ?? "" }
  );

  // Resetear el form cada vez que el modal se abre (initial cambia después del mount)
  useEffect(() => {
    if (!open) return;
    setForm(initial
      ? { name: initial.name, amount: String(initial.amount), bank: initial.bank,
          categoryId: initial.categoryId ?? categories[0]?.id ?? "",
          notes: initial.notes ?? "", installments: initial.installments, currentInstallment: initial.currentInstallment,
          paid: initial.paid }
      : { ...EMPTY_FORM, bank: banks[0] ?? "", categoryId: categories[0]?.id ?? "" }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSave() {
    if (!form.name.trim() || !form.amount) return;
    onSave({
      name: form.name.trim(), amount: Number(form.amount),
      bank: form.bank, categoryId: form.categoryId || null,
      notes: form.notes || null, installments: Number(form.installments ?? 0),
      paid: form.paid,
    });
  }

  return (
    <Modal open={open} onClose={onClose} bottomSheet={isMobile} maxWidth={480}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <span className="fh-text" style={{ fontWeight:700, fontSize:16 }}>{initial ? "Editar gasto" : "Nuevo gasto"}</span>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color: V.textMuted }}>✕</button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 14px" }}>
        <div style={{ marginBottom:12, gridColumn:"span 2" }}>
          <label style={{ fontSize:11, fontWeight:700, color: V.textMuted, display:"block", marginBottom:4, textTransform:"uppercase" }}>Nombre</label>
          <input autoFocus className="fh-input" placeholder="Ej: Netflix, Bencina..."
            value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:11, fontWeight:700, color: V.textMuted, display:"block", marginBottom:4, textTransform:"uppercase" }}>Monto ($)</label>
          <input className="fh-input" type="number" placeholder="0"
            value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:11, fontWeight:700, color: V.textMuted, display:"block", marginBottom:4, textTransform:"uppercase" }}>Banco / Billetera</label>
          <select className="fh-input" value={form.bank} onChange={e => setForm(p => ({ ...p, bank: e.target.value }))}>
            <option value="">Sin banco</option>
            {banks.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:12, gridColumn:"span 2" }}>
          <label style={{ fontSize:11, fontWeight:700, color: V.textMuted, display:"block", marginBottom:6, textTransform:"uppercase" }}>Categoría</label>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {categories.map(c => (
              <button key={c.id} onClick={() => setForm(p => ({ ...p, categoryId: c.id }))} style={{
                padding:"6px 12px", borderRadius:8,
                border: `1.5px solid ${form.categoryId === c.id ? c.color : V.border}`,
                background: form.categoryId === c.id ? c.color + "20" : V.surfaceAlt,
                color: form.categoryId === c.id ? c.color : V.textMuted,
                fontFamily:"inherit", fontWeight:600, fontSize:12, cursor:"pointer",
              }}>{c.icon} {c.label}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:11, fontWeight:700, color: V.textMuted, display:"block", marginBottom:4, textTransform:"uppercase" }}>Cuotas (0 = sin cuotas)</label>
          <input className="fh-input" type="number" min="0" placeholder="0"
            value={form.installments} onChange={e => setForm(p => ({ ...p, installments: Number(e.target.value) }))} />
        </div>
        {Number(form.installments) > 0 && (
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:700, color: V.textMuted, display:"block", marginBottom:4, textTransform:"uppercase" }}>Cuota actual</label>
            <input className="fh-input" type="number" min="1" max={form.installments}
              value={form.currentInstallment} onChange={e => setForm(p => ({ ...p, currentInstallment: Number(e.target.value) }))} />
          </div>
        )}
        <div style={{ marginBottom:14, gridColumn:"span 2" }}>
          <label style={{ fontSize:11, fontWeight:700, color: V.textMuted, display:"block", marginBottom:4, textTransform:"uppercase" }}>Observación (opcional)</label>
          <input className="fh-input" placeholder="Nota adicional..."
            value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
        </div>
      </div>

      <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
        <button onClick={onClose} className="fh-btn fh-btn-ghost">Cancelar</button>
        <button onClick={handleSave} className="fh-btn" style={{ background:"#F7874F", color:"#fff", borderRadius:8, padding:"9px 20px", fontWeight:700, fontSize:14, border:"none", cursor:"pointer", fontFamily:"inherit" }}>Guardar</button>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════
   Recharts tooltip
   ════════════════════════════════════ */
function CustomTooltip({ active, payload, label, isDark }: {
  active?: boolean; payload?: Array<{ color?: string; name?: string; value?: number }>; label?: string; isDark: boolean;
}) {
  if (!active || !payload?.length) return null;
  const borderColor = isDark ? "#2A2D3A" : "#E2E8F0";
  return (
    <div style={{ background: V.modalBg, border:`1px solid ${borderColor}`, borderRadius:10, padding:"10px 14px", fontSize:12, fontFamily:"inherit" }}>
      <div style={{ fontWeight:700, color: V.text, marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? V.text }}>{p.name}: {fmtCLP(p.value ?? 0)}</div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════
   Main dashboard
   ════════════════════════════════════ */
export default function ExpensesDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentFamily } = useAuthStore();
  const familyId = currentFamily?.id;

  const { isDark, toggle: toggleTheme } = useTheme();
  const W = useWindowWidth();
  const isDesktop = W >= 1024;
  const isMobile = W < 640;

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data: bankRecords = [] } = useExpenseBanks(familyId);
  const mutCreateBank = useCreateBank(familyId);
  const mutUpdateBank = useUpdateBank(familyId);
  const mutDeleteBank   = useDeleteBank(familyId);
  const mutImport       = useImportExpenses(familyId, year, month);
  const banks = bankRecords.map((b: BankRecord) => b.name);

  const [view, setView] = useState<"resumen" | "gastos" | "historial" | "config">("resumen");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modal, setModal] = useState<null | "income" | "expense" | "del">(null);
  const [editExpense,      setEditExpense]      = useState<ExpenseWithCategory | null>(null);
  const [deleteTarget,     setDeleteTarget]     = useState<ExpenseWithCategory | null>(null);
  const fromMonth = month === 0 ? 11 : month - 1;
  const fromYear  = month === 0 ? year - 1 : year;

  const [importOpen,       setImportOpen]       = useState(false);
  const [addBankOpen,      setAddBankOpen]      = useState(false);
  const [addCategoryOpen,  setAddCategoryOpen]  = useState(false);
  const [deletingBank,     setDeletingBank]     = useState<BankRecord | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<import("@familyhub/types").ExpenseCategory | null>(null);

  const { data: monthData, isLoading } = useMonthExpenses(familyId, year, month);
  const { data: categories = [] }      = useCategories(familyId);
  const { data: monthsHistory = [] }   = useMonths(familyId);

  const expenses = monthData?.expenses ?? [];
  const income   = monthData?.income   ?? 0;

  const mutIncome         = useUpdateIncome(familyId, year, month);
  const mutCreate         = useCreateExpense(familyId, year, month);
  const mutUpdate         = useUpdateExpense(familyId, year, month);
  const mutToggle         = useTogglePaid(familyId, year, month);
  const mutDelete         = useDeleteExpense(familyId, year, month);
  const mutCreateCategory = useCreateCategory(familyId);
  const mutUpdateCategory = useUpdateCategory(familyId);
  const mutDeleteCategory = useDeleteCategory(familyId);
  const mutSeedCategories = useSeedCategories(familyId);

  const savingsIds = useMemo(
    () => categories.filter(c => c.label.toLowerCase().includes("ahorro")).map(c => c.id),
    [categories]
  );

  const totalExpenses      = expenses.filter(g => !savingsIds.includes(g.categoryId ?? "")).reduce((s, g) => s + g.amount, 0);
  const totalPaid          = expenses.filter(g => g.paid && !savingsIds.includes(g.categoryId ?? "")).reduce((s, g) => s + g.amount, 0);
  const totalPending       = totalExpenses - totalPaid;
  const totalSavings       = expenses.filter(g => savingsIds.includes(g.categoryId ?? "")).reduce((s, g) => s + g.amount, 0);
  const available          = income - totalExpenses - totalSavings;
  const expensePct         = income > 0 ? (totalExpenses / income) * 100 : 0;
  const savingsPct         = income > 0 ? (totalSavings / income) * 100 : 0;
  const activeInstallments = expenses.filter(g => g.installments > 0 && g.currentInstallment <= g.installments);

  const byCategory = useMemo(() =>
    categories.map(c => ({
      ...c,
      total: expenses.filter(g => g.categoryId === c.id).reduce((s, g) => s + g.amount, 0),
      items: expenses.filter(g => g.categoryId === c.id),
    })).filter(c => c.total > 0),
    [categories, expenses]
  );

  const byBank = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach(g => { if (g.bank) map.set(g.bank, (map.get(g.bank) ?? 0) + g.amount); });
    return Array.from(map.entries()).map(([bank, total]) => ({ bank, total })).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const monthsDisplay = useMemo(() =>
    [...monthsHistory]
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map(m => {
        const tot = m.expenses.reduce((s, g) => s + g.amount, 0);
        return {
          key: `${m.year}-${m.month}`, y: m.year, m: m.month,
          label: `${MONTHS[m.month]?.slice(0, 3) ?? ""} ${m.year}`,
          income: m.income, total: tot, available: m.income - tot,
        };
      }),
    [monthsHistory]
  );

  const tips = useMemo(() => {
    const list: { icon: string; color: string; msg: string }[] = [];
    const subscriptionIds = categories.filter(c => c.label.toLowerCase().includes("susc")).map(c => c.id);
    const subscriptionTotal = expenses.filter(g => subscriptionIds.includes(g.categoryId ?? "")).reduce((s, g) => s + g.amount, 0);
    if (subscriptionTotal > 0 && income > 0 && subscriptionTotal / income > 0.15)
      list.push({ icon:"📱", color:"#F74F7B", msg:`Suscripciones en ${Math.round(subscriptionTotal/income*100)}% del ingreso. Recomendado: <15%.` });
    if (savingsPct < 10 && income > 0)
      list.push({ icon:"🐷", color:"#F7874F", msg:`Ahorro en ${Math.round(savingsPct)}%. Meta sugerida: 20% (${fmtCLP(income * 0.2)}).` });
    if (available < 0)
      list.push({ icon:"🚨", color:"#F74F7B", msg:`Gastas más de lo que ingresas. Déficit: ${fmtCLP(Math.abs(available))}.` });
    if (activeInstallments.length > 0)
      list.push({ icon:"💳", color:"#4F7BF7", msg:`${activeInstallments.length} cuota${activeInstallments.length > 1 ? "s" : ""} activa${activeInstallments.length > 1 ? "s" : ""}. Total: ${fmtCLP(activeInstallments.reduce((s, g) => s + g.amount, 0))}/mes.` });
    if (available > 0 && savingsPct >= 20)
      list.push({ icon:"✅", color:"#34C78A", msg:`¡Vas bien! Ahorras el ${Math.round(savingsPct)}% y te sobran ${fmtCLP(available)}.` });
    return list;
  }, [categories, expenses, income, savingsPct, available, activeInstallments]);

  const nowYear  = now.getFullYear();
  const nowMonth = now.getMonth();
  const viewAbs  = year * 12 + month;
  const canGoPrev = viewAbs > nowYear * 12 + nowMonth - 1;
  const canGoNext = viewAbs < nowYear * 12 + nowMonth + 1;

  function navPrev() {
    if (!canGoPrev) return;
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
  }
  function navNext() {
    if (!canGoNext) return;
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
  }

  function openAdd() { setEditExpense(null); setModal("expense"); }
  function openEdit(g: ExpenseWithCategory) { setEditExpense(g); setModal("expense"); }
  function openDel(g: ExpenseWithCategory)  { setDeleteTarget(g); setModal("del"); }

  async function handleSaveExpense(data: ExpenseInput) {
    if (editExpense) await mutUpdate.mutateAsync({ id: editExpense.id, data });
    else             await mutCreate.mutateAsync(data);
    setModal(null);
  }

  async function handleMarkAllPaid() {
    const unpaid = expenses.filter(g => !g.paid && !savingsIds.includes(g.categoryId ?? ""));
    await Promise.all(unpaid.map(g =>
      api.patch(`/expenses/${familyId}/expenses/${g.id}`, { paid: true })
    ));
    // Actualizar cache directamente: marcar todos como pagados
    const paidIds = new Set(unpaid.map(g => g.id));
    qc.setQueryData<MonthlyExpensesDetail>(expensesKeys.month(familyId!, year, month), old =>
      old ? { ...old, expenses: old.expenses.map(e => paidIds.has(e.id) ? { ...e, paid: true } : e) } : old,
    );
    qc.invalidateQueries({ queryKey: expensesKeys.months(familyId!) });
  }

  // Recharts colors (need dynamic values for axis)
  const chartBorder   = isDark ? "#2A2D3A" : "#E2E8F0";
  const chartTextMuted = "#8A93A8";

  const SidebarContent = useCallback(({ onSelect }: { onSelect?: () => void }) => {
    const NAV = [
      { key:"resumen"   as const, icon:"📊", label:"Resumen"     },
      { key:"gastos"    as const, icon:"📋", label:"Gastos"      },
      { key:"historial" as const, icon:"📈", label:"Historial"   },
      { key:"config"    as const, icon:"⚙️",  label:"Configurar" },
    ];
    return (
      <div className={styles.sidebarWrap}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogo}>
            <span style={{ fontSize:22 }}>💰</span>
            <span className={styles.sidebarTitle}>Gastos</span>
          </div>
          <span className={styles.sidebarSubtitle}>Presupuesto familiar</span>
        </div>

        <div className={styles.sidebarTopActions}>
          <button className={styles.btnNav} onClick={() => navigate("/home")}>← Inicio</button>
          <button className={styles.btnTheme} onClick={toggleTheme}>{isDark ? "☀️" : "🌙"}</button>
        </div>

        <div className={styles.monthNav}>
          <div style={{ fontSize:10, fontWeight:700, color: V.textMuted, letterSpacing:1, marginBottom:8, textTransform:"uppercase", padding:"0 2px", flex:1, display:"flex", flexDirection:"column", gap:6 }}>
            <span>Mes activo</span>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <button onClick={navPrev} disabled={!canGoPrev} className={styles.btnMonth} style={{ opacity: canGoPrev ? 1 : 0.3 }}>‹</button>
              <div className={styles.monthLabel}>{MONTHS[month]} {year}</div>
              <button onClick={navNext} disabled={!canGoNext} className={styles.btnMonth} style={{ opacity: canGoNext ? 1 : 0.3 }}>›</button>
            </div>
          </div>
        </div>

        <div style={{ padding:"8px 0", flex:1 }}>
          {NAV.map(n => (
            <button key={n.key} onClick={() => { setView(n.key); onSelect?.(); }} style={{
              display:"flex", alignItems:"center", gap:10, width:"100%",
              padding:"10px 16px", background: view === n.key ? "#F7874F18" : "transparent",
              border:"none", borderLeft: view === n.key ? "3px solid #F7874F" : "3px solid transparent",
              cursor:"pointer", fontFamily:"inherit",
              fontWeight: view === n.key ? 700 : 500, fontSize:13,
              color: view === n.key ? "#F7874F" : V.textMuted,
            }}>
              <span>{n.icon}</span><span>{n.label}</span>
            </button>
          ))}
        </div>

        <div style={{ margin:"0 12px 12px", padding:"12px", background: V.surfaceAlt, borderRadius:10, border:`1px solid ${V.border}` }}>
          <div style={{ fontSize:10, fontWeight:700, color: V.textMuted, marginBottom:8, textTransform:"uppercase" }}>Este mes</div>
          {[
            { l:"Ingreso",      v:fmtCLP(income),        c:"#34C78A" },
            { l:"Comprometido", v:fmtCLP(totalExpenses), c:"#F7874F" },
            { l:"✓ Pagado",    v:fmtCLP(totalPaid),     c:"#34C78A" },
            { l:"Pendiente",    v:fmtCLP(totalPending),  c: totalPending > 0 ? "#F74F7B" : V.text },
            { l:"Disponible",   v:fmtCLP(available),     c: available >= 0 ? V.text : "#F74F7B" },
          ].map(r => (
            <div key={r.l} style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontSize:11, color: V.textMuted }}>{r.l}</span>
              <span style={{ fontSize:11, fontWeight:700, color:r.c }}>{r.v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, month, year, view, income, totalExpenses, totalPaid, totalPending, available, canGoPrev, canGoNext]);

  return (
    <DashboardLayout
      isDesktop={isDesktop}
      drawerOpen={drawerOpen}
      onOpenDrawer={() => setDrawerOpen(true)}
      onCloseDrawer={() => setDrawerOpen(false)}
      sidebarContent={<SidebarContent />}
      mobileTitle={<>
        <span style={{ fontSize:20 }}>💰</span>
        <span className="fh-text" style={{ fontWeight:800, fontSize:15 }}>Gastos · {MONTHS[month]?.slice(0, 3)} {year}</span>
      </>}
      mobileActions={<>
        <button onClick={openAdd} className="fh-btn fh-btn-success" style={{ padding:"6px 12px", fontSize:13, borderRadius:7 }}>+</button>
        <button onClick={toggleTheme} className={styles.btnTheme} style={{ borderRadius:7, padding:"5px 9px" }}>{isDark ? "☀️" : "🌙"}</button>
        <button onClick={() => navigate("/home")} className={styles.btnNav} style={{ borderRadius:7, padding:"5px 10px", flex:"unset" }}>🏠</button>
      </>}
    >
      <div className={isMobile ? styles.contentMobile : styles.content}>

        {/* ══ RESUMEN ══ */}
        {view === "resumen" && (
          <>
            <div className={styles.viewHeader}>
              <div>
                <h2 className="fh-text" style={{ margin:0, fontSize:20, fontWeight:800 }}>Resumen · {MONTHS[month]} {year}</h2>
                <p className="fh-text-muted" style={{ margin:"3px 0 0", fontSize:13 }}>Presupuesto mensual familiar</p>
              </div>
              {isDesktop && (
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => setModal("income")} className="fh-btn fh-btn-ghost">💰 Editar ingreso</button>
                  <button onClick={openAdd} style={{ background:"#F7874F", border:"none", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer", fontFamily:"inherit" }}>+ Agregar gasto</button>
                </div>
              )}
            </div>

            {isLoading && <ExpensesSkeleton dark={isDark} />}

            {!isLoading && (
              <div className="fh-page-enter">
                <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap:12, marginBottom:20 }}>
                  <StatCard label="Ingreso del mes"    value={fmtCLP(income)}        icon="💵" color="#34C78A" onClick={() => setModal("income")} />
                  <StatCard label="Comprometido"       value={fmtCLP(totalExpenses)} icon="📋" color="#F7874F" sub={income > 0 ? `${Math.round(expensePct)}% ingreso` : undefined} />
                  <StatCard label="✓ Pagado"          value={fmtCLP(totalPaid)}     icon="✅" color="#34C78A" sub={`${expenses.filter(g => g.paid).length} ítems`} />
                  <StatCard label="Pendiente de pagar" value={fmtCLP(totalPending)}  icon="⏳" color={totalPending > 0 ? "#F74F7B" : "#34C78A"}
                    sub={`${expenses.filter(g => !g.paid && !savingsIds.includes(g.categoryId ?? "")).length} ítems`} />
                </div>

                {/* Distribution bar */}
                {income > 0 && byCategory.length > 0 && (
                  <div className="fh-card" style={{ marginBottom:16 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                      <span className="fh-text" style={{ fontWeight:700, fontSize:14 }}>Distribución del ingreso</span>
                      <span className="fh-text-muted" style={{ fontSize:12 }}>Meta: 50% nec · 30% ocio · 20% ahorro</span>
                    </div>
                    <div style={{ display:"flex", height:14, borderRadius:99, overflow:"hidden", gap:2, marginBottom:12 }}>
                      {byCategory.map(c => (
                        <div key={c.id} style={{ width:`${(c.total/income)*100}%`, background:c.color, minWidth: c.total > 0 ? 3 : 0, transition:"width 0.4s" }} title={`${c.label}: ${fmtCLP(c.total)}`} />
                      ))}
                      {available > 0 && <div style={{ flex:1, background: V.border }} />}
                    </div>
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                      {byCategory.map(c => (
                        <div key={c.id} style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", background:c.color }} />
                          <span className="fh-text-muted" style={{ fontSize:11 }}>{c.icon} {c.label}</span>
                          <span className="fh-text" style={{ fontSize:11, fontWeight:700 }}>{fmtCLP(c.total)}</span>
                          <span className="fh-text-muted" style={{ fontSize:10 }}>({Math.round(c.total / income * 100)}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2 cols: bank + category */}
                {(byBank.length > 0 || byCategory.length > 0) && (
                  <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:14, marginBottom:16 }}>
                    <div className="fh-card">
                      <div className="fh-text" style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Por banco / billetera</div>
                      {byBank.length === 0 && <div className="fh-text-muted" style={{ fontSize:13 }}>Sin datos de banco.</div>}
                      {byBank.map(b => (
                        <div key={b.bank} style={{ marginBottom:10 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                            <span className="fh-text" style={{ fontSize:13 }}>{b.bank}</span>
                            <span className="fh-text" style={{ fontSize:13, fontWeight:700 }}>{fmtCLP(b.total)}</span>
                          </div>
                          <ProgressBar value={b.total} max={totalExpenses + totalSavings} color="#4F7BF7" height={5} />
                        </div>
                      ))}
                    </div>

                    <div className="fh-card">
                      <div className="fh-text" style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Por categoría</div>
                      {byCategory.map(c => (
                        <div key={c.id} style={{ marginBottom:10 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                            <span className="fh-text" style={{ fontSize:13 }}>{c.icon} {c.label}</span>
                            <span style={{ fontSize:13, fontWeight:700, color:c.color }}>{fmtCLP(c.total)}</span>
                          </div>
                          <ProgressBar value={c.total} max={income > 0 ? income : totalExpenses + totalSavings} color={c.color} height={5} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active installments */}
                {activeInstallments.length > 0 && (
                  <div className="fh-card" style={{ marginBottom:16 }}>
                    <div className="fh-text" style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>💳 Cuotas activas</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {activeInstallments.map(g => {
                        const cat = categories.find(c => c.id === g.categoryId);
                        return (
                          <div key={g.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", background: g.paid ? V.surfaceAlt : V.surface, borderRadius:10, border:`1px solid ${V.border}`, opacity: g.paid ? 0.7 : 1 }}>
                            <button onClick={() => mutToggle.mutate(g.id)} style={{ width:22, height:22, borderRadius:6, flexShrink:0, cursor:"pointer", border:`2px solid ${g.paid ? "#34C78A" : "#C0C8D8"}`, background: g.paid ? "#34C78A" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>
                              {g.paid && <span style={{ color:"#fff", fontWeight:800 }}>✓</span>}
                            </button>
                            <div style={{ flex:1 }}>
                              <div className="fh-text" style={{ fontWeight:600, fontSize:13, textDecoration: g.paid ? "line-through" : "none" }}>{g.name}</div>
                              {g.notes && <div className="fh-text-muted" style={{ fontSize:11, marginTop:2 }}>{g.notes}</div>}
                            </div>
                            <InstallmentProgress installments={g.installments} currentInstallment={g.currentInstallment} />
                            <div style={{ textAlign:"right" }}>
                              <div style={{ fontWeight:700, fontSize:13, color: g.paid ? "#34C78A" : (cat?.color ?? "#4F7BF7") }}>{fmtCLP(g.amount)}</div>
                              <div className="fh-text-muted" style={{ fontSize:10 }}>Cuota {g.currentInstallment}/{g.installments}</div>
                            </div>
                            {g.currentInstallment >= g.installments && <span style={{ fontSize:11, color:"#34C78A", fontWeight:700 }}>✓ Última</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tips.length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    <div className="fh-text" style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>💡 Análisis inteligente</div>
                    {tips.map((t, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 14px", background:t.color+"10", borderRadius:10, border:`1px solid ${t.color}30` }}>
                        <span style={{ fontSize:18, flexShrink:0 }}>{t.icon}</span>
                        <span className="fh-text" style={{ fontSize:13, lineHeight:1.5 }}>{t.msg}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expenses.length === 0 && !isLoading && (
                  <div className={styles.emptyExpenses} style={{ marginTop:16 }}>
                    Sin gastos este mes.<br />
                    <button onClick={openAdd} style={{ background:"#F7874F", border:"none", borderRadius:8, padding:"9px 20px", fontWeight:700, fontSize:14, color:"#fff", cursor:"pointer", fontFamily:"inherit", marginTop:12 }}>+ Agregar primer gasto</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ══ GASTOS ══ */}
        {view === "gastos" && (
          <>
            <div className={styles.viewHeader} style={{ gap:8, flexWrap:"wrap" }}>
              <h2 className="fh-text" style={{ margin:0, fontSize:20, fontWeight:800 }}>Gastos · {MONTHS[month]} {year}</h2>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setImportOpen(true)} className="fh-btn" style={{ background: V.accentBg, color: V.accentText, border:`1.5px solid ${V.accentText}30`, borderRadius:8, padding:"7px 12px", fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                  📋 Copiar del mes anterior
                </button>
                {isDesktop && <button onClick={openAdd} style={{ background:"#F7874F", border:"none", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer", fontFamily:"inherit" }}>+ Agregar gasto</button>}
              </div>
            </div>

            {isLoading && <ExpensesSkeleton dark={isDark} />}

            {!isLoading && (
              <>
                {/* Payment progress */}
                {(() => {
                  const total = expenses.filter(g => !savingsIds.includes(g.categoryId ?? "")).length;
                  const paid  = expenses.filter(g => g.paid && !savingsIds.includes(g.categoryId ?? "")).length;
                  const pct   = total > 0 ? Math.round(paid / total * 100) : 0;
                  if (!total) return null;
                  return (
                    <div className="fh-card" style={{ marginBottom:16, display:"flex", alignItems:"center", gap:14 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                          <span className="fh-text" style={{ fontSize:13, fontWeight:600 }}>Progreso de pago del mes</span>
                          <span style={{ fontSize:13, fontWeight:700, color: pct === 100 ? "#34C78A" : "#F7874F" }}>{paid}/{total} pagados · {pct}%</span>
                        </div>
                        <ProgressBar value={paid} max={total} color={pct === 100 ? "#34C78A" : "#4F7BF7"} height={8} />
                      </div>
                      {pct === 100 && <span style={{ fontSize:22 }}>🎉</span>}
                    </div>
                  );
                })()}

                {categories.length === 0 && (
                  <div className="fh-card" style={{ marginBottom:16, textAlign:"center" }}>
                    <div className="fh-text-muted" style={{ fontSize:13, marginBottom:12 }}>Aún no hay categorías. Agrega las predeterminadas para empezar.</div>
                    <button onClick={() => mutSeedCategories.mutate()} disabled={mutSeedCategories.isPending} style={{ background:"#4F7BF7", border:"none", borderRadius:8, padding:"8px 16px", fontWeight:700, fontSize:13, color:"#fff", cursor:"pointer", fontFamily:"inherit" }}>
                      {mutSeedCategories.isPending ? "Agregando..." : "✨ Cargar categorías predeterminadas"}
                    </button>
                  </div>
                )}

                {categories.map(cat => {
                  const items = expenses.filter(g => g.categoryId === cat.id);
                  if (!items.length) return null;
                  const subtotal = items.reduce((s, g) => s + g.amount, 0);
                  return (
                    <div key={cat.id} style={{ marginBottom:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <span style={{ fontWeight:700, fontSize:14, color:cat.color }}>{cat.icon} {cat.label}</span>
                        <span className="fh-text" style={{ fontWeight:700, fontSize:14 }}>{fmtCLP(subtotal)}</span>
                      </div>
                      <div className={styles.expenseList}>
                        {items.map(g => (
                          <ExpenseRow key={g.id} g={g} categories={categories} onEdit={openEdit} onDelete={openDel} onToggle={async id => { await mutToggle.mutateAsync(id); }} />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {(() => {
                  const uncategorized = expenses.filter(g => !g.categoryId);
                  if (!uncategorized.length) return null;
                  return (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <span className="fh-text-muted" style={{ fontWeight:700, fontSize:14 }}>📦 Sin categoría</span>
                        <span className="fh-text" style={{ fontWeight:700, fontSize:14 }}>{fmtCLP(uncategorized.reduce((s, g) => s + g.amount, 0))}</span>
                      </div>
                      <div className={styles.expenseList}>
                        {uncategorized.map(g => (
                          <ExpenseRow key={g.id} g={g} categories={categories} onEdit={openEdit} onDelete={openDel} onToggle={async id => { await mutToggle.mutateAsync(id); }} />
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {expenses.some(g => !g.paid && !savingsIds.includes(g.categoryId ?? "")) && (
                  <button onClick={handleMarkAllPaid} style={{ marginTop:8, background:"#34C78A18", border:"1.5px solid #34C78A40", borderRadius:9, padding:"8px 16px", fontSize:12, fontWeight:700, color:"#34C78A", cursor:"pointer", fontFamily:"inherit" }}>
                    ✓ Marcar todos como pagados
                  </button>
                )}

                {expenses.length === 0 && (
                  <div className={styles.emptyExpenses}>
                    Sin gastos registrados este mes.<br />
                    <button onClick={openAdd} style={{ background:"#F7874F", border:"none", borderRadius:8, padding:"9px 20px", fontWeight:700, fontSize:14, color:"#fff", cursor:"pointer", fontFamily:"inherit", marginTop:12 }}>+ Agregar primer gasto</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ══ HISTORIAL ══ */}
        {view === "historial" && (
          <>
            <h2 className="fh-text" style={{ margin:"0 0 16px", fontSize:20, fontWeight:800 }}>Historial</h2>
            {monthsDisplay.length < 2 ? (
              <div className={styles.emptyExpenses}>
                Necesitas al menos 2 meses registrados para ver el historial.
              </div>
            ) : (
              <>
                <div className="fh-card" style={{ padding:"16px 8px 8px 0", marginBottom:16 }}>
                  <div className="fh-text" style={{ paddingLeft:20, marginBottom:8, fontWeight:700, fontSize:14 }}>Ingresos vs Gastos</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={monthsDisplay} margin={{ top:0, right:16, left:0, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartBorder} />
                      <XAxis dataKey="label" tick={{ fill:chartTextMuted, fontSize:11 }} />
                      <YAxis tick={{ fill:chartTextMuted, fontSize:11 }} width={60} tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltip isDark={isDark} />} />
                      <Legend wrapperStyle={{ fontSize:12, color:chartTextMuted }} />
                      <Bar dataKey="income" name="Ingreso" fill="#34C78A" radius={[4,4,0,0]} />
                      <Bar dataKey="total"  name="Gastos"  fill="#F74F7B" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="fh-card" style={{ padding:"16px 8px 8px 0", marginBottom:16 }}>
                  <div className="fh-text" style={{ paddingLeft:20, marginBottom:8, fontWeight:700, fontSize:14 }}>Disponible mes a mes</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={monthsDisplay} margin={{ top:0, right:16, left:0, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartBorder} />
                      <XAxis dataKey="label" tick={{ fill:chartTextMuted, fontSize:11 }} />
                      <YAxis tick={{ fill:chartTextMuted, fontSize:11 }} width={60} tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltip isDark={isDark} />} />
                      <Line dataKey="available" name="Disponible" stroke="#4F7BF7" strokeWidth={2.5} dot={{ r:5, fill:"#4F7BF7" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="fh-surface" style={{ borderRadius:14, border:`1px solid ${V.border}`, overflow:"hidden" }}>
                  <div className="fh-text" style={{ padding:"14px 18px", fontWeight:700, fontSize:14, borderBottom:`1px solid ${V.border}` }}>Resumen por mes</div>
                  {[...monthsDisplay].reverse().map(mo => (
                    <div key={mo.key} onClick={() => { setYear(mo.y); setMonth(mo.m); setView("resumen"); }} style={{
                      display:"flex", gap:12, padding:"12px 18px", borderBottom:`1px solid ${V.border}`,
                      cursor:"pointer", background: (mo.y === year && mo.m === month) ? V.surfaceAlt : "transparent",
                      alignItems:"center",
                    }}>
                      <div className="fh-text" style={{ minWidth:80, fontWeight:700, fontSize:13 }}>{mo.label}</div>
                      <div style={{ flex:1 }}>
                        <ProgressBar value={mo.total} max={mo.income > 0 ? mo.income : mo.total} color={mo.total > mo.income ? "#F74F7B" : "#F7874F"} height={5} />
                      </div>
                      <div className="fh-text-muted" style={{ fontSize:12, minWidth:80, textAlign:"right" }}>{fmtCLP(mo.total)}</div>
                      <div style={{ fontSize:12, fontWeight:700, color: mo.available >= 0 ? "#34C78A" : "#F74F7B", minWidth:80, textAlign:"right" }}>{fmtCLP(mo.available)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ══ CONFIG ══ */}
        {view === "config" && (
          <>
            <h2 className="fh-text" style={{ margin:"0 0 16px", fontSize:20, fontWeight:800 }}>Configurar</h2>

            {bankRecords.length === 0 && expenses.length === 0 && (
              <div style={{ background:"#4F7BF714", border:"1.5px solid #4F7BF730", borderRadius:14, padding:"20px", marginBottom:16 }}>
                <div style={{ fontWeight:700, fontSize:15, color:"#4F7BF7", marginBottom:6 }}>👋 ¡Bienvenido a Gastos!</div>
                <div className="fh-text" style={{ fontSize:13, lineHeight:1.6 }}>
                  Empieza agregando tus bancos y billeteras (BancoEstado, Tenpo, MercadoPago, etc.) y luego podrás registrar tus gastos mensuales.<br /><br />
                  Las categorías ya están listas con valores por defecto — puedes renombrarlas cuando quieras.
                </div>
              </div>
            )}

            {/* Categories */}
            <div className="fh-card" style={{ marginBottom:14 }}>
              <div className="fh-text" style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Categorías</div>

              {categories.length === 0 && (
                <div style={{ textAlign:"center", padding:"20px 0", color: V.textMuted, fontSize:13, marginBottom:12 }}>
                  Sin categorías. Carga las predeterminadas o crea las tuyas.
                  <br />
                  <button onClick={() => mutSeedCategories.mutate()} disabled={mutSeedCategories.isPending} style={{ marginTop:10, background:"#4F7BF7", border:"none", borderRadius:8, padding:"8px 16px", fontWeight:700, fontSize:13, color:"#fff", cursor:"pointer", fontFamily:"inherit" }}>
                    {mutSeedCategories.isPending ? "Cargando..." : "✨ Cargar categorías predeterminadas"}
                  </button>
                </div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {categories.map(c => (
                  <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background: V.surfaceAlt, borderRadius:9, border:`1px solid ${V.border}` }}>
                    <span style={{ fontSize:18 }}>{c.icon}</span>
                    <input
                      key={c.id}
                      defaultValue={c.label}
                      onBlur={e => {
                        if (e.target.value.trim() && e.target.value.trim() !== c.label)
                          mutUpdateCategory.mutate({ id:c.id, data:{ label:e.target.value.trim() } });
                      }}
                      style={{ flex:1, background:"none", border:"none", fontFamily:"inherit", fontSize:14, fontWeight:600, color: V.text, outline:"none" }}
                    />
                    <div style={{ width:16, height:16, borderRadius:"50%", background:c.color, flexShrink:0 }} />
                    <button onClick={() => setDeletingCategory(c)} className={styles.btnDeleteSmall}>🗑️</button>
                  </div>
                ))}
              </div>

              {categories.length < 10 && (
                <button onClick={() => setAddCategoryOpen(true)} style={{ marginTop:10, background: V.surfaceAlt, border:`1.5px solid ${V.border}`, borderRadius:8, padding:"8px 14px", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, color: V.textMuted }}>
                  + Agregar categoría
                </button>
              )}
              {categories.length >= 10 && (
                <div style={{ marginTop:10, fontSize:12, color: V.textMuted }}>Límite de 10 categorías alcanzado.</div>
              )}
            </div>

            {/* Banks */}
            <div className="fh-card">
              <div className="fh-text" style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Bancos / Billeteras</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {bankRecords.map((b: BankRecord) => (
                  <div key={b.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background: V.surfaceAlt, borderRadius:9, border:`1px solid ${V.border}` }}>
                    <span style={{ fontSize:16 }}>🏦</span>
                    <input
                      defaultValue={b.name}
                      onBlur={e => {
                        const val = e.target.value.trim();
                        if (val && val !== b.name) mutUpdateBank.mutate({ id:b.id, data:{ name:val } });
                      }}
                      style={{ flex:1, background:"none", border:"none", fontFamily:"inherit", fontSize:14, fontWeight:600, color: V.text, outline:"none" }}
                    />
                    <button onClick={() => setDeletingBank(b)} className={styles.btnDeleteSmall}>🗑️</button>
                  </div>
                ))}
              </div>
              {bankRecords.length < 10 && (
                <button onClick={() => setAddBankOpen(true)} style={{ marginTop:10, background: V.surfaceAlt, border:`1.5px solid ${V.border}`, borderRadius:8, padding:"8px 14px", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, color: V.textMuted }}>
                  + Agregar banco
                </button>
              )}
              {bankRecords.length >= 10 && (
                <div style={{ marginTop:10, fontSize:12, color: V.textMuted }}>Límite de 10 bancos alcanzado.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* FAB mobile */}
      {!isDesktop && view !== "config" && (
        <button onClick={openAdd} style={{ position:"fixed", bottom:24, right:20, width:52, height:52, borderRadius:"50%", background:"#F7874F", border:"none", color:"#fff", fontSize:26, cursor:"pointer", boxShadow:"0 4px 16px #F7874F60", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
      )}

      {/* Modals */}
      <ModalIncome open={modal === "income"} income={income}
        onSave={async n => { await mutIncome.mutateAsync(n); setModal(null); }}
        onClose={() => setModal(null)} />

      <ModalExpense open={modal === "expense"} initial={editExpense} categories={categories} banks={banks}
        onSave={handleSaveExpense} onClose={() => setModal(null)} isMobile={isMobile} />

      <ModalImportExpenses
        open={importOpen} familyId={familyId}
        fromYear={fromYear} fromMonth={fromMonth}
        toMonthLabel={`${MONTHS[month]} ${year}`}
        currentExpenses={expenses}
        onClose={() => setImportOpen(false)}
        onImport={async ids => { await mutImport.mutateAsync({ fromYear, fromMonth, ids }); }}
      />

      <ModalAddItem
        open={addBankOpen} title="Nuevo banco / billetera" icon="🏦"
        placeholder="ej: BancoEstado, Tenpo, MercadoPago…"
        onClose={() => setAddBankOpen(false)}
        onSave={async name => { await mutCreateBank.mutateAsync({ name }); setAddBankOpen(false); }}
      />

      <ModalAddItem
        open={addCategoryOpen} title="Nueva categoría" icon="📁"
        placeholder="ej: Supermercado, Transporte, Salud…"
        onClose={() => setAddCategoryOpen(false)}
        onSave={async name => { await mutCreateCategory.mutateAsync({ label:name, icon:"📁", color:"#8A93A8" }); setAddCategoryOpen(false); }}
      />

      <ModalDeleteItem
        open={deletingBank !== null} itemName={deletingBank?.name ?? ""}
        onClose={() => setDeletingBank(null)}
        onConfirm={async () => { await mutDeleteBank.mutateAsync(deletingBank!.id); setDeletingBank(null); }}
      />

      <ModalDeleteItem
        open={deletingCategory !== null} itemName={deletingCategory?.label ?? ""}
        onClose={() => setDeletingCategory(null)}
        onConfirm={async () => { await mutDeleteCategory.mutateAsync(deletingCategory!.id); setDeletingCategory(null); }}
      />

      <ConfirmDialog
        open={modal === "del" && !!deleteTarget}
        title={`¿Eliminar "${deleteTarget?.name ?? ""}"?`}
        description="Esta acción no se puede deshacer."
        onClose={() => setModal(null)}
        onConfirm={async () => { if (deleteTarget) await mutDelete.mutateAsync({ id: deleteTarget.id }); setModal(null); }}
      />
    </DashboardLayout>
  );
}
