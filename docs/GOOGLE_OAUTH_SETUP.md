# Configurar Google OAuth 2.0

Esta guía explica cómo obtener las credenciales de Google OAuth para que el botón
"Continuar con Google" funcione en FamilyHub.

---

## 1. Crear el proyecto en Google Cloud Console

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Haz clic en el selector de proyecto (arriba a la izquierda) → **"Nuevo proyecto"**
3. Nombre: `FamilyHub` (o el que prefieras)
4. Haz clic en **"Crear"** y espera unos segundos

---

## 2. Configurar la pantalla de consentimiento OAuth

1. En el menú lateral: **APIs y servicios → Pantalla de consentimiento de OAuth**
2. Tipo de usuario: **Externo** → **"Crear"**
3. Rellena los campos obligatorios:
   - **Nombre de la app**: `FamilyHub`
   - **Email de soporte**: tu email
   - **Email del desarrollador**: tu email
4. Haz clic en **"Guardar y continuar"** (puedes omitir los campos opcionales)
5. Sección **Permisos**: haz clic en **"Guardar y continuar"** sin agregar nada
6. Sección **Usuarios de prueba**: haz clic en **"Guardar y continuar"**
7. Haz clic en **"Volver al panel"**

---

## 3. Crear las credenciales OAuth

1. En el menú lateral: **APIs y servicios → Credenciales**
2. Haz clic en **"+ Crear credenciales" → "ID de cliente de OAuth"**
3. Tipo de aplicación: **Aplicación web**
4. Nombre: `FamilyHub Web`
5. **Orígenes de JavaScript autorizados** — agrega:
   ```
   http://localhost:5173
   ```
   *(En producción agregarás tu dominio real, ej: `https://familyhub.app`)*
6. **URIs de redireccionamiento autorizadas**: dejar vacío (GSI no usa redirect URI)
7. Haz clic en **"Crear"**

---

## 4. Copiar las credenciales

Al crear las credenciales verás un diálogo con:

- **ID de cliente**: `xxxxxxxx.apps.googleusercontent.com`  ← este necesitas
- **Secreto del cliente**: no es necesario en el frontend

---

## 5. Configurar las variables de entorno

### Frontend (`apps/web/.env.local`)

```bash
VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

### Backend (`apps/api/.env`)

```bash
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET no es necesario para verificar ID tokens
```

> **Nota**: el `GOOGLE_CLIENT_ID` en el backend ya está configurado en `.env.example`.
> El backend lo usa para validar que el token venga realmente de tu app.

---

## 6. Verificar que funciona

1. Reinicia el servidor de desarrollo: `pnpm dev`
2. Ve a `http://localhost:5173/login`
3. El botón **"Continuar con Google"** debe estar activo (no gris)
4. Al hacer clic debe aparecer el selector de cuenta de Google

---

## Notas de seguridad

- El `GOOGLE_CLIENT_ID` es **público** — puede ir en el frontend sin problema.
- El `GOOGLE_CLIENT_SECRET` **NO** debe ir en el frontend nunca.
- El backend verifica el ID token contra la API de Google antes de crear la sesión.
- Si el `VITE_GOOGLE_CLIENT_ID` está vacío en `.env.local`, el botón de Google
  no aparece en la UI (la feature queda desactivada silenciosamente).

---

## Para producción

Cuando hagas deploy, repite el paso 3 agregando tu dominio real:
```
Orígenes autorizados:
  http://localhost:5173
  https://tu-dominio.com
```

Y agrega `VITE_GOOGLE_CLIENT_ID` a las variables de entorno de tu hosting (Vercel, etc.).
