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

- [ ] **S3-01 — Level 1 content.** 15 stories for "Pierwszy dzień — Burza nad miastem"
  (old photo as new, fake institutional account), including the design-doc examples; images
  CC0/self-made with credits; `reviewed: false` until the supervisor signs off.
- [ ] **S3-02 — Debrief screen (Kolegium).** List of the level's stories with what it was,
  technique, tool, real-world analogue; player's verdicts vs correct; blunder-of-the-day vote
  (tallies stored per story in SQLite via Drizzle, exposed on `/api/stats/blunders` for the
  supervisor); stars.
- [ ] **S3-03 — Briefing screen.** 15–20 s topic of the day + new mechanics, skippable when all
  ready.
- [ ] **S3-04 — Level select / campaign map (minimal).** Levels with stars, locked/unlocked;
  progress stored per browser (localStorage, no accounts).
- [ ] **S3-05 — First assets.** Kenney CC0 newsroom furniture and **rigged** characters with role
  accessories, folder models per type; `CREDITS.md`; stay within the desktop and mobile budgets.
- [ ] **S3-06 — Character animation v1.** Skeletal clips via `AnimationMixer` (idle, walk, run,
  carry-walk, work-at-station, stamp, cheer, facepalm) with cross-fades driven by player state;
  procedural layer kept (lean, squash); animation LOD (lower update rate for far/off-screen
  characters on mobile).
- [ ] **S3-07 — Ambient life.** Newsroom ambience (room tone, distant phones, printers),
  idle props animation (ceiling fans, monitor flicker — respects no-flash, paper stacks wobble),
  dust motes particles in light beams (desktop "high" preset only).
- [ ] **S3-08 — Screen and UI animation pass.** Briefing intro (newspaper spin-in), debrief
  stamps slamming onto story cards one by one, star reveal with sound, vote animation; all
  skippable and reduced-motion aware.
- [ ] **S3-09 — Playtest kit.** `docs/playtests/` with a session script, observation sheet and a
  short student questionnaire; device checklist (school laptops, students' phones); log results
  as new tasks/balance notes.

**Stage 3 exit:** Level 1 playable end to end with debrief, animated characters, ambience and
feedback on desktop and phones; first playtest held.

---

## Stage 4 — Remaining stations, events and levels

- [ ] **S4-01 — Phone (`phone`).** Choose the right number, then a waiting queue; reporter skips
  the queue.
- [ ] **S4-02 — AI scanner (`aiScanner`).** Probability readout with error margin; never decisive
  alone (enforced by content validation).
- [ ] **S4-03 — Data library (`dataLibrary`).** Compare a number with the original table.
  (S4-01…S4-03: keyboard, gamepad and touch; success/failure cues.)
- [ ] **S4-04 — Managing editor ability.** Extend one folder's deadline once per level.
- [ ] **S4-05 — Event framework + `viral`.** Event scheduling from level data; growing share
  counter on a folder. Each event below ships with its own announce banner, sound and particles
  (e.g. `viral`: floating share/heart icons and notification pings; `bossCall`: ringing red
  phone, shaking desk; `botRaid`: swarm of identical folders with glitch effect; `outage`: sparks,
  smoke and powered-down station; `correction`: siren + highlighted folder trail).
- [ ] **S4-06 — `bossCall`.** Editor-in-chief demands instant publish; points only if true.
- [ ] **S4-07 — `botRaid`.** Wave of near-identical folders; recognising one resolves all.
- [ ] **S4-08 — `outage`.** A station is down for 20 s.
- [ ] **S4-09 — `correction`.** A previously published story turns out manipulated; first team
  member to file a correction recovers half the lost credibility.
- [ ] **S4-10 — Levels 2–6 content.** ~15 stories each, following the campaign table; one task per
  level (`S4-10a` … `S4-10e`) so content can be written in parallel.
- [ ] **S4-11 — Endless mode.** Random stories from all levels, speeds up every minute; room
  leaderboard per room and global top list stored via Drizzle (`leaderboard_entries`), served
  from `/api/leaderboard` with retention from `constants.ts`.

**Stage 4 exit:** full campaign (6 levels) and endless mode playable.

---

## Stage 5 — Presentation

- [ ] **S5-01 — Final models and newsroom art pass** (low-poly, paper/wood palette, editorial red).
- [ ] **S5-02 — Character animation polish** (role-specific idles and celebrations, emotes on
  pings, hand IK on folders, footstep sync with sounds, blend tuning).
- [ ] **S5-09 — VFX polish.** Final particle art (ink, paper, confetti, sparks, smoke, glitch),
  stylised outlines/toon shading pass within budget, screen-space touches (vignette on low
  credibility, subtle chromatic glitch on `botRaid`) — all disabled by reduced motion / low
  quality.
- [ ] **S5-10 — Haptics and controller polish.** Tuned vibration patterns per cue on Android and
  gamepads; rumble intensity setting.
- [ ] **S5-03 — UI art pass** on top of the S1-17 foundation: final textures, complete icon set,
  final stamp lettering, every screen re-checked against the design rules and the reference board.
- [ ] **S5-04 — Technique encyclopedia** with unlockable cards and in-game examples.
- [ ] **S5-05 — Accessibility** (colour-blind safe palette audit, text scaling, no-flash mode,
  reduced motion, subtitles/visual equivalents for every audio-only cue, full gamepad and
  touch navigation in menus, left-handed touch layout option).
- [ ] **S5-06 — Settings screen** (quality preset, volumes per bus, accessibility, haptics,
  touch control size/opacity, controls help per input device).
- [ ] **S5-07 — Loading and performance** (asset progress bar, ≤10 MB first load, compressed
  textures (KTX2) and Draco/meshopt models, 60 FPS on UHD 620 and the mobile reference devices,
  adaptive quality that drops particles/shadows/DPR when frame time rises, instancing audit).
- [ ] **S5-08 — Full audio pass** (per-level music, all SFX final, mix and loudness pass,
  stingers for events, voice-less "gibberish" newsroom chatter).

---

## Stage 6 — Balance and contest materials

- [ ] **S6-01 — Balance** station times, deadlines, points and star thresholds from playtest data.
- [ ] **S6-02 — Content review** — supervisor signs off all stories (`reviewed: true`).
- [ ] **S6-03 — Contest materials** in `docs/contest/`: screenshots of every screen, labelled
  newsroom map, role cards, 3–4 sample folders with stamps, 60–90 s gameplay video, criteria
  mapping.
- [ ] **S6-04 — Production deploy and smoke test** on a school-like network (port 443 only) with
  the device matrix from [`../agents/platforms.md`](../agents/platforms.md).

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
