# syntax=docker/dockerfile:1
# Two runtime targets: `server` (Bun game server, which also renders the HTML shell, /ads.txt and
# /prywatnosc) and `web` (Caddy serving the client's static files and proxying everything else to
# the server). See docs/deploy.md.

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
# „O grze” (S7-103) shows `<version>+<git sha>`: there is no .git in the build context, so the sha
# comes in as a build argument (docker-compose.yml); without it the version reads `+dev`. The
# copyright line and the authors come from LICENSE.
ARG APP_GIT_SHA=
COPY tsconfig.base.json LICENSE ./
COPY packages packages
COPY apps/client apps/client
COPY apps/server apps/server
RUN cd apps/client && APP_GIT_SHA="$APP_GIT_SHA" bunx vite build
# Brotli copies of js/css/html for Caddy's `precompressed br` (no per-request compression cost).
COPY tools/deploy tools/deploy
RUN bun tools/deploy/precompress.ts apps/client/dist

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
# The HTML shell the server renders per request (nonce, embedded config, CSP; S7-70) comes from
# the same client build the web image serves from /srv, and the privacy note it renders at
# /prywatnosc. Asset hashes in index.html must exist in /srv: always build both services together
# (docker compose up -d --build).
COPY --from=client-build /app/apps/client/dist/index.html apps/client/dist/index.html
COPY docs/privacy.pl.md docs/privacy.pl.md
# /app/config is the mount point for config.json (docker-compose.yml, CONFIG_PATH).
RUN mkdir -p /data /app/config && chown bun:bun /data
USER bun
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "apps/server/src/index.ts"]

FROM caddy:2-alpine AS web
COPY Caddyfile /etc/caddy/Caddyfile
# The whole build, index.html included: Caddy serves it as the fallback page while the game
# server is down (Caddyfile handle_errors).
COPY --from=client-build /app/apps/client/dist /srv
# Caddy's admin API listens on localhost:2019 inside the container; answering means the config
# loaded. (Caddy serves plain HTTP on :80; TLS is terminated by the external reverse proxy.)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -q -O /dev/null http://localhost:2019/config/ || exit 1
