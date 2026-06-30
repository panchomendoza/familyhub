import { lazy, Suspense, useEffect, useRef } from "react";
import { createBrowserRouter, RouterProvider, Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { ProtectedRoute }    from "@/components/ProtectedRoute";
import { useAuthStore }      from "@/stores/auth.store";
import { SessionWarningModal } from "@/components/ui/SessionWarningModal";
import { GlobalLoader }        from "@/components/ui/GlobalLoader";
import { ErrorBoundary }       from "@/components/ui/ErrorBoundary";
import { api, initCsrf }     from "@/lib/api";
import type { User, Family } from "@familyhub/types";
import { features } from "@/config/features";

interface AuthSession {
  user: User; families: Family[];
  accessExpiresAt?: string; sessionExpiresAt?: string | null; renewalUsed?: boolean;
}

// ── Layout raíz: hidrata la sesión + escucha auth:expired globalmente ──
function RootLayout() {
  const store      = useAuthStore();
  const navigate   = useNavigate();
  const hydrating  = useRef(false);

  // Hidratar sesión al montar — useRef evita la doble llamada de StrictMode
  useEffect(() => {
    if (store.isHydrated || hydrating.current) return;
    hydrating.current = true;
    api
      .get<AuthSession>("/auth/me")
      .then(({ data }) => {
        store.setUser(data.user);
        store.setFamilies(data.families ?? []);
        store.setCurrentFamily(data.families?.[0] ?? null);
        if (data.accessExpiresAt)           store.setAccessExpiresAt(data.accessExpiresAt);
        if (data.sessionExpiresAt)          store.setSessionExpiresAt(data.sessionExpiresAt);
        if (data.renewalUsed !== undefined) store.setRenewalUsed(data.renewalUsed);
      })
      .catch(() => store.setUser(null))
      .finally(() => {
        store.setLoading(false);
        store.setHydrated(true);
      });
  }, []);

  // Listener global de sesión expirada — siempre activo independiente de la página
  useEffect(() => {
    const handler = () => {
      store.logout();
      initCsrf().catch(() => {});
      navigate("/login");
    };
    window.addEventListener("auth:expired", handler);
    return () => window.removeEventListener("auth:expired", handler);
  }, [navigate]);

  return (
    <>
      <AnimatedOutlet />
      {store.user && <SessionWarningModal />}
      <GlobalLoader />
    </>
  );
}

// ── Code splitting: cada página/dashboard carga solo cuando se necesita ──
const LoginPage          = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage       = lazy(() => import("@/pages/auth/RegisterPage"));
const VerifyPage         = lazy(() => import("@/pages/auth/VerifyPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"));
const OnboardingPage     = lazy(() => import("@/pages/OnboardingPage"));
const HomePage           = lazy(() => import("@/pages/HomePage"));
const NotFoundPage       = lazy(() => import("@/pages/NotFoundPage"));
const HealthDashboard    = lazy(() => import("@/dashboards/health/HealthDashboard"));
const StockDashboard     = lazy(() => import("@/dashboards/stock/StockDashboard"));
const ExpensesDashboard  = lazy(() => import("@/dashboards/expenses/ExpensesDashboard"));
const VehiclesDashboard  = lazy(() => import("@/dashboards/vehicles/VehiclesDashboard"));
const MedicinesDashboard = lazy(() => import("@/dashboards/medicines/MedicinesDashboard"));
const ProfilePage        = lazy(() => import("@/pages/ProfilePage"));

const ROUTE_TITLES: Record<string, string> = {
  "/home":             "Inicio — FamilyHub",
  "/onboarding":       "Bienvenido — FamilyHub",
  "/health":           "Salud — FamilyHub",
  "/salud":            "Salud — FamilyHub",
  "/stock":            "Inventario — FamilyHub",
  "/expenses":         "Gastos — FamilyHub",
  "/gastos":           "Gastos — FamilyHub",
  "/vehicles":         "Vehículos — FamilyHub",
  "/autos":            "Vehículos — FamilyHub",
  "/medicines":        "Medicinas — FamilyHub",
  "/login":            "Iniciar sesión — FamilyHub",
  "/register":         "Crear cuenta — FamilyHub",
  "/verify":           "Verificar email — FamilyHub",
  "/forgot-password":  "Recuperar contraseña — FamilyHub",
};

// ── Transición suave entre rutas usando key=pathname ──
function AnimatedOutlet() {
  const location = useLocation();

  useEffect(() => {
    // Buscar el segmento raíz de la ruta (ej: /health/algo → /health)
    const root = "/" + location.pathname.split("/").filter(Boolean)[0];
    const title = ROUTE_TITLES[root] ?? "FamilyHub";
    document.title = title;
  }, [location.pathname]);

  return (
    <div key={location.pathname} style={{ animation: "fh-route 0.25s cubic-bezier(0.4,0,0.2,1) both" }}>
      <style>{`
        @keyframes fh-route {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Outlet />
    </div>
  );
}

function PageLoader() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", gap: 16,
      background: "var(--bg, #F5F7FF)",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: "linear-gradient(135deg, #4F7BF7, #A44FF7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24,
        boxShadow: "0 4px 20px #4F7BF730",
        animation: "fh-pulse 1.4s ease-in-out infinite",
      }}>🏠</div>
      <style>{`
        @keyframes fh-pulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%       { transform: scale(0.93); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

// ── Redirige "/" según estado de sesión ──────────────────────────────────────
function RootRedirect() {
  const { user, isHydrated } = useAuthStore();
  if (!isHydrated) return <PageLoader />;
  return <Navigate to={user ? "/home" : "/login"} replace />;
}

// ── Helper: envuelve un dashboard lazy con Suspense + ErrorBoundary ──
function dash(component: JSX.Element, label: string) {
  return (
    <ErrorBoundary label={label}>
      <Suspense fallback={<PageLoader />}>
        {component}
      </Suspense>
    </ErrorBoundary>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // ── Raíz → redirige según sesión ──
      { path: "/", element: <RootRedirect /> },

      // ── Rutas públicas ──
      { path: "/login",           element: <Suspense fallback={<PageLoader />}><LoginPage /></Suspense> },
      { path: "/register",        element: features.register       ? <Suspense fallback={<PageLoader />}><RegisterPage /></Suspense>       : <Navigate to="/login" replace /> },
      { path: "/verify",          element: features.register       ? <Suspense fallback={<PageLoader />}><VerifyPage /></Suspense>          : <Navigate to="/login" replace /> },
      { path: "/forgot-password", element: features.forgotPassword ? <Suspense fallback={<PageLoader />}><ForgotPasswordPage /></Suspense> : <Navigate to="/login" replace /> },

      // ── Rutas autenticadas ──
      {
        element: <ProtectedRoute />,
        children: [
          { path: "/onboarding", element: <Suspense fallback={<PageLoader />}><OnboardingPage /></Suspense> },
          { path: "/home",       element: <Suspense fallback={<PageLoader />}><HomePage /></Suspense> },
          { path: "/profile",    element: <Suspense fallback={<PageLoader />}><ProfilePage /></Suspense> },

          // Dashboards — cada uno aislado con su propio ErrorBoundary
          {
            element: <ProtectedRoute requiredDashboard="health" />,
            children: [
              { path: "/health/*", element: features.dashboards.health   ? dash(<HealthDashboard />,   "Salud")      : <Navigate to="/home" replace /> },
              { path: "/salud/*",  element: features.dashboards.health   ? dash(<HealthDashboard />,   "Salud")      : <Navigate to="/home" replace /> },
            ],
          },
          {
            element: <ProtectedRoute requiredDashboard="stock" />,
            children: [
              { path: "/stock/*",  element: features.dashboards.stock    ? dash(<StockDashboard />,    "Inventario") : <Navigate to="/home" replace /> },
            ],
          },
          {
            element: <ProtectedRoute requiredDashboard="expenses" />,
            children: [
              { path: "/expenses/*", element: features.dashboards.expenses ? dash(<ExpensesDashboard />, "Gastos")   : <Navigate to="/home" replace /> },
              { path: "/gastos/*",   element: features.dashboards.expenses ? dash(<ExpensesDashboard />, "Gastos")   : <Navigate to="/home" replace /> },
            ],
          },
          {
            element: <ProtectedRoute requiredDashboard="vehicles" />,
            children: [
              { path: "/vehicles/*", element: features.dashboards.vehicles ? dash(<VehiclesDashboard />, "Vehículos") : <Navigate to="/home" replace /> },
              { path: "/autos/*",    element: features.dashboards.vehicles ? dash(<VehiclesDashboard />, "Vehículos") : <Navigate to="/home" replace /> },
            ],
          },
          {
            element: <ProtectedRoute requiredDashboard="medicines" />,
            children: [
              { path: "/medicines/*", element: features.dashboards.medicines ? dash(<MedicinesDashboard />, "Medicinas") : <Navigate to="/home" replace /> },
            ],
          },
        ],
      },

      // ── Catch-all → 404 ──
      { path: "*", element: <Suspense fallback={<PageLoader />}><NotFoundPage /></Suspense> },
    ],
  },
], {
  // v7_startTransition va en createBrowserRouter para flags del router
});

export function AppRouter() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
