# Scripts locales

Scripts de utilidad para desarrollo y mantenimiento. Viven en `apps/api/src/scripts/` y **no se suben al git** (carpeta ignorada).

---

## seed-stock-items.ts

Agrega 15 productos de prueba por categoría de stock en una familia.

**Requisitos:** la familia debe tener categorías creadas previamente (desde la app o con el seed de categorías).

```bash
cd apps/api

# Usa la primera familia encontrada en la BD
npx tsx src/scripts/seed-stock-items.ts

# O especifica un familyId
npx tsx src/scripts/seed-stock-items.ts <familyId>
```

**Comportamiento:**
- Crea productos en las categorías: Alimentos, Aseo, Higiene Personal, Limpieza, Otros.
- Si un producto con el mismo nombre ya existe en la familia, lo omite (idempotente).
- Muestra `✅` para creados y `⏭` para omitidos.

---

## reset-db.ts

Elimina **todos los datos** de la BD en el orden correcto respetando las FK. Las tablas se mantienen intactas.

```bash
cd apps/api
npx tsx src/scripts/reset-db.ts
```

⚠️ Destructivo — solo para desarrollo local.

---

## create-test-user.ts

Crea un usuario de prueba ya verificado, listo para hacer login sin confirmar email.

```bash
cd apps/api
npx tsx src/scripts/create-test-user.ts
```

**Credenciales:**
- Email: `asd@asd.com`
- Contraseña: `123123Sasa11!`

Si el usuario ya existe, lo indica sin crear duplicado. Para recrearlo, corre `reset-db.ts` primero.

---

## Flujo típico post-reset

```bash
cd apps/api
npx tsx src/scripts/reset-db.ts
npx tsx src/scripts/create-test-user.ts
# Entrar a la app, crear familia, luego:
npx tsx src/scripts/seed-stock-items.ts
```

---

## Agregar un nuevo script

1. Crear el archivo en `apps/api/src/scripts/nombre-script.ts`.
2. Documentarlo en este archivo.
3. El archivo **no se sube al git** automáticamente por el `.gitignore`.
