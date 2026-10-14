# Performance and loading (S5-07)

Budgets come from `agents/architecture.md`: 60 FPS on Intel UHD 620 and mid-range phones (never
below 30), at most 100k triangles, about 150 draw calls on desktop and 100 on phones, at most
10 MB first load. This page says how each one is met, how it is checked and what was measured.

## Commands

| Command | What it does |
| --- | --- |
| `bun run perf:budget` | Builds the client and measures the first-load transfer (`tools/perf/check-bundle.ts`). Part of `bun run check`. |
| `bun tools/perf/check-bundle.ts [dist]` | Same measurement on an existing build, with a per-file table. |
| `bun run test:e2e` | `e2e/performance.spec.ts`: 4 players and 7 folders on the high preset stay under the draw-call and triangle budgets (desktop 150, mobile 100, 100k triangles) in four rooms: level 1, the 24×14 rooms of level 5 and level 6, and endless with all ten stations (S7-66); a spectator of a 4 v 4 versus match on level 1 and in endless, both canvases summed (S7-92). Each case prints its counters. |
| `bun run perf:server` | Server tick bench (`tools/perf/server-tick.ts`, S7-92): 150 versus rooms of 4 + 4 scripted players, 8 spectators in 50 of them; prints ms per tick and bytes per second, and warns when the mean tick passes the 25 ms target (`TICK_TARGET_MS`, half the tick). `--level <id>`, `--rooms`, `--spectated`, `--ticks`, `--coop`. Not part of `check` (it measures the machine). |
| `?debug` or F3 | Perf overlay: fps, frame time, draw calls, triangles, particles, quality preset, adaptive step, DPR cap. |

## First load

`tools/perf/check-bundle.ts` follows the Vite manifest, so it measures the real import graph.

- **Menu route** (first screen): `index.html`, entry chunk, CSS, the font files the CSS can request
  for Polish text, linked icons and manifest, and the menu music. Fonts for Cyrillic, Devanagari
  and Vietnamese are in the build, but their `unicode-range` never matches, so browsers never
  download them; the script skips them by reading the ranges.
- **Game route** (added by the first match): the lazy `GameScreen` chunk (three.js, the scene, the
  stations), its CSS, the SFX sprite and the two level music layers.
- **Extras route** (S7-96, what a first session may open on top): the lazy dialogs whose manifest
  keys start with `EXTRAS_SOURCES` (`src/intro/`, `src/howto/`, `src/about/`, `src/profile/`,
  `src/rooms/` for the room browser, S7-88),
  the chunks they import and load later, and the intro voice in `assets/voice` (one audio format
  plus its sprite json). Chunks the menu or the game route already counted are not counted
  again, and the extras never count as game, so a new lazy dialog does not eat `gameMax`.
- Text files are measured gzip -9 and brotli -11 (Caddy serves `zstd gzip`); fonts and audio are
  already compressed. Audio ships as webm (Opus) with an mp3 fallback; the larger set must fit.

Limits enforced (`BUDGET` in the script): 10 MB total for menu + game + extras (the project rule,
also checked against the uncompressed sum), plus regression guards that trip long before it: menu
route 700 KB gzip, menu JS+CSS 340 KB gzip (this catches three.js, about 150 KB gzip, leaking into
the menu bundle), game route 1.6 MB gzip, extras route 1 MB gzip.

Measured (production build, mp3 = worst case):

| Route | Raw | gzip | brotli |
| --- | --- | --- | --- |
| Menu (first screen) | 1.31 MB | 573 KB | 528 KB |
| Game (added by first match) | 1.64 MB | 814 KB | 760 KB |
| **First load, both** | **2.95 MB** | **1.35 MB** | **1.26 MB** |

S7-96 (the „Jak grać” shell, the first extra): extras route 10 KB raw, 3 KB gzip (the dialog's
own code and CSS; the station help card and the controls tab it shows are already in the menu);
menu 592 KB gzip (588 KB without the dialog: the shared code moves from the entry into a chunk
the entry still loads, which compresses 4 KB worse), game 814 KB gzip, first load (menu + game +
extras) 1.38 MB gzip.

S7-103 („O grze”): the dialog adds 18 KB raw, 6 KB gzip to the extras route (now 28 KB raw,
9 KB gzip); `CREDITS.md` and the voice sprite are fetched only when its Zasoby tab opens and are
not counted. Menu 597 KB gzip, first load 1.39 MB gzip.

S7-101 (the intro player): the player, its subtitles and the welcome art ride in the „Jak grać”
chunk (extras now 73 KB raw, 23 KB gzip); the in-engine stage is a lazy `IntroStage` chunk
(8 KB raw, 3 KB gzip) loaded when the player mounts, and the renderer, three.js, the shared sim
and the HUD cards it borrows are the game route's chunks, so they are counted once there. The
intro's canvas is not the primary one (no preset probe, no adaptive quality); its mini room is
10×6 tiles with one character, so it stays far under the scene budgets. Rolldown keeps the
shared package's modules together, so the sim subsystems the intro steps (`step` and what it
runs) moved into a chunk the menu loads, about 8 KB gzip. To pay for it, the design reference
page (`?styleguide`, every minigame) became a lazy chunk in the same change: menu 573 KB gzip,
290 KB of it JS and CSS (was 321 KB; guard 340 KB). Game route 864 KB gzip (54 % of `gameMax`;
the styleguide counts there, being a lazy import of the entry), first load 1.43 MB gzip.

S7-102 (intro scenes 7–11, lobby autoplay): the kit art of the five later scenes adds about
2 KB gzip to the „Jak grać” chunk (extras now 84 KB raw, 25 KB gzip). The lobby takes only the
seen flag and the autoplay rule (`intro/intro-store.ts`, under 1 KB); the voice starts loading
when the player mounts, so no voice code joins the menu. Menu 575 KB gzip, 291 KB of it JS and
CSS (guard 340 KB); first load 1.43 MB gzip.

S7-106 (Stage 7 close-out, `bun run perf:budget`): menu 589 KB gzip, game 876 KB gzip, extras
(help, intro, about, profile, rooms) 99 KB raw, 29 KB gzip; first load 3.30 MB raw, 1.46 MB gzip
(limit 10 MB).

Re-measured in S7-56 with all ten minigames: the game chunk is 301 KB gzip and the worst-case
level music pair is l4's (the figure counts only the largest pair).

### Game route against `gameMax`

Stage 7 adds four minigames, role abilities, versus and the spectate screen to the game chunk,
so the game route is recorded against the 1.6 MB gzip guard (`BUDGET.gameMax`) at each step. Past
90 % of the guard (1.44 MB) the registry (`stations/minigames/index.ts`) lazy-loads the minigame
components per station kind with `React.lazy`.

| Task | Game route gzip | Share of `gameMax` | Game chunk gzip |
| --- | --- | --- | --- |
| S7-56 (all ten minigames) | 814 KB | 51 % | 301 KB |
| S7-66 (M4 done: abilities, ten stations, endless room) | 822 KB | 51 % | 303 KB |
| S7-90 (spectate screen I: views, layout, scoreboard; the lazy styleguide counts here since S7-101) | 868 KB | 53 % | 305 KB |
| S7-106 (Stage 7 done: M7 dialogs, intro, look) | 876 KB | 55 % | 277 KB (largest chunk) |

Real transfer in headless Chromium (webm audio, brotli estimate, whole flow menu, lobby, briefing,
match): menu 434 KB, everything 1.7 MB brotli. The 10 MB limit is met about seven times over.
The biggest items are the game chunk (230 KB brotli), the three audio loops and the SFX sprite
(about 180 KB each) and the menu JS (180 KB brotli).

Known headroom, not done: `@redakcja/content` (about 260 KB raw of stories and levels) is imported
by `net/runtime.ts`, so it sits in the menu chunk. Loading it with the game chunk would save about
60 KB gzip on the menu; it touches the netcode and was left alone.

A manual vendor chunk for three.js was tried and rejected: rolldown then hoisted shared modules
(react, zustand) into it and the menu route imported three.js. The default split already keeps
three.js out of the menu.

## Ads (Stage 7)

Ads are off unless the operator enables them for a host (`docs/deploy.md`, AdSense operator
checklist), and every budget above is measured and enforced with ads off:
`bun run perf:budget` measures our own build, and `e2e/performance.spec.ts` runs with the
default config, where the e2e ad guard (`guardAdRequests` in `e2e/helpers.ts`) fails any test
that requests a Google ad host. Google's script and creatives are **outside the budget**, since
the game cannot size them, and kept away from the frames that matter:

- they load only on an ad host, only on an ad screen (main menu, lobby, results, and a spectator's stats sheet and match results, S7-91)
  and only when a placement's viewport gate matches, so phones never load them;
- never during play: requests are paused (`pauseAdRequests`) on every other screen and no ad
  is on screen, so a match pays no network or frame cost for new ads;
- our own ads code (`apps/client/src/ads/`: loader, slot, pause guard) is a few KB in the menu
  route and counted there.

## Loading screen and preloading

`apps/client/src/loading/`:

- `progress.ts`: tasks (`fonts`, `game`, `sfx`, `music`) with a measured fraction and a byte weight;
  the bar shows the byte-weighted total. Nothing is simulated: the bar moves only when bytes arrive.
- `preload.ts`: `fetchWithProgress` streams audio files and reports bytes against
  `Content-Length`; the real size then replaces the weight estimate. Fonts use
  `document.fonts.load` with Polish sample text (so the latin-ext subset loads), the game chunk is
  the shared dynamic import (`game-chunk.ts`), and the SFX sprite also waits for Howler's decode.
- `GameGate.tsx`: holds the game screen until fonts and the game chunk are done, gives sound 4 s,
  and starts anyway after 20 s. A failed asset counts as finished; it never blocks.
- Preloading starts when the player leaves the main menu (lobby or briefing), so a normal match
  start finds everything cached and the loading screen flashes by. The menu itself stays light.
- Icons are inline SVG in the main chunk, so there is nothing to preload.

Audio files in `/assets/audio` have no content hash, so `Caddyfile` marks only hashed `js`, `css`
and `woff2` files `immutable`; the audio is revalidated (a changed sprite is never stuck in caches).

## Quality system

Presets (`scene/quality.ts`): `low`, `medium`, `high` set DPR cap, shadows, small props, motes.
Phones are capped at DPR 1.5, desktops at 2, `low` renders at 1.

Starting preset (`detectPreset`) when the setting is "auto" (`quality === null`): software
renderers (SwiftShader, llvmpipe) `low`; Intel integrated GPUs `medium`; other desktop GPUs `high`;
phones (coarse pointer) `medium`, or `low` for known weak GPUs and for devices that report 4 GB
or less memory or 4 or fewer cores. Phones never start on `high`.

A fixed preset in settings always wins: it turns adaptive quality off and clears any step. Going
back to "auto" restores the detected preset.

### Adaptive quality

`scene/adaptive-quality.ts` is a pure state machine (unit-tested), driven from `PerfProbe`. It
walks the `degradeLadder` of the current preset, one step at a time, cheapest loss first:

1. particles per burst halved, dust motes off
2. shadows off
3. DPR cap to 75 % (never below 1)
4. small props and the moving belt off
5. character outline hulls off

Steps that change nothing on a preset are skipped (a `low` preset has only steps 1 and 5).

| Rule | Value |
| --- | --- |
| Frame time is averaged over | 1 s windows |
| Step down | 3 consecutive windows over 22 ms (under about 45 FPS) |
| Ignored after any change | 2 s (recompiles, resize) |
| Step up | 20 consecutive windows under 17.5 ms (about 20 s of a steady 57+ FPS) |
| Relapse | a step up that turns slow again within 25 s is undone, never retried, and doubles the wait (max 160 s) |
| Give up | after 2 relapses recovery is off for the session |
| Not a sample | frames over 1 s (tab was hidden, debugger); slower frames count, capped at 250 ms each |

So it drops within seconds, recovers slowly, and cannot flap: every failed recovery makes the next
one rarer, and a step that failed is never tried again. The overlay row `mode` shows `auto, step N`
or `fixed`.

## Draw calls and instancing audit

Measured with `?debug` in headless Chromium (SwiftShader), 4 players and 7 folders on the floor,
1366x768, three's `renderer.info`:

| Preset | Draw calls | Triangles |
| --- | --- | --- |
| low | 35 | 12.5k |
| medium | 37 | 12.8k |
| high (shadow pass included) | 53 | 20.7k |

Budget: 150 desktop, 100 mobile, 100k triangles. The frame rate figures from SwiftShader are
meaningless (1 to 2 FPS software rendering of four pages); only the counters are real.

Audit of the 38 visible renderables on high:

- Static world (floor tiles, walls, furniture, conveyor, lamps, monitors, fans, paper stacks,
  dust motes) is already 15 `InstancedMesh` objects, about 150 box instances plus 15 custom-shape
  instances.
- Stations are one merged mesh per station (3 kinds in the test level).
- Players: 2 skinned draws each (body + outline hull). Skinned meshes cannot be instanced; 8 calls.
- Folders: one box mesh per folder (7 here); stamps and article props are already instanced.
  Instancing the folder bodies would save at most about 10 calls in a busy room, which is not
  needed with this headroom, and the folders carry per-object animation; left as is.
- Particles: one `InstancedMesh` for the whole pool.

Result: no change needed; the e2e test keeps it that way.

**Several canvases (S7-85).** Each `GameCanvas` has its own renderer, so `PerfProbe` writes its
counters to `perfStats.views[viewKey]` and the overlay's `draw calls` and `triangles` rows are the
sum over every mounted canvas (one canvas while playing, so the numbers above are unchanged).
Only the primary canvas measures frame time and walks the adaptive-quality ladder. The GameView
refactor itself was measured on the l1 room (solo host, 1366x768, fixed high preset, 7 injected
floor folders, SwiftShader): 50–51 draw calls before and after, and the same list of visible meshes;
triangles (23.1–24.4k) differ between runs only by the folder prop of the injected story type.

**Spectate screen (S7-90).** A spectator watches a versus match in two canvases side by side on
a desktop (`spectate/spectate-layout.ts`), so each spectator canvas is capped by
`spectatorProfile` (`scene/quality.ts`): at most the medium preset, DPR 1.5, no shadows and no
motes, whatever the device or the settings ask for. Phones always get one canvas (a second WebGL
context is too heavy for them); switching teams there remounts the scene in the same context
instead of creating a new one. Measured in `e2e/spectate.spec.ts` (l0 room, one player per
newsroom, the spectator's page set to high and capped, SwiftShader):

| Spectator | Canvases | Draw calls | Triangles | Budget used |
| --- | --- | --- | --- | --- |
| Desktop 1366×768, side by side | 2 | 62 | 25.1k | 41 % of 150 calls, 25 % of 100k triangles |
| Phone (Pixel 7 landscape), one view | 1 | 29 | 12.3k | 29 % of 100 calls |
| Phone 640×360, one view | 1 | 28 | 12.6k | 28 % of 100 calls |

Two canvases cost twice the per-view draw calls (about 30 each on the capped preset), which
leaves room for 4 + 4 players and a busy belt in each newsroom; the 4 v 4 case is measured below
(S7-92).

## Versus and spectators (S7-92)

### A spectator's frame

`e2e/performance.spec.ts` (spectator cases): eight scripted players join over raw WebSockets from
the test process (`e2e/ws-bots.ts`, no browser pages), alternate into Kurier and Głos, walk and
tap interact at 20 Hz; the Widownia is open. The spectator's page asks for the high preset (the
spectator cap makes it medium, DPR 1.5, no shadows, no motes), joins by code with „Oglądaj”, and
after 4 s of the match reads each canvas's counters from `perfStats.views` (`window.__perf` with
`?debug`) and counts the avatars in each canvas's scene (`window.__scenes`, keyed like the
views): four in each. One folder or two is on the floor of each newsroom by then. SwiftShader,
counters only:

| Room | Desktop 1366×768, two canvases: draw calls / triangles (each) | Phone (Pixel 7), one canvas | Budget used |
| --- | --- | --- | --- |
| level 1, 4 v 4 | 68 / 36.4k (34 / 18.2k) | 34 / 18.2k | desktop 45 % of 150 calls, phone 34 % of 100 |
| endless (24×14, 10 stations), 4 v 4 | 82 / 53.1k (41 / 26.6k) | 40 / 26.6k | desktop 55 % of 150 calls and 53 % of 100k triangles, phone 40 % of 100 |

Each avatar is two skinned draws (body and outline hull) and the capped preset has no shadow
pass, so a full newsroom adds 8 calls per canvas. Seven floor folders in each newsroom would add
about 7 more per canvas (one box each), still under 100 calls for both canvases on a desktop. No
change is needed.

### Server tick

`bun run perf:server` builds every room in one `RoomRegistry` with the real sim, embargo,
snapshots and spectator topic, feeds each player one scripted input per tick (a compass direction
per second, interact every 2 s, work held half the time), plays 20 warm-up ticks and times 200
`registry.tick()` calls. The hub only counts bytes: a publish costs its length once per subscriber,
as Bun's `publish` sends it, so the socket writes themselves are not in the time. Run seeds are
fixed (seed 92), so the bytes repeat exactly; the times are wall clock in this sandbox (4 vCPU
shared with other jobs, so they vary by about ±30 % between runs).

| 150 rooms, 50 with 8 spectators | Mean tick | p95 | Egress total | One room | One room + 8 spectators | One spectator |
| --- | --- | --- | --- | --- | --- | --- |
| versus 4 v 4, level 1 | 5.7–9.9 ms | 9–18 ms | 52 MB/s | 264 KB/s | 536 KB/s | 34 KB/s |
| versus 4 v 4, endless | 7.9–10.4 ms | 12–20 ms | 88 MB/s | 447 KB/s | 902 KB/s | 57 KB/s |
| co-op 4, level 1 (baseline) | 3.7 ms | 6 ms | 23 MB/s | 119 KB/s | 242 KB/s | 15 KB/s |
| co-op 4, endless (baseline) | 3.2 ms | 5 ms | 41 MB/s | 211 KB/s | 425 KB/s | 27 KB/s |

At `MAX_ROOMS` (300 versus rooms, 100 of them watched, endless): mean 20.4 ms, p95 28.5 ms, with
one 0.6 s outlier (a garbage collection) in 200 ticks. Handing the 1,200 scripted inputs to the
registry costs a further 0.3–1.2 ms a tick, outside `tick()`.

What it means:

- **CPU holds.** The mean tick stays under 25 ms (half the 50 ms tick) at 150 versus rooms, and
  at the 300-room cap too, so `MAX_ROOMS` stays 300; no config change is proposed. A versus room
  costs about twice a co-op room (two sims, two snapshot streams), as the design expected.
- **Egress is the real ceiling.** A full versus room sends about 0.26 MB/s on level 1 and 0.45 MB/s
  in endless (about 33–56 KB/s per player: a 1.6–2.8 KB snapshot 20 times a second); a full Widownia
  doubles it (both newsrooms' snapshots at 10 Hz to each spectator). The design's estimate of
  „about 1 MB/s for 8 + 8” holds as an upper bound (0.54–0.90 MB/s). 150 full versus rooms need
  about 435–735 Mbit/s, more than a small VPS uplink: an operator on 100 Mbit/s (about 12 MB/s)
  should size `rooms.maxRooms` by the uplink divided by these per-room figures, not by CPU.
- Nothing goes to the spectator topic of a room without a connected spectator (the bench's quiet
  rooms receive no spectator bytes; `server-tick.test.ts` checks it).

### The 24×14 rooms (S7-66)

Same setup (4 players, 7 folders, measured page on high, the three other players small on low),
from `e2e/performance.spec.ts`; "cut" is the last adaptive step:

| Room | Stations | Desktop 1366×768: draw calls / triangles | Phone (Pixel 7): draw calls / triangles | Cut (desktop) |
| --- | --- | --- | --- | --- |
| level 1 (20×12) | 2 | 60 / 32.7k | 60 / 33.6k | 35 / 15.1k |
| level 5 (24×14) | 7 | 68 / 43.0k | 65 / 40.7k | 39 / 20.3k |
| level 6 (24×14) | 8 | 70 / 45.0k | 66 / 42.0k | 40 / 21.2k |
| endless (24×14) | 10 | 74 / 49.9k | 69 / 46.2k | 42 / 23.2k |

The heaviest room, endless on high, uses 49 % of the desktop draw-call budget (150), 69 % of the
phone budget (100) and half of the 100k triangles. Each extra station costs about 2 calls (its merged
mesh in the main and the shadow pass) and 2k triangles; the bigger room adds the rest. Phones draw
a few calls less in the big rooms, probably because the phone camera frames the room differently
and frustum culling drops a few props. No instancing change is needed.

## Textures and models: not applicable

The game is fully procedural: all geometry is built in code (merged boxes, a skinned rig from
capsules and spheres, instanced props), colours are flat material colours and there are no image
textures or `.glb` models in `apps/client/public/assets` (only audio). KTX2/Basis texture
compression and Draco/meshopt geometry compression therefore have nothing to compress.

If such assets appear: run models through `gltf-transform optimize` (meshopt compression, which
decodes faster than Draco on phones), convert textures to KTX2 (UASTC for normal maps, ETC1S for
colour) with mipmaps, serve them from `assets/` with hashed names, register the decoders lazily
inside the game chunk only, and record every asset in `apps/client/public/assets/CREDITS.md`. Add
the extra download to the game route in `tools/perf/check-bundle.ts` (public files linked from code,
not the HTML, are listed explicitly there).

## Measuring on real devices

SwiftShader numbers cannot judge frame time. Before a stage exit: open `?debug` on the device
matrix in `agents/platforms.md`, play a full 8-minute level and watch `fps`, `mode` and `draw calls`.
A mode that keeps stepping down on a device means its starting preset in `detectPreset` is too
optimistic.
