/**
 * Skeletons específicos para cada dashboard.
 * Cada uno imita la estructura real de la pantalla.
 */
import { Skeleton, SkeletonCard, SkeletonRow } from "./Skeleton";

interface Props { dark?: boolean | undefined }

// ── Gastos ────────────────────────────────────────────────────────────────────
export function ExpensesSkeleton({ dark }: Props) {
  const muted = dark ? "#2a2f3e" : "#eff1f5";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "4px 0", animation: "fh-fadein 0.18s ease both" }}>
      {/* Selector de mes */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Skeleton width={28} height={28} borderRadius={8} dark={dark} />
        <Skeleton width={120} height={18} dark={dark} />
        <Skeleton width={28} height={28} borderRadius={8} dark={dark} />
      </div>

      {/* Cards resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SkeletonCard height={72} dark={dark} />
        <SkeletonCard height={72} dark={dark} />
        <SkeletonCard height={72} dark={dark} />
        <SkeletonCard height={72} dark={dark} />
      </div>

      {/* Barra presupuesto */}
      <div style={{ background: dark ? "#1e2232" : "#f8fafc", borderRadius: 14, padding: "14px 16px", border: `1.5px solid ${muted}` }}>
        <Skeleton height={12} width="40%" dark={dark} style={{ marginBottom: 12 }} />
        <Skeleton height={10} borderRadius={99} dark={dark} />
      </div>

      {/* Lista gastos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[1,2,3,4].map(i => <SkeletonRow key={i} dark={dark} />)}
      </div>
    </div>
  );
}

// ── Stock ─────────────────────────────────────────────────────────────────────
export function StockSkeleton({ dark }: Props) {
  const muted = dark ? "#2a2f3e" : "#eff1f5";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "4px 0", animation: "fh-fadein 0.18s ease both" }}>
      {/* Búsqueda */}
      <Skeleton height={40} borderRadius={12} dark={dark} />

      {/* Categorías */}
      {[1, 2].map(cat => (
        <div key={cat} style={{ background: dark ? "#1e2232" : "#f8fafc", borderRadius: 14, padding: "14px 16px", border: `1.5px solid ${muted}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Skeleton width={28} height={28} borderRadius={8} dark={dark} />
            <Skeleton width={110} height={14} dark={dark} />
            <Skeleton width={40} height={14} dark={dark} style={{ marginLeft: "auto" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map(i => <SkeletonRow key={i} dark={dark} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Health ────────────────────────────────────────────────────────────────────
export function HealthSidebarSkeleton({ dark }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0", animation: "fh-fadein 0.18s ease both" }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12 }}>
          <Skeleton width={38} height={38} borderRadius="50%" dark={dark} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Skeleton height={13} width="70%" dark={dark} />
            <Skeleton height={11} width="45%" dark={dark} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HealthContentSkeleton({ dark }: Props) {
  const muted = dark ? "#2a2f3e" : "#eff1f5";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "4px 0", animation: "fh-fadein 0.18s ease both" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {[1,2,3,4,5].map(i => (
          <Skeleton key={i} width={70} height={32} borderRadius={99} dark={dark} />
        ))}
      </div>

      {/* Cards resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <SkeletonCard height={80} dark={dark} />
        <SkeletonCard height={80} dark={dark} />
        <SkeletonCard height={80} dark={dark} />
      </div>

      {/* Sección última visita */}
      <div style={{ background: dark ? "#1e2232" : "#f8fafc", borderRadius: 14, padding: "16px", border: `1.5px solid ${muted}` }}>
        <Skeleton height={12} width="35%" dark={dark} style={{ marginBottom: 14 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SkeletonRow dark={dark} />
          <SkeletonRow dark={dark} />
        </div>
      </div>
    </div>
  );
}

// ── Vehicles ──────────────────────────────────────────────────────────────────
export function VehiclesSidebarSkeleton({ dark }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0", animation: "fh-fadein 0.18s ease both" }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12 }}>
          <Skeleton width={40} height={40} borderRadius={10} dark={dark} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            <Skeleton height={13} width="70%" dark={dark} />
            <Skeleton height={11} width="45%" dark={dark} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VehiclesContentSkeleton({ dark }: Props) {
  const muted = dark ? "#2a2f3e" : "#eff1f5";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "4px 0", animation: "fh-fadein 0.18s ease both" }}>
      {/* Vehicle header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 16, borderBottom: `1.5px solid ${muted}` }}>
        <Skeleton width={52} height={52} borderRadius={14} dark={dark} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton height={20} width="45%" dark={dark} />
          <div style={{ display: "flex", gap: 8 }}>
            <Skeleton height={11} width={40} dark={dark} borderRadius={99} />
            <Skeleton height={11} width={72} dark={dark} borderRadius={99} />
            <Skeleton height={11} width={56} dark={dark} borderRadius={99} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Skeleton width={90} height={32} borderRadius={8} dark={dark} />
          <Skeleton width={72} height={32} borderRadius={8} dark={dark} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6 }}>
        {[80, 90, 78, 72, 70].map((w, i) => (
          <Skeleton key={i} width={w} height={34} borderRadius={99} dark={dark} />
        ))}
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <SkeletonCard height={72} dark={dark} />
        <SkeletonCard height={72} dark={dark} />
        <SkeletonCard height={72} dark={dark} />
        <SkeletonCard height={72} dark={dark} />
      </div>

      {/* Info cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ background: dark ? "#1e2232" : "#f8fafc", borderRadius: 14, padding: "16px", border: `1.5px solid ${muted}`, display: "flex", flexDirection: "column", gap: 10 }}>
            <Skeleton height={12} width="55%" dark={dark} />
            {[1, 2, 3, 4].map(j => (
              <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <Skeleton height={11} width="40%" dark={dark} />
                <Skeleton height={11} width="45%" dark={dark} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HomePage ──────────────────────────────────────────────────────────────────
export function HomePageSkeleton({ dark }: Props) {
  const muted = dark ? "#2a2f3e" : "#eff1f5";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "20px 0", animation: "fh-fadein 0.18s ease both" }}>
      {/* Greeting */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={22} width="50%" dark={dark} />
        <Skeleton height={14} width="35%" dark={dark} />
      </div>

      {/* Dashboard cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ background: dark ? "#1e2232" : "#f8fafc", borderRadius: 18, padding: "18px 16px", border: `1.5px solid ${muted}`, display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton width={36} height={36} borderRadius={10} dark={dark} />
            <Skeleton height={14} width="70%" dark={dark} />
            <Skeleton height={11} width="90%" dark={dark} />
          </div>
        ))}
      </div>
    </div>
  );
}
