# FamilyHub API — Dockerfile
# Usa tsx directamente (sin paso de compilación tsc)
# Válido y eficiente para proyectos Node.js/Hono de este tamaño.

FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9

WORKDIR /app

# Copiar manifests del monorepo (layer cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/              ./packages/
COPY apps/api/package.json  ./apps/api/package.json
COPY apps/api/prisma/       ./apps/api/prisma/

# Instalar todas las dependencias (incluyendo tsx y prisma)
RUN pnpm install --frozen-lockfile

# Copiar código fuente de la API
COPY apps/api/src/ ./apps/api/src/

# Generar Prisma client
RUN pnpm --filter @familyhub/api exec prisma generate

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["pnpm", "--filter", "@familyhub/api", "dev:start"]
