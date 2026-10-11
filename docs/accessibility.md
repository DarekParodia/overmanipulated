# Accessibility and haptics (S5-05, S5-10)

What the game does for players who cannot hear it, cannot tell colours apart, need bigger text,
play with a pad or touch, or are left-handed. Code lives in `apps/client/src/a11y/`,
`fx/haptics.ts` and `input/menu-nav.ts`.

## Captions

Setting `captions` (settings screen) shows a short icon + word chip for every sound that carries
information: deadline warning and ticks ("Termin blisko"), last seconds, pings, boss call phone
("Telefon dzwoni"), outage ("Awaria!"), correction siren, bot raid, a teammate's minigame failure
("Ktoś się pomylił"), a desk opened by someone else ("Biurko zajęte"), folders arriving or lost.

- `a11y/captions.ts` is an exhaustive `Record<CueId, …>`: every cue either has a caption rule or
  a stated reason to skip (`ui`, `own-action`, `visual-elsewhere`, `decorative`). A new cue does
  not compile until it is decided; `captions.test.ts` also fails for a sound cue without an entry,
  for captions longer than 3 words and for unknown icons.
- Cues reach the stack through `feedback.onCue` (muted or not). Chips of one group refresh one
  chip (deadline ticks never pile up); at most 3 are visible (2 on compact screens).
- The stack sits on the left under the HUD pill; it never covers HUD numbers, the folder queue,
  event banners (right) or the touch controls (bottom corners). With reduced motion the pop
  animation has zero duration.
- When sound is muted and captions are off, a one-time "Włącz napisy" chip offers them.

## Colour blindness

`a11y/colorblind.ts` simulates protanopia, deuteranopia and tritanopia (Machado 2009) and measures
CIEDE2000 distance; `a11y/meaning-pairs.ts` lists the meaning pairs and the non-colour signal that
carries each. `colorblind.test.ts` fails when a pair collapses (ΔE < 15) without a named redundant
channel. Regenerate the full table with `bun tools/a11y/colorblind-report.ts`.

Results (ΔE2000; below 15 is confusable by colour alone):

| Pair | normal | protan. | deuteran. | tritan. |
| --- | ---: | ---: | ---: | ---: |
| green / red | 74.2 | 20.3 | **3.7** | 71.6 |
| orange / yellow | 17.3 | **10.7** | **7.3** | **13.6** |
| blue / purple | 21.9 | **8.1** | **3.2** | 37.0 |
| green / orange | 47.4 | **8.7** | **14.4** | 59.8 |
| red / orange | 32.8 | 22.6 | **13.0** | **14.0** |
| blue / orange, blue / red (priority) | ≥ 44 | ≥ 43 | ≥ 56 | ≥ 63 |
| player 0 / 3 | 41.8 | 47.9 | 42.2 | **7.9** |
| player 1 / 2 | 37.7 | 30.2 | 24.7 | **14.4** |
| player 1 / 3 | 34.2 | **8.7** | 18.8 | 63.6 |
| player 2 / 3 | 51.3 | 24.7 | **7.2** | 68.6 |

Findings and fixes:

- Green/red (publish / reject) collapse for deuteranopes. Already backed by check / cross icons,
  stamp shapes and words; unchanged.
- Orange/yellow, blue/purple, green/orange, red/orange are close under several deficiencies. Each
  is backed by icon + label (badges), flags (priority 1–3) or the lightbulb icon (hints).
- Player colours collapse in some pairs. Players were identified by colour alone on ping bubbles
  and vote dots. **Fix:** each player also has a shape (circle, square, triangle, diamond;
  `ui/PlayerMark.tsx`) shown on name tags, ping bubbles and debrief vote dots. Lobby cards and the
  briefing already carry the initial and the nickname.
- Navy text on every meaning fill reaches at least 3:1 (large, bold UI text).

## Text scaling

`textScale` (1–1.4) multiplies the root font size, so everything laid out in rem follows (HUD,
overlays, minigames, briefing, debrief). On compact landscape screens (`max-height: 500px`: phones,
640×360) the HUD and overlays run out of room above about 1.15, so `--text-scale-max` caps the
effective scale there (`ui/global.css`). Desktop honours the full 1.4. The lobby is a scrolling
page at 640×360 (also at scale 1); nothing is clipped, it scrolls.

## Gamepad, keyboard and touch in menus

`input/menu-nav.ts` (mounted once in `App`) turns the pad's d-pad / left stick into spatial focus
moves between the real controls of the main menu, lobby, briefing and any open `<dialog>`
(settings, leaderboard): A presses, B closes the dialog or presses the `data-nav-back` button (the
`back` variant of `Button`), left / right change a slider. Up / down fall back to document order
when nothing lies above or below, so no control is out of reach. Screens with their own handlers
(briefing intro, results, station overlays) win and pass what they do not use. The focus ring is
the global blue ring; after pad moves `:root[data-pad-nav]` forces it even when the last pointer
was a mouse. Keyboard (Tab, Enter) and touch keep working natively. Pure logic is tested in
`input/menu-nav.test.ts`.

## Haptics

`fx/haptics.ts` has five patterns shared by phone and pad: tick, thud, success, error, alarm, as
Vibration API timelines and as dual-rumble steps (`playEffect` with `startDelay`, falling back to
the legacy `hapticActuators[0].pulse`). `rumbleIntensity` scales pulse length and magnitudes (0 =
off); `haptics: false` silences everything; pulses shorter than 4 ms are dropped. Cues use success
for good outcomes, error for mistakes, alarm for emergencies (boss call, raid, fake published,
defeat); other people's cues never vibrate your hands. Everything is wrapped in try/catch: iOS and
desktop browsers simply do nothing.

## Left-handed mode

Outside `TouchControls` the guidance dock and the ping picker already mirror. The caption stack
(top-left), event banners (top-right), HUD and room chip never sit in the bottom corners where the
mirrored controls live, so nothing collides.
