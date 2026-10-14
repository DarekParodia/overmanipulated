# Architecture

Summary of the technical design from the design document, plus the invariants agents must keep.

```
Browser (React + R3F)  ──https/wss:443──▶  TLS proxy ──▶ Caddy (static build, headers)
        │                                                  │ everything but /assets, manifest, icons
        │                                                  ▼
        │                     Bun server: Hono (/ws, /api, HTML shell, /ads.txt, /prywatnosc)
        │                                 + rooms + 20 Hz loop + config.json (hot reload)
        │                                                              │
        │                                                     Drizzle ──▶ SQLite file
        └──── @redakcja/shared ◀───────────────────────────────────────┘
              (sim, protocol, constants)      @redakcja/content (schemas, levels, stories)
```

## Packages

| Package | Responsibility | May depend on |
| --- | --- | --- |
| `packages/shared` | Pure game simulation, network protocol schemas, balance constants | `zod` |
| `packages/content` | Content schemas, level/story JSON, loaders, validator | `zod`, `shared` (types only) |
| `apps/server` | Hono routes, rooms, sockets, tick loop, applying inputs to sim, broadcasting snapshots, Drizzle/SQLite persistence | `shared`, `content` |
| `apps/client` | Rendering, input, UI, netcode (prediction/interpolation), audio | `shared`, `content` |

Dependencies point only downwards. `shared` never imports from apps or from `content` at runtime.

## Simulation (`packages/shared/src/sim`)

- The whole game state of a room is one plain, serialisable object (`GameState`).
- State changes only through pure functions, e.g.
  `step(state, inputs, dtMs, rng) → { state, events }` and
  `applyVerdict(state, playerId, verdict) → { state, events }`.
- **Deterministic**: no `Date.now()`, `performance.now()`, `Math.random()`, timers, I/O, DOM or
  three.js. Time is passed in as `dtMs`; randomness comes from the match seed in the state
  (`GameState.seed`). Minigame seeds are derived from it per folder `spawnKey`, station kind and
  attempt (`minigameSeedFor`), never drawn from a running RNG, so they do not depend on the
  order in which stations are used (S7-13).
- Time is measured in **ticks / milliseconds as integers**, never wall-clock dates.
- The client runs the same movement code for prediction of the local player only. Everything
  else on the client is display of server state.
- All balance numbers (station durations, role bonuses, points, credibility deltas, deadlines,
  star thresholds defaults) come from `constants.ts` or level data.

## Server (`apps/server`)

- **HTTP and WebSocket routing with [Hono](https://hono.dev)** on top of `Bun.serve`:
  `Bun.serve({ fetch: app.fetch, websocket })` with `upgradeWebSocket` and `websocket` from
  `hono/bun`.
- Routes:
  - `GET /health`: liveness, plus a DB check.
  - `GET /ws`: WebSocket upgrade for the game protocol.
  - `/api/*`: REST endpoints (leaderboard, content preview for the supervisor, room stats, and
    `GET /api/config`: the public config for the request's host, see `apps/server/src/public-config.ts`;
    `GET /api/rooms`: the room browser's list of public rooms, 404 while the `roomBrowser` flag is
    off; `registry.listRooms` filters a summary list it rebuilds at most every `ROOM_LIST_CACHE_MS`,
    see `apps/server/src/rooms/room-list.ts`, and the route limits each address to
    `ROOM_LIST_PER_MINUTE_PER_IP`).
    An unknown `/api/*` path is a JSON 404, never HTML.
  - Mounted last (`routes/shell.ts`): `/`, SPA paths and `/index.html` render the **HTML shell**
    from the built client `index.html` (`shell/`): a per-request CSP nonce replaces Vite's
    `CSP_NONCE_PLACEHOLDER`, the head gains the public config as JSON and, on ad hosts, the
    AdSense verification meta tag. The CSP comes from `shell/csp.ts`: the base policy (identical
    to the Caddyfile's, guarded by `tools/deploy/caddyfile.test.ts`) or, only where ads run for the
    request host, Google's strict nonce + `'strict-dynamic'` policy in script-src. `/ads.txt`
    serves `ads.adsTxt` (404 while empty). `GET /prywatnosc` renders `docs/privacy.pl.md`
    (`shell/privacy-page.ts`, markdown-lite from `@redakcja/shared`) with the base CSP and no
    script; its ads blocks follow the same per-host ads decision as the shell. Reserved prefixes
    (`/api`, `/ws`, `/health`, `/assets`) and file-like paths 404. Without a client build (dev)
    the shell is off and those paths 404; `/prywatnosc` still works.
  - Header ownership: the server sets CSP, `Referrer-Policy`, COOP and `Cache-Control` on the
    pages it renders; Caddy adds the fixed security headers everywhere and the base CSP only as a
    default (`?`). See `docs/deploy.md` ("Headers and CSP modes").
- REST input is validated with `@hono/zod-validator` and the shared Zod schemas. The app exports
  `type AppType = typeof routes` so the client calls REST through Hono's typed RPC client (`hc`)
  and never hand-writes `fetch` URLs or response types.
- The game itself stays on the WebSocket. Do not move real-time traffic (input, snapshots,
  verdicts) to REST.
- Room broadcasting uses Bun's native pub/sub: `ws.raw.subscribe(topic)` on join, then
  `server.publish(topic, …)`. Each room has three kinds of topic (`roomTopics`, `topicsFor`):
  `room:CODE` for everyone (`roomState`, `gameStarted`), `room:CODE:t0` / `:t1` for one team's
  players (its snapshots, events and `levelEnd`) and `room:CODE:spec` for spectators. A co-op
  room plays as team 0.
- Rooms are in memory; 4-letter codes from an unambiguous alphabet (no `O/0`, `I/1`). A room
  holds members (players and spectators) and one newsroom (`TeamRun`, one sim) per team: one in
  co-op, two in versus, at most `MAX_TEAM_PLAYERS` (4) players each, so `MAX_ROOM_PLAYERS` (8) per
  room, plus up to `MAX_SPECTATORS` (8) spectators. `MAX_PLAYERS` stays the per-sim cap. A
  disconnected member's slot is held for 60 s for reconnection; its token resumes exactly that
  member, with the kind and team it has now.
- Fixed **20 Hz** tick loop per active room: drain queued inputs per team → build one `SimContext`
  → `step` every team in lockstep → publish each team's events and snapshot (`publishTeam`
  encodes once for the team and spectator topics). Empty rooms are destroyed.
- **Versus** (Na punkty, Stage 7): two identical newsrooms on one run, one sim seed and one
  `SimContext`, stepped in lockstep; nothing in the sim or the map knows about teams. Folders,
  minigame seeds, rival results and the embargo are keyed by the folder's `spawnKey`
  (`s<n>` / `e<n>.<wave>`), never by the per-sim `folderId`, so diverged belts still pair up.
  `versusOutcome` (`packages/shared/src/versus.ts`) runs after every step: credibility 0 or a
  forfeit (last player gone while playing, after the reconnect grace for a drop, or nobody at the
  start) loses at once; at the match time (`matchDurationMs`; `VERSUS.endlessDurationS` in
  endless) the higher score wins and equal scores draw. Versus never writes progress or the
  leaderboard. Player joins are refused in the briefing and while playing (`matchInProgress`);
  co-op keeps code joins mid-level. **Client trust:** minigame results stay client-reported; in
  versus only, `SimContext.minSolveMs` (`MINIGAME_MIN_SOLVE_MS`) turns a success faster than an
  honest solve into a failure. The client bundle holds every story's truth (the Kolegium needs
  it); that is accepted for a classroom game (Decision log, S7-93), so never rely on the client
  not knowing an answer — rely on the server's scoring.
- **Spectators** (Widownia, Stage 7): a room member of kind `spectator` joins in any phase while
  the `spectators` flag is on and the host opened the Widownia (`spectatorsAllowed`, off unless a
  spectator created the room), up to 8. Spectators never hold a player gate (ready, briefing,
  votes, pause) and their input is dropped. The spectator topic gets every 2nd snapshot of each
  team (10 Hz), `matchStats` every 20 ticks and every team event as a `spectatorEvent`, published
  only while a spectator is connected; a joining spectator is synced with the current snapshots,
  stats and (at the results) level ends. In versus the server-side embargo
  (`spectator-embargo.ts`) masks a verdict or expiry until both newsrooms closed its `spawnKey`
  or the level ended, and `matchStats` counts only what the Widownia was shown.
- **Lobby administration** (Stage 7, host only, any phase): `setVisibility` (rooms are private;
  public needs the `roomBrowser` flag), `setRoomName` (the shared name filter answers
  `invalidName`), `transferHost` (to a connected member, never self) and `kick` (never self):
  the target gets `error kicked`, leaves for good (its token is dropped) and its socket closes
  with `CLOSE_KICKED` (4002). The room remembers the target's browser `clientId` for
  `KICK_REJOIN_COOLDOWN_MS` (10 min, `limits.ts`) and answers its joins with `kickCooldown`;
  there is no IP ban, because a class shares one address.
- **Run lifecycle** (Stage 7): the lobby holds the selected level as `getLevel` serves it and the
  room's difficulty (host only, lobby only). Every briefing, replays included, deals the run with
  `prepareRun` from a fresh **run seed** (never sent to clients) and the room's difficulty;
  `roomState.run` carries its `runSummary`. The level start draws the sim seed separately, each
  tick passes `simTuning(difficulty)`, and `levelEnd` reports the difficulty plus the run's stars
  and `maxScore`. Back in the lobby the run is dropped.
- **Server config** (Stage 7): env (`env.ts`) holds process settings only (port, database path,
  file paths) plus the `ADS_ENABLED` kill switch. Product settings live in `config/config.json`
  (`config.ts`, strict Zod schema, `config/config.schema.json` generated by `bun run
  config:schema`). A `ConfigStore` reloads it on file changes and `SIGHUP`; an invalid file is
  refused (exit 1 at start, old config kept at reload). The registry reads
  `RegistryOptions.settings()` (`maxRooms`, `defaultDifficulty`, feature flags) at every room
  creation, so running rooms are never changed by a reload. Never read `config.json` elsewhere.
  Precedence: a setting is env or `config.json`, never both; the one overlap, `ADS_ENABLED`, is
  written into the raw JSON before validation, so it wins but cannot bypass a rule (`ads.signOff`).
  Every key, its default and when it applies: `docs/deploy.md` ("Configuration"); a docs test
  (`tools/deploy/deploy-docs.test.ts`) fails when a key is added without a row there.
- **Client address**: the server reads only `X-Real-IP` (set by Caddy from `trusted_proxies`),
  else the socket address (`client-address.ts`); never `X-Forwarded-For`.
- Every incoming message is parsed with the Zod schema from `shared/protocol`; invalid messages are
  dropped and logged, never crash the room.
- Exposed only behind Caddy on port 443 (every path except the static build output: `/ws`,
  `/api`, `/health`, the HTML shell, `/ads.txt`, `/prywatnosc`); never on a public custom port.

Suggested layout:

```
apps/server/src/
  index.ts        Bun.serve bootstrap (reads env and config.json, runs migrations, starts server)
  config.ts       config.json schema and the hot-reloading ConfigStore; paths.ts holds defaults
  public-config.ts  per-host public config (ads decision, MOTD window), room settings
  app.ts          Hono app, mounts routes, exports AppType
  routes/         health.ts, ws.ts, api/*.ts, shell.ts (mounted last)
  shell/          HTML shell render, CSP modes, privacy page
  rooms/          room registry, codes, join/leave, reconnect
  loop.ts         20 Hz tick loop
  db/             client.ts, schema.ts, queries/*.ts
apps/server/drizzle/   generated SQL migrations (committed)
```

## Persistence (`apps/server/src/db`)

- **SQLite via [Drizzle ORM](https://orm.drizzle.team)** using Bun's built-in driver
  (`drizzle-orm/bun-sqlite` + `bun:sqlite`). No external database server.
- Live game state is **never** stored in the DB. Rooms, players and the simulation stay in
  memory. The DB holds only data that must outlive a room: the endless-mode leaderboard, the
  debrief "blunder of the day" vote tallies, and later anything the plan adds (e.g. per-class
  results).
- The schema is defined in TypeScript in `db/schema.ts` and is the single source of truth. Row
  types come from `$inferSelect` / `$inferInsert`, and Zod schemas for API payloads may be derived
  with `drizzle-zod` (via `createInsertSchema` / `createSelectSchema`).
- Migrations are generated with `drizzle-kit generate` into `apps/server/drizzle/` and committed.
  They are applied on server start with `migrate()` from `drizzle-orm/bun-sqlite/migrator`. Never
  edit a migration that has already landed on `main`; add a new one. Never use `drizzle-kit push`
  against a real database.
- The DB file path comes from `DATABASE_PATH` (default `./data/redakcja.sqlite`). Enable WAL mode
  on open.
- DB access lives only in `apps/server/src/db/queries/*`. Routes and the game loop call these
  functions, never query builders inline. The simulation in `packages/shared` never touches the
  DB.
- **Privacy**: no accounts, no personal data. Store only the nickname the player typed, room code
  and game results. Nothing that identifies a student (no IP, user agent, email). Leaderboard
  entries expire (retention set in `constants.ts`).
- **Ads are the one third party** (Stage 7, off by default): Google AdSense only on hosts in
  `ads.domains`, only on ad screens, never in play or on phones, and only limited ads (no cookies
  or storage) while the audience may be under 18 (`adModeAllowed`). No other external script,
  font or analytics. `docs/privacy.pl.md` must describe what the game does; its `ads` blocks
  switch with the host's ads decision.
- **The public config is its own schema** (`publicConfigSchema` in `@redakcja/shared`), derived
  field by field per request host (`apps/server/src/public-config.ts`), never a pick of the
  server config: sign-off, ads.txt lines, CSP extras and ad domains never reach a client.

## Protocol (`packages/shared/src/protocol.ts`)

- Discriminated unions on `type`, one Zod schema per message, `ClientMessage` and `ServerMessage`
  unions. Types are inferred.
- Client → server: `join` (with `as` player or spectator, `clientId`, `look`), `lobby` (room and
  host actions), `input` (with sequence number), `command` (minigame result, verdict, cancel,
  ping, ability) and `heartbeat`. Server → client: `welcome`, `roomState`, `snapshot`, `event`,
  `levelEnd`, `error`, `heartbeatAck`, and for spectators only `spectatorEvent` and `matchStats`.
- Which topic carries what is part of the contract (see Server above): a player never receives
  the other team's snapshots or events, the spectator topic or `matchStats`; in versus a spectator
  never receives a raw `verdictResult`, only `verdictMasked` and, once both newsrooms closed the
  key, `verdictRevealed` (`spectator-embargo.ts`). A new message
  that reveals a verdict, outcome, reason or points must go through the embargo, and a new
  per-team message through `publishTeam`.
- JSON on the wire at first. Keep messages small (no full content in snapshots — send story ids;
  the client already has content bundled). Switching to msgpack must not change types.
- Bump `PROTOCOL_VERSION` in `constants.ts` on breaking changes; the server rejects mismatches.
  It is 8 after Stage 7. Bump at most once per deploy unit (milestone) that changes the
  WebSocket wire; REST, HTML and config changes never bump it (ledger:
  [`docs/design/stage7/protocol.md`](../docs/design/stage7/protocol.md)). „O grze” shows the
  number next to the build version.

## Netcode (client)

- Local player: client-side prediction using the shared movement code, reconciled against the
  last acknowledged input sequence in each snapshot.
- Other players and folders: interpolation between snapshots with ~100 ms delay.
- Target: playable at up to ~150 ms ping.

## World

- The newsroom is a tile grid; collisions are axis-aligned rectangles against tiles and stations.
  No physics engine.
- Stations, conveyor and editorial desk positions come from level/layout data, not hard-coded in
  components.

## Rendering and performance budget

- Low-poly 3D at an angled top-down camera; UI is 2D DOM layered on top.
- Camera framing is pure math in `scene/camera-framing.ts` (tested in bun): fit the room, or
  follow the local player on small screens under the measured HUD band (`hud/hud-band.ts`) with
  `setViewOffset`. Anything projected to the screen uses `camera.project`, so it follows the offset.
- Budget: **60 FPS on Intel UHD 620** (Chrome, Edge, Firefox) and on mid-range phones (never
  below 30 FPS), ≤ 100k triangles, ~150 draw calls on desktop / ~100 on mobile, repeated
  furniture via instancing, ≤ 10 MB initial download with a progress bar for assets.
- Server: one tick of every room must stay under half the 50 ms tick; `bun run perf:server`
  measures 150 full versus rooms with spectators (`docs/performance.md`). Egress, not CPU, is what
  limits the rooms one server can hold.
- Quality presets (`low` / `medium` / `high`) control shadows, DPR (capped ≤ 1.5 on phones),
  particle cap and ambient effects; adaptive quality steps down when frame time rises. Details in
  [`platforms.md`](platforms.md).
- Particles, tweens, camera shake and audio live in `apps/client/src/fx/` and are triggered only
  through feedback cues; they never touch the simulation. See [`game-feel.md`](game-feel.md).
- **GameView** (`net/game-view.ts`, S7-85): everything one rendered newsroom reads and writes —
  runtime (map, players), game store, event store, ping bubbles, guidance, render state, particle
  pool, camera shake, feedback and its gameplay-event listeners. Scene files (`scene/`, the
  ability markers) get it with `useGameView()` / `useViewGame()` (`net/view-context.tsx`) and
  never import `runtime`, `renderState`, `feedback`/`emitCue` or a module-level store from
  `net/`, `events/`, `pings/` or `guidance/` (checked in `net/game-view.test.ts`). Without a
  provider the view is the local player's `playerView` (`net/session.ts`), built from those
  module-level stores, so the HUD and play need no setup. Separate React roots do not inherit
  context: `useOverlay` and `ViewHtml` (drei `Html`) re-provide the view, and every `<Canvas>`
  renders its own `GameViewProvider`. `GameCanvas({ view, primary, viewKey })`: only the primary
  canvas detects the preset, adapts quality and installs the debug hooks; each canvas reports its
  renderer counters under `perfStats.views[viewKey]` and the overlay shows the sum; with `?debug`,
  `window.__perf` (the counters) and `window.__scenes[viewKey]` (each canvas's scene) let the
  perf e2e check every canvas (S7-92). A spectator
  view (`createWatchView`; the spectate store holds one per team) samples
  `SPECTATOR_INTERPOLATION_DELAY_MS` (250 ms) behind and has guidance off; a cue with `silent`
  keeps everything but its sound and loops. The intro's view (`kind: 'intro'`,
  `intro/intro-view.ts`, S7-101) runs the shared `step` locally on a mini layout
  (`intro/intro-sim.ts`) at the scene time its player reads, with its own `roster` (the scripted
  reporter) and `levelId` (the training theme); scene files read players with
  `useViewRoster()` / `viewRoster(view)` and the theme with `viewLevelId(view)`, which fall back
  to the room. Nothing connects audio, haptics or captions to a view's feedback but the player's,
  so the intro's cues are particles and animation only. „In-engine” means exactly this: rendered
  live by the game's own sim and renderer, never a video file.
- Models are glTF (`.glb`), optimised with gltf-transform, stored in `apps/client/public/assets/`.
  Base assets from Kenney (CC0) or self-made; record the source and licence of every asset in
  `apps/client/public/assets/CREDITS.md`.

## Accessibility (applies from the first UI task)

- Folder type is recognisable by **icon and colour**, never colour alone; colour-blind safe palette.
- Text scaling setting; a no-flashing mode that disables blinking alarms and screen shake.
- All controls work with keyboard (WASD/arrows, E, Space, Q), gamepad and touch (virtual
  joystick + action buttons). See [`platforms.md`](platforms.md).
- Reduced-motion setting (no shake, no squash, fewer particles) and visual equivalents for every
  informative sound.

## Deployment

- Docker Compose: Caddy (static client + reverse proxy to `/ws` and `/api`, automatic TLS) and the
  Bun server. The SQLite file lives on a named volume mounted at `/data`
  (`DATABASE_PATH=/data/redakcja.sqlite`); back it up by copying the file (or `VACUUM INTO`).
- CI: GitHub Actions (`.github/workflows/ci.yml`) runs install, lint, typecheck, test, content
  validation and build on every push to `main`. (The design doc mentions Forgejo Actions; the
  workflow syntax is compatible if the repo moves.)
