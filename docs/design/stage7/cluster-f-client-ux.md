# Cluster F — Client UX (desk result + outcome vocabulary, end-of-level "points + stars + why", next-folder timer, mobile HUD + in-game menu + HUD-aware camera, station how-to + practice, animated intro with offline Polish TTS, O grze, profile/look, lobby level details, ability-chip reservation)

# Cluster F: Client UX design (Stage 7)

Everything below was checked against the code on branch `claude/festive-thompson-yhfqfe` (clean tree, HEAD a1f456c). Paths are relative to `/home/user/overmanipulated`.

## 0. Ownership and cross-cluster contracts

Cluster F is mostly client work. It **consumes** wire data that other clusters own and **proposes** one small protocol addition (look). The fields F relies on are listed here so the owners can design to them. F tasks that depend on them say so.

| Contract | Owner | What F needs (exact shape proposal) |
| --- | --- | --- |
| `folderResultSchema` (`packages/shared/src/entities.ts:84-93`) | A | `outcome` adds `'unfinished'`. `reason: folderReasonSchema` (enum below). `breakdown: { base: int, speed: int, proofs: int, bossCall: int }`, with invariant `base+speed+proofs+bossCall === scoreDelta`. `citedStampIds: id[] (max 3)`. `requiredStamps: int 1..3`. `playerId: playerId \| null`. |
| `verdictResult` event (`protocol.ts:272-284`) | A | the same `reason`, `breakdown`, `citedStampIds` (replaces the single `justifyingStampId`), `requiredStamps`. |
| `levelEndMessageSchema` (`protocol.ts:331-341`) | A (+D for versus) | `starThresholds: {two:int, three:int} \| null` (null for endless and versus), `maxScore: int \| null`, `lossReason: 'credibility' \| 'score' \| null`, `difficulty`. Versus adds `teams: [{id, score, credibility, won, results}]` and `winner: teamId \| 'draw'`. |
| `snapshotMessageSchema` (`protocol.ts:199-213`) | A | `nextFolder: { atMs: number; sinceMs: number } \| null` (level-time ms of the next **scheduled** spawn and of the previous one; level-event folders are excluded, so they are not telegraphed), `conveyorFull: boolean` (the due entry is held because no belt tile is free, see `sim/folders.ts:59-85`). |
| Difficulty-scaled minigame limit | A | A pure `minigameTimeLimitMs(difficulty)` in shared; F09/F10 read it instead of `MINIGAME_TIME_LIMIT_MS` (`constants.ts:114`). |
| Star shares for adaptive thresholds | A | A constant such as `STAR_SHARES = { two, three }` in `constants.ts`, shown in the lobby details. |
| `folderReasonSchema` (new, entities.ts) | A (F proposes the values) | `correctNormal, correctImportant, correctWithContext, correctionFiled, weakProof, publishedFake, rejectedTrue, contextOnTrue, publishedWithoutContext, rejectedContextStory, expired, expiredUnpenalized, unfinished`. These map 1:1 to the branches in `desk.ts:34-61`, `desk.ts:122-129` and `scoring.ts:61-76`. |
| Look (colour + accessory) | D/E (protocol/rooms), proposed by F | `accessorySchema = z.enum(['none','scarf','bowTie','pressBadge'])` in domain.ts. Optional `look: { color: int 0..PLAYER_COLOR_COUNT-1 \| null, accessory }` on `joinMessageSchema` (`protocol.ts:63-71`). Lobby action `{kind:'setLook', look}`. `lobbyPlayerSchema` (`protocol.ts:156-167`) gets `accessory`. Server `freeColorIndex(room, preferred)`. |
| Per-player stats accumulator | E (spectator stats), shared with F profile | A pure `packages/shared/src/player-stats.ts`, `accumulatePlayerStats(stats, event, playerId)`. The server spectator feed and the client profile both use it, so it is never written twice. |
| Ability chip and button | B | F reserves the layout (§8). B owns the chip contents, R/RB and the 4th touch button. |
| New `StationKind` ids | C | `pl.stationHelp` is `satisfies Record<StationKind, StationHelp>`, so C's enum change forces the 4 new entries. Ids are assumed to be `map`, `transcript`, `otherMedia`, `metadata` until C fixes them. |

PROTOCOL_VERSION (`constants.ts:6` = 2): F bumps nothing on its own except in F19 (look). Recommendation: **one coordinated bump to 3** that lands all Stage 7 wire changes (A, D, F19) together, so classrooms reload only once.

---

## 1. Desk result fix ("Zabrakło") and one outcome vocabulary

### Verified problem
- `evaluateVerdict` fills `missedStampIds` for every outcome, including `correct` (`packages/shared/src/sim/desk.ts:75`).
- `ResultView` renders `pl.desk.missed` = 'Zabrakło:' whenever the list is non-empty (`apps/client/src/stations/DeskOverlay.tsx:481-483, 522-536`; `strings/pl.ts:359`). It shows the stamp *text* of stamps nobody collected.
- On a `wrong` verdict the correct verdict is never shown at the desk.
- Three vocabularies exist:
  - `pl.hud.toast` (pl.ts:304-312)
  - `pl.desk.outcomes` (350-355)
  - `pl.results.outcomes` (788-793)
- The toast title for a wrong verdict depends only on the verdict (`hud-model.ts:140-149`). So rejecting a *misleading* story says "To była prawda!", which is false.
- The result auto-hides after `VERDICT_RESULT_SHOW_MS = 4000` (`StationLayer.tsx:22, 151-157`).

### Design
**Pure model** `apps/client/src/stations/desk-result-model.ts`:
```ts
export type DeskResultLine =
  | { kind: 'proof'; stations: StationKind[] }            // correct: "Dowód:" + chips
  | { kind: 'weakProof' }                                  // "Ten dowód niczego nie rozstrzyga"
  | { kind: 'tooFewProofs'; have: number; need: number }   // "Dowody: 1 z 2"
  | { kind: 'decidedBy'; stations: StationKind[] }         // "Rozstrzyga:" + chips
  | { kind: 'correctVerdict'; verdict: Verdict }           // "Właściwy werdykt:" + <VerdictStamp size="sm">
  | { kind: 'proofInFolder'; stations: StationKind[] }     // wrong, but a deciding stamp WAS collected
  | { kind: 'notChecked'; stations: StationKind[] };       // wrong, no deciding stamp collected
export type DeskResultInput = {
  outcome: FolderOutcome; reason: FolderReason; verdict: Verdict;
  citedStampIds: readonly string[]; folderStampIds: readonly string[];
  requiredStamps: number; levelStations: readonly StationKind[]; expert: boolean;
};
export function deskResultLines(input: DeskResultInput, story: Pick<Story,'correctVerdict'|'justifyingStamps'|'stamps'>): DeskResultLine[]
```
Algorithm:
1. `deciding` = unique stations of `story.justifyingStamps`, in `story.stamps` order, filtered to `levelStations`.
2. `collected` = `justifyingStamps ∩ folderStampIds`.
3. Per outcome:
   - `correct` → `[proof(stations of citedStampIds)]`.
   - `correctionFiled` → `[]`.
   - `wrongJustification` → if `requiredStamps > 1 && citedJustifying < requiredStamps`, then `[tooFewProofs, decidedBy(deciding)]`; else `[weakProof, decidedBy(deciding)]`.
   - `wrong` → `[correctVerdict(story.correctVerdict)]`, then `proofInFolder(stations of collected)` if `collected` is non-empty, else `notChecked(deciding)`.
4. `expert` (Ekspert difficulty) drops `decidedBy`, `proofInFolder` and `notChecked`; only the title, deltas and correct verdict remain.
5. At most 2 lines; each line is ≤ 8 words because chips carry station **names only**, never stamp text.

**Reason before A ships it:** `apps/client/src/hud/outcome.ts` exports `reasonOf(outcome, verdict, story)`. It mirrors `desk.ts:34-61` and `expiryIsPenalized` (`domain.ts`). `outcome.test.ts` checks it against the sim for every truth × priority × verdict, the same mirror-plus-test pattern as `stations/deadline-extension.ts`. Once A's `reason` is on the wire, F03b deletes the mirror and reads the field.

**UI:**
- `ResultView` renders `deskResultLines` in place of the missed block.
- Deltas row: points, credibility, speed bonus, plus new chips "Premia za dowody +N" and "Szef +N" taken from `breakdown`.
- Title is `pl.outcome.title[reason]`.
- Non-correct results add a small line `pl.desk.result.moreInKolegium`.
- `VERDICT_RESULT_SHOW_MS` becomes `{ good: 4000, bad: 6500 }` in StationLayer.tsx (UI timing, not balance).
- The toast (`hud-model.ts verdictToast`) and the Kolegium card head use the same `pl.outcome.title[reason]`.
- Remove `pl.desk.outcomes`, `pl.results.outcomes`, `pl.hud.toast.{correct,wrongJustification,fakePublished,truthRejected,wrong,expired}`, `pl.desk.missed` and `pl.debrief.missed`.
- Screen-reader marks use `pl.outcome.group[outcome]`.
- Kolegium only (debrief may be longer, design-rules §1.2):
  - The 'Zabrakło pieczątek' section becomes **'Dowód, który rozstrzygał'**. It lists each justifying stamp (station icon, name, text) with a status chip: 'wskazany' / 'w teczce' / 'nie sprawdzono'.
  - It is shown only when `outcome !== 'correct'` (design doc l.58: "Przy błędzie pokazuje też, co dokładnie przeoczono").

**Copy (`pl.outcome`, used by toast, desk and Kolegium; all ≤ 8 words):**

| reason | title | Kolegium `why` (longer allowed) |
| --- | --- | --- |
| correctNormal | Dobrze! | `Trafny werdykt: ${base} pkt` |
| correctImportant | Dobrze! | `Ważna teczka, trafny werdykt: ${base} pkt` |
| correctWithContext | Dobrze, z kontekstem! | `Kontekst w punkt: ${base} pkt` |
| correctionFiled | Sprostowanie poszło! | `Sprostowanie opublikowane: ${base} pkt i odzyskana wiarygodność` |
| weakProof | Słaby dowód | 'Werdykt dobry, ale wskazany dowód nic nie rozstrzygał: połowa punktów' / `Za mało dowodów (${have} z ${need}): połowa punktów` |
| publishedFake | Fałszywka w druku! | 'Fałszywka trafiła do druku: najwyższa kara' |
| rejectedTrue | To była prawda! | 'Odrzuciliście prawdziwą wiadomość' |
| contextOnTrue | Kontekst niepotrzebny | 'Prawdziwa wiadomość nie potrzebowała kontekstu' |
| publishedWithoutContext | Bez kontekstu! | 'Ta wiadomość wymagała kontekstu, a poszła bez niego' |
| rejectedContextStory | Wystarczył kontekst | 'Wystarczyło opublikować z kontekstem' |
| expired / expiredUnpenalized | Teczka przepadła | 'Termin minął: kara za spóźnienie' / 'Termin minął bez kary: niepilna, niepotwierdzalna teczka' |
| unfinished | Nie zdążyliście | 'Teczka została na koniec wydania: 0 pkt' |

- Bonus suffixes: `tempo +${n}`, `dowody +${n}`, `szef +${n}`, joined with ' · '.
- `pl.outcome.group`: `{ correct:'Dobrze', wrongJustification:'Słaby dowód', wrong:'Błędny werdykt', expired:'Przepadła', unfinished:'Nie zdążyliście' }`.
- `pl.desk.result`: `{ proof:'Dowód:', weakProof:'Ten dowód niczego nie rozstrzyga', tooFewProofs:(h,n)=>\`Dowody: ${h} z ${n}\`, decidedBy:'Rozstrzyga:', correctVerdict:'Właściwy werdykt:', proofInFolder:'Dowód był w teczce:', notChecked:'Nie sprawdzono:', moreInKolegium:'Szczegóły w Kolegium', proofsBonus:'Premia za dowody', bossBonus:'Szef dzwonił' }`.
- Station chips: `STATION_ICON` (`stations/kit.tsx`) plus `pl.guidance.stationShort` (pl.ts:806-813).

Layout at 640x360: the phone panel already hides `.outcomeStory` (DeskOverlay.module.css 520-535). Two line rows of 2.5rem fit under the deltas row.

---

## 2. End-of-level feedback: points, stars and the reasons behind them

### Pure model `apps/client/src/debrief/results-model.ts` (unit-tested)
```ts
export type TotalsRowId = 'correct'|'correction'|'weakProof'|'wrong'|'expired'|'unfinished'|'speed'|'proofs'|'bossCall';
export type TotalsRow = { id: TotalsRowId; count: number; points: number; credibility: number };
export function resultTotals(results: readonly FolderResult[]): { rows: TotalsRow[]; points: number; credibility: number };
export type StarProgress = { earned: 0|1|2|3; won: boolean; thresholds: { two: number; three: number }; next: { stars: 2|3; missing: number } | null; shares: { two: number; three: number } | null };
export function starProgress(score: number, won: boolean, earned: number, thresholds: {two:number;three:number}, maxScore: number | null): StarProgress;
export type LossReason = 'credibility' | 'score' | null;
export function lossReasonOf(end: LevelEndMessage): LossReason;   // prefers end.lossReason; fallback credibility<=0 → 'credibility', !won → 'score'
export type KolegiumCard = DebriefCard & { reason: FolderReason; credibilityDelta: number; breakdown: Breakdown; count: number; proofs: ProofRow[] };
export function kolegiumCards(results, lookup, mode: 'folder' | 'story'): KolegiumCard[];
export type RevealStep = { atMs: number; kind: 'star' | 'progress' | 'row' | 'mark'; index: number };
export function revealPlan(p: { stars: number; rows: number; marks: number }): RevealStep[];
```

**Rules:**
- Totals rows:
  - Base points go to the outcome row: `correct*` → correct, `correctionFiled` → correction, `weakProof` → weakProof, the five wrong reasons → wrong, `expired*` → expired, `unfinished` → unfinished.
  - `breakdown.speed/proofs/bossCall` go to bonus rows, counted when > 0.
  - Credibility goes to the outcome row.
  - Rows with count 0 are omitted.
  - Invariant (tested): `Σ rows.points === Σ results.scoreDelta`.
  - If that differs from `levelEnd.score` (endless results capped at `ENDLESS.maxResultsSent` = 512), an extra row 'Inne' carries the difference.
- Star progress:
  - `next` = the lowest threshold above `score` when won.
  - `null` when 3 stars or when lost.
  - `shares = round(threshold / maxScore × 100)` when `maxScore` is present.
  - The rule shown is 1 star for a positive score at time-out (`scoring.ts:20-41`).
- Cards are **per folder** in campaign/versus, so card points add up to the total. In endless they are **per story, grouped** (`count`, summed points), so the list stays bounded (up to 512 results).
  - This replaces `debriefCards` (`debrief-model.ts:48-83`, which dedupes by storyId at 58-64) and updates its tests.
  - Blunder votes stay per `storyId`.
- Reveal timing:
  - Existing `REVEAL_START_MS=520`, `REVEAL_STAR_MS=420`, `REVEAL_PAUSE_MS=260`, `REVEAL_MARK_MS=380` (`use-reveal.ts:7-10`).
  - New `REVEAL_PROGRESS_MS=300` and `REVEAL_ROW_MS=140`.
  - Order: stars → progress line → rows → marks.
  - `useReveal` takes `revealPlan(...).map(s => s.atMs)`; `revealTimes` stays as a thin wrapper so existing tests keep passing.

**Literal tests:**
- Totals:
  - Input results:
    - correctImportant: base 20, speed 5, cred +5
    - correctNormal: 10
    - weakProof: 5
    - publishedFake: −20 / −25
    - expired: −5 / −5
    - unfinished: 0
  - Expected rows: correct ×2 +30 (+5), speed ×1 +5, weakProof ×1 +5, wrong ×1 −20 (−25), expired ×1 −5 (−5), unfinished ×1 0; total 15.
- Star progress:
  - `starProgress(305, true, 2, {two:205, three:320}, 400)` → `next {stars:3, missing:15}`, shares {two:51, three:80}.
  - `(150, true, 1, …)` → `{2, 55}`.
  - `(320, …)` → `next null`.
  - `(−5, false, 0, …)` → `next null`, `won false`.
- Loss reason: `lossReasonOf({credibility:0, won:false, lossReason: undefined})` → 'credibility'.
- Reveal plan: `revealPlan({stars:2, rows:3, marks:2})` →
  - stars at [520, 940]
  - progress at 1620
  - rows at [1920, 2060, 2200]
  - marks at [2460, 2840]

### ResultsPlate (`apps/client/src/hud/ResultsPlate.tsx`) changes
1. **Ribbon lede** (155-172): won 'Gazeta idzie do druku.'; lost by `lossReasonOf`: 'Wiarygodność spadła do zera.' / 'Wynik nie przekroczył zera.'. A difficulty chip goes next to the headline.
2. **Summary column** (210-245) becomes a new component `ResultsSummary`:
   - Star row: each `RatingStar` gets a caption under it: 'wynik ponad 0' / `od ${two} pkt` / `od ${three} pkt`.
   - Progress line: [RatingStar×3 icons] `brakuje ${n} pkt`, or 'Komplet gwiazdek!', or 'Gwiazdki są tylko za wygraną'.
   - A `<details>` 'Skąd te progi?' → `Progi liczymy od najlepszego wyniku możliwego w tym wydaniu (${max} pkt): dwie gwiazdki od ${two}%, trzy od ${three}%.` This makes the adaptive thresholds explainable (user decision 3).
   - Then the score/credibility figures (existing).
   - Then the totals table 'Za co punkty': columns name · ×count · pkt (`useRolledNumber` count-up, `hud/use-rolled-number.ts`) · credibility, footer 'Razem', and the note 'Pasek nie spada poniżej 0 i nie rośnie ponad 100.'
   - Numbers use `formatDelta` / `formatScore` (`hud-model.ts:62-76`).
3. **Kolegium** (249-290), using `DebriefCard.tsx`:
   - Head: title by reason, points chip, **credibility chip** (shield glyph + delta), and the one-line `why` under the headline.
   - The 'Dowód, który rozstrzygał' section replaces `missed` (203-218).
   - Endless grouped cards show '×3'.
   - Unfinished folders come last with the hourglass mark.
4. **Phones** (`PHONE_QUERY` = `(max-height: 500px), (max-width: 760px)`, `debrief/use-media-query.ts:5`):
   - The ribbon lede is hidden today (ResultsPlate.module.css:334-420).
   - So the paged Kolegium gets **page 0 = "Podsumowanie"**: `ResultsSummary` rendered as a card with lede, star captions, progress line and totals table.
   - Add a `lead?: ReactNode` prop to `Kolegium`.
   - The pager shows "Podsumowanie" + "1 z N".
   - Phone reveal: stars, then rows on page 0; mark steps 0 (each mark shows when paged to).
   - At 640x360, page 0 holds about 232 px: header 40 + 6 rows × 28 px. The card scrolls internally if a 7th row appears.
5. **Endless:**
   - Unchanged figures (survived, best).
   - Totals table, no stars.
   - Grouped cards.
6. **Versus / spectator** (F04):
   - Ribbon: 'Wasza gazeta była lepsza!' / 'Tym razem lepsi byli rywale.' / 'Remis! Obie gazety równe.'; spectators get the neutral 'Koniec meczu'.
   - Summary: two `TeamScoreCard`s (team name + colour, score, credibility, folders ✓, verdict accuracy %, crown on the winner).
   - Totals for the own team; spectators switch teams with `Segmented` (`endless/Leaderboard.tsx`).
   - Kolegium per folder with 'Wy' and 'Rywale' verdict chips. Both sims share the seed, so folder ids `f<n>` line up.
   - A team with credibility 0 shows 'Wiarygodność spadła do zera – przegrana.'
7. Cues: new `debrief.row` (ui bus, sprite `tick`, volume 0.5, haptic tick; caption `skip('visual-elsewhere')`). The existing `debrief.star` and `debrief.mark` stay.

---

## 3. Next-folder timer

**Data:** `snapshot.nextFolder` and `conveyorFull` (from A) are stored in `net/game-store.ts applySnapshot` and extrapolated by `hud/use-level-clock.ts` (`inMs = atMs − elapsedMs`). Endless and difficulty are therefore correct, because the server computes them.

**Queue model** `apps/client/src/hud/queue-model.ts`:
```ts
export type QueueView = { shown: Folder[]; hidden: number; ghost: 'next' | 'full' | null };
export function queueView(i: { sorted: readonly Folder[]; widthPx: number; cardPx: number; gapPx: number; chipPx: number; next: boolean; full: boolean }): QueueView
```
- `fit(n, chip) = n·card + (n−1)·gap + (chip ? gap+chip : 0) ≤ width`.
- `max` starts at `QUEUE_SHOWN` = 3 (`FolderQueue.tsx:17`) and drops while it does not fit.
- If `sorted.length ≤ max`: show all; ghost if `(next || full) && sorted.length < max && fit(len+1, false)`.
- Else: show `max`, `hidden = len − max`.
- `useQueueCapacity(sectionRef)` measures `section.clientWidth` and the first `[data-folder]` width with a ResizeObserver. Fallback card width is 92 px on phones and 7.5rem on desktop.
- Tests:
  - width 300, card 90, gap 8, chip 40: 3 folders → 3 shown; 4 folders → 2 shown + hidden 2; 2 folders + next → ghost.
  - width 240: 3 folders → 2 + hidden 1.

**UI:**
- `FolderQueue.tsx` renders `<li className="card ghost">`: dashed outline (`--outline` dashes, no fill), hourglass icon, seconds in `--text-xl` (`${s} s`).
  - Phone sideways variant: the band holds the hourglass, the countdown sits on the right (same rules as `FolderQueue.module.css:174-244`).
  - When `full`: orange band, conveyor icon, label 'Taśma pełna'.
- The empty state (45-46) shows the ghost card plus `Nowa teczka za ${s} s`. When there is no next folder: 'To już wszystkie teczki'.
- a11y: static `aria-label` 'Następna teczka' (no per-second announcements).
- **Conveyor sign:**
  - `scene/entities.ts` adds indicator kinds `{kind:'incoming'; fraction; seconds}` and `{kind:'full'}`, plus a pure `conveyorIndicator(next, elapsedMs, full)` with `fraction = clamp01((elapsed − sinceMs)/(atMs − sinceMs))`.
  - `StationIndicators.tsx` `indicatorFor` (107-121) routes conveyor signs (`fixtureIds: []` at line 100) to it.
  - Ring: blue fill for incoming, orange for full.
  - The name pill reuses the outage second-line pattern (`nameDown`), showing `za ${s} s` / 'Pełna'.
- Guidance: `next-step.ts` wait branch (line ~300) uses `pl.guidance.hint.waitIn(s)`. When `conveyorFull` and folders are on the conveyor: 'Taśma pełna – zabierz teczkę'.
- Cue `folder.beltFull`: fires on the rising edge of `conveyorFull`; sprite `hmm`, ui bus, volume 0.6; haptic tick; caption `{icon:'conveyor', text:'Taśma pełna', tone:'warn'}`; plus a game-feel row. No sound for "incoming" (noise).
- **design-rules §1.3 amendment, in the same commit:** "The HUD shows only time, points, credibility and up to 3 folders; a free queue slot may hold one dashed ghost card counting down to the next folder (or 'Taśma pełna')." §5 changes the same way. Level-event folders are not telegraphed.

---

## 4. Mobile HUD, in-game menu, HUD-aware camera

### 4a. In-game menu (all devices)
`GameScreen.tsx:46-61` (fullscreen, settings and leave buttons plus `RoomChip`) is replaced by `hud/GameMenuButton.tsx`:
- Icon `menu`, a new 3-bar icon in `ui/icons/Icon.tsx`. 3.5rem on desktop, 3rem on phones.
- A red dot badge when `connection !== 'online'`.
- Carries `data-hud-band`.

`hud/GameMenu.tsx` is a native `<dialog>`, which gives menu-nav scope (`menu-nav.ts:86-93`) and B-to-close (152-165).
- **No pause** (multiplayer). The header shows an orange chip 'Gra trwa dalej'.
- `useInputCapture(true)` stops movement.
- Rows:
  - Room `Pokój ABCD` + copy + status/ping (logic moved from `RoomChip.tsx`).
  - 'Wróć do gry' (the only yellow primary).
  - 'Ustawienia'.
  - 'Pomoc: stanowiska' (opens HowToPlay on the stations tab, practice disabled).
  - 'Pełny ekran' (if `canFullscreen()`).
  - 'Wyjdź z redakcji' (`back` variant). It needs two presses within 3 s; the label changes to 'Na pewno? Wyjdź'.
- **Keys:**
  - Keyboard: Esc toggles. When the tutorial card is active and nothing is captured, Esc keeps skipping the tutorial first (`Tutorial.tsx:149-153`); the menu ignores that Esc.
  - Gamepad: Start toggles (add `PAD.start = 9` in `input/gamepad.ts:8-16`; rising edge polled in a new `input/menu-button.ts subscribeMenuButton(cb)`).
  - Touch: tap.
- **Layout:**
  - Desktop: a 22rem panel anchored under the button.
  - Phones: a right sheet `min(22rem, 62vw)`, full height, two-column grid of 48 px buttons. At 640x360: header 48 + 3 rows × (48 + 8) + paddings ≈ 260 px, which fits.
- `--hud-tools-w` becomes one button: `3.5rem` desktop, `3rem` phones (`Hud.module.css:11, 325`).

### 4b. One-row phone pill (`Hud.module.css` phone block 319-355)
- The pill is a row: `[clock icon][m:ss] │ [star][score] │ [shield][value]`. The credibility track is a 0.375rem strip under the shield+value cell.
- Numbers stay `--text-xl` = 30 px (design-rules §1.7) and icons 22 px.
- `--hud-pill-w: 19.5rem` campaign, `22.5rem` endless (the `.endless` class on `.hud`).
- The endless tempo chip moves inline into the pill on phones (it hangs under the pill at `Hud.module.css:71-89` today).
- `--hud-queue-h: 3.25rem`.
- The 761-1100 px stacked layout (279-317) is unchanged.

Geometry at text scale 1 (the compact cap is 1.15, `ui/global.css:18-20`):
- Pill height = 30 + 8 + 2·4 + 2·3 ≈ 52 px. With top 8 → bottom at about 60 px.
- Queue cards are about 52 px with tag overhang 12 → HUD band ≈ 64 px (today the pill alone is about 145 px tall).

| Viewport | Pill | Queue width | Cards shown |
| --- | --- | --- | --- |
| 640x360 | 312 px | 640−8−312−12−12−48−8 = 240 px | 2 + '+N' (3 when exactly 3 folders do not fit → 2+'+1') |
| Pixel 7 landscape 863x360 | 312 px | 463 px | 3 + '+N' |
| 640x360 at text scale 1.15 | 359 px | 193 px | 2, or 1 + '+N' |

**Band store** `hud/hud-band.ts`:
- `bandBottom(rects, viewportH)` returns the max `bottom` of rects whose `top < viewportH/2`, clamped to `viewportH × HUD_BAND_MAX_SHARE (0.3)`.
- `useHudBand` is a zustand store `{px}`.
- `useHudBandMeasure(rootRef)` uses a ResizeObserver on `[data-hud-band]` (pill, queue, menu button) plus window resize.
- `GameScreen` sets `style={{'--hud-band': px+'px'}}` on `<main>`.
- `CaptionStack.module.css:9, 101` becomes `top: calc(var(--hud-band, 9.75rem) + var(--space-2))`.
- `EventBanners.module.css:9, 118` and `VerdictToasts.module.css:7, 128` use the same variable.
- The left-handed rule (`docs/accessibility.md:89-93`) still holds: nothing moves into the bottom corners.

### 4c. HUD-aware follow camera (`scene/CameraRig.tsx`)
Extract the math into pure `scene/camera-framing.ts`:
```ts
export type FramingInput = { width:number; height:number; mapW:number; mapH:number; local:{x:number;y:number}|null; topInsetPx:number };
export type Framing = { follow:boolean; target:{x:number;z:number}; visibleDepth:number; viewOffsetY:number };
export function computeFraming(i: FramingInput): Framing;
export function placeCamera(camera: PerspectiveCamera, focus: Vector3, f: Framing, size:{width:number;height:number}, punch:number, shake:{x:number;y:number;roll:number}): void;
```
- **Fit mode:** identical to lines 56-83 (`viewOffsetY = 0`, `clearViewOffset()`).
- **Follow mode:**
  - `inset = min(topInsetPx, height·0.3)`.
  - `fullDepth = height/MIN_TILE_PX/sin(E)` (tiles stay 40 px).
  - `usableDepth = (height − inset)/MIN_TILE_PX/sin(E)`.
  - `halfU = min(usableDepth/2, mapH/2 + FOLLOW_EDGE_MARGIN)`.
  - `target.z = clamp(local.y, halfU − FOLLOW_BACK_MARGIN, mapH + m − halfU)`; x as today.
  - `visibleDepth = fullDepth`.
  - `viewOffsetY = −inset/2` → `camera.setViewOffset(w, h, 0, −inset/2, w, h)`, which moves the projection centre to the middle of the uncovered area.
  - `feedback.screenX` (46-49) and `overlay.ts screenTransform` both use `camera.project`, so signs and name tags stay attached.
- `CameraRig` reads `useHudBand.getState().px` each frame. It calls `setViewOffset` only when the inset or size changed, and `clearViewOffset()` when leaving follow mode.

Worked numbers at 640x360 (and 863x360, same height), band 64:
- `fullDepth` 10.61, `usableDepth` 8.73, `halfU` 4.36.
- Player at the belt (z≈2.5): uncovered top z ≈ −1.86. Belt row 1 (z 1..2) projects to y ≈ 64 + 2.86..3.86 × 33.9 ≈ **161-195 px**, below the 64 px band.
- Today it lands at about 129-163 px, under the 145 px pill.
- Player mid-room (z=6): the belt is mostly off the usable area, as expected in follow mode.
- The 'Wejście' sign (≈ 0.45 above the belt surface) lands around 130 px, still clear.

Tests:
- `camera-framing.test.ts` (three.js math runs in bun):
  - For every layout in `LEVELS` plus `ENDLESS_LAYOUT`, at sizes 640x360 and 863x360, band 64, local = the floor tile in front of the first conveyor tile:
    - every conveyor tile centre `(col+.5, .5, row+.5)` projects to `64+4 ≤ y ≤ height`;
    - every station sign on row 1 has `y ≥ 64`.
  - With `topInsetPx = 0` the framing equals today's (regression).
  - Fit mode at 1366x768 is unchanged.
- **Playwright:** a new project `phone-small` (`devices['Pixel 7 landscape']` with `viewport {width:640,height:360}`, `testMatch: /phone-layout\.spec\.ts/`). `mobile` also runs it. `e2e/phone-layout.spec.ts`:
  1. Solo host starts training. Assert:
     - pill height ≤ 60;
     - band bottom ≤ 72;
     - queue box intersects neither the pill nor `game-menu-button`;
     - menu button ≥ 48×48;
     - CaptionStack top ≥ band.
  2. Esc opens the menu sheet; all buttons are inside the viewport; 'Wróć do gry' is visible.
  3. `__game.setState({levelEnd})` (production `?debug` hook, `debug/game-hook.ts`) shows results page 0 with the star captions.
- Regenerate `docs/contest/screenshots/pixel7/*` with `bun run contest:build -- --screenshots`.
- Decision log: this supersedes the 2026-10-09 row "phone camera framing relies on compact strips plus the existing back margin".

---

## 5. Station how-to

**Strings** `pl.stationHelp` (new):
```ts
type StationHelp = { purpose: string; proves: string; steps: Record<Device, readonly [string, string, string?]>; realWorld: string };
stationHelp: { title:'Jak to działa?', got:'Rozumiem', openLabel:(s)=>`Jak działa: ${s}`, deadlineRuns:'Termin teczki biegnie dalej', proofLabel:'Dowód:', kinds: {...} satisfies Record<StationKind, StationHelp> }
```

| kind | purpose | proves | steps (keyboard / gamepad / touch differ only where shown) |
| --- | --- | --- | --- |
| imageSearch | Czy to zdjęcie krążyło już wcześniej? | Dowód: zdjęcie jest starsze lub z innego miejsca | 1 Porównaj kółka na zdjęciu z wynikami · 2 Q / Y przełącza lupę · touch: Przeciągnij lupę na wynik · 3 Wybierz strzałkami, zatwierdź spacją / krzyżak + A / Stuknij wynik ze wszystkimi kółkami |
| archive | Kiedy o tym napisano po raz pierwszy? | Dowód: data pierwszej wzmianki | 1 Szukaj karty z hasłem z teczki · 2 ←/→ przewijają, spacja hamuje / Krzyżak przewija, A hamuje / Przesuń szufladę palcem · 3 Wyjmij najstarszą pasującą kartę |
| sourceRegistry | Kto naprawdę stoi za kontem lub stroną? | Dowód: źródło wiarygodne albo podejrzane | 1 Czytaj pola karty po kolei · 2 E / A zakreśla podejrzane pole / Stuknij podejrzane pole · 3 Q / Y odkłada kartę / Stuknij „Odłóż kartę” |
| phone | Zapytaj u źródła: świadka lub urząd | Dowód: źródło potwierdza albo zaprzecza | 1 Znajdź w książce źródło z teczki · 2 W/S wybiera, E dzwoni / Krzyżak i A / Stuknij numer · 3 Poczekaj w kolejce (reporter nie czeka) |
| aiScanner | Czy materiał zrobiła maszyna? | Tylko wskazówka, nigdy jedyny dowód | 1 Odczytaj wynik i margines błędu · 2 Margines sięga 50%? Wybierz „Nie wiem” · 3 A/D i E / Krzyżak i A / Stuknij odpowiedź |
| dataLibrary | Czy liczba zgadza się z tabelą? | Dowód: liczba prawdziwa albo zmieniona | 1 Porównaj liczbę z artykułu z tabelą · 2 Uważaj na rok, wiersz i jednostkę · 3 Spacja: komórka, Q: nie pasuje / A i Y / Stuknij komórkę albo „Nie pasuje” |
| map* | Gdzie naprawdę zrobiono to zdjęcie? | Dowód: miejsce się zgadza albo nie | Znajdź charakterystyczne szczegóły · Dopasuj je do miejsca na mapie · device confirm |
| transcript* | Czy wycięty cytat zmienia sens? | Dowód: pełna wypowiedź | Znajdź cytat w pełnym zapisie · Przeczytaj zdanie przed i po · Zdecyduj: sens ten sam czy inny |
| otherMedia* | Co piszą agencje i inne redakcje? | Dowód: inni potwierdzają albo milczą | Przejrzyj nagłówki innych redakcji · Szukaj niezależnych potwierdzeń · Zdecyduj: potwierdzone czy nie |
| metadata* | Kiedy i czym zrobiono ten plik? | Dowód: data, aparat i program edycji | Porównaj datę i aparat z opisem · Sprawdź, czy plik edytowano · Wskaż pole, które się nie zgadza |

\* Copy for the new stations is provisional until cluster C's minigame designs land (F09c). Every step is ≤ 8 words (unit-tested). `realWorld` reuses the glossary analogues (`agents/glossary.md:52-61`), e.g. 'Tak działa wyszukiwanie obrazem wstecz.'

**Touch KeyHints:** fill `pl.minigames.*.keys.touch` (pl.ts:396, 431, 457, 595, 643, 677 are all `[]` today, so `KeyHints` renders nothing per `kit.tsx:28-52`):
- imageSearch: `[{keys:['Stuknij'],label:'wynik'},{keys:['Przeciągnij'],label:'lupę'}]`
- archive: `[{keys:['Przesuń'],label:'przewijaj'},{keys:['Wyjmij'],label:'najstarsza karta'}]`
- sourceRegistry: `[{keys:['Stuknij'],label:'zakreśl'},{keys:['Odłóż kartę'],label:'gotowe'}]`
- phone: `[{keys:['Stuknij'],label:'dzwoń'}]`
- aiScanner: `[{keys:['Stuknij'],label:'odpowiedź'}]`
- dataLibrary: `[{keys:['Stuknij'],label:'komórka'},{keys:['Nie pasuje'],label:'zgłoś'}]`

**Shared control drawings:** move `Key`, `PadButton`, `TouchButton`, `Control` and `Illustration` from `guidance/Tutorial.tsx:47-132` (not exported today) into `guidance/ControlsArt.tsx` + `ControlsArt.module.css`. They are reused by the help card and the intro.

**StationHelpCard** (`stations/StationHelpCard.tsx`): purple header (`--purple` = help, design-rules §3), station icon + name, purpose (display font), numbered steps for the active device, a small animated control drawing (reduced motion → static), the 'Dowód:' line, the 'Termin teczki biegnie dalej' note, and yellow 'Rozumiem'.

**First use and '?' in a match:**
- `stations/station-help-store.ts` keeps seen kinds in `redakcja.stationHelp.v1` (JSON array) via `store/safe-storage.ts`.
- `StationOverlay.tsx`:
  - Shows the card over the minigame body when `!seen(kind)`.
  - **Pauses the client clock:** a new pure `minigameElapsed(now, startedAt, pausedTotal, pausedAt)` in `stations/overlay-logic.ts`, used through a hook `useMinigameClock(limitMs, paused)`. It replaces lines 40-44, 76-88 and 100-102, and is also used by the practice and MinigameBench.
  - While shown, the card subscribes to nav intents last and swallows all of them: confirm/back close the card, not the station.
  - The server deadline keeps running; `MINIGAME_TIME_LIMIT_MS` is client-only (StationOverlay.tsx:84-88).
- `OverlayFrame.tsx` gets an optional `help?: { onOpen(): void; keyCap?: string }` prop. It renders a 48 px '?' button (`Icon 'question'`) before the close button (header at 49-73), with the KeyCap 'H' or 'Select'.
- Shortcuts: keyboard **H** (not used by any minigame; Q/Tab are `alt` in `ui-nav.ts:27-28` and minigames use Q). Gamepad **Select (8)**; the tutorial's Select-hold skip is ignored while input is captured (`Tutorial.tsx:169`).
- Settings → Ułatwienia gets 'Pokaż pomoc stanowisk od nowa' (clears the key).
- Ekspert keeps the help (it explains controls, not answers).

**'Jak grać' dialog** (`howto/HowToPlayDialog.tsx`):
- Lazy chunk; tiny always-loaded store `howto/store.ts`: `{open, tab, station, practiceAllowed, autoplay, show(tab, opts), hide()}`.
- Native `<dialog>` like `EncyclopediaScreen`.
- Tabs via `Segmented`: 'Wprowadzenie' (play icon) / 'Stanowiska' (stamp icon) / 'Sterowanie' (gamepad icon, reuses `ControlsTab` from `SettingsTabs.tsx`).
- Gamepad Y = `alt` switches tabs, matching settings ('Y zmienia dział', pl.ts:159).
- Stanowiska tab: a grid of 10 station tiles (icon + name). Selecting one shows the StationHelpCard plus yellow **'Wypróbuj'**.
- Opened from:
  - MainMenu corner 'Jak grać?' (`MainMenu.tsx:70-82`, icon `question`);
  - Lobby top actions;
  - the in-game menu (practice off: `practiceAllowed:false`, with the note 'Ćwiczenia po wydaniu');
  - tappable Briefing 'Nowe dziś' chips (`Briefing.tsx:219-233`; the dialog closes itself when `screen` becomes `game`);
  - Settings.

**Practice** (`howto/PracticeRound.tsx`):
- Extracted from the pattern in `stations/minigames/MinigameBench.tsx:13-78`.
- `practiceStory(kind, attempt)` is pure: it rotates through `STORIES` that have a stamp for `kind`.
- Seed = attempt + 1.
- Uses `useMinigameClock(limit)` and `minigameFor(kind)`.
- Outcome banner 'Udało się!' / 'Nie tym razem', then 'Jeszcze raz' (yellow) and 'Wróć'.
- **Never imports `net/session.ts`**, so it never sends a command; this is checked in code review and by a unit test on the module's imports.
- Calls `attachInput()` (idempotent, `input-manager.ts:71-86`).
- `MinigameBench` is rebased onto the same hook.

---

## 6. Animated intro tutorial with offline Polish TTS

### 6a. Feasibility check (run read-only from this sandbox, 2026-10-13)
- PyPI is reachable (it is on the proxy noProxy list): `pip index versions piper-tts` lists **1.8.0** … 1.1.0. Python 3.13.16, pip and ffmpeg are installed.
- **huggingface.co is blocked**: `CONNECT tunnel failed, response 403` (organization egress policy), and so are `cdn-lfs.huggingface.co` and `hf-mirror.com`. The Piper voice `.onnx` files live only on HF (VOICES.md links `huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/pl/pl_PL/...`), so **voice generation cannot run in this environment** unless `huggingface.co` (plus the HF download CDN hosts) is added to Allowed domains in the environment's network settings. Otherwise it runs on a developer machine.
- GitHub raw is reachable. The model cards (`raw.githubusercontent.com/rhasspy/piper-samples/master/samples/pl/pl_PL/<voice>/<q>/MODEL_CARD`) read:

| Voice | Speakers/quality | Dataset licence | Base model |
| --- | --- | --- | --- |
| pl_PL-darkman-medium | 1, medium, 22.05 kHz | **CC0** (Nabu Casa voice-datasets; README: "licensed under CC0 (public domain)") | fine-tuned from en_US-lessac-medium |
| pl_PL-gosia-medium | 1, medium | **CC0** (same) | fine-tuned from lessac |
| pl_PL-mc_speech-medium | 1, medium | **CC0** (Kaggle MC Speech) | fine-tuned from lessac |
| pl_PL-mls_6892-low | 1, low, 16 kHz | CC BY 4.0 (OpenSLR 94) | fine-tuned from en_US-ryan-low |

- Caveat: en_US-lessac's own dataset licence points to the Blizzard 2013 Lessac licence page, which this sandbox also could not reach (403). That licence is commonly described as research/non-commercial. So the Polish medium voices have CC0 *data* but weights derived from a possibly non-commercial base.
- The Piper tool itself (OHF-Voice/piper1-gpl) is GPL-3.0. It is used offline only and nothing from it ships; its audio output is not covered by the GPL.

### 6b. Voice choice and licence handling
- **Pick `pl_PL-darkman-medium`.** It is a single male speaker, which fits the "gruff, warm editor-in-chief" voice of the copy (pl.ts:1-2). It has a CC0 dataset and medium quality. `gosia` (female) is the drop-in alternative via `--voice`. Listen to both at rhasspy.github.io/piper-samples before committing.
- **CREDITS.md row:** "Intro voiceover (`voice/intro.*`) | Generated offline by `tools/audio/synth_voice.py` with Piper TTS, voice `pl_PL-darkman-medium` (dataset darkman, Nabu Casa voice-datasets, CC0; model fine-tuned from en_US-lessac) | Project's own output; dataset CC0".
- **Decision-log exception:**
  - It breaks `docs/audio.md:3` ("All audio is synthesised from oscillators… no samples").
  - It strains the "only CC0 or self-made" rule in CREDITS.md because of the lessac base.
  - Reason: the user asked for TTS Polish voiceover; the clips are generated, not sampled; the dataset is CC0.
  - Condition: **before AdSense is enabled in production (cluster ads), replace the clips with a human recording or a voice trained from scratch on the CC0 dataset**. The tool's `--recordings` mode makes that a one-command swap.
- The same commit fixes the stale CREDITS.md font rows: it lists Newsreader/Archivo/Courier Prime, but `apps/client/package.json` ships `@fontsource-variable/baloo-2` and `nunito` (SIL OFL 1.1).

### 6c. Generation pipeline
**`tools/audio/intro-lines.ts`** (bun) imports `INTRO_CLIPS` from `apps/client/src/intro/intro-script.ts` and prints JSON `{clipId: {subtitle, tts}}` to stdout. No file is written. `tts` = `ttsText(subtitle)`: NBSP → space, drop „” quotes, then apply `PRONOUNCE` respellings (e.g. 'Nowobrzeskiego' if mispronounced).

**`tools/audio/synth_voice.py`:**
1. Run `bun tools/audio/intro-lines.ts` and parse its output.
2. Load the voice from `--model PATH`, or download `pl_PL-darkman-medium.onnx` + `.onnx.json` (HF v1.0.0 URLs) into `~/.cache/redakcja/piper/` and verify **pinned SHA-256** values (filled on the first run; mismatch aborts).
3. For each clip: `PiperVoice.load(model)`, then `voice.synthesize_wav(tts, wav, syn_config=SynthesisConfig(length_scale=1.05, noise_scale=0.6, noise_w_scale=0.8))` (API per piper1-gpl docs/API_PYTHON.md). With `--recordings DIR`, take `DIR/<clipId>.wav` instead (human-recording swap).
4. Post-process: trim silence below −45 dBFS, 10 ms fades, normalise to **−20 dBFS RMS** (speech class, peak ≤ −3 dBFS), 120 ms gap (as `GAP_S` in synth_placeholders.py).
5. Concatenate and encode with ffmpeg: `public/assets/voice/intro.webm` (Opus, mono, 24 kbps, `-application voip`) and `intro.mp3` (mono, 22.05 kHz, 40 kbps).
6. Write `apps/client/src/intro/voice-sprite.json`: `{voice, source:'tts'|'recording', clips:{[id]:{startMs, durationMs, textSha1}}}` (zod `voiceSpriteSchema` validated at import). `textSha1` = sha1 of NFC-normalised, whitespace-collapsed subtitle text.
7. Fail if either file exceeds `VOICE_MAX_BYTES = 700_000`.

Expected size: about 17 clips / 115 s of speech → about 350 KB webm and about 575 KB mp3.

**`voice-sync.test.ts`:** fails when any subtitle's sha1 differs from the sprite ('clip X out of date: run python3 tools/audio/synth_voice.py'). It also fails when a clip is missing or the json is invalid. `measure.py` adds a `voice: (-24.0, -16.0)` window. `docs/audio.md` gets a "Voice" section.

### 6d. Voice bus (client)
- `AudioBus = 'ui'|'sfx'|'music'|'voice'` (`fx/cues.ts:6`).
- `busVolume` (`audio-manager.ts:26-30`) maps voice → `settings.voiceVolume`.
- `BUS_TRIM.voice = 1` (`mix.ts:16-20`).
- Settings schema (`store/settings.ts:11-32`): `voiceVolume: unit.catch(0.9)`.
- SoundTab gets a slider 'Lektor'.
- `fx/audio/voice.ts`:
  - `loadVoice(): Promise<boolean>` creates a lazy Howl with `src ['/assets/voice/intro.webm','/assets/voice/intro.mp3']` and the sprite from json. It resolves false on loaderror or after 4000 ms.
  - `playVoice(id, onEnd): () => void`. It is a no-op returning stop when muted, unloaded or locked; the caller then uses the fallback timer.
  - `applyVoiceVolume(settings)` hooks into the `initAudio` settings subscription.
- `duck.ts` `request(nowMs, durationMs, depth = DUCK_TUNING.depth)`, with new `DUCK_TUNING.voiceDepth = 0.3` (the lowest active depth wins). The intro requests the duck for each clip.
- The CSP already allows it: `media-src 'self' blob: data:` and `connect-src 'self'` (Caddyfile:21). `/assets/*` misses return a real 404 (Caddyfile:47-58).

### 6e. Timeline model (`apps/client/src/intro/intro-model.ts`, pure)
```ts
export const INTRO_WORD_MS = 400, INTRO_MIN_SCENE_MS = 2500, INTRO_MAX_SCENE_MS = 12000, INTRO_GAP_MS = 450, INTRO_END_GRACE_MS = 1500;
export function fallbackMs(text: string): number;          // clamp(words*400, 2500, 12000)
export function sceneDurationMs(text: string, clipMs: number | null): number; // clip ? clip+1500 : fallback
export type IntroState = { index:number; startedAt:number; endedAt:number|null; pausedAt:number|null; pausedTotal:number; done:boolean };
export type IntroAction = {type:'start';now} | {type:'clipEnded';now} | {type:'tick';now} | {type:'next';now} | {type:'prev';now} | {type:'togglePause';now} | {type:'skip'};
export function introReducer(s: IntroState, a: IntroAction, durations: readonly number[]): IntroState;
export function subtitleChunks(text: string, durationMs: number): { text:string; atMs:number }[]; // split at /(?<=[.!?…])\s+/, timed by character share
export function shouldAutoplayIntro(i: { screen: ScreenId; levelId: string; seen: boolean; spectator: boolean; open: boolean }): boolean; // lobby && levelNumber(levelId)===0 && !seen && !spectator && !open
```
- Advance when `clipEnded && now − endedAt ≥ 450`, or `elapsed (excluding pauses) ≥ duration`.
- `done` at the end of the last scene. That sets `redakcja.intro.seen.v1`, as does skip. Interruption by the game starting does not.
- Literal tests:
  - `fallbackMs('a b c')` = 2500; 12 words → 4800; 40 words → 12000.
  - `subtitleChunks('Raz dwa trzy. Cztery pięć!', 4000)` → `[{'Raz dwa trzy.',0},{'Cztery pięć!', round(14/26·4000)=2154}]` (weights are chunk lengths including the following space).
  - The reducer with a muted voice advances at fallback times.
  - `shouldAutoplayIntro({screen:'lobby', levelId:'l0-greybox', seen:false, spectator:false, open:false})` = true; with `'l1-burza'` = false.

### 6f. Script (`intro/intro-script.ts` + `pl.intro.voice`, about 78 s)
| scene / clip | art (DOM/SVG, game UI kit) | Polish line (subtitle = voice) |
| --- | --- | --- |
| welcome | GameLogo + masthead 'Kurier Nowobrzeski' | Witaj w redakcji Kuriera Nowobrzeskiego! Jestem naczelnym. Czas goni, a na taśmę ciągle wpadają nowe teczki. |
| folders | conveyor strip, 3 `FolderCard`s sliding in (photo/post/quote, flags) | W każdej teczce jest zgłoszenie: zdjęcie, post albo cytat. Część to prawda, część to fałszywki, a część to prawda, której brakuje kontekstu. |
| pickup.keyboard / .gamepad / .touch | `Illustration move/pickup` per device | Chodzisz klawiszami W, A, S i D. Podejdź do taśmy i weź teczkę klawiszem E. / Chodzisz lewą gałką. Podejdź do taśmy i weź teczkę przyciskiem A. / Chodzisz, przesuwając kciuk po lewej stronie ekranu. Przy taśmie stuknij przycisk Podnieś. |
| work.* | station sign with a filling ring + `Control work` | Zanieś teczkę na stanowisko i przytrzymaj spację / przycisk X / przycisk Pracuj. Potem rozwiąż krótkie zadanie. |
| stations | Lupa/Archiwum/Kartoteka icons, stamp slam | Każde stanowisko sprawdza co innego. Lupa szuka starszych kopii zdjęcia, Archiwum pierwszej wzmianki, a Kartoteka sprawdza, kto stoi za kontem. Dobrze rozwiązane zadanie daje pieczątkę: to twój dowód. |
| desk | mini desk sheet: 1 dowód, 2 three `VerdictStamp`s | Z dowodami idź do stołu redakcyjnego. Najpierw wskaż dowód, potem werdykt: Publikuj, Odrzuć albo Z kontekstem. |
| proof | ✓ card 'Dobrze!' vs 'Słaby dowód', '0/2' chip | Liczy się dowód, który naprawdę rozstrzyga. Dobry werdykt na słabym dowodzie to tylko połowa punktów. Trudniejsze teczki wymagają nawet dwóch albo trzech dowodów. |
| credibility | HUD pill replica, draining shield bar, red countdown card | Pilnuj terminów i wiarygodności gazety. Spóźnienie kosztuje, ale fałszywka w druku kosztuje najwięcej. Gdy wiarygodność spadnie do zera, wydanie przepada. |
| roles.* | 3 `RoleIcon` passes + ability control (R / RB / 4th button) | Każdy może wybrać rolę. Rola przyspiesza pracę i daje umiejętność specjalną. Włączasz ją klawiszem R / przyciskiem RB / czwartym przyciskiem, potem musi się naładować. |
| team | 4 `PlayerMark`s, ping bubble, purple hint bubble | Rozmawiajcie i dzielcie się pracą. Fioletowy dymek zawsze podpowie, co dalej. |
| end | Kolegium card + `RatingStar`×3 | Po wydaniu Kolegium wyjaśni każdą teczkę i pokaże, za co dostaliście punkty i gwiazdki. Do roboty! |

That is 8 shared clips plus 3 × 3 device variants = 17 clips. The `roles` lines depend on cluster B's final ability key, button and name; placeholder until then. The intro is "in-engine" in the sense of being rendered live from the game's own UI kit (Icon, VerdictStamp, FolderCard, ControlsArt, RatingStar, PlayerMark, RoleIcon). It is not a video, and not three.js, which would pull the 1.6 MB game chunk into the lobby.

### 6g. IntroPlayer UI (`intro/IntroPlayer.tsx`, inside the HowToPlay 'Wprowadzenie' tab)
- **Stage:**
  - 70% height, scene art with CSS keyframes.
  - `data-reduced-motion` → cross-fades only; `data-no-flash` → nothing blinks.
- **Subtitle bar:** always on. `typeset()` text, 2 lines maximum, `--text-lg` on desktop and `--text-md` on phones, white panel with a navy outline. It shows `subtitleChunks` in sync.
- **Controls:** 'Wstecz', 'Pauza'/'Wznów', **'Dalej' (yellow)**, which becomes 'Do roboty!' on the last scene, and 'Pomiń'. Progress dots show `Scena n z N`.
- **Input:**
  - Keyboard: ←/→ prev/next, Space pause, Enter next, Esc skip.
  - Gamepad: d-pad L/R, A next, X pause, B skip (via `useNavIntent`).
  - Touch: the buttons.
- **640x360:** the dialog is fullscreen; the stage is about 210 px; subtitles 2 × 22 px; one row of 48 px buttons.
- **Audio locked:** a chip 'Stuknij, by włączyć głos'; the timeline continues on fallback timing.
- **Autoplay:**
  - `Lobby.tsx` runs an effect with `shouldAutoplayIntro`, then `howTo.show('intro', {autoplay:true})` (tab bar hidden).
  - It preloads `loadVoice()` on lobby mount when the rule holds.
  - New rooms default to `DEFAULT_LEVEL_ID = 'l0-greybox'` (`packages/content/src/index.ts`), so a host who has not seen it watches once.
  - Guests joining a training room also get it.
  - Spectators (cluster E) never get it.
- **Replay:** MainMenu 'Jak grać?' → Wprowadzenie, and Settings → Ułatwienia 'Obejrzyj wprowadzenie'.
- **Bundle:** `tools/perf/check-bundle.ts`.
  - `lazyGraph` (97-109) counts every dynamic import of the entry as **game** (230), and `audioFiles` walks only `assets/audio` (182-210).
  - Add `EXTRAS_SOURCES = ['src/intro/','src/howto/','src/about/','src/profile/']` (manifest keys).
  - `lazyGraph(manifest, entry, exclude)` keeps them out of game.
  - `extrasGraph(...)` plus `voiceFiles(dist, ext)` (walks `assets/voice`) form a new route `extras`.
  - New `BUDGET.extrasMax = 1 * MB` gzip.
  - `firstLoadMax` (10 MB) is checked against menu + game + extras (first session).
  - Tests in `check-bundle.test.ts` with a fake manifest.
  - `docs/performance.md` updated.

---

## 7. O grze, profile and look, lobby level details

**O grze** (`about/AboutDialog.tsx`, lazy):
- Sections:
  - **Autorzy:** 'Kamil Wida', from `LICENSE`.
  - **Licencja:** 'Wszelkie prawa zastrzeżone. © 2026 Kamil Wida.' plus a one-line summary.
  - **Dźwięki, czcionki i grafika:** `apps/client/public/assets/CREDITS.md?raw`.
  - **Biblioteki:** a static `about/libraries.ts` `[{name, licence}]`. A test asserts every `dependencies` key of `apps/client/package.json` is listed.
  - **Prywatność:** `docs/privacy.pl.md?raw`. The ads cluster rewrites that file; this dialog only renders it.
  - **Wersja:** `__APP_VERSION__` from `vite.config.ts` `define`: `${pkg.version}+${git rev-parse --short HEAD || 'dev'}`, followed by `· protokół ${PROTOCOL_VERSION}`.
- Rendering uses pure `about/markdown-lite.ts` (headings, paragraphs, `-` lists, `|` tables, `**bold**`, `` `code` ``, links) into an AST. React renders it with no `dangerouslySetInnerHTML`. External links get `rel="noopener noreferrer" target="_blank"`.
- Reachable from:
  - a MainMenu footer row of ghost buttons: 'Profil' · 'O grze' · 'Prywatność' (opens O grze at the privacy section);
  - Settings.
- A slot is reserved for the ads cluster's 'Zgody reklamowe' button in the privacy section.

**Profile** (`profile/ProfileDialog.tsx` + `store/profile.ts` + pure `store/profile-model.ts`):
- Stored under `redakcja.profile.v1`, zod with `.catch` defaults:
```ts
const profileSchema = z.object({ levels: int0, wins: int0, verdicts: int0, correct: int0, weakProof: int0, wrong: int0, stamps: int0, minigameFails: int0, roleLevels: z.record(roleSchema, int0).catch({}), color: z.number().int().min(0).max(PLAYER_COLOR_COUNT-1).nullable().catch(null), accessory: accessorySchema.catch('none') });
export function withEvent(s, e: GameplayEvent, me: string): ProfileStats;   // verdictResult(playerId===me) → verdicts/correct/weakProof/wrong; stampApplied(me) → stamps; minigameFailed(me) → fails
export function withLevelEnd(s, end: LevelEndMessage, role: Role|null): ProfileStats; // levels++, wins += end.won
export function accuracy(s): number|null; export function favouriteRole(s): Role|null; // ties → ROLES order
```
- Fed by an `onGameEvent` subscription (`net/game-events.ts`) and the `levelEnd` branch of `session.ts:119-122`, which already records progress there. Spectators are skipped.
- Logic moves to the shared accumulator once cluster E lands it.
- Dialog contents:
  - Preview: `PlayerMark` in the chosen colour + accessory glyph.
  - Colour radio group: 4 swatches with PlayerMark shapes; swatches taken in the current room are disabled ('Zajęty w pokoju').
  - Accessory radios: Bez dodatku / Szalik / Muszka / Legitymacja prasowa.
  - Stats grid: Rozegrane wydania, Wygrane, Trafne werdykty %, Ulubiona rola (RoleIcon), Zebrane pieczątki, Nieudane zadania.
  - Stars per difficulty, read from A's per-difficulty progress.
  - Note: 'Zapisane tylko w tej przeglądarce.'
  - 'Wyczyść statystyki' with a confirm step.
- `privacy.pl.md` must mention the local profile (coordinate with the ads cluster's rewrite).

**Look wiring** (F19, protocol owned by D/E):
- The design doc already promises colour choice in the lobby ('wybór roli i koloru postaci', design-document.pl.md Ekrany table).
- Server:
  - `freeColorIndex(room, preferred)` returns `preferred` if unused in the team, else the lowest free (registry.ts:204, 230).
  - `setLook` in the lobby only: a colour already taken keeps the current colour and the accessory still applies; ignored during briefing and playing, like `setRole`.
  - `colorIndex` still picks the spawn (`spawnPoint(room.map, colorIndex)`, registry.ts:246, 542), which is harmless.
- `rig.ts`: `cosmeticParts(accessory)` on the torso/neck only, so it never collides with role accessories (`rig.ts:145-215`: cap/glasses/pencil on the head, camera strap/notebook on the torso/arm). About 100 triangles each; the perf budget is unaffected.
- The lobby `PlayerCard` shows the accessory glyph.
- Server tests:
  - preferred free → assigned;
  - taken → lowest free;
  - `setLook` while playing → ignored;
  - `lobbyPlayer.accessory` is round-tripped through zod.

**Lobby level details** (`screens/lobby/LevelCard.tsx`, guest view 56-71; the host sees the same panel for the selected level):
- A 'Szczegóły' disclosure containing:
  - Stations: icon + name chips, tappable → HowToPlay stations tab.
  - Events: `EVENT_ICON` + `pl.events.banner[kind].title`.
  - Stars: `★ za wynik ponad 0 · ★★ od ${two}% · ★★★ od ${three}% najlepszego wyniku`, rendered with RatingStar icons (no emoji). Shares come from A's constant.
  - Difficulty chip from D/A.
  - Best stars from this browser for that difficulty.
- At 640x360 the disclosure opens as a scrollable panel inside the card.

---

## 8. Ability chip (layout reservation for cluster B)
- `Hud.tsx` gets `<div data-hud-slot="ability" className={styles.abilitySlot}>`:
  - keyboard/gamepad: bottom-left, `left: var(--hud-left); bottom: max(var(--space-4), env(safe-area-inset-bottom))`, `--hud-ability-w: 15rem`, `--hud-ability-h: 3.5rem`; compact 3.5rem square below 900 px width;
  - touch: hidden.
- On touch, the ability is the 4th button in the **empty grid cell** of `TouchControls.module.css:58-62` (`". ping"` → `"ability ping"`; mirrored `"ping ability"`). Its cooldown ring is drawn on the button, so the cluster height does not change and the guidance dock padding (`Guidance.module.css:18-24`) stays valid.
- The guidance dock (bottom-centre) clears a 15rem chip from 1280 px up.
- Captions (top-left under the band) never meet it.
- B amends design-rules §1.3 for the chip. The F05 amendment lands first, then B appends.

## 9. Cues, captions and game-feel rows

| Cue | Trigger | Layers | Caption |
| --- | --- | --- | --- |
| `folder.beltFull` | `conveyorFull` rising edge | ghost card turns orange + conveyor ring orange; sound `hmm` ui 0.6; haptic tick | `{conveyor, 'Taśma pełna', warn}` |
| `debrief.row` | each totals row reveal | row count-up; `tick` ui 0.5; haptic tick | skip('visual-elsewhere') |

Opening the menu, help, intro and profile uses the existing `ui.click`/`ui.back`. Intro voice lines are not cues; they are subtitled by design (game-feel principle 6). Each cue is added to `fx/cues.ts`, `a11y/captions.ts` (an exhaustive `Record<CueId>`) and the `agents/game-feel.md` catalogue in the same commit.

## 10. Remaining strings (pl.ts; all through `typeset()`)
- `gameMenu`: `{open:'Menu', title:'Menu', live:'Gra trwa dalej', resume:'Wróć do gry', settings:'Ustawienia', stationHelp:'Pomoc: stanowiska', fullscreen:'Pełny ekran', exitFullscreen:'Zamknij pełny ekran', leave:'Wyjdź z redakcji', leaveConfirm:'Na pewno? Wyjdź', room:(c)=>\`Pokój ${c}\`, copy:'Skopiuj kod', offline:'Brak połączenia'}`.
- `hud.next`: `{label:'Następna teczka', in:(s)=>\`${s} s\`, full:'Taśma pełna', emptyIn:(s)=>\`Nowa teczka za ${s} s\`, none:'To już wszystkie teczki', sign:(s)=>\`za ${s} s\`, signFull:'Pełna'}`.
- `guidance.hint.waitIn` and `conveyorFull` (§3).
- `results`: lede, starRule, toNext, allStars, starsNeedWin, thresholdsWhy, thresholdsWhyOpen, totals, summaryPage 'Podsumowanie', difficulty, versus.
- `debrief`: `proofTitle:'Dowód, który rozstrzygał'`, `proofCited:'wskazany'`, `proofCollected:'w teczce'`, `proofMissing:'nie sprawdzono'`, `credibilityDelta`.
- `howTo`: `{open:'Jak grać?', title:'Jak grać', tabs:{intro:'Wprowadzenie', stations:'Stanowiska', controls:'Sterowanie'}, practice:'Wypróbuj', again:'Jeszcze raz', back:'Wróć', practiceInGame:'Ćwiczenia po wydaniu', practiceDone:'Udało się!', practiceFailed:'Nie tym razem', close:'Gotowe'}`.
- `intro`: `{label:'Wprowadzenie', skip:'Pomiń', next:'Dalej', prev:'Wstecz', pause:'Pauza', resume:'Wznów', finish:'Do roboty!', soundLocked:'Stuknij, by włączyć głos', scene:(n,t)=>\`Scena ${n} z ${t}\`, voice:{…§6f}}`.
- `about` and `profile` (§7).
- `settings`: `voice:'Lektor'`, `introAgain:'Obejrzyj wprowadzenie'`, `stationHelpAgain:'Pokaż pomoc stanowisk od nowa'`, `stationHelpQueued:'Pomoc pokaże się znowu'`.
- `lobbyRoles.details`: `{open:'Szczegóły', stations:'Stanowiska', events:'Zdarzenia', stars:'Gwiazdki'}`.
- Add a `strings/plural.ts` helper `pluralPl(n, one, few, many)` (tested). It replaces the three inline copies (pl.ts:279-280, 888-893, 908-913) and is used by the new copy.

## 11. Tests (summary)
**Unit tests (bun):**
- desk-result-model
- outcome (sim-mirror consistency for all truth × priority × verdict; every title ≤ 8 words; no 'Zabrakło' in the `outcome`/`desk`/`debrief` namespaces)
- results-model (literals in §2)
- queue-model
- `conveyorIndicator` (in scene tests)
- next-step `waitIn`
- hud-band
- camera-framing (all layouts, 640/863 × 360)
- overlay-logic `minigameElapsed` (pause sums: start 0, pause at 3000, resume at 8000, now 10000 → elapsed 5000)
- station-help (every StationKind present; 2-3 steps per device; ≤ 8 words; touch hints non-empty for registered minigames)
- practice-story
- intro-model (literals in §6e)
- voice-sync
- duck (voice depth 0.3 wins over 0.45)
- busVolume voice
- settings `voiceVolume` default 0.9 and invalid → 0.9
- check-bundle extras
- markdown-lite
- about libraries
- profile-model (two verdicts correct + one wrong → accuracy 67; favourite role tie → ROLES order)
- plural
- captions.test (auto-covers the new cues)

**Server tests:** look (F19).

**E2E:**
- `phone-layout.spec.ts` (mobile + phone-small, §4c).
- `intro.spec.ts` (desktop):
  - new room → `intro-player` visible with subtitles;
  - 'Pomiń' closes it;
  - a second room → no autoplay;
  - 'Jak grać?' from the main menu reopens it.
  - Audio is not required (fallback timing).
- `multiplayer.spec.ts` lobby leave is unchanged. In-game leave now goes through the menu; add a desktop test: Esc → 'Wyjdź z redakcji' twice → front page.

## 12. Docs updated in the same commits
- `agents/design-rules.md` §1.3 and §5: ghost card; one menu button top-right; ability slot (B).
- `agents/glossary.md`: Wprowadzenie `intro`, Jak grać `howToPlay`, Pomoc stanowiska `stationHelp`, Wypróbuj `practice`, Menu gry `gameMenu`, O grze `about`, Profil `profile`, Dodatek `accessory`, Kolor gracza `playerColor`, Następna teczka `nextFolder`, Taśma pełna `conveyorFull`, Powód wyniku `reason`, Progi gwiazdek `starThresholds`, Lektor `voice` bus, Napisy lektora `subtitles`. Also fix the heading 'StationId' → `StationKind`.
- `agents/game-feel.md`: rows from §9.
- `agents/platforms.md` input table: Menu (Esc / Start / button), Station help (H / Select / '?'), ability placeholder (B).
- `docs/accessibility.md:20-22`: caption stack under the HUD band; intro subtitles.
- `docs/audio.md`: voice bus, the voice exception, budget.
- `docs/performance.md`: extras route.
- `apps/client/public/assets/CREDITS.md`.
- `docs/design-document.pl.md` (Polish):
  - Ekrany table: Wprowadzenie, Jak grać, O grze, Profil; Kolegium per folder with 'za co punkty'.
  - Pętla step 5: wording for after errors.
- `docs/implementation-plan.md`: Stage 7 F tasks and Decision-log rows (outcome vocabulary; per-folder Kolegium; HUD rule amendment; single menu button with no pause; phone pill + camera view offset superseding 2026-10-09; intro 2D in-engine + TTS exception and the ads condition; client-only pause for station help; local profile + colour preference).
- `docs/contest` screenshots regenerated.

## 13. Critical files
- `apps/client/src/hud/ResultsPlate.tsx` (+ `debrief/results-model.ts`, `debrief/DebriefCard.tsx`)
- `apps/client/src/stations/DeskOverlay.tsx` (+ `stations/desk-result-model.ts`, `strings/pl.ts`)
- `apps/client/src/scene/CameraRig.tsx` (+ `scene/camera-framing.ts`, `hud/Hud.module.css`, `screens/GameScreen.tsx`)
- `apps/client/src/stations/StationOverlay.tsx` (+ `OverlayFrame.tsx`, `stations/StationHelpCard.tsx`)
- `tools/perf/check-bundle.ts` (+ `tools/audio/synth_voice.py`, `apps/client/src/intro/*`)

## Contract changes

- CONSUMED (owner A): entities.ts folderOutcomeSchema += 'unfinished'; folderResultSchema += reason (folderReasonSchema: correctNormal|correctImportant|correctWithContext|correctionFiled|weakProof|publishedFake|rejectedTrue|contextOnTrue|publishedWithoutContext|rejectedContextStory|expired|expiredUnpenalized|unfinished), breakdown {base,speed,proofs,bossCall} (sum === scoreDelta), citedStampIds (max 3), requiredStamps (1..3), playerId|null
- CONSUMED (owner A): protocol.ts verdictResult event += reason, breakdown, citedStampIds (replaces justifyingStampId), requiredStamps
- CONSUMED (owner A/D): protocol.ts levelEndMessageSchema += starThresholds {two,three}|null, maxScore|null, lossReason 'credibility'|'score'|null, difficulty; versus: teams[{id,score,credibility,won,results}], winner teamId|'draw' (owner D)
- CONSUMED (owner A): protocol.ts snapshotMessageSchema += nextFolder {atMs, sinceMs}|null (scheduled spawns only, events excluded), conveyorFull boolean
- CONSUMED (owner A): constants.ts STAR_SHARES {two,three} and a pure minigameTimeLimitMs(difficulty) replacing direct MINIGAME_TIME_LIMIT_MS use in the client
- PROPOSED by F, owned by D/E (protocol/rooms): domain.ts accessorySchema = z.enum(['none','scarf','bowTie','pressBadge']); joinMessageSchema += look {color: int 0..PLAYER_COLOR_COUNT-1 | null, accessory} optional; lobbyActionSchema += {kind:'setLook', look}; lobbyPlayerSchema += accessory; server freeColorIndex(room, preferred) honours the preference when free (registry.ts:204,230); needs PROTOCOL_VERSION bump (recommend one coordinated bump 2→3 for all Stage 7 wire changes)
- PROPOSED shared with cluster E: packages/shared/src/player-stats.ts pure accumulatePlayerStats(stats, event, playerId) used by server spectator stats and client profile
- Client: fx/cues.ts AudioBus += 'voice'; mix.ts BUS_TRIM.voice = 1; audio-manager busVolume maps voice → settings.voiceVolume; duck.ts request(nowMs, durationMs, depth?) + DUCK_TUNING.voiceDepth = 0.3
- Client persisted schemas: store/settings.ts += voiceVolume unit.catch(0.9); new localStorage keys redakcja.stationHelp.v1, redakcja.intro.seen.v1, redakcja.profile.v1 (zod-validated, .catch defaults)
- Client cues: new CueIds 'folder.beltFull' (caption 'Taśma pełna', warn) and 'debrief.row' (skip visual-elsewhere) + agents/game-feel.md rows; new icons 'menu' (and optional 'info') in ui/icons/Icon.tsx
- Client strings (pl.ts): new namespaces outcome, gameMenu, hud.next, stationHelp (satisfies Record<StationKind, StationHelp>), howTo, intro (incl. voice script), about, profile, results.{lede,starRule,toNext,totals,thresholdsWhy,versus,summaryPage}, debrief.proof*, settings.{voice,introAgain,stationHelpAgain}, lobbyRoles.details; REMOVED desk.missed, desk.outcomes, results.outcomes, hud.toast titles, debrief.missed; filled minigames.*.keys.touch; new strings/plural.ts helper
- Client scene: scene/entities.ts StationIndicator += {kind:'incoming';fraction;seconds} | {kind:'full'} and conveyorIndicator(); scene/camera-framing.ts computeFraming/placeCamera with setViewOffset in follow mode
- Content-like asset: apps/client/src/intro/voice-sprite.json validated by zod voiceSpriteSchema {voice, source:'tts'|'recording', clips:{[id]:{startMs,durationMs,textSha1}}}; audio files public/assets/voice/intro.{webm,mp3}
- Tooling: tools/perf/check-bundle.ts new 'extras' route (EXTRAS_SOURCES src/intro|howto|about|profile + assets/voice), BUDGET.extrasMax = 1 MB gzip, firstLoadMax checked against menu+game+extras; tools/audio/synth_voice.py + tools/audio/intro-lines.ts; measure.py voice window (-24,-16)
- Build: vite.config.ts define __APP_VERSION__ (package version + git short sha); playwright.config.ts new project 'phone-small' (Pixel 7 landscape at 640x360, testMatch phone-layout.spec.ts)
- Rules/docs: agents/design-rules.md §1.3 and §5 amended (ghost next-folder card, single menu button; cluster B appends ability chip); glossary, game-feel, platforms, accessibility, audio, performance, CREDITS.md (voice row + fix stale font rows), design-document.pl.md Ekrany, implementation-plan Stage 7 + Decision log

## Cluster tasks (superseded by `tasks.md`)

- **S7-F01 — Desk result fix + unified outcome vocabulary (client, sim-mirror reason)** (M; depends on —). stations/desk-result-model.ts (deskResultLines), hud/outcome.ts (reasonOf mirror + consistency test vs sim desk.ts:34-61/expiryIsPenalized), DeskOverlay ResultView (replace 'Zabrakło' block 481-536, bonus chips), StationLayer VERDICT_RESULT_SHOW_MS {good:4000,bad:6500}, hud-model verdictToast/expiredToast titles by reason, DebriefCard head title + 'Dowód, który rozstrzygał' section only on errors, pl.outcome/pl.desk.result, remove old outcome keys; Ekspert flag hides deciding-station lines (reads difficulty when A lands, false until then) *Done when:* No 'Zabrakło' string remains; a correct verdict shows only 'Dowód:' chips; wrong shows 'Właściwy werdykt' + proofInFolder/notChecked; wrongJustification shows weakProof/tooFewProofs + 'Rozstrzyga'; toast/desk/Kolegium use the same titles; desk-result-model and outcome tests (literal stories, all truth×priority×verdict) pass; bun run check green
- **S7-F02 — results-model.ts (totals, star progress, loss reason, per-folder/per-story cards, reveal plan)** (M; depends on cluster-A: FolderResult reason/breakdown/unfinished, cluster-A: levelEnd starThresholds/maxScore/lossReason). apps/client/src/debrief/results-model.ts replacing debriefCards (debrief-model.ts:48-83) with kolegiumCards(mode folder|story), resultTotals, starProgress, lossReasonOf, revealPlan; update debrief-model.test.ts; update hud/dev-fixture.ts levelEnd fixture *Done when:* Unit tests with the literal cases from the design (totals 15, starProgress 305→missing 15 shares 51/80, revealPlan times) pass; invariant Σ rows === Σ scoreDelta tested
- **S7-F03a — ResultsPlate summary: loss lede, star captions + 'brakuje X pkt', thresholds explainer, totals table, phone page 0, reveal steps** (M; depends on S7-F02). ResultsSummary component (desktop column + phone 'Podsumowanie' page via Kolegium lead prop), ribbon lede by lossReason, difficulty chip, useRolledNumber count-up rows, useReveal with revealPlan, cue debrief.row (+captions skip, game-feel row), ResultsPlate.module.css phone rules *Done when:* Desktop 1366x768 and 640x360 screenshots show star captions, progress line and totals; reduced motion shows all instantly; any key finishes the reveal; e2e phone-layout results check passes
- **S7-F03b — Kolegium per folder: reason line, credibility chip, proof section, unfinished folders, endless grouping** (M; depends on S7-F02, S7-F01). DebriefCard.tsx head (title by reason, points + credibility chips, why line with bonus suffixes), proof rows with wskazany/w teczce/nie sprawdzono, '×N' for endless groups, unfinished cards last; switch F01 reasonOf mirror to wire reason and delete the mirror *Done when:* Card points sum to levelEnd.score in campaign; endless shows grouped cards; unfinished folders visible; outcome mirror removed; tests green
- **S7-F04 — Versus and spectator results variant (two teams)** (M; depends on S7-F03a, S7-F03b, cluster-D: versus levelEnd teams/winner, cluster-E: spectator flag). TeamScoreCard x2 with crown, own-team totals (spectator Segmented team switch), Kolegium per folder with 'Wy'/'Rywale' verdict chips aligned by folder id, versus ribbon copy, credibility-0 loss line *Done when:* Fixture-driven screenshots for win/lose/draw/spectator at 1366x768 and 640x360; results-model tests for team totals pass
- **S7-F05 — Next-folder timer: ghost card, 'Taśma pełna', conveyor sign ring, guidance hint, HUD rule amendment** (M; depends on cluster-A: snapshot nextFolder/conveyorFull). game-store fields, hud/queue-model.ts queueView + useQueueCapacity, FolderQueue ghost card (+ phone sideways CSS), empty-state text, scene/entities.ts conveyorIndicator + 'incoming'/'full' kinds, StationIndicators conveyor routing and name pill seconds, next-step waitIn/conveyorFull hints, cue folder.beltFull + caption + game-feel row, design-rules §1.3/§5 amendment, glossary rows *Done when:* queue-model, conveyorIndicator and guidance tests pass; ghost card visible on desktop and Pixel 7 with a free slot; belt-full turns ghost/ring orange; design-rules amended in the same commit
- **S7-F06 — In-game menu button + menu sheet replacing tool buttons and RoomChip** (M; depends on —). hud/GameMenuButton.tsx (new 'menu' icon, offline dot, data-hud-band), hud/GameMenu.tsx dialog (resume primary, settings, station help, fullscreen, room code/copy/ping, leave with confirm), input/menu-button.ts (Esc when not captured and tutorial inactive, PAD.start=9 rising edge), GameScreen.tsx tools removed, --hud-tools-w one button, design-rules §5, platforms.md input row, e2e desktop leave-via-menu test *Done when:* Esc/Start/tap open and close the sheet; movement is frozen while open; game keeps running; leave needs two presses; all controls reachable by pad focus; e2e passes on desktop and mobile
- **S7-F07 — Phone one-row HUD pill + HUD band store + dependent offsets** (M; depends on S7-F06). Hud.module.css phone block (row pill 19.5rem / endless 22.5rem, inline tempo chip, credibility strip), hud/hud-band.ts (bandBottom pure + useHudBand + useHudBandMeasure), GameScreen --hud-band var, CaptionStack/EventBanners/VerdictToasts offsets from --hud-band, accessibility.md update *Done when:* At 640x360 pill height <= 60 px and band <= 72 px; HUD numbers stay 30 px; captions start below the band; hud-band unit test passes; left-handed layout unchanged
- **S7-F08 — HUD-aware follow camera + framing tests + 640x360 Playwright project** (M; depends on S7-F07). scene/camera-framing.ts computeFraming/placeCamera (setViewOffset −inset/2, back clamp on usable depth, clearViewOffset in fit), CameraRig.tsx uses it, camera-framing.test.ts over all LEVELS + ENDLESS_LAYOUT at 640x360 and 863x360, playwright project phone-small, e2e/phone-layout.spec.ts, regenerate docs/contest/screenshots/pixel7, Decision log row superseding 2026-10-09 *Done when:* Framing test proves every conveyor tile and back-row sign projects below the 64 px band with the player at the belt; inset 0 equals old framing; e2e phone-layout green on mobile and phone-small; screenshots regenerated
- **S7-F09a — Station help copy (6 existing stations), touch KeyHints, ControlsArt extraction, StationHelpCard** (M; depends on —). pl.stationHelp (purpose, proves, steps per device, realWorld), fill minigames.*.keys.touch, guidance/ControlsArt.tsx (Key/PadButton/TouchButton/Control/Illustration moved from Tutorial.tsx), stations/StationHelpCard.tsx with animated control drawing and reduced-motion variant, strings/plural.ts helper *Done when:* station-help test (all kinds, 2–3 steps per device, <=8 words, touch hints non-empty for registered minigames) passes; Tutorial still renders identically; styleguide shows the card
- **S7-F09c — Station help copy for the 4 new stations** (S; depends on S7-F09a, cluster-C: new StationKind ids and minigame designs). pl.stationHelp entries and touch KeyHints for map/transcript/otherMedia/metadata (final ids from C), glossary rows *Done when:* Compiler-enforced Record<StationKind> complete; station-help test green with 10 kinds
- **S7-F10 — First-use station help with paused client timer + '?' in overlay header** (M; depends on S7-F09a). stations/station-help-store.ts (redakcja.stationHelp.v1), overlay-logic minigameElapsed + useMinigameClock (StationOverlay, MinigameBench), StationOverlay shows the card on first use and swallows nav intents, OverlayFrame help prop with '?' button and H / Select shortcuts, Settings 'Pokaż pomoc stanowisk od nowa'; reads difficulty minigame limit from A when available *Done when:* First open of each station shows the card and the 20 s bar does not move while it is open; '?' reopens it; H and Select work; overlay-logic pause test (start 0, pause 3000–8000, now 10000 → 5000) passes
- **S7-F11a — 'Jak grać' dialog shell + bundle 'extras' category + menu/lobby entry points** (M; depends on —). howto/store.ts, lazy howto/HowToPlayDialog.tsx (<dialog>, Segmented tabs, controls tab reusing ControlsTab), MainMenu corner 'Jak grać?' + footer row slot, Lobby top action, tools/perf/check-bundle.ts EXTRAS_SOURCES/extrasGraph/voiceFiles/extrasMax + tests, docs/performance.md *Done when:* Dialog opens from menu and lobby with keyboard/pad/touch navigation; check-bundle reports menu/game/extras separately and its tests pass; perf:budget green
- **S7-F11b — Stanowiska tab + practice round ('Wypróbuj') + tappable briefing chips** (M; depends on S7-F11a, S7-F10). station tiles grid, StationHelpCard + 'Wypróbuj', howto/PracticeRound.tsx (practiceStory pure, useMinigameClock, outcome banner, no net/session import), Briefing 'Nowe dziś' chips open the tab (dialog closes on screen change), in-game access with practice disabled *Done when:* Practice plays every registered minigame without sending commands (import test); practice-story test passes; briefing chips open the help; works at 640x360
- **S7-F12 — Voice bus, voice loader, voice volume setting, deeper ducking** (S; depends on —). AudioBus 'voice', busVolume/BUS_TRIM, settings voiceVolume (.catch 0.9) + SoundTab 'Lektor' slider, fx/audio/voice.ts (loadVoice/playVoice/stopVoice/applyVoiceVolume), duck.ts depth param + voiceDepth 0.3, docs/audio.md voice bus section *Done when:* Unit tests for busVolume voice, settings default, duck depth pass; playVoice is a no-op when muted or not loaded
- **S7-F13 — Intro script, timeline model and line export** (M; depends on —). intro/intro-script.ts (11 scenes, 17 clips, device variants), pl.intro (UI + voice script from the design), intro/intro-model.ts (fallbackMs, sceneDurationMs, introReducer, subtitleChunks, shouldAutoplayIntro), intro/intro-store seen flag, tools/audio/intro-lines.ts (stdout JSON, ttsText + PRONOUNCE) *Done when:* intro-model tests with literal values pass; bun tools/audio/intro-lines.ts prints 17 clips; script read through for <=2 subtitle lines per chunk at 640x360
- **S7-F14 — Offline TTS voice generation (Piper) + assets + sync test + licence notes** (M; depends on S7-F13). tools/audio/synth_voice.py (piper-tts 1.8.0, pl_PL-darkman-medium pinned SHA-256, --model, --voice, --recordings), generated public/assets/voice/intro.{webm,mp3} + src/intro/voice-sprite.json (zod), intro/voice-sync.test.ts, measure.py voice window, CREDITS.md voice row + font rows fixed, docs/audio.md exception, Decision log row (TTS exception, lessac caveat, replace before ads ON). Must run where huggingface.co is reachable (blocked by egress policy in this environment) *Done when:* Both files <= 700 KB, measure.py passes, voice-sync test green, CREDITS and Decision log updated
- **S7-F15 — IntroPlayer UI: stage, subtitles, controls, scenes 1–6** (M; depends on S7-F11a, S7-F12, S7-F13). intro/IntroPlayer.tsx + Intro.module.css: stage, SubtitleBar (always on), progress dots, Wstecz/Pauza/Dalej/Pomiń, keyboard/pad/touch input, fallback timing when voice missing or locked, music ducking per clip, scenes welcome/folders/pickup/work/stations/desk using ControlsArt, FolderCard, Icon, VerdictStamp; reduced-motion and no-flash variants *Done when:* Player runs silently on fallback timing and with voice when present; subtitles in sync; works at 1366x768 and 640x360; reduced motion uses fades only
- **S7-F16 — IntroPlayer scenes 7–11, lobby autoplay, replay entries, e2e** (M; depends on S7-F15, cluster-B: ability names and keys). scenes proof/credibility/roles/team/end, Lobby autoplay effect (shouldAutoplayIntro + early loadVoice), Settings 'Obejrzyj wprowadzenie', seen flag on finish or skip, e2e/intro.spec.ts *Done when:* New room on training autoplays once per browser; skip and finish set the flag; replay from menu and settings works; e2e intro spec green
- **S7-F17 — 'O grze' dialog (authors, licence, credits, libraries, privacy, version)** (M; depends on S7-F11a). about/AboutDialog.tsx (lazy), about/markdown-lite.ts + tests, ?raw imports of CREDITS.md and docs/privacy.pl.md, about/libraries.ts + test against apps/client/package.json, vite define __APP_VERSION__, MainMenu footer 'O grze' / 'Prywatność', slot for the ads consent button *Done when:* Dialog renders privacy and credits with headings, lists and tables, no raw HTML injection; version shows package+sha+protocol; tests green; keyboard/pad/touch navigable at 640x360
- **S7-F18 — Player profile: local stats, tracking, profile dialog** (M; depends on S7-F11a). store/profile-model.ts (withEvent, withLevelEnd, accuracy, favouriteRole) + tests, store/profile.ts (redakcja.profile.v1), tracking via onGameEvent + session levelEnd (skip spectators), profile/ProfileDialog.tsx (preview, colour swatches, accessory radios, stats grid, reset with confirm), MainMenu footer 'Profil'; later switch to the shared accumulator from cluster E *Done when:* profile-model literal tests (2 correct + 1 wrong → 67%, role tie → ROLES order) pass; stats update after a real match; dialog navigable on all devices
- **S7-F19 — Look wiring: preferred colour + accessory over the wire, 3D cosmetic parts** (M; depends on S7-F18, cluster-D: coordinated PROTOCOL_VERSION bump). accessorySchema, join look, lobby setLook, lobbyPlayer.accessory, server freeColorIndex(room, preferred) + setLook handler (lobby only), server tests, rig.ts cosmeticParts on torso/neck, PlayerCard accessory glyph, taken swatches disabled in the profile while in a room *Done when:* Server tests (preferred free → assigned, taken → lowest free, ignored while playing) pass; accessory visible in lobby and in 3D; protocol tests updated
- **S7-F20 — Lobby level details for guests and host** (S; depends on S7-F09a, cluster-A: STAR_SHARES + difficulty). LevelCard 'Szczegóły' disclosure: station chips (tap → help), events with EVENT_ICON + banner titles, star rule with shares (RatingStar icons), difficulty chip, best stars per difficulty *Done when:* Guests see stations, events and the star rule for the selected level; works at 640x360 and with pad focus
- **S7-F21 — Ability HUD slot reservation (coordination with cluster B)** (S; depends on S7-F07). Hud.tsx data-hud-slot='ability' bottom-left for keyboard/gamepad (hidden on touch), CSS vars --hud-ability-w/h, compact below 900 px, TouchControls grid note ('. ping' → 'ability ping') documented for B, platforms.md placeholder row *Done when:* Empty slot exists without overlapping the guidance dock at 1280x720; B can mount its chip without layout changes
- **S7-F22 — Cluster F docs and consistency pass** (S; depends on S7-F01, S7-F03b, S7-F05, S7-F08, S7-F11b, S7-F16, S7-F17, S7-F19). glossary, design-document.pl.md (Ekrany, Pętla step 5), implementation-plan Stage 7 F rows + Decision log, game-feel catalogue, accessibility.md, contest screenshots/README captions regenerated (bun run contest:build -- --screenshots) *Done when:* All Stage 7 F rows marked done with Refs; docs match the shipped UI; bun run check green

## Risks

- TTS licensing: the Polish Piper medium voices (darkman, gosia, mc_speech) were trained on CC0 data but fine-tuned from en_US-lessac, whose Blizzard 2013 dataset licence is commonly described as research/non-commercial (the licence page was unreachable from here, 403). If AdSense is enabled (cluster ads makes the site commercial), the clips must first be replaced with a human recording or a voice trained from scratch. The --recordings mode makes the swap one command, and the Decision log must record this condition.
- Environment: huggingface.co (and its CDN hosts) is denied by the egress policy here (CONNECT 403). PyPI works (piper-tts 1.8.0 available), so voice generation cannot run in this sandbox unless huggingface.co is added to Allowed domains in the environment network settings. Otherwise it runs on a developer machine.
- TTS pronunciation of proper names (Nowobrzeskiego, Kartoteka) may be off. Mitigation: a PRONOUNCE respelling map applied only to TTS input. Subtitles keep the correct spelling, and the sha1 sync test keeps audio and subtitles aligned.
- Shared contracts: F depends on cluster A wire fields (reason/breakdown/unfinished, levelEnd thresholds/lossReason, snapshot nextFolder/conveyorFull) and D (versus levelEnd, protocol bump). Several clusters bumping PROTOCOL_VERSION separately forces repeated classroom reloads, so one coordinated v3 bump is recommended.
- At 640 px width the one-row pill (about 312 px) leaves room for only 2 queue cards plus '+N' (3 at Pixel 7 863 px). This is still within design-rules §1.3 (up to 3, nothing silently hidden), but a reviewer may read it as a regression.
- setViewOffset in follow mode: r3f resizes and updates the projection matrix. The rig must re-apply the offset whenever size or inset changes and clear it in fit mode, or desktop framing breaks. Covered by the inset-0 regression test.
- Removing the three tool buttons and the RoomChip changes muscle memory and contest screenshots. Esc ordering against the tutorial skip must be exact, or one keypress both skips the tutorial and opens the menu.
- Per-folder Kolegium raises card count (about 15-20 per level). Endless is grouped per story to bound DOM size (up to 512 results).
- Practice mode must never send minigameResult. It is guarded by not importing net/session (import test plus review).
- Station help pauses only the client 20 s timer. Server folder deadlines keep running; the card says so ('Termin teczki biegnie dalej'), but players may still feel cheated on short deadlines.
- Bundle: new lazy dialogs would be counted as 'game' by check-bundle.ts lazyGraph today (line 230). The extras category must land before or with the first lazy dialog, or perf:budget mis-attributes or fails.
- Lobby autoplay of a roughly 78 s intro for every new training room (DEFAULT_LEVEL_ID is l0-greybox) can delay the start. It runs once per browser and can be skipped with Esc, B or 'Pomiń', and guests are already gated by Gotowy.
- pl.ts grows by about 400 lines. The ≤8-words rule for in-play copy is enforced only by targeted unit tests on the new namespaces.

## Open points (defaults chosen)

- Narrator voice: default pl_PL-darkman-medium (male, 'Naczelny' persona); gosia (female) is a one-flag swap. Listen to both samples before generating.
- Intro rendering: 2D in-engine (DOM/SVG with the game's own UI kit and CSS keyframes) rather than a three.js diorama, so the 1.6 MB game chunk stays out of the lobby. A 3D diorama could be a later iteration.
- Ekspert difficulty: the desk hides the 'Rozstrzyga'/'Dowód był w teczce'/'Nie sprawdzono' chips but keeps the correct verdict, and station help stays available (it explains controls, not answers).
- Unfinished folders (still in play at time-out) are shown as 'Nie zdążyliście' with whatever penalty cluster A decides (UI assumes 0).
- Kolegium is per folder in campaign and versus, grouped per story with '×N' in endless.
- In-game menu key: Esc on keyboard (the tutorial card keeps priority for Esc), Start on gamepad. Station help: H on keyboard, Select on gamepad, '?' button on touch.
- Accessory set: none / scarf / bowTie / pressBadge (neck and torso only, so no clash with role accessories). Colour preference is honoured when free; otherwise the lowest free colour, with no error.
- 'O grze' lists only Kamil Wida as author, following LICENSE. Other contributors need confirmation.
- The intro autoplays only in the lobby on the training level (plus manual replay from 'Jak grać?' and Settings), not on first visit to the main menu.
- Ability lines in the voiceover (R / RB / 4th button, 'musi się naładować') are placeholders until cluster B fixes names and keys. Regenerating the voice is one command.
- Copy for the 4 new stations (map, transcript, otherMedia, metadata) is provisional until cluster C's minigame designs and final StationKind ids land.
