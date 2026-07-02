-- ════════════════════════════════════════════════════════════════════════════
--  FamilyHub — Script de limpieza de base de datos
--  Ejecutar contra la BD de PRODUCCIÓN antes del go-live
--  o contra la BD de desarrollo para dejarla limpia.
--
--  IMPORTANTE: Ejecutar en este orden (respeta FKs).
--  Conectarse con: psql $DATABASE_URL -f scripts/db-cleanup.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Sesiones expiradas ─────────────────────────────────────────────────────
-- Elimina todas las sesiones cuyo refresh token ya venció
DELETE FROM "Session"
WHERE "expiresAt" < NOW();

-- ── 2. Tokens de verificación de email usados o expirados ────────────────────
DELETE FROM "EmailVerifyToken"
WHERE "used" = true OR "expiresAt" < NOW();

-- ── 3. Tokens de reset de contraseña usados o expirados ──────────────────────
DELETE FROM "PasswordResetToken"
WHERE "used" = true OR "expiresAt" < NOW();

-- ── 4. Códigos OTP de reset expirados ────────────────────────────────────────
DELETE FROM "PasswordResetCode"
WHERE "expiresAt" < NOW();

-- ── 5. Intentos de login viejos (> 30 días) ──────────────────────────────────
DELETE FROM "LoginAttempt"
WHERE "createdAt" < NOW() - INTERVAL '30 days';

-- ── 6. Usuarios no verificados con más de 24h (nunca completaron el registro) ─
-- CUIDADO: esto elimina usuarios y todo lo relacionado en cascada
DELETE FROM "User"
WHERE "verified" = false
  AND "createdAt" < NOW() - INTERVAL '24 hours';

-- ── 7. (OPCIONAL) Borrar TODOS los datos de prueba ───────────────────────────
-- Descomentar solo si quieres empezar con BD completamente vacía.
-- El orden importa por las foreign keys (cascades se encargan del resto).
--
DELETE FROM "Family";   -- borra en cascada: miembros, gastos, stock, vehículos, hijos
DELETE FROM "User";     -- borra en cascada: sesiones, tokens

-- ── Resumen ───────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM "User")          AS usuarios,
  (SELECT COUNT(*) FROM "Session")       AS sesiones_activas,
  (SELECT COUNT(*) FROM "Family")        AS familias,
  (SELECT COUNT(*) FROM "FamilyMember")  AS miembros,
  (SELECT COUNT(*) FROM "Expense")       AS gastos,
  (SELECT COUNT(*) FROM "StockItem")     AS items_stock,
  (SELECT COUNT(*) FROM "Child")         AS hijos,
  (SELECT COUNT(*) FROM "Vehicle")       AS vehiculos;

COMMIT;
