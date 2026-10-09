# Performance and loading (S5-07)

Budgets come from `agents/architecture.md`: 60 FPS on Intel UHD 620 and mid-range phones (never
below 30), at most 100k triangles, about 150 draw calls on desktop and 100 on phones, at most
10 MB first load. This page says how each one is met, how it is checked and what was measured.

## Commands

| Command | What it does |
| --- | --- |
| `bun run perf:budget` | Builds the client and measures the first-load transfer (`tools/perf/check-bundle.ts`). Part of `bun run check`. |
| `bun tools/perf/check-bundle.ts [dist]` | Same measurement on an existing build, with a per-file table. |
| `bun run test:e2e` | `e2e/performance.spec.ts`: 4 players and 7 folders on the high preset stay under the draw-call and triangle budgets (desktop 150, mobile 100, 100k triangles). |
| `?debug` or F3 | Perf overlay: fps, frame time, draw calls, triangles, particles, quality preset, adaptive step, DPR cap. |

## First load

`tools/perf/check-bundle.ts` follows the Vite manifest, so it measures the real import graph.

- **Menu route** (first screen): `index.html`, entry chunk, CSS, the font files the CSS can request
  for Polish text, linked icons and manifest, and the menu music. Fonts for Cyrillic, Devanagari
  and Vietnamese are in the build, but their `unicode-range` never matches, so browsers never
  download them; the script skips them by reading the ranges.
- **Game route** (added by the first match): the lazy `GameScreen` chunk (three.js, the scene, the
  stations), its CSS, the SFX sprite and the two level music layers.
- Text files are measured gzip -9 and brotli -11 (Caddy serves `zstd gzip`); fonts and audio are
  already compressed. Audio ships as webm (Opus) with an mp3 fallback; the larger set must fit.

Limits enforced (`BUDGET` in the script): 10 MB total (the project rule, also checked against the
uncompressed sum), plus regression guards that trip long before it: menu route 700 KB gzip, menu
JS+CSS 320 KB gzip (this catches three.js leaking into the menu bundle), game route 1.6 MB gzip.

Measured (production build, mp3 = worst case):

| Route | Raw | gzip | brotli |
| --- | --- | --- | --- |
| Menu (first screen) | 1.09 MB | 542 KB | 510 KB |
| Game (added by first match) | 1.61 MB | 839 KB | 790 KB |
| **First load, both** | **2.70 MB** | **1.35 MB** | **1.27 MB** |

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
