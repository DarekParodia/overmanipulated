# Architecture

Summary of the technical design from the design document, plus the invariants agents must keep.

```
Browser (React + R3F)  ──wss:443──▶  Caddy  ──▶  Bun game server (rooms, 20 Hz loop)
        │                              │                     │
        └──── @redakcja/shared ◀───────┴─────────────────────┘
              (sim, protocol, constants)      @redakcja/content (schemas, levels, stories)
```

## Packages

| Package | Responsibility | May depend on |
| --- | --- | --- |
| `packages/shared` | Pure game simulation, network protocol schemas, balance constants | `zod` |
| `packages/content` | Content schemas, level/story JSON, loaders, validator | `zod`, `shared` (types only) |
| `apps/server` | Rooms, sockets, tick loop, applying inputs to sim, broadcasting snapshots | `shared`, `content` |
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

- `Bun.serve` with native WebSocket; one pub/sub topic per room.
- Rooms are in memory; 4-letter codes from an unambiguous alphabet (no `O/0`, `I/1`).
  Max 4 players. A disconnected player's slot is held for 60 s for reconnection.
- Fixed **20 Hz** tick loop per active room: drain queued inputs → `step` → broadcast snapshot and
  events. Empty rooms are destroyed.
- Every incoming message is parsed with the Zod schema from `shared/protocol`; invalid messages are
  dropped and logged, never crash the room.
- No accounts, no personal data: only a nickname. Nothing is persisted except an optional
  leaderboard (`bun:sqlite`) in endless mode.
- Exposed only behind Caddy on port 443 (`/ws` path); never on a public custom port.

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
- Budget: **60 FPS on Intel UHD 620** (Chrome, Edge, Firefox), ≤ 100k triangles, ~150 draw calls,
  repeated furniture via instancing, ≤ 10 MB initial download with a progress bar for assets.
- Quality setting toggles shadows and render resolution.
- Models are glTF (`.glb`), optimised with gltf-transform, stored in `apps/client/public/assets/`.
  Base assets from Kenney (CC0) or self-made; record the source and licence of every asset in
  `apps/client/public/assets/CREDITS.md`.

## Accessibility (applies from the first UI task)

- Folder type is recognisable by **icon and colour**, never colour alone; colour-blind safe palette.
- Text scaling setting; a no-flashing mode that disables blinking alarms and screen shake.
- All controls work with keyboard (WASD/arrows, E, Space, Q) and gamepad.

## Deployment

- Docker Compose: Caddy (static client + reverse proxy to `/ws`, automatic TLS) and the Bun server.
- CI: GitHub Actions (`.github/workflows/ci.yml`) runs install, lint, typecheck, test, content
  validation and build on every push to `main`. (The design doc mentions Forgejo Actions; the
  workflow syntax is compatible if the repo moves.)
