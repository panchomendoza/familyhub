import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/lib/theme";
import { useWindowWidth } from "@/hooks/useWindowWidth";
import { useAuthStore } from "@/stores/auth.store";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { FieldError as FErr } from "@/components/ui/FieldError";
import { StockSkeleton } from "@/components/ui/DashboardSkeletons";
import { parseApiError, type ValidationErrors } from "@/lib/apiErrors";
import {
  useMedicines, useTreatmentPlans,
  useCreateMedicine, useUpdateMedicine, useAdjustMedicineQuantity, useDeleteMedicine,
  useCreatePlan, useUpdatePlan, useDeletePlan,
  type MedicineInput, type PlanInput,
} from "@/hooks/useMedicines";
import type { Medicine, TreatmentPlan } from "@familyhub/types";
import styles from "./MedicinesDashboard.module.css";

/* ════════════════════════════════════
   Types
   ════════════════════════════════════ */

type MedUnit     = "comprimidos" | "cápsulas" | "ml" | "sobres" | "gotas" | "parches" | "unidades";
type MedLocation = "Botiquín" | "Refrigerador" | "Maletín viaje" | "Cajón baño" | "Otro";
type MedView     = "all" | "expiring" | "restock" | "expired" | "plans" | "disposed";

interface MedCategory { id: string; label: string; icon: string; color: string; }

// Medicine y TreatmentPlan vienen de @familyhub/types (persistidos vía API)

type MedForm = {
  name: string; categoryId: string; dosage: string;
  quantity: string; minimum: string; unit: string;
  expiryDate: string; location: string; forMember: string;
  frequencyHours: string; indications: string;
  requiresPrescription: boolean;
  notes: string;
};

type PlanForm = {
  name: string; forMember: string; prescribedBy: string;
  startDate: string; days: string; notes: string;
};

type EntryForm = {
  medicineId: string; frequencyHours: string;
  reminderTimes: string[]; unitsPerDose: string; notes: string;
};

/* ════════════════════════════════════
   Constants
   ════════════════════════════════════ */

const CATEGORIES: MedCategory[] = [
  { id: "analgesicos",  label: "Analgésicos",  icon: "💊", color: "#E5534B" },
  { id: "antibioticos", label: "Antibióticos", icon: "🦠", color: "#F7874F" },
  { id: "vitaminas",    label: "Vitaminas",    icon: "🌿", color: "#34C78A" },
  { id: "topicos",      label: "Tópicos",      icon: "🩹", color: "#4F7BF7" },
  { id: "digestivos",   label: "Digestivos",   icon: "🧪", color: "#A44FF7" },
  { id: "otros",        label: "Otros",        icon: "🏥", color: "#8A93A8" },
];

const UNITS: MedUnit[]         = ["comprimidos", "cápsulas", "ml", "sobres", "gotas", "parches", "unidades"];
const LOCATIONS: MedLocation[] = ["Botiquín", "Refrigerador", "Maletín viaje", "Cajón baño", "Otro"];
const FREQ_PRESETS = [
  { hours: 4,   label: "Cada 4h  (6×/día)" },
  { hours: 6,   label: "Cada 6h  (4×/día)" },
  { hours: 8,   label: "Cada 8h  (3×/día)" },
  { hours: 12,  label: "Cada 12h (2×/día)" },
  { hours: 24,  label: "Cada 24h (1×/día)" },
  { hours: 48,  label: "Cada 48h" },
  { hours: 72,  label: "Cada 3 días" },
  { hours: 168, label: "Semanal" },
  { hours: 0,   label: "Según necesidad" },
];
const PLAN_DURATIONS = [3, 5, 7, 10, 14, 21, 30];
const PAGE_SIZE = 8;

const EMPTY_MED_FORM: MedForm = {
  name: "", categoryId: "analgesicos", dosage: "",
  quantity: "0", minimum: "1", unit: "comprimidos",
  expiryDate: "", location: "Botiquín", forMember: "",
  frequencyHours: "", indications: "", requiresPrescription: false,
  notes: "",
};

const EMPTY_PLAN_FORM: PlanForm = {
  name: "", forMember: "", prescribedBy: "",
  startDate: new Date().toISOString().split("T")[0]!, days: "7", notes: "",
};

/* ════════════════════════════════════
   Helpers
   ════════════════════════════════════ */

const C = {
  ok:      "#34C78A",
  warn:    "#F7874F",
  danger:  "#E5534B",
  neutral: "#8A93A8",
} as const;

function expiryStatus(dateStr: string) {
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr + "T00:00:00");
  const days   = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0)   return { label: "Vencida",           color: C.danger, bg: C.danger + "14", urgent: true,  days };
  if (days <= 30) return { label: `Vence en ${days}d`, color: C.warn,   bg: C.warn   + "14", urgent: true,  days };
  return           { label: "Vigente",                 color: C.ok,     bg: C.ok     + "14", urgent: false, days };
}

function getPlanStatus(plan: TreatmentPlan) {
  if (plan.days === null) {
    return { label: "∞ Crónico", color: C.ok, bg: C.ok + "14", active: true, progress: 100 };
  }
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const start    = new Date(plan.startDate + "T00:00:00");
  const end      = new Date(start.getTime() + plan.days * 86_400_000);
  const elapsed  = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000));
  const left     = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  const progress = Math.min(100, Math.round((elapsed / plan.days) * 100));
  if (today < start) return {
    label: `Inicia ${start.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}`,
    color: C.neutral, bg: C.neutral + "14", active: false, progress: 0,
  };
  if (today <= end) {
    const color = left <= 3 ? C.warn : C.ok;
    return { label: `${left}d restantes`, color, bg: color + "14", active: true, progress };
  }
  return { label: "Completado", color: C.ok, bg: C.ok + "14", active: false, progress: 100 };
}

function cardBorderColor(med: Medicine) {
  const exp = expiryStatus(med.expiryDate);
  if (exp.days < 0)               return C.danger;
  if (exp.days <= 30)             return C.warn;
  if (med.quantity < med.minimum) return C.warn;
  return C.ok;
}

function frequencyLabel(hours: number): string {
  const preset = FREQ_PRESETS.find(p => p.hours === hours);
  if (preset) return preset.label;
  if (hours === 0) return "Según necesidad";
  if (hours < 24)  return `Cada ${hours}h`;
  const days = hours / 24;
  return Number.isInteger(days) ? `Cada ${days} días` : `Cada ${hours}h`;
}

function dosesPerDay(hours: number): number {
  if (hours <= 0 || hours >= 24) return 1;
  return Math.floor(24 / hours);
}

function defaultReminderTimes(hours: number): string[] {
  const count = dosesPerDay(hours);
  const intervalMin = Math.floor((24 * 60) / count);
  const baseMin     = 8 * 60;
  return Array.from({ length: count }, (_, i) => {
    const total = (baseMin + i * intervalMin) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  });
}

function calcDeduction(entry: EntryForm, planDays: string): number {
  const days = Number(planDays);
  if (!days || planDays === "0") return 0;
  const h = Number(entry.frequencyHours);
  if (!h || h === 0) return 0;
  const dpd = h < 24 ? Math.floor(24 / h) : 1 / (h / 24);
  return Math.ceil(days * dpd) * Math.max(1, Number(entry.unitsPerDose) || 1);
}

// iCal helpers
function toLocalICS(dateStr: string, timeStr: string) {
  return dateStr.replace(/-/g, "") + "T" + timeStr.replace(":", "") + "00";
}

function generatePlanICS(plan: TreatmentPlan, medicines: Medicine[]): string {
  const { startDate, days } = plan;
  const events: string[] = [];

  for (const entry of plan.entries) {
    const med = medicines.find(m => m.id === entry.medicineId);
    if (!med || entry.frequencyHours === 0) continue;
    const h = entry.frequencyHours;

    const rruleBase = h >= 168
      ? "RRULE:FREQ=WEEKLY"
      : h >= 48 ? `RRULE:FREQ=DAILY;INTERVAL=${Math.round(h / 24)}`
      : "RRULE:FREQ=DAILY";
    const count  = days ? (h >= 24 ? Math.ceil(days / (h / 24)) : days) : null;
    const rrule  = count ? `${rruleBase};COUNT=${count}` : rruleBase;

    const desc = [
      `Plan: ${plan.name}`,
      `Frecuencia: ${frequencyLabel(h)}`,
      entry.notes    && `Notas: ${entry.notes}`,
      med.indications && `Indicaciones: ${med.indications}`,
      plan.forMember !== "Familia" && `Para: ${plan.forMember}`,
      plan.prescribedBy            && `Médico: ${plan.prescribedBy}`,
    ].filter(Boolean).join("\\n");

    const times = entry.reminderTimes.length > 0 ? entry.reminderTimes : ["08:00"];
    times.forEach((time, idx) => {
      const [hh, mm] = time.split(":").map(Number);
      const endMin   = ((hh ?? 8) * 60 + (mm ?? 0) + 15) % (24 * 60);
      const endH     = String(Math.floor(endMin / 60)).padStart(2, "0");
      const endM     = String(endMin % 60).padStart(2, "0");
      const suffix   = times.length > 1 ? ` (dosis ${idx + 1}/${times.length})` : "";
      events.push([
        "BEGIN:VEVENT",
        `DTSTART:${toLocalICS(startDate, time)}`,
        `DTEND:${toLocalICS(startDate, `${endH}:${endM}`)}`,
        rrule,
        `SUMMARY:💊 ${med.name}${med.dosage ? " " + med.dosage : ""}${suffix}`,
        `DESCRIPTION:${desc}`,
        `UID:${plan.id}-${entry.medicineId}-${idx}@familyhub`,
        "BEGIN:VALARM", "ACTION:DISPLAY",
        "DESCRIPTION:Recordatorio de medicamento", "TRIGGER:-PT0M",
        "END:VALARM", "END:VEVENT",
      ].join("\r\n"));
    });
  }

  return ["BEGIN:VCALENDAR", "VERSION:2.0",
    `X-WR-CALNAME:${plan.name}`,
    "PRODID:-//FamilyHub//Medicines//ES", "CALSCALE:GREGORIAN",
    ...events, "END:VCALENDAR"].join("\r\n");
}

function downloadPlanICS(plan: TreatmentPlan, medicines: Medicine[]) {
  const content = generatePlanICS(plan, medicines);
  if (!content) return;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: `${plan.name.replace(/\s+/g, "_")}.ics` });
  a.click();
  URL.revokeObjectURL(url);
}

function googleCalendarUrlForPlan(plan: TreatmentPlan, medicines: Medicine[]): string {
  const entry = plan.entries.find(e => e.reminderTimes.length > 0 && e.frequencyHours > 0);
  if (!entry) return "";
  const med = medicines.find(m => m.id === entry.medicineId);
  if (!med) return "";
  const time  = entry.reminderTimes[0]!;
  const start = new Date(`${plan.startDate}T${time}:00`);
  const end   = new Date(start.getTime() + 15 * 60_000);
  const fmt   = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const allMeds = plan.entries
    .map(e => medicines.find(m => m.id === e.medicineId))
    .filter((m): m is Medicine => !!m)
    .map(m => `${m.name}${m.dosage ? " " + m.dosage : ""}`)
    .join(", ");
  const desc = [
    `Plan: ${plan.name}`,
    `Medicamentos: ${allMeds}`,
    plan.forMember !== "Familia" && `Para: ${plan.forMember}`,
    plan.prescribedBy            && `Médico: ${plan.prescribedBy}`,
    plan.days ? `Duración: ${plan.days} días` : "Crónico",
    "Para todos los horarios descarga el archivo .ics",
  ].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    action:  "TEMPLATE",
    text:    `💊 ${plan.name}`,
    details: desc,
    dates:   `${fmt(start)}/${fmt(end)}`,
    recur:   plan.days ? `RRULE:FREQ=DAILY;COUNT=${plan.days}` : "RRULE:FREQ=DAILY",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateReminderICS(plan: TreatmentPlan, medicines: Medicine[]): string {
  const { startDate, days } = plan;
  const todos: string[] = [];

  for (const entry of plan.entries) {
    const med = medicines.find(m => m.id === entry.medicineId);
    if (!med || entry.frequencyHours === 0) continue;
    const h = entry.frequencyHours;

    const rruleBase = h >= 168
      ? "RRULE:FREQ=WEEKLY"
      : h >= 48 ? `RRULE:FREQ=DAILY;INTERVAL=${Math.round(h / 24)}`
      : "RRULE:FREQ=DAILY";
    const count = days ? (h >= 24 ? Math.ceil(days / (h / 24)) : days) : null;
    const rrule = count ? `${rruleBase};COUNT=${count}` : rruleBase;

    const desc = [
      `Plan: ${plan.name}`,
      `Frecuencia: ${frequencyLabel(h)}`,
      entry.notes     && `Notas: ${entry.notes}`,
      med.indications && `Indicaciones: ${med.indications}`,
      plan.forMember  && `Para: ${plan.forMember}`,
      plan.prescribedBy && `Médico: ${plan.prescribedBy}`,
    ].filter(Boolean).join("\\n");

    const times = entry.reminderTimes.length > 0 ? entry.reminderTimes : ["08:00"];
    times.forEach((time, idx) => {
      const suffix = times.length > 1 ? ` (dosis ${idx + 1}/${times.length})` : "";
      todos.push([
        "BEGIN:VTODO",
        `DTSTART:${toLocalICS(startDate, time)}`,
        `DUE:${toLocalICS(startDate, time)}`,
        rrule,
        `SUMMARY:💊 ${med.name}${med.dosage ? " " + med.dosage : ""}${suffix}`,
        `DESCRIPTION:${desc}`,
        `UID:rem-${plan.id}-${entry.medicineId}-${idx}@familyhub`,
        "BEGIN:VALARM", "ACTION:DISPLAY",
        "DESCRIPTION:Tomar medicamento", "TRIGGER:PT0S",
        "END:VALARM", "END:VTODO",
      ].join("\r\n"));
    });
  }

  if (!todos.length) return "";
  return ["BEGIN:VCALENDAR", "VERSION:2.0",
    `X-WR-CALNAME:${plan.name} — Recordatorios`,
    "PRODID:-//FamilyHub//Medicines//ES", "CALSCALE:GREGORIAN",
    ...todos, "END:VCALENDAR"].join("\r\n");
}

function downloadReminderICS(plan: TreatmentPlan, medicines: Medicine[]) {
  const content = generateReminderICS(plan, medicines);
  if (!content) return;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url, download: `${plan.name.replace(/\s+/g, "_")}_recordatorios.ics`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

function shareRestockWhatsApp(restock: Medicine[]) {
  const date = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
  let text = `💊 *Medicamentos a reponer* — ${date}\n_Generado desde FamilyHub_\n\n`;
  CATEGORIES.forEach(cat => {
    const items = restock.filter(m => m.categoryId === cat.id);
    if (!items.length) return;
    text += `*${cat.icon} ${cat.label}*\n`;
    items.forEach(m => {
      text += `${m.quantity <= 0 ? "❌" : "⚠️"} ${m.name}`;
      if (m.dosage) text += ` ${m.dosage}`;
      text += ` — stock: ${m.quantity}/${m.minimum} ${m.unit}`;
      if (m.frequencyHours != null) text += ` · ${frequencyLabel(m.frequencyHours)}`;
      if (m.forMember !== "Familia") text += ` · ${m.forMember}`;
      if (m.requiresPrescription) text += " 📋 receta";
      text += "\n";
    });
    text += "\n";
  });
  text += `_Total: ${restock.length} medicamento${restock.length !== 1 ? "s" : ""}_`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

function formToMedicine(form: MedForm): MedicineInput {
  // Los campos opcionales se envían siempre (null si están vacíos) para poder limpiarlos al editar
  return {
    name:                 form.name.trim(),
    categoryId:           form.categoryId,
    dosage:               form.dosage.trim(),
    quantity:             Number(form.quantity) || 0,
    minimum:              Number(form.minimum) || 0,
    unit:                 form.unit,
    expiryDate:           form.expiryDate,
    location:             form.location,
    forMember:            form.forMember.trim() || "Familia",
    frequencyHours:       form.frequencyHours === "" ? null : Number(form.frequencyHours),
    indications:          form.indications.trim() || null,
    requiresPrescription: form.requiresPrescription,
    notes:                form.notes.trim() || null,
  };
}

/* ════════════════════════════════════
   AlertBanner
   ════════════════════════════════════ */

function AlertBanner({ expiredCount, expiringCount, onViewExpired, onViewExpiring }: {
  expiredCount: number; expiringCount: number;
  onViewExpired: () => void; onViewExpiring: () => void;
}) {
  if (!expiredCount && !expiringCount) return null;
  return (
    <div className={styles.alertBanner}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
      <div className={styles.alertBannerText}>
        {expiredCount > 0 && (
          <span><strong>{expiredCount}</strong> medicamento{expiredCount !== 1 ? "s" : ""} vencido{expiredCount !== 1 ? "s" : ""}</span>
        )}
        {expiredCount > 0 && expiringCount > 0 && <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>}
        {expiringCount > 0 && (
          <span><strong>{expiringCount}</strong> vence{expiringCount !== 1 ? "n" : ""} en 30 días</span>
        )}
      </div>
      <div className={styles.alertBannerActions}>
        {expiredCount  > 0 && <button onClick={onViewExpired}>Ver vencidos →</button>}
        {expiringCount > 0 && <button onClick={onViewExpiring}>Ver alertas →</button>}
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   MedicineCard
   ════════════════════════════════════ */

function MedicineCard({ med, cat, linkedPlans, isDisposedView, onEdit, onDispose, onRestore, onDelete, onAdjust }: {
  med: Medicine; cat: MedCategory | undefined;
  linkedPlans: TreatmentPlan[];
  isDisposedView: boolean;
  onEdit:    (m: Medicine) => void;
  onDispose: (m: Medicine) => void;
  onRestore: (m: Medicine) => void;
  onDelete:  (m: Medicine) => void;
  onAdjust:  (id: string, delta: number) => void;
}) {
  const exp       = expiryStatus(med.expiryDate);
  const stockOk   = med.quantity >= med.minimum;
  const borderCol = isDisposedView ? "#8A93A8" : cardBorderColor(med);

  return (
    <div className={`${styles.itemCard} ${isDisposedView ? styles.itemCardDisposed : ""}`} style={{ borderLeftColor: borderCol }}>
      <div className={styles.catIconSm} style={{ background: (cat?.color ?? "#8A93A8") + "18" }}>
        {cat?.icon ?? "💊"}
      </div>

      <div className={styles.itemInfo}>
        <div className={styles.itemHeader}>
          <span className={styles.itemName}>
            {med.name}
            {med.dosage && <span className={styles.itemDosage}> · {med.dosage}</span>}
          </span>
          {isDisposedView ? (
            <span className={styles.itemStatusBadge} style={{ color: "#8A93A8", background: "#8A93A814", borderColor: "#8A93A830" }}>Desechada</span>
          ) : (
            <>
              <span className={styles.itemStatusBadge} style={{ color: exp.color, background: exp.bg, borderColor: exp.color + "40" }}>{exp.label}</span>
              {!stockOk && (
                <span className={styles.itemStatusBadge} style={{ color: C.warn, background: C.warn + "14", borderColor: C.warn + "40" }}>
                  {med.quantity === 0 ? "Sin stock" : "Bajo stock"}
                </span>
              )}
            </>
          )}
          {med.requiresPrescription && <span className={styles.prescBadge}>📋 Receta</span>}
        </div>

        <div className={styles.itemMeta}>
          {cat && <span className={styles.itemMetaText} style={{ color: cat.color }}>{cat.icon} {cat.label}</span>}
          <span className={styles.itemMetaText}>📍 {med.location}</span>
          {med.forMember !== "Familia" && <span className={styles.itemMetaText}>👤 {med.forMember}</span>}
          {med.frequencyHours != null && (
            <span className={styles.itemMetaText}>🕐 {frequencyLabel(med.frequencyHours)}</span>
          )}
        </div>

        {/* Linked treatment plans */}
        {!isDisposedView && linkedPlans.length > 0 && (
          <div className={styles.planSection}>
            {linkedPlans.map(p => {
              const ps = getPlanStatus(p);
              return (
                <span key={p.id} className={styles.planBadge}
                  style={{ color: ps.color, background: ps.bg, borderColor: ps.color + "40" }}>
                  📋 {p.name} · {ps.label}
                </span>
              );
            })}
          </div>
        )}

        {!isDisposedView && med.indications && (
          <p className={styles.itemMetaText} style={{ marginTop: 6, fontStyle: "italic" }}>💬 {med.indications}</p>
        )}
      </div>

      <div className={styles.itemRight}>
        {!isDisposedView && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => onAdjust(med.id, -1)} className="fh-btn fh-btn-ghost" style={{ width: 28, height: 28, padding: 0, borderRadius: 7, fontSize: 16 }}>−</button>
            <span style={{ minWidth: 34, textAlign: "center", fontWeight: 800, fontSize: 16, color: borderCol }}>{med.quantity}</span>
            <button onClick={() => onAdjust(med.id, +1)} className="fh-btn fh-btn-ghost" style={{ width: 28, height: 28, padding: 0, borderRadius: 7, fontSize: 16 }}>+</button>
            <span className={styles.itemMetaText} style={{ minWidth: 52 }}>{med.unit}</span>
          </div>
        )}

        <div className={styles.itemActions}>
          {isDisposedView ? (
            <>
              <button onClick={() => onRestore(med)} className={`${styles.btnIconSm} ${styles.btnIconRestore}`} title="Restaurar">🔄</button>
              <button onClick={() => onDelete(med)}  className={`${styles.btnIconSm} ${styles.btnIconDanger}`} title="Eliminar definitivamente">🗑️</button>
            </>
          ) : (
            <>
              <button onClick={() => onEdit(med)}    className={styles.btnIconSm}                              title="Editar">✏️</button>
              <button onClick={() => onDispose(med)} className={`${styles.btnIconSm} ${styles.btnIconDanger}`} title="Marcar como desechada">🚮</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   PlanCard
   ════════════════════════════════════ */

function PlanCard({ plan, medicines, onEdit, onArchive, onDownloadICS, onOpenGoogle, onDownloadReminder }: {
  plan: TreatmentPlan; medicines: Medicine[];
  onEdit:              (p: TreatmentPlan) => void;
  onArchive:           (p: TreatmentPlan) => void;
  onDownloadICS:       (p: TreatmentPlan) => void;
  onOpenGoogle:        (p: TreatmentPlan) => void;
  onDownloadReminder:  (p: TreatmentPlan) => void;
}) {
  const ps              = getPlanStatus(plan);
  const [showReminderTip, setShowReminderTip] = useState(false);

  const planMeds = plan.entries.map(e => {
    const med = medicines.find(m => m.id === e.medicineId);
    return med ? { entry: e, med } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className={styles.planCard}>
      <div className={styles.planCardHeader}>
        <div className={styles.planCardMeta}>
          <span className={styles.planCardName}>{plan.name}</span>
          <div className={styles.planCardInfo}>
            <span>👤 {plan.forMember}</span>
            {plan.prescribedBy && <span>🩺 {plan.prescribedBy}</span>}
            <span>📅 {plan.startDate}</span>
            {plan.days != null ? <span>⏱ {plan.days}d</span> : <span>∞ Crónico</span>}
          </div>
        </div>
        <span className={styles.planCardBadge} style={{ color: ps.color, background: ps.bg, borderColor: ps.color + "40" }}>
          {ps.label}
        </span>
      </div>

      {plan.days !== null && (
        <div className={styles.planProgressTrack}>
          <div className={styles.planProgressFill} style={{ width: `${ps.progress}%`, background: ps.color }} />
        </div>
      )}

      <div className={styles.planMedList}>
        {planMeds.map(({ entry, med }) => {
          const cat = CATEGORIES.find(c => c.id === med.categoryId);
          return (
            <div key={entry.medicineId} className={styles.planMedRow}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{cat?.icon ?? "💊"}</span>
              <div className={styles.planMedInfo}>
                <span className={styles.planMedName}>{med.name}{med.dosage ? ` ${med.dosage}` : ""}</span>
                {entry.frequencyHours > 0
                  ? <span className={styles.planMedFreq}>{frequencyLabel(entry.frequencyHours)}{entry.reminderTimes.length > 0 ? ` · ${entry.reminderTimes.join(", ")}` : ""}</span>
                  : <span className={styles.planMedFreq}>Según necesidad</span>}
              </div>
            </div>
          );
        })}
      </div>

      {plan.notes && <p className={styles.planCardNotes}>💬 {plan.notes}</p>}

      <div className={styles.planCardActions}>
        <button onClick={() => onDownloadICS(plan)} className={`${styles.calBtn} ${styles.calBtnIcs}`}>⬇ .ics</button>
        <button onClick={() => onOpenGoogle(plan)}  className={`${styles.calBtn} ${styles.calBtnGoogle}`}>📆 Google</button>
        <button onClick={() => onDownloadReminder(plan)} className={`${styles.calBtn} ${styles.calBtnReminder}`}>🔔 Recordatorio</button>
        <div style={{ position: "relative" }}>
          <button className={styles.reminderInfoBtn} onClick={() => setShowReminderTip(v => !v)} title="¿Cómo usar el recordatorio?">?</button>
          {showReminderTip && (
            <div className={styles.reminderTip}>
              <button className={styles.reminderTipClose} onClick={() => setShowReminderTip(false)}>✕</button>
              <p className={styles.reminderTipTitle}>¿Cómo agregar a Recordatorios?</p>
              <p className={styles.reminderTipItem}>📱 <strong>iPhone:</strong> comparte el archivo por AirDrop o email y ábrelo en tu iPhone — iOS pregunta si lo agregas a Recordatorios.</p>
              <p className={styles.reminderTipItem}>💻 <strong>Mac:</strong> abre la app Recordatorios → <em>Archivo &gt; Importar</em> → selecciona el archivo descargado.</p>
              <p className={styles.reminderTipItem}>🤖 <strong>Android:</strong> Google Calendar no soporta este formato. Instala <em>Tasks.org</em> (gratis) e importa el archivo desde la app.</p>
              <p className={styles.reminderTipItem}>🪟 <strong>Windows:</strong> abre Outlook → <em>Archivo &gt; Abrir e importar &gt; Importar/Exportar</em> → selecciona el archivo. Se agrega como tarea.</p>
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => onEdit(plan)}    className={styles.btnIconSm} title="Editar">✏️</button>
        <button onClick={() => onArchive(plan)} className={`${styles.btnIconSm} ${styles.btnIconDanger}`} title={plan.archived ? "Eliminar" : "Archivar"}>🗄️</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   ModalMedicine  (simplified — no plan section)
   ════════════════════════════════════ */

function ModalMedicine({ open, initial, memberOptions, onSave, onClose, apiErrors, isSaving }: {
  open: boolean; initial: Medicine | null;
  memberOptions: string[];
  onSave: (data: MedicineInput) => void;
  onClose: () => void;
  apiErrors?: ValidationErrors | null;
  isSaving?: boolean;
}) {
  const [form,   setForm]   = useState<MedForm>(EMPTY_MED_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(initial ? {
      name: initial.name, categoryId: initial.categoryId, dosage: initial.dosage,
      quantity: String(initial.quantity), minimum: String(initial.minimum), unit: initial.unit,
      expiryDate: initial.expiryDate, location: initial.location, forMember: initial.forMember,
      frequencyHours: initial.frequencyHours != null ? String(initial.frequencyHours) : "",
      indications: initial.indications ?? "", requiresPrescription: initial.requiresPrescription ?? false,
      notes: initial.notes ?? "",
    } : { ...EMPTY_MED_FORM });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: keyof MedForm, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));
  const f   = (k: keyof MedForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k, e.target.value);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim())         e.name       = "Obligatorio";
    if (!form.categoryId)          e.categoryId = "Selecciona una categoría";
    if (Number(form.quantity) < 0) e.quantity   = "No puede ser negativo";
    if (Number(form.minimum)  < 0) e.minimum    = "No puede ser negativo";
    if (!form.expiryDate)          e.expiryDate = "Obligatorio";
    setErrors(e);
    return !Object.keys(e).length;
  }

  const expPreview = form.expiryDate ? expiryStatus(form.expiryDate) : null;

  return (
    <Modal open={open} onClose={onClose} maxWidth={540}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }} className="fh-text">{initial ? "Editar medicina" : "Agregar medicina"}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }} className="fh-text-muted">✕</button>
      </div>

      {apiErrors?.message && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: C.danger + "14", border: `1px solid ${C.danger}40`, borderRadius: 10, fontSize: 13, color: C.danger, fontWeight: 600 }}>
          ⚠️ {apiErrors.message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3.5">
        <div className="col-span-full mb-3">
          <label className={styles.formLabel}>Nombre</label>
          <input autoFocus className="fh-input" placeholder="Ej: Paracetamol, Vitamina C..." value={form.name} onChange={f("name")} />
          <FErr msg={errors.name} />
        </div>

        <div className="mb-3">
          <label className={styles.formLabel}>Categoría</label>
          <select className="fh-input" value={form.categoryId} onChange={f("categoryId")}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          <FErr msg={errors.categoryId} />
        </div>
        <div className="mb-3">
          <label className={styles.formLabel}>Dosis (opcional)</label>
          <input className="fh-input" placeholder="Ej: 500mg, 10mg/5ml" value={form.dosage} onChange={f("dosage")} />
        </div>

        <div className="mb-3">
          <label className={styles.formLabel}>Cantidad actual</label>
          <input className="fh-input" type="number" min="0" value={form.quantity} onChange={f("quantity")} />
          <FErr msg={errors.quantity} />
        </div>
        <div className="mb-3">
          <label className={styles.formLabel}>Unidad</label>
          <select className="fh-input" value={form.unit} onChange={f("unit")}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        <div className="mb-3">
          <label className={styles.formLabel}>Stock mínimo</label>
          <input className="fh-input" type="number" min="0" value={form.minimum} onChange={f("minimum")} />
          <FErr msg={errors.minimum} />
        </div>
        <div className="mb-3">
          <label className={styles.formLabel}>Fecha de vencimiento</label>
          <input className="fh-input" type="date" value={form.expiryDate} onChange={f("expiryDate")} />
          {expPreview && <p style={{ fontSize: 11, color: expPreview.color, marginTop: 4, fontWeight: 600 }}>{expPreview.label}</p>}
          <FErr msg={errors.expiryDate} />
        </div>

        <div className="mb-3">
          <label className={styles.formLabel}>Frecuencia habitual</label>
          <select className="fh-input" value={form.frequencyHours} onChange={f("frequencyHours")}>
            <option value="">Sin especificar</option>
            {FREQ_PRESETS.map(p => <option key={p.hours} value={String(p.hours)}>{p.label}</option>)}
          </select>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>Se usa como sugerencia al agregar al plan</p>
        </div>
        <div className="mb-3">
          <label className={styles.formLabel}>Ubicación</label>
          <select className="fh-input" value={form.location} onChange={f("location")}>
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="mb-3">
          <label className={styles.formLabel}>Para</label>
          <input className="fh-input" placeholder="Nombre de quien lo toma" value={form.forMember} onChange={f("forMember")} />
        </div>
        <div className="mb-3">
          <label className={styles.formLabel}>Indicaciones (opcional)</label>
          <input className="fh-input" placeholder='Ej: "Tomar con comida"' value={form.indications} onChange={f("indications")} />
        </div>

        <div className="col-span-full mb-4">
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={form.requiresPrescription} onChange={e => set("requiresPrescription", e.target.checked)} style={{ width: 16, height: 16, accentColor: C.danger }} />
            <span style={{ fontSize: 13, color: "var(--text)" }}>📋 Requiere receta médica</span>
          </label>
        </div>

        <div className="col-span-full mb-3">
          <label className={styles.formLabel}>Notas (opcional)</label>
          <textarea className="fh-input" rows={2} value={form.notes} onChange={f("notes")} style={{ resize: "vertical" }} />
        </div>
      </div>

      <div className={styles.formActions}>
        <button onClick={onClose} className="fh-btn fh-btn-ghost">Cancelar</button>
        <button onClick={() => { if (validate()) onSave(formToMedicine(form)); }} disabled={isSaving}
          style={{ background: "#E5534B", color: "#fff", border: "none", borderRadius: 9, padding: "9px 20px", fontWeight: 700, fontSize: 14, cursor: isSaving ? "default" : "pointer", fontFamily: "inherit", opacity: isSaving ? 0.7 : 1 }}>
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════
   ModalPlan
   ════════════════════════════════════ */

function ModalPlan({ open, initial, medicines, memberOptions, onSave, onClose, apiErrors, isSaving }: {
  open: boolean; initial: TreatmentPlan | null;
  medicines: Medicine[]; memberOptions: string[];
  onSave:  (data: PlanInput) => void;
  onClose: () => void;
  apiErrors?: ValidationErrors | null;
  isSaving?: boolean;
}) {
  const W       = useWindowWidth();
  const isNarrow = W < 620;

  const [form,    setForm]    = useState<PlanForm>({ ...EMPTY_PLAN_FORM });
  const [entries, setEntries] = useState<EntryForm[]>([]);
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [medSearch,  setMedSearch]  = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({}); setMedSearch(""); setShowPicker(false);
    if (initial) {
      setForm({
        name: initial.name, forMember: initial.forMember,
        prescribedBy: initial.prescribedBy ?? "",
        startDate: initial.startDate,
        days: initial.days != null ? String(initial.days) : "0",
        notes: initial.notes ?? "",
      });
      setEntries(initial.entries.map(e => ({
        medicineId:     e.medicineId,
        frequencyHours: String(e.frequencyHours),
        reminderTimes:  [...e.reminderTimes],
        unitsPerDose:   String(e.unitsPerDose),
        notes:          e.notes ?? "",
      })));
    } else {
      setForm({ ...EMPTY_PLAN_FORM });
      setEntries([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fp = (k: keyof PlanForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));

  function addMedicine(med: Medicine) {
    if (entries.some(e => e.medicineId === med.id)) return;
    const h = med.frequencyHours != null && med.frequencyHours > 0 ? med.frequencyHours : 8;
    setEntries(prev => [...prev, {
      medicineId:     med.id,
      frequencyHours: String(h),
      reminderTimes:  defaultReminderTimes(h),
      unitsPerDose:   "1",
      notes:          "",
    }]);
    setShowPicker(false); setMedSearch("");
  }

  function removeEntry(medicineId: string) {
    setEntries(prev => prev.filter(e => e.medicineId !== medicineId));
  }

  function updateEntry(medicineId: string, updates: Partial<EntryForm>) {
    setEntries(prev => prev.map(e => e.medicineId === medicineId ? { ...e, ...updates } : e));
  }

  function handleFreqChange(medicineId: string, val: string) {
    const h = Number(val);
    setEntries(prev => prev.map(e => e.medicineId === medicineId ? {
      ...e,
      frequencyHours: val,
      reminderTimes:  h > 0 ? defaultReminderTimes(h) : [],
    } : e));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name    = "Obligatorio";
    if (!form.startDate)   e.startDate = "Obligatorio";
    if (entries.length === 0) e.entries = "Agrega al menos un medicamento al plan";
    setErrors(e);
    return !Object.keys(e).length;
  }

  function handleSave() {
    if (!validate()) return;
    // Opcionales siempre presentes (null si vacíos) para poder limpiarlos al editar
    onSave({
      name:         form.name.trim(),
      forMember:    form.forMember.trim() || "Familia",
      prescribedBy: form.prescribedBy.trim() || null,
      startDate:    form.startDate,
      days:         form.days === "0" ? null : Number(form.days),
      notes:        form.notes.trim() || null,
      entries:      entries.map(entry => ({
        medicineId:     entry.medicineId,
        frequencyHours: Number(entry.frequencyHours) || 0,
        reminderTimes:  entry.reminderTimes,
        unitsPerDose:   Number(entry.unitsPerDose) || 1,
        notes:          entry.notes.trim() || null,
      })),
    });
  }

  const availableMeds = useMemo(() => {
    const addedIds = new Set(entries.map(e => e.medicineId));
    return medicines.filter(m =>
      !m.disposed &&
      !addedIds.has(m.id) &&
      (medSearch === "" ||
        m.name.toLowerCase().includes(medSearch.toLowerCase()) ||
        m.dosage.toLowerCase().includes(medSearch.toLowerCase()))
    );
  }, [medicines, entries, medSearch]);

  return (
    <Modal open={open} onClose={onClose} maxWidth={700}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }} className="fh-text">
          {initial ? "Editar plan" : "Nuevo plan de medicación"}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }} className="fh-text-muted">✕</button>
      </div>

      {apiErrors?.message && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: C.danger + "14", border: `1px solid ${C.danger}40`, borderRadius: 10, fontSize: 13, color: C.danger, fontWeight: 600 }}>
          ⚠️ {apiErrors.message}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr", gap: 24, alignItems: "start" }}>

        {/* ── Left: plan info ── */}
        <div>
          <p className={styles.formLabel} style={{ fontSize: 11, marginBottom: 12 }}>INFORMACIÓN DEL PLAN</p>

          <div className="mb-3">
            <label className={styles.formLabel}>Nombre del plan</label>
            <input autoFocus className="fh-input" placeholder='Ej: "Antibiótico H. pylori"' value={form.name} onChange={fp("name")} />
            <FErr msg={errors.name} />
          </div>

          <div className="mb-3">
            <label className={styles.formLabel}>Para</label>
            <input className="fh-input" placeholder="Nombre de quien lo toma" value={form.forMember} onChange={fp("forMember")} />
          </div>

          <div className="mb-3">
            <label className={styles.formLabel}>Médico (opcional)</label>
            <input className="fh-input" placeholder="Dr. García" value={form.prescribedBy} onChange={fp("prescribedBy")} />
          </div>

          <div className="mb-3">
            <label className={styles.formLabel}>Fecha de inicio</label>
            <input className="fh-input" type="date" value={form.startDate} onChange={fp("startDate")} />
            <FErr msg={errors.startDate} />
          </div>

          <div className="mb-3">
            <label className={styles.formLabel}>Duración</label>
            <select className="fh-input" value={form.days} onChange={fp("days")}>
              {PLAN_DURATIONS.map(d => <option key={d} value={String(d)}>{d} días</option>)}
              <option value="0">Crónico (sin fecha fin)</option>
            </select>
          </div>

          <div className="mb-3">
            <label className={styles.formLabel}>Notas (opcional)</label>
            <textarea className="fh-input" rows={3} value={form.notes} onChange={fp("notes")} style={{ resize: "vertical" }} placeholder="Instrucciones del médico, observaciones..." />
          </div>
        </div>

        {/* ── Right: medicines ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p className={styles.formLabel} style={{ fontSize: 11, margin: 0 }}>MEDICAMENTOS</p>
            <button
              onClick={() => { setShowPicker(v => !v); if (!showPicker) setTimeout(() => searchRef.current?.focus(), 50); }}
              className="fh-btn fh-btn-ghost"
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              + Agregar
            </button>
          </div>
          <FErr msg={errors.entries} />

          {/* Picker */}
          {showPicker && (
            <div className={styles.medPickerBox}>
              <div style={{ position: "relative", marginBottom: 6 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.45 }}>🔍</span>
                <input
                  ref={searchRef}
                  className="fh-input"
                  placeholder="Buscar en el gabinete..."
                  value={medSearch}
                  onChange={e => setMedSearch(e.target.value)}
                  style={{ paddingLeft: 32, fontSize: 13 }}
                />
              </div>
              <div className={styles.medPickerList}>
                {availableMeds.length === 0
                  ? <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 4px", margin: 0 }}>
                      {medSearch ? "Sin resultados" : "Todos los medicamentos ya están en el plan"}
                    </p>
                  : availableMeds.map(med => {
                      const cat = CATEGORIES.find(c => c.id === med.categoryId);
                      return (
                        <button key={med.id} className={styles.medPickerItem} onClick={() => addMedicine(med)}>
                          <span>{cat?.icon ?? "💊"}</span>
                          <span style={{ flex: 1, textAlign: "left" }}>{med.name}{med.dosage ? ` ${med.dosage}` : ""}</span>
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{med.quantity} {med.unit}</span>
                        </button>
                      );
                    })}
              </div>
            </div>
          )}

          {entries.length === 0 && !showPicker && (
            <div style={{ textAlign: "center", padding: "28px 12px", background: "var(--surface-alt)", borderRadius: 12, border: "1.5px dashed var(--border)" }}>
              <p style={{ fontSize: 26, margin: "0 0 8px" }}>💊</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Agrega medicamentos al plan</p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: entries.length > 0 ? 8 : 0 }}>
            {entries.map(entry => {
              const med = medicines.find(m => m.id === entry.medicineId);
              if (!med) return null;
              const cat       = CATEGORIES.find(c => c.id === med.categoryId);
              const h         = Number(entry.frequencyHours);
              const deduction = calcDeduction(entry, form.days);
              const remaining = med.quantity - deduction;

              return (
                <div key={entry.medicineId} className={styles.planEntryBox}>
                  <div className={styles.planEntryHeader}>
                    <span>{cat?.icon ?? "💊"}</span>
                    <span className={styles.planEntryName}>{med.name}{med.dosage ? ` ${med.dosage}` : ""}</span>
                    <button onClick={() => removeEntry(entry.medicineId)} className={styles.btnIconSm} style={{ marginLeft: "auto", fontSize: 11 }}>✕</button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 8, marginTop: 8 }}>
                    <div>
                      <label className={styles.formLabel} style={{ fontSize: 10 }}>Frecuencia</label>
                      <select
                        className="fh-input"
                        value={entry.frequencyHours}
                        onChange={e => handleFreqChange(entry.medicineId, e.target.value)}
                        style={{ fontSize: 12 }}
                      >
                        <option value="">Sin especificar</option>
                        {FREQ_PRESETS.map(p => <option key={p.hours} value={String(p.hours)}>{p.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={styles.formLabel} style={{ fontSize: 10 }}>Por toma</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          className="fh-input"
                          type="number" min="1" max="20"
                          value={entry.unitsPerDose}
                          onChange={e => updateEntry(entry.medicineId, { unitsPerDose: e.target.value })}
                          style={{ width: 52, fontSize: 12, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{med.unit}</span>
                      </div>
                    </div>
                  </div>

                  {/* Reminder times */}
                  {h > 0 && entry.reminderTimes.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <label className={styles.formLabel} style={{ fontSize: 10 }}>
                        Horarios · {dosesPerDay(h)} toma{dosesPerDay(h) !== 1 ? "s" : ""}/día
                      </label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                        {entry.reminderTimes.map((time, i) => (
                          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {entry.reminderTimes.length > 1 && (
                              <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>T{i + 1}</span>
                            )}
                            <input
                              className="fh-input"
                              type="time"
                              value={time}
                              onChange={e => {
                                const newTimes = [...entry.reminderTimes];
                                newTimes[i] = e.target.value;
                                updateEntry(entry.medicineId, { reminderTimes: newTimes });
                              }}
                              style={{ width: 100, fontSize: 12 }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stock deduction preview */}
                  {deduction > 0 && (
                    <div className={styles.planStockPreview}
                      style={{ background: remaining < 0 ? C.danger + "14" : C.ok + "14", borderColor: remaining < 0 ? C.danger + "40" : C.ok + "40" }}>
                      <span style={{ fontSize: 10 }}>
                        {remaining < 0 ? "⚠️" : "📦"}
                        {" "}<strong>Deduce:</strong> {deduction} {med.unit} · Stock: {med.quantity} → {remaining} {med.unit}
                        {remaining < 0 && <strong style={{ color: C.danger }}> (insuficiente)</strong>}
                      </span>
                    </div>
                  )}
                  {form.days === "0" && h > 0 && (
                    <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "4px 0 0" }}>
                      Plan crónico · el stock no se descuenta automáticamente
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.formActions} style={{ marginTop: 20 }}>
        {!initial && entries.some(e => calcDeduction(e, form.days) > 0) && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", flex: 1, margin: 0 }}>
            Al crear se descontará el stock calculado
          </p>
        )}
        {initial && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", flex: 1, margin: 0 }}>
            El stock no se recalcula al editar
          </p>
        )}
        <button onClick={onClose} className="fh-btn fh-btn-ghost">Cancelar</button>
        <button onClick={handleSave} disabled={isSaving}
          style={{ background: "#E5534B", color: "#fff", border: "none", borderRadius: 9, padding: "9px 20px", fontWeight: 700, fontSize: 14, cursor: isSaving ? "default" : "pointer", fontFamily: "inherit", opacity: isSaving ? 0.7 : 1 }}>
          {isSaving ? "Guardando..." : initial ? "Guardar cambios" : "Crear plan"}
        </button>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════
   MedicinesDashboard
   ════════════════════════════════════ */

export default function MedicinesDashboard() {
  const navigate = useNavigate();
  const { isDark, toggle: toggleTheme } = useTheme();
  const W           = useWindowWidth();
  const isDesktop   = W >= 1024;
  const isMobile    = W < 640;
  const { currentFamily } = useAuthStore();
  const familyId = currentFamily?.id;

  const { data: medicines = [],  isLoading: medsLoading }  = useMedicines(familyId);
  const { data: treatPlans = [], isLoading: plansLoading } = useTreatmentPlans(familyId);
  const isLoading = medsLoading || plansLoading;

  const mutCreateMed  = useCreateMedicine(familyId);
  const mutUpdateMed  = useUpdateMedicine(familyId);
  const mutAdjustMed  = useAdjustMedicineQuantity(familyId);
  const mutDeleteMed  = useDeleteMedicine(familyId);
  const mutCreatePlan = useCreatePlan(familyId);
  const mutUpdatePlan = useUpdatePlan(familyId);
  const mutDeletePlan = useDeletePlan(familyId);

  const [medFormErrors,  setMedFormErrors]  = useState<ValidationErrors | null>(null);
  const [planFormErrors, setPlanFormErrors] = useState<ValidationErrors | null>(null);

  const [view,        setView]        = useState<MedView>("all");
  const [activeCat,   setActiveCat]   = useState<string>("all");
  const [query,       setQuery]       = useState("");
  const [page,        setPage]        = useState(1);
  const [drawerOpen,  setDrawer]      = useState(false);

  const [medModalOpen,  setMedModalOpen]  = useState(false);
  const [editMed,       setEditMed]       = useState<Medicine | null>(null);
  const [delMed,        setDelMed]        = useState<Medicine | null>(null);
  const [disposeMed,    setDisposeMed]    = useState<Medicine | null>(null);

  const [planModalOpen,   setPlanModalOpen]   = useState(false);
  const [editPlan,        setEditPlan]        = useState<TreatmentPlan | null>(null);
  const [archivePlan,     setArchivePlan]     = useState<TreatmentPlan | null>(null);
  const [showArchivedPlans, setShowArchivedPlans] = useState(false);

  const memberOptions = useMemo(() => {
    const names = currentFamily?.members.map(m => m.name) ?? [];
    return ["Familia", ...names];
  }, [currentFamily]);

  /* ── Partition active vs disposed ── */
  const active   = useMemo(() => medicines.filter(m => !m.disposed), [medicines]);
  const disposed = useMemo(() => medicines.filter(m =>  m.disposed), [medicines]);

  /* ── Stats ── */
  const expired  = useMemo(() => active.filter(m => expiryStatus(m.expiryDate).days < 0), [active]);
  const expiring = useMemo(() => active.filter(m => { const s = expiryStatus(m.expiryDate); return s.days >= 0 && s.days <= 30; }), [active]);
  const restock  = useMemo(() => active.filter(m => m.quantity < m.minimum), [active]);
  const okCount  = active.length - expired.length - expiring.length;

  const activePlanCount = useMemo(
    () => treatPlans.filter(p => !p.archived && getPlanStatus(p).active).length,
    [treatPlans],
  );

  /* ── Plan helpers ── */
  function getLinkedPlans(medId: string) {
    return treatPlans.filter(p => !p.archived && p.entries.some(e => e.medicineId === medId));
  }

  const visiblePlans = useMemo(
    () => treatPlans.filter(p => showArchivedPlans ? !!p.archived : !p.archived),
    [treatPlans, showArchivedPlans],
  );

  /* ── View items (medicines) ── */
  const viewItems = useMemo(() => {
    if (view === "disposed")  return disposed;
    if (view === "expiring")  return expiring;
    if (view === "restock")   return restock;
    if (view === "expired")   return expired;
    if (view === "plans")     return [];
    if (activeCat !== "all")  return active.filter(m => m.categoryId === activeCat);
    return active;
  }, [view, activeCat, active, disposed, expiring, restock, expired]);

  const filteredItems = useMemo(() =>
    query ? viewItems.filter(m =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.dosage.toLowerCase().includes(query.toLowerCase()) ||
      (CATEGORIES.find(c => c.id === m.categoryId)?.label ?? "").toLowerCase().includes(query.toLowerCase())
    ) : viewItems,
  [viewItems, query]);

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function getCat(m: Medicine) { return CATEGORIES.find(c => c.id === m.categoryId); }

  /* ── Medicine CRUD ── */
  async function handleSaveMed(data: MedicineInput) {
    setMedFormErrors(null);
    try {
      if (editMed) await mutUpdateMed.mutateAsync({ id: editMed.id, data });
      else         await mutCreateMed.mutateAsync(data);
      setMedModalOpen(false); setEditMed(null);
    } catch (err) {
      setMedFormErrors(parseApiError(err));
    }
  }

  function handleAdjust(id: string, delta: number) {
    mutAdjustMed.mutate({ id, delta });
  }

  async function handleDispose(med: Medicine) {
    await mutUpdateMed.mutateAsync({ id: med.id, data: { disposed: true } }).catch(() => {});
    setDisposeMed(null);
  }

  function handleRestore(med: Medicine) {
    mutUpdateMed.mutate({ id: med.id, data: { disposed: false } });
  }

  async function handleDeleteMed(med: Medicine) {
    await mutDeleteMed.mutateAsync(med.id).catch(() => {});
    setDelMed(null);
  }

  /* ── Plan CRUD ── */
  async function handleSavePlan(data: PlanInput) {
    // El backend descuenta el stock al crear planes finitos (misma fórmula que la preview del modal)
    setPlanFormErrors(null);
    try {
      if (editPlan) await mutUpdatePlan.mutateAsync({ id: editPlan.id, data });
      else          await mutCreatePlan.mutateAsync(data);
      setPlanModalOpen(false); setEditPlan(null);
    } catch (err) {
      setPlanFormErrors(parseApiError(err));
    }
  }

  async function handleArchivePlan(plan: TreatmentPlan) {
    // En el historial el botón 🗄️ elimina definitivamente; en activos, archiva
    if (plan.archived) await mutDeletePlan.mutateAsync(plan.id).catch(() => {});
    else await mutUpdatePlan.mutateAsync({ id: plan.id, data: { archived: true } }).catch(() => {});
    setArchivePlan(null);
  }

  /* ── Navigation ── */
  function openAdd()              { setMedFormErrors(null);  setEditMed(null);  setMedModalOpen(true); }
  function openEdit(m: Medicine)  { setMedFormErrors(null);  setEditMed(m);     setMedModalOpen(true); }
  function openAddPlan()          { setPlanFormErrors(null); setEditPlan(null); setPlanModalOpen(true); }
  function openEditPlan(p: TreatmentPlan) { setPlanFormErrors(null); setEditPlan(p); setPlanModalOpen(true); }
  function switchView(v: MedView) { setView(v); setActiveCat("all"); setQuery(""); setPage(1); }
  function switchCat(id: string)  { setView("all"); setActiveCat(id); setQuery(""); setPage(1); }
  function resetToAll()           { setView("all"); setActiveCat("all"); setQuery(""); setPage(1); }

  const isPlansView    = view === "plans";
  const isDisposedView = view === "disposed";

  const viewTitle =
    view === "expiring" ? "⚠️ Por vencer pronto"
    : view === "restock"  ? "🛒 Reponer stock"
    : view === "expired"  ? "❌ Medicamentos vencidos"
    : view === "plans"    ? "📅 Planes de medicación"
    : view === "disposed" ? "🚮 Desechados"
    : activeCat !== "all" ? (() => { const c = CATEGORIES.find(c => c.id === activeCat); return c ? `${c.icon} ${c.label}` : ""; })()
    : "Todos los medicamentos";

  /* ── Sidebar ── */
  const SidebarContent = useCallback(({ onSelect }: { onSelect?: () => void }) => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}><span style={{ fontSize: 22 }}>💊</span><span className={styles.sidebarTitle}>Medicinas</span></div>
        <span className={styles.sidebarSubtitle}>Botiquín familiar</span>
      </div>

      <div className={styles.sidebarTopActions}>
        <button className={styles.btnNav} onClick={() => navigate("/home")}>← Inicio</button>
        <button className={styles.btnTheme} onClick={toggleTheme}>{isDark ? "☀️" : "🌙"}</button>
      </div>

      <div className={styles.sectionLabel}>VISTAS</div>

      {([
        { label: "📋 Todos",       v: "all"      as MedView, count: 0,                 muted: false },
        { label: "⚠️ Por vencer",  v: "expiring" as MedView, count: expiring.length,   muted: false },
        { label: "🛒 Reponer",     v: "restock"  as MedView, count: restock.length,    muted: false },
        { label: "❌ Vencidos",     v: "expired"  as MedView, count: expired.length,    muted: false },
        { label: "📅 Planes",      v: "plans"    as MedView, count: activePlanCount,   muted: false },
        { label: "🚮 Desechados",  v: "disposed" as MedView, count: disposed.length,   muted: true  },
      ] as const).map(item => {
        const isActive = view === item.v && (item.v !== "all" || activeCat === "all");
        return (
          <button key={item.v} className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
            onClick={() => { switchView(item.v); onSelect?.(); }}>
            <span>{item.label}</span>
            {item.count > 0 && (
              <span className={`${styles.navBadge} ${item.muted ? styles.navBadgeMuted : ""}`}>{item.count}</span>
            )}
          </button>
        );
      })}

      <div className={styles.sectionLabel}>CATEGORÍAS</div>

      {CATEGORIES.map(cat => {
        const alerts  = active.filter(m => m.categoryId === cat.id && (m.quantity < m.minimum || expiryStatus(m.expiryDate).urgent)).length;
        const isActive = view === "all" && activeCat === cat.id;
        return (
          <div key={cat.id} className={styles.catRow}>
            <button
              className={`${styles.catBtn} ${isActive ? styles.catBtnActive : ""}`}
              style={{ "--cat-color": cat.color } as React.CSSProperties}
              onClick={() => { switchCat(cat.id); onSelect?.(); }}
            >
              <span>{cat.icon} {cat.label}</span>
              {alerts > 0 && <span className={styles.catAlert}>{alerts}</span>}
            </button>
          </div>
        );
      })}

      <div className={styles.sidebarBottom}>
        <button className={styles.btnAddMed} onClick={() => { openAdd(); onSelect?.(); }}>+ Agregar medicina</button>
      </div>
    </div>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [isDark, view, activeCat, expiring.length, restock.length, expired.length, activePlanCount, disposed.length, active]);

  const showCategoryOverview = view === "all" && activeCat === "all" && !query;

  return (
    <DashboardLayout
      bg={isDark ? "#110E0E" : "#FFF5F5"}
      isDesktop={isDesktop}
      drawerOpen={drawerOpen}
      onOpenDrawer={() => setDrawer(true)}
      onCloseDrawer={() => setDrawer(false)}
      sidebarContent={<SidebarContent />}
      mobileTitle={<><span style={{ fontSize: 20 }}>💊</span><span className="fh-text" style={{ fontWeight: 800, fontSize: 15 }}>Medicinas</span></>}
      mobileActions={<>
        <button className={styles.btnTheme} style={{ borderRadius: 7, padding: "5px 9px" }} onClick={toggleTheme}>{isDark ? "☀️" : "🌙"}</button>
        <button className={styles.btnNav}   style={{ borderRadius: 7, padding: "5px 10px" }} onClick={() => navigate("/home")}>🏠</button>
      </>}
    >
      <div className={isMobile ? styles.contentMobile : styles.content}>
        <div className="fh-page-enter">
          {isLoading && <StockSkeleton dark={isDark} />}
          {!isLoading && <>

          <AlertBanner
            expiredCount={expired.length}
            expiringCount={expiring.length}
            onViewExpired={() => switchView("expired")}
            onViewExpiring={() => switchView("expiring")}
          />

          {/* Stats */}
          <div className={`${styles.statsGrid} ${isMobile ? styles.statsMobile : ""}`}>
            {[
              { label: "OK",            value: Math.max(0, okCount), icon: "✅", color: "#34C78A" },
              { label: "Por vencer",    value: expiring.length,      icon: "⚠️", color: "#F7874F" },
              { label: "Sin/bajo stock",value: restock.length,       icon: "📦", color: C.warn   },
              { label: "Vencidos",      value: expired.length,       icon: "❌", color: C.danger },
            ].map(s => (
              <div key={s.label} className={`${styles.statCard} ${isMobile ? styles.statCardMobile : ""}`} style={{ background: s.color + "14", borderColor: s.color + "20" }}>
                <span style={{ fontSize: isMobile ? 18 : 22 }}>{s.icon}</span>
                <div>
                  <div className={styles.statValue} style={{ fontSize: isMobile ? 20 : 24, color: s.color }}>{s.value}</div>
                  {!isMobile && <div className={styles.statLabel}>{s.label}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* View header */}
          <div className={styles.viewHeader}>
            <div className={styles.viewHeaderLeft}>
              {(view !== "all" || activeCat !== "all") && (
                <button className={styles.btnBack} onClick={resetToAll}>←</button>
              )}
              <span className={styles.viewTitle}>{viewTitle}</span>
            </div>
            {isPlansView ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setShowArchivedPlans(v => !v)} className="fh-btn fh-btn-ghost" style={{ fontSize: 12 }}>
                  {showArchivedPlans ? "Ver activos" : "🗄️ Historial"}
                </button>
                <button onClick={openAddPlan} style={{ background: "#E5534B", color: "#fff", border: "none", borderRadius: 9, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  + Nuevo plan
                </button>
              </div>
            ) : (
              isDesktop && !isDisposedView && (
                <button onClick={openAdd} style={{ background: "#E5534B", color: "#fff", border: "none", borderRadius: 9, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  + Agregar medicina
                </button>
              )
            )}
          </div>

          {/* ── Plans view ── */}
          {isPlansView && (
            visiblePlans.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>{showArchivedPlans ? "🗄️" : "📅"}</div>
                <div className={styles.emptyTitle}>{showArchivedPlans ? "Sin planes archivados" : "Sin planes de medicación"}</div>
                <div className={styles.emptyDesc}>{showArchivedPlans ? "Los planes archivados aparecerán aquí" : "Agrupa medicamentos de un mismo tratamiento en un plan"}</div>
                {!showArchivedPlans && (
                  <button onClick={openAddPlan} style={{ background: "#E5534B", color: "#fff", border: "none", borderRadius: 9, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 8 }}>
                    + Crear primer plan
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {visiblePlans.map(plan => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    medicines={medicines}
                    onEdit={openEditPlan}
                    onArchive={p => setArchivePlan(p)}
                    onDownloadICS={p => downloadPlanICS(p, medicines)}
                    onOpenGoogle={p => { const url = googleCalendarUrlForPlan(p, medicines); if (url) window.open(url, "_blank"); }}
                    onDownloadReminder={p => downloadReminderICS(p, medicines)}
                  />
                ))}
              </div>
            )
          )}

          {/* ── Medicine list (all views except plans) ── */}
          {!isPlansView && (
            <>
              {/* Search + WhatsApp */}
              <div className={styles.searchBar}>
                <div className={styles.searchWrap}>
                  <span className={styles.searchIcon}>🔍</span>
                  <input className={styles.searchInput} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Buscar por nombre, dosis, categoría..." />
                </div>
                {view === "restock" && restock.length > 0 && (
                  <button className={styles.btnWhatsApp} onClick={() => shareRestockWhatsApp(restock)}>
                    <span>📲</span> Compartir
                  </button>
                )}
              </div>

              {/* Category overview */}
              {showCategoryOverview && (
                <div className={styles.catGrid}>
                  {CATEGORIES.map(cat => {
                    const items   = active.filter(m => m.categoryId === cat.id);
                    const catExp  = items.filter(m => expiryStatus(m.expiryDate).days < 0);
                    const catWarn = items.filter(m => { const s = expiryStatus(m.expiryDate); return s.days >= 0 && s.days <= 30; });
                    const catLow  = items.filter(m => m.quantity < m.minimum && expiryStatus(m.expiryDate).days >= 0);
                    const catOk   = items.filter(m => m.quantity >= m.minimum && expiryStatus(m.expiryDate).days > 30);
                    const stColor = catExp.length > 0 ? C.danger : catWarn.length > 0 ? C.warn : catLow.length > 0 ? C.warn : C.ok;
                    const stLabel = catExp.length  > 0 ? `${catExp.length} vencida${catExp.length !== 1 ? "s" : ""}`
                                  : catWarn.length > 0 ? `${catWarn.length} por vencer`
                                  : catLow.length  > 0 ? `${catLow.length} bajo stock`
                                  : "Todo OK";
                    return (
                      <div key={cat.id} className={styles.catOverviewCard} style={{ borderColor: cat.color + "20" }} onClick={() => switchCat(cat.id)}>
                        <div className={styles.catOverviewHeader}>
                          <div className={styles.catOverviewLeft}>
                            <div className={styles.catIconLg} style={{ background: cat.color + "18" }}>{cat.icon}</div>
                            <div>
                              <div className={styles.catOverviewName}>{cat.label}</div>
                              <div className={styles.catOverviewCount}>{items.length} medicamento{items.length !== 1 ? "s" : ""}</div>
                            </div>
                          </div>
                          <div className={styles.catStatusBadge} style={{ color: stColor, background: stColor + "12", borderColor: stColor + "30" }}>{stLabel}</div>
                        </div>
                        {items.length > 0 && (
                          <div className={styles.catProgressBar} style={{ marginBottom: 12 }}>
                            <div style={{ width: `${(catOk.length   / items.length) * 100}%`, background: C.ok,     borderRadius: "99px 0 0 99px" }} />
                            <div style={{ width: `${(catLow.length  / items.length) * 100}%`, background: C.warn   }} />
                            <div style={{ width: `${(catWarn.length / items.length) * 100}%`, background: C.warn   }} />
                            <div style={{ width: `${(catExp.length  / items.length) * 100}%`, background: C.danger, borderRadius: "0 99px 99px 0" }} />
                          </div>
                        )}
                        <div className={styles.catStatsRow}>
                          {[{ v: catOk.length, l: "OK", c: C.ok }, { v: catWarn.length, l: "Por vencer", c: C.warn }, { v: catExp.length, l: "Vencidos", c: C.danger }].map(s => (
                            <div key={s.l} className={styles.catStatBox} style={{ background: s.c + "14" }}>
                              <div className={styles.catStatValue} style={{ color: s.c }}>{s.v}</div>
                              <div className={styles.catStatLabel}>{s.l}</div>
                            </div>
                          ))}
                        </div>
                        <div className={styles.catOverviewCta} style={{ color: cat.color }}>Ver medicamentos →</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Flat list */}
              {!showCategoryOverview && (
                filteredItems.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>💊</div>
                    <div className={styles.emptyTitle}>
                      {query             ? `Sin resultados para "${query}"`
                      : view === "expiring" ? "¡Ningún medicamento vence pronto!"
                      : view === "restock"  ? "¡Todo el stock está al día!"
                      : view === "expired"  ? "¡No hay medicamentos vencidos!"
                      : view === "disposed" ? "No hay medicamentos desechados."
                      : "Sin medicamentos en esta categoría."}
                    </div>
                    {view === "all" && !query && (
                      <button onClick={openAdd} style={{ background: "#E5534B", color: "#fff", border: "none", borderRadius: 9, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 8 }}>
                        + Agregar primer medicamento
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className={styles.itemList}>
                      {pagedItems.map(m => (
                        <MedicineCard
                          key={m.id} med={m} cat={getCat(m)}
                          linkedPlans={getLinkedPlans(m.id)}
                          isDisposedView={isDisposedView}
                          onEdit={openEdit}
                          onDispose={m => setDisposeMed(m)}
                          onRestore={handleRestore}
                          onDelete={m => setDelMed(m)}
                          onAdjust={handleAdjust}
                        />
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={filteredItems.length} pageSize={PAGE_SIZE} />
                    )}
                  </>
                )
              )}
            </>
          )}
          </>}
        </div>
      </div>

      {/* FAB móvil */}
      {!isDesktop && !isDisposedView && !isPlansView && createPortal(
        <button className={styles.mobileAdd} onClick={openAdd}>+</button>,
        document.body,
      )}

      {/* Modales */}
      <ModalMedicine
        open={medModalOpen} initial={editMed} memberOptions={memberOptions}
        onSave={handleSaveMed}
        onClose={() => { setMedModalOpen(false); setEditMed(null); setMedFormErrors(null); }}
        apiErrors={medFormErrors}
        isSaving={mutCreateMed.isPending || mutUpdateMed.isPending}
      />

      <ModalPlan
        open={planModalOpen} initial={editPlan}
        medicines={medicines} memberOptions={memberOptions}
        onSave={handleSavePlan}
        onClose={() => { setPlanModalOpen(false); setEditPlan(null); setPlanFormErrors(null); }}
        apiErrors={planFormErrors}
        isSaving={mutCreatePlan.isPending || mutUpdatePlan.isPending}
      />

      <ConfirmDialog
        open={!!disposeMed}
        title={`¿Marcar "${disposeMed?.name ?? ""}" como desechada?`}
        description="Se moverá a Desechados. Podrás restaurarla o eliminarla desde allí."
        onClose={() => setDisposeMed(null)}
        onConfirm={async () => disposeMed && handleDispose(disposeMed)}
      />

      <ConfirmDialog
        open={!!delMed}
        title={`¿Eliminar "${delMed?.name ?? ""}" definitivamente?`}
        description="Esta acción no se puede deshacer."
        onClose={() => setDelMed(null)}
        onConfirm={async () => delMed && handleDeleteMed(delMed)}
      />

      <ConfirmDialog
        open={!!archivePlan}
        title={archivePlan?.archived
          ? `¿Eliminar "${archivePlan?.name ?? ""}" definitivamente?`
          : `¿Archivar "${archivePlan?.name ?? ""}"?`}
        description={archivePlan?.archived
          ? "Esta acción no se puede deshacer."
          : "El plan pasará al historial. Podrás consultarlo pero no modificarlo."}
        onClose={() => setArchivePlan(null)}
        onConfirm={async () => archivePlan && handleArchivePlan(archivePlan)}
      />
    </DashboardLayout>
  );
}
