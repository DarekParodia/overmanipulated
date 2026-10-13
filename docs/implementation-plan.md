# Implementation plan

Staged plan derived from [`design-document.pl.md`](design-document.pl.md). Each stage ends with a
**playable, deployable build** — if time runs out, we ship the last finished stage with fewer
levels rather than an unfinished whole.

How to use this file: see [`../agents/workflow.md`](../agents/workflow.md).
Status markers: `[ ]` todo · `[~]` in progress (claimed) · `[x]` done.

Task format: **ID — title** · *Depends on* · *Scope* · *Done when*.
Tasks within a stage can run in parallel once their dependencies are done.

### Cross-cutting requirements (apply to every stage)

- **Desktop and mobile are both first-class.** Every gameplay feature, minigame and screen must
  work with keyboard, gamepad **and touch**, on desktop (≥ 1280×720) and on phones/tablets in
  landscape (≥ 640×360 CSS px). See [`../agents/platforms.md`](../agents/platforms.md).
- **Game feel ships with the feature, not later.** A task that adds a game action also adds its
  animation, sound and particle/visual feedback (placeholder assets are fine) and registers it in
  the feedback catalogue. See [`../agents/game-feel.md`](../agents/game-feel.md).
- Reduced-motion / no-flash and mute settings are respected by every effect.
- **It must not look generated.** Every visual, icon, 3D asset and UI string follows
  [`../agents/design-rules.md`](../agents/design-rules.md) and passes its review checklist.

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

Goal: 2–4 players on desktop **or phone** open the game, join a room by a 4-letter code and see
each other move around a grey newsroom in sync — already with basic animation, sound and particle
feedback.

- [x] **S1-01 — Constants and protocol skeleton.**
  *Depends on:* —
  *Scope:* `shared/src/constants.ts` (`TICK_RATE_HZ = 20`, `PROTOCOL_VERSION`, `MAX_PLAYERS = 4`,
  `ROOM_CODE_LENGTH = 4`, `RECONNECT_GRACE_MS = 60_000`, movement speed);
  `shared/src/protocol.ts` with Zod schemas for `join`, `lobby`, `input`, `snapshot`, `event`,
  `roomState`, `error`; `ClientMessage`/`ServerMessage` unions; `parseClientMessage` /
  `parseServerMessage` helpers.
  *Done when:* types inferred from schemas, each schema has accept/reject tests.

- [x] **S1-02 — Tile map and movement sim.**
  *Depends on:* S1-01
  *Scope:* `sim/map.ts` (tile grid, solid tiles, a hard-coded greybox newsroom layout as data),
  `sim/movement.ts` (apply input vector × speed × dt, AABB vs tile collision with sliding),
  `sim/state.ts` (`GameState`, `PlayerState`), `sim/step.ts`, seeded RNG utility.
  *Done when:* deterministic unit tests for movement, wall sliding, diagonal normalisation,
  player–player non-blocking (or blocking — record decision).

- [x] **S1-03 — Server: rooms and sockets.**
  *Depends on:* S1-01
  *Scope:* Hono app on `Bun.serve` (`hono/bun` `upgradeWebSocket` + `websocket`), `GET /health`,
  `GET /ws` upgrade, `app.ts` exporting `AppType`; room registry with unambiguous 4-letter
  codes; create/join/leave; nickname validation; max 4 players; host assignment and hand-over;
  60 s reconnect slot via a reconnect token; pub/sub topic per room; invalid messages dropped and
  logged; `PROTOCOL_VERSION` check.
  *Done when:* in-process tests cover create, join, full room, unknown code, reconnect within and
  after grace period, empty-room cleanup; `/health` tested with `app.request()`.

- [x] **S1-04 — Server: tick loop.**
  *Depends on:* S1-02, S1-03
  *Scope:* `loop.ts` fixed 20 Hz per active room; input queue per player (latest + sequence);
  `step`; broadcast `snapshot` with tick, positions, last processed input seq per player.
  *Done when:* test drives a room for N ticks with scripted inputs and checks positions; loop stops
  when the room is empty.

- [x] **S1-05 — Client shell, store and screens (minimal).**
  *Depends on:* S1-01
  *Scope:* React app root, screen router in Zustand (`mainMenu`, `lobby`, `game`), strings module
  `src/strings/pl.ts`, main menu (Graj / Dołącz kodem), nickname entry, lobby list of players with
  room code, built on the S1-17 tokens and type (main menu as a newspaper front page, lobby as a
  cork-board roster — see design rules §1); responsive layout (portrait and landscape menus,
  safe-area insets, touch-sized hit targets ≥ 44 px); animated screen transitions.
  *Done when:* can create/join a room against the dev server and see the player list update, on a
  desktop browser and on a phone-sized viewport.

- [x] **S1-06 — Network client.**
  *Depends on:* S1-01, S1-05
  *Scope:* `net/connection.ts` (connect via same-origin `/ws`, reconnect with token, message
  validation), snapshot buffer, connection status UI.
  *Done when:* unit tests for snapshot buffer; reconnect after a dropped socket works manually.

- [x] **S1-07 — Greybox scene.**
  *Depends on:* S1-02, S1-05
  *Scope:* R3F `Canvas`, angled top-down camera, tile floor and walls from the shared map data
  (instanced boxes), player capsules coloured per player with nickname labels, quality setting
  stub (shadows on/off, DPR).
  *Done when:* scene renders the shared layout; draw calls < 50 in the greybox.

- [~] **S1-08 — Input (keyboard, gamepad, touch).**
  *Depends on:* S1-05
  *Scope:* `input/` keyboard (WASD/arrows, E, Space hold, Q), Gamepad API and **touch controls**
  (floating virtual joystick on the left half, action buttons Podnieś / Pracuj (hold) / Sygnał on
  the right, sized for thumbs, semi-transparent) mapped into one `InputState`; active input device
  auto-detected from the last used device, on-screen prompts switch accordingly (key caps / pad
  buttons / touch icons); sent to server at tick rate with sequence numbers.
  *Done when:* pure mapping functions tested (incl. joystick dead zone and normalisation); gamepad
  works in Chrome; touch controls work on a real Android phone and iOS Safari.
  *Status:* implemented and verified in mobile emulation; **real-device check pending (needs a
  human with an Android phone, an iPhone and a gamepad).**

- [x] **S1-09 — Prediction and interpolation.**
  *Depends on:* S1-04, S1-06, S1-07, S1-08
  *Scope:* local player predicted with shared movement code, reconciled on snapshot (replay
  unacknowledged inputs); remote players interpolated ~100 ms behind.
  *Done when:* smooth movement with 150 ms artificial latency (dev latency flag on the server);
  interpolation helpers tested.
  *Status:* verified with `DEV_LATENCY_MS=150` (≈ 390 ms round trip): local movement starts on
  the first frame, no backward corrections over a move-and-stop run.

- [x] **S1-10 — Deployment.**
  *Depends on:* S1-03
  *Scope:* `Dockerfile` for the server (Bun image), client static build served by Caddy,
  `Caddyfile` (TLS, static files, `/ws` and `/api` reverse proxy), `docker-compose.yml` with a
  named volume for the SQLite file (`DATABASE_PATH=/data/redakcja.sqlite`), `.env.example`,
  deploy notes in `docs/deploy.md`; CI job building the image.
  *Done when:* `docker compose up` locally serves the game on https and WebSockets work through
  Caddy on 443.
  *Status:* Dockerfile (targets `server`, `web`), Caddyfile, compose, `docs/deploy.md` done.
  Verified Caddy + server end to end (static, SPA fallback, `/api`, a full game over `wss://`)
  with the Caddy binary; the image build itself is verified by the CI `docker` job (Docker Hub
  rate-limited the dev sandbox). Real hosting waits on the open hosting question.

- [x] **S1-11 — Multiplayer e2e test.**
  *Depends on:* S1-09, S1-14
  *Scope:* Playwright config with a desktop project and a mobile project (device emulation with
  touch, landscape); test opening 2–3 browser contexts — at least one mobile: create room, join by
  code, move one player (keyboard on desktop, joystick drag on mobile), assert others see the
  move; CI job.
  *Done when:* e2e passes in CI for both projects.

- [x] **S1-12 — Persistence wiring (Drizzle + SQLite).**
  *Depends on:* S1-03
  *Scope:* add `drizzle-orm`, `drizzle-kit`, `drizzle-zod`; `drizzle.config.ts`
  (dialect `sqlite`, schema `src/db/schema.ts`, out `drizzle/`, `casing: 'snake_case'`);
  `db/client.ts` opening `bun:sqlite` at `DATABASE_PATH` with WAL and running `migrate()` on
  start; root scripts `db:generate` and `db:studio`; first table `leaderboard_entries`
  (room code, nicknames, score, level/mode, created at) as a smoke test of the pipeline;
  `/health` reports DB status; CI checks that `drizzle-kit generate` produces no uncommitted
  migration.
  *Done when:* migrations apply on an empty DB in tests (`:memory:`) and on server start; query
  functions for the table tested.

- [x] **S1-13 — Typed REST client.**
  *Depends on:* S1-03, S1-06
  *Scope:* `apps/client/src/net/api.ts` using Hono `hc<AppType>` with same-origin base URL;
  Vite dev proxy for `/api`.
  *Done when:* client calls `/health` through the typed client; a type error appears if a route
  changes shape.

- [~] **S1-14 — Mobile shell.**
  *Depends on:* S1-05, S1-07
  *Scope:* viewport meta (no pinch zoom), disable page scroll/pull-to-refresh/long-press menus
  and text selection on the game surface; "rotate your device" prompt in portrait during gameplay;
  Fullscreen API button; Screen Wake Lock while in a level; `visibilitychange` handling (pause
  local effects, fast reconnect on return); DPR cap and automatic low-quality preset on mobile
  GPUs; web app manifest + icons so it can be added to the home screen (no offline mode).
  *Done when:* a full join-and-move session works on a mid-range Android phone (Chrome) and an
  iPhone (Safari) without accidental zoom/scroll, at ≥ 30 FPS (target 60).
  *Status:* implemented and verified in mobile emulation; **real-device check pending.**

- [x] **S1-15 — Feedback (FX) framework.**
  *Depends on:* S1-07
  *Scope:* `apps/client/src/fx/`:
  - `feedback.ts` — client-side event bus; game/server events and local actions map to feedback
    *cues* defined in one catalogue (`cues.ts`), see [`../agents/game-feel.md`](../agents/game-feel.md);
  - `audio/` — Howler manager: buses (music, sfx, ui) with volumes, audio sprites, mobile/iOS
    autoplay unlock on first interaction, stereo pan by on-screen position, mute on hidden tab;
  - `particles/` — pooled, instanced particle system (one draw call per emitter material,
    global particle cap from quality preset), emitter presets defined as data;
  - `animation/` — tween/easing helpers and spring utility for UI and 3D (no allocation per
    frame), procedural character animation for the greybox capsules (walk bob, lean into
    movement, squash & stretch on start/stop, idle breathing);
  - `camera/` — camera shake with trauma decay; `haptics.ts` — Vibration API on Android / gamepad
    rumble where available;
  - settings: master/music/sfx volumes, reduced motion (no shake, fewer particles, no
    squash), no-flash, haptics on/off — persisted in localStorage.
  First cues: player joined (puff + chime), footsteps dust + soft steps, menu click/hover, room
  code copied. CC0 placeholder sounds (e.g. Kenney audio packs) credited in `CREDITS.md`.
  *Done when:* cues fire from the event bus, unit tests for cue mapping, tweens and particle pool;
  reduced-motion and mute verified; particle and audio cost visible in the dev perf overlay.

- [x] **S1-16 — Dev perf overlay.**
  *Depends on:* S1-07
  *Scope:* toggleable overlay (FPS, frame time, draw calls, triangles, particles alive, ping,
  snapshot buffer depth) via `r3f-perf`-style stats built on `renderer.info`; hidden in production
  unless `?debug`.
  *Done when:* usable on desktop and phone to check budgets.

- [x] **S1-17 — Design foundation.**
  *Depends on:* —
  *Scope:* `apps/client/src/ui/tokens.css` + `tokens.ts` (palette, type scale, spacing, rules,
  shadows per [`../agents/design-rules.md`](../agents/design-rules.md)); self-hosted fonts
  (Newsreader, a condensed grotesque, a typewriter face) with Polish glyphs verified; Polish
  typography helper (`strings/typography.ts`: non-breaking spaces after one-letter words,
  „quotes”, dates); first custom SVG icons (folder types, verdicts) and the stamp component
  (drawn lettering, ink mask, seeded rotation); paper/newsprint texture; first entries in
  `docs/design/references.md`; Biome/grep check in CI that fails on hex colours outside the token
  files.
  *Done when:* a `?styleguide` dev page shows tokens, type scale, icons and stamps on desktop and
  phone viewports and passes the design review checklist.

**Stage 1 exit:** 4 players (mixed desktop and mobile) move in sync with animated characters,
footstep dust and sound; `docker compose up` serves it over https; CI green including desktop and
mobile e2e.

---

## Stage 2 — Core gameplay (greybox)

Goal: one full level loop on grey boxes: folders arrive, players verify at 3 stations, decide at
the desk, score and credibility update, level ends with stars.

*Foundation (landed first so the tasks below can be built in parallel):* domain vocabulary
(`shared/src/domain.ts`), entity schemas (`shared/src/entities.ts`), protocol v2 (lobby actions,
`command` message, extended snapshot, gameplay events, `levelEnd`), fixtures in the tile map
(`C D T I A R P S L`), `step(state, inputs, commands, ctx) → { state, events }` running the
subsystems `folders → stations → desk → pings → scoring` (stubs except pings), content schemas
with one greybox level and two stories, server wiring (commands, events, snapshots, level end),
and client plumbing (`net/game-store.ts`, `net/game-events.ts`, `input/ui-nav.ts`,
`stations/minigames/` registry, `StationLayer` and `Hud` mount points).

- [x] **S2-01 — Content schemas.**
  *Depends on:* S1-01
  *Scope:* `content/src/schema.ts` — `Story`, `Stamp`, `Level` (duration, stations available,
  spawn schedule, star thresholds, events), truth→verdict rule, `validate.ts` with referential
  checks (see [`../agents/content-authoring.md`](../agents/content-authoring.md)); 5 test stories
  covering all truth values.
  *Done when:* `bun run validate:content` validates real files and fails on broken fixtures.

- [x] **S2-02 — Folders: spawn, carry, deadlines.**
  *Depends on:* S1-04, S2-01
  *Scope:* sim entities for folders; conveyor spawning from the level schedule; pick up / put down
  (E) on floor, surfaces, stations, desk; one folder per player; deadline countdown and expiry.
  *Done when:* unit tests for pickup rules, spawn timing, expiry; folders render as coloured boxes
  with type icons.

- [x] **S2-03 — Station framework.**
  *Depends on:* S2-02
  *Scope:* station occupancy, hold-Space work with progress, per-station duration (3–8 s) from
  constants, role speed bonus, stamp written to folder from story data, protocol messages for
  starting a station and submitting a minigame result (record in Decision log as an extension of
  the design-doc protocol); generic 2D `StationOverlay` (half screen on desktop, bottom sheet /
  full width on phones, scene still alive); work loop feedback (typing/keyboard loop sound,
  progress ring, character "working" pose).
  *Done when:* a folder carried to a station and worked on gets the correct stamp; role bonus
  tested; overlay usable by touch.

- [x] **S2-04 — Minigame: Image search (`imageSearch`).**
  *Depends on:* S2-03
  *Scope:* match image fragments to search results; success → stamp, failure → time lost.
  *Done when:* playable in the overlay with keyboard, gamepad and touch (drag/tap); success and
  failure cues wired.

- [x] **S2-05 — Minigame: Archive (`archive`).**
  *Depends on:* S2-03
  *Scope:* scroll a timeline and stop on the right date.
  *Done when:* playable with keyboard, gamepad and touch (swipe/drag/tap); success and failure
  cues wired.

- [x] **S2-06 — Minigame: Source registry (`sourceRegistry`).**
  *Depends on:* S2-03
  *Scope:* compare a profile against warning signs (account age, verification, name mismatch).
  *Done when:* playable with keyboard, gamepad and touch (swipe/drag/tap); success and failure
  cues wired.

- [x] **S2-07 — Editorial desk and verdicts.**
  *Depends on:* S2-03
  *Scope:* desk overlay showing the folder and its stamps; three verdict buttons; must pick a
  justifying stamp; server evaluates verdict + justification; result event with what was missed.
  *Done when:* tests for every truth × priority × verdict combination, including "wrong
  justification" handling (record rule in Decision log).

- [x] **S2-08 — Scoring, credibility, stars, level end.**
  *Depends on:* S2-07
  *Scope:* the full scoring table from the design doc (incl. speed bonus, expiry, unverifiable
  rules), credibility from 100 with loss at 0, level timer, star thresholds, `levelEnd` message.
  *Done when:* each row of the scoring table has a unit test; level ends correctly on time-out and
  on credibility 0.

- [x] **S2-09 — HUD.**
  *Depends on:* S2-02, S2-08
  *Scope:* top queue of folders with timers and priority, credibility meter, score, level timer,
  instant verdict feedback toast; animated counters (score roll-up, credibility bar drain with
  lag-behind ghost bar), urgency pulse on folders near deadline (respects no-flash); compact
  layout for phones that keeps the touch controls clear.
  *Done when:* readable at 1366×768 and at 640×360; type distinguishable by icon, not only colour.

- [~] **S2-12 — Core gameplay feedback.**
  *Depends on:* S1-15, S2-02, S2-03, S2-07, S2-08
  *Scope:* catalogue entries with animation + sound + particles (+ haptics on mobile) for:
  folder arrives on conveyor (bell, slide-in), pick up / put down (paper rustle, hop), carry pose,
  stamp applied (hit-stop ~60 ms, slam animation, ink splat + paper bits, thud, small shake),
  correct verdict (confetti/paper burst by verdict colour, chime, score pop text), published fake
  (red ink splash, alarm sting, strong shake, credibility bar crack), rejected truth, folder
  expired (folder burns/crumples to dust, buzzer), deadline warning (ticking that speeds up),
  level timer last 30 s (music tempo up), level win/lose stingers.
  *Done when:* every listed event has its cue; reduced motion tested; particle budget held during
  a busy level.
  *Status:* every gameplay event has a positioned cue (sound, particles, shake, haptics, hit-stop) in `fx/event-cues.ts`; the named animation triggers (`hop`, `crumple`, `scorePop`, `credibilityCrack`, …) are emitted but not yet consumed by the folder/avatar/HUD components.

- [~] **S2-13 — Music v1.**
  *Depends on:* S1-15
  *Scope:* one looping newsroom track with two intensity layers (calm / pressure) cross-faded by
  remaining time and number of urgent folders; menu track.
  *Done when:* layers switch smoothly; music bus volume respected.
  *Status:* synthesised menu + calm/pressure loops with intensity cross-fade are in; needs a human listening pass.

- [x] **S2-10 — Lobby: roles, ready, level select.**
  *Depends on:* S1-05
  *Scope:* role selection (non-exclusive or exclusive — record decision), character colour, ready
  toggle, host picks level, start game; 3-player rule for managing editor.
  *Done when:* all players ready + host start → everyone enters the same level.

- [x] **S2-11 — Pings (Q).**
  *Depends on:* S1-09
  *Scope:* quick signals ("Potrzebuję Archiwum!", "Fałszywka!", "Biorę to") shown above players.
  *Done when:* pings broadcast and display for ~2 s.

*Stage 2 status:* all tasks landed; a scripted two-player playtest (desktop + phone) plays a
folder from the conveyor through a station and the desk to the results screen. Still open:
the exit playtest with 3–4 real people on mixed devices, S2-12 animation listeners, S2-13
listening pass.

**Stage 2 exit:** greybox level with 5+ test stories played start to finish by 3–4 people on a
mix of laptops and phones, with full core feedback (animations, sounds, particles).

---

## Stage 3 — Level 1 complete

Goal: a polished vertical slice ready for the first playtest with students.

- [x] **S3-01 — Level 1 content.** 15 stories for "Pierwszy dzień — Burza nad miastem"
  (old photo as new, fake institutional account), including the design-doc examples; images
  CC0/self-made with credits; `reviewed: false` until the supervisor signs off.
- [x] **S3-02 — Debrief screen (Kolegium).** List of the level's stories with what it was,
  technique, tool, real-world analogue; player's verdicts vs correct; blunder-of-the-day vote
  (tallies stored per story in SQLite via Drizzle, exposed on `/api/stats/blunders` for the
  supervisor); stars.
- [x] **S3-03 — Briefing screen.** 15–20 s topic of the day + new mechanics, skippable when all
  ready.
- [x] **S3-04 — Level select / campaign map (minimal).** Levels with stars, locked/unlocked;
  progress stored per browser (localStorage, no accounts).
- [x] **S3-05 — First assets.** Kenney CC0 newsroom furniture and **rigged** characters with role
  accessories, folder models per type; `CREDITS.md`; stay within the desktop and mobile budgets.
- [x] **S3-06 — Character animation v1.** Skeletal clips via `AnimationMixer` (idle, walk, run,
  carry-walk, work-at-station, stamp, cheer, facepalm) with cross-fades driven by player state;
  procedural layer kept (lean, squash); animation LOD (lower update rate for far/off-screen
  characters on mobile).
- [x] **S3-07 — Ambient life.** Newsroom ambience (room tone, distant phones, printers),
  idle props animation (ceiling fans, monitor flicker — respects no-flash, paper stacks wobble),
  dust motes particles in light beams (desktop "high" preset only).
- [x] **S3-08 — Screen and UI animation pass.** Briefing intro (newspaper spin-in), debrief
  stamps slamming onto story cards one by one, star reveal with sound, vote animation; all
  skippable and reduced-motion aware.
- [x] **S3-09 — Playtest kit.** `docs/playtests/` with a session script, observation sheet and a
  short student questionnaire; device checklist (school laptops, students' phones); log results
  as new tasks/balance notes.

**Stage 3 exit:** Level 1 playable end to end with debrief, animated characters, ambience and
feedback on desktop and phones; first playtest held.

---

## Stage 4 — Remaining stations, events and levels

- [x] **S4-01 — Phone (`phone`).** Choose the right number, then a waiting queue; reporter skips
  the queue.
- [x] **S4-02 — AI scanner (`aiScanner`).** Probability readout with error margin; never decisive
  alone (enforced by content validation).
- [x] **S4-03 — Data library (`dataLibrary`).** Compare a number with the original table.
  (S4-01…S4-03: keyboard, gamepad and touch; success/failure cues.)
- [x] **S4-04 — Managing editor ability.** Extend one folder's deadline once per level.
- [x] **S4-05 — Event framework + `viral`.** Event scheduling from level data; growing share
  counter on a folder. Each event below ships with its own announce banner, sound and particles
  (e.g. `viral`: floating share/heart icons and notification pings; `bossCall`: ringing red
  phone, shaking desk; `botRaid`: swarm of identical folders with glitch effect; `outage`: sparks,
  smoke and powered-down station; `correction`: siren + highlighted folder trail).
- [x] **S4-06 — `bossCall`.** Editor-in-chief demands instant publish; points only if true.
- [x] **S4-07 — `botRaid`.** Wave of near-identical folders; recognising one resolves all.
- [x] **S4-08 — `outage`.** A station is down for 20 s.
- [x] **S4-09 — `correction`.** A previously published story turns out manipulated; first team
  member to file a correction recovers half the lost credibility.
- [x] **S4-10 — Levels 2–6 content.** ~15 stories each, following the campaign table; one task per
  level (`S4-10a` … `S4-10e`) so content can be written in parallel.
- [x] **S4-11 — Endless mode.** Random stories from all levels, speeds up every minute; room
  leaderboard per room and global top list stored via Drizzle (`leaderboard_entries`), served
  from `/api/leaderboard` with retention from `constants.ts`.

**Stage 4 exit:** full campaign (6 levels) and endless mode playable.

---

## Stage 5 — Presentation

- [x] **S5-01 — Final models and newsroom art pass** (low-poly, paper/wood palette, editorial red).
- [x] **S5-02 — Character animation polish** (role-specific idles and celebrations, emotes on
  pings, hand IK on folders, footstep sync with sounds, blend tuning).
- [x] **S5-09 — VFX polish.** Final particle art (ink, paper, confetti, sparks, smoke, glitch),
  stylised outlines/toon shading pass within budget, screen-space touches (vignette on low
  credibility, subtle chromatic glitch on `botRaid`) — all disabled by reduced motion / low
  quality.
- [x] **S5-10 — Haptics and controller polish.** Tuned vibration patterns per cue on Android and
  gamepads; rumble intensity setting.
- [x] **S5-03 — UI art pass** on top of the S1-17 foundation: final textures, complete icon set,
  final stamp lettering, every screen re-checked against the design rules and the reference board.
- [x] **S5-04 — Technique encyclopedia** with unlockable cards and in-game examples.
- [x] **S5-05 — Accessibility** (colour-blind safe palette audit, text scaling, no-flash mode,
  reduced motion, subtitles/visual equivalents for every audio-only cue, full gamepad and
  touch navigation in menus, left-handed touch layout option).
- [x] **S5-06 — Settings screen** (quality preset, volumes per bus, accessibility, haptics,
  touch control size/opacity, controls help per input device).
- [x] **S5-07 — Loading and performance** (asset progress bar, ≤10 MB first load, compressed
  textures (KTX2) and Draco/meshopt models, 60 FPS on UHD 620 and the mobile reference devices,
  adaptive quality that drops particles/shadows/DPR when frame time rises, instancing audit).
- [x] **S5-08 — Full audio pass** (per-level music, all SFX final, mix and loudness pass,
  stingers for events, voice-less "gibberish" newsroom chatter).

---

## Stage 6 — Balance and contest materials

- [ ] **S6-01 — Balance** station times, deadlines, points and star thresholds from playtest data. _Prepared: bot-based balance done (`bun run balance`, docs/balance.md); needs real playtest data to confirm._
- [ ] **S6-02 — Content review** — supervisor signs off all stories (`reviewed: true`).
- [ ] **S6-03 — Contest materials** in `docs/contest/`: screenshots of every screen, labelled _Prepared: generators, maps, role/folder cards, criteria mapping and screenshots done; gameplay video still to record (`bun run contest:build -- --video`)._
  newsroom map, role cards, 3–4 sample folders with stamps, 60–90 s gameplay video, criteria
  mapping.
- [ ] **S6-04 — Production deploy and smoke test** on a school-like network (port 443 only) with _Prepared: stack hardened and smoke-tested locally (`bun run smoke`, docs/deploy.md); real host, domain and school-network test still to do._
  the device matrix from [`../agents/platforms.md`](../agents/platforms.md).

---

## Stage 7 — Playtest feedback round

Goal: act on the first playtest log. Clearer verdict feedback and end-of-level explanations,
folders spread evenly over stations (station bag), difficulty levels, multi-stamp folders,
class abilities, four new stations, server config with optional ads, room browser, team versus
with spectators, an animated intro with a Polish voiceover, station help and UI expansion.

The design (user decisions, architecture, protocol ledger, every task's scope and "done when")
lives in [`design/stage7/`](design/stage7/README.md). Milestones M1–M7 each end with a green,
deployable build. `PROTOCOL_VERSION` bumps at most once per milestone that changes the WebSocket
wire ([`design/stage7/protocol.md`](design/stage7/protocol.md)). Each task ticks its own row
here in its own commit.

User decisions from the feedback Q&A (2026-10-13), binding for this stage:

1. Selected l4–l6 and endless stories need 2–3 distinct justifying stamps, all cited at the desk;
   +20 s per extra stamp and a score bonus.
2. "Not enough tables" means queues at one station; fixed by the station bag.
3. The station bag ("Tetris") applies to the campaign and endless: every attempt draws folders
   from the level's story pool so every station decides equally many folders; star thresholds
   follow the generated run.
4. Kartoteka źródeł keeps the same card after a failure, without an answer reveal.
5. Classes get active abilities (R / RB / 4th touch button): Ekspertyza, Telefon z terenu,
   +20 s on cooldown, plus new classes Wszechstronny and Ratownik.
6. Four new stations (Mapa, Stenogram, Inne media, Metadane): l5 and l6 get two each, endless
   all ten.
7. An in-engine animated intro before training with an offline-generated Polish voiceover.
8. Versus with separate identical newsrooms (up to 4v4) and spectators (split view, follow,
   feed, live stats, also in co-op).
9. Difficulty Łatwy / Normalny / Trudny / Ekspert; progress and endless leaderboard per
   difficulty.
10. Room browser with private-by-default rooms; host kick.
11. AdSense configured in a server `config.json`, off by default, never during gameplay, with
    Google's certified CMP and non-personalised ads.
12. A server-side `config.json` for global settings.
13. In-game menu, lobby management, "O grze" screen and a player profile.

### M1 — Quick wins

- [x] **S7-01 — Stage 7 plan scaffold, protocol ledger and shared naming decisions.** *Depends on:* —. [Details](design/stage7/tasks.md#s7-01)
- [x] **S7-02 — Real client IP behind the external TLS proxy.** *Depends on:* S7-01. [Details](design/stage7/tasks.md#s7-02)
- [x] **S7-03 — Folder result and verdict contract v3 (reasons, bonuses, unfinished, loss reason, cite array, hint-only rule, Zabrakło data fix).** *Depends on:* S7-01. [Details](design/stage7/tasks.md#s7-03)
- [ ] **S7-04 — Desk result screen and one outcome vocabulary.** *Depends on:* S7-03. [Details](design/stage7/tasks.md#s7-04)
- [ ] **S7-05 — Results model: totals, star progress, loss reason, per-folder cards, reveal plan.** *Depends on:* S7-03. [Details](design/stage7/tasks.md#s7-05)
- [ ] **S7-06 — Results summary: loss lede, star captions, points to next star, thresholds explainer, totals table, phone page 0.** *Depends on:* S7-05. [Details](design/stage7/tasks.md#s7-06)
- [ ] **S7-07 — Kolegium per folder: reason line, credibility chip, deciding proof, unfinished folders.** *Depends on:* S7-04, S7-05. [Details](design/stage7/tasks.md#s7-07)
- [x] **S7-08 — Next-folder timing and conveyor-full flag in snapshots.** *Depends on:* S7-03. [Details](design/stage7/tasks.md#s7-08)
- [ ] **S7-09 — Next-folder UI: ghost card, 'Taśma pełna', conveyor sign ring, guidance hint.** *Depends on:* S7-08. [Details](design/stage7/tasks.md#s7-09)
- [ ] **S7-10 — In-game menu button and sheet (with solo pause) replacing tool buttons and room chip.** *Depends on:* S7-01, S7-03. [Details](design/stage7/tasks.md#s7-10)
- [ ] **S7-11 — One-row phone HUD pill and measured HUD band.** *Depends on:* S7-10, S7-09. [Details](design/stage7/tasks.md#s7-11)
- [ ] **S7-12 — HUD-aware follow camera and 640x360 Playwright project.** *Depends on:* S7-11. [Details](design/stage7/tasks.md#s7-12)
- [ ] **S7-13 — Folder spawnKey, per-folder minigame seeds and stable Kartoteka card (sim).** *Depends on:* S7-03. [Details](design/stage7/tasks.md#s7-13)
- [ ] **S7-14 — Kartoteka client: same card on retry, no reveal, circled fields kept, time resumes after cancel.** *Depends on:* S7-13. [Details](design/stage7/tasks.md#s7-14)
- [x] **S7-15 — Touch key hints and station help copy for the six stations.** *Depends on:* S7-01. [Details](design/stage7/tasks.md#s7-15)

### M2 — Bag, difficulty, multi-stamp

- [x] **S7-16 — Difficulty vocabulary, Stage-7 balance constants, pure difficulty helpers.** *Depends on:* S7-03. [Details](design/stage7/tasks.md#s7-16)
- [x] **S7-17 — Sim tuning (work, lockout, penalties) and lockout on the wire (protocol v4).** *Depends on:* S7-16. [Details](design/stage7/tasks.md#s7-17)
- [ ] **S7-18 — Multi-stamp folders: content field, validation, bonus, spawn extra time.** *Depends on:* S7-16, S7-03. [Details](design/stage7/tasks.md#s7-18)
- [ ] **S7-19 — Desk multi-select, folder-card evidence badge, multi-stamp guidance.** *Depends on:* S7-18, S7-04. [Details](design/stage7/tasks.md#s7-19)
- [ ] **S7-20 — Station bag core.** *Depends on:* S7-18. [Details](design/stage7/tasks.md#s7-20)
- [ ] **S7-21 — Level file schema split, generateBagLevel, prepareRun and pool validation.** *Depends on:* S7-20. [Details](design/stage7/tasks.md#s7-21)
- [ ] **S7-22 — Endless on the station bag with difficulty and separate RNG streams.** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-22)
- [ ] **S7-23 — Server run lifecycle, difficulty and bag station on the wire.** *Depends on:* S7-21, S7-17. [Details](design/stage7/tasks.md#s7-23)
- [ ] **S7-24 — Client difficulty rules: minigame time, mistakes, reveal, hints, bag-station guidance.** *Depends on:* S7-23, S7-14, S7-19. [Details](design/stage7/tasks.md#s7-24)
- [ ] **S7-25 — Lobby difficulty picker, run folder count and thresholds in the briefing.** *Depends on:* S7-23. [Details](design/stage7/tasks.md#s7-25)
- [ ] **S7-26 — Progress and endless leaderboard per difficulty (server and client).** *Depends on:* S7-23. [Details](design/stage7/tasks.md#s7-26)
- [ ] **S7-27 — Content l0 Makieta: 7 new stories and conversion to the bag.** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-27)
- [ ] **S7-28 — Content l1 Burza: 5 imageSearch-only stories and conversion to the bag.** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-28)
- [ ] **S7-29 — Content l2 Wybory: 3 imageSearch-only stories and conversion to the bag.** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-29)
- [ ] **S7-30 — Content l3 Afera part 1: 6 stories (imageSearch 4, sourceRegistry 2).** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-30)
- [ ] **S7-31 — Content l3 Afera part 2: 4 archive-only stories and conversion to the bag.** *Depends on:* S7-30. [Details](design/stage7/tasks.md#s7-31)
- [ ] **S7-32 — Content l4 Zdrowie part 1: 5 stories (archive 4, phone 1).** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-32)
- [ ] **S7-33 — Content l4 Zdrowie part 2: 4 stories, decisive-stamp cleanup, multi-stamp picks, conversion to the bag.** *Depends on:* S7-32, S7-18. [Details](design/stage7/tasks.md#s7-33)
- [ ] **S7-34 — Balance harness: difficulty, bag runs, multi-stamp bot, retry model, station load.** *Depends on:* S7-21, S7-22, S7-18, S7-13, S7-17. [Details](design/stage7/tasks.md#s7-34)
- [ ] **S7-35 — M2 balance pass and documentation.** *Depends on:* S7-34, S7-27, S7-28, S7-29, S7-31, S7-33, S7-19, S7-24, S7-25, S7-26. [Details](design/stage7/tasks.md#s7-35)

### M3 — Roles and abilities

- [ ] **S7-36 — Ability contracts, crew state, role perks and station families (protocol v5).** *Depends on:* S7-17, S7-23. [Details](design/stage7/tasks.md#s7-36)
- [ ] **S7-37 — stepAbilities: Przedłużenie, Koło ratunkowe, Telefon z terenu; remove the old extension.** *Depends on:* S7-36. [Details](design/stage7/tasks.md#s7-37)
- [ ] **S7-38 — Sim: Ekspertyza, Druga szansa, Podaj teczkę.** *Depends on:* S7-37, S7-13. [Details](design/stage7/tasks.md#s7-38)
- [ ] **S7-39 — Ability input: R / RB / touch press, nav intent, runtime send, controls help.** *Depends on:* S7-36, S7-10. [Details](design/stage7/tasks.md#s7-39)
- [ ] **S7-40 — HUD ability chip, touch ability button, folder-card marks, design-rules amendment.** *Depends on:* S7-38, S7-39, S7-11. [Details](design/stage7/tasks.md#s7-40)
- [ ] **S7-41 — Overlays: Ekspertyza header action, StationHost round nonce, Druga szansa hint, desk intent.** *Depends on:* S7-38, S7-40. [Details](design/stage7/tasks.md#s7-41)
- [ ] **S7-42 — Ability world feedback, clips, sounds and final cue catalogue.** *Depends on:* S7-38, S7-40. [Details](design/stage7/tasks.md#s7-42)
- [ ] **S7-43 — New roles Wszechstronny (generalist) and Ratownik (rescuer).** *Depends on:* S7-38. [Details](design/stage7/tasks.md#s7-43)
- [ ] **S7-44 — Lobby role picker for 6 roles + Bez roli with detail panel.** *Depends on:* S7-43, S7-25. [Details](design/stage7/tasks.md#s7-44)
- [ ] **S7-45 — Ability guidance hints and tutorial ability step.** *Depends on:* S7-40, S7-43, S7-24. [Details](design/stage7/tasks.md#s7-45)
- [ ] **S7-46 — Balance bots with abilities, cooldown tuning, contest role cards.** *Depends on:* S7-38, S7-43, S7-34, S7-35. [Details](design/stage7/tasks.md#s7-46)
- [ ] **S7-47 — Roles and abilities: docs and e2e.** *Depends on:* S7-44, S7-45, S7-46. [Details](design/stage7/tasks.md#s7-47)

### M4 — New stations

- [ ] **S7-48 — Station kinds contract and every compile-enforced map (protocol v6).** *Depends on:* S7-36, S7-15, S7-21. [Details](design/stage7/tasks.md#s7-48)
- [x] **S7-49 — Fit the sun light and shadow box to the room.** *Depends on:* S7-01. [Details](design/stage7/tasks.md#s7-49)
- [ ] **S7-50 — Layout validation: station sign spacing and reachability.** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-50)
- [ ] **S7-51 — 3D models for Mapa, Stenogram, Inne media, Metadane.** *Depends on:* S7-48. [Details](design/stage7/tasks.md#s7-51)
- [ ] **S7-52 — Minigame evidence helpers and the Metadane minigame.** *Depends on:* S7-48, S7-24. [Details](design/stage7/tasks.md#s7-52)
- [ ] **S7-53 — Stenogram (transcript) minigame.** *Depends on:* S7-52. [Details](design/stage7/tasks.md#s7-53)
- [ ] **S7-54 — Inne media (crossCheck) minigame.** *Depends on:* S7-52. [Details](design/stage7/tasks.md#s7-54)
- [ ] **S7-55 — Mapa (geolocation) minigame with landmark glyphs.** *Depends on:* S7-52. [Details](design/stage7/tasks.md#s7-55)
- [ ] **S7-56 — Complete minigame registry, minigame e2e, bundle check, contest shots.** *Depends on:* S7-53, S7-54, S7-55. [Details](design/stage7/tasks.md#s7-56)
- [ ] **S7-57 — l5 Głęboka podróbka: 24x14 room with Stenogram and Metadane, plus stamps.** *Depends on:* S7-51, S7-53, S7-50. [Details](design/stage7/tasks.md#s7-57)
- [ ] **S7-58 — l6 Atak: 24x14 room with Mapa and Inne media, plus stamps and demotions.** *Depends on:* S7-51, S7-54, S7-55, S7-50. [Details](design/stage7/tasks.md#s7-58)
- [ ] **S7-59 — l5 new stories for Stenogram, Metadane, archive and sourceRegistry.** *Depends on:* S7-57. [Details](design/stage7/tasks.md#s7-59)
- [ ] **S7-60 — l5 conversion to the bag with multi-stamp picks.** *Depends on:* S7-59, S7-18. [Details](design/stage7/tasks.md#s7-60)
- [ ] **S7-61 — l6 new stories for Mapa and Inne media.** *Depends on:* S7-58. [Details](design/stage7/tasks.md#s7-61)
- [ ] **S7-62 — l6 new stories for imageSearch and archive.** *Depends on:* S7-61. [Details](design/stage7/tasks.md#s7-62)
- [ ] **S7-63 — l6 phone and dataLibrary stories, multi-stamp picks, conversion to the bag.** *Depends on:* S7-62, S7-18. [Details](design/stage7/tasks.md#s7-63)
- [ ] **S7-64 — Endless mode with all 10 stations.** *Depends on:* S7-56, S7-22, S7-60, S7-63, S7-50. [Details](design/stage7/tasks.md#s7-64)
- [ ] **S7-65 — Technique cards for the new stations.** *Depends on:* S7-57, S7-58. [Details](design/stage7/tasks.md#s7-65)
- [ ] **S7-66 — M4 balance, performance and contest pass.** *Depends on:* S7-60, S7-63, S7-64, S7-49, S7-46. [Details](design/stage7/tasks.md#s7-66)

### M5 — Config, ads, shell

- [x] **S7-67 — Shared public-config contract, ads legal gate and CSP nonce placeholder.** *Depends on:* S7-16. [Details](design/stage7/tasks.md#s7-67)
- [ ] **S7-68 — config.json loader with hot reload, signOff gate and registry settings().** *Depends on:* S7-67, S7-23. [Details](design/stage7/tasks.md#s7-68)
- [ ] **S7-69 — GET /api/config and the client public-config store.** *Depends on:* S7-68. [Details](design/stage7/tasks.md#s7-69)
- [ ] **S7-70 — Server-rendered HTML shell with config-driven CSP and ads.txt.** *Depends on:* S7-69. [Details](design/stage7/tasks.md#s7-70)
- [ ] **S7-71 — Deploy wiring: Dockerfile, Caddyfile routing, compose, smoke test.** *Depends on:* S7-70, S7-02. [Details](design/stage7/tasks.md#s7-71)
- [ ] **S7-72 — MOTD banner in the main menu.** *Depends on:* S7-69. [Details](design/stage7/tasks.md#s7-72)
- [ ] **S7-73 — AdSense client core: lazy loader (limited mode), AdSlot, pause guard.** *Depends on:* S7-69, S7-70. [Details](design/stage7/tasks.md#s7-73)
- [ ] **S7-74 — Ad placements, menu footer with consent link, ad e2e guards.** *Depends on:* S7-73. [Details](design/stage7/tasks.md#s7-74)
- [ ] **S7-75 — Shared markdown-lite parser, /prywatnosc page and privacy note rewrite.** *Depends on:* S7-70, S7-74. [Details](design/stage7/tasks.md#s7-75)
- [ ] **S7-76 — Docs for config, ads and deploy.** *Depends on:* S7-68, S7-71, S7-74, S7-75. [Details](design/stage7/tasks.md#s7-76)

### M6 — Rooms, versus, spectators

- [ ] **S7-77 — Shared wire contracts for rooms, versus and spectators (protocol v7).** *Depends on:* S7-68, S7-36. [Details](design/stage7/tasks.md#s7-77)
- [ ] **S7-78 — Pure versus, match-stats, embargo, name-filter and room-list rules in shared.** *Depends on:* S7-77. [Details](design/stage7/tasks.md#s7-78)
- [ ] **S7-79 — Registry refactor: members, team runs, topics, lockstep tick (co-op unchanged).** *Depends on:* S7-77. [Details](design/stage7/tasks.md#s7-79)
- [ ] **S7-80 — Versus rules on the server.** *Depends on:* S7-78, S7-79, S7-13. [Details](design/stage7/tasks.md#s7-80)
- [ ] **S7-81 — Spectators on the server, with the versus embargo and the Widownia toggle.** *Depends on:* S7-78, S7-79. [Details](design/stage7/tasks.md#s7-81)
- [ ] **S7-82 — Lobby administration on the server: visibility, name, kick with cooldown, host transfer.** *Depends on:* S7-79, S7-78. [Details](design/stage7/tasks.md#s7-82)
- [ ] **S7-83 — GET /api/rooms room-list API (cached, class-sized limit).** *Depends on:* S7-02, S7-78, S7-82. [Details](design/stage7/tasks.md#s7-83)
- [ ] **S7-84 — Client session and stores for modes, spectators and kicks.** *Depends on:* S7-77. [Details](design/stage7/tasks.md#s7-84)
- [ ] **S7-85 — GameView refactor of the client scene (no behaviour change).** *Depends on:* S7-12, S7-42, S7-51. [Details](design/stage7/tasks.md#s7-85)
- [ ] **S7-86 — Lobby UI: mode, teams, spectators (Widownia), visibility, room name.** *Depends on:* S7-84, S7-80, S7-81, S7-82, S7-44. [Details](design/stage7/tasks.md#s7-86)
- [ ] **S7-87 — Host manage sheet and level details for guests.** *Depends on:* S7-86, S7-15, S7-25. [Details](design/stage7/tasks.md#s7-87)
- [ ] **S7-88 — Room browser UI.** *Depends on:* S7-83, S7-84, S7-69. [Details](design/stage7/tasks.md#s7-88)
- [ ] **S7-89 — Versus HUD rival chip and versus results for players.** *Depends on:* S7-80, S7-84, S7-06, S7-07. [Details](design/stage7/tasks.md#s7-89)
- [ ] **S7-90 — Spectate screen I: views, split layout, scoreboard.** *Depends on:* S7-81, S7-84, S7-85. [Details](design/stage7/tasks.md#s7-90)
- [ ] **S7-91 — Spectate screen II: follow, feed, stats, spectator results, ad slot.** *Depends on:* S7-90, S7-89, S7-74. [Details](design/stage7/tasks.md#s7-91)
- [ ] **S7-92 — Performance checks for versus and spectating.** *Depends on:* S7-80, S7-91. [Details](design/stage7/tasks.md#s7-92)
- [ ] **S7-93 — Docs, rules and privacy for rooms, versus and spectators.** *Depends on:* S7-80, S7-81, S7-83, S7-91, S7-75. [Details](design/stage7/tasks.md#s7-93)

### M7 — Intro, help, about, profile

- [ ] **S7-94 — Shared control drawings and StationHelpCard.** *Depends on:* S7-15, S7-48. [Details](design/stage7/tasks.md#s7-94)
- [ ] **S7-95 — First-use station help with paused client timer and '?' in the overlay header.** *Depends on:* S7-94, S7-24. [Details](design/stage7/tasks.md#s7-95)
- [ ] **S7-96 — 'Jak grać' dialog shell, bundle 'extras' category, entry points.** *Depends on:* S7-74. [Details](design/stage7/tasks.md#s7-96)
- [ ] **S7-97 — Stanowiska tab, practice round ('Wypróbuj'), briefing chips, in-game help row.** *Depends on:* S7-96, S7-95, S7-10. [Details](design/stage7/tasks.md#s7-97)
- [ ] **S7-98 — Voice audio bus, voice loader, voice volume, deeper ducking.** *Depends on:* S7-01. [Details](design/stage7/tasks.md#s7-98)
- [ ] **S7-99 — Intro script, timeline model and line export.** *Depends on:* S7-43, S7-19. [Details](design/stage7/tasks.md#s7-99)
- [ ] **S7-100 — Offline Polish TTS voiceover with a licence audit, and licence notes.** *Depends on:* S7-99. [Details](design/stage7/tasks.md#s7-100)
- [ ] **S7-101 — IntroPlayer (in-engine): stage, subtitles, controls, scenes 1–6.** *Depends on:* S7-96, S7-98, S7-99, S7-85. [Details](design/stage7/tasks.md#s7-101)
- [ ] **S7-102 — IntroPlayer scenes 7–11, lobby autoplay, intro flag, replay, e2e.** *Depends on:* S7-101, S7-69. [Details](design/stage7/tasks.md#s7-102)
- [ ] **S7-103 — 'O grze' dialog: authors, licences, credits, libraries, version.** *Depends on:* S7-96, S7-75. [Details](design/stage7/tasks.md#s7-103)
- [ ] **S7-104 — Player profile: local stats, tracking, profile dialog.** *Depends on:* S7-96, S7-78. [Details](design/stage7/tasks.md#s7-104)
- [ ] **S7-105 — Look over the wire: preferred colour and accessory (protocol v8).** *Depends on:* S7-104, S7-79, S7-86. [Details](design/stage7/tasks.md#s7-105)
- [ ] **S7-106 — Stage 7 close-out: docs consistency and contest refresh.** *Depends on:* S7-95, S7-97, S7-100, S7-102, S7-103, S7-105. [Details](design/stage7/tasks.md#s7-106)

---

## Backlog (not scheduled)

- Solo / 2-player mode with a helper bot (if the jury needs to play alone).
- Voice chat for remote play (or rely on Discord).
- msgpack wire format if bandwidth becomes an issue.
- Level layout editor in `tools/level-editor`.
- Forgejo mirror / migration of CI.
- Phone-height layouts for the six Stage 2–4 minigames: at 640×360 five of them overflow the
  overlay body (with the key hints: Kartoteka 130 px, Biblioteka danych 46, Archiwum 37, Lupa
  obrazu 31, Skaner AI 24), so the key hints (and Kartoteka's „Odłóż kartę”) need a scroll
  (found in S7-15).

---

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-06 | CI on GitHub Actions instead of Forgejo Actions | Repository is hosted on GitHub; workflow syntax is portable |
| 2026-10-06 | All repo text in English; only player-facing content in Polish | Team decision; glossary maps design terms |
| 2026-10-06 | Commits go directly to `main` | Small team; CI and `bun run check` guard quality |
| 2026-10-06 | Hono for HTTP/WebSocket routing on `Bun.serve` | Typed REST (`/api`) with zod-validator and the RPC client alongside the WebSocket; native Bun pub/sub kept for rooms |
| 2026-10-06 | Drizzle ORM on SQLite (`bun:sqlite`) for persistence | No DB server to run in schools; typed schema and committed migrations; live game state stays in memory |
| 2026-10-06 | Desktop and mobile (touch, landscape) are both first-class targets | Students play on school laptops and their own phones; touch controls and responsive overlays from stage 1 |
| 2026-10-06 | Animation, sound and particles ship with each feature via a central feedback catalogue | Game feel is core to an Overcooked-like game; avoids a risky "polish at the end" stage |
| 2026-10-06 | Particles, tweens and camera shake are in-house (instanced, pooled) on three.js; no extra FX library | Keeps bundle small and draw calls predictable on mobile GPUs |
| 2026-10-06 | Binding design rules against a generic/"AI-generated" look; identity based on physical newsroom objects | A game about spotting fakes must not look templated; gives agents concrete constraints |
| 2026-10-06 | Fonts self-hosted, no Google Fonts CDN; working picks Newsreader + condensed grotesque + typewriter face | School networks and privacy; Polish glyph coverage to be verified in S1-17 |
| 2026-10-06 | Players pass through each other (no body blocking) | Crowded newsroom would cause frustrating jams; revisit after playtests |
| 2026-10-06 | One client input = one 50 ms tick; server applies 1 queued input per tick (more when catching up) | Prediction replays exactly what the server simulates; no drift |
| 2026-10-06 | Protocol adds `welcome`, `roomState`, `heartbeat`/`heartbeatAck` to the design-doc messages | Reconnect token, lobby list and ping measurement |
| 2026-10-06 | Positions quantised to 1/1024 tile inside the sim | Wire values equal sim values, so client replay matches the server bit for bit |
| 2026-10-06 | `@hono/bun` adapter instead of the deprecated `hono/bun` export | `hono/bun` is scheduled for removal in Hono v5 |
| 2026-10-06 | Room broadcasts through a `Hub` interface backed by Bun pub/sub (`server.publish`) | Same production path as planned, but the registry is testable with a fake hub |
| 2026-10-06 | Protocol v2: player decisions (minigame result, verdict, ping, deadline extension, cancel) travel as one `command` message, queued and applied in the next tick | Extension of the design-doc `verdict` message; keeps the simulation the only place state changes |
| 2026-10-06 | Minigame outcomes are reported by the client; the server owns everything around them (who operates, which folder, stamp text, lockout) | Minigames are skill tests in the UI; cheating is not a threat in a co-op classroom game |
| 2026-10-06 | Content (stories, levels) is bundled into the client | Static data, no secret to protect; the overlay and HUD need the texts instantly |
| 2026-10-06 | Roles are optional and non-exclusive | Design doc: roles give a bonus but never block a station; avoids lobby deadlocks |
| 2026-10-06 | Folder pick-up and put-down are not predicted on the client | 50 ms tick + feedback cues hide the latency; avoids rollback of shared objects |
| 2026-10-06 | Correct verdict with a non-justifying stamp: half points, no credibility gain (`wrongJustification`) | Blocks guessing without punishing like a wrong verdict |
| 2026-10-06 | Close code 1000 from the client = intentional leave (slot freed at once); anything else holds the slot 60 s | Distinguishes "Wyjdź" from network drops / app switches on phones |
| 2026-10-06 | Placeholder SFX synthesised in-repo (`tools/audio/synth_placeholders.py`) instead of Kenney packs | Kenney is unreachable from the build environment; self-made sounds have no licence questions; ids stay stable for real sounds in stage 5 |
| 2026-10-06 | Scene uses flat Lambert materials, `flat` (no tone mapping) | Colours stay true to design tokens; cheapest lighting model for UHD 620 and phones |
| 2026-10-06 | Game screen (three.js) is lazy-loaded | Menu bundle 122 KB gzip vs 372 KB; faster first load on phones |
| 2026-10-06 | Fonts via `@fontsource` (Newsreader, Archivo, Courier Prime), Polish glyphs verified | Self-hosted, OFL, full ą ć ę ł ń ó ś ź ż and „ ” – coverage |
| 2026-10-06 | Package sources under `src/` (`packages/shared/src/sim`, …) | Uniform layout across packages; minor deviation from the design-doc tree |
| 2026-10-06 | Wrong verdicts outside the design-doc table: plain publish of misleading/satire −10 / −10 cred; rejecting misleading/satire −5 / 0; context note on a true story −5 / 0; publishing false/unverifiable (with or without context) counts as a published fake −20 / −25 | Keeps "better late than wrong" ordering; harmless over-caution costs little |
| 2026-10-06 | A justification counts only if the stamp is a justifying stamp *and* was collected on the folder; speed bonus only for fully correct verdicts with strictly more than half the time left | Verdicts must rest on evidence the team actually gathered |
| 2026-10-06 | Deadline extension: managing editor role; with no managing editor and ≤ 3 players anyone may extend; once per level | Design doc's 3-player rule, simplified |
| 2026-10-06 | Credibility 0 on the same tick as time-out is a loss; reported credibility deltas are the table values, the meter is clamped to 0–100 | Deterministic tie-break; readable feedback |
| 2026-10-06 | Ready can be toggled in the lobby and on the results screen; ready flags reset on level select, start and back-to-lobby; start needs every connected guest ready | Replay from results must be possible; disconnected players never block |
| 2026-10-06 | A minigame operator keeps the station while the overlay is open even without facing it; stations are reachable within 1.1 tiles regardless of facing | The overlay owns the input; avoids losing a round to a stray stick nudge |
| 2026-10-06 | Server-event cues own shared moments (desk opened, minigame failed, pings); overlays only add local UI clicks | One sound per moment when several units listen to the same event |
| 2026-10-06 | Visual style changed from "newsroom paper" (cream paper, serif, typewriter) to "cartoon newsroom": bright flat colours, thick navy outlines, rounded chunky shapes, Baloo 2 + Nunito; plus clarity rules (one primary action, ≤ 8 words during play, smaller HUD, "what next" hints, first-level tutorial) | User feedback: the paper look read as generic/AI-made and the UI was hard to read; the game must be easy for anyone |
| 2026-10-07 | Stage 3 contracts: room phase `briefing` between lobby and playing (auto-start after `BRIEFING_DURATION_MS` or when all connected players skip); `skipBriefing` and `voteBlunder` lobby actions; `roomState.briefing` and `roomState.blunderVotes`; `folderExpired` carries the folder's stamps | Lets S3 units build briefing, debrief and votes in parallel; fixes "missed stamps" for expired folders |
| 2026-10-09 | S3 integrated: HUD motion and phone HUD readability shipped with S3-07; phone camera framing relies on compact folder strips plus the existing back margin | The compact HUD no longer hides back-wall station signs in screenshots at 640×360 | 
| 2026-10-09 | Stage 4 contracts: level events are data (`level.events`), spawn folders carrying a `folder.tag`, and outages live on `station.outageMs`; protocol gains `levelEvent` and `raidResolved` events | One uniform framework lets the five events, their client presentation and levels 2–6 be built in parallel |
| 2026-10-09 | Event rules: `viral` is pressure only (shares = start × growth^age); `bossCall` pays a bonus only for a correct publish of a true story within the window and costs nothing when ignored; `botRaid` resolves all siblings from one verdict and counts expiry once; `correction` costs credibility at the start and filing it recovers half; `outage` blocks one station for its duration | Matches the design doc, with numbers in `EVENTS` in constants.ts |
| 2026-10-09 | Endless mode is level id `endless`, generated at runtime; it ends only at credibility 0; leaderboard entries are `{roomCode, players, score, survivedS}` | Keeps content files out of it and the wire format fixed before the server and client units start |
| 2026-10-07 | S3-05 assets are built procedurally in code (flat-shaded primitives, hierarchical rigs animated with `AnimationMixer` clips) instead of Kenney packs | The build environment cannot download asset packs; procedural models keep the cartoon style consistent and the bundle small. Kenney/artist assets can replace them in S5-01 |
| 2026-10-13 | Stage 7 protocol ledger: `PROTOCOL_VERSION` bumps at most once per milestone that changes the WebSocket wire (M1 v3 … M7 v8); REST, HTML and config changes never bump | A milestone is one deploy unit; classrooms reload once per deploy instead of once per task |
| 2026-10-13 | Stage 7 ids: new stations `geolocation` (G), `transcript` (Q), `crossCheck` (X), `metadata` (E); new roles `generalist`, `rescuer`; abilities `expertise`, `fieldCall`, `extendDeadline`, `secondChance`, `passFolder` + passive `rescue`; station families (image / documents / sources) gate Ekspertyza only; role passives stay explicit station lists | One naming set for every Stage 7 task; keeps today's role passives unchanged |
| 2026-10-13 | A station *decides* a story when the story has a justifying, non-hint stamp from it (`decidingStations`); aiScanner is hint-only and its stamp never counts toward the proof count | One rule for the bag, validation, pinned counts and guidance; matches the design doc ("AI is only a hint") |
| 2026-10-13 | `folder.spawnKey` (`s<scheduleIndex>` / `e<eventIndex>.<wave>`) is the folder identity across versus teams; minigame seeds, rival matching and the spectator embargo key on it | Folder ids diverge between teams when belts fill differently |
| 2026-10-13 | Run generation order: run seed → slot times → station sequence (bag) → story matching → deadlines × difficulty → star thresholds; at spawn + (N−1) × 20 s; tuning every tick; abilities at runtime. The run seed is separate from the sim seed | Deterministic, composable transforms; both versus teams share one run |
| 2026-10-13 | Client address for the per-address limits (S7-02): Caddy believes `X-Forwarded-For` only from `TRUSTED_PROXIES` (default `private_ranges`; `trusted_proxies_strict`, `client_ip_headers X-Forwarded-For`) and sends `{client_ip}` as `X-Real-IP`; the server reads `X-Real-IP`, else the socket address, else `'unknown'` (`apps/server/src/client-address.ts`) and never `X-Forwarded-For` | Without trusted proxies Caddy replaced the header with the TLS proxy's address, so the per-IP join and room limits were site-wide; a browser-supplied `X-Forwarded-For` entry must never pick the limiter key |
| 2026-10-13 | Folder result contract v3 (S7-03, `PROTOCOL_VERSION` 3): every folder result carries `reason` (14 values, one outcome each), `justifyingStampIds` (deduped cites), `requiredStamps` and `bonuses {speed, multiStamp, bossCall}` (base points = `scoreDelta − Σ bonuses`); `verdictResult` is the folder result plus `playerId`, with a non-null `verdict`; the verdict command cites 1–3 stamps (`justifyingStampIds`); `missedStampIds` is filled only on errors, never after a correct verdict | One source of truth for the desk result, the toasts and the Kolegium; a correct verdict that left a second justifying stamp unchecked was shown with a „Zabrakło” list |
| 2026-10-13 | Proof at the desk (S7-03): `valid = cited ∩ justifyingStamps ∩ folder.stamps`; any cite outside `valid` is `weakProof`; fewer non-hint valid cites than `requiredStampsOf(story)` is `incompleteProof` (half points, no credibility). Citing only the AI scanner, which used to score as correct, is now `incompleteProof`; so that hints do not steer players into it, guidance sends a folder to the desk only once it carries a non-hint proof (and prefers stations that give one), and the balance bot cites a non-hint justifying stamp when it holds one; all three read the one rule `countsAsProof` (`packages/shared/src/sim/content.ts`) | Design doc: the detector gives a probability, not proof; refines the 2026-10-06 rule "a justifying stamp the team collected" for hint-only stations |
| 2026-10-13 | Level end (S7-03): `levelOutcome.lossReason` is `'credibility'`, `'score'` or null (won); folders still in play when the level ends are recorded as `unfinished` (0 / 0, missed proof listed), one result per botRaid wave as with expiry; `levelEnd` gains `lossReason`, `starThresholds` and `maxScore` (`maxLevelScore` of the played level, exported from `@redakcja/content`; both null in endless) until the generated run provides them in M2 | The results screen can say why a level was lost and how far the next star was, and every folder of the level appears in the summary |
| 2026-10-13 | Difficulty (S7-16): four room difficulties `easy` / `normal` / `hard` / `expert` (`DIFFICULTY` presets in constants.ts, provisional until S7-35). Normal is the identity (every factor 1); harder presets shorten deadlines, spawn gaps and minigame time and lengthen work, lockout and penalties; rewards are never scaled, so a run's `maxScore` depends on difficulty only through its folder count. The simulation sees only `SimTuning` (work, lockout, penalty factors); minigame limits are client rules from `difficulty.ts`: a minigame that allows two or more mistakes gains or loses `extraMistakes` but never drops below `MINIGAME_MIN_MISTAKES`, one-mistake minigames (phone, AI scanner) stay at one. Ekspert alone turns off hints and the answer reveal. `ENDLESS_MIN_DECK` is 4 (tasks.md), not the cluster draft's 6 | One shared vocabulary and pure helpers before the sim, server, bag and UI tasks build on them; Normal keeps today's balance and every existing test value |
| 2026-10-13 | Touch key hints (S7-15) sit where keyboard and pad hints sit, under the minigame, as chips naming the gesture („Stuknij”, „Przesuń”, „Przeciągnij”) or the on-screen button. On a 360 px tall landscape phone the hint row (about 40 px with its gap) does not fit: Lupa obrazu, Archiwum and Skaner AI, which fitted before, now scroll their overlay body by 24–37 px, and Kartoteka and Biblioteka danych already overflowed (90 px, 6 px). There the hints are reached by scrolling, not pinned; every control stays above the fold except Kartoteka's „Odłóż kartę”, which was already below it | A pinned hint bar would cover the minigame's bottom row and its main buttons; real phone browsers are shorter still, so a phone-height minigame layout pass (Backlog) is the fix, not per-pixel trimming |
| 2026-10-13 | Station help copy (S7-15): `pl.stationHelp.kinds[kind].proves` carries no „Dowód:” prefix (it lives once in `stationHelp.proofLabel`); purposes are questions; contest `STATION_PURPOSE` now reads these purposes instead of the design doc's „Co sprawdza” phrases, and the committed map legends change at the next `contest:build` (S7-66, S7-106) | One source for station copy, every in-play line ≤ 8 words (unit-tested); contest artefacts are regenerated by their refresh tasks |
| 2026-10-13 | Next folder in snapshots (S7-08, rides on `PROTOCOL_VERSION` 3): `snapshot.nextFolder` is `{atMs, sinceMs}` of the next **scheduled** entry from `nextSpawnIndex` on (`nextScheduledSpawn`, `sim/folders.ts`), skipping entries whose story is missing as spawning does; `sinceMs` is the due time of the previous scheduled entry (0 before the first), not its actual arrival, so it is a pure function of the schedule; null once the schedule is used up. An entry held by a full belt keeps its past `atMs` while `snapshot.conveyorFull` (`conveyorBlocked`: due, and no conveyor tile free) is true. Level-event folders are never announced | The HUD counts down and fills the conveyor ring from server data, so endless and later difficulty-scaled schedules stay correct without client-side schedule logic |
| 2026-10-13 | Public config contract (S7-67, no wire bump): `publicConfigSchema` {revision, siteOrigin, features, defaultDifficulty, motd, ads} in `packages/shared/src/public-config.ts` is its own schema, never a pick of the server config, and not strict, so an older client strips keys it does not know. Feature flags default to `roomBrowser: false` and `versus` / `spectators` / `intro` true. Ads carry a mode: `limited` (Google's limited ads: no cookies, no local storage, no personalisation) or `nonPersonalized`; personalised ads are not in the schema, and while `ageTreatment` is `teen` (the default) or `child` only `limited` parses (`adModeAllowed`, for the server config to reuse). Unlike the cluster draft, the public ads block carries no domain list (the server matches the request host itself), a MOTD is one paragraph of at most `MOTD_MAX_CHARS` = 140 without control characters or Unicode line and paragraph separators, and `siteOrigin` parses to its bare origin (`new URL().origin`). `normalizeHost` keeps a bare IPv6 literal whole and returns null for anything malformed after a bracketed one. `CSP_NONCE_PLACEHOLDER` sits in the import-free `csp-nonce.ts` so vite.config can read it | Many players are under 16 and cannot validly consent to ad cookies or storage (Polish GDPR age of consent; review: the ads plan had no legal gate for minors), so user decision 11 (non-personalised ads) narrows to limited ads for minors; rooms of minors are never listed publicly unless an operator opts in |
| 2026-10-13 | Sim tuning (S7-17, `PROTOCOL_VERSION` 4): `SimContext.tuning` is required (the server tick and the balance harness pass `NORMAL_TUNING` until S7-23 / S7-34; `testContext` defaults it). Work time is `round(STATION_WORK_MS × role factor × workTimeFactor)`; the lockout is `round(MINIGAME_FAIL_LOCKOUT_MS × lockoutFactor)` (`tunedLockoutMs`, which `failLockoutMs` reuses) and `minigameFailed.lockoutMs` announces it. Every penalty (wrong verdicts, expiry, the correction's credibility loss) is `scalePenalty(v, penaltyFactor)` = `Math.sign(v) × Math.round(Math.abs(v) × f)`, so a half rounds away from zero on both signs (−37.5 → −38, 7.5 → 8), not the cluster draft's negatives-only rule; a filed correction gives back half the scaled loss (30 → 15 on Ekspert). Rewards, half points, the speed and boss-call bonuses and the correction filing score are never scaled. On the client the lockout note takes its length from the event (a local failure shows the last announced length until the event replaces it) and the station's lockout ring drains against the announced total (Normal's 3 s after a reconnect). `folderExpired` carries no deltas, so the HUD expiry toast still shows Normal's values; it scales them once the client knows the room's difficulty (S7-24 scope) | Difficulty must reach the authoritative sim before the lobby can pick it (S7-23); one rounding rule for every scaled penalty; without the room's difficulty on the wire the client cannot know a scaled lockout |

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
- [ ] Mobile reference devices for performance testing (which phones do students actually have?).
- [ ] Phones: same-room play next to laptops, or also fully mobile groups? (Affects how much text
  the phone layout must fit.)
