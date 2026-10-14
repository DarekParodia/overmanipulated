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
  idle usage is about 30 MB (server) + 15 MB (Caddy). The compose file sets no memory or CPU
  caps (hosts without those cgroup controllers refuse containers that set them); add them in a
  `docker-compose.override.yml` where supported (see the comment at the top of
  `docker-compose.yml`: server 384 MB / 1 CPU, web 128 MB / 0.5 CPU).
- An external TLS reverse proxy for the public domain that forwards to port 8080 (WebSocket
  upgrades and the original `Host` header included). Port 8080 is reachable only from it.
- Uplink: the game sends snapshots 20 times a second, so bandwidth, not CPU, limits how many
  rooms one server holds; see "Rooms, versus and spectators: sizing" for the per-room figures.

## First deploy

```sh
git clone <repo> redakcja && cd redakcja
cp .env.example .env          # optional: LOG_LEVEL, TRUSTED_PROXIES, ADS_ENABLED
cp config/config.example.json config/config.json && chmod 644 config/config.json   # optional
bun run config:check -- config/config.json   # if you edited it (needs Bun), see "Configuration"
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
(`0.0.0+1a2b3c4 · protokół 8`); without it the version reads `+dev`. The build context has no
`.git`, so the sha comes in as a build argument, the same for both images.

Rooms live in memory, so a restart ends running matches. Deploy outside lesson hours.
Players who are mid-game get the "connection lost" notice and can create a new room.
Browsers that still have the old page open keep working until reload: hashed assets of the old
build are gone, so such a tab shows the load error; reloading fixes it.

## Configuration

Settings live in three places, and each setting lives in exactly one of them:

1. **Environment** (`.env` next to `docker-compose.yml`, or the compose file itself): process and
   infrastructure settings (ports, file paths, log level, the trusted proxies) and one kill switch,
   `ADS_ENABLED`. Read once at start: change them, then `docker compose up -d` (recreates the
   changed service).
2. **`config/config.json`**: product settings the operator changes while the game runs (feature
   flags, message of the day, rooms, ads, CSP extras). Validated with a strict schema and
   **hot-reloaded**: no restart, running matches keep going.
3. **Code constants**: balance numbers, abuse limits and retention (`packages/shared/src/constants.ts`,
   `apps/server/src/limits.ts`); changing them is a release.

**Precedence.** A key is either env or `config.json`, never both, with one exception: the
`ADS_ENABLED` kill switch, which always wins over `ads.enabled`. It is written into the file's
values **before** validation, at start and on every reload, so `ADS_ENABLED=false` keeps ads off
whatever the file says, and `ADS_ENABLED=true` cannot skip a rule: without `ads.signOff` (or a
client, a domain, a slot) the server refuses the config exactly as if the file said it.
`BRIEFING_MS` stays env-only on purpose (the e2e knob).

### Environment variables

| Variable | Where | Default | Applies | Meaning |
| --- | --- | --- | --- | --- |
| `LOG_LEVEL` | `.env` → server | `info` | restart | `silent` disables server logs |
| `TRUSTED_PROXIES` | `.env` → web | `private_ranges` | restart (`docker compose up -d web`) | Addresses of the external TLS proxy whose `X-Forwarded-For` Caddy believes (IPs or CIDR ranges, space-separated). Set it to the proxy's `IP/32` when the proxy runs on another machine; see "Client address" |
| `ADS_ENABLED` | `.env` → server | unset | restart (`docker compose up -d server`) | Kill switch: `false` turns ads off whatever `config.json` says, also across reloads; `true` still needs everything `ads.enabled` needs (`ads.signOff` above all). Unset: `config.json` decides |
| `CONFIG_PATH` | server | `config/config.json` in the repository; compose sets `/app/config/config.json` | restart | Where `config.json` is read from. Compose mounts `./config` read-only at `/app/config`; a missing file means the defaults |
| `SHELL_HTML_PATH` | server | `apps/client/dist/index.html` | restart | Built page the HTML shell is rendered from; the image copies it from the client build. Absent file: the shell paths 404 (dev, where Vite serves the page) |
| `PRIVACY_MD_PATH` | server | `docs/privacy.pl.md` | restart | Privacy note rendered at `/prywatnosc`; the image copies it. Absent file: `/prywatnosc` is a 404 |
| `PORT` | server | `3000` | restart | Internal HTTP/WS port (set by compose) |
| `DATABASE_PATH` | server | `./data/redakcja.sqlite`; compose sets `/data/redakcja.sqlite` | restart | SQLite file |
| `BRIEFING_MS` | server | `18000` | restart | Briefing length before a level auto-starts (tests shorten it) |
| `DEV_LATENCY_MS` | server | `0` | restart | Dev only: artificial latency for netcode testing. Keep `0` in production |

Compose passes only `LOG_LEVEL`, `ADS_ENABLED` and `TRUSTED_PROXIES` from `.env`; the paths and
the port are fixed in `docker-compose.yml` and the image. Outside Docker, Bun reads a `.env` in the
working directory itself, so every server variable above can go there.

Retention (90 days) and the abuse limits below are constants in the code, not settings:
`LEADERBOARD_RETENTION_DAYS` in `packages/shared/src/constants.ts` and
`apps/server/src/limits.ts`.

### config.json

Copy `config/config.example.json` (ads off, room browser off, no sign-off) to
`config/config.json` and `chmod 644` it (the container user must read it). Editors with JSON
Schema support complete and check keys through `"$schema": "./config.schema.json"`
(`config/config.schema.json`, generated by `bun run config:schema`). Unknown keys are refused.
Every key is optional: the table lists the default for a missing key. "Required" keys must be
there once their section is (a `motd` needs an `id` and a `text`).

All keys are hot: a reload applies to the next request (page, `/api/config`, `/ads.txt`,
`/prywatnosc`) and to the next new room. Open game tabs pick up the public part on their next
main-menu visit (at most once a minute) or reload; a running match never changes.

| Key | Default | Hot reload | Meaning |
| --- | --- | --- | --- |
| `site.publicOrigin` | unset | yes | Public address, e.g. `https://bronsie.drkp.dev` (stored as the bare origin). Sent to clients as `siteOrigin` and shown as `{{site.origin}}` in the privacy note |
| `site.operator.name` | unset | yes, next `/prywatnosc` | Who runs this server (≤ 120 characters), named in the privacy note. Unset: the note shows „[do uzupełnienia…]” |
| `site.operator.contact` | unset | yes, next `/prywatnosc` | Contact for privacy questions (≤ 200 characters), e.g. an e-mail address |
| `site.operator.hosting` | unset | yes, next `/prywatnosc` | Where the server runs (≤ 200 characters), e.g. the hosting company and country |
| `features.roomBrowser` | `false` | yes, next menu visit | Public room list (`GET /api/rooms`, 404 while off; public rooms only, cached 2 s, 600 requests a minute per address) and the host's „Publiczny” switch. Off by default: rooms of minors are never listed publicly unless the operator opts in. `/prywatnosc` says whether this server lists rooms and what the list shows |
| `features.versus` | `true` | yes, next menu visit / new room | „Na punkty” (versus) mode: two newsrooms of up to 4 on the same run. Gates entry points only: a running match keeps going |
| `features.spectators` | `true` | yes, next join | Spectator joins (the host still opens the Widownia per room; it starts closed), up to 8 per room. Off: „Oglądaj” disappears and spectator joins get `featureDisabled` |
| `features.intro` | `true` | yes, next menu visit | The intro: its Wprowadzenie tab in „Jak grać” (off: the dialog opens on Stanowiska), „Obejrzyj wprowadzenie” in the settings, and its autoplay in a new training room |
| `motd` | `null` | yes, next menu visit | Message of the day in the main menu; `null` for none |
| `motd.id` | required | yes | Stable id (`A–Z a–z 0–9 . _ -`, 1–40). Players who closed the message do not see it again until the id changes |
| `motd.text` | required | yes | Polish text, one paragraph, ≤ 140 characters (`MOTD_MAX_CHARS`), no line breaks. Shown as written (typographic quotes and dashes are fixed up) |
| `motd.tone` | `"info"` | yes | `info` (blue, lightbulb) or `warning` (orange, siren) |
| `motd.from` | unset | yes | ISO 8601 instant with an offset (`2026-11-02T07:00:00+01:00`): shown from then on (inclusive) |
| `motd.until` | unset | yes | Hidden from then on (exclusive); must be later than `from` |
| `rooms.maxRooms` | `300` | yes, next new room | Rooms alive at once (1–5000); a full server answers „server is busy” to new rooms |
| `rooms.defaultDifficulty` | `"normal"` | yes, next new room | Difficulty a new room starts on: `easy`, `normal`, `hard` or `expert` |
| `ads.enabled` | `false` | yes, next page | Ads on `ads.domains`. Needs `ads.client`, `ads.signOff`, at least one host in `ads.domains` and at least one slot. `ADS_ENABLED` wins over it. See "AdSense operator checklist" |
| `ads.verification` | `false` | yes, next page | Put AdSense's `google-adsense-account` meta tag on `ads.domains` pages while ads are still off (site verification). Needs `ads.client` |
| `ads.mode` | `"limited"` | yes, next page | `limited` (Google's limited ads: no cookies, no local storage, no personalisation) or `nonPersonalized` (may use cookies, adults only). Only `limited` is accepted while `ageTreatment` is `teen` or `child`, even with ads off |
| `ads.client` | unset | yes, next page | AdSense publisher id, `ca-pub-` and 10–20 digits |
| `ads.slots` | `{}` | yes, next page | Ad unit id (6–20 digits) per placement: `menu` (160×600), `lobby` (728×90), `results` (160×600), `spectator` (300×250: the spectator's stats sheet and match results, from 1280×900). A placement without a unit shows nothing |
| `ads.domains` | `[]` | yes, next page | Hosts that show ads (≤ 16, exact, no port: `bronsie.drkp.dev` never matches `drkp.dev` or `x.bronsie.drkp.dev`). Every other host gets no ads, the base CSP and the ad-free privacy text: a school can get an ad-free address |
| `ads.ageTreatment` | `"teen"` | yes, next page | Age tag on every ad request: `child`, `teen` or `unspecified` (adults only) |
| `ads.signOff.by` | required | yes | Who signed off ads for this audience (supervisor or legal; ≤ 120 characters) |
| `ads.signOff.date` | required | yes | When (`YYYY-MM-DD`). Without `ads.signOff`, `ads.enabled: true` is refused |
| `ads.adsTxt` | `[]` | yes, next `/ads.txt` (cached 5 minutes) | Lines served at `/ads.txt` on every host, also while ads are off (≤ 100 lines of ≤ 300 characters: a comment, `VARIABLE=value` or `domain, pub-id, DIRECT\|RESELLER[, cert-id]`). Empty: `/ads.txt` is a 404 |
| `csp.extra` | `{}` | yes, next page | Extra CSP sources per fetch directive (`script-src`, `style-src`, `img-src`, `font-src`, `media-src`, `connect-src`, `frame-src`, `worker-src`; ≤ 20 each: a keyword, `https:`/`wss:`/`data:`/`blob:` or an `https://` host), on every page the server renders. Static files keep the Caddyfile policy |
| `csp.adsExtra` | `{}` | yes, next page | The same, added only to pages in ads mode |

### Reloading and checking config.json

1. Check the new file first, on any machine with Bun and the repository:
   `bun run config:check -- config/config.json`. It prints OK, the effective config (defaults
   filled in, `ADS_ENABLED` from the environment applied) and what `/api/config` serves on each
   ads host and on any other host, or the errors with exit code 1.
2. Save it over `config/config.json`. The server watches the directory and reloads 250 ms after
   the last change. Where file events do not reach the container (Docker Desktop, network
   filesystems), reload by hand: `docker compose kill -s SIGHUP server`.
3. Confirm: `docker compose logs --since 1m server | grep config` shows `config reloaded` with the
   changed keys, and `curl -s https://<domain>/api/health` shows `config.revision` one higher
   (`config.source` is `file`). `config reload rejected` means the file was invalid or unreadable:
   the server **keeps the old config** and says so only in this log line. A file deleted while
   the server runs also keeps the old config.

An invalid `config.json` at **start** stops the server (exit 1, `invalid config file, refusing to
start` in the log), so a typo never starts a server with ads, flags or limits nobody meant;
`docker compose ps` then shows it restarting. A missing file at start means the defaults.

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
`csp.extra` in `config.json` (hot reload) and, for static files, in the `Caddyfile`. Apart from
Google's ad script on ad hosts (below), the game loads nothing from other hosts.

## Headers and CSP modes

**Who owns which header.** Each header has one owner, so the two never fight:

| Header | Owner | Where |
| --- | --- | --- |
| `Content-Security-Policy`, `Referrer-Policy`, `Cross-Origin-Opener-Policy` on the HTML shell and `/prywatnosc` | Game server (`apps/server/src/shell/csp.ts`), from `config.json` and the request host | Per request, hot with config reloads |
| `Cache-Control` on the shell (`no-store`: per-request nonce), `/prywatnosc` (`no-cache`), `/ads.txt` (`public, max-age=300`), `/api/config` (`no-store`) | Game server | |
| `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`, no `Server` | Caddy (`security_headers` snippet) | Every response, the fallback page included |
| `Content-Security-Policy`, `Referrer-Policy`, `Cross-Origin-Opener-Policy` on static files and the fallback page | Caddy, as `?` defaults: set only when the response has none, so the game server's values win on its pages | |
| `Cache-Control` on `/assets/*`, the manifest and icons; `no-store` on `/api/*`, `/ws`, `/health` | Caddy | |
| `X-Real-IP` (request header to the game server) | Caddy (`header_up X-Real-IP {client_ip}`), always overwritten | See "Client address" |

**CSP modes.** The game server picks one mode per page, from the same decision that fills the
embedded config, so the page's ads and its policy never disagree:

- **Base** (every host without ads, `/prywatnosc` always, and Caddy's static files and fallback):
  the strict same-origin policy in the table above, byte for byte the Caddyfile's
  (`tools/deploy/caddyfile.test.ts`), plus `csp.extra` on the pages the server renders (Caddy's
  copy has no extras); `Referrer-Policy: no-referrer`.
- **Ads** (only on pages of a host in `ads.domains` while `ads.enabled`, a client is set and the
  shell was built with the nonce placeholder): Google's strict CSP for AdSense. `script-src
  'nonce-…' 'strict-dynamic'` with a fresh nonce per request (`'unsafe-inline' 'unsafe-eval'
  https: http:` follow only as fallbacks for browsers without CSP3, which ignore them otherwise);
  `https:` added to `style-src`, `img-src`, `font-src` (with `data:`), `connect-src` and a new
  `frame-src https:` for ad creatives and Google's consent message; `object-src`, `base-uri`, `form-action`
  and `frame-ancestors` stay closed. Plus `csp.extra` and `csp.adsExtra`.
  `Referrer-Policy: strict-origin-when-cross-origin`, because Google's consent message does not
  show under `no-referrer`.

Check a page: `curl -sI https://<domain>/ | grep -i -E 'content-security|referrer'`; the smoke
test checks that the mode matches `/api/config` and that the nonce changes per request.

## Abuse limits in the game server

Implemented in the server (`apps/server/src/limits.ts`, tested in `limits.test.ts`); Caddy adds
the 8 KB body cap. Because a whole class often sits behind one school IP, the per-address
numbers are generous: they stop scripts, not students.

| Limit | Value | Behaviour when exceeded |
| --- | --- | --- |
| WebSocket message size | 4096 bytes (`MAX_CLIENT_MESSAGE_BYTES`) | `invalidMessage` error, socket stays open |
| Message rate per socket | 60/s sustained, burst 200 (gameplay input is 20/s) | Socket closed with code 1008 |
| Joins (create or join) per IP | 120 per minute | `invalidMessage` error ("too many requests") |
| New rooms per IP | 20 per minute | `invalidMessage` error |
| Room-list requests (`GET /api/rooms`) per IP | 600 per minute; the list itself is rebuilt at most every 2 s | HTTP 429 `{"error":"too many requests"}` |
| Rooms alive at once | 300 (`rooms.maxRooms` in config.json) | `roomFull` ("server is busy") for new rooms |
| Players per room | 4 in „Razem”; 8 in „Na punkty” (4 per newsroom) | `roomFull`; `teamFull` when moving into a full newsroom |
| Player joins during a versus match | none in the briefing or while playing (co-op joins by code at any time) | `matchInProgress` |
| Spectators per room | 8, only while the host has opened the Widownia | `spectatorsFull`, `spectatorsOff` |
| Rejoin after a kick | 10 minutes, per browser `clientId`, per room (no IP ban) | `kickCooldown` |
| Room name | 1–24 characters, no control characters, the shared blocklist | `invalidName` |
| Public rooms per room-list response | 50 | the rest is counted in `total` |
| Every message | validated with Zod | `invalidMessage` |

## Rooms, versus and spectators: sizing

Measured with `bun run perf:server` (`docs/performance.md`, "Versus and spectators (S7-92)"):
a tick of 150 full versus rooms takes 6–10 ms of the 50 ms budget, and 20 ms at the 300-room cap,
so CPU is not the limit. **Egress is.** What one room sends:

| Room | Egress |
| --- | --- |
| „Razem”, 4 players (level 1 / endless) | 0.12 / 0.21 MB/s |
| „Na punkty”, 4 v 4 (level 1 / endless) | 0.26 / 0.45 MB/s |
| „Na punkty”, 4 v 4 with 8 spectators | 0.54 / 0.90 MB/s |
| One spectator of a versus match | 0.03 / 0.06 MB/s |

Nothing goes to a room's spectator channel while nobody watches. Size `rooms.maxRooms` by the
uplink, not by CPU: divide the uplink in MB/s by the heaviest room you expect. On 100 Mbit/s
(about 12 MB/s) that is about 13 full versus rooms with a full Widownia, 27 without spectators or
57 co-op endless rooms; a lesson of 30 students is at most 8 rooms (about 1–2 MB/s). The default
of 300 fits a server whose rooms are mostly idle lobbies; lower it when many classes play at
once on a small uplink, since a full server answers „server is busy” to new rooms instead of
slowing every running match down.

## Client address

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

## AdSense operator checklist

Ads are off by default (`ads.enabled: false`) and never run on a host outside `ads.domains`, so
any other address of the same server stays ad-free (a school can get its own). The game asks
only for Google's **limited ads** while the audience may be under 18. Before `ads.enabled: true`
in production, in this order (the example uses the game at `bronsie.drkp.dev`):

1. **Sign-off gate.** Many players are under 16 and cannot consent to ad cookies or storage. The
   supervisor (or the school's lawyer) signs off in writing that ads may run for this audience,
   in this mode and in these placements. Record who and when in `ads.signOff`
   (`{"by": "…", "date": "YYYY-MM-DD"}`) and keep the written sign-off with the deployment files.
   The server refuses `ads.enabled: true` without it, also when `ADS_ENABLED=true` forces ads; the
   committed example has no sign-off on purpose. No sign-off, no ads.
2. **AdSense site = root domain.** Create the AdSense account and add the root domain
   **`drkp.dev`** as the site: AdSense accepts only root domains (since March 2023), and the site
   covers its subdomains.
3. **ads.txt on the root.** Google reads `https://drkp.dev/ads.txt`, not the game host's: put the
   line AdSense gives you (`google.com, pub-…, DIRECT, f08c47fec0942fa0`) there. The game's own
   `/ads.txt` (`ads.adsTxt`, every host, 5-minute cache) matters only when the root file sends
   crawlers to the subdomain with a `subdomain=bronsie.drkp.dev` line, which is needed only if
   the game host sells through a different account.
4. **Verification.** Verify the root site through `drkp.dev` (its owner adds AdSense's meta tag or
   ads.txt there). Only if the game itself runs on the root domain: set `ads.client`,
   `ads.domains` and `ads.verification: true`, and the game's pages carry the
   `google-adsense-account` meta tag while ads are still off.
5. **Consent message (Privacy & messaging).** Create a European regulations message (Google's
   certified CMP, required in the EEA) for the site: language **Polish**, privacy policy URL
   `https://bronsie.drkp.dev/prywatnosc`, and the **floating revocation link off**: the game's
   own „Zgody reklamowe” link in the menu footer reopens the message, and a floating button would
   sit over the game's controls. Create no other message types.
6. **Auto ads off.** Under Ads → By site → `drkp.dev`: Auto ads **off**, including the overlay
   formats (anchor, vignette, side rail) and the optimisation of existing ad units. The client
   never asks for them, but switched on in AdSense they could cover controls during play.
7. **Ad units.** Create fixed-size display units (not responsive): 160×600 for `menu` and
   `results`, 728×90 for `lobby`, 300×250 for `spectator`. Copy their ids into `ads.slots`.
8. **Config.** Set `ads.client`, `ads.slots`, `ads.domains: ["bronsie.drkp.dev"]`,
   `ads.mode: "limited"`, `ads.ageTreatment: "teen"` (or `"child"`; `"unspecified"` and
   `nonPersonalized` only for an adults-only deployment), `ads.signOff` and `ads.enabled: true`.
   Run `bun run config:check -- config/config.json`, save, confirm the reload (see "Reloading and
   checking config.json"), then `bun run smoke -- https://bronsie.drkp.dev --strict`: it must
   report "ads mode: nonce policy matches the page", and `/prywatnosc` must show its ads section.
9. **Verify the limited-ads flags** in a desktop browser at 1280×720 or more (the menu rail needs
   1180×680) on the ad host, with DevTools:
   - Elements: every `<ins class="adsbygoogle">` has `data-tag-for-under-age-of-consent="1"`
     (limited mode) and `data-tag-for-age-treatment="2"` (`teen`; `1` for `child`, absent for
     `unspecified`), and no `data-ad-format` or `data-full-width-responsive`.
   - Console, on the menu: `adsbygoogle.requestNonPersonalizedAds` is `1` and
     `adsbygoogle.pauseAdRequests` is `0`; start a level: no ad on screen, `pauseAdRequests` is
     `1` and the Network tab shows no new ad request.
   - Application → Cookies and Local storage for `https://bronsie.drkp.dev`: no Google ad
     entries (`__gads`, `__gpi`, `__eoi`, `google_*`).
   - A phone (or the browser at 640×360): no request to any Google host at all.
   - Another host of the same server (e.g. `http://<server IP>:8080`, or a second domain):
     no ads, base CSP, `/prywatnosc` says „Pod tym adresem nie ma reklam”.
   - Compare the flag names with Google's current help pages: limited ads (AdSense answer
     14210870), the age-treatment tag (17042704) and non-personalised ads (9042142). They were
     taken from those pages but could not be re-read from the build sandbox; if Google renamed a
     flag, fix `apps/client/src/ads/ads-model.ts` (and its tests) before enabling ads.
10. **Device matrix.** Add a row with ads on (laptop with the menu rail, and a phone) and play a
    full level on each.

**Switching ads off.** `ads.enabled: false` in `config.json` works at once and keeps running
matches. `ADS_ENABLED=false` in `.env` wins over the file and survives later edits, but needs
`docker compose up -d server`, which ends running matches: use it outside lessons.

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
- **Limits:** none in `docker-compose.yml` (see "Requirements" for an override with server
  384 MB / 1 CPU, web 128 MB / 0.5 CPU). The server runs as the unprivileged `bun` user with no
  Linux capabilities and `no-new-privileges`; the web container has `no-new-privileges`.
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
endpoint, `/api/config`, `/api/rooms` (a valid room list when `features.roomBrowser` is on,
404 when it is off), the HTML page and every script/stylesheet it links (cache header,
compression, security headers), the HTML shell (the embedded config parses and agrees with
`/api/config`; the CSP mode matches it: ads on needs `'strict-dynamic'` with a `'nonce-…'` equal to
the module script's nonce, ads off needs `script-src 'self'` without `'unsafe-eval'`; a second
request gets a different nonce), `/ads.txt` (404 or `text/plain`, never HTML), `/prywatnosc` (the
privacy page, not the shell: no script, never the ads CSP, its ads section shown exactly when
`/api/config` has ads on) and the manifest (static, `no-cache`), then a full game flow over `wss://<domain>/ws`: heartbeat round trip,
create room, second socket joins by code, the host picks Fotoedytor, ready, start, skip the
briefing, receive live snapshots that acknowledge the input, then press the role ability
(`useAbility`) and see Ekspertyza armed in the `ability` event and in `snapshot.crew` (roles
and abilities, M3), then the Widownia (M6): the host opens it, a third socket joins as a
spectator and gets the sync (team 0's snapshot and `matchStats`), and the players' roomState
lists it (skipped, as a pass, when `/api/config` has `features.spectators` off). It prints
PASS/WARN/FAIL per step and exits 1 on any
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
| „Na punkty” 2 v 2 + a spectator on the projector laptop and one on a phone | any | | | | | | | | | Both newsrooms side by side on the laptop, one at a time on the phone; „Widz dołączył” shows for the players |
| Ads on (only if enabled): laptop ≥ 1180×680 + a phone | Chrome / any | | | | | | | | | Ads only in menu, lobby, results and a spectator's stats sheet / match results (by viewport); none in play or on the phone |

Targets: 60 FPS on the laptop and never below 30 FPS on the mid-range phone for the whole
level; text readable at 640×360; no console errors; sound unlocks after the first tap on iOS.

## Stage 7 release checklist (outside the dev sandbox)

Stage 7 (protocol 8) was built and tested in a sandbox without Docker, a public domain, an
AdSense account or a microphone. These steps are left for a person, in this order (S7-106):

1. **Deploy smoke on the real stack.** On the host: `git pull`,
   `APP_GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build`, then from a laptop
   `bun run smoke -- https://<domain> --strict`. It must pass with no warnings: the
   server-rendered shell and CSP (M5), the role ability (M3) and a spectator's sync (M6) are part
   of its game flow. Open the game once on a laptop and a phone: „O grze” must show
   `protokół 8` and the commit's sha, the intro must autoplay in a new training room and „Pomiń”
   must end it. Run the "Local production-like test" above in ads mode too if ads will ever be
   on.
2. **Content review.** All 165 stories are `reviewed: false`. The subject-matter supervisor reads
   `bun run review:export` (`docs/review/stories-for-review.md`), fills the CSV, and
   `bun run review:apply` writes the verdicts back; nothing goes to a class before that (first
   lesson checklist, step 3).
3. **Intro voice (S7-100, still open).** A volunteer records the 17 clips with the consent form
   (`docs/voice-recording.pl.md`, CC0), then `synth_voice.py --recordings DIR` builds
   `apps/client/public/assets/voice/intro.{webm,mp3,json}`; commit them with the CREDITS row and
   tick S7-100. Until then the intro runs on subtitles and fallback timing, and „O grze” says
   the voice is pending.
4. **Ads (optional).** Ads stay off until the whole "AdSense operator checklist" above is done:
   the AdSense account and site approval, `ads.txt`, Google's certified CMP with non-personalised
   ads, and only then `ads.signOff` in `config.json`. The server refuses ads without the
   sign-off.
5. **Device matrix** (above) for the Stage 7 screens: the intro and „Jak grać” on a phone, the
   first-use station help, a „Na punkty” 2 v 2 with a spectator on the projector, the room
   browser if `features.roomBrowser` is on.
6. **Contest materials.** Fill in the deploy address and the playtest and review results in
   `docs/contest/how-to-play.pl.md` and `criteria-mapping.pl.md`. The committed gameplay video
   was recorded under software WebGL; for a smoother take rerun
   `bun run contest:build -- --video` on a machine with a GPU (optional).

## First lesson: ops checklist

**A few days before**

1. Domain is allowed on the school network (ask IT); the lesson room's Wi-Fi was tried once.
2. `docker compose ps` shows both services healthy; `bun run smoke -- https://<domain> --strict`
   passes with no warnings.
3. Supervisor sign-off done (`reviewed: true` for all stories, see `docs/review/`), and the
   privacy note went to the teacher: `https://<domain>/prywatnosc`, with `site.operator` (name,
   contact, hosting) filled in `config.json`, which replaces the „[do uzupełnienia…]” lines.
4. Device matrix above filled in at least for laptop + Android + iPhone.
5. Ads: off, or the whole "AdSense operator checklist" done (sign-off recorded in `ads.signOff`).
   The teacher gets the address that matches: an ad host shows ads in the menu, any other host
   of the server shows none.

**Before class (30 minutes)**

1. `docker compose pull` is not needed; do **not** deploy now. Only run
   `bun run smoke -- https://<domain>` from your laptop on the lesson-room network if possible
   (or a phone hotspot to rule out the server).
2. Warm up: open the game once on the teacher's laptop and play the first 30 seconds of
   level 1 so the browser cache is warm; check the sound.
3. `docker compose logs --since 1h server | tail` shows no errors; `docker stats --no-stream`
   shows memory far below the limits.
4. Have the room-code flow ready: the teacher opens the room and shows the 4-letter code on
   the projector. To watch a „Na punkty” match from the projector, the teacher stays host and
   presses „Na widownię” (and ticks „Widownia otwarta” if students should watch too). Rooms are
   private unless `features.roomBrowser` is on and the host marks one public. Backup plan: a
   mobile hotspot, and a second room on another laptop.

**During class**

1. Watch live: `docker compose logs -f server` (rooms created, players joining/leaving,
   `invalid client message`, `join rate limited`) and `docker compose logs -f web` (errors).
2. Health at a glance: `curl -s https://<domain>/api/health` → `rooms` is the number of open
   rooms.
3. A student cannot join: check the code (4 letters, no `0/O`), the room is not full (4
   players in „Razem”, 4 per newsroom in „Na punkty”, 8 spectators), a „Na punkty” match is not
   running (players join in the lobby or after the match; „Oglądaj” works meanwhile), and the
   student is on the right domain. A student the host removed cannot rejoin that room from the
   same browser for 10 minutes („Gospodarz niedawno cię usunął”). A dropped student reconnects
   with the same page within 60 s and keeps the place.
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
