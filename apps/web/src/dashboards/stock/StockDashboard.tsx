import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { useTheme } from "@/lib/theme";
import { useWindowWidth } from "@/hooks/useWindowWidth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { StockSkeleton } from "@/components/ui/DashboardSkeletons";
import { ApiError } from "@/lib/api";
import { parseApiError, fieldError, type ValidationErrors } from "@/lib/apiErrors";
import { FieldError as FErr } from "@/components/ui/FieldError";
import {
  useStockCategories, useSeedStockCategories,
  useCreateStockCategory, useDeleteStockCategory,
  useCreateStockItem, useUpdateStockItem,
  useAdjustQuantity, useDeleteStockItem,
  useAddBarcode, searchStockItems,
  stockStatus,
  type StockCategory, type StockItem, type ItemInput, type CatInput,
} from "@/hooks/useStock";
import styles from "./StockDashboard.module.css";

/* ════════════════════════════════════
   Constants
   ════════════════════════════════════ */
const UNITS     = ["unidades", "kg", "g", "litros", "ml", "rollos", "bolsas", "cajas", "paquetes"];
const LOCATIONS = ["Despensa", "Refrigerador", "Freezer", "Baño", "Lavandería", "Bodega", "Otro"];

const CAT_COLORS = ["#34C78A","#4F7BF7","#F7874F","#A44FF7","#F74F7B","#F7C24F","#4FC7F7","#8A93A8"];

function stockBg(dark: boolean) {
  return dark ? "#0F1F1A" : "#F0FBF6";
}

/* ════════════════════════════════════
   Barcode scanner
   ════════════════════════════════════ */
declare global {
  interface Window {
    Html5Qrcode?: { new(id: string): {
      start(cam: string | object, cfg: object, onSuccess: (code: string) => void, onError: () => void): Promise<void>;
      stop(): Promise<void>;
    }; getCameras(): Promise<Array<{ id: string; label: string }>>;};
  }
}

function loadScannerLib(): Promise<void> {
  return new Promise((res, rej) => {
    if (window.Html5Qrcode) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";
    s.onload = () => res();
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function fetchProductInfo(barcode: string) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const d = await r.json() as { status: number; product?: { product_name_es?: string; product_name?: string; generic_name?: string } };
    if (d.status === 1 && d.product) {
      return { name: d.product.product_name_es || d.product.product_name || d.product.generic_name || "" };
    }
  } catch { /* noop */ }
  return null;
}

/* ── Scanner modal (fullscreen, colores fijos oscuros) ── */
function ScannerModal({ mode, onClose, onScanned }: {
  mode: "add" | "consume"; onClose: () => void; onScanned: (code: string) => void;
}) {
  const scannerRef  = useRef<HTMLDivElement>(null);
  const html5Ref    = useRef<{ stop(): Promise<void> } | null>(null);
  const activeCamId = useRef<string>("");
  const [status, setStatus]     = useState<"init"|"ready"|"found"|"error">("init");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [camList, setCamList]   = useState<Array<{ id: string; label: string }>>([]);
  const [camIdx, setCamIdx]     = useState(0);

  const modeColor = mode === "add" ? "#34C78A" : "#F7874F";
  const modeLabel = mode === "add" ? "Agregar al stock" : "Consumir producto";

  async function stopScanner() {
    if (html5Ref.current) {
      try { await html5Ref.current.stop(); } catch { /* noop */ }
      html5Ref.current = null;
    }
  }
  async function startScanner(camId: string) {
    if (!scannerRef.current || !window.Html5Qrcode) return;
    await stopScanner();
    // Limpiar DOM residual que deja Html5Qrcode al detenerse
    scannerRef.current.innerHTML = "";
    activeCamId.current = camId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scanner = new (window.Html5Qrcode as any)("qr-reader", { experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
    html5Ref.current = scanner;
    try {
      await scanner.start(
        camId || { facingMode: "environment" },
        { fps: 25, qrbox: { width: 280, height: 160 } },
        (code: string) => {
          // Ignorar lecturas demasiado cortas (ruido o códigos parciales)
          if (code.length < 6) return;
          setLastCode(code); setStatus("found"); void stopScanner();
        },
        () => {}
      );
    } catch { setStatus("error"); }
  }

  useEffect(() => {
    let mounted = true;
    loadScannerLib()
      .then(() => window.Html5Qrcode!.getCameras())
      .then(cams => {
        if (!mounted || !cams.length) { setStatus("error"); return; }
        setCamList(cams);
        const idx = cams.findIndex(c => /back|rear|environment/i.test(c.label));
        const camId = cams[idx >= 0 ? idx : 0]?.id ?? "";
        setCamIdx(idx >= 0 ? idx : 0);
        setStatus("ready");
        if (camId) void startScanner(camId);
      })
      .catch(() => { if (mounted) setStatus("error"); });
    return () => { mounted = false; void stopScanner(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Scanner permanece con inline styles: es una pantalla fullscreen con fondo oscuro
     fijo (#000D), independiente del tema. */
  return (
    <div style={{ position:"fixed", inset:0, background:"#000D", zIndex:300, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
      <style>{`@keyframes scanLine{0%{top:10%;opacity:1}50%{top:90%;opacity:1}100%{top:10%;opacity:1}}#qr-reader video{width:100%!important}#qr-reader img{display:none}#qr-reader__scan_region{border:none!important}#qr-reader__dashboard{display:none!important}`}</style>

      <div style={{ position:"absolute", top:0, left:0, right:0, padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:20 }}>{mode==="add"?"📥":"📤"}</span>
          <span style={{ fontWeight:700, fontSize:15, color:"#fff" }}>{modeLabel}</span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {camList.length > 1 && (
            <button onClick={async () => { const next=(camIdx+1)%camList.length; setCamIdx(next); const cam=camList[next]; if(cam) await startScanner(cam.id); }} style={{ background:"#ffffff22", border:"none", borderRadius:8, padding:"6px 10px", cursor:"pointer", color:"#fff", fontSize:16 }}>🔄</button>
          )}
          <button onClick={() => { stopScanner(); onClose(); }} style={{ background:"#ffffff22", border:"none", borderRadius:8, padding:"6px 12px", cursor:"pointer", color:"#fff", fontWeight:700, fontSize:14, fontFamily:"inherit" }}>✕</button>
        </div>
      </div>

      <div style={{ position:"relative", width:"min(480px, 100vw)" }}>
        <div id="qr-reader" ref={scannerRef} style={{ width:"100%", borderRadius:16, overflow:"hidden" }} />
        {status === "ready" && (
          <div style={{ position:"absolute", inset:0, pointerEvents:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ position:"relative", width:240, height:120 }}>
              {[{t:"0",l:"0",bv:"borderTop",bh:"borderLeft"},{t:"0",r:"0",bv:"borderTop",bh:"borderRight"},{b:"0",l:"0",bv:"borderBottom",bh:"borderLeft"},{b:"0",r:"0",bv:"borderBottom",bh:"borderRight"}].map((c,i) => (
                <div key={i} style={{ position:"absolute",...(c.t?{top:0}:{}),...(c.b?{bottom:0}:{}),...(c.l?{left:0}:{}),...(c.r?{right:0}:{}),[c.bv]:`3px solid ${modeColor}`,[c.bh]:`3px solid ${modeColor}`, width:24, height:24 }} />
              ))}
              <div style={{ position:"absolute", left:8, right:8, height:2, background:`linear-gradient(90deg, transparent, ${modeColor}, transparent)`, animation:"scanLine 1.5s ease-in-out infinite", top:"50%" }} />
            </div>
          </div>
        )}
        {status === "error" && (
          <div style={{ background:"#1A2340", borderRadius:16, padding:"48px 24px", textAlign:"center", color:"#fff" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📷</div>
            <div style={{ fontWeight:700, marginBottom:8 }}>No se pudo acceder a la cámara</div>
            <div style={{ fontSize:13, color:"#8A93A8" }}>Revisa los permisos en tu navegador</div>
          </div>
        )}
        {status === "found" && (
          <div style={{ background:"#1A2340", borderRadius:16, padding:"32px 24px", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
            <div style={{ fontWeight:800, fontSize:18, color:"#fff", marginBottom:4 }}>¡Código leído!</div>
            <div style={{ fontFamily:"monospace", fontSize:16, color:modeColor, marginBottom:20, letterSpacing:2 }}>{lastCode}</div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={() => { setLastCode(null); setStatus("ready"); void startScanner(activeCamId.current); }} style={{ background:"#ffffff18", border:"none", borderRadius:8, padding:"9px 18px", color:"#fff", cursor:"pointer", fontFamily:"inherit", fontWeight:600, fontSize:14 }}>Escanear otro</button>
              <button onClick={() => { if(lastCode) onScanned(lastCode); onClose(); }} style={{ background:modeColor, border:"none", borderRadius:8, padding:"9px 18px", color:"#fff", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:14 }}>
                {mode==="add"?"Agregar →":"Descontar →"}
              </button>
            </div>
          </div>
        )}
      </div>
      {status === "ready" && (
        <div style={{ marginTop:24, textAlign:"center", color:"#ffffffaa", fontSize:13 }}>
          Apunta al código de barras del producto
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════
   ProductCard
   ════════════════════════════════════ */
function ProductCard({ item, cat, onEdit, onDelete, onAdjust }: {
  item: StockItem; cat: StockCategory | undefined;
  onEdit: (i: StockItem) => void;
  onDelete: (i: StockItem) => void;
  onAdjust: (id: string, delta: number) => void;
}) {
  const s = stockStatus(item);
  return (
    <div
      className={styles.itemCard}
      style={{ borderLeftColor: s.dot }}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>{cat?.icon ?? "📦"}</span>

      <div className={styles.itemInfo}>
        <div className={styles.itemHeader}>
          <span className={styles.itemName}>{item.name}</span>
          <span
            className={styles.itemStatusBadge}
            style={{ color: s.color, background: s.bg, borderColor: s.color + "30" }}
          >
            {s.label}
          </span>
        </div>
        <div className={styles.itemMeta}>
          {item.location && <span className={styles.itemMetaText}>📍 {item.location}</span>}
          <span className={styles.itemMetaText}>Mín: {item.minimum} {item.unit}</span>
        </div>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
        <button
          onClick={() => onAdjust(item.id, -1)}
          className="fh-btn fh-btn-ghost"
          style={{ width:28, height:28, padding:0, borderRadius:7, fontSize:16 }}
        >−</button>
        <span style={{ minWidth:36, textAlign:"center", fontWeight:800, fontSize:16, color:s.dot }}>{item.quantity}</span>
        <button
          onClick={() => onAdjust(item.id, +1)}
          className="fh-btn fh-btn-ghost"
          style={{ width:28, height:28, padding:0, borderRadius:7, fontSize:16 }}
        >+</button>
        <span className={styles.itemMetaText} style={{ minWidth:50 }}>{item.unit}</span>
      </div>

      <div className={styles.itemActions}>
        <button onClick={() => onEdit(item)} className={styles.btnIconSm}>✏️</button>
        <button onClick={() => onDelete(item)} className={`${styles.btnIconSm} ${styles.btnIconDanger}`}>🗑️</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   Modal product
   ════════════════════════════════════ */
type ItemForm = {
  name: string; categoryId: string; quantity: string; minimum: string;
  unit: string; location: string; notes: string; barcode: string;
};
const EMPTY_FORM: ItemForm = {
  name:"", categoryId:"", quantity:"0", minimum:"0",
  unit:"unidades", location:"Despensa", notes:"", barcode:"",
};

function ModalProduct({ open, initial, initialBarcode, categories, allItems, onSave, onClose, onOpenScanner, onUseExisting, isMobile, apiErrors, isSaving }: {
  open: boolean; initial: StockItem | null; initialBarcode?: string | null; categories: StockCategory[];
  allItems: StockItem[];
  onSave: (d: ItemInput) => void; onClose: () => void;
  onOpenScanner: () => void;
  onUseExisting: (item: StockItem) => void;
  isMobile: boolean;
  apiErrors?: ValidationErrors | null;
  isSaving?: boolean;
}) {
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates]         = useState<StockItem[]>([]);
  const [ignoreDuplicate, setIgnoreDuplicate] = useState(false);

  // Detección de duplicados: solo en modo creación, mínimo 2 caracteres
  useEffect(() => {
    if (initial || ignoreDuplicate || form.name.trim().length < 2) {
      setDuplicates([]);
      return;
    }
    const q = form.name.trim().toLowerCase();
    const qWords = q.split(/\s+/);
    const matches = allItems.filter(i => {
      const nWords = i.name.toLowerCase().split(/\s+/);
      // Alguna palabra del producto empieza con alguna palabra del query
      const prefixMatch = nWords.some(nw => qWords.some(qw => nw.startsWith(qw)));
      // O el query completo contiene el nombre existente (ej: escribir "Arroz Integral" con "Arroz" en stock)
      const superMatch = q.includes(i.name.toLowerCase());
      return prefixMatch || superMatch;
    }).slice(0, 3);
    setDuplicates(matches);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name, initial, ignoreDuplicate]);

  useEffect(() => {
    if (!open) return;
    setLocalErrors({});
    setDuplicates([]);
    setIgnoreDuplicate(false);
    setForm(initial ? {
      name: initial.name, categoryId: initial.categoryId,
      quantity: String(initial.quantity), minimum: String(initial.minimum),
      unit: initial.unit, location: initial.location ?? "Despensa",
      notes: initial.notes ?? "", barcode: "",
    } : { ...EMPTY_FORM, categoryId: categories[0]?.id ?? "", barcode: initialBarcode ?? "" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: keyof ItemForm, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    setLocalErrors(p => ({ ...p, [k]: "" }));
  };
  const f = (k: keyof ItemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    set(k, e.target.value);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim())             e.name     = "Obligatorio";
    else if (form.name.length > 100)   e.name     = "Máximo 100 caracteres";
    if (!form.categoryId)              e.categoryId = "Selecciona una categoría";
    if (Number(form.quantity) < 0)     e.quantity = "No puede ser negativo";
    if (Number(form.minimum) < 0)      e.minimum  = "No puede ser negativo";
    setLocalErrors(e);
    return Object.keys(e).length === 0;
  }

  const err = (k: string) => localErrors[k] || fieldError(apiErrors, k);

  function handleSave() {
    if (!validate()) return;
    onSave({
      name: form.name.trim(), categoryId: form.categoryId,
      quantity: Number(form.quantity) || 0, minimum: Number(form.minimum) || 0,
      unit: form.unit, location: form.location || null,
      notes: form.notes || null,
      // en nuevo: primer barcode del campo; en edición: no tocar barcodes existentes (se gestionan via scan)
      ...(initial ? {} : { barcodes: form.barcode ? [form.barcode] : [] }),
    });
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={520}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <span style={{ fontWeight:700, fontSize:16 }} className="fh-text">{initial ? "Editar producto" : "Agregar producto"}</span>
        <button onClick={onClose} className="fh-btn-ghost" style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, padding:0 }} >✕</button>
      </div>

      {/* Banner de error general */}
      {apiErrors?.message && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-text)]/20">
          <p className="text-[var(--danger-text)] text-sm font-semibold">{apiErrors.message}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3.5">
        {[
          { label:"NOMBRE",           key:"name"       as const, type:"text",   col:2, ph:"Ej: Arroz, Shampoo...", auto:true },
          { label:"CATEGORÍA",        key:"categoryId" as const, type:"select", col:2 },
          { label:"CANTIDAD ACTUAL",  key:"quantity"   as const, type:"number", col:1 },
          { label:"STOCK MÍNIMO",     key:"minimum"    as const, type:"number", col:1 },
          { label:"UNIDAD",           key:"unit"       as const, type:"select-units", col:1 },
          { label:"UBICACIÓN",        key:"location"   as const, type:"select-loc",   col:1 },
          { label:"NOTAS (opcional)", key:"notes"      as const, type:"text",   col:1, ph:"Marca preferida, obs..." },
        ].map(({ label, key, type, col, ph, auto }) => (
          <div key={key} className={col === 2 ? "mb-3 col-span-full" : "mb-3"}>
            <label className={styles.catModalLabel} style={{ textTransform:"uppercase", fontSize:11 }}>{label}</label>
            {/* Advertencia de duplicados (solo en nombre, solo en creación) */}
            {key === "name" && !initial && duplicates.length > 0 && (
              <div className={styles.dupWarn}>
                <div className={styles.dupWarnHeader}>
                  <span>⚠️</span>
                  <span>Ya existe un producto similar:</span>
                </div>
                {duplicates.map(dup => {
                  const st = stockStatus(dup);
                  return (
                    <div key={dup.id} className={styles.dupWarnItem}>
                      <div className={styles.dupWarnItemInfo}>
                        <div className={styles.dupWarnItemName}>{dup.name}</div>
                        <div className={styles.dupWarnItemMeta}>
                          <span className={styles.dupWarnDot} style={{ background: st.dot }} />
                          <span className={styles.dupWarnStatusLabel} style={{ color: st.color }}>{st.label}</span>
                          <span className={styles.dupWarnQty}>· {dup.quantity} {dup.unit}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => onUseExisting(dup)}
                        className="fh-btn fh-btn-success"
                        style={{ flexShrink: 0, fontSize: 12, padding: "6px 12px" }}
                      >
                        Usar este →
                      </button>
                    </div>
                  );
                })}
                <button className={styles.dupWarnIgnore} onClick={() => setIgnoreDuplicate(true)}>
                  Crear como producto nuevo de todas formas
                </button>
              </div>
            )}
            {type === "select" ? (
              <select className="fh-input" value={form[key]} onChange={f(key)}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
            ) : type === "select-units" ? (
              <select className="fh-input" value={form[key]} onChange={f(key)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            ) : type === "select-loc" ? (
              <select className="fh-input" value={form[key]} onChange={f(key)}>
                {LOCATIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            ) : (
              <input
                className="fh-input"
                autoFocus={auto}
                type={type === "number" ? "number" : "text"}
                min={type === "number" ? "0" : undefined}
                placeholder={ph}
                value={form[key]}
                onChange={f(key)}
              />
            )}
            <FErr msg={err(key)} />
          </div>
        ))}

        {/* Barcode */}
        <div className="mb-3">
          <label className={styles.catModalLabel} style={{ textTransform:"uppercase", fontSize:11 }}>
            {initial ? "CÓDIGOS DE BARRAS" : "CÓDIGO DE BARRAS"}
          </label>
          {/* Chips de barcodes existentes (solo en edición) */}
          {initial && initial.barcodes.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
              {initial.barcodes.map(bc => (
                <span key={bc} style={{ fontFamily:"monospace", fontSize:11, background:"var(--surface-alt)", border:"1px solid var(--border)", borderRadius:6, padding:"3px 8px", color:"var(--text-muted)" }}>
                  {bc}
                </span>
              ))}
            </div>
          )}
          {/* Campo para agregar nuevo barcode (solo en creación, o escanear para vincular en edición vía flujo de scanner) */}
          {!initial && (
            <div style={{ display:"flex", gap:6 }}>
              <input className="fh-input" placeholder="Ej: 7891234567890" value={form.barcode} onChange={f("barcode")} />
              <button
                onClick={() => { onClose(); onOpenScanner(); }}
                className={styles.btnScanSmall}
                title="Escanear"
              >📷</button>
            </div>
          )}
          {initial && (
            <p style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>
              Para vincular más códigos, escanéalos y elige "Vincular a este producto".
            </p>
          )}
          <FErr msg={err("barcode")} />
        </div>
      </div>

      <div className={styles.formActions}>
        <button onClick={onClose} disabled={isSaving} className="fh-btn fh-btn-ghost">Cancelar</button>
        <button onClick={handleSave} disabled={isSaving} className="fh-btn fh-btn-success">
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════
   Modal: agregar categoría
   ════════════════════════════════════ */
function ModalAddCategory({ open, onClose, onSave }: {
  open: boolean; onClose: () => void;
  onSave: (input: CatInput) => Promise<void>;
}) {
  const [label, setLabel]   = useState("");
  const [icon, setIcon]     = useState("📦");
  const [color, setColor]   = useState(CAT_COLORS[0]!);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setLabel(""); setIcon("📦"); setColor(CAT_COLORS[0]!); } }, [open]);

  async function handleSave() {
    if (!label.trim()) return;
    setSaving(true);
    try { await onSave({ label: label.trim(), icon, color }); onClose(); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} maxWidth={360}>
      <p className={styles.deleteModalTitle}>Nueva categoría</p>

      <label className={styles.catModalLabel}>Nombre</label>
      <input
        autoFocus className="fh-input" style={{ marginTop:4, marginBottom:14 }}
        value={label} onChange={e => setLabel(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handleSave()}
        placeholder="ej. Frutas y verduras" maxLength={60}
      />

      <label className={styles.catModalLabel}>Ícono (emoji)</label>
      <input
        className="fh-input" style={{ width:60, marginTop:4, marginBottom:14, fontSize:18, textAlign:"center" }}
        value={icon} onChange={e => setIcon(e.target.value.slice(-2) || "📦")} maxLength={2}
      />

      <label className={styles.catModalLabel} style={{ display:"block", marginBottom:6 }}>Color</label>
      <div className={styles.colorSwatches}>
        {CAT_COLORS.map(c => (
          <button
            key={c}
            className={`${styles.colorSwatch} ${color === c ? styles.colorSwatchActive : ""}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>

      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onClose} disabled={saving} className="fh-btn fh-btn-ghost" style={{ flex:1 }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving || !label.trim()} className="fh-btn fh-btn-success" style={{ flex:1 }}>
          {saving ? "Guardando..." : "Crear"}
        </button>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════
   Modal: eliminar categoría
   ════════════════════════════════════ */
function ModalDeleteCategory({ cat, onClose, onConfirm }: {
  cat: StockCategory | null; onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => { if (cat) setError(null); }, [cat]);

  async function handleDelete() {
    if (!cat) return;
    setSaving(true); setError(null);
    try { await onConfirm(cat.id); onClose(); }
    catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? (e.data as { error?: string })?.error ?? "No se puede eliminar esta categoría."
          : "Error al eliminar. Intenta de nuevo."
      );
    } finally { setSaving(false); }
  }

  return (
    <Modal open={!!cat} onClose={saving ? () => {} : onClose} maxWidth={360}>
      <p className={styles.deleteModalTitle}>Eliminar categoría</p>
      <p className={styles.deleteModalDesc}>
        ¿Eliminar <strong>{cat?.icon} {cat?.label}</strong>? Esta acción no se puede deshacer.
      </p>
      {error && <div className="fh-alert-danger" style={{ marginBottom:12 }}>{error}</div>}
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onClose} disabled={saving} className="fh-btn fh-btn-ghost" style={{ flex:1 }}>Cancelar</button>
        <button onClick={handleDelete} disabled={saving} className="fh-btn fh-btn-danger" style={{ flex:1 }}>
          {saving ? "Eliminando..." : "Eliminar"}
        </button>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════
   Main dashboard
   ════════════════════════════════════ */
/* ── ModalScanAction: barcode YA existe en el stock ── */
function ModalScanAction({ barcode, item, onAdd, onConsume, onClose }: {
  barcode: string; item: StockItem;
  onAdd: () => void; onConsume: () => void; onClose: () => void;
}) {
  const st = stockStatus(item);
  return (
    <Modal open onClose={onClose} maxWidth={380}>
      <div style={{ textAlign:"center", padding:"4px 0 8px" }}>
        <div style={{ fontSize:36, marginBottom:8 }}>📦</div>
        <div style={{ fontWeight:800, fontSize:16, marginBottom:4 }} className="fh-text">{item.name}</div>
        <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>
          Código: <span style={{ fontFamily:"monospace" }}>{barcode}</span>
        </div>
        <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:st.bg, borderRadius:20, padding:"4px 12px", marginBottom:20 }}>
          <span style={{ width:8, height:8, borderRadius:"50%", background:st.dot, display:"inline-block" }} />
          <span style={{ fontSize:12, fontWeight:700, color:st.color }}>{st.label} — {item.quantity} {item.unit}</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <button onClick={onAdd} style={{ padding:"12px", borderRadius:12, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:14, background:"linear-gradient(135deg,#34C78A,#2aab78)", color:"#fff" }}>
            + Agregar al stock
          </button>
          <button onClick={onConsume} style={{ padding:"12px", borderRadius:12, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:14, background:"linear-gradient(135deg,#F7874F,#e06a30)", color:"#fff" }}>
            − Consumir
          </button>
          <button onClick={onClose} style={{ padding:"10px", borderRadius:12, border:"1.5px solid var(--border)", cursor:"pointer", fontFamily:"inherit", fontWeight:600, fontSize:13, background:"none", color:"var(--text-muted)" }}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── ModalScanNotFound: barcode NO existe en el stock ── */
function ModalScanNotFound({ barcode, allItems, familyId, onCreateNew, onLinked, onClose }: {
  barcode: string; allItems: StockItem[]; familyId: string;
  onCreateNew: () => void; onLinked: (item: StockItem) => void; onClose: () => void;
}) {
  const [mode, setMode]         = useState<"choice"|"link">("choice");
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<StockItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking]   = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const mutAdd = useAddBarcode(familyId);

  async function doSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      // Buscar localmente primero (más rápido), luego API si hay pocos resultados
      const local = allItems.filter(i => i.name.toLowerCase().includes(q.toLowerCase()));
      if (local.length > 0) { setResults(local.slice(0, 8)); }
      else {
        const remote = await searchStockItems(familyId, q);
        setResults(remote.slice(0, 8));
      }
    } catch { setResults([]); }
    finally { setSearching(false); }
  }

  async function handleLink(item: StockItem) {
    setLinking(true); setLinkError(null);
    try {
      await mutAdd.mutateAsync({ id: item.id, barcode });
      onLinked(item);
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      setLinkError(msg ?? "Error al vincular. Intenta de nuevo.");
    } finally { setLinking(false); }
  }

  return (
    <Modal open onClose={onClose} maxWidth={400}>
      {mode === "choice" ? (
        <div style={{ textAlign:"center", padding:"4px 0 8px" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🔍</div>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:4 }} className="fh-text">Código no encontrado</div>
          <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:20 }}>
            <span style={{ fontFamily:"monospace" }}>{barcode}</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <button onClick={onCreateNew} style={{ padding:"12px", borderRadius:12, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:14, background:"linear-gradient(135deg,#4F7BF7,#A44FF7)", color:"#fff" }}>
              + Crear nuevo producto
            </button>
            <button onClick={() => setMode("link")} style={{ padding:"12px", borderRadius:12, border:"1.5px solid #4F7BF730", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:14, background:"#4F7BF710", color:"#4F7BF7" }}>
              🔗 Vincular a producto existente
            </button>
            <button onClick={onClose} style={{ padding:"10px", borderRadius:12, border:"1.5px solid var(--border)", cursor:"pointer", fontFamily:"inherit", fontWeight:600, fontSize:13, background:"none", color:"var(--text-muted)" }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <button onClick={() => setMode("choice")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, padding:0, color:"var(--text-muted)" }}>←</button>
            <span style={{ fontWeight:700, fontSize:15 }} className="fh-text">Vincular a producto existente</span>
          </div>
          <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:12 }}>
            El código <span style={{ fontFamily:"monospace", fontWeight:700 }}>{barcode}</span> quedará vinculado al producto que elijas.
          </div>
          <input
            className="fh-input"
            placeholder="Buscar producto..."
            value={query}
            onChange={e => doSearch(e.target.value)}
            autoFocus
            style={{ marginBottom:10 }}
          />
          {linkError && <div style={{ fontSize:12, color:"#F74F7B", marginBottom:8, fontWeight:600 }}>{linkError}</div>}
          <div style={{ maxHeight:260, overflowY:"auto", display:"flex", flexDirection:"column", gap:6 }}>
            {searching && <div style={{ textAlign:"center", color:"var(--text-muted)", fontSize:13, padding:12 }}>Buscando...</div>}
            {!searching && query.length >= 2 && results.length === 0 && (
              <div style={{ textAlign:"center", color:"var(--text-muted)", fontSize:13, padding:12 }}>Sin resultados</div>
            )}
            {results.map(item => (
              <button
                key={item.id}
                onClick={() => handleLink(item)}
                disabled={linking}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, border:"1.5px solid var(--border)", background:"var(--surface-alt)", cursor:"pointer", fontFamily:"inherit", textAlign:"left", opacity: linking ? 0.6 : 1 }}
              >
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:13, color:"var(--text)" }}>{item.name}</div>
                  <div style={{ fontSize:11, color:"var(--text-muted)" }}>{item.quantity} {item.unit} · {item.barcodes.length} código{item.barcodes.length !== 1 ? "s" : ""}</div>
                </div>
                <span style={{ fontSize:13, color:"#4F7BF7", fontWeight:700 }}>Vincular →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

type ScanFeedback = {
  type: "consume"|"added"|"searching"|"not-found";
  name?: string; quantity?: number; unit?: string;
  barcode?: string; alert?: boolean; color: string;
} | null;

export default function StockDashboard() {
  const navigate  = useNavigate();
  const qc        = useQueryClient(); void qc;
  const { currentFamily } = useAuthStore();
  const familyId  = currentFamily?.id;

  const { isDark, toggle: toggleTheme } = useTheme();
  const W = useWindowWidth();
  const isDesktop = W >= 1024;
  const isMobile  = W < 640;

  const [activeCategory, setActiveCategory] = useState<string>("Todas");
  const [listView, setListView]             = useState(false);
  const [drawerOpen, setDrawer]             = useState(false);
  const [productModal, setProductModal]     = useState(false);
  const [itemFormErrors, setItemFormErrors] = useState<ValidationErrors | null>(null);
  const [editItem, setEditItem]             = useState<StockItem | null>(null);
  const [delItem, setDelItem]               = useState<StockItem | null>(null);
  const [scanner, setScanner]               = useState<"add"|"consume"|null>(null);
  const [scanFeedback, setScanFeedback]     = useState<ScanFeedback>(null);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [scanResult, setScanResult]         = useState<{ barcode: string; item: StockItem | null } | null>(null);
  const [addCatOpen, setAddCatOpen]         = useState(false);
  const [deleteCat, setDeleteCat]           = useState<StockCategory | null>(null);
  const [query, setQuery]                   = useState("");
  const [fabOpen, setFabOpen]               = useState(false);
  const [page, setPage]                     = useState(1);
  const PAGE_SIZE = 5;

  const { data: categories = [], isLoading } = useStockCategories(familyId);
  const mutSeed      = useSeedStockCategories(familyId);
  const mutCreate    = useCreateStockItem(familyId);
  const mutUpdate    = useUpdateStockItem(familyId);
  const mutAdjust    = useAdjustQuantity(familyId);
  const mutDelete    = useDeleteStockItem(familyId);
  const mutAddBarcode = useAddBarcode(familyId);
  const mutCreateCat = useCreateStockCategory(familyId);
  const mutDeleteCat = useDeleteStockCategory(familyId);

  const allItems     = useMemo(() => categories.flatMap(c => c.items), [categories]);
  const outOfStock   = allItems.filter(i => i.quantity <= 0);
  const lowStock     = allItems.filter(i => i.quantity > 0 && i.quantity < i.minimum);
  const ok           = allItems.filter(i => i.quantity >= i.minimum);
  const shoppingList = allItems.filter(i => i.quantity < i.minimum);

  const viewItems = useMemo(() => {
    if (listView) return shoppingList;
    if (activeCategory === "Todas") return allItems;
    return categories.find(c => c.id === activeCategory)?.items ?? [];
  }, [listView, activeCategory, categories, allItems, shoppingList]);

  const filteredItems = useMemo(() =>
    query
      ? viewItems.filter(i =>
          i.name.toLowerCase().includes(query.toLowerCase()) ||
          (i.location ?? "").toLowerCase().includes(query.toLowerCase())
        )
      : viewItems,
  [viewItems, query]);

  // Resetear página cuando cambia el filtro o la vista
  useEffect(() => { setPage(1); }, [filteredItems]);

  const totalPages  = Math.ceil(filteredItems.length / PAGE_SIZE);
  const pagedItems  = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function getCat(item: StockItem) { return categories.find(c => c.id === item.categoryId); }

  function openAdd(catId?: string) {
    setEditItem(null);
    setPendingBarcode(null);
    if (catId && catId !== "Todas") {
      // catId here is actually a category ID, not a barcode — keep existing behavior
    }
    setProductModal(true);
  }
  function openEdit(item: StockItem) { setEditItem(item); setProductModal(true); }

  async function handleSaveItem(data: ItemInput) {
    setItemFormErrors(null);
    const finalData = pendingBarcode && !editItem
      ? { ...data, barcodes: [pendingBarcode, ...(data.barcodes ?? [])] }
      : data;
    try {
      if (editItem) await mutUpdate.mutateAsync({ id: editItem.id, data: finalData });
      else          await mutCreate.mutateAsync(finalData);
      setProductModal(false); setPendingBarcode(null);
    } catch(err) {
      setItemFormErrors(parseApiError(err));
    }
  }

  async function handleScan(barcode: string) {
    const found = allItems.find(i => i.barcodes.includes(barcode));

    if (scanner === "consume") {
      if (found) {
        await mutAdjust.mutateAsync({ id: found.id, delta: -1 });
        const newQty = Math.max(0, found.quantity - 1);
        setScanFeedback({ type:"consume", name:found.name, quantity:newQty, unit:found.unit, alert:newQty < found.minimum, color:newQty < found.minimum ? "#F7874F" : "#34C78A" });
      } else {
        setScanFeedback({ type:"not-found", barcode, color:"#F74F7B" });
      }
      setTimeout(() => setScanFeedback(null), 3500);
      return;
    }

    // Modo "add": mostrar modal de decisión siempre
    setScanResult({ barcode, item: found ?? null });
  }

  function shareWhatsApp() {
    const date = new Date().toLocaleDateString("es-CL", { day:"2-digit", month:"2-digit", year:"numeric" });
    let text = `🛒 *Lista de compras* — ${date}\n_Generada desde FamilyHub_\n\n`;
    categories.forEach(cat => {
      const items = shoppingList.filter(i => i.categoryId === cat.id);
      if (!items.length) return;
      text += `*${cat.icon} ${cat.label}*\n`;
      items.forEach(i => {
        const missing = Math.max(0, i.minimum - i.quantity);
        text += `${i.quantity <= 0 ? "❌":"⚠️"} ${i.name} — necesito ${missing} ${i.unit}`;
        if (i.location) text += ` _(${i.location})_`;
        text += "\n";
      });
      text += "\n";
    });
    text += `_Total: ${shoppingList.length} producto${shoppingList.length !== 1 ? "s":"" }_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  const viewTitle = listView
    ? "🛒 Lista de compras"
    : activeCategory === "Todas"
    ? "Todos los productos"
    : (() => { const c = categories.find(c => c.id === activeCategory); return c ? `${c.icon} ${c.label}` : ""; })();

  /* ── Sidebar ── */
  const SidebarContent = useCallback(({ onSelect }: { onSelect?: () => void }) => (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>

      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}>
          <span style={{ fontSize:22 }}>🛒</span>
          <span className={styles.sidebarTitle}>Stock del Hogar</span>
        </div>
        <span className={styles.sidebarSubtitle}>Inventario familiar</span>
      </div>

      <div className={styles.sidebarTopActions}>
        <button className={styles.btnNav} onClick={() => navigate("/home")}>← Inicio</button>
        <button className={styles.btnTheme} onClick={toggleTheme}>{isDark ? "☀️" : "🌙"}</button>
      </div>

      <div className={`${styles.sectionLabel} fh-section-label`}>VISTAS</div>

      {[
        { label:`📋 Todos los productos`,              active: !listView && activeCategory === "Todas", onClick: () => { setActiveCategory("Todas"); setListView(false); setQuery(""); onSelect?.(); } },
        { label:`🛒 Lista de compras (${shoppingList.length})`, active: listView,                       onClick: () => { setListView(true); setQuery(""); onSelect?.(); } },
      ].map((b, i) => (
        <button
          key={i} onClick={b.onClick}
          className={`${styles.navItem} ${b.active ? styles.navItemActive : ""}`}
        >{b.label}</button>
      ))}

      <div className={styles.sectionLabelRow}>
        <span className="fh-section-label">CATEGORÍAS</span>
        {categories.length < 10 && (
          <button className={styles.btnAddCat} onClick={() => setAddCatOpen(true)}>+ Agregar</button>
        )}
      </div>

      {categories.map(cat => {
        const alerts = cat.items.filter(i => i.quantity < i.minimum).length;
        const active = !listView && activeCategory === cat.id;
        return (
          <div key={cat.id} className={styles.catRow}>
            <button
              onClick={() => { setActiveCategory(cat.id); setListView(false); setQuery(""); onSelect?.(); }}
              className={`${styles.catBtn} ${active ? styles.catBtnActive : ""}`}
              style={{ "--cat-color": cat.color } as React.CSSProperties}
            >
              <span>{cat.icon} {cat.label}</span>
              {alerts > 0 && <span className={styles.catAlert}>{alerts}</span>}
            </button>
            <button className={styles.catDeleteBtn} onClick={() => setDeleteCat(cat)} title="Eliminar categoría">🗑️</button>
          </div>
        );
      })}

      <div className={styles.sidebarBottom}>
        <button className={styles.btnAddProduct} onClick={() => openAdd()}>+ Agregar producto</button>
        <div className={styles.scanActions}>
          <button className={`${styles.btnScan} ${styles.btnScanAdd}`}    onClick={() => setScanner("add")}>📥 Escanear</button>
          <button className={`${styles.btnScan} ${styles.btnScanConsume}`} onClick={() => setScanner("consume")}>📤 Consumir</button>
        </div>
      </div>
    </div>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [isDark, activeCategory, listView, categories, shoppingList.length]);

  return (
    <DashboardLayout
      bg={stockBg(isDark)}
      isDesktop={isDesktop}
      drawerOpen={drawerOpen}
      onOpenDrawer={() => setDrawer(true)}
      onCloseDrawer={() => setDrawer(false)}
      sidebarContent={<SidebarContent />}
      mobileTitle={<>
        <span style={{ fontSize:20 }}>🛒</span>
        <span className="fh-text" style={{ fontWeight:800, fontSize:15 }}>Stock</span>
      </>}
      mobileActions={<>
        <button className={styles.btnTheme} style={{ borderRadius:7, padding:"5px 9px" }} onClick={toggleTheme}>{isDark ? "☀️" : "🌙"}</button>
        <button className={styles.btnNav}   style={{ borderRadius:7, padding:"5px 10px" }} onClick={() => navigate("/home")}>🏠</button>
      </>}
    >
      <div className={isMobile ? styles.contentMobile : styles.content}>

        {isLoading && <StockSkeleton dark={isDark} />}

        {!isLoading && categories.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🛒</div>
            <div className={styles.emptyTitle}>¡Configura tu stock!</div>
            <div className={styles.emptyDesc}>Carga las categorías predeterminadas para empezar a registrar tu inventario.</div>
            <button className="fh-btn fh-btn-success" onClick={() => mutSeed.mutate()} disabled={mutSeed.isPending}>
              {mutSeed.isPending ? "Creando..." : "✨ Cargar categorías predeterminadas"}
            </button>
          </div>
        )}

        {!isLoading && categories.length > 0 && (
          <div className="fh-page-enter">

            {/* Stats */}
            <div className={`${styles.statsGrid} ${isMobile ? styles.statsMobileGrid : ""}`}>
              {[
                { label:"OK",         value:ok.length,         icon:"✅", color:"#34C78A" },
                { label:"Bajo stock", value:lowStock.length,   icon:"⚠️", color:"#F7874F" },
                { label:"Sin stock",  value:outOfStock.length, icon:"❌", color:"#F74F7B" },
              ].map(s => (
                <div
                  key={s.label}
                  className={`${styles.statCard} ${isMobile ? styles.statCardMobile : ""}`}
                  style={{ background: s.color + "14", borderColor: s.color + "20" }}
                >
                  <span style={{ fontSize: isMobile ? 18 : 24 }}>{s.icon}</span>
                  <div>
                    <div className={styles.statValue} style={{ fontSize: isMobile ? 20 : 26, color: s.color }}>{s.value}</div>
                    {!isMobile && <div className={styles.statLabel}>{s.label}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Category overview */}
            {!listView && activeCategory === "Todas" && (
              <>
                <div className={styles.viewHeader}>
                  <span className={styles.viewTitle}>Categorías</span>
                  {isDesktop && (
                    <button className="fh-btn fh-btn-success" style={{ fontSize:13, padding:"8px 16px" }} onClick={() => openAdd()}>
                      + Agregar producto
                    </button>
                  )}
                </div>

                {/* Buscador global */}
                <div className={styles.searchBar}>
                  <div className={styles.searchWrap}>
                    <span className={styles.searchIcon} style={{ opacity:0.5 }}>🔍</span>
                    <input
                      className={styles.searchInput}
                      value={query} onChange={e => setQuery(e.target.value)}
                      placeholder="Buscar en todos los productos..."
                    />
                  </div>
                </div>

                {/* Con query: lista plana filtrada + paginación; sin query: grid de categorías */}
                {query ? (
                  <>
                    <div className={styles.itemList}>
                      {filteredItems.length === 0 ? (
                        <p className="fh-text-muted" style={{ fontSize:14, textAlign:"center", padding:"24px 0" }}>
                          Sin resultados para "{query}"
                        </p>
                      ) : pagedItems.map(item => (
                        <ProductCard key={item.id} item={item} cat={getCat(item)}
                          onEdit={openEdit}
                          onDelete={i => setDelItem(i)}
                          onAdjust={(id, delta) => mutAdjust.mutate({ id, delta })}
                        />
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <Pagination
                        currentPage={page} totalPages={totalPages}
                        onPageChange={setPage}
                        totalItems={filteredItems.length} pageSize={PAGE_SIZE}
                      />
                    )}
                  </>
                ) : (
                <div className={`${styles.catGrid} grid-cols-1 sm:grid-cols-2`}>
                  {categories.map(cat => {
                    const items   = cat.items;
                    const catOk   = items.filter(i => i.quantity >= i.minimum);
                    const catLow  = items.filter(i => i.quantity > 0 && i.quantity < i.minimum);
                    const catOut  = items.filter(i => i.quantity <= 0);
                    const stColor = catOut.length > 0 ? "#F74F7B" : catLow.length > 0 ? "#F7874F" : "#34C78A";
                    const stLabel = catOut.length > 0 ? `${catOut.length} sin stock` : catLow.length > 0 ? `${catLow.length} bajo stock` : "Todo OK";
                    return (
                      <div
                        key={cat.id}
                        className={styles.catOverviewCard}
                        style={{ borderColor: cat.color + "20" }}
                        onClick={() => { setActiveCategory(cat.id); setListView(false); }}
                        onMouseEnter={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 6px 20px #00000012"; }}
                        onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow=""; }}
                      >
                        <div className={styles.catOverviewHeader}>
                          <div className={styles.catOverviewLeft}>
                            <div className={styles.catIcon} style={{ background: cat.color + "18" }}>{cat.icon}</div>
                            <div>
                              <div className={styles.catOverviewName}>{cat.label}</div>
                              <div className={styles.catOverviewCount}>{items.length} producto{items.length !== 1 ? "s" : ""}</div>
                            </div>
                          </div>
                          <div className={styles.catStatusBadge} style={{ color:stColor, background:stColor+"12", borderColor:stColor+"30" }}>{stLabel}</div>
                        </div>

                        {items.length > 0 && (
                          <div className={styles.catProgressBar} style={{ marginBottom:12 }}>
                            <div style={{ width:`${(catOk.length/items.length)*100}%`,  background:"#34C78A", borderRadius:"99px 0 0 99px" }} />
                            <div style={{ width:`${(catLow.length/items.length)*100}%`, background:"#F7874F" }} />
                            <div style={{ width:`${(catOut.length/items.length)*100}%`, background:"#F74F7B", borderRadius:"0 99px 99px 0" }} />
                          </div>
                        )}

                        <div className={styles.catStatsRow}>
                          {[{v:catOk.length,l:"OK",c:"#34C78A"},{v:catLow.length,l:"Bajo",c:"#F7874F"},{v:catOut.length,l:"Sin stock",c:"#F74F7B"}].map(s => (
                            <div key={s.l} className={styles.catStatBox} style={{ background: s.c + "14" }}>
                              <div className={styles.catStatValue} style={{ color:s.c }}>{s.v}</div>
                              <div className={styles.catStatLabel}>{s.l}</div>
                            </div>
                          ))}
                        </div>

                        <div className={styles.catOverviewCta} style={{ color:cat.color }}>Ver productos →</div>
                      </div>
                    );
                  })}
                </div>
                )} {/* fin query ? lista+paginación : grid */}
              </>
            )}

            {/* Category detail / shopping list */}
            {(activeCategory !== "Todas" || listView) && (
              <>
                <div className={styles.viewHeader}>
                  <div className={styles.viewHeaderLeft}>
                    {activeCategory !== "Todas" && !listView && (
                      <button className={styles.btnBack} onClick={() => setActiveCategory("Todas")}>←</button>
                    )}
                    <span className={styles.viewTitle}>{viewTitle}</span>
                  </div>
                  {isDesktop && !listView && (
                    <button className="fh-btn fh-btn-success" style={{ fontSize:13, padding:"8px 16px" }} onClick={() => openAdd(activeCategory)}>
                      + Agregar en {categories.find(c => c.id === activeCategory)?.label ?? "esta categoría"}
                    </button>
                  )}
                </div>

                {/* Search */}
                <div className={styles.searchBar}>
                  <div className={styles.searchWrap}>
                    <span className={styles.searchIcon} style={{ opacity:0.5 }}>🔍</span>
                    <input
                      className={styles.searchInput}
                      value={query} onChange={e => setQuery(e.target.value)}
                      placeholder="Buscar por nombre, ubicación..."
                    />
                  </div>
                  {listView && shoppingList.length > 0 && (
                    <button className={styles.btnShare} onClick={shareWhatsApp}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.824L.057 23.5a.5.5 0 0 0 .609.61l5.79-1.48A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.808 9.808 0 0 1-5.004-1.367l-.36-.214-3.714.949.978-3.598-.234-.369A9.818 9.818 0 0 1 2.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
                      Compartir
                    </button>
                  )}
                </div>

                {filteredItems.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p className="fh-text-muted" style={{ fontSize:14 }}>
                      {query ? `Sin resultados para "${query}"` : listView ? "✅ ¡Todo el stock está al día!" : "Sin productos en esta categoría."}
                    </p>
                    {!listView && !query && (
                      <button className="fh-btn fh-btn-success" style={{ marginTop:12 }} onClick={() => openAdd(activeCategory)}>
                        + Agregar primer producto
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className={styles.itemList}>
                      {pagedItems.map(item => (
                        <ProductCard key={item.id} item={item} cat={getCat(item)}
                          onEdit={openEdit}
                          onDelete={i => setDelItem(i)}
                          onAdjust={(id, delta) => mutAdjust.mutate({ id, delta })}
                        />
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <Pagination
                        currentPage={page} totalPages={totalPages}
                        onPageChange={setPage}
                        totalItems={filteredItems.length} pageSize={PAGE_SIZE}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Speed Dial FAB mobile */}
      {!isDesktop && !isLoading && categories.length > 0 && createPortal(
        <>
          {/* Backdrop para cerrar al tocar fuera */}
          {fabOpen && (
            <div className="fixed inset-0 z-[199]" onClick={() => setFabOpen(false)} />
          )}

          {/* Sub-acciones — apiladas sobre el FAB */}
          {fabOpen && (
            <>
              <style>{`
                @keyframes fabIn {
                  from { opacity: 0; transform: translateY(16px) scale(0.8); }
                  to   { opacity: 1; transform: translateY(0)    scale(1);   }
                }
              `}</style>
              <div
                className="fixed right-4 z-[201] flex flex-col gap-3 items-end"
                style={{ bottom: "calc(1.25rem + 56px + 16px)" }}
              >
                {[
                  { label:"Escanear consumo", icon:"📤", color:"#F7874F", action: () => { setFabOpen(false); setScanner("consume"); } },
                  { label:"Escanear agregar", icon:"📥", color:"#4F7BF7", action: () => { setFabOpen(false); setScanner("add"); } },
                  { label:"Agregar producto", icon:"✚",  color:"#34C78A", action: () => { setFabOpen(false); openAdd(); } },
                ].map(({ label, icon, color, action }, i) => (
                  <div
                    key={label}
                    className="flex items-center gap-3"
                    style={{
                      animation: `fabIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) both`,
                      animationDelay: `${i * 60}ms`,
                    }}
                  >
                    <span className="text-white text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
                      style={{ background: color, boxShadow: `0 2px 8px ${color}55` }}>
                      {label}
                    </span>
                    <button
                      onClick={action}
                      className="w-12 h-12 rounded-full border-0 cursor-pointer text-white text-xl flex items-center justify-center shrink-0"
                      style={{ background: color, boxShadow: `0 4px 16px ${color}66` }}
                    >{icon}</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Botón principal */}
          <button
            className={`${styles.mobileAdd} fixed bottom-5 right-4 z-[200]`}
            onClick={() => setFabOpen(v => !v)}
            style={{ transform: fabOpen ? "rotate(45deg)" : "none", transition:"transform 0.2s" }}
          >+</button>
        </>,
        document.body
      )}

      {/* Scanner */}
      {scanner && <ScannerModal mode={scanner} onClose={() => setScanner(null)} onScanned={async (code) => { setScanner(null); await handleScan(code); }} />}

      {/* Modal: barcode encontrado → Agregar / Consumir */}
      {scanResult?.item && (
        <ModalScanAction
          barcode={scanResult.barcode}
          item={scanResult.item}
          onAdd={async () => {
            await mutAdjust.mutateAsync({ id: scanResult.item!.id, delta: 1 });
            const newQty = scanResult.item!.quantity + 1;
            setScanResult(null);
            setScanFeedback({ type:"added", name:scanResult.item!.name, quantity:newQty, unit:scanResult.item!.unit, color:"#34C78A" });
            setTimeout(() => setScanFeedback(null), 3000);
          }}
          onConsume={async () => {
            await mutAdjust.mutateAsync({ id: scanResult.item!.id, delta: -1 });
            const newQty = Math.max(0, scanResult.item!.quantity - 1);
            setScanResult(null);
            setScanFeedback({ type:"consume", name:scanResult.item!.name, quantity:newQty, unit:scanResult.item!.unit, alert:newQty < scanResult.item!.minimum, color:newQty < scanResult.item!.minimum ? "#F7874F" : "#34C78A" });
            setTimeout(() => setScanFeedback(null), 3500);
          }}
          onClose={() => setScanResult(null)}
        />
      )}

      {/* Modal: barcode NO encontrado → Crear nuevo / Vincular */}
      {scanResult && !scanResult.item && familyId && (
        <ModalScanNotFound
          barcode={scanResult.barcode}
          allItems={allItems}
          familyId={familyId}
          onCreateNew={() => {
            setPendingBarcode(scanResult.barcode);
            setEditItem(null);
            setScanResult(null);
            setProductModal(true);
          }}
          onLinked={(item) => {
            setScanResult(null);
            setScanFeedback({ type:"added", name:item.name, quantity:item.quantity, unit:item.unit, color:"#4F7BF7" });
            setTimeout(() => setScanFeedback(null), 3000);
          }}
          onClose={() => setScanResult(null)}
        />
      )}

      {/* Scan feedback toast */}
      {scanFeedback && (
        <div className={styles.scanToast}>
          {scanFeedback.type === "consume" && (
            <>
              <div className={styles.toastRow}><span style={{ fontSize:20 }}>📤</span><span className={styles.toastName}>{scanFeedback.name}</span></div>
              <div className={styles.toastSub} style={{ color:scanFeedback.color }}>Stock: {scanFeedback.quantity} {scanFeedback.unit}{scanFeedback.alert ? " ⚠️ Bajo mínimo" : ""}</div>
            </>
          )}
          {scanFeedback.type === "added" && (
            <>
              <div className={styles.toastRow}><span style={{ fontSize:20 }}>📥</span><span className={styles.toastName}>{scanFeedback.name}</span></div>
              <div className={styles.toastSub} style={{ color:"#34C78A" }}>+1 agregado · Total: {scanFeedback.quantity} {scanFeedback.unit}</div>
            </>
          )}
          {scanFeedback.type === "searching" && (
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span className={styles.toastSpinner} />
              <span className={styles.toastName}>Buscando producto...</span>
            </div>
          )}
          {scanFeedback.type === "not-found" && (
            <>
              <div className={styles.toastRow}><span style={{ fontSize:20 }}>❓</span><span className={styles.toastName}>Producto no registrado</span></div>
              <div style={{ fontSize:12, color:"#8A93A8" }}>Código: {scanFeedback.barcode}</div>
              <div style={{ fontSize:12, color:"#F74F7B", marginTop:2 }}>Agrégalo primero al stock</div>
            </>
          )}
        </div>
      )}

      <ModalProduct
        key={editItem?.id ?? "new"}
        open={productModal} initial={editItem} initialBarcode={pendingBarcode} categories={categories}
        allItems={allItems}
        onSave={handleSaveItem}
        onClose={() => { setProductModal(false); setPendingBarcode(null); setItemFormErrors(null); }}
        onOpenScanner={() => setScanner("add")}
        onUseExisting={(item) => {
          setPendingBarcode(null);
          setItemFormErrors(null);
          setEditItem(item);
          // productModal sigue true; el key cambia → ModalProduct remonta en modo edición
        }}
        isMobile={isMobile}
        apiErrors={itemFormErrors}
        isSaving={mutCreate.isPending || mutUpdate.isPending}
      />

      <ConfirmDialog
        open={!!delItem}
        title={`¿Eliminar "${delItem?.name ?? ""}"?`}
        description="Esta acción no se puede deshacer."
        onClose={() => setDelItem(null)}
        onConfirm={async () => { if (delItem) await mutDelete.mutateAsync(delItem.id); setDelItem(null); }}
      />

      <ModalAddCategory
        open={addCatOpen}
        onClose={() => setAddCatOpen(false)}
        onSave={async input => { await mutCreateCat.mutateAsync(input); }}
      />

      <ModalDeleteCategory
        cat={deleteCat}
        onClose={() => setDeleteCat(null)}
        onConfirm={async id => { await mutDeleteCat.mutateAsync(id); }}
      />
    </DashboardLayout>
  );
}
