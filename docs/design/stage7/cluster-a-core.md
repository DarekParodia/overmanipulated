# Cluster A — Core sim & content rules (multi-stamp folders, station bag for campaign + endless, difficulty, next-folder data, stable Kartoteka card, results data, balance harness)

# Cluster A: core sim and content rules (design)

## 0. Verified baseline

I re-read every fact below in the code.

- **Fixed schedules, one justifying stamp.**
  - `spawnFolders` walks `ctx.level.schedule` with `nextSpawnIndex` and waits while the conveyor is full (`packages/shared/src/sim/folders.ts:59-80`).
  - `spawnFolderAt` sets `deadlineMs = elapsedMs + round(deadlineS*1000)` (`folders.ts:91-118`, line 103). It is used by both the schedule and events (`events.ts:189-196`).
- **Verdict.**
  - `evaluateVerdict(story, folder, verdict, justifyingStampId, nowMs)` is at `desk.ts:68-107`.
  - `missedStampIds` is computed for every outcome, including `correct` (`desk.ts:75`). This is the root of the "Zabrakło" bug.
  - `correctReward` is at `desk.ts:34-42`, `wrongPenalty` at `desk.ts:45-61`.
  - `evaluateTagged` (correction / bossCall) is at `desk.ts:114-141`. The result is pushed at `desk.ts:224-255`.
- **Wire.**
  - `verdict` command: `justifyingStampId` (`protocol.ts:110-115`).
  - `verdictResult` event: `protocol.ts:272-284`.
  - `roomState`: `protocol.ts:176-187`.
  - `snapshot`: `protocol.ts:199-213`.
  - `levelEnd`: `protocol.ts:331-341`.
  - `lobbyActionSchema`: `protocol.ts:73-87`.
  - `PROTOCOL_VERSION = 2`: `constants.ts:6`.
- **Entities.**
  - `folderOutcomeSchema`: `entities.ts:75-81`.
  - `folderResultSchema`: `entities.ts:84-93`.
  - `levelOutcomeSchema`: `entities.ts:95-98`.
- **Scoring.**
  - `starsFor` and `levelOutcome`: `scoring.ts:20-41`.
  - Expiry results: `scoring.ts:43-80`. There is no end-of-level sweep.
- **Sim inputs and stations.**
  - `SimContext {dtMs,map,level,stories}`: `frame.ts:8-13`.
  - `workDurationMs`: `stations.ts:51-56`.
  - Lockout: `stations.ts:233-238`.
  - The seed is drawn from the shared RNG on every attempt (`stations.ts:176-178`).
  - `GameState`: `state.ts:38-67`.
- **Content.**
  - `storySchema`: `schema.ts:64-118`, with `stamps.max(6)` at line 76.
  - `levelSchema`: `schema.ts:148-231`.
  - `CONTENT_FITS_SIMULATION`: `schema.ts:265`.
  - `maxStoryScore` / `maxLevelScore`: `checks.ts:54-95`.
  - `checkStoryFitsLevel`: `checks.ts:325-361`.
  - Star-share checks: `checks.ts:418-447`.
  - `storyDrawer` (a bag over stories): `endless.ts:117-140`.
  - `generateEndlessLevel`: `endless.ts:195-231`. Story draws, jitter and events share one RNG.
- **Server.**
  - `setLevel`: `registry.ts:154-163`.
  - `beginBriefing`: `registry.ts:479-486`.
  - `startLevel`: `registry.ts:533-552`. It regenerates endless at line 536-539 and draws the sim seed at line 540.
  - SimContext per tick: `registry.ts:666-671`.
  - `broadcastSnapshot`: `registry.ts:684-706`.
  - `endLevel`: `registry.ts:725-746`.
- **Client.**
  - `DeskOverlay.VerdictView`: single `chosen` stamp (`DeskOverlay.tsx:132-357`).
  - `ResultView` prints `pl.desk.missed` "Zabrakło:" whenever the list is non-empty (`DeskOverlay.tsx:481-536`).
  - `StationOverlay` uses a fixed `MINIGAME_TIME_LIMIT_MS` (`StationOverlay.tsx:84-88, 101-102`).
  - `StationLayer` uses a fixed `MINIGAME_FAIL_LOCKOUT_MS` (`StationLayer.tsx:53,83`). Its verdict fallback folder is `stamps:[event.justifyingStampId]` (line 140).
  - Kartoteka reveals missed flags on failure (`SourceRegistry.tsx:125,183`). `initialState(card)` is at `sourceRegistry.logic.ts:147`.
  - Guidance goes to the desk after one justifying stamp (`guidance/next-step.ts:108-110,175`).
- **Balance.**
  - `runGame` builds its own SimContext (`tools/balance/game.ts:92`).
  - `levelScenario`: `game.ts:205-213`.
  - The bot treats one justifying stamp as enough (`bot.ts:385`) and cites one stamp (`bot.ts:314, 519-547`).
  - The bot's minigame time limit is fixed (`bot.ts:567`).
- **Star thresholds today.** They are about 55 % and 80 % of the max score:
  - l1 375 → 205/320 (three at 85 %)
  - l2 375 → 206/300
  - l3 440 → 240/350
  - l4 395 → 215/315
  - l5 435 → 240/350
  - l6 450 → 250/360
  - l0 240 → 120/190

  The rule proposed in §2.6 reproduces these exactly.

## 1. Multi-stamp folders (decision 1)

### 1.1 Content

`storySchema` (`schema.ts:64-83`) gains:

```ts
/** Distinct justifying stamps the desk must cite (decision 1). 1 = classic folder. */
requiredStamps: z.number().int().min(1).max(MAX_REQUIRED_STAMPS).default(1),
```

The `superRefine` adds two checks:
- `requiredStamps <= justifyingStamps.length` (error).
- If `requiredStamps > 1`, at least one justifying stamp is non-AI. The AI rule already forces this; keep the explicit message.

`SimStory` (`sim/content.ts:19-29`) gains `requiredStamps?: number`. It is optional so the sim fixtures stay valid. New helper in `content.ts`:

```ts
export function requiredStampsOf(story: Pick<SimStory,'requiredStamps'>): number { return story.requiredStamps ?? 1; }
```

`checks.ts` changes:
- `checkStoryFitsLevel` (`checks.ts:325-361`) adds an error when the justifying stamps whose station is in `level.stations` number fewer than `requiredStamps`. Message: `story "x" needs N proofs but only M justifying stamps come from this level's stations`.
- New warning when `requiredStamps > 1` on a level with number < `MULTI_STAMP_FIRST_LEVEL` (4).
- `isSolvable` in `endless.ts:52-57` applies the same count against the endless stations.
- `maxStoryScore` (`checks.ts:54-62`) becomes `base + SCORE.speedBonus + (requiredStamps-1)*SCORE.multiStampBonus`. It takes `Pick<Story,'priority'|'correctVerdict'|'requiredStamps'>`.

### 1.2 Constants (`constants.ts`)

```ts
export const MAX_REQUIRED_STAMPS = 3;
/** Each required stamp beyond the first adds this to the folder's time (decision 1). */
export const MULTI_STAMP_EXTRA_DEADLINE_MS = 20_000;
/** Content rule: multi-stamp folders appear from this level on (warning only). */
export const MULTI_STAMP_FIRST_LEVEL = 4;
SCORE.multiStampBonus = 10   // per extra required stamp, paid only with a correct verdict
```

### 1.3 Sim

- **Spawn.** `spawnFolderAt` (`folders.ts:91-118`) adds the extra time:
  ```ts
  const extraMs = (requiredStampsOf(frame.ctx.stories[spec.storyId] ?? {}) - 1) * MULTI_STAMP_EXTRA_DEADLINE_MS;
  deadlineMs = state.elapsedMs + Math.round(spec.deadlineS*1000) + extraMs;
  ```
  Schedule folders and event folders both go through this function. The speed bonus is relative (`desk.ts:98-99`), so the extra time is counted automatically.
- **Verdict.** The new signature:
  ```ts
  evaluateVerdict(story, folder, verdict, citedStampIds: readonly string[], nowMs, tuning = NORMAL_TUNING): VerdictEvaluation
  ```
  The rules:
  1. `required = requiredStampsOf(story)`.
  2. `cited = unique(citedStampIds)`.
  3. `valid = cited ∩ story.justifyingStamps ∩ folder.stamps`.
  4. `invalid = cited.length - valid.length`.
  5. `missed = justifyingStamps − folder.stamps`.
  6. Wrong verdict gives `outcome:'wrong'` with a reason from `wrongPenalty` (now returns `{score, credibility, reason}`). Score and credibility are scaled with `scalePenalty(·, tuning.penaltyFactor)`. `missedStampIds = missed` and the bonuses are all zero.
  7. Right verdict with `valid.length < required || invalid > 0` gives `outcome:'wrongJustification'`.
     - The reason is `'incompleteProof'` when `0 < valid.length < required && invalid === 0`. Otherwise it is `'weakProof'`.
     - `scoreDelta = Math.round(reward.score*WRONG_JUSTIFICATION_SCORE_FACTOR)`, credibility 0, no bonuses, `missedStampIds = missed`.
  8. Otherwise `outcome:'correct'` with the reward reason (`correctNormal|correctImportant|correctWithContext`).
     - `bonuses = { speed: speed ? SCORE.speedBonus : 0, multiStamp: (required-1)*SCORE.multiStampBonus, bossCall: 0 }`.
     - `scoreDelta = reward.score + speed + multiStamp`.
     - `missedStampIds = []`. This is the Zabrakło fix (`desk.ts:75`).
- **Partial proof.** A partial proof is therefore `wrongJustification` with reason `incompleteProof`: half the base points, no bonuses, no credibility.
- **Event folders.** `evaluateTagged`:
  - A correction folder gives reason `correctionFiled`.
  - A bossCall adds `bonuses.bossCall = EVENTS.bossCallBonusScore` and adds it to `scoreDelta`.

### 1.4 Wire (part of the single Stage-7 protocol bump to 3)

The `verdict` command (`protocol.ts:110-115`) changes `justifyingStampId: entityId` to:

```ts
justifyingStampIds: z.array(entityId).min(1).max(MAX_REQUIRED_STAMPS)
```

The size stays far below `MAX_CLIENT_MESSAGE_BYTES = 4096`.

### 1.5 Which stories become multi-stamp

The supervisor still has to sign these off. Pick N = the number of justifying stamps on the level's stations, so that "cite all decisive evidence" holds.

| Level | Story | Required stamps | Note |
| --- | --- | --- | --- |
| l4 | `l4-raport-pielegniarek` | 2 | sourceRegistry + dataLibrary |
| l4 | `l4-cytat-dyrektorki` | 2 | archive + phone |
| l5 | `l5-nagranie-podatek` | 2 | phone + aiScanner. Teaches "the scanner is never proof alone". |
| l5 | `l5-wolne-tempo` | 2 | imageSearch + archive |
| l6 | `l6-apel-mieszkancow` | 2 | archive + phone |
| l6 | `l6-sondaz-pracowni` | 2 | sourceRegistry + dataLibrary |
| l6 | `l6-hashtag-12-to-koniec` | 3 | archive + dataLibrary + a NEW decisive Inne-media stamp written in S7-A21a |

- Endless picks these up automatically from the pool.
- Clamp check: l6's last slot is 382 s. With 55 + 40 s it ends at 477 s, within 480 s.

### 1.6 Client UI (all devices)

**Pure model.** New file `apps/client/src/stations/desk-model.ts`:

```ts
export function toggleEvidence(selected: readonly string[], id: string, required: number):
  { selected: string[]; blocked: boolean }   // N=1 → replace; N≥2 → toggle; adding beyond N → blocked
export function verdictReady(selected: readonly string[], required: number, collected: number): boolean
  // selected.length >= 1 && selected.length === Math.min(required, collected)
export function evidenceShortfall(required: number, collected: number): boolean // collected < required
```

**`DeskOverlay.VerdictView` (`DeskOverlay.tsx:132-357`).**
- `chosen: string|null` becomes `chosen: string[]`.
- `onVerdict(verdict, justifyingStampIds: string[])`.
- `StationLayer.onVerdict` sends `{kind:'verdict', folderId, verdict, justifyingStampIds}`.
- `CorrectionView` sends `[stampId]`.
- `required = story?.requiredStamps ?? 1`.

**Behaviour per input.**
- *Keyboard (arrows / Enter or Space / Esc) and gamepad (D-pad or stick / A / B):*
  - With N=1 it behaves as today: confirm picks the stamp and focus jumps to `verdict:publish`.
  - With N≥2, confirm toggles the stamp. When the selection reaches `min(N, collected)`, focus jumps to `verdict:publish`.
  - Adding beyond N is blocked. It plays `ui.back`, nudges the row, and shows the status line `pl.desk.deselectFirst`.
- *Touch:*
  - Tap toggles. Selected rows show a numbered tick (1, 2, 3) in selection order. The same 26 px tick icon is used, and rows keep their 48 px minimum height.
  - A blocked tap behaves as above.
- *Step 1 heading:*
  - N=1: `pl.desk.stepEvidence`, unchanged.
  - N≥2: `pl.desk.stepEvidenceMany(N)` plus a chip `pl.desk.evidenceCount(k, N)` on the same line. This fits 640×360.
  - When `collected < N`, an amber line shows `pl.desk.tooFewProofs`. The verdict is still allowed.
  - Screen readers get `aria-pressed` and the visually-hidden status `pl.desk.evidenceStatus(k,N)`.

**`ResultView`.**
- Use `result.bonuses.speed > 0` instead of `speedBonus`.
- Add a multi-stamp bonus chip `pl.desk.multiStampBonus(n)` when `bonuses.multiStamp > 0`.
- `missedStampIds` is now empty on correct verdicts, so "Zabrakło" disappears there. The copy rewrite belongs to the results/UI cluster.

**FolderCard (`hud/FolderCard.tsx`).** For `requiredStamps ≥ 2`, add an evidence badge:
- When hints are effectively on (the settings toggle AND `DIFFICULTY[d].hints`), show `have/N`, where `have` is the number of distinct justifying stamps on the folder, capped at N. Guidance already reveals decisive stations (`next-step.ts:130-134`), so this leaks nothing new.
- Otherwise (Expert, or hints off) show `×N` only.
- `StoryInfo` (`hud-model.ts:21-26`) gains optional `requiredStamps` and `justifyingStamps`.
- New pure helper `evidenceBadge(folder, story, hintsOn): {have:number|null; need:number} | null`.

**Guidance.** `hasJustifyingStamp` (`next-step.ts:108-110`) becomes `justifyingCount(folder, story) >= requiredStampsOf(story)`. `stationsToVisit` keeps sending the player to the missing justifying stations.

**Cue.** New `desk.unjustify`:
- `{severity:1, sound:{ids:['back'],bus:'ui',volume:0.7}, haptic:'tick'}`.
- Caption: `skip('own-action')`.
- `agents/game-feel.md` row: `desk.unjustify | evidence stamp deselected on the desk | slip pushed back | soft back | — | light tick (mobile) | ●`.

The `incompleteProof` and `weakProof` outcomes reuse `verdict.wrongJustification`.

## 2. Station bag for campaign AND endless (decisions 2 and 3)

### 2.1 Decisive station

```ts
/** Non-AI stations of `stations` where `story` has a justifying stamp, in `stations` order. */
export function decisiveStations(story: Story, stations: readonly StationKind[]): StationKind[]
```

- **Pinned story at s:** `decisiveStations === [s]`. This includes multi-stamp stories whose only non-AI proof is s, for example `l5-nagranie-podatek`.
- **Flex story:** two or more decisive stations, including multi-stamp stories that need several.
- **Bag stations:** `level.stations` without `aiScanner` that decide at least one pool story. A station that decides nothing gets a validator warning.
- **"Station s decides a folder":** the slot was designated s and its story is decidable at s.

The bag guarantees that every bag station is designated equally often (±1, only within the last partial round).

### 2.2 Level file schema (`schema.ts`)

Split the schema into a file schema and a resolved schema. Types stay inferred, and `CONTENT_FITS_SIMULATION` keeps holding for `Level`.

```ts
export const priorityDeadlinesSchema = z.object({ normal: z.number().positive(), important: z.number().positive(), urgent: z.number().positive() });
export const starSharesSchema = z.object({ two: z.number().gt(0).lt(1), three: z.number().gt(0).lt(1) });
export const levelBagSchema = z.object({
  /** Stories the bag may draw; ids of this level. Event stories stay in `events`. */
  pool: z.array(contentIdSchema).min(2),
  firstAtS: z.number().nonnegative(),
  /** Seconds between folders on Normal; DIFFICULTY.spawnGapFactor scales it. */
  gapS: z.number().positive(),
  /** No scheduled folder arrives after this, on any difficulty. */
  lastSpawnS: z.number().positive(),
  /** Folder time by story priority on Normal (s). */
  deadlineS: priorityDeadlinesSchema,
  /** Override of STAR_SHARES. */
  starShares: starSharesSchema.optional(),
});
const levelBase = { id, title, briefing, topic, briefingPoints, durationS, layout, stations, events: …default([]) };
export const levelFileSchema = z.object({ ...levelBase, schedule: z.array(spawnSchema).min(1).optional(), stars: starsSchema.optional(), bag: levelBagSchema.optional() }).superRefine(refineLevelFile);
export const levelSchema = z.object({ ...levelBase, schedule: z.array(spawnSchema).min(1), stars: starsSchema, bag: levelBagSchema.optional() }).superRefine(refineLevelCommon);
export type LevelFile = z.infer<typeof levelFileSchema>; export type Level = z.infer<typeof levelSchema>;
```

- **`refineLevelFile`:**
  - Exactly one of `schedule` or `bag` (error).
  - `stars` is required iff there is a `schedule`.
  - With a bag: `firstAtS <= lastSpawnS < durationS`, `starShares.three > two`, and the pool ids are unique.
  - Plus every existing layout, station and event check (moved into `refineLevelCommon`).
- **Loading.** `index.ts` parses with `levelFileSchema`, then calls `resolveLevel(file, STORIES)`. For bag levels this fills `schedule` and `stars` from `generateBagLevel(file, STORIES, BAG_PREVIEW_SEED=0, 'normal')`.
- **Consumers.** `LEVELS` and `getLevel` keep returning a full `Level`, so these keep working on the preview: `LevelCard.tsx:50`, `tools/contest/maps.ts:226`, `Briefing.tsx`, `TechniqueCard.tsx`, and `net/runtime.ts:32` (layout only).
- **New helper.** `levelStoryIds(level)` returns `bag?.pool ?? schedule ids`. Use it in:
  - `endlessStoryPool` (`endless.ts:73-82`)
  - `checks.ts` "used" and `hostStations`
  - `rawStoryIds`, which also reads `bag.pool`
  - `tools/content/review-lib.ts:177`

### 2.3 Pure generator: new file `packages/content/src/bag.ts`

`type Rng` is exported from `shared/sim/rng.ts`.

```ts
/** Shuffled rounds over `items`, never the same item twice in a row (generalises endless storyDrawer). */
export function bagDrawer<T>(items: readonly T[], rng: Rng): () => T
export function decisiveStations(story: Story, stations: readonly StationKind[]): StationKind[]
export function bagStations(pool: readonly Story[], stations: readonly StationKind[]): StationKind[]
/** Station designated for each slot: whole shuffled rounds of every bag station (bagDrawer). */
export function stationSequence(stations: readonly StationKind[], count: number, rng: Rng): StationKind[]
/** Max matching slot→distinct story decidable at the slot's station; undefined where none is left. */
export function matchStories(sequence: readonly StationKind[], pool: readonly Story[], stations: readonly StationKind[], rng: Rng): (Story | undefined)[]
/** matchStories + fallback (least-used candidate of the station; never throws). */
export function assignStories(sequence, pool, stations, rng): Story[]
/** Slot times: firstAtS + i * gapS * spawnGapFactor while ≤ lastSpawnS, rounded to 0.1 s. */
export function bagSlotTimes(bag: LevelBag, difficulty: Difficulty): number[]
/** Star thresholds of a run: shares of its max, rounded to STAR_THRESHOLD_STEP; three > two. */
export function starThresholds(maxScore: number, shares = STAR_SHARES): { two: number; three: number }
export function generateBagLevel(level: LevelFile | Level, stories: readonly Story[], seed: number, difficulty: Difficulty): Level
```

**`matchStories` algorithm (Kuhn's augmenting paths, ~25 lines).**
1. For each slot i with station k, build the candidate order:
   - `p = shuffle(pinned(k))` and `f = shuffle(flex(k))`.
   - `list = rng.next() < BAG_FLEX_CHANCE ? [...f, ...p] : [...p, ...f]`.
   - Stable-partition the list so preferred stories come first:
     - Slots below `BAG_OPENING_SLOTS` prefer `requiredStamps===1 && priority!=='urgent'`.
     - Slots below `BAG_MULTI_STAMP_MIN_SLOT` prefer `requiredStamps===1`.
2. Run `tryAssign(slot, seen)`, re-routing earlier slots along augmenting paths.

Kuhn's algorithm always finds a maximum matching, so whenever the content can cover a run without repeats, the run has none. Ordering only biases which stories are chosen. Soft constraints never break feasibility.

**`generateBagLevel` steps, in this order** (this is the required composition "bag → difficulty → multi-stamp extra"):
1. `times = bagSlotTimes(bag, d)`. The slot count depends on the difficulty gap.
2. `sequence = stationSequence(bagStations(pool, level.stations), times.length, createRng(seed))`.
3. `stories = assignStories(sequence, pool, level.stations, createRng(seed ^ BAG_STORY_STREAM))`.
4. For each slot, set the deadline:
   ```ts
   deadlineS = max(BAG_MIN_DEADLINE_S, min(round(bag.deadlineS[priority] * DIFFICULTY[d].deadlineFactor), durationS - atS - (required-1)*MULTI_STAMP_EXTRA_DEADLINE_MS/1000))
   ```
   This leaves room for the sim's extra time.
5. Events keep their `atS`. `deadlineS × deadlineFactor` (rounded), and outage duration is unchanged.
6. `stars = starThresholds(maxLevelScore(result, byId), bag.starShares ?? STAR_SHARES)`.
7. At spawn the sim adds the multi-stamp extra time (§1.3).

**Determinism.**
- Same (level, stories, seed, difficulty) → identical `Level`.
- The run seed is chosen by the server and is independent of the sim seed (§8), so versus teams can share it.
- RNG stream salts are named module constants: `BAG_STORY_STREAM`, `ENDLESS_TIME_STREAM`, `ENDLESS_EVENT_STREAM`.

### 2.4 Endless on the bag

New signature:

```ts
generateEndlessLevel(seed, levels, stories, difficulty: Difficulty = DEFAULT_DIFFICULTY)
```

1. Stations come from `bagStations(pool, ENDLESS_STATIONS)`. That is all non-AI endless stations, 9 once cluster B lands.
2. `nextStation = bagDrawer(stations, createRng(seed))`.
3. Each station gets its own deck: `bagDrawer(candidates(k), storyRng)`, where candidates are pinned and flex stories decidable at k.
4. If the drawn story equals the previous slot's story, draw once more from the same deck.
5. Interval: `endlessIntervalS(atS) * spawnGapFactor * jitter(timeRng)`. Deadline: `round(endlessDeadlineS(atS) * deadlineFactor)`.
6. Events use `eventRng` and their deadline is scaled the same way.

Repeats are expected in endless. `storyDrawer` is deleted and replaced by `bagDrawer`.

### 2.5 Constants (`constants.ts`)

```ts
/** Star thresholds as shares of a run's maximum score (balance.md intent 55 % / 80 %). */
export const STAR_SHARES = { two: 0.55, three: 0.8 } as const;
export const STAR_THRESHOLD_STEP = 5;
/** Chance that a slot tries stories decidable at several stations before single-station ones. */
export const BAG_FLEX_CHANCE = 0.3;
/** First folders of a run prefer single-proof, non-urgent stories. */
export const BAG_OPENING_SLOTS = 2;
/** Multi-stamp stories are preferred only from this slot on. */
export const BAG_MULTI_STAMP_MIN_SLOT = 4;
/** A clamped bag deadline never drops below this (s). */
export const BAG_MIN_DEADLINE_S = 30;
/** Endless: a station deck smaller than this is reported (repetition). */
export const ENDLESS_MIN_DECK = 6;
```

`CONTENT_TWO_STARS_SHARE` and `CONTENT_THREE_STARS_SHARE` (`constants.ts:152-154`) now validate `STAR_SHARES` and any `starShares` override.

### 2.6 Star thresholds that players can understand

"★★ from 55 % of this shift's maximum score, ★★★ from 80 %, rounded to 5 points."

Check against today's maxima: `starThresholds(375)` = {205, 300}; with l1's override (0.55/0.85) = {205, 320}. The others match too: 440 → {240, 350}, 395 → {215, 315}, 435 → {240, 350}, 450 → {250, 360}, and 240 with l0's override (0.5/0.8) → {120, 190}. These equal the current authored thresholds and become unit-test literals.

Data flow:
- `levelEnd` carries the run's `starThresholds` and `maxScore` (§6).
- `roomState.run` carries them from the briefing on.
- The lobby shows the shares. It can preview per difficulty with `prepareRun(getLevel(id), {seed: BAG_PREVIEW_SEED, difficulty})` on the client, because content is bundled and pure.

### 2.7 Bag config per level (Normal values from today's authored data)

| Level | firstAtS | gapS | lastSpawnS | deadlineS normal / important / urgent | starShares |
| --- | --- | --- | --- | --- | --- |
| l0 | 3 | 18 | 175 | 75 / 90 / 50 | {0.5, 0.8} |
| l1 | 4 | 22 | 312 | 55 / 60 / 40 | {0.55, 0.85} |
| l2 | 4 | 24 | 340 | 55 / 60 / 45 | default |
| l3 | 4 | 24 | 340 | 60 / 60 / 45 | default |
| l4 | 4 | 24 | 340 | 55 / 55 / 40 | default |
| l5 | 4 | 24 | 340 | 60 / 60 / 45 | default (retune after the map grows) |
| l6 | 4 | 27 | 382 | 55 / 55 / 40 | default (retune after the map grows) |

Slots per difficulty (easy / normal / hard / expert):
- l0: 8 / 10 / 11 / 12.
- l1–l6: 12 / 15 / 16 / 18.

### 2.8 Pool validation (`checks.ts`, new `checkBag(file, storiesById, report)`)

**Errors:**
- Unknown pool id.
- Pool story that fails `checkStoryFitsLevel` (level number, a stamp for every level station, solvable, enough proofs for `requiredStamps`).
- Duplicate pool ids.
- Pool and event story ids overlap.
- **Coverage:** for every difficulty, `slots = bagSlotTimes(...).length`. For every worst-case demand vector (r = slots mod k stations get ⌈slots/k⌉, the rest ⌊slots/k⌋; at most C(9,4) = 126 vectors), `matchStories` must cover every slot. Message: `station X cannot get N distinct folders on <difficulty>; add stories decided only at X`.

**Warnings:**
- Fairness target: pinned(s) < ⌈normalSlots/k⌉.
- Pool true share outside `CONTENT_TRUE_STORY_SHARE`.
- `lastSpawnS + max(deadlineS) > durationS` (the generator clamps).
- `starShares` outside the `CONTENT_*_STARS_SHARE` ranges.
- A level station decides no pool story.
- Endless decks with fewer than `ENDLESS_MIN_DECK` candidates.

### 2.9 Content work

I counted these exactly from `levels/*.json` and `stories/*.json`. The bag stations for l5 and l6 include the new stations from decision 6. The placeholder kinds `transcript`, `metadata`, `map` and `otherMedia` are owned by cluster B.

Today's pinned / flex counts per bag station (scheduled stories only; event stories stay fixed):

- **l0:** IS 0/2, archive 1/3, SR 5/3. Pool 10 (4 true).
- **l1:** IS 3/4, SR 8/4. Pool 15 (5 true).
- **l2:** IS 2/1, archive 5/1, SR 6/2. Pool 15 (5 true).
- **l3:** IS 0/2, SR 2/3, archive 0/6, phone 4/9. Phone is the bottleneck.
- **l4:** SR 2/5, archive 0/1, phone 1/4, DL 6/2.
- **l5:** IS 2/2, SR 3/0, phone 5/0, archive 3/2, transcript 0, metadata 0.
- **l6:** IS 1/1, archive 0/5, SR 3/6, phone 0/5, DL 1/3, map 0, otherMedia 0.

Two tiers of new stories, all `reviewed:false`:

| Level | MINIMUM (validator error: no repeats at Expert, flex counted via matching) | TARGET (fairness: pinned(s) ≥ ⌈15/k⌉ on Normal; RECOMMENDED, also satisfies the minimum, verified) |
| --- | --- | --- |
| l0 | +3 (IS 2, archive 1) | +7 (IS 4, archive 3) → pool 17 |
| l1 | +3 (IS 2, SR 1) | +5 (IS 5) → pool 20 |
| l2 | +3 (IS 3) | +3 (IS 3) → pool 18 |
| l3 | +3 (IS 3) | +10 (IS 4, SR 2, archive 4) → pool 25 |
| l4 | +5 (archive 4, phone 1) | +9 (SR 2, archive 4, phone 3) → pool 24 |
| l5 | +6 (transcript 3, metadata 3) | +7 (IS 1, transcript 3, metadata 3) → pool 22 |
| l6 | +7 (IS 1, map 3, otherMedia 3) | +16 (IS 2, archive 3, phone 3, DL 2, map 3, otherMedia 3) → pool 31 |
| **Total** | **30** | **57** |

Plus:
- About 1/3 of the new stories should be true.
- Each needs a stamp for every station of its level: up to 7 on l5 and 8 on l6. This needs cluster B to raise `stamps.max(6)` to 10.
- Endless decks today: SR 44, phone 28, archive 23, IS 18, DL 12. After l5 and l6 each new station deck must be ≥ 6. Cluster B's decisive new-station stamps on existing stories count toward this.

**Warning on this count.** Giving an existing pinned story a decisive new-station stamp turns it into a flex story and lowers that station's pinned count. Re-run `validate:content` after cluster B's stamp work.

## 3. Difficulty (decision 9)

### 3.1 `domain.ts`

```ts
export const difficultySchema = z.enum(['easy','normal','hard','expert']);
export type Difficulty = z.infer<typeof difficultySchema>;
export const DIFFICULTIES = difficultySchema.options;
```

### 3.2 `constants.ts`

The values are provisional until S7-A23.

```ts
export type DifficultyPreset = { deadlineFactor: number; spawnGapFactor: number; workTimeFactor: number; lockoutFactor: number; penaltyFactor: number; minigameTimeFactor: number; extraMistakes: number; hints: boolean; revealOnFail: boolean };
export const DIFFICULTY = {
  easy:   { deadlineFactor: 1.3,  spawnGapFactor: 1.2, workTimeFactor: 0.8,  lockoutFactor: 0.5, penaltyFactor: 0.5,  minigameTimeFactor: 1.5,  extraMistakes: 1,  hints: true,  revealOnFail: true },
  normal: { deadlineFactor: 1,    spawnGapFactor: 1,   workTimeFactor: 1,    lockoutFactor: 1,   penaltyFactor: 1,    minigameTimeFactor: 1,    extraMistakes: 0,  hints: true,  revealOnFail: true },
  hard:   { deadlineFactor: 0.85, spawnGapFactor: 0.9, workTimeFactor: 1.15, lockoutFactor: 1.5, penaltyFactor: 1.25, minigameTimeFactor: 0.85, extraMistakes: 0,  hints: true,  revealOnFail: true },
  expert: { deadlineFactor: 0.75, spawnGapFactor: 0.8, workTimeFactor: 1.25, lockoutFactor: 2,   penaltyFactor: 1.5,  minigameTimeFactor: 0.75, extraMistakes: -1, hints: false, revealOnFail: false },
} as const satisfies Record<Difficulty, DifficultyPreset>;
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';
export const MINIGAME_MIN_MISTAKES = 1;
```

### 3.3 Pure helpers: new file `packages/shared/src/difficulty.ts`

```ts
export function simTuning(d: Difficulty): SimTuning            // {workTimeFactor, lockoutFactor, penaltyFactor}
export const NORMAL_TUNING: SimTuning
export function minigameTimeLimitMs(d): number                  // round(MINIGAME_TIME_LIMIT_MS*factor): 30000/20000/17000/15000
export function mistakeLimit(base: number, d): number           // base>1 ? max(MINIGAME_MIN_MISTAKES, base+extra) : base  (2→3/2/2/1; phone/AI stay 1)
export function failLockoutMs(d): number                        // 1500/3000/4500/6000
```

`scalePenalty(value, factor)` goes in `sim/scoring.ts`. It returns `value < 0 ? -Math.round(-value*factor) : value`. Examples: -25×0.5 → -13, -25×1.5 → -38, -5×1.5 → -8, -5×0.5 → -3.

### 3.4 Sim layer

`SimContext` (`frame.ts:8-13`) gains `tuning: SimTuning`. It is required, and `testContext` (`__fixtures__/greybox.ts:56`) defaults it to `NORMAL_TUNING`.

| Function | Change |
| --- | --- |
| `workDurationMs(state, playerId, kind, tuning)` | `Math.round(STATION_WORK_MS[kind]*roleFactor*tuning.workTimeFactor)`. Shared with the roles cluster's generalist factor. |
| Lockout (`stations.ts:237`) | `Math.round(MINIGAME_FAIL_LOCKOUT_MS*tuning.lockoutFactor)` |
| `wrongPenalty` | Scaled with `scalePenalty` |
| Expiry (`scoring.ts:64-65`) | Scaled with `scalePenalty` |
| Correction loss (`events.ts:204-208`) | Scaled. Also `tagFor`'s `recoverCredibility = Math.round(scaledLoss*EVENTS.correctionRecoverFraction)`. |

Rewards are never scaled, so `maxScore` does not depend on difficulty except through the slot count.

### 3.5 Data layer

- Bag levels: `generateBagLevel` (§2.3).
- Endless: `generateEndlessLevel` (§2.4).
- Fixed-schedule levels (test fixtures or future scripted levels): `applyDifficulty(level, d)` scales schedule and event `deadlineS` only. It keeps `atS` so the authored `stars` stay valid.
- New file `packages/content/src/run.ts`:
  ```ts
  export type RunOptions = { seed: number; difficulty: Difficulty };
  export type PreparedRun = { level: Level; stories: StoryBook & Readonly<Record<string, Story>>; maxScore: number };
  export function prepareRun(base: Level, o: RunOptions, levels: readonly Level[], stories: readonly Story[]): PreparedRun
  export function runSummary(run: PreparedRun): RunSummary   // {folders, maxScore, stars|null}
  ```
  `index.ts` adds `prepareLevelRun(levelId, o)`. It also exports `maxLevelScore`, `maxStoryScore` and `starThresholds`.

### 3.6 Client

- **`StationOverlay`:** the time limit becomes `minigameTimeLimitMs(room.difficulty)`.
- **`MinigameProps`** (`minigames/types.ts`) gains:
  - `folderId: string`
  - `difficulty: Difficulty`
  - `timeLimitMs: number`
  - `revealOnFail: boolean` = `DIFFICULTY[d].revealOnFail && !MINIGAME_STABLE_SEED_STATIONS.includes(kind)`
- **Each minigame's logic** stores `maxMistakes = mistakeLimit(BASE, difficulty)` in its state instead of reading the constant:
  - `sourceRegistry.logic.ts:161`
  - `imageSearch.logic.ts:419`
  - `dataLibrary.logic.ts:291`
  - `Archive.tsx:151,339`
- **Reveal gating:** `SourceRegistry.tsx:125,183` (always hidden), `DataLibrary.tsx:154`, and the `AiScanner` failure banner.
- **`MinigameBench`** passes Normal defaults.
- **`StationLayer.tsx:53,83`** uses `failLockoutMs(d)`.
- **Hints:** the effective "co dalej" hint flag is `hintsEnabled && DIFFICULTY[d].hints`, a selector in `guidance/store.ts`. The tutorial is unaffected.

### 3.7 Lobby and wire

- `lobbyActionSchema`: `{kind:'setDifficulty', difficulty: difficultySchema}`. Host only, lobby phase only, resets ready like `selectLevel` (`registry.ts:406-428`).
- `roomState`:
  - `difficulty: difficultySchema`
  - `run: runSummarySchema.nullable()`, where `runSummarySchema = z.object({ folders: int≥0, maxScore: int≥0, stars: z.object({two:int, three:int}).nullable() })`
- `levelEnd`: `difficulty` (§6).
- Rooms start at `DEFAULT_DIFFICULTY`. The difficulty persists across level changes.

### 3.8 Progress and leaderboard per difficulty

- **Client progress:**
  - Storage key `redakcja.progress.v2`, shape `{[difficulty]: {[levelId]: stars}}`. v1 is migrated into `normal`.
  - `record(levelId, difficulty, stars)` is called from `net/session.ts:121` with `levelEnd.difficulty`.
  - The unlock chain uses the best stars across difficulties.
  - The endless best run (`redakcja.endless.v1`) moves to v2, keyed by difficulty.
- **Server:**
  - `leaderboard_entries.difficulty text not null default 'normal'`, with index `(difficulty, score)`. Generate the migration with `bun run db:generate`.
  - `recordLeaderboardEntry({..., difficulty})`.
  - `leaderboardQuerySchema` gains `difficulty: difficultySchema.default('normal')`. `leaderboardEntrySchema` gains `difficulty`.

## 4. Next-folder timer data (decision 14)

In `folders.ts`:

```ts
/** Level time (ms) of the next scheduled folder with a known story, or null when the schedule is used up. Event folders are never announced. */
export function nextScheduledSpawnMs(state: GameState, ctx: Pick<SimContext,'level'|'stories'>): number | null
/** A scheduled folder is due but waits because every conveyor tile is taken (spawnFolders 72-75). */
export function conveyorBlocked(state: GameState, ctx: Pick<SimContext,'level'|'stories'|'map'>): boolean
```

- **Snapshot** (`protocol.ts:199-213`) gains `nextFolderAtMs: finite.nullable()` and `conveyorFull: z.boolean()`. They are filled in `registry.broadcastSnapshot`.
- **Client** `game-store.ts` (`EMPTY` 25-36, `applySnapshot` 40-51) stores both.
- **Pure helper** in `hud-model.ts`:
  ```ts
  nextFolderState(next, full, elapsedMs): {kind:'in', ms} | {kind:'full'} | {kind:'none'}
  ```
  The ghost card and the conveyor ring belong to the HUD cluster.
- Times come from the generated, difficulty-scaled schedule.

## 5. Kartoteka (sourceRegistry) keeps its card (decision 4)

**Constant:**

```ts
export const MINIGAME_STABLE_SEED_STATIONS: readonly StationKind[] = ['sourceRegistry'];
```

**Sim.**
- `GameState` gains `minigameSeeds: Record<string, number>`, keyed `${folderId}:${kind}`. It is set to `{}` in `createGameState`. The field is sim-only: the snapshot is built field by field (`registry.ts:686-705`), so it never leaks.
- At `stations.ts:176`:
  - For a stable kind that already has a stored seed, reuse it without drawing from the RNG.
  - Otherwise call `nextInt` as today and store the seed when the kind is stable.
- First attempts consume the RNG exactly as now, so the determinism tests (`stations.test.ts:175-196`) hold.
- Cancelling also keeps the card, which closes the peek-and-cancel exploit for Kartoteka.
- The map is per match because `GameState` is per match.

**Client.**
- New zustand store `stations/minigames/retry-memory.ts`, not persisted:
  ```ts
  { sourceRegistry: Record<folderId, {seed: number; circled: readonly boolean[]}>; remember(); forget(); reset() }
  ```
  It is reset on `gameStarted`.
- `initialState(card, remembered?)` (`sourceRegistry.logic.ts:147`) restores `circled` only when `remembered.seed === seed`. It keeps only flagged fields, because circling only ever succeeds on flagged ones. `struck` and `mistakes` start fresh.
- `SourceRegistry.tsx` writes the memory on every state change while playing, and forgets it on success.
- No reveal on failure: `data-missed` and `t.revealed` are dropped. Instead the screen shows `pl.minigames.sourceRegistry.failedSameCard`.
- On a retry the task line is `pl.minigames.sourceRegistry.retryTask`.
- Limitation: the memory is per client. If a teammate retries, they get the same card but no circles.

## 6. Results data (decision 14)

In `entities.ts`:

```ts
export const folderOutcomeSchema = z.enum(['correct','wrongJustification','wrong','expired','unfinished']);
export const folderReasonSchema = z.enum(['correctNormal','correctImportant','correctWithContext','correctionFiled','weakProof','incompleteProof','publishedFake','rejectedTrue','contextOnTrue','publishedWithoutContext','rejectedContextStory','expired','expiredUnpenalized','unfinished']);
export const folderBonusesSchema = z.object({ speed: int≥0, multiStamp: int≥0, bossCall: int≥0 });
export const folderResultSchema = z.object({
  folderId, storyId, outcome, reason: folderReasonSchema, verdict: verdictSchema.nullable(),
  scoreDelta: int, credibilityDelta: int,
  /** Stamps cited at the desk; [] without a verdict. */
  justifyingStampIds: z.array(id).max(MAX_REQUIRED_STAMPS),
  requiredStamps: z.number().int().min(1).max(MAX_REQUIRED_STAMPS),
  bonuses: folderBonusesSchema,
  /** Errors only: justifying stamps the folder lacked; [] after a correct verdict. */
  missedStampIds: z.array(id).max(16),
});
export const levelOutcomeSchema = z.object({ won, stars, lossReason: z.enum(['credibility','score']).nullable() });
```

**Wire.**
- `verdictResult` event: `folderResultSchema.extend({ kind: z.literal('verdictResult'), playerId: playerIdSchema })`. This gives a single source of truth. `speedBonus: boolean` becomes `bonuses.speed > 0`.
- `levelEnd` gains:
  - `difficulty`
  - `lossReason: z.enum(['credibility','score']).nullable()`
  - `starThresholds: z.object({two,three}).nullable()` (null in endless)
  - `maxScore: z.number().int().nonnegative().nullable()`
- `VerdictEvaluation` = `Omit<FolderResult,'folderId'|'storyId'|'verdict'|'justifyingStampIds'|'requiredStamps'>`, with outcome excluding `expired` and `unfinished`.

**Sim.**
- `levelOutcome` (`scoring.ts:28-41`):
  - credibility ≤ 0 → `{won:false, stars:0, lossReason:'credibility'}`.
  - Time up → `lossReason = won ? null : 'score'`.
- Expiry results get reason `expired` or `expiredUnpenalized`, zero bonuses, and the story's `requiredStamps`.
- **End-of-level sweep** in `stepScoring` (`scoring.ts:85`): when `ended` becomes non-null, append one `unfinished` result per folder still in play:
  - zero deltas, `verdict:null`, `justifyingStampIds:[]`
  - `missedStampIds` = the justifying stamps the folder lacks
  - one result per bot raid
- The server's fallback `{won:false, stars:0}` (`registry.ts:727`) gains `lossReason:null`.

**Client compile-only adaptations** in the same commit (the presentation belongs to the UI cluster):
- `'unfinished'` entries in the `Record<FolderOutcome>` maps: `pl.ts:350-355` and `788-793`, `DebriefCard` TONE/MARK, `hud-model.ts:163-168`, and the `event-cues.ts` `verdictCue` switch.
- `StationLayer.tsx:140` uses `[...event.justifyingStampIds]`.

## 7. Balance harness (`tools/balance`)

- **`game.ts`.**
  - `Scenario` gains `difficulty: Difficulty`, `maxScore: number` and `tuning: SimTuning`.
  - `levelScenario(level, crew, seed, difficulty)` calls `prepareRun(level, {seed, difficulty}, LEVELS, STORIES)`, so the job seed is also the bag seed.
  - `endlessScenario(..., difficulty)`.
  - `ctx = {dtMs, map, level, stories, tuning}`.
  - `RunResult` gains `difficulty` and `stationBusyShare: Partial<Record<StationKind, number>>`: the share of level time each station had a folder or an operator, sampled every tick.
- **`bot.ts`.**
  - `plan()` (385): `holdsJustifying = justifyingHeld >= requiredStampsOf(story)`.
  - `chooseVerdict` (519-547) returns `stampIds: string[]`. It cites `min(required, held)` stamps, preferring justifying ones. The wrong-justification chance swaps one cited stamp for a non-justifying held stamp. The bot sends `justifyingStampIds: ids.length ? ids : ['none']`.
  - `workDurationMs(..., ctx.tuning)` (451).
  - The minigame cap (567) uses `minigameTimeLimitMs(d)`.
  - The fail chance is multiplied by `DIFFICULTY_FAIL_FACTOR[d]`, and on retries at `MINIGAME_STABLE_SEED_STATIONS` also by `RETRY_FAIL_FACTOR` = 0.5.
- **`models.ts`** (bot assumptions, not game balance): `DIFFICULTY_FAIL_FACTOR = { easy: 0.75, normal: 1, hard: 1.15, expert: 1.4 }` and `RETRY_FAIL_FACTOR = 0.5`.
- **`jobs.ts` / `run.ts`.**
  - `Job.difficulty`.
  - `--difficulty easy,normal,hard,expert` (default `normal`).
  - Headers show the mean run `maxScore` and thresholds.
- **`report.ts`.**
  - New "Station load" table (`stationBusyShare` mean per station, average×3).
  - New intent check: average×3 win rate does not increase from easy to expert on every level.
  - Existing Normal targets stay.

## 8. Server run lifecycle and composition (`apps/server/src/rooms/registry.ts`)

**`Room` (71-86)** gains:
- `difficulty: Difficulty`
- `run: { seed: number; summary: RunSummary } | null`

**Flow.**
- `setLevel` (154-163): no generation. `room.level` is the base level or preview (`getLevel`). `room.run = null`.
- `beginBriefing` (479-486) calls `prepareRoomRun(room)`:
  1. `seed = Math.floor(random()*0x7fffffff)`.
  2. `run = prepareRun(requireLevel(room.level.id), {seed, difficulty: room.difficulty}, LEVELS, STORIES)`.
  3. `room.level = run.level; room.stories = run.stories; room.run = {seed, summary: runSummary(run)}`.
  4. Then `broadcastRoomState`.
- Replays from results also pass through `beginBriefing`, so every attempt differs.
- `startLevel` (533-552): delete the endless regeneration at 536-539. The sim seed stays a separate `random()` draw (540).
- `tick` ctx (666-671) adds `tuning: simTuning(room.difficulty)`.
- `backToLobby` and `selectLevel` reset `room.run = null`.
- `endLevel` (725-746) sends `difficulty`, `lossReason`, `starThresholds: endless ? null : room.level.stars` and `maxScore: room.run?.summary.maxScore ?? null`.
- `recordEndlessRun` passes `difficulty`.
- `inspect()` exposes `difficulty` and `run`.
- The run seed is never sent to clients, because it would spoil the folder sequence.

**Composition order, in one place:**
1. Difficulty-scaled slot template.
2. Bag: station sequence and story matching.
3. Difficulty deadlines and clamp.
4. Stars from the result.
5. Sim at spawn: multi-stamp extra time.
6. Sim tuning: work, lockout and penalties.

## 9. Strings (`apps/client/src/strings/pl.ts`, typeset at render) and docs

**Strings.**
- **Desk:**
  - `pl.desk.stepEvidenceMany: (n) => `Wybierz ${n} dowody``
  - `evidenceCount: (k,n) => `${k}/${n}``
  - `evidenceStatus: (k,n) => `Wybrano ${k} z ${n} dowodów``
  - `tooFewProofs: 'Za mało dowodów: połowa punktów'`
  - `deselectFirst: 'Najpierw odznacz jeden dowód'`
  - `multiStampBonus: (n) => `Premia za komplet dowodów +${n}``
  - `outcomes.unfinished: 'Nie zdążyliście'`
- **HUD:** `pl.hud.evidenceHave: (k,n) => `Dowody: ${k} z ${n}``, `evidenceNeed: (n) => `Wymaga ${n} dowodów``.
- **Results:** `pl.results.outcomes.unfinished: 'Niedokończona'`.
- **Difficulty:**
  - `pl.difficulty.label: 'Poziom trudności'`
  - `names: {easy:'Łatwy', normal:'Normalny', hard:'Trudny', expert:'Ekspert'}`
  - `blurbs: {easy:'Więcej czasu, łagodniejsze kary', normal:'Tak, jak zaprojektowaliśmy', hard:'Mniej czasu, więcej teczek', expert:'Bez podpowiedzi i bez litości'}`
  - `hostOnly: 'Poziom wybiera gospodarz'`
- **Kartoteka:** `pl.minigames.sourceRegistry.failedSameCard: 'Nie tym razem. Karta na ciebie poczeka.'`, `retryTask: 'Ta sama karta: dokończ zakreślanie'`.
- **Proposed for the UI cluster:** `pl.results.reasons.*` (one line per reason), `lossReason.*`, `starRule`, `toNextStar`, `pl.hud.nextFolder` / `conveyorFull`.

**Docs.**
- `docs/design-document.pl.md`:
  - Loop (l.54-58): multi-stamp.
  - Scoring (l.77-91): bonus, incomplete proof, the star-share rule.
  - Campaign (l.111-122): the bag.
  - New section "Poziomy trudności".
- `docs/implementation-plan.md`:
  - Stage 7 with S7-A tasks.
  - Decision-log rows:
    - multi-stamp justification replaces "pick the one stamp"
    - campaign bag and derived stars
    - difficulty presets
    - stable Kartoteka card
    - `unfinished` outcome and reasons
    - next-folder data in the snapshot
    - run seed separate from the sim seed
    - `missedStampIds` only on errors
    - `PROTOCOL_VERSION` 3 covers all Stage-7 wire changes until the next deploy
- `agents/glossary.md`:
  - Poziom trudności `difficulty` (Łatwy/Normalny/Trudny/Ekspert)
  - Worek stanowisk `stationBag`
  - Pula poziomu `bag.pool`
  - Wymagane dowody `requiredStamps`
  - Słaby dowód `weakProof`
  - Za mało dowodów `incompleteProof`
  - Niedokończona `unfinished`
  - Powód wyniku `reason`
  - Następna teczka `nextFolderAtMs`
  - Taśma pełna `conveyorFull`
  - Zmiana/podejście `run`
  - Ziarno zmiany `runSeed`
- `agents/content-authoring.md`: pools, pinned versus flex, coverage errors, the `requiredStamps` rules.
- `agents/game-feel.md`: the `desk.unjustify` row.
- `docs/balance.md`: rerun.

## 10. Tests (literal values)

- **`shared/sim/desk.test.ts`.** Multi story `m2` (false, important, justifying image+archive, `requiredStamps` 2):
  - Both cited early → correct, 35 = 20 + 5 + 10, credibility +5, bonuses {5,10,0}, missed [].
  - Image only, both collected → wrongJustification / incompleteProof, 10, credibility 0, missed [].
  - Image + source → weakProof, 10.
  - Folder [image], cite [image] → incompleteProof, missed ['m2-archive'].
  - Duplicate cites are deduped.
  - Zabrakło fix: single story justifying [image, archive], folder [image], correct → missed [].
  - Expert (penalty 1.5): publishedFake → -30 / -38. Easy → -10 / -13.
- **`folders.test.ts`:**
  - N=2 story spawned at 1000 ms with deadlineS 60 → `deadlineMs` 81000. N=3 → 101000. A viral event folder gets the same extra.
  - `nextScheduledSpawnMs` on TEST_LEVEL is 1000 → 5000 → 10000 → null.
  - `conveyorBlocked` is true when every C tile is full and the next entry is due.
- **`stations.test.ts`:**
  - sourceRegistry: fail → lockout → retry gives the same seed and an unchanged `state.rng`. Cancel → same seed. Another folder → a new draw. imageSearch retry draws a new seed.
  - `workDurationMs` sourceRegistry = 4000 / 3200 (easy) / 5000 (expert). photoEditor at imageSearch on expert = 3000.
  - Lockout = 1500 / 3000 / 4500 / 6000.
- **`scoring.test.ts`:**
  - credibility 0 → lossReason 'credibility'.
  - Time up with score 0 → 'score'.
  - Score 40 on TEST_LEVEL → {won:true, stars:2, lossReason:null}.
  - The sweep appends 2 unfinished results for 2 folders in play.
  - Expiry on expert → -8 / -8.
  - Unverifiable normal → expiredUnpenalized 0 / 0.
  - `scalePenalty`: (-25, 0.5) → -13, (10, 1.5) → 10.
- **`difficulty.test.ts`:** `minigameTimeLimitMs` 30000 / 20000 / 17000 / 15000; `mistakeLimit(2, easy)` 3, `(2, expert)` 1, `(1, easy)` 1.
- **`protocol.test.ts`:**
  - verdict with [] and with 4 ids is rejected; with ['s1','s2'] it is accepted.
  - setDifficulty 'insane' is rejected.
  - A snapshot without `nextFolderAtMs` is rejected.
  - A levelEnd with all new fields is accepted.
- **`content/bag.test.ts`:**
  - `bagSlotTimes({firstAtS:4, gapS:24, lastSpawnS:340})` lengths are 12 / 15 / 16 / 18. Last values are 320.8 / 340 / 328 / 330.4.
  - `stationSequence(4 stations, 18, rng(1))`: two stations 5, two 4, and every block of 4 is a permutation.
  - `bagDrawer`: no consecutive repeats over 100 draws.
  - `matchStories` on a fixture pool: distinct stories, each decidable at its slot's station, deterministic per seed.
  - Augmenting-path case: pool {A:[IS], B:[IS,SR]} with sequence [SR, IS] gives B → SR and A → IS.
  - `starThresholds` reproduces 375 → {205, 300}, 375 at 0.85 → {205, 320}, 440 → {240, 350}, 395 → {215, 315}, 435 → {240, 350}, 450 → {250, 360}, 240 at 0.5 → {120, 190}.
  - Deadlines: urgent 45 on easy → 59. Clamp at slot 340 on a 420 s level with N=2 → 60.
- **`endless.test.ts`:**
  - Deterministic per (seed, difficulty).
  - No back-to-back repeats.
  - First deadline 104 / 80 / 68 / 60 (easy / normal / hard / expert); slot count easy < normal < expert.
  - `stationSequence` coverage. "Uses the whole pool" is replaced by "every pool story is in some station deck".
- **`checks.test.ts`:**
  - Coverage error on a thin fixture pool.
  - Pinned-target warning.
  - Overlap error for pool and event ids.
  - `requiredStamps` > justifying error.
  - Multi on l1 warning.
  - Real content: every bag level is valid on every difficulty.
- **`l2-wybory.test.ts` → `solvable.test.ts`:** for every level, every pool story spawns and earns `maxStoryScore` when citing its required justifying stamps.
- **Server (`lobby.test.ts`, `registry.test.ts`, `endless.test.ts`):**
  - setDifficulty by host → roomState.difficulty 'hard' and ready reset. By a guest → notHost. While playing → ignored.
  - Briefing → `roomState.run` equals `runSummary(prepareRun(...))` under the injected `random`.
  - The snapshot has `nextFolderAtMs` equal to the first slot's `atS*1000`, and `conveyorFull` false.
  - levelEnd has difficulty 'normal', lossReason 'credibility', and thresholds equal to the run's stars.
  - The leaderboard row stores `difficulty`.
  - The API query `difficulty=hard` filters.
- **Client:**
  - `desk-model.test.ts`: toggle, blocked, `verdictReady(['a'], 2, 1)` true and `(['a'], 2, 2)` false.
  - `hud-model` `evidenceBadge` and `nextFolderState`.
  - `sourceRegistry.logic` `initialState` with memory.
  - `progress.test` v1 → v2 migration and unlock across difficulties.
  - `guidance.test` for multi-stamp.
- **E2E:** in `e2e/multiplayer.spec.ts` the host picks Trudny, the guest roster shows the difficulty chip, and the briefing shows the run thresholds. Run on the desktop and mobile projects.

## 11. Shared contracts other clusters also touch

- **`protocol.ts`** (one bump to 3): verdict command, verdictResult, roomState, snapshot, levelEnd, lobby action. Affects versus/spectator (two sims, spectator feeds read FolderResult reasons), UI (results, HUD, lobby) and server (room browser shows difficulty).
- **`entities.ts`:** `FolderResult`, the new outcome, `LevelOutcome`. Affects UI and spectator live stats.
- **`domain.ts`:** `difficultySchema`. Affects the room browser filter and leaderboard.
- **`constants.ts`:**
  - `DIFFICULTY` (roles cluster abilities may want tuning).
  - `SCORE` gains a key.
  - `STATION_WORK_MS` new kinds (cluster B).
  - `MAX_PLAYERS` (versus).
- **`sim/frame.ts`:** `SimContext.tuning` (versus, roles).
- **`sim/stations.ts`:** `workDurationMs` signature (roles generalist factor), lockout (roles "Druga szansa").
- **`sim/state.ts`:** `GameState.minigameSeeds` (roles, versus).
- **`sim/folders.ts` `spawnFolderAt` / `checkDeadlines`:** roles "Ratownik" auto-rescue.
- **Content schema:**
  - `requiredStamps`, the level file split / bag (cluster B raises `stamps.max`, adds kinds and `ENDLESS_STATIONS`).
  - Map cluster (l5/l6 24×14 layouts change `gapS`/`lastSpawnS` tuning).
- **`MinigameProps`:** cluster B's 4 new minigames, and the station how-to cluster (MinigameBench).
- **`game-store`** (HUD cluster) and **`Lobby` / `LevelCard`** (UI cluster).
- **DB `leaderboard_entries`** (server cluster; versus needs `players.max(8)`).


## Contract changes

- packages/shared/src/constants.ts: PROTOCOL_VERSION 2 -> 3 (single Stage-7 bump, shared by every cluster until the next deploy)
- packages/shared/src/domain.ts: new difficultySchema = z.enum(['easy','normal','hard','expert']), type Difficulty, DIFFICULTIES
- packages/shared/src/constants.ts: DIFFICULTY preset table (deadlineFactor, spawnGapFactor, workTimeFactor, lockoutFactor, penaltyFactor, minigameTimeFactor, extraMistakes, hints, revealOnFail) + type DifficultyPreset, DEFAULT_DIFFICULTY='normal', MINIGAME_MIN_MISTAKES=1
- packages/shared/src/constants.ts: MAX_REQUIRED_STAMPS=3, MULTI_STAMP_EXTRA_DEADLINE_MS=20_000, MULTI_STAMP_FIRST_LEVEL=4, SCORE.multiStampBonus=10
- packages/shared/src/constants.ts: STAR_SHARES={two:0.55,three:0.8}, STAR_THRESHOLD_STEP=5, BAG_FLEX_CHANCE=0.3, BAG_OPENING_SLOTS=2, BAG_MULTI_STAMP_MIN_SLOT=4, BAG_MIN_DEADLINE_S=30, ENDLESS_MIN_DECK=6, MINIGAME_STABLE_SEED_STATIONS=['sourceRegistry']
- packages/shared/src/difficulty.ts (new): simTuning, NORMAL_TUNING, minigameTimeLimitMs, mistakeLimit, failLockoutMs
- packages/shared/src/sim/frame.ts: SimContext gains required `tuning: SimTuning` {workTimeFactor, lockoutFactor, penaltyFactor}
- packages/shared/src/sim/content.ts: SimStory.requiredStamps?: number + requiredStampsOf()
- packages/shared/src/sim/state.ts: GameState.minigameSeeds: Record<string, number> (sim-only, never in snapshots)
- packages/shared/src/sim/stations.ts: workDurationMs(state, playerId, kind, tuning) signature (also touched by the roles cluster)
- packages/shared/src/sim/desk.ts: evaluateVerdict(story, folder, verdict, citedStampIds[], nowMs, tuning); VerdictEvaluation gains reason/bonuses; missedStampIds empty on correct
- packages/shared/src/sim/scoring.ts: scalePenalty(); levelOutcome returns lossReason; end-of-level 'unfinished' sweep
- packages/shared/src/sim/folders.ts: spawnFolderAt adds (requiredStamps-1)*MULTI_STAMP_EXTRA_DEADLINE_MS; new nextScheduledSpawnMs(), conveyorBlocked()
- packages/shared/src/entities.ts: folderOutcomeSchema += 'unfinished'; new folderReasonSchema (14 values) and folderBonusesSchema {speed, multiStamp, bossCall}; folderResultSchema += reason, justifyingStampIds[], requiredStamps, bonuses; levelOutcomeSchema += lossReason ('credibility'|'score'|null)
- packages/shared/src/protocol.ts: verdict command justifyingStampId -> justifyingStampIds: z.array(entityId).min(1).max(MAX_REQUIRED_STAMPS)
- packages/shared/src/protocol.ts: verdictResult event = folderResultSchema.extend({kind:'verdictResult', playerId}); speedBonus boolean replaced by bonuses.speed
- packages/shared/src/protocol.ts: lobbyActionSchema += {kind:'setDifficulty', difficulty}
- packages/shared/src/protocol.ts: roomStateMessageSchema += difficulty, run: runSummarySchema.nullable() where runSummarySchema = {folders:int, maxScore:int, stars:{two,three}|null}
- packages/shared/src/protocol.ts: snapshotMessageSchema += nextFolderAtMs: finite.nullable(), conveyorFull: boolean
- packages/shared/src/protocol.ts: levelEndMessageSchema += difficulty, lossReason (nullable), starThresholds {two,three} (nullable), maxScore (nullable int)
- packages/shared/src/leaderboard.ts: leaderboardEntrySchema += difficulty; leaderboardQuerySchema += difficulty (default 'normal')
- packages/shared/src/sim/rng.ts: export type Rng = ReturnType<typeof createRng>
- packages/content/src/schema.ts: storySchema += requiredStamps (int 1..3, default 1) with superRefine checks
- packages/content/src/schema.ts: new levelBagSchema {pool, firstAtS, gapS, lastSpawnS, deadlineS{normal,important,urgent}, starShares?}; split into levelFileSchema (schedule XOR bag; stars only with schedule) and resolved levelSchema (schedule + stars required, bag optional); types LevelFile / Level inferred
- packages/content/levels/*.json: l0-l6 move from authored `schedule`+`stars` to a `bag` block (one level per content task)
- packages/content/src/bag.ts (new): bagDrawer, decisiveStations, bagStations, stationSequence, matchStories, assignStories, bagSlotTimes, starThresholds, generateBagLevel
- packages/content/src/run.ts (new): RunOptions, PreparedRun, prepareRun, runSummary, applyDifficulty; index.ts exports prepareLevelRun, maxLevelScore, maxStoryScore, levelStoryIds; getLevel/LEVELS return resolved preview levels (BAG_PREVIEW_SEED=0, normal)
- packages/content/src/endless.ts: generateEndlessLevel(seed, levels, stories, difficulty='normal') with station bag + per-station decks + separate RNG streams; storyDrawer removed; isSolvable honours requiredStamps
- packages/content/src/checks.ts: maxStoryScore includes multi-stamp bonus; checkStoryFitsLevel checks requiredStamps; new checkBag coverage/fairness/endless-deck rules
- apps/server/src/db/schema.ts: leaderboard_entries.difficulty text not null default 'normal' + index (difficulty, score); new generated migration
- apps/client/src/stations/minigames/types.ts: MinigameProps += folderId, difficulty, timeLimitMs, revealOnFail (shared with the stations and station-help clusters)
- apps/client/src/net/game-store.ts: += nextFolderAtMs, conveyorFull
- apps/client/src/store/progress.ts: storage v2 per difficulty (migrates v1 into normal)
- apps/client/src/fx/cues.ts + a11y/captions.ts + agents/game-feel.md: new cue desk.unjustify

## Cluster tasks (superseded by `tasks.md`)

- **S7-A01 — Difficulty vocabulary, Stage-7 constants and pure difficulty helpers** (S; depends on —). domain.ts difficultySchema/DIFFICULTIES. constants.ts adds DIFFICULTY, DifficultyPreset, DEFAULT_DIFFICULTY, MINIGAME_MIN_MISTAKES, MAX_REQUIRED_STAMPS, MULTI_STAMP_EXTRA_DEADLINE_MS, MULTI_STAMP_FIRST_LEVEL, SCORE.multiStampBonus, STAR_SHARES, STAR_THRESHOLD_STEP, BAG_* constants, ENDLESS_MIN_DECK and MINIGAME_STABLE_SEED_STATIONS. New shared/src/difficulty.ts (simTuning, NORMAL_TUNING, minigameTimeLimitMs, mistakeLimit, failLockoutMs). Export Rng type from rng.ts. Glossary rows for difficulty. No wire change. *Done when:* difficulty.test.ts asserts 30000/20000/17000/15000 time limits, mistakeLimit(2,'easy')=3, (2,'expert')=1, (1,'easy')=1, and failLockoutMs 1500/3000/4500/6000; bun run check green
- **S7-A02 — Sim tuning: work time, lockout and penalty scaling via SimContext.tuning** (M; depends on S7-A01). frame.ts SimContext.tuning (required). testContext defaults to NORMAL_TUNING. workDurationMs(..., tuning) with Math.round. Lockout scaled (stations.ts:237). scalePenalty in scoring.ts, used by wrongPenalty (desk.ts), expiry (scoring.ts:64-65) and correction loss/recover (events.ts:204-208, tagFor). Server tick ctx (registry.ts:666-671) and balance game.ts:92 pass NORMAL_TUNING for now. Coordinate the workDurationMs signature with the roles cluster. *Done when:* Unit tests: sourceRegistry work 4000/3200(easy)/5000(expert); photoEditor imageSearch expert 3000; lockout 6000 on expert; publishedFake -30/-38 on expert and -10/-13 on easy; expired -8/-8 on expert; correction loss 30 and recover 15 on expert; all existing sim tests still pass with NORMAL tuning
- **S7-A03 — Results and verdict wire contract (reasons, bonuses, unfinished, lossReason, cite array, Zabrakło data fix)** (L; depends on S7-A02). entities.ts: folderOutcome += 'unfinished', folderReasonSchema, folderBonusesSchema, FolderResult fields (reason, justifyingStampIds, requiredStamps, bonuses), levelOutcome.lossReason. protocol.ts: verdict justifyingStampIds[1..3], verdictResult = FolderResult + playerId, PROTOCOL_VERSION 3. desk.ts evaluateVerdict takes a cite array, returns reasons/bonuses, and leaves missedStampIds empty on correct. evaluateTagged sets correctionFiled and bossCall bonus. scoring.ts: expiry reasons, lossReason, unfinished sweep. Update every fixture and consumer: protocol/desk/events/loop/scoring tests, l2-wybory.test, server lobby/briefing tests, client dev-fixture, fx.test, DeskOverlay (sends [id], uses bonuses.speed), StationLayer:140, Record<FolderOutcome> maps (pl.ts, DebriefCard, hud-model, event-cues), tools/contest screenshots/video, balance bot (array). Decision log row. *Done when:* Correct verdict on a 2-justifying story citing one collected stamp gives missedStampIds []; verdict with [] or 4 ids is rejected by protocol.test; scoring.test gives lossReason 'credibility'/'score'/null and 2 unfinished results for 2 folders in play at time-up; bun run check green
- **S7-A04 — Multi-stamp folders: content field, validation, scoring and spawn extra time** (M; depends on S7-A03). storySchema.requiredStamps (default 1) with superRefine. SimStory.requiredStamps? and requiredStampsOf. checkStoryFitsLevel proof count, MULTI_STAMP_FIRST_LEVEL warning, endless isSolvable. maxStoryScore includes the bonus. spawnFolderAt adds the extra deadline (also for event folders). evaluateVerdict rules: N distinct valid cites, incompleteProof vs weakProof, multiStamp bonus. Generalise l2-wybory.test into a solvable.test over all levels' stories. *Done when:* desk.test: m2 both cited -> 35/+5, bonuses {5,10,0}; one cited -> incompleteProof 10; image+source -> weakProof 10; folders.test: N=2 at 1000 ms with 60 s -> deadlineMs 81000, N=3 -> 101000, viral event folder same; checks.test errors for requiredStamps > level justifying stamps; green
- **S7-A05 — Desk multi-select, folder-card evidence badge, guidance for multi-stamp folders** (M; depends on S7-A04). New stations/desk-model.ts (toggleEvidence, verdictReady, evidenceShortfall). DeskOverlay VerdictView multi-select for keyboard/gamepad/touch as specified (numbered ticks, blocked state, count chip, too-few warning, aria status). ResultView multi-stamp bonus chip. FolderCard badge have/N or xN via the evidenceBadge helper (StoryInfo gains optional requiredStamps/justifyingStamps). next-step.ts counts justifying stamps against requiredStamps. pl.ts desk/hud strings. desk.unjustify cue + caption + game-feel row. Design checklist in the commit body. *Done when:* desk-model.test (verdictReady(['a'],2,1)=true, (['a'],2,2)=false, add beyond N blocked); hud-model evidenceBadge tests; guidance.test multi-stamp case; manual check at 640x360 touch plus keyboard and gamepad in 2 tabs; green
- **S7-A06 — Stable Kartoteka card in the sim (no reroll after fail or cancel)** (S; depends on S7-A01). GameState.minigameSeeds, initialised in createGameState. stations.ts:176 reuses the stored seed for MINIGAME_STABLE_SEED_STATIONS kinds and stores it on first draw. Decision log row. *Done when:* stations.test: sourceRegistry fail -> lockout -> retry gives the same seed with state.rng unchanged; cancel then retry gives the same seed; another folder draws a new seed; imageSearch retry draws a new seed; existing determinism tests unchanged; green
- **S7-A07 — Bag core: station sequence, story matching, slot times, star thresholds** (M; depends on S7-A04). New packages/content/src/bag.ts: bagDrawer (replaces storyDrawer logic), decisiveStations, bagStations, stationSequence, matchStories (Kuhn with flex-chance ordering and soft opening/multi-stamp preferences), assignStories (fallback), bagSlotTimes, starThresholds. Fixture-based bag.test.ts. *Done when:* bag.test: slot counts 12/15/16/18 with last values 320.8/340/328/330.4; stationSequence 18 over 4 stations gives 5,5,4,4 with each block of 4 a permutation; augmenting-path case {A:[IS],B:[IS,SR]} with [SR,IS] gives B->SR, A->IS; starThresholds reproduces 205/300, 205/320, 240/350, 215/315, 240/350, 250/360, 120/190; deterministic per seed; green
- **S7-A08 — Level file schema split, generateBagLevel, prepareRun, applyDifficulty, pool validation** (M; depends on S7-A07). schema.ts levelBagSchema, levelFileSchema/levelSchema split with shared refine. index.ts resolves bag previews (BAG_PREVIEW_SEED=0, normal), prepareLevelRun, exports maxLevelScore/maxStoryScore/levelStoryIds. bag.ts generateBagLevel (difficulty slots, deadlines x factor, clamp with multi-stamp room, event deadline scaling, stars). run.ts prepareRun/runSummary/applyDifficulty. checks.ts checkBag: errors (unknown/foreign/overlap/coverage on all difficulties), warnings (pinned target, true share, deadline fit, star shares, idle station), rawStoryIds/used/hostStations read bag.pool. review-lib.ts:177 uses levelStoryIds. content-authoring.md updated. No real level converted yet. *Done when:* Fixture bag level validates; thin pool gives a coverage error; generateBagLevel is deterministic per seed and difficulty; urgent 45 s gives 59 on easy; clamp at slot 340 of a 420 s level with N=2 gives 60; LEVELS and getLevel unchanged for fixed levels; green
- **S7-A09 — Endless on the station bag with difficulty and separate RNG streams** (M; depends on S7-A08). generateEndlessLevel(seed, levels, stories, difficulty): bagStations over ENDLESS_STATIONS, per-station decks via bagDrawer, no back-to-back repeats, interval/deadline scaled by the preset, events on their own stream with scaled deadlines. endlessStoryPool uses levelStoryIds. ENDLESS_MIN_DECK warning. Rewrite endless.test expectations. *Done when:* endless.test: deterministic per (seed, difficulty); first deadline 104/80/68/60; schedule length easy < normal < expert; no consecutive repeats; every pool story is in some deck; server endless tests still pass; green
- **S7-A10 — Server run lifecycle and difficulty on the wire** (M; depends on S7-A08, S7-A03, S7-A02). protocol: setDifficulty action, roomState.difficulty + run summary, levelEnd difficulty/lossReason/starThresholds/maxScore. registry.ts: Room.difficulty/run, setDifficulty handler (host, lobby, resets ready), prepare run at beginBriefing with a run seed separate from the sim seed, remove the endless regeneration in startLevel, tick ctx tuning from difficulty, endLevel fields, recordEndlessRun difficulty, inspect() fields. Client app store keeps roomState difficulty/run. *Done when:* lobby.test/registry.test: host setDifficulty 'hard' broadcasts and resets ready, guest gets notHost, ignored while playing; briefing roomState.run equals runSummary(prepareRun(...)) under the injected random; levelEnd carries difficulty 'normal', lossReason 'credibility' and thresholds equal to the run's stars; replay gives a different run seed; green
- **S7-A11 — Next-folder timer data in snapshots** (S; depends on S7-A10). folders.ts nextScheduledSpawnMs and conveyorBlocked. snapshot nextFolderAtMs and conveyorFull filled in registry.broadcastSnapshot. game-store fields. hud-model nextFolderState helper. Update net.test, protocol.test and dev-fixture snapshots. The ghost card and conveyor ring UI belong to the HUD cluster. *Done when:* folders.test: TEST_LEVEL gives 1000 -> 5000 -> 10000 -> null, conveyorBlocked true with all C tiles full and the entry due; registry.test: first snapshot nextFolderAtMs equals first slot atS*1000 and conveyorFull false; hud-model test for in/full/none; green
- **S7-A12 — Client difficulty rules and Kartoteka retry memory** (M; depends on S7-A06, S7-A10). MinigameProps adds folderId, difficulty, timeLimitMs, revealOnFail. StationOverlay time limit. Each minigame's logic stores maxMistakes = mistakeLimit(base, d): sourceRegistry, imageSearch, dataLibrary, archive, phone base 1. Reveal gating in SourceRegistry (always off), DataLibrary and AiScanner. retry-memory store reset on gameStarted; sourceRegistry initialState(card, remembered) keeps circled flagged fields; failedSameCard/retryTask strings. StationLayer lockout uses failLockoutMs(d). Effective hints flag = setting && DIFFICULTY[d].hints. MinigameBench defaults. *Done when:* sourceRegistry.logic test: restoring memory keeps circled flags, ignores a different seed, and resets mistakes/struck; minigame logic tests with an expert limit of 1 mistake; manual Expert run in 2 tabs shows a 15 s clock, no reveal and no co-dalej bubble; green
- **S7-A13 — Lobby difficulty picker (host) and read-only chip (guests)** (S; depends on S7-A10). 4 secondary chips in screens/lobby/LevelCard.tsx area. Keyboard/gamepad left-right + confirm; touch targets of at least 48 px; one row at 640x360. Guests see 'Poziom: Trudny'. The start button stays the only yellow action. ui.click cue reused. pl.difficulty strings. Coordinate with the UI cluster (Lobby.tsx). *Done when:* e2e/multiplayer.spec: host picks Trudny, guest roster shows it, briefing shows the run's star thresholds (desktop and mobile projects); lint:design green
- **S7-A14 — Progress and endless leaderboard per difficulty** (M; depends on S7-A10). Client progress v2 {difficulty:{levelId:stars}} with v1 -> normal migration; unlock uses the best stars across difficulties; endless best run per difficulty; session.ts records levelEnd.difficulty. Server: Drizzle column + index + generated migration, recordLeaderboardEntry difficulty, leaderboard query/entry schema difficulty. Coordinate with the server cluster. *Done when:* progress.test migration and unlock cases; db.test stores difficulty; api.test difficulty=hard filters and the default is normal; green
- **S7-A15 — Content l0 Makieta: write 7 stories (IS 4, archive 3) and convert to bag** (L; depends on S7-A08). 7 new l0 stories pinned to imageSearch (4) and archive (3), about 1/3 true, all 3 stamps each, reviewed:false. l0-greybox.json gets bag {firstAtS 3, gapS 18, lastSpawnS 175, deadlineS 75/90/50, starShares {0.5,0.8}}, pool = 17 ids, schedule/stars removed. Update the greybox content tests. *Done when:* validate:content shows no bag errors or pinned warnings for l0; checks.test greybox expectations adapted (preview max/thresholds through starThresholds); green
- **S7-A16 — Content l1 Burza: write 5 imageSearch-only stories and convert to bag** (M; depends on S7-A08). 5 new pinned imageSearch stories (2 stamps each). bag {4, 22, 312, 55/60/40, starShares {0.55,0.85}}, pool 20. Update the level 1 content tests. *Done when:* validate:content clean for l1 on all difficulties; level 1 tests adapted; green
- **S7-A17 — Content l2 Wybory: write 3 imageSearch-only stories and convert to bag** (M; depends on S7-A08). 3 new pinned imageSearch stories. bag {4, 24, 340, 55/60/45}, pool 18. The l2 checks from l2-wybory.test (publishWithContext share) move to pool-based assertions. *Done when:* validate:content clean for l2; tests adapted; green
- **S7-A18a — Content l3 Afera: write 6 stories (IS 4, SR 2)** (L; depends on S7-A08). 6 new l3 stories pinned to imageSearch (4) and sourceRegistry (2), with 4 stamps each (IS, SR, archive, phone), reviewed:false. Not yet scheduled, so a 'not scheduled' warning is acceptable until A18b. *Done when:* Stories validate (schema, typography, techniques); green
- **S7-A18b — Content l3 Afera: write 4 archive-only stories and convert to bag** (M; depends on S7-A18a). 4 new archive-pinned stories. bag {4, 24, 340, 60/60/45}, pool 25. Events unchanged. *Done when:* validate:content clean for l3 (pinned 4/4/4/4); green
- **S7-A19a — Content l4 Zdrowie: write 5 stories (archive 4, phone 1)** (M; depends on S7-A08). 5 new pinned stories with 4 stamps each. *Done when:* Stories validate; green
- **S7-A19b — Content l4 Zdrowie: write 4 stories (SR 2, phone 2), mark multi-stamp, convert to bag** (M; depends on S7-A19a, S7-A04). 4 new pinned stories. requiredStamps 2 on l4-raport-pielegniarek and l4-cytat-dyrektorki. bag {4, 24, 340, 55/55/40}, pool 24. The outage event stays. *Done when:* validate:content clean for l4 (pinned SR 4, archive 4, phone 4, DL 6); solvable.test passes the 2-stamp stories; green
- **S7-A20a — Content l5 Deepfake: write 3 transcript-only and 3 metadata-only stories** (M; depends on S7-A08). 6 new stories pinned to the new Stenogram and Metadane stations, with stamps for all 7 l5 stations. Needs cluster B: station kinds, stamps.max raised, l5 layout and stamps for the new stations on existing stories. *Done when:* Stories validate against the l5 station list; green
- **S7-A20b — Content l5 Deepfake: write 1 imageSearch story, mark multi-stamp, convert to bag** (S; depends on S7-A20a, S7-A04). 1 new IS-pinned story. requiredStamps 2 on l5-nagranie-podatek (phone+AI) and l5-wolne-tempo (IS+archive). bag {4, 24, 340, 60/60/45}, pool 22 (retune gap after the map grows). *Done when:* validate:content clean for l5 (every bag station pinned at least 3); green
- **S7-A21a — Content l6 Atak: write 3 map-only and 3 other-media-only stories, plus the third proof for the hashtag story** (M; depends on S7-A08). 6 new stories pinned to Mapa and Inne media, with stamps for all 8 l6 stations. Add a decisive Inne-media stamp to l6-hashtag-12-to-koniec. Needs cluster B kinds and the l6 layout. *Done when:* Stories validate; green
- **S7-A21b — Content l6 Atak: write 5 stories (IS 2, archive 3)** (M; depends on S7-A21a). 5 new pinned stories with 8 stamps each. *Done when:* Stories validate; green
- **S7-A21c — Content l6 Atak: write 5 stories (phone 3, DL 2), mark multi-stamp, convert to bag** (M; depends on S7-A21b, S7-A04). 5 new pinned stories. requiredStamps 2 on l6-apel-mieszkancow and l6-sondaz-pracowni, 3 on l6-hashtag-12-to-koniec. bag {4, 27, 382, 55/55/40}, pool 31. Events unchanged. *Done when:* validate:content clean for l6 (all 7 bag stations pinned at least 3); endless decks for the new stations at least ENDLESS_MIN_DECK; green
- **S7-A22 — Balance harness: difficulty, bag runs, multi-stamp bot, retry model, station load** (M; depends on S7-A08, S7-A09, S7-A04, S7-A06, S7-A02). game.ts Scenario/levelScenario/endlessScenario via prepareRun with tuning; RunResult difficulty and stationBusyShare. bot.ts: multi-stamp plan/verdict, tuning in workDurationMs, minigame time limit per difficulty, DIFFICULTY_FAIL_FACTOR and RETRY_FAIL_FACTOR (models.ts). jobs.ts/run.ts --difficulty; report.ts station-load table and the per-difficulty monotonic intent check. *Done when:* bun run balance --levels l1-burza --seeds 4 --difficulty easy,normal,hard,expert completes and prints the station-load table; deterministic for a fixed seed; green
- **S7-A23 — Balance pass and documentation** (L; depends on S7-A22, S7-A15, S7-A16, S7-A17, S7-A18b, S7-A19b, S7-A20b, S7-A21c, S7-A05, S7-A12). Run the full matrix on 4 difficulties. Tune DIFFICULTY, bag gapS/deadlineS/starShares and BAG_FLEX_CHANCE within constants/level JSON. Rewrite docs/balance.md. Update design-document.pl.md (loop, scoring, stars rule, campaign bag, Poziomy trudności). Stage 7 section and Decision log rows in implementation-plan.md. Sweep the glossary and content-authoring. *Done when:* Intent checks pass on normal (balance.md targets) and are monotonic across difficulties; station-load spread (max/min busy share) on l3 lower than before the bag; docs merged; bun run check green

## Risks

- Content volume: the recommended 57 new stories (minimum 30 to avoid repeats at Expert), each with a stamp for every station of its level (up to 8 on l6) and a full debrief, all reviewed:false. Supervisor review is the bottleneck. l5/l6 conversions are blocked on cluster B (new station kinds, stamps.max(6) -> 10, 24x14 layouts).
- Protocol coordination: several clusters change protocol.ts, entities.ts and constants.ts on one branch. Agree on a single PROTOCOL_VERSION=3 bump and serialise merges of S7-A03, S7-A10 and S7-A11 with the versus/spectator and UI clusters. Each wire change must update every fixture in the same commit to keep `bun run check` green.
- Bag fairness is only as good as the pinned counts. Cluster B adding decisive new-station stamps to existing pinned stories turns them into flex stories and can drop a station below its target. The validator catches it, but late content edits can turn a level red.
- Randomised campaign runs lose the hand-curated pacing (tutorial-like openers, urgent folders late). The soft constraints (BAG_OPENING_SLOTS, BAG_MULTI_STAMP_MIN_SLOT) only approximate it, and the true share varies per run (hypergeometric, sd about 1 story).
- Star thresholds and max score now vary per run. Players comparing runs may read this as unfair unless the results/briefing UI explains the 55 %/80 % rule. Progress per difficulty also splits star tracking.
- Level type split (levelFileSchema vs resolved levelSchema): consumers of LEVELS/getLevel see a preview schedule (seed 0, normal), not the real run. Folder counts in the lobby or contest maps differ from what is played on other difficulties.
- Difficulty numbers are guesses until S7-A23. Expert (-1 mistake, 15 s minigames, x2 lockout, x1.5 penalties, +25 % folders) may be brutal. Easy spawns fewer folders and clamps late deadlines.
- Client-enforced minigame limits (time, mistakes, reveal) remain non-authoritative. A modified client can ignore them (accepted for a classroom game).
- Changing endless RNG streams and the draw algorithm changes every endless run for a given seed. Existing endless tests that rely on 'uses the whole pool' must be rewritten.
- Multi-stamp folders double station demand per folder. Combined with outages (l4/l6 dataLibrary, l5 aiScanner) a 2-proof folder can stall until the outage ends. The +20 s per extra proof only partly compensates.
- The workDurationMs signature, SimContext.tuning and GameState fields are also edited by the roles cluster (generalist factor, Druga szansa lockout removal, Ratownik rescue in folders.ts), with merge-conflict risk in stations.ts/folders.ts/desk.ts.
- The retry memory for Kartoteka circles is per client. A teammate who retries sees the same card but not the circles, and a page reload loses it.

## Open points (defaults chosen)

- Partial proof outcome: default is outcome 'wrongJustification' with reason 'incompleteProof' (half base points, no speed or multi-stamp bonus, 0 credibility); citing a non-justifying stamp is 'weakProof'.
- Folder-card progress: default shows the count of collected justifying stamps 'have/N' only when co-dalej hints are effectively on; otherwise (Expert or hints off) shows 'xN' only, so decisiveness is not leaked beyond what guidance already shows.
- Verdict with fewer collected stamps than required: allowed (cite all you have, amber 'Za mało dowodów: połowa punktów'). The verdict buttons enable when selected == min(N, collected).
- Multi-stamp extra time is added in the sim at spawn after the difficulty deadline scaling (not scaled by difficulty); generator deadlines are clamped to leave room for it.
- speedBonus boolean is represented as bonuses.speed > 0 (no duplicated field) in FolderResult and verdictResult.
- Star rule: global STAR_SHARES 55 %/80 % rounded to 5 points, with per-level overrides only for l0 (50/80) and l1 (55/85); these reproduce today's authored thresholds exactly.
- Hard/Expert add folders (smaller gaps up to the fixed lastSpawnS); Easy removes folders. Event times are not scaled, only event deadlines.
- l0 Makieta also uses the bag (opening slots prefer normal, single-proof stories). Alternative: keep l0 fixed for tutorial predictability by keeping its `schedule`; the schema supports both.
- Recommended content tier is TARGET (57 stories, real load balancing); MINIMUM (30) only prevents repeats. Multi-stamp picks (l4-raport-pielegniarek, l4-cytat-dyrektorki, l5-nagranie-podatek, l5-wolne-tempo, l6-apel-mieszkancow, l6-sondaz-pracowni, l6-hashtag-12-to-koniec with N=3) need supervisor confirmation.
- New station kind ids used here (transcript, metadata, map, otherMedia) are placeholders owned by cluster B.
- Difficulty can be changed only in the lobby phase (like selectLevel); replaying from results keeps the room difficulty.
- The run seed stays server-side (not in roomState) to avoid spoiling the folder sequence; a config.json feature flag to pin a seed for reproducible lessons is left to the config cluster.
- The correction event's credibility loss is still not represented in results; the results UI should show it as an event line (UI cluster).
- Stable seed applies to sourceRegistry only (decision 4); the peek-and-cancel exploit remains on other stations.
