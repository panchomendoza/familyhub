import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

// ══════════════════════════════════════════════════════════════
//   ErrorBoundary — contiene errores en runtime por dashboard
//
//   Si un dashboard explota (error no capturado), muestra una
//   pantalla de error aislada sin tumbar toda la app.
//
//   Uso:
//     <ErrorBoundary label="Salud">
//       <HealthDashboard />
//     </ErrorBoundary>
// ══════════════════════════════════════════════════════════════

interface Props {
  children: ReactNode;
  /** Nombre del módulo para el mensaje de error (ej: "Salud", "Gastos") */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // En producción aquí iría un servicio como Sentry
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  override render() {
    const { error } = this.state;
    const { children, label = "este módulo" } = this.props;

    if (!error) return children;

    return (
      <div style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        minHeight:      "60vh",
        padding:        "40px 24px",
        gap:            24,
        textAlign:      "center",
      }}>

        {/* Ícono */}
        <div style={{
          width:           64,
          height:          64,
          borderRadius:    18,
          background:      "linear-gradient(135deg, #f7574f22, #f7574f44)",
          border:          "1px solid #f7574f44",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          fontSize:        28,
        }}>
          ⚠️
        </div>

        {/* Mensaje */}
        <div style={{ maxWidth: 360, display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{
            margin:     0,
            fontSize:   18,
            fontWeight: 600,
            color:      "var(--text, #f0f0f0)",
          }}>
            Algo salió mal en {label}
          </h2>
          <p style={{
            margin:   0,
            fontSize: 14,
            color:    "var(--text-muted, #8899CC)",
            lineHeight: 1.6,
          }}>
            Ocurrió un error inesperado. Puedes intentar de nuevo o volver al inicio.
          </p>

          {/* Detalle técnico colapsado */}
          <details style={{ marginTop: 8, textAlign: "left" }}>
            <summary style={{
              fontSize: 12,
              color:    "var(--text-hint, #556688)",
              cursor:   "pointer",
              userSelect: "none",
            }}>
              Ver detalle del error
            </summary>
            <pre style={{
              marginTop:    8,
              padding:      12,
              borderRadius: 8,
              background:   "var(--surface-alt, #1a1a2e)",
              border:       "1px solid var(--border, rgba(255,255,255,0.08))",
              fontSize:     11,
              color:        "#f7574f",
              overflowX:    "auto",
              whiteSpace:   "pre-wrap",
              wordBreak:    "break-word",
            }}>
              {error.message}
            </pre>
          </details>
        </div>

        {/* Acciones */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={this.handleRetry}
            style={{
              padding:       "10px 24px",
              borderRadius:  10,
              border:        "none",
              background:    "linear-gradient(135deg, #4F7BF7, #A44FF7)",
              color:         "#fff",
              fontSize:      14,
              fontWeight:    600,
              cursor:        "pointer",
              letterSpacing: "0.02em",
            }}
          >
            Reintentar
          </button>
          <button
            onClick={() => window.location.assign("/home")}
            style={{
              padding:      "10px 24px",
              borderRadius: 10,
              border:       "1px solid var(--border, rgba(255,255,255,0.12))",
              background:   "transparent",
              color:        "var(--text-muted, #8899CC)",
              fontSize:     14,
              fontWeight:   500,
              cursor:       "pointer",
            }}
          >
            Ir al inicio
          </button>
        </div>

      </div>
    );
  }
}
