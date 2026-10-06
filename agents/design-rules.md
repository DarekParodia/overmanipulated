# Design rules: make it look made, not generated

The game must look like a specific newsroom built by specific people, not like a generic
template. Generated-looking UI is recognisable: soft gradients, glass cards, rounded everything,
emoji icons, centred heroes, the same five fonts, vague cheerful copy. Jurors and students spot it
immediately, and it undermines a game about spotting fakes.

These rules are binding for every screen, overlay, icon, 3D asset and line of UI copy. When a rule
blocks you, raise it in the plan's *Open questions*. Do not quietly break it.

## 1. The identity: a 1990s-ish provincial newsroom on deadline

Everything derives from **physical newsroom objects**: newsprint, manila folders, rubber stamps,
carbon copies, typewriter labels, pinned notes, proof marks, red editing pencil, cork boards,
phone message slips. Before designing any UI element, answer: *what physical newsroom object
is this?* Examples:

| UI element | Physical object it imitates |
| --- | --- |
| Main menu | Front page of the *Kurier Nowobrzeski* with the menu as headlines |
| Lobby | Duty roster pinned to a cork board, players' names typed on strips |
| Folder queue (HUD) | Manila folder tabs sticking out of an inbox tray |
| Credibility meter | Printed circulation gauge / masthead "trust" seal that cracks |
| Station overlay | The tool itself: archive drawer, phone pad, light table with loupe |
| Editorial desk | Desk blotter with the folder open and three stamps to choose |
| Toasts / results | Telex strip or phone message slip sliding in |
| Debrief | Next morning's paper with the corrections column |
| Buttons | Typewriter keys, stamp handles, paper tabs — not pills |
| Settings | Printed form with checkboxes ticked by pen |

If something has no newsroom equivalent, make it plain and quiet. Do not invent a generic web
component for it.

## 2. Banned (AI/template tells)

Do **not** use:

- Purple/blue/pink gradients, gradient text, mesh/aurora backgrounds, "glow" behind elements.
- Glassmorphism, frosted blur panels, neumorphism.
- Uniform large border radius on everything (`rounded-2xl` look). Paper has square or very
  slightly worn corners. Radius ≤ 2 px except for physical objects that are actually round
  (stamps, dial buttons).
- Soft, large, diffuse drop shadows on cards. Use hard, short, offset shadows (paper on desk), or
  none.
- Emoji as icons or decoration, in UI or in content.
- Generic icon sets used as-is (Lucide/Heroicons/Material look). Icons are our own set, drawn
  for this game (see §6).
- Default font stacks or the usual suspects as primary type: Inter, Roboto, Poppins,
  Montserrat, Open Sans, system-ui. Also avoid trendy defaults like Fraunces or Space Grotesk.
- Centred hero + subtitle + two buttons layouts; three feature cards in a row; dashboard grids of
  identical cards.
- Perfect symmetry and perfect alignment everywhere. Newspaper layouts use columns, rules and
  asymmetry (see §4).
- Stock 3D look: default grey PBR materials, generic HDRI environment reflections, bloom on
  everything, depth-of-field blur, plastic toy shine.
- Generic illustrations: smiling flat people with purple skin, "blob" shapes, isometric
  tech-startup scenes.
- AI-generated images used as final art without an artist repainting/editing them. Story images
  that are *supposed* to be AI fakes inside the game are the only exception, and they are marked
  as such in content data.
- Lorem ipsum or placeholder copy committed outside `__fixtures__`.

## 3. Colour

Tokens live in `apps/client/src/ui/tokens.css` (CSS custom properties) and are mirrored for
three.js in `apps/client/src/ui/tokens.ts`. **Never hard-code a colour outside these files.**

| Token | Role | Starting value |
| --- | --- | --- |
| `--paper` | Main background (newsprint) | `#EFE8D8` |
| `--paper-shade` | Second paper, folded/aged areas | `#E2D8C2` |
| `--manila` | Folders, tabs | `#D9B77A` |
| `--ink` | Text, rules, outlines | `#1F1C18` |
| `--ink-soft` | Secondary text | `#4A443C` |
| `--editorial-red` | Accent: alarms, rejected, headlines kicker | `#B3261E` |
| `--copy-blue` | Accent: carbon/pencil blue, links, "publish" | `#2C4A7A` |
| `--ochre` | Accent: "publish with context", warnings | `#C98A1B` |
| `--cork` | Lobby board, wood details | `#A97C50` |

- The interface is mostly **paper and ink**. Accents are rare and mean something: red =
  danger/false, blue = confirmed/publish, ochre = context/caution. A screen with more than ~10%
  accent colour is wrong.
- Colour never carries meaning alone. Verdicts, folder types and priorities always also have a
  **shape/icon and a label** (colour-blind players; see [`platforms.md`](platforms.md)).
- Check contrast: body text ≥ 4.5:1 on paper, HUD text over the 3D scene always on a paper plate.
- 3D scene uses the same palette: warm wood, paper, muted walls, a few red accents. No
  saturated neon.

## 4. Typography

| Use | Typeface (OFL, self-hosted, must include ą ć ę ł ń ó ś ź ż) |
| --- | --- |
| Headlines, masthead, debrief | **Newsreader** (serif, built for news) — display optical sizes, tight leading |
| Body, folder text, explanations | Newsreader text sizes |
| Labels, HUD numbers, buttons, tabs | A condensed grotesque, e.g. **Archivo** (narrow/condensed widths) — tabular figures for timers/score |
| Typewritten notes, folder metadata, stamp results | A typewriter face, e.g. **Courier Prime** |
| Stamps | Lettering drawn as SVG (see §6), not a font with a filter only |

- Fonts are self-hosted (`@fontsource/*` or files in `public/fonts`). No Google Fonts CDN:
  school networks and privacy. Check the Polish glyphs before adopting; final choices go in the
  Decision log.
- Use a real type scale with strong contrast between levels (e.g. headline 3–4× body), not
  everything 14–20 px.
- Uppercase + letter-spacing only for small labels (kickers, tabs), never for paragraphs.
- Numbers in HUD use tabular figures so timers don't jitter.
- **Polish typography is done properly:** quotes „…” and ‚…’, en dash with spaces – for
  breaks, non-breaking space after single-letter words (*w, z, i, a, o, u*) to avoid orphans at
  line ends (helper in `strings/typography.ts`), dates `6 października 2026`, times `14:05`,
  thousand separator as a thin space.

## 5. Layout and composition

- Build screens on a **newspaper column grid** (e.g. 6 or 12 columns with visible column
  rules), with deliberate asymmetry: a dominant element, secondary columns, small marginalia.
- Use **rules** (thin and thick lines), boxes and folds to separate content, not cards with
  shadows.
- Texture is subtle and real: newsprint grain, slight halftone in images, occasional coffee ring
  or fold mark on non-interactive areas. Texture never reduces text contrast. All texture is in
  one atlas and disabled on the `low` preset if needed.
- Small imperfections on purpose: stamps rotated ±3°, slight ink misregistration on printed
  elements, papers not perfectly aligned. Randomness is seeded per element, so it doesn't jitter
  between renders.
- Density is allowed. A newsroom is busy, but hierarchy must stay obvious: one thing to read
  first on every screen.
- On phones the same identity holds: the column grid collapses to 1–2 columns, objects get
  bigger, nothing turns into a generic mobile list.

## 6. Icons, stamps and illustrations

- One custom icon set drawn for the game (SVG, ink-stroke style, slightly irregular lines),
  covering folder types, stations, verdicts, priorities, pings and settings. Stored in
  `apps/client/src/ui/icons/` as React components generated from SVGs.
- Folder type icons double as the folder's tab marking in 3D (same drawing, one atlas).
- **Stamps are the signature element.** Each stamp is an SVG with drawn lettering, a border
  shape that differs per verdict/station (circle, rectangle, double frame), an ink texture mask
  and a seeded rotation and ink density. Pressing a stamp in the UI is the main animated moment
  (see [`game-feel.md`](game-feel.md)).
- Characters and illustrations follow the 3D low-poly style or a consistent hand-drawn ink style.
  No mixing in other illustration styles.

## 7. 3D style

- Low-poly with **flat or gently stylised shading**, a limited palette from §3, and baked or
  vertex-coloured lighting where possible. No photoreal PBR.
- Lighting: warm key light from windows, soft ambient, short hard shadows (desktop `high` only).
  No HDRI reflections and no bloom except tiny accents (e.g. red alarm light) that respect
  no-flash.
- Characters: chunky, readable silhouettes from the top-down camera, role accessory visible from
  above (camera, glasses, notebook, tie), player colour on a large surface (vest/sweater).
- Props tell the story: piles of paper, mugs, cork boards with pinned clippings of in-game
  stories, a wall clock, a fax. Kenney CC0 assets are a starting point and must be recoloured and
  dressed so they don't read as a stock pack.

## 8. Motion

- Motion imitates physical objects: paper slides and settles with slight overshoot, stamps slam
  and bounce, folders flip like card stock, telex strips type out. No generic fade-and-scale on
  everything, no floating elements, no infinite pulsing glows.
- Durations short (120–300 ms UI, up to ~600 ms for celebratory moments); always skippable;
  reduced-motion setting replaces movement with simple cuts.

## 9. Copy (Polish UI text)

UI text is part of the design. Generated copy has a recognisable tone, so avoid it.

- Write like a gruff, warm editor-in-chief: short, concrete, newsroom vocabulary
  ("Do składu!", "Teczka przepadła", "Zdejmujemy to"). No marketing voice.
- Banned: "Odkryj", "Witaj w świecie…", "Zanurz się", "niesamowity", "Twoja przygoda zaczyna
  się tutaj", exclamation marks on everything, emoji, rhetorical triple lists, overuse of dashes
  as a stylistic tic.
- Buttons are verbs in Polish infinitive or imperative, consistently ("Graj", "Dołącz",
  "Gotowe"). One wording per action across the whole game.
- Story content follows the same rule and [`content-authoring.md`](content-authoring.md).
  Fake posts in the game may imitate social-media style on purpose, but the game's own voice may
  not.

## 10. Process

- **Reference board first.** `docs/design/references.md` collects real references (photos of
  newsrooms, newspaper front pages, stamps, folders, typewritten forms), with sources. Prefer
  photos the team took themselves. Every new screen cites which references it draws from.
- **Sketch → greybox → styled.** Layouts are sketched (paper photo or quick wireframe in
  `docs/design/`) before styling. Greybox stages may be ugly, but they must not use banned
  patterns as placeholders, because placeholders tend to survive.
- **Design review checklist** for every UI/art change (copy into the commit body or PR):
  - [ ] Which physical newsroom object does this imitate?
  - [ ] No item from §2 (gradients, glass, big radii, soft shadows, emoji, stock icons, default
        fonts, centred hero, generic copy).
  - [ ] Colours only from tokens; accent ≤ ~10%; meaning never by colour alone.
  - [ ] Type from the defined families; Polish typography (quotes, orphans, dates) correct.
  - [ ] Works and still looks like the newsroom at 640×360 landscape.
  - [ ] Motion physical, short, skippable, reduced-motion aware.
  - [ ] Screenshot compared side by side with the reference board and with existing screens for
        consistency.
- **Squint test and swap test.** Squinting at the screen, the hierarchy must still read. If you
  could swap our logo for another product's and the screen would still make sense, it isn't
  specific enough.
- Humans on the team own the final art direction. Agents implement within these rules and
  propose; they do not invent a new style.
