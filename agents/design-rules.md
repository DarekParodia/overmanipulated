# Design rules: a cartoon co-op game anyone can read in one second

**Style name: "Kreskówkowa redakcja" (cartoon newsroom).** Think *Overcooked*, *Moving Out*,
*Fall Guys* menus: bright flat colours, thick dark outlines, chunky rounded shapes that look like
toys you can press, one big friendly rounded font, big icons, very little text.

The players are 15–19 year olds, many of whom don't play games, often on a phone, in a noisy
classroom, under time pressure. **If a player has to read more than five words to know what to do
next, the screen has failed.**

These rules are binding for every screen, overlay, icon, 3D asset and line of UI copy. When a rule
blocks you, raise it in the plan's *Open questions*; don't quietly break it.

## 1. Clarity rules (most important)

1. **One screen, one job.** Every screen and overlay has exactly one main action, shown as the
   only yellow (`primary`) button. Everything else is white (`secondary`) or a text link.
2. **Show, don't write.** Icon + one short word beats a sentence. Instructions are at most one
   line (≤ 8 words). Explanations belong in the tutorial or the debrief, never in the middle of
   play.
3. **Big numbers, few numbers.** The HUD shows only time, points, credibility and up to 3 folders.
   Anything else is hidden or moved to the results screen.
4. **Colour = meaning, always the same meaning** (see §3). Never use a meaning colour for
   decoration.
5. **Never colour alone.** Every state also has an icon or shape (priority flags, ✓/✗ marks,
   outlines).
6. **Tell players what to do next.** When a player carries a folder, the station that can help
   lights up, and a hint bubble says what's next ("Zanieś do Lupy", "Gotowe — na stół!").
   The first level starts with a guided tutorial.
7. **Readable from 2 m on a classroom projector and on a 640×360 phone.** Minimum text 15 px
   (secondary labels), body 17 px, HUD numbers ≥ 30 px. Contrast ≥ 4.5:1 for all text.
8. **Big targets.** ≥ 48 px touch targets, ≥ 8 px between them. Main buttons ≥ 60 px tall.
9. **Feedback for everything**, big and immediate: a pressed button moves, a correct verdict
   pops green with a ✓, a mistake shakes red with a ✗ (see `game-feel.md`).

## 2. Shape language

- **Outlines:** every panel, button, card, icon and 3D prop silhouette has a solid navy outline
  (`--outline`, 3 px; 4 px for main panels and primary buttons).
- **Corners:** rounded and chunky — `--radius-md` (16 px) for cards, `--radius-lg` (24 px) for
  panels, pill for buttons and chips.
- **Shadows:** only the hard offset "pop" shadow (`--pop`, `--pop-lg`): a solid navy shadow
  4–6 px straight down, no blur. Pressing a button moves it onto its shadow.
- **Panels** are white (`.panel` in `global.css`) on the sky-blue background or over the 3D
  scene. Inset areas use `--surface-soft`.
- **No:** gradients, glass/blur, soft diffuse shadows, thin 1 px hairlines, paper textures,
  serif fonts, typewriter fonts, tiny uppercase micro-labels, emoji.

## 3. Colour

All colours come from `apps/client/src/ui/tokens.css` (DOM) and `tokens.ts` (three.js/canvas).
`bun run lint:design` fails on colour literals anywhere else.

| Token | Means | Used for |
| --- | --- | --- |
| `--yellow` | "do this next" | the one primary button, hint arrows, active highlight |
| `--green` | true / publish / correct / ready | Publish, success, ready, credibility high |
| `--red` | false / reject / wrong / danger | Reject, errors, deadline < 10 s, credibility low |
| `--orange` | context / warning | Publish with context, "important" priority |
| `--blue` | information / selection / focus | focus ring, selected item, "normal" priority |
| `--purple` | help | tutorial and hint bubbles only |
| `--sky` | background | behind menus |
| `--surface` / `--outline` / `--text` | neutral | panels, outlines, text |
| `--player-0..3` | player identity | avatars, name tags, ping bubbles — nothing else |

Folder priority: normal = blue, important = orange, urgent = red, **plus** the flag shape
(1, 2 or 3 flags) so it never relies on colour.

## 4. Type

- **Display:** *Baloo 2* (rounded, heavy) — titles, buttons, numbers, labels.
- **Body:** *Nunito* (rounded sans, weight ≥ 600) — sentences and story text.
- Both self-hosted via `@fontsource-variable`; both cover Polish (ą ć ę ł ń ó ś ź ż).
- Sizes only from the tokens (`--text-sm` … `--text-3xl`). Numbers use
  `font-variant-numeric: tabular-nums` so timers don't jitter.
- Sentence case for everything except short labels. No letter-spaced micro caps.
- Polish typography still matters: „cudzysłowy”, en dash –, non-breaking spaces after one-letter
  words (`strings/typography.ts`).

## 5. Layout

- **HUD:** time + points + credibility in one compact pill top-left; folder queue (max 3 cards,
  "+N" chip for the rest) top-centre; tool buttons top-right; nothing else on screen during play
  except the hint bubble and touch controls.
- **Overlays** (stations, desk): one panel, title with icon at the top, the task in the middle,
  the main action at the bottom. Desktop: right half, scene visible. Phone: full width, close
  button always reachable.
- **Menus:** content in one centred column ≤ 560 px wide on the sky background; the game logo on
  top. Lobby: player cards in a row, big "Gotowy" toggle, one yellow start button.
- Generous spacing (≥ `--space-4` between groups). If a screen feels crowded, remove things;
  don't shrink them.

## 6. Icons

- Our own set in `ui/icons/Icon.tsx`: 24×24 grid, rounded caps and joins, 2.5 px navy stroke,
  optional flat fill from the palette. Same style for every icon.
- Every story type, station, verdict and role has an icon; icons appear next to their word
  everywhere (HUD, overlays, scene labels).
- No emoji, no stock icon packs.

## 7. 3D scene

- Flat-shaded, saturated low-poly toys: warm wooden floor (`floor`), sky-blue walls (`wall`),
  orange-brown furniture, bright yellow folders. Every interactive prop must be readable from
  the top-down camera by silhouette and colour.
- Interactive things stand out from decoration: stations get a coloured base/sign with their
  icon; the target of the local player gets a yellow outline/ring.
- No PBR shine, bloom, depth of field or HDRI reflections.

## 8. Motion

- Bouncy and quick: `--ease-bounce` for things appearing, `--motion-fast/base` (120–220 ms).
- Things pop in (scale 0.8 → 1.05 → 1), shake on errors, wobble when urgent.
- Reduced-motion setting: no shake, no bounce, fades only. No-flash setting: no blinking.

## 9. Copy (Polish, player-facing)

- Short, direct, friendly: "Zanieś do Lupy", "Gotowy!", "Dobrze!", "Fałszywka!". Imperatives,
  second person singular.
- Never more than one sentence on a game screen. Longer explanations only in the tutorial and
  the debrief (Kolegium).
- Same word for the same thing everywhere (see `agents/glossary.md`).

## 10. Review checklist (before every PR touching UI)

- [ ] Can a new player tell the main action on this screen in one second? Is it the only yellow
      button?
- [ ] Any text a player must read during play is ≤ 8 words?
- [ ] Readable at 640×360 landscape and at 1366×768; nothing below 15 px?
- [ ] Every state has an icon/shape, not only a colour?
- [ ] Only tokens; thick outlines; pop shadows; rounded corners; no gradients/blur/serif/emoji?
- [ ] Touch targets ≥ 48 px; keyboard and gamepad focus visible?
- [ ] Screenshot checked on desktop and Pixel 7 landscape?
