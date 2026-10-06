# Deployment

The game runs as two containers behind one public port:

```
browser ──https/wss :443──▶ web (Caddy: TLS, static client, reverse proxy)
                                   │  /ws, /api/*, /health
                                   ▼
                             server (Bun + Hono, rooms in memory, SQLite on a volume)
```

Everything goes over **443** (school networks often block other ports, and `wss://` needs TLS).
The game server is never exposed directly.

## Requirements

- A Linux VPS with Docker Engine and the compose plugin.
- A domain whose A/AAAA record points at the VPS (for automatic Let's Encrypt certificates).
- Ports 80 and 443 open (80 is only used for the ACME challenge and HTTP→HTTPS redirect).

## First deploy

```sh
git clone <repo> redakcja && cd redakcja
cp .env.example .env          # set DOMAIN=gra.example.pl
docker compose up -d --build
docker compose ps             # server should be "healthy"
curl https://gra.example.pl/api/health
```

Without a `DOMAIN`, Caddy serves `https://localhost` with its own local CA, which is handy for
trying the production stack on a laptop (`docker compose up --build`, then accept the
certificate warning or install Caddy's root CA).

## Updating

```sh
git pull
docker compose up -d --build
```

Rooms live in memory, so a restart ends running matches. Deploy outside lesson hours.
Players who are mid-game get the "connection lost" notice and can create a new room.

## Data

- SQLite file: Docker volume `db`, mounted at `/data/redakcja.sqlite` in the server container.
  It holds only the leaderboard and similar aggregate data. Nicknames only, no personal data;
  entries older than `LEADERBOARD_RETENTION_DAYS` are deleted hourly.
- Migrations run automatically when the server starts.
- Backup: `docker compose exec server bun -e "new (require('bun:sqlite').Database)('/data/redakcja.sqlite').run(\"VACUUM INTO '/data/backup.sqlite'\")"`
  then `docker compose cp server:/data/backup.sqlite ./backup.sqlite`.
- Certificates: volumes `caddy-data` / `caddy-config`. Keep them so Caddy doesn't re-issue
  certificates on every deploy.

## Configuration

| Variable | Where | Default | Meaning |
| --- | --- | --- | --- |
| `DOMAIN` | `.env` → web | `localhost` | Public host name for TLS |
| `PORT` | server | `3000` | Internal HTTP/WS port |
| `DATABASE_PATH` | server | `/data/redakcja.sqlite` | SQLite file |
| `DEV_LATENCY_MS` | server | `0` | Dev only: artificial latency for netcode testing |
| `LOG_LEVEL` | server | — | `silent` disables logs |

## Checking a deploy

1. `https://<domain>/api/health` returns `{"status":"ok","db":"ok",…}`.
2. Open the site on a laptop and a phone, create a room on one, join by code on the other,
   start, and move: both must see each other.
3. In the browser dev tools the socket URL must be `wss://<domain>/ws`.

## Local production-like test without Docker

Useful when Docker Hub is unavailable. Requires the `caddy` binary.

```sh
bun run build
PORT=3000 DATABASE_PATH=:memory: bun apps/server/src/index.ts &
sed -e 's|{$DOMAIN:localhost}|localhost:8443|' -e 's|server:3000|localhost:3000|' \
    -e "s|root \* /srv|root * $PWD/apps/client/dist|" Caddyfile > /tmp/Caddyfile.local
caddy run --config /tmp/Caddyfile.local --adapter caddyfile
# open https://localhost:8443
```
