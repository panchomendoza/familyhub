// ══════════════════════════════════════════════════════════════
//   VehiclesDashboard — Vehículos del Hogar
//   Conectado a API real via useVehicles hooks.
//   Secciones: Info · Bitácora · Documentos · Gastos · Alertas
// ══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/lib/theme";
import { useWindowWidth } from "@/hooks/useWindowWidth";
import { useAuthStore } from "@/stores/auth.store";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { compressFile, fmtFileSize } from "@/lib/imageUtils";
import { parseApiError, fieldError, type ValidationErrors } from "@/lib/apiErrors";
import { FieldError as FErr } from "@/components/ui/FieldError";
import { VehiclesSidebarSkeleton, VehiclesContentSkeleton } from "@/components/ui/DashboardSkeletons";
import {
  useVehicles, useVehicleDetail,
  useCreateVehicle, useUpdateVehicle, useUpdateVehicleKm,
  useSellVehicle, useUnsellVehicle, useDeleteVehicle,
  useCreateMaintenance, useUpdateMaintenance, useDeleteMaintenance,
  useCreateDocument, useUpdateDocument, useDeleteDocument,
  useCreateExpense, useUpdateExpense, useDeleteExpense,
} from "./useVehicles";
import type {
  Vehicle, VehicleMaintenance, VehicleDocument, VehicleExpense,
  VehicleType, FuelType, TransType,
} from "./useVehicles";
import styles from "./VehiclesDashboard.module.css";

/* ════════════════════════════════════
   UI-only types
   ════════════════════════════════════ */
type DocStatus     = "vigente" | "por_vencer" | "vencida";
type VehicleSection = "info" | "maintenance" | "documents" | "expenses" | "alerts";

/* ════════════════════════════════════
   Config
   ════════════════════════════════════ */
const VEHICLE_ICONS: Record<VehicleType, string> = {
  car:        "🚗",
  motorcycle: "🏍️",
  truck:      "🚛",
  van:        "🚐",
  other:      "🚘",
};

const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car:        "Auto",
  motorcycle: "Moto",
  truck:      "Camión/Camioneta",
  van:        "Van/Furgón",
  other:      "Otro",
};

const FUEL_LABELS: Record<FuelType, string> = {
  gasoline: "Bencina",
  diesel:   "Diésel",
  electric: "Eléctrico",
  hybrid:   "Híbrido",
  gas:      "Gas",
};

const TRANS_LABELS: Record<TransType, string> = {
  manual:    "Manual",
  automatic: "Automático",
};

const MAINT_TYPES = [
  "Cambio de aceite", "Filtro de aceite", "Filtro de aire", "Filtro de bencina",
  "Frenos delanteros", "Frenos traseros", "Pastillas de freno", "Discos de freno",
  "Neumáticos", "Alineación y balanceo", "Correa de distribución",
  "Bujías", "Batería", "Revisión general", "Refrigerante", "Líquido de frenos",
  "Amortiguadores", "Dirección", "Sistema eléctrico", "Otro",
];

const EXPENSE_CATS = [
  "Combustible", "Mantención", "Multa", "Peaje",
  "Lavado", "Seguro", "Estacionamiento", "Repuesto", "Otro",
];

const EXPENSE_CAT_COLORS: Record<string, string> = {
  "Combustible":     "#F7874F",
  "Mantención":      "#4F7BF7",
  "Multa":           "#F74F7B",
  "Peaje":           "#F7C24F",
  "Lavado":          "#4FC7F7",
  "Seguro":          "#A44FF7",
  "Estacionamiento": "#8A93A8",
  "Repuesto":        "#34C78A",
  "Otro":            "#8A93A8",
};

const DOC_TYPES = [
  "Revisión técnica",
  "Permiso de circulación",
  "SOAP (Seguro obligatorio)",
  "Seguro complementario",
  "Certificado de inscripción",
  "Tarjeta de propiedad",
  "Otro",
];

/* ════════════════════════════════════
   CSS var helpers
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
  sidebarBg:  "var(--sidebar-bg)",
  cardShadow: "var(--card-shadow)",
} as const;

const ACCENT = "#4F7BF7";

/* ════════════════════════════════════
   Helpers
   ════════════════════════════════════ */
const TODAY = new Date().toISOString().slice(0, 10);

/** ISO datetime → "YYYY-MM-DD" para inputs de tipo date */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return TODAY;
  return iso.slice(0, 10);
}

/** "YYYY-MM-DD" → ISO datetime para la API */
function toISO(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  return new Date(dateStr + "T12:00:00").toISOString();
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

function fmtCLP(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString("es-CL");
}

function fmtKm(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("es-CL") + " km";
}

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function docStatus(expiryDate: string): DocStatus {
  const days = daysUntil(expiryDate);
  if (days < 0)  return "vencida";
  if (days < 30) return "por_vencer";
  return "vigente";
}

function docStatusColor(s: DocStatus): string {
  return s === "vigente" ? "var(--brand-green)" : s === "por_vencer" ? "var(--brand-orange)" : "var(--brand-red)";
}

function vehicleBg(dark: boolean): string {
  return dark ? "#0d1420" : "#F0F5FF";
}

/* ════════════════════════════════════
   Sub-components
   ════════════════════════════════════ */

function DocBadge({ status }: { status: DocStatus }) {
  const label = status === "vigente" ? "Vigente" : status === "por_vencer" ? "Por vencer" : "Vencida";
  const color = docStatusColor(status);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      background: color + "18", border: `1px solid ${color}44`, color,
      letterSpacing: "0.04em",
    }}>
      {label}
    </span>
  );
}

function VehicleCard({
  vehicle, active, onClick,
}: { vehicle: Vehicle; active: boolean; onClick: () => void }) {
  return (
    <div
      className={[styles.vCard, active ? styles.vCardActive : "", vehicle.sold ? styles.vCardSold : ""].join(" ")}
      onClick={onClick}
    >
      <div className={styles.vCardIcon} style={{
        background: active ? ACCENT + "22" : "var(--surface-alt)",
        borderColor: active ? ACCENT + "55" : "transparent",
      }}>
        {VEHICLE_ICONS[vehicle.type]}
      </div>
      <div className={styles.vCardBody}>
        <div className={styles.vCardName} style={{ color: active ? ACCENT : V.text }}>
          {vehicle.brand} {vehicle.model}
        </div>
        <div className={styles.vCardSub}>
          <span>{vehicle.year}</span>
          <span className={styles.vCardPlate}>{vehicle.licensePlate}</span>
          {vehicle.sold && <span className={styles.soldBadge}>Vendido</span>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: string; label: string; value: string; color?: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon}>{icon}</div>
      <div>
        <div className={styles.statValue} style={color ? { color } : undefined}>{value}</div>
        <div className={styles.statLabel}>{label}</div>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string | number | undefined | null }) {
  return (
    <div className={styles.infoField}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value ?? "—"}</span>
    </div>
  );
}

function SectionTab({ id, label, icon, active, onClick, badge }: {
  id: VehicleSection; label: string; icon: string;
  active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button
      className={[styles.sectionTab, active ? styles.sectionTabActive : ""].join(" ")}
      onClick={onClick}
    >
      {icon} {label}
      {badge !== undefined && badge > 0 && (
        <span className={styles.sectionTabBadge}>{badge}</span>
      )}
    </button>
  );
}

/* ════════════════════════════════════
   Form helpers
   ════════════════════════════════════ */
const INP: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, boxSizing: "border-box",
  border: "1.5px solid var(--border)", background: V.inputBg, color: V.text,
  fontSize: 14, fontFamily: "inherit", outline: "none",
};
const LBL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: V.textMuted,
  letterSpacing: "0.04em", display: "block", marginBottom: 5,
};

/* ════════════════════════════════════
   VehicleForm
   ════════════════════════════════════ */
interface VehicleFormState {
  type:         VehicleType;
  brand:        string;
  model:        string;
  year:         string;
  licensePlate: string;
  vin:          string;
  color:        string;
  engineCC:     string;
  fuelType:     FuelType;
  transmission: TransType;
  doors:        string;
  currentKm:    string;
}

const EMPTY_VEHICLE_FORM: VehicleFormState = {
  type: "car", brand: "", model: "", year: String(new Date().getFullYear()),
  licensePlate: "", vin: "", color: "",
  engineCC: "", fuelType: "gasoline", transmission: "manual",
  doors: "4", currentKm: "0",
};


function VehicleForm({ initial, isEdit, onSave, onClose, apiErrors, isSaving }: {
  initial: VehicleFormState; isEdit: boolean;
  onSave: (d: VehicleFormState) => void; onClose: () => void;
  apiErrors?: ValidationErrors | null;
  isSaving?: boolean;
}) {
  const [f, setF] = useState<VehicleFormState>(initial);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof VehicleFormState>(k: K, v: VehicleFormState[K]) => {
    setF(p => ({ ...p, [k]: v }));
    setLocalErrors(p => ({ ...p, [k as string]: "" }));
  };

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!f.brand.trim())             e.brand        = "Obligatorio";
    else if (f.brand.length > 80)    e.brand        = "Máximo 80 caracteres";
    if (!f.model.trim())             e.model        = "Obligatorio";
    else if (f.model.length > 80)    e.model        = "Máximo 80 caracteres";
    if (!f.licensePlate.trim())      e.licensePlate = "Obligatorio";
    else if (f.licensePlate.length > 20) e.licensePlate = "Máximo 20 caracteres";
    const y = Number(f.year);
    if (!f.year || isNaN(y) || y < 1900 || y > new Date().getFullYear() + 1)
      e.year = `Entre 1900 y ${new Date().getFullYear() + 1}`;
    if (f.vin  && f.vin.length  > 17)  e.vin      = "Máximo 17 caracteres";
    if (f.color && f.color.length > 40) e.color    = "Máximo 40 caracteres";
    if (f.engineCC && Number(f.engineCC) < 50) e.engineCC = "Mínimo 50 cc";
    if (f.doors && (Number(f.doors) < 1 || Number(f.doors) > 10)) e.doors = "Entre 1 y 10";
    if (Number(f.currentKm) < 0)    e.currentKm    = "No puede ser negativo";
    setLocalErrors(e);
    return Object.keys(e).length === 0;
  }

  const err = (k: string) => localErrors[k] || fieldError(apiErrors, k);

  return (
    <div style={{ padding: "24px 28px" }}>
      <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: V.text }}>
        {isEdit ? "Editar vehículo" : "Agregar vehículo"}
      </h2>

      {/* Banner de error general */}
      {apiErrors?.formErrors?.length ? (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-text)]/20">
          {apiErrors.formErrors.map((e, i) => (
            <p key={i} className="text-[var(--danger-text)] text-sm font-semibold">{e}</p>
          ))}
        </div>
      ) : apiErrors?.message && Object.keys(apiErrors.fieldErrors).length === 0 ? (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-text)]/20">
          <p className="text-[var(--danger-text)] text-sm font-semibold">{apiErrors.message}</p>
        </div>
      ) : null}

      {/* Tipo */}
      <div style={{ marginBottom: 14 }}>
        <label style={LBL}>TIPO DE VEHÍCULO</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["car", "motorcycle", "truck", "van", "other"] as VehicleType[]).map(t => (
            <button key={t} onClick={() => set("type", t)} style={{
              padding: "6px 14px", borderRadius: 8, border: "1.5px solid",
              borderColor: f.type === t ? ACCENT + "77" : "var(--border)",
              background: f.type === t ? ACCENT + "18" : "transparent",
              color: f.type === t ? ACCENT : V.textMuted,
              fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: f.type === t ? 700 : 400,
            }}>
              {VEHICLE_ICONS[t]} {VEHICLE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Marca / Modelo / Año */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3.5">
        <div>
          <label style={LBL}>MARCA *</label>
          <input style={INP} value={f.brand} onChange={e => set("brand", e.target.value)} placeholder="Toyota" />
          <FErr msg={err("brand")} />
        </div>
        <div>
          <label style={LBL}>MODELO *</label>
          <input style={INP} value={f.model} onChange={e => set("model", e.target.value)} placeholder="Corolla" />
          <FErr msg={err("model")} />
        </div>
        <div>
          <label style={LBL}>AÑO</label>
          <input style={INP} type="number" value={f.year} onChange={e => set("year", e.target.value)} min={1960} max={2030} />
          <FErr msg={err("year")} />
        </div>
      </div>

      {/* Patente / VIN / Color */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3.5">
        <div>
          <label style={LBL}>PATENTE *</label>
          <input style={INP} value={f.licensePlate} onChange={e => set("licensePlate", e.target.value.toUpperCase())} placeholder="BBCD-12" />
          <FErr msg={err("licensePlate")} />
        </div>
        <div>
          <label style={LBL}>N° CHASIS / VIN</label>
          <input style={INP} value={f.vin} onChange={e => set("vin", e.target.value.toUpperCase())} placeholder="JT2BF22K..." />
          <FErr msg={err("vin")} />
        </div>
        <div>
          <label style={LBL}>COLOR</label>
          <input style={INP} value={f.color} onChange={e => set("color", e.target.value)} placeholder="Gris" />
          <FErr msg={err("color")} />
        </div>
      </div>

      {/* Motor / Combustible / Transmisión */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3.5">
        <div>
          <label style={LBL}>CILINDRADA (CC)</label>
          <input style={INP} type="number" value={f.engineCC} onChange={e => set("engineCC", e.target.value)} placeholder="1800" min={0} />
          <FErr msg={err("engineCC")} />
        </div>
        <div>
          <label style={LBL}>COMBUSTIBLE</label>
          <select style={INP} value={f.fuelType} onChange={e => set("fuelType", e.target.value as FuelType)}>
            {(Object.entries(FUEL_LABELS) as [FuelType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <FErr msg={err("fuelType")} />
        </div>
        <div>
          <label style={LBL}>TRANSMISIÓN</label>
          <select style={INP} value={f.transmission} onChange={e => set("transmission", e.target.value as TransType)}>
            <option value="manual">Manual</option>
            <option value="automatic">Automático</option>
          </select>
          <FErr msg={err("transmission")} />
        </div>
      </div>

      {/* Puertas / Odómetro */}
      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label style={LBL}>N° PUERTAS</label>
          <input style={INP} type="number" value={f.doors} onChange={e => set("doors", e.target.value)} min={0} max={6} />
          <FErr msg={err("doors")} />
        </div>
        <div>
          <label style={LBL}>ODÓMETRO ACTUAL (KM)</label>
          <input style={INP} type="number" value={f.currentKm} onChange={e => set("currentKm", e.target.value)} min={0} />
          <FErr msg={err("currentKm")} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{
          padding: "9px 20px", borderRadius: 8,
          border: "1px solid var(--border)", background: "transparent",
          color: V.textMuted, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}>Cancelar</button>
        <button onClick={() => !isSaving && validate() && onSave(f)} disabled={isSaving} style={{
          padding: "9px 20px", borderRadius: 8, border: "none",
          background: isSaving ? "var(--border)" : `linear-gradient(135deg, ${ACCENT}, #A44FF7)`,
          color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: isSaving ? "not-allowed" : "pointer", fontFamily: "inherit",
        }}>
          {isSaving ? "Guardando..." : isEdit ? "Guardar cambios" : "Agregar vehículo"}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   MaintenanceForm
   ════════════════════════════════════ */
interface MaintFormState {
  date: string; type: string; description: string;
  odometer: string; cost: string; workshop: string;
  nextKm: string; nextDate: string;
}
const EMPTY_MAINT: MaintFormState = {
  date: TODAY, type: "Cambio de aceite", description: "",
  odometer: "", cost: "", workshop: "",
  nextKm: "", nextDate: "",
};

function MaintenanceForm({ initial, vehicle, onSave, onClose, isSaving }: {
  initial: MaintFormState; vehicle: Vehicle;
  onSave: (d: MaintFormState) => void; onClose: () => void;
  isSaving?: boolean;
}) {
  const [f, setF] = useState<MaintFormState>(initial);
  const set = <K extends keyof MaintFormState>(k: K, v: string) =>
    setF(p => ({ ...p, [k]: v }));
  const ok = f.type.trim() && f.workshop.trim();

  return (
    <div style={{ padding: "24px 28px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: V.text }}>
        Registrar mantención
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 12, color: V.textMuted }}>
        {VEHICLE_ICONS[vehicle.type]} {vehicle.brand} {vehicle.model} — {vehicle.licensePlate}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label style={LBL}>FECHA</label>
          <input type="date" style={INP} value={f.date} onChange={e => set("date", e.target.value)} />
        </div>
        <div>
          <label style={LBL}>TIPO DE MANTENCIÓN *</label>
          <select style={INP} value={f.type} onChange={e => set("type", e.target.value)}>
            {MAINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={LBL}>DESCRIPCIÓN</label>
        <textarea style={{ ...INP, resize: "vertical", minHeight: 60 }} value={f.description}
          onChange={e => set("description", e.target.value)} placeholder="Detalles de la mantención..." />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3.5">
        <div>
          <label style={LBL}>ODÓMETRO (KM)</label>
          <input type="number" style={INP} value={f.odometer}
            onChange={e => set("odometer", e.target.value)} placeholder={String(vehicle.currentKm)} min={0} />
        </div>
        <div>
          <label style={LBL}>COSTO ($)</label>
          <input type="number" style={INP} value={f.cost}
            onChange={e => set("cost", e.target.value)} placeholder="45000" min={0} />
        </div>
        <div>
          <label style={LBL}>TALLER *</label>
          <input style={INP} value={f.workshop}
            onChange={e => set("workshop", e.target.value)} placeholder="Taller AutoCenter" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label style={LBL}>PRÓXIMA MANTENCIÓN (KM)</label>
          <input type="number" style={INP} value={f.nextKm}
            onChange={e => set("nextKm", e.target.value)} placeholder="Ej: 82000" min={0} />
        </div>
        <div>
          <label style={LBL}>PRÓXIMA MANTENCIÓN (FECHA)</label>
          <input type="date" style={INP} value={f.nextDate}
            onChange={e => set("nextDate", e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{
          padding: "9px 20px", borderRadius: 8,
          border: "1px solid var(--border)", background: "transparent",
          color: V.textMuted, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}>Cancelar</button>
        <button onClick={() => !isSaving && ok && onSave(f)} disabled={!ok || isSaving} style={{
          padding: "9px 20px", borderRadius: 8, border: "none",
          background: (!ok || isSaving) ? "var(--border)" : `linear-gradient(135deg, ${ACCENT}, #34C78A)`,
          color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: (!ok || isSaving) ? "not-allowed" : "pointer", fontFamily: "inherit",
        }}>{isSaving ? "Guardando..." : "Guardar mantención"}</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   DocumentForm
   ════════════════════════════════════ */
interface DocFormState {
  type: string; issueDate: string; expiryDate: string;
  amount: string; company: string; notes: string;
  attachmentName: string; attachmentData: string;
}
const EMPTY_DOC: DocFormState = {
  type: "Revisión técnica", issueDate: TODAY, expiryDate: TODAY,
  amount: "", company: "", notes: "",
  attachmentName: "", attachmentData: "",
};

function DocumentForm({ initial, vehicle, onSave, onClose, isSaving }: {
  initial: DocFormState; vehicle: Vehicle;
  onSave: (d: DocFormState) => void; onClose: () => void;
  isSaving?: boolean;
}) {
  const [f,           setF]          = useState<DocFormState>(initial);
  const [fileError,   setFileError]   = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  const set = <K extends keyof DocFormState>(k: K, v: string) =>
    setF(p => ({ ...p, [k]: v }));
  const ok = f.expiryDate.trim();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setCompressing(true);
    try {
      const result = await compressFile(file, { maxMB: 1 });
      setF(p => ({
        ...p,
        attachmentName: result.name + (result.wasCompressed ? " (optimizada)" : ""),
        attachmentData: result.data,
      }));
      if (result.wasCompressed) {
        setFileError(`✅ Imagen optimizada a ${fmtFileSize(result.bytes)}`);
      }
    } catch (err) {
      setFileError((err as Error).message);
      e.target.value = "";
    } finally {
      setCompressing(false);
    }
  }

  const isImage = f.attachmentData.startsWith("data:image/");
  const isPDF   = f.attachmentData.startsWith("data:application/pdf");

  return (
    <div style={{ padding: "24px 28px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: V.text }}>
        {initial.type === EMPTY_DOC.type && !initial.issueDate.includes("T") ? "Agregar documento" : "Editar documento"}
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 12, color: V.textMuted }}>
        {VEHICLE_ICONS[vehicle.type]} {vehicle.brand} {vehicle.model} — {vehicle.licensePlate}
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={LBL}>TIPO DE DOCUMENTO</label>
        <select style={INP} value={f.type} onChange={e => set("type", e.target.value)}>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label style={LBL}>FECHA EMISIÓN</label>
          <input type="date" style={INP} value={f.issueDate} onChange={e => set("issueDate", e.target.value)} />
        </div>
        <div>
          <label style={LBL}>FECHA VENCIMIENTO *</label>
          <input type="date" style={INP} value={f.expiryDate} onChange={e => set("expiryDate", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label style={LBL}>MONTO ($)</label>
          <input type="number" style={INP} value={f.amount}
            onChange={e => set("amount", e.target.value)} placeholder="18500" min={0} />
        </div>
        <div>
          <label style={LBL}>ENTIDAD / COMPAÑÍA</label>
          <input style={INP} value={f.company}
            onChange={e => set("company", e.target.value)} placeholder="BCI Seguros" />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={LBL}>NOTAS</label>
        <textarea style={{ ...INP, resize: "vertical", minHeight: 50 }} value={f.notes}
          onChange={e => set("notes", e.target.value)} placeholder="Observaciones..." />
      </div>

      {/* Adjunto */}
      <div style={{ marginBottom: 22 }}>
        <label style={LBL}>ADJUNTO (opcional) — imagen o PDF</label>
        <div style={{
          border: "1.5px dashed var(--border)", borderRadius: 8, padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <input type="file" accept="image/*,application/pdf"
            onChange={handleFile}
            disabled={compressing}
            style={{ fontSize: 13, color: V.textMuted, fontFamily: "inherit" }}
          />
          <div style={{ fontSize: 11, color: V.textMuted }}>Máx. 1 MB — las imágenes se optimizan automáticamente</div>
          {compressing && (
            <div style={{ fontSize: 12, color: ACCENT, display: "flex", alignItems: "center", gap: 6 }}>
              <span>⏳</span> Procesando archivo…
            </div>
          )}
          {fileError && (
            <div style={{
              fontSize: 12, padding: "6px 10px", borderRadius: 6, marginTop: 2,
              background: fileError.startsWith("✅") ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              color: fileError.startsWith("✅") ? "#16a34a" : "#dc2626",
            }}>
              {fileError}
            </div>
          )}
          {f.attachmentData && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              {isImage && (
                <img src={f.attachmentData} alt={f.attachmentName}
                  style={{ maxHeight: 80, maxWidth: 120, borderRadius: 6, border: "1px solid var(--border)" }} />
              )}
              {isPDF && <span style={{ fontSize: 24 }}>📄</span>}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: V.text }}>{f.attachmentName}</div>
                <button onClick={() => { setF(p => ({ ...p, attachmentName: "", attachmentData: "" })); setFileError(null); }}
                  style={{ fontSize: 11, color: "var(--brand-red)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", marginTop: 2 }}>
                  ✕ Quitar adjunto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{
          padding: "9px 20px", borderRadius: 8,
          border: "1px solid var(--border)", background: "transparent",
          color: V.textMuted, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}>Cancelar</button>
        <button onClick={() => !isSaving && ok && onSave(f)} disabled={!ok || isSaving} style={{
          padding: "9px 20px", borderRadius: 8, border: "none",
          background: (!ok || isSaving) ? "var(--border)" : `linear-gradient(135deg, ${ACCENT}, #A44FF7)`,
          color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: (!ok || isSaving) ? "not-allowed" : "pointer", fontFamily: "inherit",
        }}>{isSaving ? "Guardando..." : "Guardar documento"}</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   ExpenseForm
   ════════════════════════════════════ */
interface ExpFormState {
  date: string; category: string; description: string;
  amount: string; odometer: string; liters: string;
}
const EMPTY_EXP: ExpFormState = {
  date: TODAY, category: "Combustible", description: "",
  amount: "", odometer: "", liters: "",
};

function ExpenseForm({ initial, vehicle, onSave, onClose, isEdit, isSaving }: {
  initial: ExpFormState; vehicle: Vehicle; isEdit?: boolean;
  onSave: (d: ExpFormState) => void; onClose: () => void;
  isSaving?: boolean;
}) {
  const [f, setF] = useState<ExpFormState>(initial);
  const set = <K extends keyof ExpFormState>(k: K, v: string) =>
    setF(p => ({ ...p, [k]: v }));
  const ok = f.amount.trim() && Number(f.amount) > 0;
  const isFuel = f.category === "Combustible";

  return (
    <div style={{ padding: "24px 28px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: V.text }}>
        {isEdit ? "Editar gasto" : "Registrar gasto"}
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 12, color: V.textMuted }}>
        {VEHICLE_ICONS[vehicle.type]} {vehicle.brand} {vehicle.model} — {vehicle.licensePlate}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label style={LBL}>FECHA</label>
          <input type="date" style={INP} value={f.date} onChange={e => set("date", e.target.value)} />
        </div>
        <div>
          <label style={LBL}>CATEGORÍA</label>
          <select style={INP} value={f.category} onChange={e => set("category", e.target.value)}>
            {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={LBL}>DESCRIPCIÓN</label>
        <input style={INP} value={f.description}
          onChange={e => set("description", e.target.value)} placeholder="Detalle del gasto..." />
      </div>

      <div className={isFuel ? "grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3.5" : "grid grid-cols-2 gap-3 mb-3.5"}>
        <div>
          <label style={LBL}>MONTO ($) *</label>
          <input type="number" style={INP} value={f.amount}
            onChange={e => set("amount", e.target.value)} placeholder="42000" min={0} />
        </div>
        <div>
          <label style={LBL}>ODÓMETRO (KM)</label>
          <input type="number" style={INP} value={f.odometer}
            onChange={e => set("odometer", e.target.value)} placeholder={String(vehicle.currentKm)} min={0} />
        </div>
        {isFuel && (
          <div>
            <label style={LBL}>LITROS</label>
            <input type="number" style={INP} value={f.liters}
              onChange={e => set("liters", e.target.value)} placeholder="30" min={0} step="0.1" />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <button onClick={onClose} style={{
          padding: "9px 20px", borderRadius: 8,
          border: "1px solid var(--border)", background: "transparent",
          color: V.textMuted, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}>Cancelar</button>
        <button onClick={() => !isSaving && ok && onSave(f)} disabled={!ok || isSaving} style={{
          padding: "9px 20px", borderRadius: 8, border: "none",
          background: (!ok || isSaving) ? "var(--border)" : `linear-gradient(135deg, ${ACCENT}, #F7874F)`,
          color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: (!ok || isSaving) ? "not-allowed" : "pointer", fontFamily: "inherit",
        }}>{isSaving ? "Guardando..." : isEdit ? "Guardar cambios" : "Guardar gasto"}</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   SellVehicleForm
   ════════════════════════════════════ */
function SellVehicleForm({ vehicle, onConfirm, onClose }: {
  vehicle: Vehicle;
  onConfirm: (date: string, price: string) => void;
  onClose: () => void;
}) {
  const [date,  setDate]  = useState(TODAY);
  const [price, setPrice] = useState("");

  return (
    <div style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 22,
          background: "var(--brand-orange)18", border: "1px solid var(--brand-orange)44",
        }}>🤝</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: V.text }}>Marcar como vendido</h2>
          <p style={{ margin: 0, fontSize: 12, color: V.textMuted }}>
            {vehicle.brand} {vehicle.model} — {vehicle.licensePlate}
          </p>
        </div>
      </div>
      <p style={{ fontSize: 13, color: V.textMuted, marginBottom: 20, lineHeight: 1.6 }}>
        Una vez marcado como vendido, el vehículo quedará en modo solo lectura y no podrá ser editado.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label style={LBL}>FECHA DE VENTA</label>
          <input type="date" style={INP} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label style={LBL}>PRECIO DE VENTA ($)</label>
          <input type="number" style={INP} value={price}
            onChange={e => setPrice(e.target.value)} placeholder="8500000" min={0} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <button onClick={onClose} style={{
          padding: "9px 20px", borderRadius: 8,
          border: "1px solid var(--border)", background: "transparent",
          color: V.textMuted, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}>Cancelar</button>
        <button onClick={() => onConfirm(date, price)} style={{
          padding: "9px 20px", borderRadius: 8, border: "none",
          background: "linear-gradient(135deg, var(--brand-orange), var(--brand-red))",
          color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
        }}>Confirmar venta</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   KmUpdateForm
   ════════════════════════════════════ */
function KmUpdateForm({ vehicle, onSave, onClose }: {
  vehicle: Vehicle;
  onSave: (km: number) => void;
  onClose: () => void;
}) {
  const [km, setKm] = useState(String(vehicle.currentKm));
  const numKm = Number(km);
  const ok = numKm > 0 && numKm >= vehicle.currentKm;

  return (
    <div style={{ padding: "24px 28px" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: V.text }}>
        Actualizar odómetro
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 12, color: V.textMuted }}>
        Actual: <strong>{fmtKm(vehicle.currentKm)}</strong>
      </p>
      <div style={{ marginBottom: 20 }}>
        <label style={LBL}>NUEVO ODÓMETRO (KM)</label>
        <input type="number" style={{ ...INP, fontSize: 18, fontWeight: 700 }}
          value={km} onChange={e => setKm(e.target.value)} min={vehicle.currentKm} />
        {numKm < vehicle.currentKm && numKm > 0 && (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--brand-red)" }}>
            El valor no puede ser menor al actual.
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{
          padding: "9px 20px", borderRadius: 8,
          border: "1px solid var(--border)", background: "transparent",
          color: V.textMuted, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}>Cancelar</button>
        <button onClick={() => ok && onSave(numKm)} disabled={!ok} style={{
          padding: "9px 20px", borderRadius: 8, border: "none",
          background: ok ? `linear-gradient(135deg, ${ACCENT}, #34C78A)` : "var(--border)",
          color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: ok ? "pointer" : "not-allowed", fontFamily: "inherit",
        }}>Actualizar</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   VehiclesDashboard — main
   ════════════════════════════════════ */
export default function VehiclesDashboard() {
  const navigate          = useNavigate();
  const { isDark }        = useTheme();
  const isDesktop         = useWindowWidth() >= 900;
  const { currentFamily } = useAuthStore();
  const familyId          = currentFamily?.id;

  /* ── UI state ── */
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [activeSection,  setActiveSection]  = useState<VehicleSection>("info");
  const [selectedId,     setSelectedId]     = useState<string>("");

  /* ── Data ── */
  const { data: vehicles = [], isLoading: loadingList } = useVehicles(familyId);

  const effectiveId = selectedId || vehicles[0]?.id || "";

  const { data: vehicleDetail, isLoading: loadingDetail } = useVehicleDetail(
    familyId, effectiveId || undefined,
  );

  /* Auto-select first vehicle when list loads */
  useEffect(() => {
    if (!selectedId && vehicles.length > 0) {
      setSelectedId(vehicles[0]!.id);
    }
  }, [vehicles, selectedId]);

  const vehicle  = vehicleDetail;
  const isLocked = vehicle?.sold ?? false;

  const vMaint = useMemo(
    () => [...(vehicle?.maintenances ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [vehicle],
  );
  const vDocs = useMemo(
    () => [...(vehicle?.documents ?? [])].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
    [vehicle],
  );
  const vExp = useMemo(
    () => [...(vehicle?.expenses ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [vehicle],
  );

  /* ── Gastos: filtro por año ── */
  const expYears = useMemo(() => {
    const s = new Set(vExp.map(e => e.date.slice(0, 4)));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [vExp]);

  const currentYear = new Date().getFullYear().toString();
  const [selectedExpYear, setSelectedExpYear] = useState<string>(currentYear);

  const vExpFiltered = useMemo(() => {
    if (selectedExpYear === "all") return vExp;
    return vExp.filter(e => e.date.startsWith(selectedExpYear));
  }, [vExp, selectedExpYear]);

  const vExpByMonth = useMemo(() => {
    const map = new Map<string, VehicleExpense[]>();
    vExpFiltered.forEach(e => {
      const month = e.date.slice(0, 7);
      if (!map.has(month)) map.set(month, []);
      map.get(month)!.push(e);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [vExpFiltered]);

  /* ── Alertas ── */
  const alerts = useMemo(() => {
    const list: { type: "doc" | "maint"; level: "danger" | "warning"; message: string }[] = [];
    if (!vehicle) return list;
    vDocs.forEach(d => {
      const days = daysUntil(d.expiryDate);
      if (days < 0)
        list.push({ type: "doc", level: "danger",  message: `${d.type} — VENCIDA hace ${Math.abs(days)} días` });
      else if (days < 30)
        list.push({ type: "doc", level: "warning", message: `${d.type} — vence en ${days} días (${fmtDate(d.expiryDate)})` });
    });
    vMaint.forEach(m => {
      if (!m.nextKm) return;
      const diff = m.nextKm - vehicle.currentKm;
      if (diff <= 0)
        list.push({ type: "maint", level: "danger",  message: `${m.type} — atrasada por ${Math.abs(diff).toLocaleString()} km` });
      else if (diff < 2000)
        list.push({ type: "maint", level: "warning", message: `${m.type} — faltan ${diff.toLocaleString()} km` });
    });
    vMaint.forEach(m => {
      if (!m.nextDate) return;
      const days = daysUntil(m.nextDate);
      if (days < 0)
        list.push({ type: "maint", level: "danger",  message: `${m.type} — atrasada (${fmtDate(m.nextDate)})` });
      else if (days < 14)
        list.push({ type: "maint", level: "warning", message: `${m.type} — en ${days} días (${fmtDate(m.nextDate)})` });
    });
    return list.sort((a, b) => (a.level === "danger" ? -1 : b.level === "danger" ? 1 : 0));
  }, [vehicle, vDocs, vMaint]);

  /* ── Expense totals ── */
  const expTotals = useMemo(() => {
    const total = vExpFiltered.reduce((s, e) => s + e.amount, 0);
    const byCategory: Record<string, number> = {};
    vExpFiltered.forEach(e => { byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount; });
    return { total, byCategory };
  }, [vExpFiltered]);

  /* ── Mutations ── */
  const mutCreateVehicle = useCreateVehicle(familyId);
  const mutUpdateVehicle = useUpdateVehicle(familyId);
  const mutUpdateKm      = useUpdateVehicleKm(familyId);
  const mutSell          = useSellVehicle(familyId);
  const mutUnsell        = useUnsellVehicle(familyId);
  const mutDeleteVehicle = useDeleteVehicle(familyId);
  const mutCreateMaint   = useCreateMaintenance(familyId);
  const mutUpdateMaint   = useUpdateMaintenance(familyId);
  const mutDeleteMaint   = useDeleteMaintenance(familyId);
  const mutCreateDoc     = useCreateDocument(familyId);
  const mutUpdateDoc     = useUpdateDocument(familyId);
  const mutDeleteDoc     = useDeleteDocument(familyId);
  const mutCreateExp     = useCreateExpense(familyId);
  const mutUpdateExp     = useUpdateExpense(familyId);
  const mutDeleteExp     = useDeleteExpense(familyId);

  /* ── Modal state ── */
  const [showVehicleForm, setShowVehicleForm]       = useState(false);
  const [vehicleFormErrors, setVehicleFormErrors]   = useState<ValidationErrors | null>(null);
  const [editingVehicle,  setEditingVehicle]  = useState<Vehicle | null>(null);
  const [showMaintForm,   setShowMaintForm]   = useState(false);
  const [editingMaint,    setEditingMaint]    = useState<VehicleMaintenance | null>(null);
  const [showDocForm,     setShowDocForm]     = useState(false);
  const [editingDoc,      setEditingDoc]      = useState<VehicleDocument | null>(null);
  const [showExpForm,     setShowExpForm]     = useState(false);
  const [editingExp,      setEditingExp]      = useState<VehicleExpense | null>(null);
  const [showKmForm,      setShowKmForm]      = useState(false);
  const [showSellForm,    setShowSellForm]    = useState(false);
  const [deleteTarget,    setDeleteTarget]    = useState<{ type: string; id: string; label: string } | null>(null);

  /* ── Handlers: Vehicles ── */
  const handleSaveVehicle = useCallback(async (d: VehicleFormState) => {
    setVehicleFormErrors(null);
    const payload = {
      type:         d.type,
      brand:        d.brand.trim(),
      model:        d.model.trim(),
      year:         Number(d.year),
      licensePlate: d.licensePlate.trim(),
      fuelType:     d.fuelType,
      transmission: d.transmission,
      currentKm:    Number(d.currentKm) || 0,
      ...(d.vin      ? { vin:      d.vin.trim()      } : {}),
      ...(d.color    ? { color:    d.color.trim()    } : {}),
      ...(d.engineCC ? { engineCC: Number(d.engineCC) } : {}),
      ...(d.doors    ? { doors:    Number(d.doors)    } : {}),
    };
    try {
      if (editingVehicle) {
        await mutUpdateVehicle.mutateAsync({ vehicleId: editingVehicle.id, data: payload });
        setShowVehicleForm(false); setEditingVehicle(null);
      } else {
        const res = await mutCreateVehicle.mutateAsync(payload);
        setShowVehicleForm(false);
        if (res.data?.vehicle?.id) setSelectedId(res.data.vehicle.id);
      }
    } catch(err) {
      setVehicleFormErrors(parseApiError(err));
    }
  }, [editingVehicle, mutCreateVehicle, mutUpdateVehicle]);

  const handleSell = useCallback(async (date: string, price: string) => {
    if (!vehicle) return;
    try {
      await mutSell.mutateAsync({
        vehicleId: vehicle.id,
        soldDate:  toISO(date),
        ...(price ? { soldPrice: Number(price) } : {}),
      });
      setShowSellForm(false);
    } catch { /* error handled by React Query */ }
  }, [vehicle, mutSell]);

  const handleUndoSell = useCallback(async () => {
    if (!vehicle) return;
    try { await mutUnsell.mutateAsync(vehicle.id); } catch { /* noop */ }
  }, [vehicle, mutUnsell]);

  const handleKmUpdate = useCallback(async (km: number) => {
    if (!vehicle) return;
    try {
      await mutUpdateKm.mutateAsync({ vehicleId: vehicle.id, currentKm: km });
      setShowKmForm(false);
    } catch { /* noop */ }
  }, [vehicle, mutUpdateKm]);

  /* ── Handlers: Maintenance ── */
  const handleSaveMaint = useCallback(async (d: MaintFormState) => {
    if (!vehicle) return;
    const odometer = Number(d.odometer) || vehicle.currentKm;
    const payload = {
      type:        d.type,
      description: d.description,
      date:        toISO(d.date),
      odometer,
      ...(d.cost     ? { cost:     Number(d.cost)  } : {}),
      ...(d.workshop ? { workshop: d.workshop      } : {}),
      ...(d.nextKm   ? { nextKm:   Number(d.nextKm) } : {}),
      ...(d.nextDate ? { nextDate:  toISO(d.nextDate) } : {}),
    };
    try {
      if (editingMaint) {
        await mutUpdateMaint.mutateAsync({ vehicleId: vehicle.id, recordId: editingMaint.id, data: payload });
        setShowMaintForm(false); setEditingMaint(null);
      } else {
        await mutCreateMaint.mutateAsync({ vehicleId: vehicle.id, data: payload });
        setShowMaintForm(false);
      }
    } catch { /* noop */ }
  }, [vehicle, editingMaint, mutCreateMaint, mutUpdateMaint]);

  /* ── Handlers: Documents ── */
  const handleSaveDoc = useCallback(async (d: DocFormState) => {
    if (!vehicle) return;
    const payload = {
      type:       d.type,
      issueDate:  toISO(d.issueDate),
      expiryDate: toISO(d.expiryDate),
      ...(d.amount         ? { amount:         Number(d.amount) } : {}),
      ...(d.company        ? { company:         d.company       } : {}),
      ...(d.notes          ? { notes:           d.notes         } : {}),
      ...(d.attachmentName ? { attachmentName:  d.attachmentName } : {}),
      ...(d.attachmentData ? { attachmentData:  d.attachmentData } : {}),
    };
    try {
      if (editingDoc) {
        await mutUpdateDoc.mutateAsync({ vehicleId: vehicle.id, docId: editingDoc.id, data: payload });
        setShowDocForm(false); setEditingDoc(null);
      } else {
        await mutCreateDoc.mutateAsync({ vehicleId: vehicle.id, data: payload });
        setShowDocForm(false);
      }
    } catch { /* noop */ }
  }, [vehicle, editingDoc, mutCreateDoc, mutUpdateDoc]);

  /* ── Handlers: Expenses ── */
  const handleSaveExp = useCallback(async (d: ExpFormState) => {
    if (!vehicle) return;
    const payload = {
      date:        toISO(d.date),
      category:    d.category,
      description: d.description,
      amount:      Number(d.amount),
      ...(d.odometer ? { odometer: Number(d.odometer) } : {}),
      ...(d.liters   ? { liters:   Number(d.liters)   } : {}),
    };
    try {
      if (editingExp) {
        await mutUpdateExp.mutateAsync({ vehicleId: vehicle.id, expenseId: editingExp.id, data: payload });
        setShowExpForm(false); setEditingExp(null);
      } else {
        await mutCreateExp.mutateAsync({ vehicleId: vehicle.id, data: payload });
        setShowExpForm(false);
      }
    } catch { /* noop */ }
  }, [vehicle, editingExp, mutCreateExp, mutUpdateExp]);

  /* ── Handler: Delete ── */
  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget || !vehicle) return;
    const vid = vehicle.id;
    if (deleteTarget.type === "vehicle") {
      mutDeleteVehicle.mutate(vid, {
        onSuccess: () => {
          setSelectedId("");
          setDeleteTarget(null);
        },
      });
    } else if (deleteTarget.type === "maint") {
      mutDeleteMaint.mutate(
        { vehicleId: vid, recordId: deleteTarget.id },
        { onSuccess: () => setDeleteTarget(null) },
      );
    } else if (deleteTarget.type === "doc") {
      mutDeleteDoc.mutate(
        { vehicleId: vid, docId: deleteTarget.id },
        { onSuccess: () => setDeleteTarget(null) },
      );
    } else if (deleteTarget.type === "expense") {
      mutDeleteExp.mutate(
        { vehicleId: vid, expenseId: deleteTarget.id },
        { onSuccess: () => setDeleteTarget(null) },
      );
    }
  }, [deleteTarget, vehicle, mutDeleteVehicle, mutDeleteMaint, mutDeleteDoc, mutDeleteExp]);

  /* ════════════════════════════════════
     Loading / empty states
     ════════════════════════════════════ */
  if (!loadingList && !vehicle && !loadingDetail) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16 }}>
        <span style={{ fontSize: 48 }}>🚗</span>
        <p style={{ color: V.textMuted }}>No hay vehículos registrados.</p>
        <button onClick={() => setShowVehicleForm(true)} style={{
          padding: "10px 24px", borderRadius: 10, border: "none",
          background: `linear-gradient(135deg, ${ACCENT}, #A44FF7)`,
          color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>+ Agregar vehículo</button>
        <button onClick={() => navigate("/home")} style={{
          padding: "8px 20px", borderRadius: 8,
          border: "1px solid var(--border)", background: "transparent",
          color: V.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }}>← Volver al inicio</button>
        <Modal open={showVehicleForm} onClose={() => { setShowVehicleForm(false); setVehicleFormErrors(null); }} maxWidth={640}>
          <VehicleForm initial={EMPTY_VEHICLE_FORM} isEdit={false}
            onSave={handleSaveVehicle}
            onClose={() => { setShowVehicleForm(false); setVehicleFormErrors(null); }}
            apiErrors={vehicleFormErrors}
            isSaving={mutCreateVehicle.isPending || mutUpdateVehicle.isPending} />
        </Modal>
      </div>
    );
  }

  /* ════════════════════════════════════
     SIDEBAR
     ════════════════════════════════════ */
  const sidebar = (
    <div className={styles.sidebarWrap} style={{ background: V.sidebarBg }}>
      <div className={styles.sidebarHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${ACCENT}, #A44FF7)`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
          }}>🚗</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: V.text, lineHeight: 1.1 }}>Vehículos</div>
            <div style={{ fontSize: 11, color: V.textMuted }}>del Hogar</div>
          </div>
        </div>
      </div>

      <div className={styles.vList}>
        {loadingList
          ? <VehiclesSidebarSkeleton dark={isDark} />
          : vehicles.map(v => (
              <VehicleCard
                key={v.id}
                vehicle={v}
                active={v.id === effectiveId}
                onClick={() => { setSelectedId(v.id); setActiveSection("info"); }}
              />
            ))
        }
      </div>

      <div style={{ padding: "10px 16px" }}>
        <button className={styles.addBtn} onClick={() => { setEditingVehicle(null); setShowVehicleForm(true); }}>
          + Agregar vehículo
        </button>
      </div>

      <div style={{ marginTop: "auto", padding: "10px 16px 20px" }}>
        <button onClick={() => navigate("/home")} style={{
          width: "100%", padding: "9px", borderRadius: 8,
          border: "1px solid var(--border)", background: "transparent",
          color: V.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }}>← Volver al inicio</button>
      </div>
    </div>
  );

  /* ════════════════════════════════════
     CONTENT
     ════════════════════════════════════ */
  return (
    <>
      <DashboardLayout
        bg={vehicleBg(isDark)}
        isDesktop={isDesktop}
        drawerOpen={drawerOpen}
        onOpenDrawer={() => setDrawerOpen(true)}
        onCloseDrawer={() => setDrawerOpen(false)}
        sidebarContent={sidebar}
        mobileTitle={<span style={{ fontWeight: 700, color: V.text }}>🚗 Vehículos</span>}
        mobileActions={
          <button onClick={() => setShowVehicleForm(true)} style={{
            background: `linear-gradient(135deg, ${ACCENT}, #A44FF7)`,
            border: "none", borderRadius: 8, color: "#fff",
            padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>+ Agregar</button>
        }
      >
        {(loadingDetail && !vehicle) ? (
          <div className={styles.content}>
            <VehiclesContentSkeleton dark={isDark} />
          </div>
        ) : vehicle ? (
        <div className={styles.content}>

          {/* ── Vehicle header ── */}
          <div className={styles.vehicleHeader}>
            <div className={styles.vehicleHeaderLeft}>
              <div className={styles.vehicleEmoji}>{VEHICLE_ICONS[vehicle.type]}</div>
              <div>
                <div className={styles.vehicleTitle} style={{ color: V.text }}>
                  {vehicle.brand} {vehicle.model}
                  {vehicle.sold && <span className={styles.soldHeaderBadge}>Vendido</span>}
                </div>
                <div className={styles.vehicleSubtitle} style={{ color: V.textMuted }}>
                  <span>{vehicle.year}</span>
                  <span className={styles.plateBadge}>{vehicle.licensePlate}</span>
                  {vehicle.fuelType && <span>{FUEL_LABELS[vehicle.fuelType]}</span>}
                  {vehicle.transmission && <span>{TRANS_LABELS[vehicle.transmission]}</span>}
                  {vehicle.color && <span>{vehicle.color}</span>}
                </div>
              </div>
            </div>

            {!isLocked && (
              <div className={styles.vehicleHeaderActions}>
                <button className={styles.actionChip} onClick={() => setShowKmForm(true)}>
                  🔢 {fmtKm(vehicle.currentKm)}
                </button>
                <button className={styles.actionChip} onClick={() => { setEditingVehicle(vehicle); setShowVehicleForm(true); }}>
                  ✏️ Editar
                </button>
                <button className={styles.actionChipDanger} onClick={() => setShowSellForm(true)}>
                  🤝 Vendido
                </button>
                <button className={styles.actionChipDestructive}
                  onClick={() => setDeleteTarget({ type: "vehicle", id: vehicle.id, label: `${vehicle.brand} ${vehicle.model}` })}>
                  🗑 Eliminar
                </button>
              </div>
            )}
            {isLocked && (
              <div className={styles.vehicleHeaderActions}>
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
                  background: "var(--surface-alt)", padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#F7874F" }}>🤝 Vendido</span>
                    {vehicle.soldDate && (
                      <span style={{ fontSize: 12, color: V.textMuted }}>{fmtDate(vehicle.soldDate)}</span>
                    )}
                    {vehicle.soldPrice != null && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-green)" }}>
                        {fmtCLP(vehicle.soldPrice)}
                      </span>
                    )}
                  </div>
                  <button onClick={handleUndoSell} style={{
                    fontSize: 11, fontWeight: 600, color: ACCENT, background: "none",
                    border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
                    textDecoration: "underline",
                  }}>↩ Deshacer venta</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Alert banner ── */}
          {alerts.length > 0 && activeSection !== "alerts" && (
            <button className={styles.alertBanner} onClick={() => setActiveSection("alerts")}>
              {alerts.filter(a => a.level === "danger").length > 0
                ? `🚨 ${alerts.filter(a => a.level === "danger").length} alerta(s) crítica(s)`
                : `⚠️ ${alerts.length} alerta(s) pendiente(s)`
              }
              <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>Ver todas →</span>
            </button>
          )}

          {/* ── Section tabs ── */}
          <div className={styles.tabBar}>
            {alerts.length > 0 && (
              <SectionTab id="alerts" label="Alertas" icon="🔔" active={activeSection === "alerts"} onClick={() => setActiveSection("alerts")} badge={alerts.length} />
            )}
            <SectionTab id="info"        label="Información"  icon="📋" active={activeSection === "info"}        onClick={() => setActiveSection("info")} />
            <SectionTab id="maintenance" label="Bitácora"     icon="🔧" active={activeSection === "maintenance"} onClick={() => setActiveSection("maintenance")} badge={vMaint.length} />
            <SectionTab id="documents"   label="Documentos"   icon="📄" active={activeSection === "documents"}   onClick={() => setActiveSection("documents")}   badge={vDocs.length} />
            <SectionTab id="expenses"    label="Gastos"       icon="💸" active={activeSection === "expenses"}    onClick={() => setActiveSection("expenses")}    badge={vExp.length} />
            {alerts.length === 0 && (
              <SectionTab id="alerts" label="Alertas" icon="🔔" active={activeSection === "alerts"} onClick={() => setActiveSection("alerts")} badge={0} />
            )}
          </div>

          {/* ══ INFO ══ */}
          {activeSection === "info" && (
            <div className={styles.section}>
              <div className={styles.statsRow}>
                <StatCard icon="🔢" label="Odómetro"    value={fmtKm(vehicle.currentKm)} />
                <StatCard icon="⛽"  label="Combustible" value={vehicle.fuelType ? FUEL_LABELS[vehicle.fuelType] : "—"} />
                <StatCard icon="💸" label="Gasto total"  value={fmtCLP(expTotals.total)} />
                <StatCard icon="🔧" label="Mantenciones" value={String(vMaint.length)} />
              </div>

              <div className={styles.infoGrid}>
                <div className={styles.infoCard}>
                  <div className={styles.infoCardTitle}>🪪 Identificación</div>
                  <InfoField label="Marca"   value={vehicle.brand} />
                  <InfoField label="Modelo"  value={vehicle.model} />
                  <InfoField label="Año"     value={vehicle.year} />
                  <InfoField label="Tipo"    value={VEHICLE_TYPE_LABELS[vehicle.type]} />
                  <InfoField label="Color"   value={vehicle.color} />
                  <InfoField label="Patente" value={vehicle.licensePlate} />
                  <InfoField label="N° Chasis / VIN" value={vehicle.vin ?? "No registrado"} />
                </div>

                <div className={styles.infoCard}>
                  <div className={styles.infoCardTitle}>⚙️ Motor y mecánica</div>
                  <InfoField label="Cilindrada"    value={vehicle.engineCC ? `${vehicle.engineCC} cc` : "—"} />
                  <InfoField label="Combustible"   value={vehicle.fuelType ? FUEL_LABELS[vehicle.fuelType] : "—"} />
                  <InfoField label="Transmisión"   value={vehicle.transmission ? TRANS_LABELS[vehicle.transmission] : "—"} />
                  {(vehicle.doors ?? 0) > 0 && <InfoField label="N° Puertas" value={vehicle.doors} />}
                  <InfoField label="Odómetro actual" value={fmtKm(vehicle.currentKm)} />
                </div>

                <div className={styles.infoCard}>
                  <div className={styles.infoCardTitle}>📊 Estado</div>
                  <InfoField label="Estado"        value={vehicle.sold ? "Vendido" : "Activo"} />
                  {vehicle.sold && <InfoField label="Fecha venta"    value={fmtDate(vehicle.soldDate)} />}
                  {vehicle.sold && <InfoField label="Precio de venta" value={vehicle.soldPrice != null ? fmtCLP(vehicle.soldPrice) : "—"} />}
                  <InfoField label="Registrado el" value={fmtDate(vehicle.createdAt)} />
                  <InfoField label="Mantenciones"  value={String(vMaint.length)} />
                  <InfoField label="Documentos"    value={String(vDocs.length)} />
                </div>
              </div>
            </div>
          )}

          {/* ══ BITÁCORA ══ */}
          {activeSection === "maintenance" && (
            <div className={styles.section}>
              <div className={styles.sectionTopBar}>
                <h2 className={styles.sectionTitle} style={{ color: V.text }}>Bitácora de Mantenciones</h2>
                {!isLocked && (
                  <button className={styles.addRowBtn} onClick={() => { setEditingMaint(null); setShowMaintForm(true); }}>
                    + Registrar mantención
                  </button>
                )}
              </div>

              {vMaint.length === 0 ? (
                <div className={styles.emptyState}>
                  <span>🔧</span>
                  <p style={{ color: V.textMuted }}>Sin mantenciones registradas.</p>
                  {!isLocked && <button className={styles.addRowBtn} onClick={() => setShowMaintForm(true)}>Registrar primera mantención</button>}
                </div>
              ) : (
                <div className={styles.recordList}>
                  {vMaint.map(m => (
                    <div key={m.id} className={styles.maintRecord}>
                      <div className={styles.maintRecordLeft}>
                        <div className={styles.maintType}>{m.type}</div>
                        {m.description && <div className={styles.maintDesc}>{m.description}</div>}
                        <div className={styles.maintMeta}>
                          <span>📅 {fmtDate(m.date)}</span>
                          <span>🔢 {fmtKm(m.odometer)}</span>
                          <span>🏪 {m.workshop}</span>
                          {m.nextKm   && <span style={{ color: "var(--brand-blue)" }}>⟳ próx. {fmtKm(m.nextKm)}</span>}
                          {m.nextDate && <span style={{ color: "var(--brand-blue)" }}>⟳ próx. {fmtDate(m.nextDate)}</span>}
                        </div>
                      </div>
                      <div className={styles.maintRecordRight}>
                        <div className={styles.maintCost}>{fmtCLP(m.cost)}</div>
                        {!isLocked && (
                          <div className={styles.rowActions}>
                            <button className={styles.iconBtn} onClick={() => { setEditingMaint(m); setShowMaintForm(true); }}>✏️</button>
                            <button className={styles.iconBtn} onClick={() => setDeleteTarget({ type: "maint", id: m.id, label: m.type })}>🗑</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ DOCUMENTOS ══ */}
          {activeSection === "documents" && (
            <div className={styles.section}>
              <div className={styles.sectionTopBar}>
                <h2 className={styles.sectionTitle} style={{ color: V.text }}>Documentos del Vehículo</h2>
                {!isLocked && (
                  <button className={styles.addRowBtn} onClick={() => { setEditingDoc(null); setShowDocForm(true); }}>
                    + Agregar documento
                  </button>
                )}
              </div>

              {vDocs.length === 0 ? (
                <div className={styles.emptyState}>
                  <span>📄</span>
                  <p style={{ color: V.textMuted }}>Sin documentos registrados.</p>
                  {!isLocked && <button className={styles.addRowBtn} onClick={() => setShowDocForm(true)}>Agregar primer documento</button>}
                </div>
              ) : (
                <div className={styles.docGrid}>
                  {vDocs.map(d => {
                    const st   = docStatus(d.expiryDate);
                    const days = daysUntil(d.expiryDate);
                    return (
                      <div key={d.id} className={[styles.docCard, st === "vencida" ? styles.docCardExpired : st === "por_vencer" ? styles.docCardSoon : ""].join(" ")}>
                        <div className={styles.docCardTop}>
                          <span className={styles.docType}>{d.type}</span>
                          <DocBadge status={st} />
                        </div>
                        <div className={styles.docInfo}>
                          {d.company   && <span>🏢 {d.company}</span>}
                          <span>📅 Vence: <strong>{fmtDate(d.expiryDate)}</strong></span>
                          {days >= 0 ? (
                            <span style={{ color: st === "por_vencer" ? "var(--brand-orange)" : V.textMuted }}>
                              {days === 0 ? "Vence hoy" : `Faltan ${days} días`}
                            </span>
                          ) : (
                            <span style={{ color: "var(--brand-red)", fontWeight: 700 }}>
                              Vencida hace {Math.abs(days)} días
                            </span>
                          )}
                          {d.amount   != null && <span>💰 {fmtCLP(d.amount)}</span>}
                          {d.issueDate && <span style={{ color: V.textHint }}>Emisión: {fmtDate(d.issueDate)}</span>}
                          {d.notes     && <span style={{ color: V.textMuted, fontStyle: "italic" }}>{d.notes}</span>}
                        </div>
                        {d.attachmentData && (
                          <div style={{ marginTop: 4 }}>
                            {d.attachmentData.startsWith("data:image/") ? (
                              <a href={d.attachmentData} target="_blank" rel="noreferrer">
                                <img src={d.attachmentData} alt={d.attachmentName ?? ""}
                                  style={{ maxWidth: "100%", maxHeight: 80, borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer" }} />
                              </a>
                            ) : (
                              <a href={d.attachmentData} download={d.attachmentName ?? "documento"}
                                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: ACCENT, textDecoration: "none" }}>
                                📄 {d.attachmentName}
                              </a>
                            )}
                          </div>
                        )}
                        {!isLocked && (
                          <div className={styles.docActions}>
                            <button className={styles.iconBtn} onClick={() => { setEditingDoc(d); setShowDocForm(true); }}>✏️ Editar</button>
                            <button className={styles.iconBtn} onClick={() => setDeleteTarget({ type: "doc", id: d.id, label: d.type })}>🗑</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ GASTOS ══ */}
          {activeSection === "expenses" && (
            <div className={styles.section}>
              <div className={styles.sectionTopBar}>
                <h2 className={styles.sectionTitle} style={{ color: V.text }}>Historial de Gastos</h2>
                {!isLocked && (
                  <button className={styles.addRowBtn} onClick={() => setShowExpForm(true)}>
                    + Registrar gasto
                  </button>
                )}
              </div>

              {expYears.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {expYears.map(y => (
                    <button key={y} onClick={() => setSelectedExpYear(y)}
                      style={{
                        padding: "5px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                        fontFamily: "inherit", fontWeight: selectedExpYear === y ? 700 : 400,
                        border: selectedExpYear === y ? `1.5px solid ${ACCENT}` : "1.5px solid var(--border)",
                        background: selectedExpYear === y ? ACCENT + "18" : "transparent",
                        color: selectedExpYear === y ? ACCENT : V.textMuted,
                      }}>
                      {y}
                    </button>
                  ))}
                  {expYears.length > 1 && (
                    <button onClick={() => setSelectedExpYear("all")}
                      style={{
                        padding: "5px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                        fontFamily: "inherit", fontWeight: selectedExpYear === "all" ? 700 : 400,
                        border: selectedExpYear === "all" ? `1.5px solid ${ACCENT}` : "1.5px solid var(--border)",
                        background: selectedExpYear === "all" ? ACCENT + "18" : "transparent",
                        color: selectedExpYear === "all" ? ACCENT : V.textMuted,
                      }}>
                      Todos
                    </button>
                  )}
                </div>
              )}

              {Object.keys(expTotals.byCategory).length > 0 && (
                <div className={styles.expSummary}>
                  <div className={styles.expTotal}>
                    Total acumulado: <strong>{fmtCLP(expTotals.total)}</strong>
                  </div>
                  <div className={styles.catChips}>
                    {Object.entries(expTotals.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
                      <span key={cat} className={styles.catChip} style={{
                        background:  (EXPENSE_CAT_COLORS[cat] ?? "#8A93A8") + "18",
                        borderColor: (EXPENSE_CAT_COLORS[cat] ?? "#8A93A8") + "44",
                        color:        EXPENSE_CAT_COLORS[cat] ?? "#8A93A8",
                      }}>
                        {cat}: {fmtCLP(total)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {vExpByMonth.length === 0 ? (
                <div className={styles.emptyState}>
                  <span>💸</span>
                  <p style={{ color: V.textMuted }}>
                    {vExp.length > 0
                      ? `Sin gastos en ${selectedExpYear === "all" ? "el período seleccionado" : selectedExpYear}.`
                      : "Sin gastos registrados."}
                  </p>
                  {!isLocked && vExp.length === 0 && (
                    <button className={styles.addRowBtn} onClick={() => setShowExpForm(true)}>Registrar primer gasto</button>
                  )}
                </div>
              ) : vExpByMonth.map(([month, exps]) => {
                const [y, m] = month.split("-");
                const monthLabel = new Date(Number(y), Number(m) - 1)
                  .toLocaleDateString("es-CL", { month: "long", year: "numeric" });
                const monthTotal = exps.reduce((s, e) => s + e.amount, 0);
                return (
                  <div key={month} className={styles.monthGroup}>
                    <div className={styles.monthHeader}>
                      <span className={styles.monthLabel}>
                        {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
                      </span>
                      <span className={styles.monthSubtotal}>{fmtCLP(monthTotal)}</span>
                    </div>
                    <div className={styles.recordList}>
                      {exps.map(e => {
                        const catColor = EXPENSE_CAT_COLORS[e.category] ?? "#8A93A8";
                        return (
                          <div key={e.id} className={styles.expRecord}>
                            <div className={styles.expCatDot} style={{ background: catColor + "22", borderColor: catColor + "44" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: catColor }}>{e.category.slice(0, 3).toUpperCase()}</span>
                            </div>
                            <div className={styles.expBody}>
                              <div className={styles.expDesc}>{e.description || e.category}</div>
                              <div className={styles.expMeta}>
                                <span>📅 {fmtDate(e.date)}</span>
                                {e.odometer != null && <span>🔢 {fmtKm(e.odometer)}</span>}
                                {e.liters   != null && <span>⛽ {e.liters} L</span>}
                                {e.liters != null && e.amount && (
                                  <span style={{ color: V.textHint }}>{fmtCLP(Math.round(e.amount / e.liters))}/L</span>
                                )}
                              </div>
                            </div>
                            <div className={styles.expAmount}>{fmtCLP(e.amount)}</div>
                            {!isLocked && (
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className={styles.iconBtn}
                                  onClick={() => { setEditingExp(e); setShowExpForm(true); }}>
                                  ✏️
                                </button>
                                <button className={styles.iconBtn}
                                  onClick={() => setDeleteTarget({ type: "expense", id: e.id, label: e.description || e.category })}>
                                  🗑
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══ ALERTAS ══ */}
          {activeSection === "alerts" && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle} style={{ color: V.text, marginBottom: 18 }}>Alertas y Recordatorios</h2>
              {alerts.length === 0 ? (
                <div className={styles.emptyState}>
                  <span>✅</span>
                  <p style={{ color: V.textMuted }}>Todo al día. Sin alertas pendientes.</p>
                </div>
              ) : (
                <div className={styles.alertList}>
                  {alerts.map((a, i) => (
                    <div key={i} className={[styles.alertItem,
                      a.level === "danger" ? styles.alertDanger : styles.alertWarning,
                    ].join(" ")}>
                      <span className={styles.alertIcon}>{a.level === "danger" ? "🚨" : "⚠️"}</span>
                      <div>
                        <div className={styles.alertMsg}>{a.message}</div>
                        <div className={styles.alertType} style={{ color: V.textHint }}>
                          {a.type === "doc" ? "Documento" : "Mantención"}
                        </div>
                      </div>
                      {a.type === "doc" && (
                        <button className={styles.alertAction} onClick={() => setActiveSection("documents")}>
                          Ver documentos →
                        </button>
                      )}
                      {a.type === "maint" && (
                        <button className={styles.alertAction} onClick={() => setActiveSection("maintenance")}>
                          Ver bitácora →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {alerts.length === 0 && activeSection !== "alerts" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", borderRadius: 10,
              background: "#34C78A12", border: "1px solid #34C78A33",
              color: "var(--brand-green)", fontSize: 13, fontWeight: 600,
            }}>
              <span>✅</span>
              <span>Todo al día — sin alertas pendientes para este vehículo.</span>
            </div>
          )}

        </div>
        ) : null}
      </DashboardLayout>

      {/* ── Modals ── */}
      <Modal open={showVehicleForm} onClose={() => { setShowVehicleForm(false); setEditingVehicle(null); setVehicleFormErrors(null); }} maxWidth={640}>
        <VehicleForm
          isEdit={!!editingVehicle}
          initial={editingVehicle ? {
            type:         editingVehicle.type,
            brand:        editingVehicle.brand,
            model:        editingVehicle.model,
            year:         String(editingVehicle.year),
            licensePlate: editingVehicle.licensePlate,
            vin:          editingVehicle.vin ?? "",
            color:        editingVehicle.color ?? "",
            engineCC:     editingVehicle.engineCC != null ? String(editingVehicle.engineCC) : "",
            fuelType:     editingVehicle.fuelType ?? "gasoline",
            transmission: editingVehicle.transmission ?? "manual",
            doors:        editingVehicle.doors != null ? String(editingVehicle.doors) : "",
            currentKm:    String(editingVehicle.currentKm),
          } : EMPTY_VEHICLE_FORM}
          onSave={handleSaveVehicle}
          onClose={() => { setShowVehicleForm(false); setEditingVehicle(null); setVehicleFormErrors(null); }}
          apiErrors={vehicleFormErrors}
          isSaving={mutCreateVehicle.isPending || mutUpdateVehicle.isPending}
        />
      </Modal>

      <Modal open={showMaintForm} onClose={() => { setShowMaintForm(false); setEditingMaint(null); }} maxWidth={560}>
        {vehicle && (
          <MaintenanceForm
            initial={editingMaint ? {
              date:        toDateInput(editingMaint.date),
              type:        editingMaint.type,
              description: editingMaint.description,
              odometer:    String(editingMaint.odometer),
              cost:        editingMaint.cost != null ? String(editingMaint.cost) : "",
              workshop:    editingMaint.workshop ?? "",
              nextKm:      editingMaint.nextKm  != null ? String(editingMaint.nextKm) : "",
              nextDate:    toDateInput(editingMaint.nextDate),
            } : EMPTY_MAINT}
            vehicle={vehicle}
            onSave={handleSaveMaint}
            onClose={() => { setShowMaintForm(false); setEditingMaint(null); }}
            isSaving={mutCreateMaint.isPending || mutUpdateMaint.isPending}
          />
        )}
      </Modal>

      <Modal open={showDocForm} onClose={() => { setShowDocForm(false); setEditingDoc(null); }} maxWidth={520}>
        {vehicle && (
          <DocumentForm
            initial={editingDoc ? {
              type:           editingDoc.type,
              issueDate:      toDateInput(editingDoc.issueDate),
              expiryDate:     toDateInput(editingDoc.expiryDate),
              amount:         editingDoc.amount  != null ? String(editingDoc.amount) : "",
              company:        editingDoc.company ?? "",
              notes:          editingDoc.notes   ?? "",
              attachmentName: editingDoc.attachmentName ?? "",
              attachmentData: editingDoc.attachmentData ?? "",
            } : EMPTY_DOC}
            vehicle={vehicle}
            onSave={handleSaveDoc}
            onClose={() => { setShowDocForm(false); setEditingDoc(null); }}
            isSaving={mutCreateDoc.isPending || mutUpdateDoc.isPending}
          />
        )}
      </Modal>

      <Modal open={showExpForm} onClose={() => { setShowExpForm(false); setEditingExp(null); }} maxWidth={520}>
        {vehicle && (
          <ExpenseForm
            isEdit={!!editingExp}
            initial={editingExp ? {
              date:        toDateInput(editingExp.date),
              category:    editingExp.category,
              description: editingExp.description,
              amount:      String(editingExp.amount),
              odometer:    editingExp.odometer != null ? String(editingExp.odometer) : "",
              liters:      editingExp.liters   != null ? String(editingExp.liters)   : "",
            } : EMPTY_EXP}
            vehicle={vehicle}
            onSave={handleSaveExp}
            onClose={() => { setShowExpForm(false); setEditingExp(null); }}
            isSaving={mutCreateExp.isPending || mutUpdateExp.isPending}
          />
        )}
      </Modal>

      <Modal open={showKmForm} onClose={() => setShowKmForm(false)} maxWidth={400}>
        {vehicle && (
          <KmUpdateForm vehicle={vehicle} onSave={handleKmUpdate} onClose={() => setShowKmForm(false)} />
        )}
      </Modal>

      <Modal open={showSellForm} onClose={() => setShowSellForm(false)} maxWidth={480}>
        {vehicle && (
          <SellVehicleForm vehicle={vehicle} onConfirm={handleSell} onClose={() => setShowSellForm(false)} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title={`Eliminar ${deleteTarget?.type === "vehicle" ? "vehículo" : deleteTarget?.type === "maint" ? "mantención" : deleteTarget?.type === "doc" ? "documento" : "gasto"}`}
        description={`¿Eliminar "${deleteTarget?.label}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        confirmColor="var(--brand-red)"
      />
    </>
  );
}
