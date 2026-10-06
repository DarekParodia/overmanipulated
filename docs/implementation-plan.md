# Implementation plan

Staged plan derived from [`design-document.pl.md`](design-document.pl.md). Each stage ends with a
**playable, deployable build** — if time runs out, we ship the last finished stage with fewer
levels rather than an unfinished whole.

How to use this file: see [`../agents/workflow.md`](../agents/workflow.md).
Status markers: `[ ]` todo · `[~]` in progress (claimed) · `[x]` done.

Task format: **ID — title** · *Depends on* · *Scope* · *Done when*.
Tasks within a stage can run in parallel once their dependencies are done.

---

## Stage 0 — Project init

Goal: empty but fully wired monorepo, agent rules, CI.

- [x] **S0-01 — Monorepo and tooling.** Bun workspaces (`apps/*`, `packages/*`), strict
  `tsconfig.base.json`, Biome, `.editorconfig`, placeholder packages `client`, `server`, `shared`,
  `content`, lockfile.
- [x] **S0-02 — CI.** GitHub Actions: install (frozen lockfile), lint, typecheck, test, content
  validation, client build.
- [x] **S0-03 — Agent docs.** `AGENTS.md`, `agents/*`, glossary, this plan.

---

## Stage 1 — Foundation

Goal: 2–4 players open a deployed URL, join a room by a 4-letter code and see each other move
around a grey newsroom in sync.

- [ ] **S1-01 — Constants and protocol skeleton.**
  *Depends on:* —
  *Scope:* `shared/src/constants.ts` (`TICK_RATE_HZ = 20`, `PROTOCOL_VERSION`, `MAX_PLAYERS = 4`,
  `ROOM_CODE_LENGTH = 4`, `RECONNECT_GRACE_MS = 60_000`, movement speed);
  `shared/src/protocol.ts` with Zod schemas for `join`, `lobby`, `input`, `snapshot`, `event`,
  `roomState`, `error`; `ClientMessage`/`ServerMessage` unions; `parseClientMessage` /
  `parseServerMessage` helpers.
  *Done when:* types inferred from schemas, each schema has accept/reject tests.

- [ ] **S1-02 — Tile map and movement sim.**
  *Depends on:* S1-01
  *Scope:* `sim/map.ts` (tile grid, solid tiles, a hard-coded greybox newsroom layout as data),
  `sim/movement.ts` (apply input vector × speed × dt, AABB vs tile collision with sliding),
  `sim/state.ts` (`GameState`, `PlayerState`), `sim/step.ts`, seeded RNG utility.
  *Done when:* deterministic unit tests for movement, wall sliding, diagonal normalisation,
  player–player non-blocking (or blocking — record decision).

- [ ] **S1-03 — Server: rooms and sockets.**
  *Depends on:* S1-01
  *Scope:* `Bun.serve` with `/health` and `/ws` upgrade; room registry with unambiguous 4-letter
  codes; create/join/leave; nickname validation; max 4 players; host assignment and hand-over;
  60 s reconnect slot via a reconnect token; pub/sub topic per room; invalid messages dropped and
  logged; `PROTOCOL_VERSION` check.
  *Done when:* in-process tests cover create, join, full room, unknown code, reconnect within and
  after grace period, empty-room cleanup.

- [ ] **S1-04 — Server: tick loop.**
  *Depends on:* S1-02, S1-03
  *Scope:* `loop.ts` fixed 20 Hz per active room; input queue per player (latest + sequence);
  `step`; broadcast `snapshot` with tick, positions, last processed input seq per player.
  *Done when:* test drives a room for N ticks with scripted inputs and checks positions; loop stops
  when the room is empty.

- [ ] **S1-05 — Client shell, store and screens (minimal).**
  *Depends on:* S1-01
  *Scope:* React app root, screen router in Zustand (`mainMenu`, `lobby`, `game`), strings module
  `src/strings/pl.ts`, main menu (Graj / Dołącz kodem), nickname entry, lobby list of players with
  room code, newspaper-style base CSS tokens.
  *Done when:* can create/join a room against the dev server and see the player list update.

- [ ] **S1-06 — Network client.**
  *Depends on:* S1-01, S1-05
  *Scope:* `net/connection.ts` (connect via same-origin `/ws`, reconnect with token, message
  validation), snapshot buffer, connection status UI.
  *Done when:* unit tests for snapshot buffer; reconnect after a dropped socket works manually.

- [ ] **S1-07 — Greybox scene.**
  *Depends on:* S1-02, S1-05
  *Scope:* R3F `Canvas`, angled top-down camera, tile floor and walls from the shared map data
  (instanced boxes), player capsules coloured per player with nickname labels, quality setting
  stub (shadows on/off, DPR).
  *Done when:* scene renders the shared layout; draw calls < 50 in the greybox.

- [ ] **S1-08 — Input.**
  *Depends on:* S1-05
  *Scope:* `input/` keyboard (WASD/arrows, E, Space hold, Q) and Gamepad API mapping into one
  `InputState`; sent to server at tick rate with sequence numbers.
  *Done when:* pure mapping functions tested; gamepad works in Chrome manually.

- [ ] **S1-09 — Prediction and interpolation.**
  *Depends on:* S1-04, S1-06, S1-07, S1-08
  *Scope:* local player predicted with shared movement code, reconciled on snapshot (replay
  unacknowledged inputs); remote players interpolated ~100 ms behind.
  *Done when:* smooth movement with 150 ms artificial latency (dev latency flag on the server);
  interpolation helpers tested.

- [ ] **S1-10 — Deployment.**
  *Depends on:* S1-03
  *Scope:* `Dockerfile` for the server (Bun image), client static build served by Caddy,
  `Caddyfile` (TLS, static files, `/ws` reverse proxy), `docker-compose.yml`, `.env.example`,
  deploy notes in `docs/deploy.md`; CI job building the image.
  *Done when:* `docker compose up` locally serves the game on https and WebSockets work through
  Caddy on 443.

- [ ] **S1-11 — Multiplayer e2e test.**
  *Depends on:* S1-09
  *Scope:* Playwright config, test opening 2–3 browser contexts: create room, join by code, move
  one player, assert others see the move; CI job.
  *Done when:* e2e passes in CI.

**Stage 1 exit:** deployed URL, 4 players move in sync, CI green including e2e.

---

## Stage 2 — Core gameplay (greybox)

Goal: one full level loop on grey boxes: folders arrive, players verify at 3 stations, decide at
the desk, score and credibility update, level ends with stars.

- [ ] **S2-01 — Content schemas.**
  *Depends on:* S1-01
  *Scope:* `content/src/schema.ts` — `Story`, `Stamp`, `Level` (duration, stations available,
  spawn schedule, star thresholds, events), truth→verdict rule, `validate.ts` with referential
  checks (see [`../agents/content-authoring.md`](../agents/content-authoring.md)); 5 test stories
  covering all truth values.
  *Done when:* `bun run validate:content` validates real files and fails on broken fixtures.

- [ ] **S2-02 — Folders: spawn, carry, deadlines.**
  *Depends on:* S1-04, S2-01
  *Scope:* sim entities for folders; conveyor spawning from the level schedule; pick up / put down
  (E) on floor, surfaces, stations, desk; one folder per player; deadline countdown and expiry.
  *Done when:* unit tests for pickup rules, spawn timing, expiry; folders render as coloured boxes
  with type icons.

- [ ] **S2-03 — Station framework.**
  *Depends on:* S2-02
  *Scope:* station occupancy, hold-Space work with progress, per-station duration (3–8 s) from
  constants, role speed bonus, stamp written to folder from story data, protocol messages for
  starting a station and submitting a minigame result (record in Decision log as an extension of
  the design-doc protocol); generic 2D `StationOverlay` (half screen, scene still alive).
  *Done when:* a folder carried to a station and worked on gets the correct stamp; role bonus
  tested.

- [ ] **S2-04 — Minigame: Image search (`imageSearch`).**
  *Depends on:* S2-03
  *Scope:* match image fragments to search results; success → stamp, failure → time lost.
  *Done when:* playable in the overlay with keyboard and gamepad.

- [ ] **S2-05 — Minigame: Archive (`archive`).**
  *Depends on:* S2-03
  *Scope:* scroll a timeline and stop on the right date.
  *Done when:* playable with keyboard and gamepad.

- [ ] **S2-06 — Minigame: Source registry (`sourceRegistry`).**
  *Depends on:* S2-03
  *Scope:* compare a profile against warning signs (account age, verification, name mismatch).
  *Done when:* playable with keyboard and gamepad.

- [ ] **S2-07 — Editorial desk and verdicts.**
  *Depends on:* S2-03
  *Scope:* desk overlay showing the folder and its stamps; three verdict buttons; must pick a
  justifying stamp; server evaluates verdict + justification; result event with what was missed.
  *Done when:* tests for every truth × priority × verdict combination, including "wrong
  justification" handling (record rule in Decision log).

- [ ] **S2-08 — Scoring, credibility, stars, level end.**
  *Depends on:* S2-07
  *Scope:* the full scoring table from the design doc (incl. speed bonus, expiry, unverifiable
  rules), credibility from 100 with loss at 0, level timer, star thresholds, `levelEnd` message.
  *Done when:* each row of the scoring table has a unit test; level ends correctly on time-out and
  on credibility 0.

- [ ] **S2-09 — HUD.**
  *Depends on:* S2-02, S2-08
  *Scope:* top queue of folders with timers and priority, credibility meter, score, level timer,
  instant verdict feedback toast.
  *Done when:* readable at 1366×768; type distinguishable by icon, not only colour.

- [ ] **S2-10 — Lobby: roles, ready, level select.**
  *Depends on:* S1-05
  *Scope:* role selection (non-exclusive or exclusive — record decision), character colour, ready
  toggle, host picks level, start game; 3-player rule for managing editor.
  *Done when:* all players ready + host start → everyone enters the same level.

- [ ] **S2-11 — Pings (Q).**
  *Depends on:* S1-09
  *Scope:* quick signals ("Potrzebuję Archiwum!", "Fałszywka!", "Biorę to") shown above players.
  *Done when:* pings broadcast and display for ~2 s.

**Stage 2 exit:** greybox level with 5+ test stories played start to finish by 3–4 people.

---

## Stage 3 — Level 1 complete

Goal: a polished vertical slice ready for the first playtest with students.

- [ ] **S3-01 — Level 1 content.** 15 stories for "Pierwszy dzień — Burza nad miastem"
  (old photo as new, fake institutional account), including the design-doc examples; images
  CC0/self-made with credits; `reviewed: false` until the supervisor signs off.
- [ ] **S3-02 — Debrief screen (Kolegium).** List of the level's stories with what it was,
  technique, tool, real-world analogue; player's verdicts vs correct; blunder-of-the-day vote;
  stars.
- [ ] **S3-03 — Briefing screen.** 15–20 s topic of the day + new mechanics, skippable when all
  ready.
- [ ] **S3-04 — Level select / campaign map (minimal).** Levels with stars, locked/unlocked;
  progress stored per browser (localStorage, no accounts).
- [ ] **S3-05 — First assets.** Kenney CC0 newsroom furniture and characters with role
  accessories, folder models per type; `CREDITS.md`; stay within performance budget.
- [ ] **S3-06 — Basic audio.** Howler: new-folder bell, stamp thud, low-time alarm, ambient
  newsroom; autoplay unlock; volume setting.
- [ ] **S3-07 — Playtest kit.** `docs/playtests/` with a session script, observation sheet and a
  short student questionnaire; log results as new tasks/balance notes.

**Stage 3 exit:** Level 1 playable end to end with debrief; first playtest held.

---

## Stage 4 — Remaining stations, events and levels

- [ ] **S4-01 — Phone (`phone`).** Choose the right number, then a waiting queue; reporter skips
  the queue.
- [ ] **S4-02 — AI scanner (`aiScanner`).** Probability readout with error margin; never decisive
  alone (enforced by content validation).
- [ ] **S4-03 — Data library (`dataLibrary`).** Compare a number with the original table.
- [ ] **S4-04 — Managing editor ability.** Extend one folder's deadline once per level.
- [ ] **S4-05 — Event framework + `viral`.** Event scheduling from level data; growing share
  counter on a folder.
- [ ] **S4-06 — `bossCall`.** Editor-in-chief demands instant publish; points only if true.
- [ ] **S4-07 — `botRaid`.** Wave of near-identical folders; recognising one resolves all.
- [ ] **S4-08 — `outage`.** A station is down for 20 s.
- [ ] **S4-09 — `correction`.** A previously published story turns out manipulated; first team
  member to file a correction recovers half the lost credibility.
- [ ] **S4-10 — Levels 2–6 content.** ~15 stories each, following the campaign table; one task per
  level (`S4-10a` … `S4-10e`) so content can be written in parallel.
- [ ] **S4-11 — Endless mode.** Random stories from all levels, speeds up every minute; room
  leaderboard (optional `bun:sqlite`).

**Stage 4 exit:** full campaign (6 levels) and endless mode playable.

---

## Stage 5 — Presentation

- [ ] **S5-01 — Final models and newsroom art pass** (low-poly, paper/wood palette, editorial red).
- [ ] **S5-02 — Character animations** (walk, carry, work, stamp).
- [ ] **S5-03 — Newspaper UI theme** (serif headings, sans body, stamps as the main visual motif).
- [ ] **S5-04 — Technique encyclopedia** with unlockable cards and in-game examples.
- [ ] **S5-05 — Accessibility** (colour-blind safe palette audit, text scaling, no-flash mode,
  full gamepad navigation in menus).
- [ ] **S5-06 — Settings screen** (quality, volume, accessibility, controls help).
- [ ] **S5-07 — Loading and performance** (asset progress bar, ≤10 MB first load, 60 FPS on
  UHD 620 verified, instancing audit).
- [ ] **S5-08 — Full audio pass** (music, all SFX).

---

## Stage 6 — Balance and contest materials

- [ ] **S6-01 — Balance** station times, deadlines, points and star thresholds from playtest data.
- [ ] **S6-02 — Content review** — supervisor signs off all stories (`reviewed: true`).
- [ ] **S6-03 — Contest materials** in `docs/contest/`: screenshots of every screen, labelled
  newsroom map, role cards, 3–4 sample folders with stamps, 60–90 s gameplay video, criteria
  mapping.
- [ ] **S6-04 — Production deploy and smoke test** on a school-like network (port 443 only).

---

## Backlog (not scheduled)

- Solo / 2-player mode with a helper bot (if the jury needs to play alone).
- Voice chat for remote play (or rely on Discord).
- msgpack wire format if bandwidth becomes an issue.
- Level layout editor in `tools/level-editor`.
- Forgejo mirror / migration of CI.

---

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-06 | CI on GitHub Actions instead of Forgejo Actions | Repository is hosted on GitHub; workflow syntax is portable |
| 2026-10-06 | All repo text in English; only player-facing content in Polish | Team decision; glossary maps design terms |
| 2026-10-06 | Commits go directly to `main` | Small team; CI and `bun run check` guard quality |
| 2026-10-06 | Package sources under `src/` (`packages/shared/src/sim`, …) | Uniform layout across packages; minor deviation from the design-doc tree |

---

## Open questions

Copied from the design doc; answers change scope and scheduling.

- [ ] Submission deadline? (Determines how many stages realistically fit.)
- [ ] Team size and who owns 3D art vs. content?
- [ ] Is there a subject-matter supervisor to review stories, and when are they available?
- [ ] Must it run on a school network? (Assumed yes: everything over 443.)
- [ ] Same room (talking live) or remote play? Remote → voice chat or Discord?
- [ ] Will the jury play alone? If yes, a 1–2 player mode with a helper bot moves out of backlog.
- [ ] Hosting target (VPS provider, domain) for S1-10.
