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
  chip (deadline ticks never pile up); at most 3 are visible (only the newest on compact screens).
- The stack sits on the left under the measured HUD band (`hud/hud-band.ts`, S7-11): GameScreen
  publishes the lowest edge of the pill, the folder queue and the menu button as `--hud-band`,
  and the captions, event banners and verdict toasts start under it at any screen size and text
  scale. It never covers HUD numbers, the folder queue, event banners (right) or the touch
  controls (bottom corners). With reduced motion the pop animation has zero duration.
- On phones the HUD pill is one low row (clock, points, credibility; about 56 px tall at
  640×360, band about 64 px), so the captions start right under it; the numbers stay 30 px. A
  long number widens the pill rather than clipping it, and the folder queue moves along.
- When sound is muted and captions are off, a one-time "Włącz napisy" chip offers them.
- **Spectators get the feed instead of captions** (S7-90/S7-91). The spectate screen shows no
  caption chips: a watched newsroom's cues live on its own view's feedback, which the caption
  stack does not listen to. A spectator hears only
  `SPECTATOR_AUDIBLE_CUES` (verdict outcomes, expiries, event starts, raids, abilities), and the
  spectator event feed (S7-91, „Na żywo”, an `aria-live` list) is the visual twin of each of them,
  with an icon and a tone stripe next to the words. No haptics either. Following a player is
  marked by a blue ring on their chip and name tag, never by colour alone (the FollowCard names
  them).

### Intro subtitles (S7-101)

The intro (`intro/IntroPlayer.tsx`) shows its narrator's line in an always-on subtitle bar, one
sentence at a time (`subtitleChunks`), whatever the captions setting: the voice is optional, and
without it (not recorded yet, muted, Lektor at 0, audio still locked) every scene lasts its
reading time (400 ms per word, 2.5–12 s). The bar is a polite live region, at most two lines at
640×360. Voice lines are never cues, so they have no caption chip. Pauza holds the scene and its
subtitle; Wstecz replays the previous one. Reduced motion: the scenes and callouts only fade;
no-flash: nothing in the player blinks.

Scenes 7–11 (S7-102) are UI-kit pictures with at most a few words; their pieces pop in one after
another, the credibility bar drains and the ability ring refills once. Reduced motion fades the
pieces in and shows the drained bar and the full ring at once; a paused intro holds its art too.
The lobby plays the intro on its own once per browser (a new training room); „Pomiń”, Esc, B or
„Gotowe” end it and it does not come back; the settings (Ułatwienia → „Obejrzyj wprowadzenie”)
and „Jak grać?” replay it.

### Station help (S7-95, S7-97)

The first time a browser opens a station, its overlay starts on the station's help card: a
question, up to three numbered steps, the device's own controls drawn as key caps, pad buttons or
touch gestures (`guidance/ControlsArt.tsx`), and what the stamp proves. While the card is open the
minigame's clock waits (client only); the folder's deadline does not, and the card says so
(„Termin teczki biegnie dalej”), so a slow reader loses no attempt. „Rozumiem” (Enter / A / tap)
starts the minigame; '?' in the overlay header (H / Select) brings the card back at any time, and
Ułatwienia → „Pokaż pomoc stanowisk od nowa” shows every card again. The same cards, with a
„Wypróbuj” practice round that sends nothing to the server, live in „Jak grać” → Stanowiska and
in the in-game menu („Pomoc: stanowiska”, without practice). The text follows `textScale`; at
640×360 the card scrolls inside the overlay instead of clipping.

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

## Team identity (versus)

The two „Na punkty” newsrooms never rely on colour (S7-86, S7-89, `ui/TeamBadge.tsx`):

- **Kurier** is a navy shield with a white „K”; **Głos** is a white scalloped seal with a navy
  outline and a navy „G”. They differ by shape, letter and luminance (fill and ink swap), and
  `--team-0` / `--team-1` reuse the outline and surface tokens, so no new hue competes with the
  meaning colours or `--player-0..3`. No colour-blind pair is needed: both fills are the palette's
  darkest and lightest values, whatever the deficiency.
- The badge is never alone: the lobby columns, the rival chip on desktop, the spectator plates,
  the scoreboard and the results write the newsroom's name next to it. Where space is short (the
  phone pill's rival segment, the phone scoreboard), the badge's letter carries the name and the
  element's accessible name says it („Rywale – Głos: 195 pkt. Prowadzicie”).
- Who leads is an arrow (up or down, none when tied) in a small disc and a word in the
  accessible name and the caption („Prowadzicie!”, „Rywale prowadzą”), not the disc's green or
  orange alone. The winner on the results gets a crown and „Zwycięzcy” / „Wygrywa Kurier!”.
- In versus each row of the spectators' feed starts with its newsroom's badge, and a masked row
  also names it („Kurier: werdykt”); the followed player is marked by the blue selection ring
  plus the FollowCard's „Śledzisz: …”.
- Players always learn that they are watched, with the sound off too: „Widz dołączył” is a toast
  in the game and „Nowy widz” a caption (`room.spectatorJoined`).

## Text scaling

`textScale` (1–1.4) multiplies the root font size, so everything laid out in rem follows (HUD,
overlays, minigames, briefing, debrief). On compact landscape screens (`max-height: 500px`: phones,
640×360) the HUD and overlays run out of room above about 1.15, so `--text-scale-max` caps the
effective scale there (`ui/global.css`). Desktop honours the full 1.4. The lobby is a scrolling
page at 640×360 (also at scale 1); nothing is clipped, it scrolls.

## Gamepad, keyboard and touch in menus

`input/menu-nav.ts` (mounted once in `App`) turns the pad's d-pad / left stick into spatial focus
moves between the real controls of the main menu, lobby, briefing and any open `<dialog>`
(settings, leaderboard, „Jak grać”, „O grze”, Profil, „Publiczne pokoje”, the lobby sheets): A presses, B closes the dialog or presses the `data-nav-back` button (the
`back` variant of `Button`), left / right change a slider. Up / down fall back to document order
when nothing lies above or below, so no control is out of reach. Screens with their own handlers
(briefing intro, results, station overlays) win and pass what they do not use. The focus ring is
the global blue ring; after pad moves `:root[data-pad-nav]` forces it even when the last pointer
was a mouse. In the tabbed dialogs („Jak grać”, „O grze”, Ustawienia) Y moves to the next tab,
shown as a pad-only hint („Y zmienia dział”). Keyboard (Tab, Enter, Esc) and touch keep working
natively. Pure logic is tested in
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
(top-left; on compact screens it moves to the right edge, at its old 10 rem offset under the
event banners and never above the HUD band), event banners (top-right), the HUD and the menu
button never sit in the bottom corners where the mirrored controls live, so nothing collides.
The one-row phone pill (S7-11) changes none of this.
