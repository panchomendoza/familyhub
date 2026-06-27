import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import { useTheme } from "@/lib/theme";
import { HomePageSkeleton } from "@/components/ui/DashboardSkeletons";
import type { DashboardId } from "@familyhub/types";

interface ProtectedRouteProps {
  /** ID del dashboard requerido. Si se omite, solo verifica autenticación. */
  requiredDashboard?: string;
}

export function ProtectedRoute({ requiredDashboard }: ProtectedRouteProps) {
  const { user, currentFamily, isLoading, isHydrated } = useAuthStore();
  const location = useLocation();
  const { isDark } = useTheme();

  // Esperar hidratación antes de redirigir
  if (isLoading || !isHydrated) {
    return (
      <div style={{ minHeight: "100vh", background: isDark ? "#111827" : "#f8fafc", padding: "24px 20px" }}>
        <HomePageSkeleton dark={isDark} />
      </div>
    );
  }

  // No autenticado → redirigir a login guardando destino
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Sin familia → onboarding
  if (!currentFamily && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  // Verificar acceso al dashboard específico
  if (requiredDashboard && currentFamily) {
    const member = currentFamily.members.find((m) => m.userId === user.id);
    const hasAccess =
      member?.role === "admin" ||
      member?.dashboardAccess.includes(requiredDashboard as DashboardId);

    if (!hasAccess) {
      return <Navigate to="/home" replace />;
    }
  }

  return <Outlet />;
}
