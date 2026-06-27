# FamilyHub 🏠

Tu hogar, todo organizado.

**Demo en producción:** [familyhub.juanfmendoza.dev](https://familyhub.juanfmendoza.dev)

---

## Stack

| Capa        | Tecnología                        |
|-------------|-----------------------------------|
| Frontend    | React 18 + Vite + TypeScript      |
| Backend     | Node.js + Hono + TypeScript       |
| Base datos  | PostgreSQL + Prisma ORM           |
| Auth        | JWT + cookies HttpOnly + CSRF     |
| OAuth       | Google OAuth 2.0                  |
| Emails      | Resend                            |
| Frontend hosting | Vercel                       |
| API hosting | Railway (Docker)                  |
| Base datos  | Supabase (PostgreSQL)             |
| DNS / CDN   | Cloudflare                        |

---

## Dashboards disponibles

- **Salud** — controles pediátricos, vacunas, visitas médicas, exámenes
- **Gastos** — registro mensual por categoría y banco
- **Stock / Inventario** — productos del hogar por categoría
- **Vehículos** — mantenimientos, documentos y gastos por vehículo
- **Tareas** — gestión de tareas del hogar *(en desarrollo)*

---

## Arquitectura en producción

```
Usuario
  │
  ├─▶  Cloudflare (DNS + CDN + DDoS protection)
  │         │
  ├─▶  Vercel → familyhub.juanfmendoza.dev  (React SPA)
  │
  └─▶  Railway → api.familyhub.juanfmendoza.dev  (Hono API)
                    │
                    └─▶  Supabase (PostgreSQL)
```

---

## Estructura del monorepo

```
familyhub/
├── apps/
│   ├── web/          # React + Vite (frontend)
│   └── api/          # Hono + Prisma (backend)
├── packages/
│   └── types/        # Tipos TypeScript compartidos
├── scripts/
│   └── db-cleanup.sql
├── Dockerfile        # Build de producción para Railway
└── vercel.json       # Config de deploy para Vercel
```

---

## Setup local

### 1. Requisitos

```bash
node >= 20
pnpm >= 9
```

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Variables de entorno

```bash
# Backend
cp apps/api/.env.example apps/api/.env
# → Editar apps/api/.env con tus valores

# Frontend
cp apps/web/.env.example apps/web/.env.local
# → Editar apps/web/.env.local
```

### 4. Base de datos

```bash
pnpm db:push     # aplica el schema en desarrollo
pnpm db:studio   # abre Prisma Studio para ver los datos
```

### 5. Desarrollo

```bash
pnpm dev         # API (puerto 4000) + Web (puerto 5173) en paralelo
pnpm dev:api     # solo API
pnpm dev:web     # solo frontend
```

---

## Seguridad implementada

### Autenticación
- **Cookies HttpOnly** — access token y refresh token inaccesibles desde JS
- **CSRF token en memoria** — en cross-domain (producción) el token se guarda en memoria del frontend en lugar de leerlo desde cookies, evitando el problema de `SameSite=None` en dominios distintos
- **Refresh token rotation** — cada uso genera un nuevo par de tokens
- **Detección de robo** — tokens reusados invalidan todas las sesiones del usuario
- **Bcrypt** con 12 rondas para contraseñas y tokens almacenados

### Rate limiting
- Global: 100 req / 15 min por IP
- Endpoints sensibles (login, register, verify): 10 req / 15 min
- Lockout de cuenta tras 5 intentos fallidos

### Validación
- **Zod** en todos los inputs del backend
- Contraseñas: mínimo 8 caracteres, una mayúscula, un número
- Email normalizado a lowercase antes de guardar y comparar

### Otros
- **Timing-safe comparisons** en verificación de tokens y contraseñas
- Respuestas genéricas en auth (no revelan si el email existe)
- Headers de seguridad HTTP (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- **CORS** estricto: solo orígenes configurados en `FRONTEND_URL`
- Sin stack traces expuestos en producción
- **RLS habilitado** en todas las tablas de Supabase

---

## Comandos útiles

```bash
# Aplicar schema a producción
pnpm db:push:prod

# Abrir Prisma Studio apuntando a producción
pnpm --filter @familyhub/api db:studio:prod

# Verificar que la API responde
curl https://api.familyhub.juanfmendoza.dev/_health
```

---

## Próximos pasos

- [ ] Dashboard de Tareas del Hogar (conectar al backend)
- [ ] Upload de archivos (Supabase Storage)
- [ ] Tests unitarios y de integración
- [ ] Logs estructurados (Axiom / Better Stack)
- [ ] Queue para emails en background (BullMQ + Redis)
