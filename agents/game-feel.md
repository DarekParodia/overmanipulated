# Game feel: animation, sound, particles and more

An Overcooked-style game lives on feedback. Every player action and every game event must be
**seen, heard and felt** immediately. Feedback is built together with the feature, not in a
polish stage at the end.

## Principles

1. **Every action gets a response within one frame on the client.** Local actions (pressing
   pick-up, starting work) give immediate feedback (sound, small animation) even before the
   server confirms; the confirmed result (stamp, verdict) gets the big feedback.
2. **Feedback is layered**: animation + sound + particles (+ camera / UI motion + haptics on
   mobile). Important events use more layers; routine events stay subtle so the screen does not
   turn into noise.
3. **Severity is consistent.** Bigger consequence → bigger feedback. Publishing a fake must feel
   worse than an expired folder, because that is the lesson of the game.
4. **Readable over pretty.** Effects never hide folders, timers, stations or other players.
5. **Every cue respects settings**: mute/volumes, reduced motion (no shake, no squash, fewer
   particles), no-flash (no blinking or strobing, no full-screen flashes), haptics off, and the
   quality preset's particle budget.
6. **Audio-only information does not exist.** Every sound that carries information has a visual
   equivalent (deaf/muted players, school classrooms with sound off).
7. **FX never affect the simulation.** They are client-only, driven by server events and local
   prediction; they can be skipped or dropped without changing game state.

## Architecture (`apps/client/src/fx/`)

| Module | Responsibility |
| --- | --- |
| `feedback.ts` | Event bus: `emitCue(cueId, context)` where context has position, player, intensity. Called from net event handlers and local input handlers. |
| `cues.ts` | **The feedback catalogue**: data that maps each cue id to its layers (sound ids, particle preset, animation trigger, shake trauma, haptic pattern, UI effect). |
| `audio/` | Howler manager: buses `music`, `sfx`, `ui`, `ambience`; audio sprites; pan by screen position; ducking (music dips under big stingers); mobile unlock; keyed loops (`loops.ts`, e.g. the typewriter loop per station). |
| `particles/` | Pooled instanced particle system; emitter presets as data (count, lifetime, velocity, gravity, colour over life, size over life, texture atlas frame). One draw call per material. Global cap from the quality preset. |
| `animation/` | Easing functions, tweens, springs (allocation-free), procedural character layer (bob, lean, squash & stretch), helpers for `AnimationMixer` clip cross-fades. |
| `camera/` | Trauma-based camera shake (trauma² → offset/rotation, decays per second), small zoom punches. |
| `time-scale.ts` | Hit-stop: a global FX clock scale (`fxTimeScale()`) scene code multiplies its FX delta by; off with reduced motion. |
| `haptics.ts` | Vibration API / gamepad rumble patterns. |
| `ui-motion/` | Shared CSS/Web Animations API presets for DOM UI: pop, slam, slide, count-up, shake. |

Rules:

- Gameplay code never calls Howler, the particle system or the camera directly — it emits a cue.
  Tuning feedback means editing `cues.ts`, not hunting through components.
- No per-frame allocation in particles, tweens or shake; pools are pre-sized.
- Particle textures share one atlas; sounds use sprites; both are loaded with the level and
  counted in the download budget.
- Every sound and texture has an entry in `apps/client/public/assets/CREDITS.md`
  (CC0 / self-made only).

## Feedback catalogue (starting point)

Severity: ● subtle · ●● medium · ●●● strong. Placeholder assets are fine until stage 5.

| Cue | Trigger | Animation | Sound | Particles / visual | Shake / haptic | Sev. |
| --- | --- | --- | --- | --- | --- | --- |
| `player.join` | player enters room/level | spawn pop (scale overshoot) | chime | ink puff in player colour | — | ● |
| `player.step` | walking | bob, lean | soft steps (rate by speed) | dust puffs on direction change | — | ● |
| `folder.arrive` | `folderSpawned` on a conveyor | `slideIn` (slide-in + bounce) | counter bell (`arrive`) | paper flutter | — | ●● |
| `folder.pickup` / `folder.drop` | `folderPickedUp` / `folderPutDown` | `hop` / `place` squash | paper rustle / paper slap | paper flutter / dust | light tick (own player only) | ● |
| `station.workStart` / `station.workCancel` | `workStarted` / `workCancelled` | `workStart` / `workStop` pose | key clack, then typewriter loop (`keys`, per station) until cancel / minigame / stamp; stops if the station snapshot stops working | ink puff in player colour / dust; progress ring (station unit) | — | ● |
| `station.denied` | station busy or wrong item | head shake | "nope" blip | red outline pulse | — | ● |
| `minigame.start` / `minigame.fail` | `minigameStarted` / `minigameFailed` | `workStop` / `wobble` | paper whoosh / fail blips | paper flutter / smoke wisp | — / light tick | ● |
| `stamp.applied` | `stampApplied` | `stampSlam` + 60 ms hit-stop (`fx/time-scale.ts`) | heavy thud | paper bits + ink splat | small shake, thud | ●● |
| `desk.open` / `desk.close` | `deskOpened` / `deskClosed` | `deskOpen` / `deskClose` | drawer knock / soft back | dust | — | ● |
| `verdict.correct` | correct verdict | `cheer`, `scorePop` (value = score delta) | rising chime | confetti in verdict colour (blue / red / ochre) | light tick | ●● |
| `verdict.contextCorrect` | correct "publish with context" | `cheer`, `scorePop` | fanfare | bigger ochre burst + paper bits | small shake, thud | ●●● |
| `verdict.wrongJustification` | right verdict, wrong stamp | `shrug`, `scorePop` | unsure two-note dip | ink puff in verdict colour | light tick | ●● |
| `verdict.fakePublished` | false / unverifiable published, or misleading / satire published without context | `facepalm`, `credibilityCrack`, `scorePop` | alarm sting | red ink splash + paper bits | strong shake, long buzz | ●●● |
| `verdict.truthRejected` | publishable story rejected | `shrug`, `credibilityCrack`, `scorePop` | low sting | grey ash | medium shake, thud | ●● |
| `verdict.wrong` | needless context on a true story | `shrug`, `scorePop` | low sting (quieter) | grey ash | small shake | ●● |
| `folder.deadlineWarning` / `folder.deadlineTick` | `deadlineWarning`; ticker while any warned folder is in play (`fx/deadline-ticker.ts`, 800 → 220 ms) | `tremble` | warning ticks, then clock ticks speeding up; stops on resolve or extension | paper flutter; timer turns red (HUD; no blinking in no-flash) | light tick | ● → ●● |
| `folder.deadlineExtended` | `deadlineExtended` | `hop` | soft bell | paper flutter | — | ● |
| `folder.expired` | `folderExpired` | `crumple` | buzzer | grey ash | small shake, thud | ●● |
| `minigame.success` / `fail` | minigame result | card flip / wobble | success ding / fail buzz | sparkle / smoke wisp | — | ● |
| `station.open` / `desk.open` | minigame sheet / desk folder opens | sheet slides in | paper slide | — | light tick (mobile) | ● |
| `desk.justify` | justifying stamp picked on the desk | slip pulled out, tab appears | click | — | light tick (mobile) | ● |
| `credibility.low` | credibility < 30 | — | heartbeat layer | vignette | — | ●● |
| `level.lastSeconds` | timer crosses 30 s left | `timerPulse` (steady under no-flash) | clock strike over a low pulse; music → pressure layer (music unit) | timer pulses (HUD) | light tick | ●● |
| `level.win` / `level.lose` | `levelEnd` message | `cheer` / `slump` | win / lose stinger; all loops stop | confetti / falling papers at the local player | thud / buzz | ●●● |
| `ping.needArchive` / `ping.fake` / `ping.mine` | `ping` | `pingPop` (the ping layer draws the bubble) | short bell, pitch per type | ink puff in player colour; icon bubble (ping unit) | — | ● |
| `event.*` | random events (stage 4) | per event | announce stinger | per event (shares, sparks, glitch, smoke) | per event | ●●–●●● |
| `ui.click` / `ui.hover` / `ui.back` | menus | button press | click / tick | — | light tick (mobile) | ● |
| `sourceRegistry.circle` / `uncircle` | field circled / circle taken back (Kartoteka źródeł) | red pencil ellipse draws on / is erased | pencil tick | — (DOM overlay, no world position) | light tick | ● |
| `sourceRegistry.mistake` | clean field circled, or card filed with a warning sign missed | field crossed out, card nudges, mistake tally mark | dull blip | — | thud | ● |
| `sourceRegistry.file` | card filed correctly | „Sprawdzone” stamp slams on the card | stamp thud | — | thud | ● |
| `archive.tick` / `stop` / `miss` / `found` | archive minigame: card passes the frame, drawer braked, wrong card pulled, first mention found | card wobble / card lifts with stamp | riffle tick / click / nope / stamp thud | „Nie ta” stamp on the card | tick / buzz / thud (mobile) | ● → ●● |
| `imageSearch.fragment` | next fragment in the loupe | loupe label changes | soft tick | — | — | ● |
| `imageSearch.match` / `imageSearch.miss` | image search pick | stamp on the printout / red pencil strike | stamp / back | — | tick / thud | ● |
| `ambience.phone` / `printer` / `fax` / `typing` | random, quiet, never two at once (`fx/audio/ambience.ts`); skipped while a station or desk overlay is open | idle scene props (fans, clock, glowing monitors, paper stacks) live in `scene/Ambience.tsx` | distant phone / printer / fax / typing on the `sfx` bus, room tone ducks under overlays | dust motes (high preset) | — | ● |
| `folder.deadlineExtended` HUD | `cardHop` | the folder's queue card hops | — | — | — | ● |
| `briefing.intro` / `briefing.land` / `briefing.ready` | briefing card appears / lands on the desk / "Gotowy!" pressed | newspaper spins and drops in, squashes on landing (fade under reduced motion; tap skips) | paper slide / paper slap / stamp | — | — / thud / tick | ● → ●● |
| `debrief.star` / `debrief.mark` | results reveal: each earned star, then each Kolegium card's outcome mark (skippable by any tap/key; off with reduced motion) | star pop / mark slams on like a stamp | chime / stamp thud | — (DOM) | tick | ●● / ● |
| `debrief.vote` | blunder-of-the-day vote | button and voter dot pop | soft paper place | — (DOM) | tick | ● |

Add a row here when you add a cue, in the same commit.

Event → cue mapping lives in `fx/event-cues.ts` (pure, unit-tested for every gameplay event
kind); `net/game-events.ts` adds where it happens (fixture tile centre, folder location or
player position) and who it is about. State-driven feedback (work loop reconciliation, deadline
ticker, last-30-s sting, level-end stingers) lives in `fx/gameplay-feedback.ts`. Animation
listeners (`feedback.onAnimation`) receive `{ reducedMotion, noFlash }` and must honour them;
cues about another player (`remote`) never vibrate. In a `?debug` build, `window.__fx`
exposes `handleGameEvent`, `emitCue` and `useGame` for testing feedback by hand.

## Music

- Menu track; per-level track with **intensity layers** (calm / pressure) cross-faded by remaining
  time, urgent folders and low credibility.
- Stingers for win, lose, events; music ducks under them.
- Loop points seamless; total music within the download budget (stream after first load).

## Animation

- Stage 1–2: procedural animation on greybox capsules (bob, lean, squash & stretch, carry pose).
- Stage 3+: rigged low-poly characters with clips: idle, walk, run, carry-walk, work, stamp,
  cheer, facepalm, shrug, celebrate (per role), emotes for pings. Cross-fade 0.1–0.2 s driven by
  player state from snapshots; procedural layer stays on top.
- World: conveyor belt movement, station screens, printer, fans, papers — instanced/shader-based
  where possible.
- UI: screen transitions, stamp slams on the debrief, counters rolling, stars revealing; all
  skippable.
- Animation LOD on mobile: off-screen/far characters update at a lower rate.
- Motion style (physical paper/stamp behaviour, no generic fades and glows) follows
  [`design-rules.md`](design-rules.md) §8.
