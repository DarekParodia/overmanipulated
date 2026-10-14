# Deployment

TLS is terminated by an external reverse proxy on the host (or another machine), which forwards to
host port **8080**. It must pass WebSocket upgrades and the original `Host` header; firewall 8080
so only that proxy can reach it. Behind it the game runs as two containers built from one image
build:

```
browser ──https/wss :443──▶ external TLS proxy ──http :8080──▶ web (Caddy, plain HTTP on :80)
                                                                 │ /assets/*, manifest, icons: static
                                                                 │ everything else
                                                                 ▼
                     server (Bun + Hono: /ws, /api/*, /health, the HTML shell, /ads.txt,
                             /prywatnosc; rooms in memory, SQLite on a volume, config.json mounted)
```

Everything goes over **443** (school networks often block other ports, and `wss://` needs TLS):
the page, the assets, `/api/*`, `/health` and the game WebSocket `/ws` all share one origin. The
game server is never exposed directly.

**Who serves what.** Caddy serves the build output that never changes per request (`/assets/*`,
`manifest.webmanifest`, icons). Every other path goes to the game server: `/`, SPA paths and
`/index.html` get the HTML shell rendered per request (fresh CSP nonce, the embedded public
config, the CSP and `Referrer-Policy` chosen from `config.json` and the request host), and
`/ads.txt` and `/prywatnosc` are rendered from the config and `docs/privacy.pl.md`. The server
image therefore carries `index.html` from the same client build as the web image: always build
and deploy both services together. While the game server is down or restarting (502/503/504),
Caddy serves the static `index.html` of its own build instead, so the menu still loads and says
"Serwer gry nie odpowiada" (never for `/ads.txt` or the API). Verified locally: with the server
stopped, `/` answered 503 with the menu, and the browser console showed no CSP violation.

## Requirements

- A Linux VPS with Docker Engine and the compose plugin. 1 vCPU / 1 GB RAM is plenty: measured
  idle usage is about 30 MB (server) + 15 MB (Caddy), and the compose file caps them at 384 MB
  and 128 MB.
- An external TLS reverse proxy for the public domain that forwards to port 8080 (WebSocket
  upgrades and the original `Host` header included). Port 8080 is reachable only from it.

## First deploy

```sh
git clone <repo> redakcja && cd redakcja
cp .env.example .env          # optional: LOG_LEVEL, TRUSTED_PROXIES
cp config/config.example.json config/config.json && chmod 644 config/config.json   # optional
docker compose up -d --build
docker compose ps             # server and web should both be "healthy"
bun run smoke -- https://gra.example.pl     # from any machine with Bun, see "Smoke test"
```

Without the external proxy the stack answers on `http://localhost:8080`, which is handy for
trying it on a laptop (`docker compose up --build`, then
`bun run smoke -- http://localhost:8080 --strict`). Without `config/config.json` the server runs
with the defaults (ads off, room browser off).

## Updating

```sh
git pull
APP_GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
```

`APP_GIT_SHA` is optional: it puts the commit into the version „O grze” shows
(`0.0.0+1a2b3c4 · protokół 7`); without it the version reads `+dev`. The build context has no
`.git`, so the sha comes in as a build argument, the same for both images.

Rooms live in memory, so a restart ends running matches. Deploy outside lesson hours.
Players who are mid-game get the "connection lost" notice and can create a new room.
Browsers that still have the old page open keep working until reload: hashed assets of the old
build are gone, so such a tab shows the load error; reloading fixes it.

## Configuration

| Variable | Where | Default | Meaning |
| --- | --- | --- | --- |
| `LOG_LEVEL` | `.env` → server | `info` | `silent` disables server logs |
| `TRUSTED_PROXIES` | `.env` → web | `private_ranges` | Addresses of the external TLS proxy whose `X-Forwarded-For` Caddy believes (IPs or CIDR ranges, space-separated). Set it to the proxy's `IP/32` when the proxy runs on another machine; see "Client address" |
| `CONFIG_PATH` | server | `/app/config/config.json` (compose) | Operator config: features, message of the day, rooms, ads, CSP extras. Compose mounts `./config` read-only at `/app/config`; a missing file means the defaults. Saving the file reloads it (or `docker compose kill -s SIGHUP server`); check it first with `bun run config:check -- config/config.json` |
| `ADS_ENABLED` | `.env` → server | unset | Kill switch: `false` turns ads off whatever `config.json` says, also across reloads; `true` still needs `ads.signOff`. Unset: `config.json` decides. Takes effect on `docker compose up -d server` |
| `SHELL_HTML_PATH` | server | `apps/client/dist/index.html` | Built page the HTML shell is rendered from; the image copies it from the client build. Absent: the shell paths 404 (dev, where Vite serves the page) |
| `PRIVACY_MD_PATH` | server | `docs/privacy.pl.md` | Privacy note rendered at `/prywatnosc` |
| `PORT` | server | `3000` | Internal HTTP/WS port (set by compose) |
| `DATABASE_PATH` | server | `/data/redakcja.sqlite` | SQLite file (set by compose) |
| `BRIEFING_MS` | server | `18000` | Briefing length before a level auto-starts (tests shorten it) |
| `DEV_LATENCY_MS` | server | `0` | Dev only: artificial latency for netcode testing. Keep `0` in production |

Retention (90 days) and the limits below are constants in the code, not environment variables:
`LEADERBOARD_RETENTION_DAYS` in `packages/shared/src/constants.ts` and
`apps/server/src/limits.ts`.

## What Caddy does (and how to check it)

| Concern | Setting | Quick check |
| --- | --- | --- |
| WebSocket upgrade | `reverse_proxy` passes `Upgrade` through; no read timeout on a proxied socket. The client sends a heartbeat every 2 s and Bun answers protocol pings, so NATs and proxies never see an idle connection. `stream_close_delay 5m` keeps sockets alive across a Caddy config reload. Verified: a socket that sent nothing for 150 s through Caddy (beyond Bun's 120 s idle timeout) was still open and answered a heartbeat | `bun run smoke` (heartbeat round trip) |
| Compression | zstd and gzip on the fly; Brotli files are pre-built at image build time (`tools/deploy/precompress.ts`) and served by `precompressed br` | `curl -sI -H 'Accept-Encoding: br' https://<domain>/assets/<index>.js` |
| Cache: hashed assets | `/assets/<name>-<8 hash chars>.(js\|css\|woff2)` → `public, max-age=31536000, immutable`. Only when the file exists: a missing hashed file is a plain 404, never `index.html` cached for a year | `curl -sI` the script |
| Cache: static files | manifest, icons and the un-hashed audio in `/assets/audio` → `no-cache` (revalidate by ETag). The manifest is sent as `application/manifest+json` (Caddy knows no type for it). `index.html.br` from the precompress step stays unused: the page comes from the game server | `curl -sI https://<domain>/manifest.webmanifest` |
| Pages | `/`, SPA paths, `/index.html`, `/ads.txt`, `/prywatnosc` → game server (it sets `Cache-Control`: `no-store` on the shell, `public, max-age=300` on `/ads.txt`, `no-cache` on `/prywatnosc`). Unknown file-like paths (`/foo.js`) get a plain 404, never HTML | `bun run smoke -- <url>` |
| Server down | `handle_errors 502 503 504`: the static `index.html` of the same build, `no-store`, with the security headers; not for `/ads.txt`, `/api`, `/ws`, `/health` | Stop the server, open the site |
| Cache: API | `/api/*`, `/health`, `/ws` → `no-store` | |
| Security headers | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` plus CSP `frame-ancestors 'none'`, `Permissions-Policy` (no camera, microphone, geolocation), no `Server` header, on every response (`security_headers` snippet, also on the fallback page). `Content-Security-Policy`, `Referrer-Policy: no-referrer` and `Cross-Origin-Opener-Policy` are **defaults** (`?Header`): the game server sets its own on the pages it renders and those win | `bun run smoke -- <url> --strict` |
| CSP (base) | Hosts without ads, and every static file: `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'` (React inline style attributes); `img-src 'self' data: blob:`; `font-src 'self'`; `media-src 'self' blob: data:`; `connect-src 'self' wss:` (the explicit `wss:` entry is for older Safari that does not match `'self'` against WebSocket URLs); `object-src 'none'`. The game server's base policy is the same string byte for byte (`tools/deploy/caddyfile.test.ts`); on `ads.domains` hosts with ads on it sends the nonce policy instead (`'nonce-…' 'strict-dynamic'`) and `Referrer-Policy: strict-origin-when-cross-origin`. Verified with a real Chromium session (menu, lobby, briefing, playing level, audio, WebGL) against this exact policy: no violations | Browser console |
| Request size | `/ws`, `/api/*` request bodies capped at 8 KB | |
| Upstream health | Caddy probes `/health` every 5 s and stops routing to an unhealthy server (503) until it recovers | |
| Client address | `trusted_proxies` (from `TRUSTED_PROXIES`) with `trusted_proxies_strict`; `header_up X-Real-IP {client_ip}` on every proxied request | See "Client address" |
| Access logs | Off on purpose: no IP addresses are written. Errors still go to the container log | See "Debugging with access logs" |

If you add an external origin (analytics, CDN, fonts) to the page, extend the CSP with
`csp.extra` in `config.json` (hot reload) and, for static files, in the `Caddyfile`; the game
itself loads nothing from other hosts.

### Abuse limits in the game server

Implemented in the server (`apps/server/src/limits.ts`, tested in `limits.test.ts`); Caddy adds
the 8 KB body cap. Because a whole class often sits behind one school IP, the per-address
numbers are generous: they stop scripts, not students.

| Limit | Value | Behaviour when exceeded |
| --- | --- | --- |
| WebSocket message size | 4096 bytes (`MAX_CLIENT_MESSAGE_BYTES`) | `invalidMessage` error, socket stays open |
| Message rate per socket | 60/s sustained, burst 200 (gameplay input is 20/s) | Socket closed with code 1008 |
| Joins (create or join) per IP | 120 per minute | `invalidMessage` error ("too many requests") |
| New rooms per IP | 20 per minute | `invalidMessage` error |
| Rooms alive at once | 300 | `roomFull` ("server is busy") for new rooms |
| Players per room | 4 | `roomFull` |
| Every message | validated with Zod | `invalidMessage` |

### Client address

The per-address limits need the player's own address, not the proxy's. The external TLS proxy
reports it in `X-Forwarded-For`. Caddy believes that header only on connections from an address
in `TRUSTED_PROXIES` (global `servers { trusted_proxies … }` in the `Caddyfile`), reads it right
to left (`trusted_proxies_strict`: entries a browser forged in front of the proxy's own are
skipped) and sends the result to the game server as `X-Real-IP`
(`header_up X-Real-IP {client_ip}`), overwriting any value the browser sent. The game server
reads only `X-Real-IP`, falling back to the socket address in dev and tests
(`apps/server/src/client-address.ts`); it never reads `X-Forwarded-For`.

- **Default `private_ranges`:** the TLS proxy runs on the same host and reaches the published
  port 8080 from a private address (the docker bridge).
- **Proxy on another machine:** set `TRUSTED_PROXIES=<proxy IP>/32` in `.env`, then
  `docker compose up -d`.
- **Wrong setting:** Caddy ignores the header and every player gets the proxy's address. The
  limits still work but act site-wide, so a busy lesson can hit "too many requests". Never trust
  a wider range than the proxy: anyone inside it could pick their own address.
- **Firewall port 8080:** only the proxy may reach it. A connection that Docker relays itself
  (`docker-proxy`, rootless Docker) arrives from a private bridge address, which the default
  trusts, so a direct visitor could pick their own address.
- **Check:** switch access logs on for a minute (see "Debugging with access logs"); the
  `client_ip` field must show browser addresses, not the proxy's.

## Data, backups and retention

- SQLite file: Docker volume `db`, mounted at `/data/redakcja.sqlite` in the server container
  (WAL mode). It holds only the endless-mode leaderboard (nicknames, score, room code) and the
  anonymous "blunder of the day" votes. No accounts, no e-mail addresses, no IP addresses.
- **Retention: 90 days.** The server deletes leaderboard entries and votes older than
  `LEADERBOARD_RETENTION_DAYS` (90) when it starts and then every hour. Backups are older
  copies of the same data, so they follow the same rule: keep them no longer than needed (the
  script below defaults to 14 days).
- Migrations run automatically when the server starts.
- The data is low value (a leaderboard), so backups are optional, but cheap:

```sh
tools/deploy/backup.sh ./backups 14     # consistent copy (VACUUM INTO), integrity-checked
```

  Cron on the VPS (03:17 every night): `17 3 * * * cd /srv/redakcja && tools/deploy/backup.sh >> backups/backup.log 2>&1`

- **Restore** (stops the server for a few seconds; replace the file name):

```sh
docker compose stop server
docker compose run --rm --no-deps -T -v "$PWD/backups:/backups:ro" --entrypoint sh server -c \
  'rm -f /data/redakcja.sqlite-wal /data/redakcja.sqlite-shm && cp /backups/redakcja-20261011T031700Z.sqlite /data/redakcja.sqlite'
docker compose up -d server
```

  Both commands were exercised against a real stack (seed, back up, wipe the volume, restore,
  read the data back).
- `config/config.json` lives next to `docker-compose.yml`, outside the images and volumes: back
  it up with the deployment files.
- Never run `docker compose down -v` in production: it deletes the volumes.

## Operations

- **Graceful shutdown:** on `SIGTERM` (compose `stop_grace_period: 15s`) the server stops the
  loop, closes sockets and the database and exits 0. Measured: stop in about 0.5 s, exit code 0,
  data intact after the restart. Both containers use `init: true`.
- **Health checks:** `server` calls `/health` every 15 s (database probe included); `web`
  asks Caddy's admin endpoint (`localhost:2019`, not published). `web` starts only after
  `server` is healthy. `restart: unless-stopped` brings both back after a crash or reboot.
- **Limits:** server 384 MB / 1 CPU, web 128 MB / 0.5 CPU, 128 processes each; the server runs
  as the unprivileged `bun` user with no Linux capabilities and `no-new-privileges`.
- **Log rotation:** the `json-file` driver keeps 3 files of 10 MB per container.
- **Logs:** `docker compose logs -f server` (one JSON line per event: `room created`,
  `player joined`, `player left`, `room closed`, `invalid client message`, `join rate limited`,
  `room limit reached`, ...), `docker compose logs -f web` (Caddy errors).
  Quick views: `docker compose logs --since 10m server | grep -c '"room created"'`.
  Room codes and event names are logged; nicknames and IP addresses are not.
- **Debugging with access logs:** add `log` inside the site block of the `Caddyfile`, run
  `docker compose up -d --build web`, and remove it again afterwards (it records IP addresses).

## Smoke test

```sh
bun run smoke -- https://gra.example.pl            # add --insecure for a self-signed local stack
bun run smoke -- https://gra.example.pl --strict   # security-header warnings become failures
```

It uses only the public URL, like a school network would: `/api/health`, `/health`, the leaderboard
endpoint, `/api/config`, the HTML page and every script/stylesheet it links (cache header,
compression, security headers), the HTML shell (the embedded config parses and agrees with
`/api/config`; the CSP mode matches it: ads on needs `'strict-dynamic'` with a `'nonce-…'` equal to
the module script's nonce, ads off needs `script-src 'self'` without `'unsafe-eval'`; a second
request gets a different nonce), `/ads.txt` (404 or `text/plain`, never HTML), `/prywatnosc` (the
privacy page, not the shell: no script, never the ads CSP, its ads section shown exactly when
`/api/config` has ads on) and the manifest (static, `no-cache`), then a full game flow over `wss://<domain>/ws`: heartbeat round trip,
create room, second socket joins by code, ready, start, skip the briefing, receive live
snapshots that acknowledge the input. It prints PASS/WARN/FAIL per step and exits 1 on any
failure. A static fallback page instead of the server-rendered shell is a warning ("static
fallback?"): the game server is down or the catch-all does not reach it. The script is covered
by `tools/smoke/smoke.test.ts`, which runs it against a local server with ads off and with ads on
for `localhost`.

## Local production-like test

With Docker: `docker compose up -d --build` and
`bun run smoke -- http://localhost:8080 --strict`; then `docker compose stop server` and open
`http://localhost:8080`: the menu loads and reports the server as unreachable.

Without Docker (needs the `caddy` binary, 2.8 or newer):

```sh
bun run build && bun tools/deploy/precompress.ts apps/client/dist
PORT=3000 DATABASE_PATH=:memory: bun apps/server/src/index.ts &   # renders the built index.html
sed -e 's|server:3000|localhost:3000|' -e "s|root \* /srv|root * $PWD/apps/client/dist|" \
    -e 's|^:80 {|:8080 {|' Caddyfile > /tmp/Caddyfile.local
caddy run --config /tmp/Caddyfile.local --adapter caddyfile
bun run smoke -- http://localhost:8080 --strict
```

To try ads mode, put `ads` with `enabled: true`, a `client`, one slot, `domains: ["localhost"]`
and a `signOff` into `config/config.json`; the running server reloads it and the smoke test
must report "ads mode: nonce policy matches the page". Caddy 2.10 answers precompressed files
with a whole-file `206`; browsers and the smoke test treat it as a full response.

## School network notes

- Port 443 only: the whole game works over `https`/`wss` on 443. If a class cannot connect, ask
  IT whether the school proxy blocks WebSockets (`Upgrade` header) or inspects TLS with its own
  certificate (then `wss` fails with a certificate error; the IT department must trust the
  domain or bypass the proxy for it).
- Some filters block newly registered or uncategorised domains: ask IT to allow the domain a
  few days before the first lesson.
- A class of 30 behind one IP is fine: the per-IP limits above leave room for it.

## Device matrix (fill in before a stage exit and before the first lesson)

Run a full 8-minute level in each row (mobile GPUs throttle after a few minutes) with at least
one phone and one laptop in the same room. Mark each cell OK / issue (with note), and add the
date and tester. The matrix comes from `agents/platforms.md`.

| Device | Browser | Date / tester | Loads < 10 s | Join + lobby | Controls (move, work, ping) | Stations / minigames | FPS (F3 / `?debug`) | Sound | Reconnect (app switch 30 s) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| School laptop, Windows, Intel UHD 620 | Chrome | | | | | | | | n/a | |
| School laptop, Windows, Intel UHD 620 | Edge | | | | | | | | n/a | |
| Any laptop | Firefox | | | | | | | | n/a | |
| Mac laptop (if available) | Safari 17+ | | | | | | | | n/a | |
| Mid-range Android phone (~2021), landscape | Chrome Android | | | | | | | | | |
| iPhone (11 or newer), landscape | Safari iOS 17+ | | | | | | | | | |
| Tablet (iPad or Android), landscape | Safari / Chrome | | | | | | | | | |
| Mixed room: 2 laptops + 2 phones | any | | | | | | | | | |

Targets: 60 FPS on the laptop and never below 30 FPS on the mid-range phone for the whole
level; text readable at 640×360; no console errors; sound unlocks after the first tap on iOS.

## First lesson: ops checklist

**A few days before**

1. Domain is allowed on the school network (ask IT); the lesson room's Wi-Fi was tried once.
2. `docker compose ps` shows both services healthy; `bun run smoke -- https://<domain> --strict`
   passes with no warnings.
3. Supervisor sign-off done (`reviewed: true` for all stories, see `docs/review/`), and the
   privacy note went to the teacher: `https://<domain>/prywatnosc`, with `site.operator` (name,
   contact, hosting) filled in `config.json`, which replaces the „[do uzupełnienia…]” lines.
4. Device matrix above filled in at least for laptop + Android + iPhone.

**Before class (30 minutes)**

1. `docker compose pull` is not needed; do **not** deploy now. Only run
   `bun run smoke -- https://<domain>` from your laptop on the lesson-room network if possible
   (or a phone hotspot to rule out the server).
2. Warm up: open the game once on the teacher's laptop and play the first 30 seconds of
   level 1 so the browser cache is warm; check the sound.
3. `docker compose logs --since 1h server | tail` shows no errors; `docker stats --no-stream`
   shows memory far below the limits.
4. Have the room-code flow ready: the teacher opens the room and shows the 4-letter code on
   the projector. Backup plan: a mobile hotspot, and a second room on another laptop.

**During class**

1. Watch live: `docker compose logs -f server` (rooms created, players joining/leaving,
   `invalid client message`, `join rate limited`) and `docker compose logs -f web` (errors).
2. Health at a glance: `curl -s https://<domain>/api/health` → `rooms` is the number of open
   rooms.
3. A student cannot join: check the code (4 letters, no `0/O`), the room is not full (4
   players), and the student is on the right domain. A dropped student reconnects with the
   same page within 60 s and keeps the place.
4. If something is really wrong: do **not** restart mid-lesson unless the server is unhealthy;
   a restart ends all running rooms.

**After class**

1. Note problems and the time they happened (the logs are JSON with timestamps); fill in the
   device matrix with what teachers and students reported.
2. `tools/deploy/backup.sh` (optional), then `docker compose logs --since 3h server | grep -c error`.
3. Collect the "blunder of the day" statistics for the debrief:
   `curl -s 'https://<domain>/api/stats/blunders?levelId=l1-burza'`.
4. Deploy fixes only now, outside lesson hours (`git pull && docker compose up -d --build`),
   then run the smoke test again.
