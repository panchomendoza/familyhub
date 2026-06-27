# FamilyHub — Documentación Técnica

> Aplicación web de gestión familiar: finanzas, inventario y salud de hijos.

---

## Tabla de contenidos

1. [Introducción](#1-introducción)
2. [Arquitectura del monorepo](#2-arquitectura-del-monorepo)
3. [Backend — API REST](#3-backend--api-rest)
4. [Base de datos](#4-base-de-datos)
5. [Sistema de autenticación](#5-sistema-de-autenticación)
6. [Sistema de sesión y seguridad](#6-sistema-de-sesión-y-seguridad)
7. [Frontend](#7-frontend)
8. [Los 3 dashboards](#8-los-3-dashboards)
9. [Variables de entorno](#9-variables-de-entorno)
10. [Refactoring y decisiones técnicas](#10-refactoring-y-decisiones-técnicas)
11. [Comandos útiles](#11-comandos-útiles)

---

## 1. Introducción

FamilyHub es una aplicación web de gestión familiar que permite a los miembros de un hogar controlar sus finanzas, inventario y salud de los hijos desde una plataforma centralizada y segura.

### Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Hono v4 + TypeScript + Prisma ORM |
| Frontend | React + Vite + TypeScript |
| Estado global | Zustand |
| Data fetching | TanStack React Query v5 |
| Routing | React Router v6 con lazy loading |
| Monorepo | pnpm workspaces |
| Base de datos | PostgreSQL en Supabase |
| Autenticación | JWT (HttpOnly cookies) + CSRF + Refresh Token Rotation |

---

## 2. Arquitectura del monorepo

El proyecto se organiza en tres paquetes dentro de un monorepo gestionado por pnpm workspaces:

```
familyhub/
├── apps/
│   ├── api/          # Backend Hono: rutas, middleware, lógica de negocio
│   └── web/          # Frontend React: páginas, dashboards, componentes
└── packages/
    └── types/        # Tipos TypeScript compartidos entre frontend y backend
```

Esta separación permite compartir tipos sin duplicar código y hacer builds independientes de cada aplicación.

### Estructura del Frontend (`apps/web/src/`)

```
lib/            → Utilidades globales
│   api.ts           Cliente HTTP con refresh automático
│   theme.ts         Sistema de tema (dark/light) con Zustand
│   sessionConfig.ts Configuración centralizada de tiempos de sesión
│   router.tsx        Router principal con lazy loading
│
stores/         → Estado global Zustand
│   auth.store.ts    Usuario, familias, tokens de sesión
│
hooks/          → Hooks reutilizables
│   useAuth.ts           Login, logout, hidratación
│   useSessionManager.ts Dos timers: inactividad + vida máxima
│   useWindowWidth.ts    Breakpoint desktop/mobile
│   useSessionWarning.ts (reemplazado por useSessionManager)
│
components/     → Componentes compartidos
│   DashboardLayout.tsx   Shell: sidebar + drawer + topbar mobile
│   ui/Modal.tsx          Overlay base reutilizable
│   ui/ConfirmDialog.tsx  Diálogo de confirmación destructiva
│   ui/SessionWarningModal.tsx Modal de seguridad de sesión
│
pages/          → Páginas
│   auth/LoginPage.tsx
│   auth/RegisterPage.tsx
│   auth/VerifyPage.tsx
│   OnboardingPage.tsx
│   HomePage.tsx
│
dashboards/     → Los 3 dashboards
    expenses/   Gastos del hogar
    stock/      Inventario del hogar
    health/     Salud de los hijos
```

### Estructura del Backend (`apps/api/src/`)

```
routes/         → Rutas HTTP
│   auth.ts          Autenticación completa
│   expenses.ts      Gastos
│   stock.ts         Inventario
│   health.ts        Salud hijos
│   families.ts      Familias y miembros
│
middleware/     → Middleware
│   auth.ts          requireAuth, requireCsrf, getCookieValue
│   rateLimiter.ts   Rate limiting por IP
│
lib/            → Utilidades
    db.ts            Prisma client
    email.ts         Envío de emails (Resend)
```

---

## 3. Backend — API REST

El backend está construido con Hono, un framework web ultraligero para Node.js. Expone una API REST que consume el frontend. Todas las rutas requieren autenticación excepto las de `/auth`.

### Rutas de autenticación (`/auth`)

| Endpoint | Descripción |
|---|---|
| `POST /auth/register` | Registro con email + contraseña. Envía código de verificación al email. |
| `POST /auth/verify-email` | Verifica el código de 6 dígitos enviado al email. |
| `POST /auth/login` | Login con email/contraseña. Devuelve 3 cookies HttpOnly. |
| `POST /auth/google` | Login con Google OAuth (token de ID de Google). |
| `POST /auth/refresh` | Renueva el access token. Con `{ renew: true }` hace renovación manual de sesión. |
| `POST /auth/logout` | Cierra sesión y elimina cookies. |
| `GET  /auth/me` | Devuelve el usuario, familias y datos de sesión actuales. |
| `GET  /auth/csrf` | Genera y devuelve el token CSRF inicial. |

### Rutas de datos

| Archivo | Ruta base | Subrutas principales |
|---|---|---|
| `routes/families.ts` | `/families` | CRUD de familias, unirse por código de invitación, listar miembros. |
| `routes/expenses.ts` | `/expenses` | `/:familyId/categories`, `/:familyId/months`, `/:familyId/months/:y/:m/expenses`, `/:familyId/expenses/:id/paid`, `/:familyId/expenses/:id/group` |
| `routes/stock.ts` | `/stock` | `/:familyId/categories`, `/:familyId/items`, `/:familyId/items/:id/adjust` |
| `routes/health.ts` | `/health` | `/:familyId/children`, `/:familyId/children/:id/checkups`, `/:familyId/children/:id/vaccines`, `/:familyId/children/:id/visits`, `/:familyId/children/:id/exams`, `/:familyId/children/:id/attachments` |

### Middleware de seguridad

- **`requireAuth`** — Verifica el JWT del `access_token` cookie en cada request protegida. Si es inválido o expirado devuelve 401.
- **`requireCsrf`** — Valida el header `X-CSRF-Token` en POST/PATCH/DELETE. Previene ataques Cross-Site Request Forgery.
- **`strictRateLimiter`** — Limita intentos en endpoints de autenticación para prevenir fuerza bruta.

---

## 4. Base de datos

El schema de Prisma define todos los modelos. La base de datos corre en Supabase (PostgreSQL en la nube). Se usa `prisma db push` para sincronizar el schema (sin migraciones en desarrollo).

### Modelos principales

| Modelo | Descripción |
|---|---|
| `User` | Usuario del sistema. Puede tener password o autenticarse por Google. |
| `Session` | Sesión activa. Contiene refresh token hasheado, `absoluteExpiresAt` y `renewalUsed`. |
| `Family` | Hogar/familia con código de invitación único. |
| `FamilyMember` | Relación usuario-familia con rol (admin/member) y permisos de dashboard. |
| `ExpenseMonth` | Mes de gastos de una familia con ingreso declarado. |
| `Expense` | Gasto individual: categoría, banco, cuotas, estado de pago. |
| `ExpenseCategory` | Categorías personalizadas de gastos por familia. |
| `StockItem` | Ítem de inventario con cantidad actual, mínimo y unidad. |
| `StockCategory` | Categorías de inventario por familia. |
| `Child` | Hijo registrado con datos de nacimiento y médicos. |
| `Control` | Control pediátrico con peso, talla y perímetro cefálico. |
| `Vaccine` / `Visit` / `Exam` / `Attachment` | Registros médicos asociados a un hijo. |

### Campos de seguridad en Session

```prisma
model Session {
  expiresAt         DateTime  // Expiración del refresh token (se rota en cada refresh)
  absoluteExpiresAt DateTime  // Límite absoluto de la sesión — nunca se extiende en auto-refresh
  renewalUsed       Boolean   // true si el usuario ya usó su única renovación manual
}
```

---

## 5. Sistema de autenticación

El sistema usa JWT con dos tokens: `access_token` (corta duración) y `refresh_token` (mediana duración). Ambos viajan en **cookies HttpOnly** — no son accesibles desde JavaScript, lo que previene robo por XSS.

### Flujo de login

```
Usuario → POST /auth/login
  → Servidor valida credenciales
  → Crea sesión en BD con absoluteExpiresAt = ahora + SESSION_MAX
  → Devuelve 3 cookies:
      access_token  (HttpOnly, 15min)
      refresh_token (HttpOnly, 1 día)
      csrf_token    (legible por JS, para CSRF protection)
  → Respuesta incluye: accessExpiresAt, sessionExpiresAt, renewalUsed
  → Frontend guarda estos datos en el auth store (Zustand)
```

### Refresh automático (transparente al usuario)

Cuando una request API falla con 401, el cliente `api.ts` intercepta el error automáticamente:

```
Request falla con 401
  → api.ts llama a POST /auth/refresh
  → Si el refresh token es válido:
      Nuevo access token (el absoluteExpiresAt NO cambia)
      Rotation: el refresh token viejo se elimina, se genera uno nuevo
      Se emite evento auth:refreshed con nuevos datos
      Se reintenta la request original
  → Si el refresh también falla (sesión expirada en servidor):
      Se emite evento auth:expired
      RootLayout escucha → store.logout() → navigate("/login")
```

### Cola de refresh

Si múltiples componentes hacen requests simultáneas y todas fallan con 401, solo se hace **un solo refresh**. El resto espera en una cola y se reintentan cuando el refresh termina.

### CSRF Protection

Todas las mutaciones (POST, PATCH, DELETE) requieren el header `X-CSRF-Token`. El frontend lo lee automáticamente desde la cookie `csrf_token` y lo incluye en cada request. Si no coincide con lo esperado por el servidor, la request se rechaza.

### Refresh Token Rotation

Cada vez que se usa el refresh token para obtener un nuevo access token, el refresh token anterior se elimina de la BD y se genera uno nuevo. Si alguien roba un refresh token y lo usa, el token original queda inválido y el sistema detecta la anomalía.

---

## 6. Sistema de sesión y seguridad

La seguridad de sesión tiene **dos capas completamente independientes**. Ambas están configuradas de forma centralizada en `src/lib/sessionConfig.ts` y son parametrizables por ambiente.

### Capa 1 — Inactividad del usuario

**¿Qué hace?** Detecta si el usuario lleva N minutos sin interactuar con el teclado, mouse o pantalla. Si supera el umbral, muestra un modal de aviso. Si no responde en el tiempo del countdown, cierra la sesión.

**Eventos rastreados:** `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`, `click`

| Ambiente | Inactividad | Countdown |
|---|---|---|
| Todos (prod, test, local) | 5 minutos (`VITE_IDLE_TIMEOUT_MS=300000`) | 30 segundos (`VITE_IDLE_WARN_S=30`) |

- Si el usuario presiona **"Seguir aquí"**: el timer de inactividad se reinicia sin necesidad de hacer refresh.
- Esta capa es **completamente independiente** del tiempo máximo de sesión.

### Capa 2 — Vida máxima de sesión

**¿Qué hace?** Establece un límite absoluto de cuánto tiempo puede durar una sesión, sin importar si el usuario está activo o no.

| Ambiente | Duración máxima | Aviso previo | Countdown |
|---|---|---|---|
| Todos (prod, test, local) | 30 minutos (`VITE_SESSION_MAX_MS=1800000`) | 5 minutos antes (`VITE_SESSION_WARN_MS=300000`) | 60 segundos (`VITE_SESSION_WARN_S=60`) |

**Reglas clave:**
- El usuario puede renovar **una sola vez** (`renewalUsed`). Esto reinicia el contador completo por otros 30 minutos.
- Después de la renovación, no hay segunda oportunidad. Al llegar al límite → cierre definitivo.
- El límite absoluto (`absoluteExpiresAt`) se guarda en la BD y el auto-refresh **no lo extiende**.
- Si no renueva durante el countdown → cierre automático. Se requiere nuevo login.

### Configuración centralizada

Toda la configuración de tiempos está en un único archivo: `apps/web/src/lib/sessionConfig.ts`

```typescript
export const SESSION_CONFIG = {
  IDLE_TIMEOUT_MS: envNum("VITE_IDLE_TIMEOUT_MS", 5 * 60 * 1000),  // 5 min
  IDLE_WARN_S:     envNum("VITE_IDLE_WARN_S",     30),              // 30s countdown
  SESSION_MAX_MS:  envNum("VITE_SESSION_MAX_MS",  30 * 60 * 1000), // 30 min
  SESSION_WARN_MS: envNum("VITE_SESSION_WARN_MS",  5 * 60 * 1000), // aviso 5 min antes
  SESSION_WARN_S:  envNum("VITE_SESSION_WARN_S",  60),              // 60s countdown
  TICK_MS: 2_000,  // intervalo de chequeo interno
}
```

Los valores locales se definen en `apps/web/.env.local` y nunca se suben a git.

### Modal de sesión (`SessionWarningModal`)

Un único componente montado globalmente en `RootLayout` que muestra dos tipos de modal:

| Modal | Cuándo aparece | Botones |
|---|---|---|
| **Inactividad** ("¿Sigues ahí?") | Tras N minutos sin interacción | "Cerrar sesión" / "Seguir aquí" |
| **Expiración** ("Tu sesión está por vencer") | N minutos antes del límite absoluto | "Cerrar sesión" / "Renovar sesión" (si disponible) |

Ambos modales tienen un **contador circular animado** que muestra los segundos restantes. El color cambia de azul/naranja a rojo cuando queda menos del 20% del tiempo (urgente).

### Comportamiento al volver al día siguiente

Si el usuario cierra el navegador y vuelve horas después:

```
Usuario abre la app
  → RootLayout llama a GET /auth/me
  → api.ts intenta request con el access_token expirado
  → Recibe 401 → intenta POST /auth/refresh
  → El servidor verifica: absoluteExpiresAt < ahora → rechaza con 401
  → api.ts dispara evento auth:expired
  → RootLayout escucha → store.logout() → navigate("/login")
  → El usuario nunca accede a una vista protegida con sesión expirada
```

---

## 7. Frontend

### Sistema de tema (Dark Mode)

El tema oscuro/claro está gestionado por un store Zustand con persistencia en `localStorage`. Es **global**: cambiar el tema en cualquier pantalla lo actualiza en todas instantáneamente.

- **`src/lib/theme.ts`** — exporta solo `useTheme()`, que retorna `{ isDark, toggle }`.
- El hook aplica o remueve la clase `dark` en `<html>` vía `useEffect`.
- Todos los colores del sistema están definidos como **CSS custom properties** en `src/styles/tokens.css`:
  - `:root` define los valores del tema claro.
  - `:root.dark` sobreescribe los valores para el tema oscuro.
  - Las variables cubren fondos (`--bg`, `--surface`, `--surface-alt`), textos (`--text`, `--text-muted`, `--text-hint`), bordes (`--border`, `--border-light`), componentes (`--sidebar-bg`, `--input-bg`, `--modal-bg`, `--card-shadow`, `--overlay`) y semánticos (`--danger-bg`, `--danger-text`, `--accent-bg`, `--accent-text`).
- Clave de storage: `fh-theme`.

Los componentes consumen los tokens de dos formas:
1. **CSS Modules** — clases en archivos `.module.css` que usan `var(--token)` directamente (forma preferida).
2. **`const V` local** — objeto de strings CSS var para inline styles donde el valor es dinámico o data-driven (e.g., `style={{ color: V.text }}`). Nunca se pasan como props.

### Componentes compartidos

| Componente | Función |
|---|---|
| `DashboardLayout` | Shell exterior de los dashboards. Sidebar de 240px en desktop, drawer de 260px en mobile con backdrop, y topbar con botón de menú en mobile. Acepta `sidebarContent` y `children` como props. |
| `Modal` | Overlay base reutilizable con backdrop. Soporta modo `bottomSheet` para mobile (slide desde abajo). Todos los modales de cada dashboard lo usan internamente. |
| `ConfirmDialog` | Diálogo de confirmación para acciones destructivas (eliminar). Usa `Modal` internamente. Texto y color de botones configurables. |
| `SessionWarningModal` | Modal de seguridad con dos modos independientes (inactividad / expiración). Siempre montado en el layout raíz cuando hay sesión activa. |

### Cliente HTTP (`api.ts`)

Reemplaza axios con **fetch nativo**. Implementa:

- Adjunto automático del header `X-CSRF-Token` en mutaciones (lo lee de la cookie).
- **Cola de refresh**: cuando llega un 401, se hace un solo refresh y se reintentan todas las requests fallidas.
- Emisión del evento `auth:expired` cuando el refresh también falla.
- Emisión del evento `auth:refreshed` con los nuevos datos de sesión tras un refresh exitoso.
- Timeout de 10 segundos por request.
- Clase `ApiError` tipada con `status` y `data` para manejo de errores consistente.

### Auth Store (Zustand)

El store `auth.store.ts` centraliza todo el estado de autenticación:

```typescript
{
  user:             User | null
  currentFamily:    Family | null
  families:         Family[]
  isLoading:        boolean
  isHydrated:       boolean
  accessExpiresAt:  string | null   // cuándo expira el access token
  sessionExpiresAt: string | null   // límite absoluto de la sesión
  renewalUsed:      boolean         // si ya se usó la renovación manual
}
```

### Router y code splitting

React Router v6 con lazy loading: cada dashboard y página carga su código JavaScript solo cuando el usuario navega a esa ruta.

- **`ProtectedRoute`** — Verifica autenticación antes de renderizar rutas privadas.
- **`ProtectedRoute` con `requiredDashboard`** — Verifica además si el usuario tiene permiso para ese dashboard.
- **`RootLayout`** — Layout raíz siempre montado: hidrata la sesión, escucha `auth:expired` globalmente y monta el `SessionWarningModal`.

---

## 8. Los 3 dashboards

### Gastos del Hogar (`/expenses`)

Gestión financiera mensual del hogar.

- Registro de ingresos y gastos por categoría y banco.
- Soporte de compras en cuotas con tracking por cuota actual.
- Resumen visual: presupuesto 50/30/20, gráfico por categoría, estado de pagos.
- Marcar gastos como pagados / no pagados.
- Filtros por mes, categoría y banco.

### Stock del Hogar (`/stock`)

Inventario doméstico con alertas de stock mínimo.

- Productos organizados por categorías personalizables.
- Stock actual vs. cantidad mínima configurada.
- Alertas visuales cuando un producto baja del mínimo.
- Búsqueda y filtrado por categoría.

### Salud Hijos (`/health`)

Historial médico completo de cada hijo registrado en la familia.

- Sidebar con lista de hijos y navegación entre ellos.
- Tabs: Resumen, Controles, Vacunas, Visitas, Exámenes, Gráficos de crecimiento.
- Controles pediátricos con peso, talla y perímetro cefálico.
- Gráficos de crecimiento con curvas de referencia de la WHO.
- Registro de vacunas, visitas médicas y exámenes de laboratorio.

---

## 9. Variables de entorno

### Backend (`apps/api/.env`)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | URL de conexión a PostgreSQL | `postgresql://...` |
| `JWT_ACCESS_SECRET` | Secreto para firmar access tokens | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Secreto para firmar refresh tokens | igual que el anterior |
| `JWT_ACCESS_EXPIRES` | Duración del access token | `15m` (prod) / `30s` (local) |
| `JWT_REFRESH_EXPIRES` | Duración del refresh token | `1d` |
| `SESSION_MAX_EXPIRES` | Vida máxima absoluta de la sesión | `30m` (prod) / `30s` (local) |
| `CSRF_SECRET` | Secreto para tokens CSRF | mismo comando que JWT |
| `GOOGLE_CLIENT_ID` | Client ID de Google OAuth | de Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Secret de Google OAuth | de Google Cloud Console |
| `RESEND_API_KEY` | API key para envío de emails | de resend.com |
| `FRONTEND_URL` | URL del frontend para CORS | `http://localhost:5173` |

### Frontend (`apps/web/.env.local` — solo desarrollo)

| Variable | Descripción | Default prod |
|---|---|---|
| `VITE_IDLE_TIMEOUT_MS` | Ms sin actividad para modal de inactividad | `300000` (5min) |
| `VITE_IDLE_WARN_S` | Countdown de inactividad en segundos | `30` |
| `VITE_SESSION_MAX_MS` | Duración máxima de sesión en ms | `1800000` (30min) |
| `VITE_SESSION_WARN_MS` | Ms antes del fin para mostrar aviso | `300000` (5min) |
| `VITE_SESSION_WARN_S` | Countdown del aviso de expiración | `60` |

Los valores son idénticos en todos los ambientes (local, test, prod). Si en algún momento se necesita probar el flujo de expiración sin esperar 30 minutos, se puede cambiar temporalmente en `.env.local`:

```bash
# Para probar expiración rápido (no commitear)
VITE_SESSION_MAX_MS=120000     # 2 min
VITE_SESSION_WARN_MS=60000     # aviso 1 min antes
SESSION_MAX_EXPIRES=2m         # backend (apps/api/.env)
```

---

## 10. Refactoring y decisiones técnicas

### Español → Inglés

Todos los identificadores del código fueron renombrados de español a inglés para seguir convenciones internacionales:

| Antes | Después |
|---|---|
| `routes/gastos.ts` | `routes/expenses.ts` |
| `routes/salud.ts` | `routes/health.ts` |
| `dashboards/gastos/` | `dashboards/expenses/` |
| `dashboards/salud/` | `dashboards/health/` |
| `hooks/useGastos.ts` | `hooks/useExpenses.ts` |
| `stores/salud.store.ts` | `stores/health.store.ts` |
| `oms-data` (OMS) | `who-data` (WHO) |
| Ruta `/gastos` | Ruta `/expenses` |
| Ruta `/salud` | Ruta `/health` |
| Subruta `/categorias` | Subruta `/categories` |
| Subruta `/meses` | Subruta `/months` |
| Subruta `/controles` | Subruta `/checkups` |
| Subruta `/vacunas` | Subruta `/vaccines` |
| Subruta `/visitas` | Subruta `/visits` |
| Subruta `/examenes` | Subruta `/exams` |
| Subruta `/archivos` | Subruta `/attachments` |
| Subruta `/pagado` | Subruta `/paid` |
| Subruta `/grupo` | Subruta `/group` |
| Subruta `/analisis` | Subruta `/analysis` |
| `DashboardId: "salud" \| "gastos"` | `DashboardId: "health" \| "expenses"` |

### Axios → Fetch nativo

Se eliminó la dependencia de axios y se reemplazó con `fetch` nativo del navegador. El cliente en `src/lib/api.ts` implementa todas las funcionalidades necesarias sin dependencias externas:

- Timeout con `AbortController`
- Adjunto automático de CSRF
- Cola de refresh con promises
- Manejo tipado de errores (`ApiError`)

### Extracción de componentes compartidos

Los 3 dashboards tenían código duplicado. Se extrajeron a componentes compartidos:

| Código duplicado | Solución |
|---|---|
| `useTheme()` local en cada dashboard | Un store Zustand global en `lib/theme.ts` |
| `useWindowWidth()` en cada dashboard | Hook compartido en `hooks/useWindowWidth.ts` |
| Layout con sidebar + drawer + topbar | `components/DashboardLayout.tsx` |
| Modales inline con `position: fixed` | `components/ui/Modal.tsx` reutilizable |
| `ModalConfirm` duplicado | `components/ui/ConfirmDialog.tsx` compartido |

### Migración a CSS Modules + CSS Custom Properties

Se eliminó el patrón `ThemeTokens` — un objeto JS con strings de colores que se pasaba como prop `T` por toda la jerarquía de componentes. Se reemplazó por:

1. **`src/styles/tokens.css`** — todas las variables de diseño en `:root` / `:root.dark`. El hook `useTheme()` solo controla la clase `dark` en `<html>`.
2. **CSS Modules** (`.module.css` por componente) — los estilos viven en CSS, no en JS. Los colores se referencian con `var(--token)`.
3. **`const V` a nivel de módulo** — para los casos donde el color va en un inline style (datos dinámicos), se define un objeto local con los CSS var strings. Nunca se pasa como prop.

Archivos eliminados / simplificados:

| Antes | Después |
|---|---|
| `ThemeTokens` interface exportada desde `theme.ts` | Eliminada |
| `THEME_LIGHT`, `THEME_DARK`, `buildTheme` | Eliminados |
| `useTheme()` retornaba `{ isDark, toggle, T }` | Retorna solo `{ isDark, toggle }` |
| `T?: unknown` (deprecated) en `DashboardLayout` y `ConfirmDialog` | Eliminados |
| `const { T } = useTheme()` en `SessionWarningModal` | Reemplazado por `const V` local |
| `T={T}` props en `HomePage` y sub-componentes | Eliminados; usan `const V` de módulo |

### Decisiones de seguridad

| Decisión | Por qué |
|---|---|
| **Cookies HttpOnly** para tokens | Los tokens nunca son accesibles desde JS → previene XSS |
| **Refresh Token Rotation** | Cada uso genera un nuevo token → detecta robo de tokens |
| **`absoluteExpiresAt` en BD** | El límite de sesión se verifica servidor-side → el cliente no puede manipularlo |
| **CSRF double-submit** | El token está en cookie + header → solo el frontend legítimo puede mutar datos |
| **`renewalUsed` en BD** | La renovación única se valida servidor-side → el cliente no puede renovar indefinidamente |
| **Rate limiting en auth** | Previene fuerza bruta en login y registro |
| **Cola de refresh** | Evita múltiples calls a `/auth/refresh` en paralelo → previene race conditions |

---

## 11. Comandos útiles

### Desarrollo

```bash
pnpm dev                        # Inicia API (puerto 4000) y Web (puerto 5173) en paralelo
pnpm --filter api dev           # Solo el backend
pnpm --filter web dev           # Solo el frontend
```

### Base de datos

```bash
cd apps/api

npx prisma db push              # Sincroniza schema con la BD sin migraciones (desarrollo)
npx prisma generate             # Regenera el cliente Prisma tras cambios en schema
npx prisma studio               # Abre UI visual de la BD en el navegador
npx prisma db seed              # Corre el script de seed (si existe)
```

### TypeScript

```bash
cd apps/web && npx tsc --noEmit  # Verifica tipos del frontend (0 errores esperados)
```

### Utilidades

```bash
# Generar un secreto seguro para JWT/CSRF
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

### CSRF en re-login sin recarga

Cuando el usuario hace logout (manual o por sesión expirada), el servidor borra la cookie `csrf_token`. Si intenta hacer login de nuevo sin recargar la página, `api.ts` detecta que la cookie no existe y llama a `GET /auth/csrf` automáticamente antes de enviar el POST de login. Esto ocurre en dos lugares:

- `ensureCsrf()` en `api.ts` — se ejecuta antes de cualquier mutación si la cookie está ausente.
- `initCsrf()` en `useAuth.ts` y `router.tsx` — se llama proactivamente al hacer logout para tener el token listo de inmediato.

---

*Documentación actualizada: Junio 2026 — Migración CSS Modules completa*
