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
| `audio/` | Howler manager: buses `music`, `sfx`, `ui`, `ambience`; audio sprites; pan by screen position; ducking (music dips under big stingers); mobile unlock. |
| `particles/` | Pooled instanced particle system; emitter presets as data (count, lifetime, velocity, gravity, colour over life, size over life, texture atlas frame). One draw call per material. Global cap from the quality preset. |
| `animation/` | Easing functions, tweens, springs (allocation-free), procedural character layer (bob, lean, squash & stretch), helpers for `AnimationMixer` clip cross-fades. |
| `camera/` | Trauma-based camera shake (trauma² → offset/rotation, decays per second), small zoom punches. |
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
| `folder.arrive` | new folder on conveyor | slide-in + bounce | desk bell | paper flutter | — | ●● |
| `folder.pickup` / `folder.drop` | E | hop / place squash | paper rustle / thud | — | light tick (mobile) | ● |
| `station.workStart` / loop | hold Space | working pose | typing / station loop | progress ring | — | ● |
| `station.denied` | station busy or wrong item | head shake | "nope" blip | red outline pulse | — | ● |
| `stamp.applied` | station finished | stamp slam + 60 ms hit-stop | heavy thud | ink splat + paper bits | small shake, short buzz | ●● |
| `minigame.success` / `fail` | minigame result | card flip / wobble | success ding / fail buzz | sparkle / smoke wisp | — | ● |
| `station.open` / `desk.open` | minigame sheet / desk folder opens | sheet slides in | paper slide | — | light tick (mobile) | ● |
| `desk.justify` | justifying stamp picked on the desk | slip pulled out, tab appears | click | — | light tick (mobile) | ● |
| `verdict.correct` | correct verdict | cheer | chime + score tick | confetti in verdict colour, score pop text | — | ●● |
| `verdict.contextCorrect` | correct "publish with context" | bigger cheer | fanfare | bigger burst, golden text | small zoom punch | ●●● |
| `verdict.fakePublished` | fake published | facepalm | alarm sting | red ink splash, credibility bar crack | strong shake, long buzz | ●●● |
| `verdict.truthRejected` | true story rejected | shrug | low sting | grey crumple | medium shake | ●● |
| `folder.deadlineWarning` | < 25 % time left | folder trembles | ticking (speeds up) | timer turns red (no blinking in no-flash) | — | ● → ●● |
| `folder.expired` | deadline passed | crumple/burn | buzzer | ash/dust | small shake | ●● |
| `credibility.low` | credibility < 30 | — | heartbeat layer | vignette | — | ●● |
| `level.lastSeconds` | last 30 s | — | music → pressure layer, clock tick | timer pulses | — | ●● |
| `level.win` / `level.lose` | level end | team cheer / slump | win / lose stinger | confetti / falling papers | — | ●●● |
| `ping.*` | Q signal | bubble pop above player | short ping per type | icon bubble | — | ● |
| `event.*` | random events (stage 4) | per event | announce stinger | per event (shares, sparks, glitch, smoke) | per event | ●●–●●● |
| `ui.click` / `ui.hover` / `ui.back` | menus | button press | click / tick | — | light tick (mobile) | ● |
| `sourceRegistry.circle` / `uncircle` | field circled / circle taken back (Kartoteka źródeł) | red pencil ellipse draws on / is erased | pencil tick | — (DOM overlay, no world position) | light tick | ● |
| `sourceRegistry.mistake` | clean field circled, or card filed with a warning sign missed | field crossed out, card nudges, mistake tally mark | dull blip | — | thud | ● |
| `sourceRegistry.file` | card filed correctly | „Sprawdzone” stamp slams on the card | stamp thud | — | thud | ● |

Add a row here when you add a cue, in the same commit.

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
