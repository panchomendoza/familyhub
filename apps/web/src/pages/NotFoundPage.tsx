import { useNavigate } from "react-router-dom";

// ══════════════════════════════════════════════════════════════
//   NotFoundPage — reemplaza el catch-all que redirigía a /home
// ══════════════════════════════════════════════════════════════

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      minHeight:      "100vh",
      padding:        "40px 24px",
      gap:            32,
      textAlign:      "center",
      background:     "var(--bg, #0d0d1a)",
    }}>

      {/* Número grande decorativo */}
      <div style={{ position: "relative", lineHeight: 1 }}>
        <span style={{
          fontSize:           "clamp(80px, 20vw, 140px)",
          fontWeight:         800,
          background:         "linear-gradient(135deg, #4F7BF7, #A44FF7)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip:     "text",
          letterSpacing:      "-4px",
          userSelect:         "none",
        }}>
          404
        </span>
      </div>

      {/* Mensaje */}
      <div style={{ maxWidth: 380, display: "flex", flexDirection: "column", gap: 10 }}>
        <h1 style={{
          margin:     0,
          fontSize:   "clamp(18px, 4vw, 22px)",
          fontWeight: 600,
          color:      "var(--text, #f0f0f0)",
        }}>
          Página no encontrada
        </h1>
        <p style={{
          margin:     0,
          fontSize:   15,
          color:      "var(--text-muted, #8899CC)",
          lineHeight: 1.6,
        }}>
          La ruta que buscas no existe o fue movida.
        </p>
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => navigate("/home")}
          style={{
            padding:       "11px 28px",
            borderRadius:  12,
            border:        "none",
            background:    "linear-gradient(135deg, #4F7BF7, #A44FF7)",
            color:         "#fff",
            fontSize:      15,
            fontWeight:    600,
            cursor:        "pointer",
            letterSpacing: "0.02em",
            boxShadow:     "0 4px 20px #4F7BF740",
          }}
        >
          Ir al inicio
        </button>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding:      "11px 28px",
            borderRadius: 12,
            border:       "1px solid var(--border, rgba(255,255,255,0.12))",
            background:   "transparent",
            color:        "var(--text-muted, #8899CC)",
            fontSize:     15,
            fontWeight:   500,
            cursor:       "pointer",
          }}
        >
          Volver
        </button>
      </div>

      {/* Logo pequeño al pie */}
      <div style={{
        position:  "fixed",
        bottom:    32,
        display:   "flex",
        alignItems: "center",
        gap:        8,
        opacity:   0.4,
      }}>
        <div style={{
          width:        28,
          height:       28,
          borderRadius: 8,
          background:   "linear-gradient(135deg, #4F7BF7, #A44FF7)",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          fontSize:     14,
        }}>🏠</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text, #f0f0f0)" }}>
          FamilyHub
        </span>
      </div>

    </div>
  );
}
