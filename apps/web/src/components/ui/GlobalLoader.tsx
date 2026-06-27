import { useLoadingStore } from "@/stores/loading.store";
import { useTheme }        from "@/lib/theme";

// ══════════════════════════════════════════════════════════════
//   GlobalLoader — overlay bloqueante durante peticiones API
//
//   - Se monta sobre toda la UI (z-index: 9999)
//   - pointer-events: all → bloquea cualquier click / interacción
//   - Solo visible cuando hay ≥1 petición no-silenciosa en vuelo
//   - Las rutas /auth/csrf, /auth/me y /auth/refresh nunca lo activan
// ══════════════════════════════════════════════════════════════

const KEYFRAMES = `
  @keyframes fh-gl-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes fh-gl-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes fh-gl-dots {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.7); }
    40%           { opacity: 1;   transform: scale(1);   }
  }
`;

export function GlobalLoader() {
  const pending = useLoadingStore((s) => s.pending);
  const { isDark } = useTheme();

  if (!pending) return null;

  const panelBg    = isDark ? "#1A1D27" : "#FFFFFF";
  const panelBorder = isDark ? "#2A2D3A" : "#E2E8F0";
  const textColor  = isDark ? "#8A93A8" : "#6B7280";
  const overlayBg  = isDark ? "rgba(0, 0, 0, 0.62)" : "rgba(15, 23, 42, 0.32)";

  return (
    <div
      role="status"
      aria-label="Cargando"
      aria-live="polite"
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         9999,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        // Overlay semi-transparente con blur — congela visualmente la UI
        background:     overlayBg,
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        // Bloqueo de interacción
        pointerEvents:  "all",
        cursor:         "wait",
        userSelect:     "none",
        animation:      "fh-gl-fade 0.15s ease both",
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Tarjeta central */}
      <div style={{
        background:    panelBg,
        border:        `1px solid ${panelBorder}`,
        borderRadius:  20,
        padding:       "28px 40px",
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           18,
        boxShadow:     "0 24px 64px rgba(0, 0, 0, 0.45)",
      }}>

        {/* Spinner de anillo degradado */}
        <div style={{
          position:     "relative",
          width:        48,
          height:       48,
          borderRadius: "50%",
          background:   "conic-gradient(from 0deg, transparent 0%, #4F7BF7 35%, #A44FF7 70%, transparent 100%)",
          animation:    "fh-gl-spin 0.85s linear infinite",
        }}>
          {/* Agujero interior — simula borde de anillo */}
          <div style={{
            position:     "absolute",
            inset:        6,
            borderRadius: "50%",
            background:   panelBg,
          }} />
        </div>

        {/* Texto con puntos animados */}
        <span style={{
          fontSize:      13,
          fontWeight:    500,
          color:         textColor,
          letterSpacing: "0.03em",
          display:       "flex",
          alignItems:    "center",
          gap:           3,
        }}>
          Cargando
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                display:    "inline-block",
                animation:  `fh-gl-dots 1.2s ease-in-out ${i * 0.2}s infinite`,
                lineHeight: 1,
              }}
            >
              .
            </span>
          ))}
        </span>

      </div>
    </div>
  );
}
