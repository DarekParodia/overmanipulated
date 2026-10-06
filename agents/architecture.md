# Architecture

Summary of the technical design from the design document, plus the invariants agents must keep.

```
Browser (React + R3F)  ──https/wss:443──▶  Caddy  ──▶  Bun server: Hono (/ws, /api) + rooms + 20 Hz loop
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
  three.js. Time is passed in as `dtMs`; randomness comes from a seeded RNG passed in.
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
  - `/api/*`: REST endpoints (leaderboard, content preview for the supervisor, room stats).
- REST input is validated with `@hono/zod-validator` and the shared Zod schemas. The app exports
  `type AppType = typeof routes` so the client calls REST through Hono's typed RPC client (`hc`)
  and never hand-writes `fetch` URLs or response types.
- The game itself stays on the WebSocket. Do not move real-time traffic (input, snapshots,
  verdicts) to REST.
- Room broadcasting uses Bun's native pub/sub: `ws.raw.subscribe(roomTopic)` on join, then
  `server.publish(roomTopic, …)`. One topic per room.
- Rooms are in memory; 4-letter codes from an unambiguous alphabet (no `O/0`, `I/1`).
  Max 4 players. A disconnected player's slot is held for 60 s for reconnection.
- Fixed **20 Hz** tick loop per active room: drain queued inputs → `step` → broadcast snapshot and
  events. Empty rooms are destroyed.
- Every incoming message is parsed with the Zod schema from `shared/protocol`; invalid messages are
  dropped and logged, never crash the room.
- Exposed only behind Caddy on port 443 (`/ws` and `/api` paths); never on a public custom port.

Suggested layout:

```
apps/server/src/
  index.ts        Bun.serve bootstrap (reads env, runs migrations, starts server)
  app.ts          Hono app, mounts routes, exports AppType
  routes/         health.ts, ws.ts, api/*.ts
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

## Protocol (`packages/shared/src/protocol.ts`)

- Discriminated unions on `type`, one Zod schema per message, `ClientMessage` and `ServerMessage`
  unions. Types are inferred.
- Client → server: `join`, `lobby`, `input` (with sequence number), `verdict`, and station
  interaction messages as needed. Server → client: `snapshot`, `event`, `levelEnd`, plus
  lobby/room state and errors.
- JSON on the wire at first. Keep messages small (no full content in snapshots — send story ids;
  the client already has content bundled). Switching to msgpack must not change types.
- Bump `PROTOCOL_VERSION` in `constants.ts` on breaking changes; the server rejects mismatches.

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
- Budget: **60 FPS on Intel UHD 620** (Chrome, Edge, Firefox) and on mid-range phones (never
  below 30 FPS), ≤ 100k triangles, ~150 draw calls on desktop / ~100 on mobile, repeated
  furniture via instancing, ≤ 10 MB initial download with a progress bar for assets.
- Quality presets (`low` / `medium` / `high`) control shadows, DPR (capped ≤ 1.5 on phones),
  particle cap and ambient effects; adaptive quality steps down when frame time rises. Details in
  [`platforms.md`](platforms.md).
- Particles, tweens, camera shake and audio live in `apps/client/src/fx/` and are triggered only
  through feedback cues; they never touch the simulation. See [`game-feel.md`](game-feel.md).
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
