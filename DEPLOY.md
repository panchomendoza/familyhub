# FamilyHub — Guía de Despliegue a Producción

## Arquitectura en producción

```
Usuario
  │
  ├─▶  Cloudflare (DNS + CDN + DDoS protection)
  │         │
  ├─▶  Vercel → familyhub.juanfmendoza.dev  (React SPA)
  │
  └─▶  Railway → api.familyhub.juanfmendoza.dev  (Hono API, Docker)
                    │
                    └─▶  Supabase → aws-1-us-east-2.pooler.supabase.com:6543
```

---

## Paso 1 — Supabase (base de datos de producción)

1. Ir a [supabase.com](https://supabase.com) → **New project**
2. Guardar la contraseña en un gestor de contraseñas
3. Ir a **Settings → Database → Connection Pooling → Transaction pooler**
4. Copiar la URL (formato `postgresql://postgres.[ref]:[pass]@aws-X-[region].pooler.supabase.com:6543/postgres`)

> **Importante:** el host del pooler varía por proyecto. Verificar si es `aws-0-...` o `aws-1-...` mirando la URL exacta que muestra Supabase.

### Configurar el archivo de entorno de producción

Editar `apps/api/.env.production`:

```
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-X-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

> Este archivo está en `.gitignore` — nunca se sube a git.

### Aplicar el schema

```bash
pnpm db:push:prod
```

### Habilitar RLS en todas las tablas

En Supabase → **SQL Editor**, ejecutar:

```sql
ALTER TABLE public."User"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Session"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EmailVerifyToken"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PasswordResetToken"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PasswordResetCode"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LoginAttempt"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Family"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FamilyMember"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ExpenseCategory"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ExpenseBank"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ExpenseMonth"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Expense"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StockCategory"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StockItem"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Child"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Control"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Vaccine"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Visit"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Exam"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Attachment"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Vehicle"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VehicleMaintenance"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VehicleDocument"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VehicleExpense"      ENABLE ROW LEVEL SECURITY;
```

> El usuario `postgres` (superuser) bypasea RLS, por lo que la API sigue funcionando sin cambios.

---

## Paso 2 — Railway (API backend)

1. Ir a [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Seleccionar el repositorio `familyhub`
3. Railway detectará el `Dockerfile` en la raíz
4. En **Settings → Networking → Custom Domain**: agregar `api.familyhub.juanfmendoza.dev`

### Variables de entorno en Railway

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | URL de Supabase Transaction Pooler |
| `JWT_ACCESS_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Generar otro diferente |
| `JWT_ACCESS_EXPIRES` | `15m` |
| `JWT_REFRESH_EXPIRES` | `1d` |
| `SESSION_MAX_EXPIRES` | `30m` |
| `CSRF_SECRET` | Generar otro diferente |
| `GOOGLE_CLIENT_ID` | Del Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Del Google Cloud Console |
| `RESEND_API_KEY` | De resend.com |
| `RESEND_FROM_EMAIL` | `noreply@familyhub.juanfmendoza.dev` |
| `RESEND_FROM_NAME` | `FamilyHub` |
| `SEND_EMAILS` | `true` |
| `FRONTEND_URL` | `https://familyhub.juanfmendoza.dev` |
| `RATE_LIMIT_WINDOW_MS` | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | `100` |

### Healthcheck

El healthcheck está configurado en `apps/api/railway.toml` apuntando a `/_health` (no `/health`, que está reservado para el dashboard de salud).

---

## Paso 3 — Vercel (frontend)

1. Ir a [vercel.com](https://vercel.com) → **New Project → Import Git Repository**
2. Seleccionar el repositorio `familyhub`
3. Configurar en el dashboard de Vercel:
   - **Framework Preset:** Vite
   - **Root Directory:** `apps/web`
   - **Build Command:** `cd ../.. && pnpm --filter @familyhub/web build`
   - **Output Directory:** `dist`
4. En **Settings → Domains**: agregar `familyhub.juanfmendoza.dev`

### Variables de entorno en Vercel

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://api.familyhub.juanfmendoza.dev` |
| `VITE_GOOGLE_CLIENT_ID` | Tu Google Client ID |

---

## Paso 4 — Cloudflare (DNS)

### Registros DNS

| Tipo | Nombre | Destino | Proxy |
|---|---|---|---|
| `CNAME` | `familyhub` | CNAME que da Vercel | ☁️ Gris (Solo DNS) |
| `CNAME` | `api.familyhub` | `xxx.up.railway.app` que da Railway | ☁️ Gris (Solo DNS) |
| `TXT` | `_railway-verify.api.familyhub` | Token de verificación de Railway | ☁️ Gris (Solo DNS) |

> El frontend (`familyhub`) puede tener proxy naranja una vez verificado el SSL. La API (`api.familyhub`) debe quedarse en gris para que Railway emita el certificado SSL correctamente.

### Seguridad recomendada

- **SSL/TLS → Overview:** modo **Full (strict)**
- **Security → Bots:** activar **Bot Fight Mode**
- **Security → Settings:** nivel **Medium**

---

## Paso 5 — Resend (emails)

1. Ir a [resend.com](https://resend.com) → **Domains → Add Domain**
2. Agregar `familyhub.juanfmendoza.dev`
3. Usar la opción **Auto Configure in Cloudflare** para agregar los registros DNS automáticamente
4. Una vez verificado, actualizar `RESEND_FROM_EMAIL` en Railway

---

## Paso 6 — Google OAuth (producción)

1. Ir a [Google Cloud Console](https://console.cloud.google.com) → credenciales OAuth 2.0
2. En **Orígenes de JavaScript autorizados**, agregar:
   - `https://familyhub.juanfmendoza.dev`
3. Las URIs de redirección no aplican (el flow usa popup, no redirect)

---

## Checklist pre-launch

- [ ] `pnpm db:push:prod` ejecutado
- [ ] RLS habilitado en todas las tablas de Supabase
- [ ] Todas las variables de entorno configuradas en Railway y Vercel
- [ ] Railway desplegando correctamente (`/_health` responde)
- [ ] Vercel desplegando correctamente
- [ ] Dominio `familyhub.juanfmendoza.dev` resuelve correctamente
- [ ] Dominio `api.familyhub.juanfmendoza.dev` resuelve correctamente
- [ ] Probar flujo completo:
  - [ ] Registro → email llega con código
  - [ ] Verificación de email
  - [ ] Login con email/contraseña
  - [ ] Login con Google
  - [ ] Cada dashboard carga sin errores
  - [ ] Logout limpia la sesión correctamente
- [ ] Cookies tienen `Secure` y `SameSite=None` en DevTools

---

## Comandos útiles

```bash
# Aplicar schema a producción
pnpm db:push:prod

# Abrir Prisma Studio apuntando a producción
pnpm --filter @familyhub/api db:studio:prod

# Verificar que la API responde
curl https://api.familyhub.juanfmendoza.dev/_health

# Limpiar BD de producción
psql "tu_url_prod" -f scripts/db-cleanup.sql
```

---

## Troubleshooting

**CSRF 403 en producción**
- El CSRF token se guarda en memoria del frontend (no en cookie) para soportar cross-domain
- Verificar que `FRONTEND_URL` en Railway coincide exactamente con la URL del frontend

**Cookies no se envían / 401 en producción**
- Verificar que las cookies tienen `SameSite=None; Secure` en DevTools
- Verificar que `FRONTEND_URL` en Railway no tiene trailing slash

**500 en registro**
- Verificar `SEND_EMAILS` en Railway — si el dominio de Resend no está verificado, poner `SEND_EMAILS=false` temporalmente
- Revisar logs en Railway → tu servicio → **Logs**

**Can't reach database server**
- Verificar que el host del pooler es correcto (`aws-0-...` o `aws-1-...`)
- Verificar que el proyecto de Supabase no está pausado (plan gratuito se pausa por inactividad)

**Build falla en Railway**
- Verificar que `DATABASE_URL` está configurado (Prisma lo necesita para `prisma generate`)
- Revisar los logs del build en Railway → Deployments

**CORS bloqueado**
- Verificar que `FRONTEND_URL` en Railway coincide con el header `Origin` del request (ver DevTools → Network)
