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
| `audio/` | Howler manager: buses `music`, `sfx`, `ui`, `voice` (the newsroom ambience plays on `sfx`; `voice` carries only the intro voiceover, `voice.ts`); audio sprites; pan by screen position; ducking (music dips under big stingers, deeper under voice lines); mobile unlock; keyed loops (`loops.ts`, e.g. the typewriter loop per station). |
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
- Every sound, voice line and texture has an entry in `apps/client/public/assets/CREDITS.md`.
  Allowed licences: CC0, self-made, or CC BY 4.0 / MIT with the attribution in CREDITS.md (the
  voice sprite's `licence` enum, `intro/voice-sprite.ts`, enforces this for the intro voice).
  Never non-commercial or research-only, and that holds for the whole chain of a generated asset:
  a TTS voice counts its dataset and every checkpoint it was fine-tuned from (S7-100 audit,
  `docs/audio.md`).

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
| `stamp.applied` | `stampApplied` (at the station; at the reporter for `via: 'fieldCall'`) | `stampSlam` + 60 ms hit-stop (`fx/time-scale.ts`) | heavy thud | paper bits + ink splat | small shake, thud | ●● |
| `desk.open` / `desk.close` | `deskOpened` / `deskClosed` | `deskOpen` / `deskClose` | drawer knock / soft back | dust | — | ● |
| `verdict.correct` | correct verdict | `cheer`, `scorePop` (value = score delta) | rising chime | confetti in verdict colour (blue / red / ochre) | light tick | ●● |
| `verdict.contextCorrect` | correct "publish with context" | `cheer`, `scorePop` | fanfare | bigger ochre burst + paper bits | small shake, thud | ●●● |
| `verdict.wrongJustification` | right verdict, weak or too little proof (reason `weakProof` / `incompleteProof`, e.g. only the AI scanner cited) | `shrug`, `scorePop` | unsure two-note dip | ink puff in verdict colour | light tick | ●● |
| `verdict.fakePublished` | false / unverifiable published, or misleading / satire published without context | `facepalm`, `credibilityCrack`, `scorePop` | alarm sting | red ink splash + paper bits | strong shake, long buzz | ●●● |
| `verdict.truthRejected` | publishable story rejected | `shrug`, `credibilityCrack`, `scorePop` | low sting | grey ash | medium shake, thud | ●● |
| `verdict.wrong` | needless context on a true story | `shrug`, `scorePop` | low sting (quieter) | grey ash | small shake | ●● |
| `folder.deadlineWarning` / `folder.deadlineTick` | `deadlineWarning`; ticker while any warned folder is in play (`fx/deadline-ticker.ts`, 800 → 220 ms) | `tremble` | warning ticks, then clock ticks speeding up; stops on resolve or extension | paper flutter; timer turns red (HUD; no blinking in no-flash) | light tick | ● → ●● |
| `folder.beltFull` | `conveyorFull` rising edge (`fx/gameplay-feedback.ts`): a scheduled folder is due but every conveyor tile holds one | — (state-driven: the queue's ghost card band and the conveyor sign ring turn orange, the sign says „Pełna”) | unsure two-note dip (`hmm`, ui bus, 0.6) | — | light tick | ● |
| `folder.expired` | `folderExpired` | `crumple` | buzzer | grey ash | small shake, thud | ●● |
| `minigame.success` / `fail` | minigame result | card flip / wobble | success ding / fail buzz | sparkle / smoke wisp | — | ● |
| `station.open` / `desk.open` | minigame sheet / desk folder opens | sheet slides in | paper slide | — | light tick (mobile) | ● |
| `desk.justify` | justifying stamp picked on the desk | slip pulled out, tab appears | click | — | light tick (mobile) | ● |
| `desk.unjustify` | evidence stamp deselected on the desk (multi-stamp pick, S7-19) | slip pushed back, numbered tick goes | soft back | — | light tick (mobile) | ● |
| `credibility.low` | credibility < 30 | — | heartbeat layer | vignette | — | ●● |
| `level.lastSeconds` | timer crosses 30 s left | `timerPulse` (steady under no-flash) | clock strike over a low pulse; music → pressure layer (music unit) | timer pulses (HUD) | light tick | ●● |
| `level.win` / `level.lose` | `levelEnd` message | `cheer` / `slump` | win / lose stinger; all loops stop | confetti / falling papers at the local player | thud / buzz | ●●● |
| `versus.leadTaken` / `versus.leadLost` | versus: the lead changes hands between two snapshots' scoreboards (client-derived in the rival chip, `leadCue` in `hud/versus-model.ts`): taken from behind or a tie / lost from ahead or a tie; a fall back to a tie is silent; at most one per `VERSUS.leadCueCooldownMs` (5 s); none for the first standings of a match or after the level end (S7-89) | `versusLead`: the rival chip bumps (lead taken) or shakes (lead lost); none under reduced motion | chime (`chime`, sfx 0.7) / low sting (`lowsting`, sfx 0.5) | — (DOM chip; caption „Prowadzicie!” / „Rywale prowadzą”) | light tick | ●● |
| `versus.win` / `versus.lose` / `versus.draw` | versus `levelEnd` (it carries `versus`), from this newsroom's side; replaces `level.win` / `level.lose` (`levelEndCue` in `fx/gameplay-feedback.ts`, S7-89) | `cheer` / `slump` / `shrug`; the results panel pops in with the green, red or blue ribbon | fanfare / lose stinger / unsure two-note dip (`hmm`); all loops stop | confetti + star burst / falling papers / ink puff at the local player | success / thud / — | ●●● / ●●● / ●● |
| `ping.needArchive` / `ping.fake` / `ping.mine` | `ping` | `pingPop` (the ping layer draws the bubble) | short bell, pitch per type | ink puff in player colour; icon bubble (ping unit) | — | ● |
| `event.viral.start` | `levelEvent` viral start | banner; share/heart icons float off the folder, share counter chip (card + world) | notification pops (`evviral`) | orange/red share chips | small shake, tick | ●● |
| `event.bossCall.start` | `levelEvent` bossCall start | banner; red phone rings over the editorial desk and on the folder, seconds chip shakes in its last 4 s | phone ring (`evboss`) | red/yellow alert dots | strong shake, buzz | ●●● |
| `event.botRaid.start` | `levelEvent` botRaid start | banner; bot chip with red/blue glitch ghost on every wave folder, "×N" badge (static under no-flash) | glitch stutter (`evraid`) | blue/red/navy glitch squares | medium shake, buzz | ●●● |
| `event.outage.start` / `.end` / `.spark` | `levelEvent` outage start / end; sparks every ~1 s while down | banner; station sign turns into "Awaria N" with an orange draining ring, navy "powered down" cover over the station | power-down crackle (`evoutage`) / power-up (`evback`) / spark crackle (`evzap`, quiet) | sparks + smoke / confetti / sparks | strong shake, thud / tick / — | ●●● / ●● / ● |
| `event.correction.start` | `levelEvent` correction start | banner; siren with sweeping beam over the folder, yellow dot trail to the nearest desk | siren (`evcorrection`) | red/yellow alert dots | medium shake, buzz | ●●● |
| `event.raidResolved` | `raidResolved` | banner "Nalot odparty!" | rising arpeggio (`evclear`) | confetti + glitch squares | small shake, thud | ●●● |
| `event.end` | other `levelEvent` end | none | paper slap | dust | — | ● |
| `ability.armed` / `ability.disarmed` | `ability` stage `armed` / `disarmed` (Ekspertyza, Druga szansa waiting for their trigger; S7-36). Only the presser hears and feels it: `cueForEvent` returns null for a teammate's arm / disarm (S7-42) | the presser's `abilityPower` fist pump (upper body, on remote avatars too); while armed a blue ring with the ability icon floats beside the player for everyone (`abilities/AbilityMarkers.tsx`) | rising sparkle (`abpower`, 0.5) / soft back | ink puff in player colour / dust | light tick / — | ● |
| `ability.denied` | local press of R / RB / the ability button that the shared preview says does nothing: no role, cooling, blocked, or a field call running (client-only, nothing is sent; S7-39, preview-gated since S7-40) | `abilityDenied`: the HUD chip / touch button shakes (none under reduced motion) | soft back (`back`, ui bus) | — | light tick | ● |
| `ability.ready` | the local crew member's cooldown ran out between two snapshots (client-derived, `abilityJustReady`; S7-40) | `abilityReady`: the HUD chip / touch button bumps once (none under reduced motion; never a pulse, nothing blinks) | two soft rising ticks (`abready`, ui bus, 0.6) | — | light tick | ● |
| `ability.expertise` | `ability` expertise `done`: the stamp lands without the minigame | `abilityPower` fist pump (`stamp.applied` slams the stamp when the sim emits one) | rising sparkle (`abpower`, 0.8) | star burst + ink puff | success buzz | ●● |
| `ability.call.start` / `.done` / `.dropped` | `ability` fieldCall `started` / `done` / `cancelled` (Telefon z terenu) | `abilityCall`: the reporter holds a phone to the ear (right arm only, so the carried folder stays in the left hand) and a phone in an orange ring drains beside the player for the 6 s call; the call ends either way → `stopUpper` fades the pose out / — / `wobble` | phone bell `ping3` / quieter `ping3` / fail blips | ink puff / paper bits / smoke wisp | light tick / — / — | ● |
| `ability.extendDeadline` | `ability` extendDeadline `done` (Przedłużenie: +20 s to the auto-picked folder and its raid wave; S7-37) | `hop`, `cardHop`; the editor's `abilityPower` fist pump | counter bell (`arrive`) | paper flutter ×6 | success buzz | ● |
| `ability.secondChance` | `ability` secondChance `done` (Druga szansa: lockout gone, minigame reopens) | the presser's `abilityPower` fist pump | power-up (`evback`, quiet) | sparks ×6 | light tick | ● |
| `ability.pass` | `ability` passFolder `done` (Podaj teczkę) | the folder flies from the passer's hands to the receiver's in a 450 ms arc (`ABILITY.passFolder.flightMs`, 1.2 tiles high; it snaps under reduced motion); the passer plays `abilityThrow`, the receiver reaches out; before the press the local Ratownik sees a dashed blue ring on the floor under the teammate the press would reach (static under reduced motion and no-flash) | paper whoosh (`abthrow`) | paper flutter ×3 | light tick | ● |
| `role.rescue` | `folderRescued` (Koło ratunkowe: a folder at its deadline in a Ratownik's hands gets +20 s) | `hop`, `cardHop` | rising arpeggio (`evclear`) | star burst | small shake, success buzz | ●● |
| `ui.click` / `ui.hover` / `ui.back` | menus; `ui.click` also when the host picks a difficulty (the chip turns blue) and, for guests, when the host changes it (their „Poziom: …” chip pops, S7-25), and on the leaderboard dialog's room/global and difficulty tabs (S7-26); the station help card opens with `ui.click` ('?', H / Select) and closes with `ui.click` („Rozumiem”, Enter / A) or `ui.back` (Esc / B, S7-95); the room browser („Publiczne pokoje”, S7-88) opens with `ui.click`, picking a room row plays `ui.click`, Esc and ✗ close it with `ui.back`; a join then plays the lobby's own cues; the card pops in (still under reduced motion) | button press | click / tick | — | light tick (mobile) | ● |
| `station.open` / `minigame.success` / `minigame.fail` (practice) | „Wypróbuj” practice round in „Jak grać” (S7-97): a round starts / the minigame is solved / failed or ran out of time; no new cue ids, the match's own ones, client-only (nothing is sent) | the station frame fills the dialog; the outcome banner pops („Udało się!” / „Nie tym razem”, still under reduced motion) | paper slide / click / fail blips | — (DOM dialog, no world position; caption skipped: the banner says it) | light tick / tick / error | ● |
| `game.paused` | `paused` rising edge (`fx/gameplay-feedback.ts`): a solo player opened the in-game menu and the server holds the level (S7-10) | the menu sheet slides in (scale-pop on desktop, slide from the right on phones; none under reduced motion) with the „Pauza” chip; the level clock stops; deadline ticks and work loops stop | soft paper slide (`slide`, ui bus, 0.6) | — (DOM sheet; caption skipped: the chip says it) | light tick | ● |
| `sourceRegistry.circle` / `uncircle` | field circled / circle taken back (Kartoteka źródeł) | red pencil ellipse draws on / is erased | pencil tick | — (DOM overlay, no world position) | light tick | ● |
| `sourceRegistry.mistake` | clean field circled, or card filed with a warning sign missed | field crossed out, card nudges, mistake tally mark | dull blip | — | thud | ● |
| `sourceRegistry.file` | card filed correctly | „Sprawdzone” stamp slams on the card | stamp thud | — | thud | ● |
| `archive.tick` / `stop` / `miss` / `found` | archive minigame: card passes the frame, drawer braked, wrong card pulled, first mention found | card wobble / card lifts with stamp | riffle tick / click / nope / stamp thud | „Nie ta” stamp on the card | tick / buzz / thud (mobile) | ● → ●● |
| `imageSearch.fragment` | next fragment in the loupe | loupe label changes | soft tick | — | — | ● |
| `imageSearch.match` / `imageSearch.miss` | image search pick | stamp on the printout / red pencil strike | stamp / back | — | tick / thud | ● |
| `metadata.right` / `metadata.mistake` | Metadane minigame (S7-52): the contradicting field, „Zgadza się” or „Brak danych” picked right / a wrong pick | the contradicting field gets a red ✗ mark and pops, or every field gets a ✓ (for „Brak danych” the result banner explains that stripped data proves nothing) / the pick is struck through and the panel nudges (none under reduced motion) | stamp thud / back | — (DOM overlay, no world position; caption skipped: own action) | thud / error | ● |
| `geolocation.found` / `geolocation.miss` | Mapa minigame (S7-55): the district whose two landmarks stand in the photo, or „Nie ma na mapie”, picked right / a wrong pick | a pin drops onto the found district (the button gets a thick outline) / the pick is struck through with a red pencil line and the map nudges (none under reduced motion) | stamp thud / back | — (DOM overlay, no world position; caption skipped: own action) | thud / error | ● |
| `transcript.find` / `transcript.right` / `transcript.miss` | Stenogram minigame (S7-53): the clip's line picked in the record / the round solved (the right „Sens ten sam” or „Sens zmieniony”, or „Nie ma w zapisie”) / a wrong line, button or judgement | a yellow highlighter sweeps the found line, the cut words get an orange underline / a „Sprawdzone” banner with the reason / the pick is struck through in red and the record nudges (sweep and nudge off under reduced motion) | click / stamp thud / back | — (DOM overlay, no world position; caption skipped: own action) | tick / thud / error | ● |
| `crossCheck.right` / `crossCheck.wrong` | Inne media minigame (S7-54): the right answer („Potwierdzają”, „Zaprzeczają”, „Za mało źródeł”) / a wrong answer (one fails the round) | the result banner pops; the cards that count lift, copies get a red „kopia” stamp, satire and anonymous cards fade (the reveal only on success or when the difficulty allows it) / the answer is struck through and the answers row nudges (none under reduced motion) | stamp thud / back | — (DOM overlay, no world position; caption skipped: own action) | thud / error | ● |
| `ambience.phone` / `printer` / `fax` / `typing` | random, quiet, never two at once (`fx/audio/ambience.ts`); skipped while a station or desk overlay is open | idle scene props (fans, clock, glowing monitors, paper stacks) live in `scene/Ambience.tsx` | distant phone / printer / fax / typing on the `sfx` bus, room tone ducks under overlays | dust motes (high preset) | — | ● |
| `ability.extendDeadline` / `role.rescue` HUD | `cardHop` | the extended folder's queue card hops | — | — | — | ● |
| `briefing.intro` / `briefing.land` / `briefing.ready` | briefing card appears / lands on the desk / "Gotowy!" pressed | newspaper spins and drops in, squashes on landing (fade under reduced motion; tap skips) | paper slide / paper slap / stamp | — | — / thud / tick | ● → ●● |
| `debrief.star` / `debrief.mark` | results reveal: each earned star, then each Kolegium card's outcome mark (skippable by any tap/key; off with reduced motion) | star pop / mark slams on like a stamp | chime / stamp thud | — (DOM) | tick | ●● / ● |
| `debrief.row` | results reveal: each row of the „Za co punkty” totals table, after the stars and the progress line (skippable by any tap/key; off with reduced motion) | row slides in, its points count up from 0 (`useRolledNumber`) | soft tick (`tick`, ui bus) | — (DOM) | tick | ● |
| `debrief.vote` | blunder-of-the-day vote | button and voter dot pop | soft paper place | — (DOM) | tick | ● |
| `lobby.modeSwitch` | the host switches Razem / Na punkty: the roomState `mode` changed (everyone hears it, the host's press included; S7-86) | the guests' mode chip pops; the roster becomes two newsroom columns or one row | paper slide (`slide`, ui bus, 0.8) | — (DOM) | light tick | ● |
| `lobby.teamSwitch` | a player moved to the other newsroom: a `players[].team` changed without a mode switch (S7-86) | the player's card pops into its new column (static under reduced motion) | paper slide (`slide`, ui bus, 0.7, jitter) | — (DOM) | light tick | ● |
| `lobby.hostChanged` | the roomState `hostId` changed in the lobby: the host handed it on in the manage sheet („Przekaż gospodarza”) or left (everyone hears it; S7-87) | a crown pops onto the new host's „Gospodarz” chip (static under reduced motion) | soft chime (`chime`, ui bus, 0.6) | — (DOM) | — | ● |
| `lobby.kicked` | the server's `kicked` error: the host removed this member (S7-87) | the menu shows the alert „Gospodarz usunął cię z pokoju.” | buzzer (`buzzer`, ui bus) | — (DOM) | thud | ●● |
| `lobby.lookChanged` | another player's `players[].accessory` or `colorIndex` changed in the same newsroom and mode: a `setLook` from their profile (S7-105; never the local member, whose own pick plays `ui.click`) | the player's avatar takes the new colour and the accessory badge pops onto it (static under reduced motion) | soft tick (`hover`, ui bus, 0.6, jitter) | — (DOM) | — | ● |
| `room.spectatorJoined` | someone new is in `roomState.spectators` (a join or a move to the Widownia; never the local member; a spectator away from the lobby hears nothing; S7-86) | lobby: a new eye chip pops into the Widownia strip; in game: a blue „Widz dołączył” toast with an eye in the verdict-toast stack | soft join chime (`join`, ui bus, 0.5) | — (DOM) | — | ● |

Add a row here when you add a cue, in the same commit.

**Ads have no cues** (S7-74, policy). AdSense forbids drawing attention to ads, so an ad
appearing, filling, failing or being blocked plays no sound, animation, particles or haptics,
and no cue may point at a rail. The „Zgody reklamowe” footer link is an ordinary button
(`ui.click`), and so is „Prywatność” (`LinkButton`, S7-75); Google's consent message is Google's
own UI.

Event → cue mapping lives in `fx/event-cues.ts` (pure, unit-tested for every gameplay event
kind); `net/game-events.ts` adds where it happens (fixture tile centre, folder location or
player position) and who it is about. State-driven feedback (work loop reconciliation, deadline
ticker, last-30-s sting, full-belt alert, solo pause, level-end stingers) lives in
`fx/gameplay-feedback.ts`. Opening and closing the in-game menu use `ui.click` / `ui.back`.
The next-folder countdown (ghost card, conveyor ring) makes no sound: it runs all level long and
would only be noise. Animation listeners (`feedback.onAnimation`) receive
`{ reducedMotion, noFlash }` and must honour them; cues about another player (`remote`) never
vibrate. In a `?debug` build, `window.__fx` exposes `handleGameEvent`, `emitCue` and `useGame`
for testing feedback by hand. Each GameView (S7-85) has its own dispatcher: events are routed with
`routeViewEvent(view, event)`, so a second canvas's particles and shake stay in its own scene;
the player's view uses the global `feedback` that audio, haptics and captions are connected to.
`CueContext.silent` mutes a cue's sound and loops only (particles, shake, animation and the
caption still run), for views that must not be heard.

**Spectators (S7-90).** A watched newsroom's events (`spectatorEvent`) go to its own view
(`routeViewEvent(view, event, isSpectatorAudible)`). Only `SPECTATOR_AUDIBLE_CUES`
(`spectate/spectate-audio.ts`: verdict outcomes, `folder.expired`, `event.*.start`,
`event.raidResolved`, the ability cues that land and `role.rescue`) keep their sound; every other
cue plays silently. Sounds play at `SPECTATOR_SFX_GAIN` (0.6) of the player's volume, panned
`TEAM_PAN` (Kurier −0.5, Głos +0.5) while both newsrooms are on screen and centred when one is;
a newsroom off screen is not heard. No haptics, no camera shake, no hit-stop and no captions
(the event feed of S7-91 is the visual twin of every audible cue). The masked and revealed
results of the versus embargo play no cue.

## Music

- Menu track; per-level track with **intensity layers** (calm / pressure) cross-faded by remaining
  time, urgent folders and low credibility.
- Stingers for win, lose, events; music ducks under them (to 45 %). Intro voice lines duck it
  deeper (to 30 %); the lowest active dip wins. Voice lines are not cues: the intro subtitles them.
  The intro's in-engine scenes (S7-101) emit the usual gameplay cues on their own GameView:
  particles and animation only, since nothing connects audio, haptics or captions to a view
  other than the player's, so the narrator is never covered.
- Loop points seamless; total music within the download budget (stream after first load).

## Animation

- Stage 1–2: procedural animation on greybox capsules (bob, lean, squash & stretch, carry pose).
- Stage 3+: rigged low-poly characters with clips: idle, walk, run, carry-walk, work, stamp,
  cheer, facepalm, shrug, celebrate (per role), emotes for pings, role ability reactions
  (`abilityPower`, `abilityThrow`, `abilityCall`; upper body, so the legs keep walking).
  Cross-fade 0.1–0.2 s driven by player state from snapshots; procedural layer stays on top.
- World: conveyor belt movement, station screens, printer, fans, papers — instanced/shader-based
  where possible.
- UI: screen transitions, stamp slams on the debrief, counters rolling, stars revealing; all
  skippable.
- Animation LOD on mobile: off-screen/far characters update at a lower rate.
- Motion style (physical paper/stamp behaviour, no generic fades and glows) follows
  [`design-rules.md`](design-rules.md) §8.
