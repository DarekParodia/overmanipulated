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
- [x] **S4-04 — Managing editor ability.** Extend one folder's deadline once per level. *(Superseded by Przedłużenie, S7-37.)*
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
- [x] **S7-04 — Desk result screen and one outcome vocabulary.** *Depends on:* S7-03. [Details](design/stage7/tasks.md#s7-04)
- [x] **S7-05 — Results model: totals, star progress, loss reason, per-folder cards, reveal plan.** *Depends on:* S7-03. [Details](design/stage7/tasks.md#s7-05)
- [x] **S7-06 — Results summary: loss lede, star captions, points to next star, thresholds explainer, totals table, phone page 0.** *Depends on:* S7-05. [Details](design/stage7/tasks.md#s7-06)
- [ ] **S7-07 — Kolegium per folder: reason line, credibility chip, deciding proof, unfinished folders.** *Depends on:* S7-04, S7-05. [Details](design/stage7/tasks.md#s7-07)
- [x] **S7-08 — Next-folder timing and conveyor-full flag in snapshots.** *Depends on:* S7-03. [Details](design/stage7/tasks.md#s7-08)
- [x] **S7-09 — Next-folder UI: ghost card, 'Taśma pełna', conveyor sign ring, guidance hint.** *Depends on:* S7-08. [Details](design/stage7/tasks.md#s7-09)
- [x] **S7-10 — In-game menu button and sheet (with solo pause) replacing tool buttons and room chip.** *Depends on:* S7-01, S7-03. [Details](design/stage7/tasks.md#s7-10)
- [ ] **S7-11 — One-row phone HUD pill and measured HUD band.** *Depends on:* S7-10, S7-09. [Details](design/stage7/tasks.md#s7-11)
- [ ] **S7-12 — HUD-aware follow camera and 640x360 Playwright project.** *Depends on:* S7-11. [Details](design/stage7/tasks.md#s7-12)
- [x] **S7-13 — Folder spawnKey, per-folder minigame seeds and stable Kartoteka card (sim).** *Depends on:* S7-03. [Details](design/stage7/tasks.md#s7-13)
- [x] **S7-14 — Kartoteka client: same card on retry, no reveal, circled fields kept, time resumes after cancel.** *Depends on:* S7-13. [Details](design/stage7/tasks.md#s7-14)
- [x] **S7-15 — Touch key hints and station help copy for the six stations.** *Depends on:* S7-01. [Details](design/stage7/tasks.md#s7-15)

### M2 — Bag, difficulty, multi-stamp

- [x] **S7-16 — Difficulty vocabulary, Stage-7 balance constants, pure difficulty helpers.** *Depends on:* S7-03. [Details](design/stage7/tasks.md#s7-16)
- [x] **S7-17 — Sim tuning (work, lockout, penalties) and lockout on the wire (protocol v4).** *Depends on:* S7-16. [Details](design/stage7/tasks.md#s7-17)
- [x] **S7-18 — Multi-stamp folders: content field, validation, bonus, spawn extra time.** *Depends on:* S7-16, S7-03. [Details](design/stage7/tasks.md#s7-18)
- [x] **S7-19 — Desk multi-select, folder-card evidence badge, multi-stamp guidance.** *Depends on:* S7-18, S7-04. [Details](design/stage7/tasks.md#s7-19)
- [x] **S7-20 — Station bag core.** *Depends on:* S7-18. [Details](design/stage7/tasks.md#s7-20)
- [x] **S7-21 — Level file schema split, generateBagLevel, prepareRun and pool validation.** *Depends on:* S7-20. [Details](design/stage7/tasks.md#s7-21)
- [x] **S7-22 — Endless on the station bag with difficulty and separate RNG streams.** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-22)
- [x] **S7-23 — Server run lifecycle, difficulty and bag station on the wire.** *Depends on:* S7-21, S7-17. [Details](design/stage7/tasks.md#s7-23)
- [ ] **S7-24 — Client difficulty rules: minigame time, mistakes, reveal, hints, bag-station guidance.** *Depends on:* S7-23, S7-14, S7-19. [Details](design/stage7/tasks.md#s7-24)
- [ ] **S7-25 — Lobby difficulty picker, run folder count and thresholds in the briefing.** *Depends on:* S7-23. [Details](design/stage7/tasks.md#s7-25)
- [ ] **S7-26 — Progress and endless leaderboard per difficulty (server and client).** *Depends on:* S7-23. [Details](design/stage7/tasks.md#s7-26)
- [x] **S7-27 — Content l0 Makieta: 7 new stories and conversion to the bag.** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-27)
- [x] **S7-28 — Content l1 Burza: 5 imageSearch-only stories and conversion to the bag.** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-28)
- [x] **S7-29 — Content l2 Wybory: 3 imageSearch-only stories and conversion to the bag.** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-29)
- [x] **S7-30 — Content l3 Afera part 1: 6 stories (imageSearch 4, sourceRegistry 2).** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-30)
- [x] **S7-31 — Content l3 Afera part 2: 4 archive-only stories and conversion to the bag.** *Depends on:* S7-30. [Details](design/stage7/tasks.md#s7-31)
- [x] **S7-32 — Content l4 Zdrowie part 1: 5 stories (archive 4, phone 1).** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-32)
- [x] **S7-33 — Content l4 Zdrowie part 2: 4 stories, decisive-stamp cleanup, multi-stamp picks, conversion to the bag.** *Depends on:* S7-32, S7-18. [Details](design/stage7/tasks.md#s7-33)
- [ ] **S7-34 — Balance harness: difficulty, bag runs, multi-stamp bot, retry model, station load.** *Depends on:* S7-21, S7-22, S7-18, S7-13, S7-17. [Details](design/stage7/tasks.md#s7-34)
- [ ] **S7-35 — M2 balance pass and documentation.** *Depends on:* S7-34, S7-27, S7-28, S7-29, S7-31, S7-33, S7-19, S7-24, S7-25, S7-26. [Details](design/stage7/tasks.md#s7-35)

### M3 — Roles and abilities

- [x] **S7-36 — Ability contracts, crew state, role perks and station families (protocol v5).** *Depends on:* S7-17, S7-23. [Details](design/stage7/tasks.md#s7-36)
- [x] **S7-37 — stepAbilities: Przedłużenie, Koło ratunkowe, Telefon z terenu; remove the old extension.** *Depends on:* S7-36. [Details](design/stage7/tasks.md#s7-37)
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
- [x] **S7-50 — Layout validation: station sign spacing and reachability.** *Depends on:* S7-21. [Details](design/stage7/tasks.md#s7-50)
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
- [x] **S7-98 — Voice audio bus, voice loader, voice volume, deeper ducking.** *Depends on:* S7-01. [Details](design/stage7/tasks.md#s7-98)
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
| 2026-10-13 | Next-folder UI (S7-09), details the design left open: the ghost card has a soft `--surface-soft` fill, not "no fill"; an empty queue shows one ghost on its side that carries the words („Nowa teczka za N s”) instead of a ghost plus a second text, says „Czekamy na teczki” until the first snapshot and „To już wszystkie teczki” only once the schedule is used up; `queueView` always shows at least one card, and `useQueueCapacity(sectionRef, contentKey)` re-measures (layout widths, so a popping or shaking card measures right) whenever the number of folders changes, because a card's width is known only once one is rendered; guidance says „Czekaj – teczka za N s” while the next folder is at least 1 s away and „Taśma pełna – zabierz teczkę” for the conveyor pick-up while the belt is full, but a folder's own event hint still wins (both point at the same most urgent conveyor folder); the wait hint's bubble pops in once and reads the static „Czekaj na nową teczkę” to screen readers, not a per-second announcement. As specified, the ghost needs a free slot, so on the shipped maps (4–5 conveyor tiles, so a full belt means at least 4 folders in play) the orange „Taśma pełna” ghost does not show: there the conveyor sign („Pełna”, orange ring), the caption and the guidance hint carry the full belt | The queue sits over the 3D scene, so text needs a fill to keep 4.5:1 contrast on any background; the same seconds must not show twice; the most urgent folder must never be hidden; an event hint says more about the folder the player is sent to |
| 2026-10-13 | Public config contract (S7-67, no wire bump): `publicConfigSchema` {revision, siteOrigin, features, defaultDifficulty, motd, ads} in `packages/shared/src/public-config.ts` is its own schema, never a pick of the server config, and not strict, so an older client strips keys it does not know. Feature flags default to `roomBrowser: false` and `versus` / `spectators` / `intro` true. Ads carry a mode: `limited` (Google's limited ads: no cookies, no local storage, no personalisation) or `nonPersonalized`; personalised ads are not in the schema, and while `ageTreatment` is `teen` (the default) or `child` only `limited` parses (`adModeAllowed`, for the server config to reuse). Unlike the cluster draft, the public ads block carries no domain list (the server matches the request host itself), a MOTD is one paragraph of at most `MOTD_MAX_CHARS` = 140 without control characters or Unicode line and paragraph separators, and `siteOrigin` parses to its bare origin (`new URL().origin`). `normalizeHost` keeps a bare IPv6 literal whole and returns null for anything malformed after a bracketed one. `CSP_NONCE_PLACEHOLDER` sits in the import-free `csp-nonce.ts` so vite.config can read it | Many players are under 16 and cannot validly consent to ad cookies or storage (Polish GDPR age of consent; review: the ads plan had no legal gate for minors), so user decision 11 (non-personalised ads) narrows to limited ads for minors; rooms of minors are never listed publicly unless an operator opts in |
| 2026-10-13 | Sim tuning (S7-17, `PROTOCOL_VERSION` 4): `SimContext.tuning` is required (the server tick and the balance harness pass `NORMAL_TUNING` until S7-23 / S7-34; `testContext` defaults it). Work time is `round(STATION_WORK_MS × role factor × workTimeFactor)`; the lockout is `round(MINIGAME_FAIL_LOCKOUT_MS × lockoutFactor)` (`tunedLockoutMs`, which `failLockoutMs` reuses) and `minigameFailed.lockoutMs` announces it. Every penalty (wrong verdicts, expiry, the correction's credibility loss) is `scalePenalty(v, penaltyFactor)` = `Math.sign(v) × Math.round(Math.abs(v) × f)`, so a half rounds away from zero on both signs (−37.5 → −38, 7.5 → 8), not the cluster draft's negatives-only rule; a filed correction gives back half the scaled loss (30 → 15 on Ekspert). Rewards, half points, the speed and boss-call bonuses and the correction filing score are never scaled. On the client the lockout note takes its length from the event (a local failure shows the last announced length until the event replaces it) and the station's lockout ring drains against the announced total (Normal's 3 s after a reconnect). `folderExpired` carries no deltas, so the HUD expiry toast still shows Normal's values; it scales them once the client knows the room's difficulty (S7-24 scope) | Difficulty must reach the authoritative sim before the lobby can pick it (S7-23); one rounding rule for every scaled penalty; without the room's difficulty on the wire the client cannot know a scaled lockout |
| 2026-10-13 | Stable Kartoteka card (S7-13): `GameState.rng` became a constant match `seed`; every minigame seed is `minigameSeedFor(seed, spawnKey, kind, attempt)` (FNV-1a mixed with the seed, then one mulberry32 step; `sim/rng.ts`), read through `drawMinigameSeed` (`sim/stations.ts`). `minigameAttempts['spawnKey:kind']` (sim-only) counts the rounds that ended without a stamp: a failure, a cancel, or an outage cutting the round short (a round cut short by its player leaving the game does not count). Stations in `MINIGAME_STABLE_SEED_STATIONS = ['sourceRegistry']` never count, so a Kartoteka retry after a failure or a cancel shows the same card; every other station gets a fresh puzzle on each retry. The station overlay forgets a settled round when the station leaves the minigame phase, since a retry can reuse the round id | Cancelling the Kartoteka rerolled the card, so peeking at a new card beat reading the one shown, and a failed card the player had half-solved vanished; derived seeds also make puzzles independent of the order in which stations are used |
| 2026-10-13 | Spawn key derivation (S7-13): the schedule spawner gives `s<scheduleIndex>` (a delayed entry keeps its index, a skipped one leaves a gap); `startFolderEvent` gives `e<eventIndex>.<waveIndex>` (wave index 0 for events other than `botRaid`); endless runs use the same spawners. Folders and every folder result carry the key; `folderExpired` carries it too, so expiry results get it after the folder is gone (a rider on protocol 3 beyond the ledger's folder and result fields) | Versus fairness: two newsrooms with the same seed get the same story and the same puzzles under the same key even when their belts differ. A team that meets a botRaid with a fuller belt gets fewer raid folders, but the keys it does get match the other team's (belt-full raid fixture test) |
| 2026-10-13 | Kartoteka retry on the client (S7-14): `stations/minigames/retry-memory.ts` (zustand, not persisted, reset on `gameStarted`) keeps, per minigame seed, the fields the player circled and, after a cancel, the clock that was left. A card that comes back restores its circled warning signs (a circle on a clean field never lasts); mistakes and struck fields start fresh, and the task line reads „Ta sama karta: dokończ zakreślanie”. A failure reveals nothing: the dashed missed rows and „Przerywane: tego szukaliśmy” are gone, and „Źle zakreślone” is followed by „Karta na ciebie poczeka.” (one sentence instead of the design's two, so the banner stays within 8 words). Only a cancel (Esc, B, ✕) stores the clock: the next round starts from the time left, at least `KARTOTEKA_RESUME_MIN_MS = 5000` (a client constant); after a failure the clock restarts in full, and an outage or a level end stores nothing. Until S7-24 adds `MinigameProps.resumeMs`, the station overlay reads the clock from the memory itself, for stations in `MINIGAME_STABLE_SEED_STATIONS`. The memory and the resume are per client, like every minigame limit: a teammate who retries sees the same card without the circles, a reload forgets them, and a modified client can ignore them | With a stable card, putting it down and coming back would buy a fresh clock (the cancel-and-retry loophole), and a half-solved card would lose its circles on a failure; the lockout stays the cost of failing |
| 2026-10-13 | Multi-stamp folders (S7-18): `storySchema.requiredStamps` (1–3, default 1). A multi-stamp story that needs more proofs than it has justifying non-hint stamps is a story schema error, whatever the level (so `requiredStamps` 2 on an AI scanner + phone story fails there); a classic story justified only by the AI scanner keeps the more specific `checkStory` errors. `checkStoryFitsLevel` errors when the level's stations give fewer proofs than required (`proofCount`, the one count shared with endless `isSolvable` over `ENDLESS_STATIONS`) and warns below `MULTI_STAMP_FIRST_LEVEL`. Every spawned folder, scheduled or from an event, gets `multiStampExtraMs` = (N − 1) × `MULTI_STAMP_EXTRA_DEADLINE_MS`, so the speed bonus is measured against the longer time and the content warning 'deadline runs past the end of the level' counts it too; a correct verdict pays `bonuses.multiStamp` = (N − 1) × `SCORE.multiStampBonus` (never scaled by the difficulty), which `maxStoryScore` includes. `l2-wybory.test.ts` became `solvable.test.ts` (every scheduled and event story of every level and the endless preview); its level 2 layout checks moved to `checks.test.ts` | Cluster A's story check (`requiredStamps` ≤ justifying stamps, one of them not the AI scanner) predates the S7-03 hint-only rule; counting only non-hint proofs reports a story no level can ever solve on the story, not on every level that schedules it |
| 2026-10-13 | Voice bus (S7-98): `loadVoice(clips)` takes the clip table as an argument instead of importing `intro/voice-sprite.json` itself (S7-101 passes the clips of the sprite that S7-100 generates). `voiceStatus()` (`unloaded` / `muted` / `locked` / `ready`) is added so the intro can choose fallback timing and show the „Stuknij, by włączyć głos” chip; `locked` reads `navigator.userActivation.hasBeenActive`, else Howler's audio context state, and `muted` also covers master × Lektor at 0. A failed load is not retried. The ducker gains `release(depth)`, and `stopVoice` / a line's stop function release the voice dip at once. `busVolume` moved to the pure `fx/audio/mix.ts` and `installMasterLimiter` to `fx/audio/limiter.ts` | The sprite json does not exist before S7-100 and the build cannot import a missing file; `audio-manager.ts` calls `applyVoiceVolume` from `initAudio`, so `voice.ts` must not import `audio-manager.ts` back; a skipped line must not keep the music ducked for the rest of the clip |
| 2026-10-13 | Station bag core (S7-20, `packages/content/src/bag.ts`, no wire change): `decidingStations` (the tasks.md name; cluster A's `decisiveStations`) reads `proofCount`, so a decisive stamp that does not justify, or a hint-only one, decides nothing. `matchStories` makes the slot preferences as hard as the pool allows instead of cluster A's soft stable partition: pass 1 matches every slot to its preferred stories only (opening slots `BAG_OPENING_SLOTS`: one proof and not urgent; slots before `BAG_MULTI_STAMP_MIN_SLOT`: one proof), pass 2 lets a still-empty slot take a free story it avoids itself (later slots first), pass 3 runs Kuhn's augmenting paths over every candidate; augmenting never unmatches a slot, so the result is still a maximum matching (tested against a plain Kuhn on 300 random pools). `assignStories` fills an empty slot with the least-used story its station decides (the whole pool when it decides none), then one that is not its neighbour, then one that suits the slot, then pool order; it throws only for an empty pool (the S7-21 schema requires 2 ids). `bagSlotTimes` takes a structural `BagTiming` {firstAtS, gapS, lastSpawnS} until S7-21 adds `levelBagSchema`, compares the times after rounding to 0.1 s and rejects a gap that is not positive. `starThresholds` keeps two stars at least one step, three stars at least a step above two and, when that allows, not above the largest multiple of the step within the maximum. `pinnedCounts` returns a map with an entry for every bag station, 0 included. `bagDrawer` replaces endless `storyDrawer` with the same RNG draws, so endless runs are unchanged until S7-22 | The README promises that multi-stamp stories come only from slot 4 on and that opening slots get easy folders; a soft order alone lets an augmenting path push an avoided story onto an earlier slot. Feasibility still wins, so a pool that can cover a run never repeats a story |
| 2026-10-13 | One outcome vocabulary (S7-04): `pl.outcome.title[reason]` titles the verdict toast, the desk result and the Kolegium card alike, so a wrong verdict is named by what happened (rejecting a misleading story is „Wystarczył kontekst”, not „To była prawda!”); `pl.outcome.group[outcome]` names the outcome marks for screen readers. The old per-screen lists (`pl.desk.outcomes`, `pl.results.outcomes`, the `pl.hud.toast` titles) and every „Zabrakło” list are gone; until S7-07 the Kolegium lists the deciding proof nobody checked under „Dowód, który rozstrzygał” with a „nie sprawdzono” chip, never a hint-only stamp | Three vocabularies described one result three ways; the desk listed uncollected stamp texts as „Zabrakło” even after a correct verdict |
| 2026-10-13 | Desk result lines (S7-04, `stations/desk-result-model.ts`): at most two lines with station chips (icon + short name, never stamp text): correct → „Dowód:” with the cited stations that count as proof; weak proof → „Ten dowód niczego nie rozstrzyga” + „Rozstrzyga:”; only the AI scanner cited → „Skaner AI to tylko wskazówka” + „Rozstrzyga:”; too few proofs → „Dowody: k z N” + „Rozstrzyga:”; wrong verdict (and expiry or end of level) → „Właściwy werdykt:” + „Dowód był w teczce:” (deciding proof the folder carried) or „Nie sprawdzono:” (the level's deciding stations). Deciding = justifying, non-hint stamp from a station on the level's map. The lines are the same on every difficulty, Ekspert included (cluster F proposed hiding them there): the folder is closed, so this is a debrief of a decision, not a minigame reveal. Results stay up 4 s after a correct verdict and 6.5 s otherwise; bonus chips (tempo, dowody, szef) show icon, label and points, on phones icon and points only (the label stays for screen readers); on phones „Dalej” is a regular 48 px button, so two lines fit 640×360 without scrolling. Until S7-20 adds `decidingStations`, the desk computes the deciding stations itself from `countsAsProof` | Players saw a ✗ without learning the right verdict or which station decides; the extra time after a mistake is for reading it |
| 2026-10-13 | Desk evidence pick (S7-19, `stations/desk-model.ts`): a one-proof story keeps the old pick (a stamp replaces the previous one; on keyboard and gamepad, confirming a stamp jumps to „Publikuj”). A multi-stamp story (N ≥ 2) toggles stamps up to N, shown with numbered ticks (1, 2, 3) in the order picked, „Wybierz N dowody” with a „k/N” chip, a hidden status „Wybrano k z N dowodów” and `aria-pressed`; the verdict buttons open when the pick holds `min(N, collected)` stamps, and keyboard / gamepad focus jumps to „Publikuj” then. A pick beyond N is blocked: `ui.back`, the row nudges (none with reduced motion) and a blue info line „Najpierw odznacz jeden dowód” shows until the next pick. A folder with fewer stamps than N is still decided (cite them all) under an amber „Za mało dowodów: połowa punktów” line. Unpicking plays the new cue `desk.unjustify`. The verdict command sends the pick in its order. The multi-stamp bonus chip on the desk result already shipped with S7-04 („Premia za dowody”, icon and points), so the cluster's „Premia za komplet dowodów +n” copy is not added | One rule per input device that still feels like today's desk for one-proof stories; collected stamps are counted, never which of them prove, so the desk leaks nothing |
| 2026-10-13 | Folder-card evidence chip (S7-19, `evidenceBadge` in `hud/hud-model.ts`): a multi-stamp folder's queue card carries a stamp-icon chip centred on its top edge (clear of the type icon and the priority flags; on phones, where the card lies on its side, it hangs from the bottom edge so the countdown stays clear): „k/N” (distinct stamps on the folder that count as proof, capped at N; green once complete) when the plain „what next” hints setting is on, „×N” when it is off. It reads only the player setting until S7-24 adds the room's difficulty to the client and switches it to the effective-hints selector (setting AND `DIFFICULTY[d].hints`, so Ekspert shows „×N”); the hook is marked in `FolderCard.tsx`. `StoryInfo` gains optional `requiredStamps`, `stamps` (with `text`, so a `StoryInfo` still serves the debrief lookup) and `justifyingStamps`. Guidance (`next-step.ts`) now sends a folder to the desk only when `justifyingCount(folder, story) ≥ requiredStampsOf(story)` (`hasEnoughProofs`, replacing `hasJustifyingStamp`); until then it points at the missing proving stations | Guidance already points at the proving stations, so with hints on the count reveals nothing new; without hints the card must not tell which stamps decide |
| 2026-10-13 | Level files and runs (S7-21, no wire change): `levelFileSchema` takes a `schedule` with `stars` **or** a `bag` (`levelBagSchema`: pool ≥ 2 unique ids, `firstAtS ≤ lastSpawnS < durationS`, `deadlineS` per priority, optional `starShares` with three > two); a bag level file may not carry `stars`. `levelSchema` is the resolved level (schedule and stars always; schedule entries may carry the slot `station`; a bag level keeps its `bag`). `LEVELS`/`getLevel` resolve a bag level to its Normal preview (`BAG_PREVIEW_SEED` 0, in constants.ts). `generateBagLevel` (bag.ts) runs README §4 in order: slot times, station sequence (`createRng(seed)`), story matching on its own stream (`seed ^ hashText('bag.stories')`), deadlines `max(BAG_MIN_DEADLINE_S, min(scaledDeadlineS, durationS − atS − (N−1) × 20 s))` with the fit rounded to 0.1 s, event deadlines scaled at the same times, stars from the run maximum (events included). `scaledDeadlineS` (shared `difficulty.ts`) rounds to whole seconds and keeps Normal values exactly. New `run.ts`: `resolveLevel`, `applyDifficulty` (fixed schedules: deadlines only, stars kept), `prepareRun`, `runSummary` (its `runSummarySchema` sits in protocol.ts so S7-23 puts it on `roomState` without a second type); until S7-22 the endless run is `applyDifficulty(generateEndlessLevel(seed))`, deadlines only. `proofCount`, `maxStoryScore`, `maxLevelScore`, `levelNumberOf`, plus the new `levelStoryIds` and `storyBookFor`, moved to an import-free `rules.ts` (checks.ts re-exports them) so bag.ts and checks.ts do not import each other; `endlessStoryPool` already reads `levelStoryIds`, so a bag level's whole pool joins endless, not just its preview. `checkBag` reports coverage per difficulty and names the stations whose slots the maximum matching leaves empty in the first worst-case split that fails; the deadline-fit warning counts the multi-stamp extra on Normal. The 'decisive stamp does not justify' warning is a story check (it holds for every level, fixed or bag) and fires on 6 real stamps (l4 ×5, l6 ×1) until S7-33 and S7-58 clean them up; the CLI test lists them instead of expecting 0 warnings. The endless deck warning stays with S7-22 | One parse for authored and dealt levels with inferred types; every consumer of `LEVELS` keeps a full `Level`; the server can prepare a run per briefing (S7-23) from pure, seeded code |
| 2026-10-13 | Endless on the station bag (S7-22, `packages/content/src/endless.ts`, no wire change): `generateEndlessLevel(seed, levels, stories, difficulty = DEFAULT_DIFFICULTY)` deals like a bag level: the slot station comes from `bagDrawer` over `bagStations(pool, ENDLESS_STATIONS)` (`createRng(seed)`; today IS, A, SR, P, DL, the AI scanner is hint-only), its story from that station's deck (`endlessDecks`: pool stories the station decides, a flex story in each of its decks, `bagDrawer` per deck on the story stream `seed ^ hashText('endless.stories')`), drawn once more when it equals the previous folder's story (and, only for a one-story deck, the next station takes the slot). Spawn interval `endlessIntervalS(atS) × spawnGapFactor × jitter` on its own time stream; folder and event deadlines `scaledDeadlineS(endlessDeadlineS(atS))` (first folder 104 / 80 / 68 / 60 s); events on their own stream keep their times and kinds on every difficulty (their interval is not scaled); every schedule entry carries its `station`. Because the station and story streams do not depend on the difficulty, every difficulty deals the same station/story sequence and only its timing differs. `prepareRun` passes the difficulty instead of `applyDifficulty`. The `ENDLESS_MIN_DECK` warning is a whole-content check (`checkEndlessDecks`, filed under the pseudo-file `endless`, path `decks.<station>`), not part of the per-level `checkBag`, and is skipped while no campaign level above the greybox feeds the pool (fixture content). Every endless run for a given seed changes, so the endless survival numbers in `docs/balance.md` are re-measured by S7-34/S7-35 | The deck size depends on every level's stories at once, so it cannot be judged inside one level's `checkBag`; separate streams keep a difficulty change from reshuffling the stories, which makes difficulties comparable in balance runs |
| 2026-10-13 | Results model (S7-05, `debrief/results-model.ts`): totals put `incompleteProof` with `weakProof` in one 'weakProof' row (both are the `wrongJustification` outcome) and `bonuses.multiStamp` in a 'proofs' row; rows run rewards first (correct, correction, speed, proofs, bossCall) then losses (weakProof, wrong, expired, unfinished, other). The capped-results row `other` has count 0 and carries points only (credibility is clamped, so its difference is not a delta). Kolegium cards are per folder in campaign (and versus later); in endless a story's card keeps its first folder's outcome, reason, verdict and missed proof and sums points, credibility and bonuses into `count` folders. `revealPlan` takes an optional `progress` flag (default true) so endless and the old stars-then-marks reveal (`revealTimes`, now a wrapper) leave out the progress step; the pause after the rows is measured from the last row (520 / 940 / 1620 / 1920–2200 / 2460, 2840). | Matches the literal design tests while keeping `revealTimes` timing unchanged; first-folder facts keep grouped cards stable as a run grows |
| 2026-10-13 | Results summary (S7-06, `hud/ResultsSummary.tsx`): on desktop the points and credibility figures move from the summary column into the ribbon (right side) and the column widens to 18–24rem, so the stars with captions, the progress line, the open „Skąd te progi?” explainer and a six-row „Za co punkty” table fit 1366×768 without scrolling (keyboard and gamepad cannot scroll it; more rows scroll with the mouse). The explainer starts open except on touch phones, because a `<details>` cannot be opened by keyboard or gamepad here (Tab is the vote key). The phone page has two columns — lede, progress line, the star rule as a list of small stars and the explainer on the left, the table on the right with tight banded rows — so six rows and „Razem” fit 640×360 (about 165 px are free there, not the 232 px the design assumed; e2e asserts it); longer tables and the credibility note scroll by touch. The explainer's summary keeps a 48 px hit area around its 32 px line. The progress line appears silently (no cue); rows use `debrief.row`. The difficulty chip by the headline waits for S7-16 (no difficulty on the wire yet). Phone pages: page 0 is the summary, card i is page i + 1, the index resets when the layout switches. | Every part of the summary stays reachable with every input on the reference screens; the ribbon had free room on desktop |
| 2026-10-13 | Level 1 on the bag (S7-28, no wire change): `l1-burza` deals from a 20-story pool (the 15 old stories plus 5 new photo stories pinned to the Lupa obrazu: 2 true, 2 false, 1 misleading; 7 of 20 true) with bag {4, 22, 312, 55/60/40, starShares 0.55/0.85}; `checkBag` reports nothing (8 pinned stories on each station, target ⌈15/2⌉ = 8). Tests that need a level with an authored schedule (`run.test.ts` fixed-level cases, the server `levelEnd` thresholds test) now use `l5-deepfake` ({240, 350}, max 435), which keeps its schedule until M4; level 1 gets bag tests instead | l1 no longer has authored stars or a fixed schedule; l5 is the last fixed level through M3, so these fixtures will not churn again until S7-60 |
| 2026-10-13 | Content l4 Zdrowie part 1 (S7-32, no wire change): five new `reviewed:false` stories, each with one stamp per l4 station and exactly one proof, so each is pinned: archive `l4-tlumy-na-sorze` (old photo, false), `l4-zimna-woda-po-obiedzie` (chain message, false), `l4-ratownik-o-kaskach` (cut quote, misleading), `l4-basen-zamkniety` (true); phone `l4-sobotnie-szczepienia` (true). Only the proof stamp is `decisive`, so none adds a decisive-not-justifying warning. l4 keeps its authored schedule until S7-33 converts it to the bag, so the five stories stay unscheduled for now (five 'not scheduled' warnings, no errors); the CLI test lists the l4 ones and derives the warning total from the listed warnings instead of a fixed count, so parallel content tracks do not fight over one number. `l4-zdrowie.test.ts` pins each story to its station with `decidingStations`/`isPinned` | Scheduling them now would change l4's stars and deadlines only for S7-33 to replace the schedule with a pool; the bag pool is where pinned stories count |
| 2026-10-13 | Content l3 Afera part 1 (S7-30, no wire change): six new `reviewed:false` stories, each with one stamp per l3 station and exactly one proof, so each is pinned: imageSearch `l3-zalana-sala` (old photo, false), `l3-dyrektor-na-plazy` (crude face swap, false, urgent), `l3-pusta-stolowka` (cropped photo, misleading), `l3-pracownia-robotyki` (true); sourceRegistry `l3-psycholog-z-sieci` (fake expert, false), `l3-zajecia-przed-matura` (true). Only the proof stamp is `decisive`. l3 keeps its authored schedule until S7-31 converts it to the bag, so the six stories stay unscheduled for now (six 'not scheduled' warnings, no errors); the CLI test lists the l3 ones, and `l3-afera.test.ts` pins each story to its station. The cropped-photo story is a canteen photo, not a school-play scene, so it does not repeat `l3-nagranie-krzykow` in the same run | Scheduling them now would change l3's stars and deadlines only for S7-31 to replace the schedule with a pool; the bag pool is where pinned stories count |
| 2026-10-13 | Server run lifecycle (S7-23, rides on `PROTOCOL_VERSION` 4): rooms start on `DEFAULT_DIFFICULTY`; `setDifficulty` is host only (a guest gets `notHost`), applies in the lobby only (ignored in the briefing, while playing and on the results screen), resets every ready flag even when the value does not change (like `selectLevel`) and persists across level changes and replays. `beginBriefing` deals the run (`prepareRun` from the selected level's `getLevel` base, so a replay from the results screen deals anew) with a run seed `floor(random() × 0x7fffffff)` drawn before, and apart from, the sim seed that `startLevel` draws; the seed stays in `inspect()` and never goes on the wire. From the briefing on, `room.level`/`room.stories` are the dealt run's, so the schedule, next-folder data and `levelEnd.starThresholds` follow the run; `levelEnd.maxScore` is `run.summary.maxScore`. `setLevel` no longer generates endless (the endless preview stays in the lobby, the run is dealt at the briefing) and `backToLobby` restores the selected level's preview with `run = null`; the results screen keeps the played run in `roomState.run`. The tick passes `simTuning(room.difficulty)`. The sim copies a schedule entry's `station` to `folder.bagStation` (event folders and authored schedules carry none). `recordLeaderboardEntry` receives `difficulty`, but `server.ts` drops it until S7-26 adds the column, so until then every stored run reads as Normal. Client: the app store keeps `difficulty` (the last room's, kept after leaving so S7-25/S7-26 pickers can default to it) and `run` (null without a room), set by `setRoom`/`clearRoom`; `session.setDifficulty` sends the action. No picker, string or cue yet: the lobby control, its Polish label and its feedback cue ship with S7-25 | Every attempt must deal a new run on the room's difficulty without letting clients predict the folder sequence; the leaderboard column and its migration belong to S7-26 |
| 2026-10-13 | Level 2 on the bag (S7-29, no wire change): `l2-wybory` deals from an 18-story pool (the 15 old stories plus 3 new photo stories pinned to the Lupa obrazu: `l2-debata-w-liceum` true, `l2-plaza-w-kampanii` false, `l2-wycinka-w-parku` misleading; 6 of 18 true, 6 of 18 publishWithContext) with bag {4, 24, 340, 55/60/45} and the default `STAR_SHARES`; `checkBag` reports nothing (pinned IS 5, A 5, SR 6, target ⌈15/3⌉ = 5; 12/15/16/18 folders by difficulty). The Normal preview (`BAG_PREVIEW_SEED`) has stars {210, 310} of a 385 maximum (the authored schedule had {206, 300} of 375). The level 2 publishWithContext-share test now reads the pool (≥ 25 %, 6 of 18) instead of the schedule, since a dealt run picks its own 12–18 stories | A dealt run differs per briefing, so only the pool is a stable place for the share; the star balance pass stays with S7-35 |
| 2026-10-13 | Content l4 Zdrowie part 2 (S7-33, no wire change): four new `reviewed:false` pinned stories, one stamp per l4 station and only the proof `decisive`: sourceRegistry `l4-obowiazkowe-szczepienia` (impersonated city office, false) and `l4-rodzice-za-lipowitem` (astroturfing, misleading); phone `l4-ospa-w-przychodni` (true) and `l4-szkoly-zamkniete-w-piatek` (rumour, false). Decisive-not-justifying cleanup, chosen so the pinned counts hold: `l4-ankieta-uczniow` phone rewritten as a real confirmation and added to `justifyingStamps` (flex SR/P/DL); `l4-raport-pielegniarek` phone rewritten as `misleading` (the duty officer knows nothing); `l4-darmowe-badania-wzroku` archive rewritten as `misleading` (last year's near-identical notice) and its data stamp added to `justifyingStamps` (flex SR/P/DL); `l4-woda-z-kranu` phone rewritten as `misleading` (the waterworks vouch for tap water) so the satire stays pinned to SR. Multi-stamp picks: `requiredStamps` 2 on `l4-raport-pielegniarek` (SR+DL) and `l4-cytat-dyrektorki` (A+P). l4 now deals from a bag `{firstAtS 4, gapS 24, lastSpawnS 340, deadlineS 55/55/40}` over all 24 l4 stories (no `starShares`), the outage stays; pinned SR 4, A 4, P 4, DL 6; true share 7/24. Normal preview (seed 0): 15 folders, stars 200/290 (was authored 215/315). Tests: `l4-zdrowie.test.ts` runs `checkBag` on the file (no issue; 12/15/16/18 folders by difficulty) and deals four seeds per difficulty; `solvable.test.ts` now also plays every bag pool story the preview does not deal, at its Normal priority deadline (so both two-proof stories are played); `run.test.ts` 'LEVELS' compares only fixed levels with their files (same change as the l1 bag track); the CLI test drops the l4 ids and keeps the generic 'not scheduled' count with an empty l4 list | The new stories bring SR and P to the pinned target of 4 on their own, so each cleanup picks whatever reads true to the story: a real confirmation becomes a proof, a stamp that only looked decisive now misleads; woda-z-kranu must stay pinned because SR has exactly 4 |
| 2026-10-13 | Level 3 on the bag (S7-31, no wire change): four new `reviewed:false` stories pinned to the archive (one stamp per l3 station, one proof, only the archive stamp `decisive`): `l3-stara-afera` (a real 2012 article about the previous head, shared as fresh; misleading), `l3-zmyslony-wywiad` (invented quote on a real photo; false), `l3-boisko-ze-zbiorki` (parents' council post from a week-old profile, confirmed by the minutes; true), `l3-dyrektor-bez-dyplomu` (anonymous „someone at the education board” rumour; false, urgent). `l3-afera` deals from a 25-story pool (the 15 old stories, the 6 from S7-30 and these 4; 9 of 25 true) with bag {4, 24, 340, 60/60/45} and the default star shares; the three viral events are unchanged. 4 pinned stories on each of imageSearch, sourceRegistry, archive and phone (target ⌈15/4⌉ = 4); `checkBag` reports nothing; 12/15/16/18 folders by difficulty; the Normal preview's maximum is 470 with stars 260/375 (the authored 240/350 are gone). Source-registry stamps follow `cardHasFlags`: the true story's fresh profile is `misleading` (the card shows warning signs), the untrue stories' sources look clean. The CLI test no longer expects l3 'not scheduled' warnings; `l3-afera.test.ts` pins all ten new stories and tests the bag | The archive had no pinned story, so it was the only l3 station short of the pinned target; the bag pool is where pinned stories count, and star balance is left to S7-35 |
| 2026-10-13 | l0 Makieta on the station bag (S7-27, content only, no wire change): 7 new stories (`l0-dzik-w-galerii`, `l0-tecza-nad-latarnia`, `l0-rekin-w-porcie`, `l0-tlum-na-skateparku` pinned to the image search; `l0-stary-komunikat`, `l0-jubileusz-liceum`, `l0-kradzieze-rowerow` pinned to the archive; 2 true, all `reviewed: false`) make a pool of 17 (6 true, 35%; pinned image search 4 / archive 4 / registry 5, target 4). `l0-greybox.json` drops its schedule and stars for `bag` {3, 18, 175, 75/90/50, starShares 0.5/0.8}: 8 / 10 / 11 / 12 folders, Normal preview max 240 → ★★ 120 / ★★★ 190, the old authored values. The tutorial stays on l0 and is story-agnostic: its steps complete on actions (move, pick up, start a minigame, stamp, verdict), never on a story id, so any dealt opener works (`e2e/training.spec.ts`, two tabs, desktop and mobile). The 175 s last spawn plus the 90 s important deadline keeps checkBag's deadline-fit warning for l0 (the generator clamps late folders, as the authored tail did with 50–60 s); meeting it would cost Normal slots, so the CLI test now expects it (7 warnings). The schedule-rule fixtures (`__fixtures__/broken.ts`, `bag-level.ts`) keep the pre-bag greybox schedule frozen in `__fixtures__/greybox-schedule.json` with the ten stories it schedules, so their paths and literals do not move; `LEVELS` tests now check bag levels against their Normal preview, and every bag pool story is played to its maximum score in solvable.test.ts | Alternative kept l0 on an authored schedule for tutorial predictability; the tutorial does not depend on which story comes first, so l0 joins the bag like every campaign level and the old schedule stays only as a validator fixture |
| 2026-10-13 | Ability contracts and protocol v5 (S7-36, bumps `PROTOCOL_VERSION` to 5 for M3): roles get one active ability each (`ROLE_PERKS[role].ability`: Fotoedytor and Archiwista Ekspertyza, Reporter Telefon z terenu, Redaktor prowadzący Przedłużenie), pressed with the target-free `useAbility` command; the server will resolve the target with the shared ability preview the HUD also shows (S7-37/38), so a press never names a folder or station. Cooldowns are per player, all `ABILITY[a].cooldownMs = 60 000` until bot data says otherwise (S7-46), start when the effect happens (not when armed) and `ABILITY_FIRST_READY_MS = 0` makes the ability ready at level start and for a mid-game joiner. Every crew member carries `AbilityState` {`abilityReadyAtMs`, `abilityArmed`, `fieldCall`, `rescuesLeft`} and `snapshot.crew` sends it per player in join order without the role (roles stay in `roomState.players`). New events `ability` {stage armed/disarmed/started/done/cancelled} and `folderRescued`; `stampApplied.via` (minigame/expertise/fieldCall) is required; `folder.extendedMs` is optional. Until S7-37 lands `stepAbilities` the simulation ignores `useAbility` (tested), and the old once-per-level `extendDeadline` command, `deadlineExtensionUsed` flag and `deadlineExtended` event stay on the wire | One bump for the whole milestone, so S7-37 and S7-43 ride on v5; contracts land first so the input, HUD and sim tracks can work in parallel |
| 2026-10-13 | Role passives unchanged; station families gate Ekspertyza only (S7-36): `ROLE_PERKS[role].fasterAt` × `workFactor` 0.6 repeats the Stage 6 `ROLE_STATIONS` (photoEditor imageSearch + aiScanner, archivist archive, reporter phone, managingEditor none), which `roleWorkFactor` in `sim/roles.ts` replaces together with `ROLE_WORK_TIME_FACTOR`; the reporter's phone-queue skip moves to `ROLE_PERKS.skipsPhoneQueue` (still client-side). `STATION_FAMILY` (image: imageSearch, aiScanner; documents: archive, dataLibrary; sources: sourceRegistry, phone) only decides which stations a role's Ekspertyza covers, through the explicit `RolePerk.expertiseFamily` (photoEditor image, archivist documents, others null) rather than one derived from `fasterAt`. The cluster B design's family-wide passives (reporter −40 % at sourceRegistry, archivist at dataLibrary) are not adopted | Keeps today's balance and contest cards valid; a family passive would have made the reporter faster on every level with no tuning data behind it |
| 2026-10-13 | Ability cues before the ability art (S7-36): `ability.armed`/`disarmed`/`expertise`/`call.start`/`call.done`/`call.dropped`/`extendDeadline`/`secondChance`/`pass` and `role.rescue` play placeholder sounds from the current sprite (`copy`, `back`, `chime`, `ping3`, `fail`, `arrive`, `evback`, `rustle`, `evclear`) and existing caption icons (`bolt`, `phone`, `hourglass`, `folder`) until S7-42 adds `abready`/`abpower`/`abthrow` and S7-40 the retry/pass/lifebuoy icons. `cueForEvent` keeps its signature, so a teammate's arm/disarm still plays its quiet sound; its caption is scoped `local` until S7-42 returns no cue for remote arm/disarm. Caption chips now go through `typeset()` so „Telefon z terenu” never breaks after the one-letter word. The old `folder.deadlineExtended` cue stays until S7-37 renames it to `ability.extendDeadline` | Feedback ships with the event (AGENTS.md rule 12) even before the final sounds exist; no sprite regeneration in a contracts task |
| 2026-10-13 | In-game menu pauses only solo play (S7-10, user decision 13 „pause sheet”): with two or more connected people the menu shows the orange „Gra trwa dalej” and the level runs on | A shared co-op simulation cannot stop for one player without stopping it for everyone, and a pause one player can hold would hand that player the whole team's clock |
| 2026-10-13 | Solo pause details (S7-10, lobby action `setPaused` and `snapshot.paused`, rider on the M1 bump — no `PROTOCOL_VERSION` change; the wire is at 4 since S7-17): a pause is accepted only while playing with exactly one connected player (rooms have no spectators yet; S7-78 must refuse it with spectators too) and silently ignored otherwise, like other out-of-phase lobby actions; resuming is always accepted. Besides a new join, a **reconnect** also clears it, so a reload never leaves the level frozen behind a closed menu. While paused the registry neither steps nor broadcasts (one snapshot carries the flag), and drops queued input; queued commands wait for the resume. The client sends no input while paused, freezes its level-clock extrapolation and re-learns the snapshot clock offset on resume | Keeps pause the room's own state on the server (the authority), cheap for an idle room, and free of stale movement or a lagging interpolation clock afterwards |
| 2026-10-13 | Menu keys (S7-10, `input/menu-button.ts`): Esc opens the menu only when nothing captures the input and the tutorial card is not up; its listener runs in the capture phase, so one press never both skips the tutorial and opens the menu. Inside the open sheet Esc and the pad's B close it as any dialog (menu-nav), Start (button 9, rising edge) toggles it unless the settings sit on top; a tap on the backdrop closes it. The sheet has no separate close button: „Wróć do gry” is that button | One key per device, no double meaning; the sheet stays one yellow action plus four white ones |
| 2026-10-13 | Przedłużenie replaces the once-per-level deadline extension (S7-37, rides on v5): the managing editor's ability adds `ABILITY.extendDeadline.addMs` (20 s) every `cooldownMs` (60 s). The design's „+20 s to any folder” is resolved as an auto-picked target, `pickExtendTarget` in `sim/abilities.ts`: the folder the editor carries, else the folder on the desk he operates, else the team's folder with the least time left (ties: earlier spawn, then id); the HUD chip will preview it via `data-ability-target` (S7-40). A botRaid wave is extended together (`extendFolders`), because `expireRaids` would otherwise remove the extended sibling. `stepAbilities` runs first in the tick, so a press or a Koło ratunkowe rescue on a folder's deadline tick lands before `checkDeadlines`; within it presses run in arrival order, then Telefon z terenu calls, then rescues, so an editor's press on the same tick saves the Ratownik's charge. A press the preview does not allow (no role, cooling, blocked, a call running) changes nothing and emits no event; the client explains it from the same preview. Added time is recorded in `folder.extendedMs` and the speed bonus is measured against `deadlineMs − extendedMs`. Removed: `canExtendDeadline`, the `extendDeadline` command, `deadlineExtensionUsed` (state and snapshot), the `deadlineExtended` event, `DEADLINE_EXTENSION_MS`, the desk sheet's „+20 s” button with its `pl.desk.extend*` strings and the `folder.deadlineExtended` cue (now `ability.extendDeadline`); the ≤ 3-player „anyone may extend” rule (2026-10-06 row) goes with it, so crews without a Redaktor prowadzący have no extension. Telefon z terenu needs a phone station on the level (it ignores phone outages), stamps as the first phone station with `via: 'fieldCall'` (its cue plays at the reporter) and is cancelled without a cooldown when the folder leaves the reporter's hands. The balance bot presses only when the shared preview targets a claimed folder with under 5 s left (`usesAbility` replaces `usesExtension`) | One rule for every device: R / RB / one touch button cannot pick a folder quickly, and the shared preview keeps sim, HUD and bots in agreement |

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
