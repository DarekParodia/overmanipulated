# syntax=docker/dockerfile:1
# Two runtime targets: `server` (Bun game server) and `web` (Caddy serving the client and
# proxying /ws and /api to the server). See docs/deploy.md.

ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/content/package.json packages/content/
RUN bun install --frozen-lockfile

FROM deps AS client-build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/client apps/client
COPY apps/server apps/server
RUN cd apps/client && bunx vite build

FROM oven/bun:${BUN_VERSION} AS server-deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/content/package.json packages/content/
RUN bun install --frozen-lockfile --production --filter @redakcja/server

FROM oven/bun:${BUN_VERSION}-slim AS server
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/redakcja.sqlite
# The whole install stage: bun may place workspace links at the root or per package.
COPY --from=server-deps /app /app
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/server apps/server
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "apps/server/src/index.ts"]

FROM caddy:2-alpine AS web
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=client-build /app/apps/client/dist /srv
