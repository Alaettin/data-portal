# syntax=docker/dockerfile:1

# Muster aus dem AXON Connector. bookworm-slim statt alpine: better-sqlite3 wird mit glibc
# uebersetzt, die Werkzeuge dafuer kommen je Stufe dazu.
FROM node:22-bookworm-slim AS base
# pnpm fest statt ueber Corepack: dessen Rueckfrage haelt einen Bau ohne Terminal an, bis der
# Bauserver nach einer Stunde abbricht. Fassung wie `packageManager` in der package.json.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g pnpm@10.30.3
WORKDIR /app

# --- Bau der Oberflaeche ---
FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++
# Erst die Manifeste, dann installieren, dann der Quelltext: sonst entwertet jede
# Codeaenderung die Schicht, in der better-sqlite3 uebersetzt wird.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @datenportal/web build

# --- Laufzeit ---
FROM base AS runtime
ENV NODE_ENV=production
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
# Der Server laeuft ueber tsx direkt aus dem Quelltext (tsx steht in seinen dependencies).
# Uebersetzen und Aufraeumen in einer Schicht, sonst bleiben die Werkzeuge im Abbild.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && pnpm install --frozen-lockfile --prod --filter "@datenportal/server..." \
  && apt-get purge -y python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

COPY packages/core/src packages/core/src
COPY apps/server/src apps/server/src
# app.ts sucht die Oberflaeche zwei Ebenen ueber src: apps/web/dist.
COPY --from=build /app/apps/web/dist apps/web/dist

# Das leere Volume erbt Eigentuemer und Rechte dieses Pfads. DATA_DIR muss gesetzt sein,
# sonst schriebe der Server nach ./data relativ zum Arbeitsordner, am Volume vorbei.
RUN mkdir -p /data && chown -R node:node /data
ENV DATA_DIR=/data HOST=0.0.0.0 PORT=3300

EXPOSE 3300
USER node
WORKDIR /app/apps/server
CMD ["node", "--import", "tsx", "src/main.ts"]
