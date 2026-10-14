# Stage 7 — integrated design

This plan merges the six cluster designs (A to F) into one sequence. Disputed points were checked against the code at HEAD `a1f456c`. This revision fixes every major gap and every minor gap from the critique (§0).

**How the work is organised**
- **Branch.** Everything lands on `claude/festive-thompson-yhfqfe` as small green commits. `bun run check` must pass before every push.
- **E2E tests.** `bun run test:e2e` (Playwright projects `desktop`, `mobile`, and `phone-small` from S7-12) runs for every task whose done-when names an e2e spec.
- **Task ids.** S7-01 to S7-106. Each task ticks its own row in the Stage 7 section of `docs/implementation-plan.md` in its own commit (AGENTS.md rule 8). S7-106 only checks that this was done.
- **Milestones.** Seven milestones. Each ends with a shippable build that is deployed: smoke test plus a 2-tab manual run on desktop and on a phone. Each milestone is also the unit for the protocol bump.

**Hard rules every task follows**
- Any deviation from the design doc or from a user decision gets a Decision log row in the same commit.
- Every new term goes into the glossary.
- Every new cue gets its `fx/cues.ts`, `a11y/captions.ts` and `agents/game-feel.md` rows.
- All Polish lives in `strings/pl.ts` and goes through `typeset()`.
- Every balance number lives in `constants.ts`. Operational limits live in `apps/server/src/limits.ts`.
- Every wire or content shape is a zod schema with inferred types.
- New content is `reviewed:false`.
- Any task that introduces new data or a new third party updates `docs/privacy.pl.md` in the same commit.

## 0. What this revision fixes

| Critique item | Fix | Tasks |
| --- | --- | --- |
| Versus seeds and rival matching keyed on `folderId`, which diverges between teams | Stable `spawnKey` on every folder and result (`s<scheduleIndex>`, `e<eventIndex>.<wave>`). Seeds, rivalResults and the spectator embargo are all keyed on it. Tested with a full belt during a botRaid. | S7-13, S7-80, S7-81, S7-89 |
| The spectator feed leaks verdicts in versus | Server-side embargo: until both teams have closed a `spawnKey`, the spectator topic gets `verdictMasked` (no verdict, outcome, reason or points). `verdictRevealed` follows. One token is exactly one member kind. | S7-78, S7-81, S7-91 |
| Room-list rate limit breaks classes | 2 s server cache; `ROOM_LIST_PER_MINUTE_PER_IP = 600` in `limits.ts`; client polls every 8 s, backs off on 429 and stops while the tab is hidden; test with 30 polls from one IP. | S7-83, S7-88 |
| 'Decisive' is not 'justifying' | One rule: a station *decides* a story when the story has a **justifying, non-hint** stamp from it. Used by bag, coverage, pinned counts and guidance. Schedule entries carry the slot station (`folder.bagStation`), which guidance prefers. Decisive-not-justifying stamps get a warning and are cleaned up in l4 and l6. | S7-20, S7-21, S7-23, S7-24, S7-33, S7-58 |
| l5 is short of stories; the stamp-count figure is wrong | l5 gets 8 new stories (Q 2, E 3, IS 1, A 1, SR 1). l6 numbers re-derived from the data: 13 new stories with explicit demotions. Stamp counts corrected (§6). | S7-59, S7-60, S7-61..63 |
| Ads have no legal gate for minors | `ads.mode` accepts only `'limited'` while the audience is minors. `ads.signOff {by, date}` is required by the schema before `ads.enabled: true`. The privacy text follows the active mode. | S7-67, S7-73, S7-75, S7-76 |
| Default flags expose minors | `roomBrowser` is off by default. Per-room 'Widownia' toggle, off by default. Spectator joins announced in game. Kick cooldown per browser `clientId`. Blocklist name filter for room names and listed host nicknames. | S7-67, S7-68, S7-78, S7-81, S7-82, S7-86 |
| TTS licence; wrong CREDITS path | Licence audit of the whole voice chain is step 1 and blocks generation. `voice-sprite.json` has a licence enum that rejects non-commercial licences. The game-feel asset rule is amended. Path is `apps/client/public/assets/CREDITS.md`. | S7-100, S7-103 |
| Minor items | `test:e2e` name; sign-magnitude penalty rounding; `rng` rename tests listed; per-view stores and a 250 ms spectator interpolation delay; design-rules §1.2 amendment; client leaderboard difficulty tabs; Decision log rows for every deviation; Kartoteka cancel resumes the remaining time; versus minimum solve time; S7-19 no longer needs S7-24; shell CSP and JSON escaping; one unfinished result per raid wave; hint-only stamps never count as proof; per-task status ticks; `how-to-play.pl.md` updates; room summary fields; gameMax tracking and runtime-fetched credits; LevelCard run count; Drizzle default; in-engine intro; endless layout wording. | see tasks |

Three of the deviations the critique listed are fixed in the design instead of only logged:
- **The menu pauses solo games** (S7-10).
- **The deciding station stays visible on Ekspert.** The desk result is a debrief of a closed folder, not a minigame reveal.
- **Role passives keep today's station lists.** Families gate Ekspertyza only, so the reporter does not get −40 % at sourceRegistry.

## 1. Binding cross-cluster decisions

### 1.1 Final identifiers

| Thing | Final id | Polish | Note |
| --- | --- | --- | --- |
| New stations | `geolocation` (G), `transcript` (Q), `crossCheck` (X), `metadata` (E) | Mapa, Stenogram, Inne media (sign: Media), Metadane | C's ids. The placeholders `map` and `otherMedia` are dropped. |
| Hint-only stations | `HINT_ONLY_STATIONS = ['aiScanner']`, `isHintOnly()` in `domain.ts` | — | Replaces the hard-coded checks in `checks.ts` and `endless.ts`. A hint-only stamp may be justifying, but it never counts toward the proof count (§3). |
| Deciding station | `decidingStations(story, levelStations)` = stations with a justifying, non-hint stamp | — | The only definition, used by bag, checkBag, pinned counts, solvability and guidance. |
| Folder identity | `folder.spawnKey`: `s<scheduleIndex>` or `e<eventIndex>.<waveIndex>` | — | Same in both versus teams. `folderId` (`f<n>`) stays the per-sim handle. |
| Station families | `image`: imageSearch, aiScanner, geolocation, metadata. `documents`: archive, dataLibrary, transcript. `sources`: sourceRegistry, phone, crossCheck. | Obraz, Dokumenty, Źródła | `STATION_FAMILY satisfies Record<StationKind, StationFamily>`. Gates **Ekspertyza only**. |
| Role passives | `ROLE_PERKS[role].fasterAt` (explicit lists): photoEditor imageSearch, aiScanner (+ geolocation, metadata in M4); archivist archive (+ transcript); reporter phone (+ crossCheck); managingEditor none; generalist ×0.8 everywhere; rescuer none | — | Replaces `ROLE_STATIONS` and `ROLE_WORK_TIME_FACTOR` in M3. Today's passives are unchanged. |
| Roles | photoEditor, archivist, reporter, managingEditor, `generalist`, `rescuer` | …, Wszechstronny, Ratownik | Optional and non-exclusive. |
| Abilities | `expertise`, `fieldCall`, `extendDeadline`, `secondChance`, `passFolder`; passive `rescue` | Ekspertyza, Telefon z terenu, Przedłużenie, Druga szansa, Podaj teczkę; Koło ratunkowe | Every cooldown starts at 60 000 ms and is retuned only from bot data (S7-46). |
| Difficulty | easy, normal, hard, expert | Łatwy, Normalny, Trudny, Ekspert | `DIFFICULTY` preset table. |
| Folder outcome | correct, wrongJustification, wrong, expired, unfinished | `pl.outcome` | — |
| Folder reason | correctNormal, correctImportant, correctWithContext, correctionFiled, weakProof, incompleteProof, publishedFake, rejectedTrue, contextOnTrue, publishedWithoutContext, rejectedContextStory, expired, expiredUnpenalized, unfinished | `pl.outcome` | — |
| Rooms | modes coop/versus; teams 0/1; member kinds player/spectator; visibility private/public; `spectatorsAllowed` | Razem / Na punkty; Kurier / Głos; Widownia | — |
| Feature flags | roomBrowser (default **false**), versus, spectators, intro (default true) | — | `config.json` via `RegistryOptions.settings()`. |
| Accessories | none, scarf, bowTie, pressBadge | — | M7. |

### 1.2 Final input map

| Action | Keyboard | Gamepad | Touch | Lands |
| --- | --- | --- | --- | --- |
| Move / pick up / work / ping | WASD / E / Space / Q (unchanged) | stick / A / X / Y | joystick + 3 buttons | — |
| Role ability | R | RB (`PAD.rb = 5`) | 4th button in the empty grid cell | M3, S7-39 |
| In-game menu | Esc (only when nothing captures input and the tutorial card is inactive) | Start (`PAD.start = 9`) | menu button | M1, S7-10 |
| Station help in an overlay | H | Select (8) | '?' in the overlay header | M7, S7-95 |
| Ekspertyza in an overlay | R | RB | header button | M3, S7-41 |

`OverlayFrame` header order: title, `headerAction` (M3), '?' (M7), close.

### 1.3 Final HUD layout

These are the design-rules §1.3/§5 amendments, each made by the task that causes it:
- **Top-left pill** with time, points and credibility. One row on phones (S7-11). In versus it gains a rival segment (S7-89).
- **Folder queue**: at most 3 cards, plus one dashed ghost card ('next folder' or 'Taśma pełna') in a free slot (S7-09).
- **Top-right**: one menu button, replacing the tool buttons and room chip (S7-10).
- **Bottom-left role chip**: keyboard and gamepad only (S7-40).
- **Captions, banners and toasts** sit under the measured `--hud-band` (S7-11).
- **The §1.2 'no explanations in play' rule** is amended for the first-use station card only, which pauses the minigame clock (S7-95).

## 2. Protocol ledger (details in protocolPlan)

- `PROTOCOL_VERSION` bumps **once per milestone that changes the WebSocket wire**.
- The first wire-changing task of the milestone makes the bump and asserts the literal in `protocol.test.ts`. Later wire changes in the milestone ride on it.
- Additive REST endpoints do not bump.

| Milestone | Version | Bumped by | Riders |
| --- | --- | --- | --- |
| M1 | v3 | S7-03 | S7-08, S7-10, S7-13 |
| M2 | v4 | S7-17 | S7-23 |
| M3 | v5 | S7-36 | S7-37, S7-43 |
| M4 | v6 | S7-48 | — |
| M5 | none | — | REST, HTML, config |
| M6 | v7 | S7-77 | S7-80..S7-83 |
| M7 | v8 | S7-105 | — |

## 3. Simulation model (consolidated)

### Context and tick order
- **`SimContext`** = `{dtMs, map, level, stories, tuning: SimTuning, absent?: ReadonlySet<string>, minSolveMs?: Readonly<Record<StationKind, number>>}`.
  - `tuning` (M2) is required; `testContext` defaults it to `NORMAL_TUNING`.
  - `absent` (M3) lists disconnected players.
  - `minSolveMs` (M6) is set by the registry in versus only (`MINIGAME_MIN_SOLVE_MS`, per station kind); absent means off. The sim keeps each round's open time in `GameState.minigameOpenedMs` (S7-80 Decision log).
- **Subsystem order** from M3: `stepAbilities` → `stepFolders` → `stepStations` → `stepDesk` → `stepPings` → `stepEvents` → `stepScoring`.

### State and result fields
- **`GameState`**
  - M1: `rng` becomes a constant `seed`; `minigameAttempts: Record<'spawnKey:kind', number>` is added.
  - M3: `deadlineExtensionUsed` is removed.
  - M6: station `minigameOpenedMs` is added (sim-only).
- **`Folder`**: `spawnKey` (M1), `bagStation?` (M2), `extendedMs?` (M3).
- **`CrewMember`** (M3) = `{role, workHeld, lastPingMs} & AbilityState`.
- **`FolderResult`** (final in M1): `{folderId, spawnKey, storyId, outcome, reason, verdict|null, scoreDelta, credibilityDelta, justifyingStampIds[0..3], requiredStamps 1..3, bonuses {speed, multiStamp, bossCall}, missedStampIds}`. `missedStampIds` is filled for errors only. Base points = `scoreDelta − Σ bonuses`.
- **`levelOutcome.lossReason`**: `'credibility' | 'score' | null`.
- **`spawnKey`**: the schedule spawner passes `s<index>`; `startFolderEvent` passes `e<eventIndex>.<waveIndex>`. A team with a fuller belt may get fewer raid folders, but the keys it does get match the other team's.

### Rules and formulas
- **Work time**: `round(STATION_WORK_MS[kind] × roleWorkFactor(role, kind) × tuning.workTimeFactor)`. `roleWorkFactor` reads `ROLE_PERKS` (`fasterAt` ×0.6; generalist ×0.8 everywhere).
- **Verdict**: cites are deduped; `valid = cited ∩ justifying ∩ folder.stamps`; `countable = valid` minus hint-only stamps; N = `requiredStampsOf(story)`.
  1. Wrong verdict → `wrong`, with the scaled penalty.
  2. Any cite outside `valid` → `weakProof`, half points.
  3. `countable < N` → `incompleteProof`, half points. Citing only the AI scanner is now `incompleteProof` with the line 'Skaner AI to tylko wskazówka'. This is a Decision log row.
  4. Otherwise → `correct`, with `bonuses.speed` and `bonuses.multiStamp = (N−1) × SCORE.multiStampBonus`. `missedStampIds = []`, which is the 'Zabrakło' fix.
- **Content rule**: `requiredStamps ≤` the number of justifying non-hint stamps from the level's stations. Enforced by `checkStoryFitsLevel`, endless `isSolvable` and `checkBag`.
- **Penalty scaling**: `scalePenalty(v, f) = Math.sign(v) × Math.round(Math.abs(v) × f)`, i.e. half rounds away from zero: −37.5 → −38.
- **Spawn deadline**: `elapsed + deadlineS × 1000 + (N−1) × MULTI_STAMP_EXTRA_DEADLINE_MS`.
  - Przedłużenie and Koło ratunkowe add 20 s and record it in `extendedMs`.
  - The speed bonus is measured against `deadlineMs − extendedMs`.
- **Minigame seed**: `minigameSeedFor(seed, spawnKey, kind, attempt)` (FNV-1a mix in `sim/rng.ts`).
  - The attempt counter advances on failure or cancel, except at `MINIGAME_STABLE_SEED_STATIONS = ['sourceRegistry']`.
  - `drawMinigameSeed` (M3) wraps it.
- **Lockout**: `MINIGAME_FAIL_LOCKOUT_MS × tuning.lockoutFactor`, or 0 after Druga szansa. Carried in `minigameFailed.lockoutMs`.
- **Versus minimum solve time** (M6): a `minigameResult` success that arrives less than `MINIGAME_MIN_SOLVE_MS[kind]` after the minigame opened counts as a failure. Off in co-op.
- **Unfinished sweep**: one `unfinished` result per folder still in play, but one per botRaid wave (mirrors `countedRaids`).

## 4. Run generation: the order of data transforms

`prepareRun` runs in `beginBriefing`, once per room; replays pass through the briefing, so every attempt differs.
1. **Run seed** (server, separate from the sim seed, never sent).
2. **Slot template** `bagSlotTimes(bag, difficulty)`.
3. **Station sequence** `stationSequence(bagStations(pool, level.stations))`: whole shuffled rounds over the stations that *decide* (§1.1) at least one pool story.
4. **Story matching** `matchStories` (Kuhn): distinct stories decidable at each slot's station.
   - Opening slots prefer single-proof, non-urgent stories.
   - Multi-stamp stories come only from slot `BAG_MULTI_STAMP_MIN_SLOT`; they are always flex and never pinned.
   - Each resolved schedule entry records its slot `station`. The sim copies it to `folder.bagStation`, and guidance suggests that station first among the justifying ones, so flex stories do not drift back to the busiest station.
5. **Deadlines** `bag.deadlineS[priority] × deadlineFactor`, clamped so `(N−1) × 20 s` still fits and never below `BAG_MIN_DEADLINE_S`.
6. **Stars** `starThresholds(maxLevelScore(run), starShares ?? STAR_SHARES)`, rounded to 5.
7. **At spawn**: `+(N−1) × 20 s`.
8. **Every tick**: tuning.
9. **At runtime**: abilities.

Endless uses the same steps with a bag over `ENDLESS_STATIONS` and per-station decks. Endless versus is capped at 600 s. Levels with an authored `schedule` (fixtures; l5/l6 until M4) go through `applyDifficulty`.

## 5. Versus fairness and spectator safety

- **Shared run and seed.** One run per room and one sim seed per match. Minigame seeds come from `(seed, spawnKey, kind, attempt)`, so both newsrooms get identical puzzles even when belts or raids diverge.
- **Per-team state.** Abilities, cooldowns and rescues are per team. Podaj teczkę stays inside the team. Difficulty is set per room. Uneven teams get no handicap.
- **No writes.** Versus never records progress or the leaderboard.
- **Endings.** Ties are a draw. Credibility 0 or a forfeit after the 60 s grace loses.
- **Spectator embargo.** In versus the spectator topic never carries a verdict, outcome, reason or points for a `spawnKey` until both teams have closed it (verdict or expiry) or the level ends. Until then it carries `verdictMasked`; `verdictRevealed` follows. FollowCard shows stamp icons only. Players get rivalResults only in `levelEnd`.
- **Accepted residual.** The live rival score total (user decision 8a) still moves when a rival scores, and the client bundle contains story answers, as it does today. Both go in the Decision log.
- **Client trust.** Minigame outcomes stay client-reported. Versus adds the minimum-solve-time check; the rest is accepted for a classroom game (Decision log, S7-93).
- **One member kind per token.** A second tab can still spectate, which is harmless because of the embargo.

## 6. Content

### Schema changes
- **M2:**
  - `storySchema.requiredStamps` (1..3, default 1).
  - `levelFileSchema` takes `schedule` + `stars` XOR `bag`. The resolved `levelSchema` always has `schedule` (entries may carry `station`) + `stars`.
  - `levelBagSchema`.
  - `checkBag`:
    - errors: coverage on every difficulty, unknown/foreign/overlapping ids;
    - warnings: pinned target, true share, deadline fit, star shares, idle stations, endless deck, and **decisive non-hint stamp not in justifyingStamps**.
  - `LEVELS`/`getLevel` return a resolved Normal preview (`BAG_PREVIEW_SEED = 0`).
- **M4:**
  - `stamps.max(STATION_KINDS.length)`.
  - Layout checks: sign spacing is a warning; an unreachable fixture or spawn is an error.
  - `ENDLESS_LAYOUT` (already 24×14) is re-laid with 10 stations.
  - Technique station lists and the alias `zdjecie-z-innego-miejsca`.

### New stories

The pinned target is `⌈Normal slots / bag stations⌉`, where a pinned story has exactly one deciding station and N = 1. `validate:content` (`checkBag`) is the arbiter in every content task. The counts below are derived from the current data.

| Level | Tasks | New stories | Bag stations | Pinned target | Multi-stamp stories |
| --- | --- | --- | --- | --- | --- |
| l0 | S7-27 | 7: IS 4, A 3 | IS, A, SR | 4 (10 slots) | — |
| l1 | S7-28 | 5: IS | IS, SR | 8 (15 slots) | — |
| l2 | S7-29 | 3: IS | IS, A, SR | 5 | — |
| l3 | S7-30/31 | 10: IS 4, SR 2, A 4 | IS, SR, A, P | 4 | — |
| l4 | S7-32/33 | 9: A 4, P 3, SR 2 (+ demotions on 4 stories) | SR, A, P, DL | 4 | raport-pielegniarek (SR+DL), cytat-dyrektorki (A+P) |
| l5 | S7-59/60 | 8: Q 2, E 3, IS 1, A 1, SR 1 | IS, SR, P, A, Q, E | 3 | wolne-tempo (IS+A), burmistrz-na-jachcie (SR+E). Not nagranie-podatek: AI is hint-only. |
| l6 | S7-61..63 | 13: G 3, X 3, IS 2, A 1, P 2, DL 2 | IS, A, SR, P, DL, G, X | 3 | apel-mieszkancow (A+P), sondaz-pracowni (SR+DL), hashtag-12-to-koniec (A+DL+X, N=3) |

- **Totals.** About 55 new stories with about 276 stamps. Separately, 74 new stamps go on existing l5/l6 stories (17 × 2 + 20 × 2).
- **Retargets and demotions: about 17.**
  - l5: wyciety-cytat → Q; +Q on wywiad-radio; +E on burmistrz and zdjecie-sprzed-lat.
  - l6: demotions on nagranie-zastepcy, wyrwany-cytat-radnej, dowoz-seniorow and frekwencja-w-poludnie; G/X added to fotka-urny, referendum, anonimowa-komisja and autobusy; hashtag gains X.
  - l4: decisive-not-justifying cleanup on ankieta-uczniow, raport-pielegniarek, darmowe-badania-wzroku and woda-z-kranu.
- **True share.** It stays within `CONTENT_TRUE_STORY_SHARE`, so about 1/3 of new stories are true.
- **Timing.** l5 and l6 keep authored schedules through M3 and switch to the bag in M4. Endless uses 6 stations in M2 and 10 in M4; each deck has at least `ENDLESS_MIN_DECK = 4` stories.

## 7. Client architecture touchpoints

- **One source per string family**:
  - `pl.outcome` for every outcome title, why-line and group label;
  - `pl.stationHelp[kind]` (M1, `satisfies Record<StationKind, …>`);
  - `pl.minigames.<kind>` for task, reasons, keys and pools.
- **`MinigameProps`** (M2) adds `folderId`, `difficulty`, `timeLimitMs`, `revealOnFail` and `resumeMs?` (the Kartoteka cancel resume).
- **Shared helpers**:
  - `hashText` in `shared/sim/rng.ts`;
  - the markdown-lite AST parser in `packages/shared` (server privacy page);
  - `match-stats.ts` as the only stats accumulator;
  - `name-filter.ts` with the blocklist (M6).
- **`GameView`** (M6, S7-85). Per-view instances of:
  - the game store;
  - the events store (`events/event-store.ts`);
  - ping bubbles (`pings/bubble-store.ts`);
  - guidance (`guidance/store.ts`, disabled for spectators);
  - render state;
  - particle pools;
  - camera shake;
  - feedback and cue context.

  No scene file imports `runtime` or a module-level store. The watch runtime uses `SPECTATOR_INTERPOLATION_DELAY_MS = 250`, a client constant equal to 2.5 spectator snapshot intervals.
- **Intro 'in-engine'** (S7-101): the gameplay scenes run the shared sim locally on a mini layout with scripted inputs, rendered through a GameView. There is never a video file.
- **Credits** are fetched at runtime from `/assets/CREDITS.md` (`apps/client/public/assets/CREDITS.md`), not imported with `?raw`.
- **`MenuFooter`** is created in M5 and extended in M7.
- **New cue ids**:

  | Milestone | Cues |
  | --- | --- |
  | M1 | `debrief.row`, `folder.beltFull`, `game.paused` |
  | M2 | `desk.unjustify` |
  | M3 | `ability.*`, `role.rescue` |
  | M4 | geolocation, transcript, crossCheck and metadata cues |
  | M6 | `versus.*`; `lobby.*` (modeSwitch, teamSwitch, hostChanged, kicked); `room.spectatorJoined` (lobby **and** in game); `spectate.follow`, `spectate.feed` |

  Ads have no cues. Intro voice lines are subtitled, so they are not cues.

## 8. Test-fixture churn rules

1. **Every wire change updates all of its fixtures in the same commit:** protocol, net, fx, `hud/dev-fixture`, the server tests, the balance bot and the contest fixtures.
2. **Shims:**
   - optional `SimStory.requiredStamps`;
   - `testContext` defaults `tuning`;
   - resolved `LEVELS`;
   - `inspect(code).game` stays an alias of team 0;
   - fixture folders get a `spawnKey` from a `testFolder` helper.
3. **Expected rewrites:**
   - S7-13: the seed-literal tests; `apps/server/src/rooms/endless.test.ts` 'gives every run its own schedule' (`game.rng` → `game.seed`, then the run seed after S7-23); `packages/shared/src/sim/stations.test.ts:188` (`run.state.rng`).
   - S7-22: the endless pool tests.
   - S7-64: the endless station count.
4. **New fixtures:** `__fixtures__/room-helpers.ts` (M6), story `m2` (M2), a thin bag pool (M2), a decisive-only bag fixture (M2), a belt-full raid fixture (M1).
5. **Client UI constants:** presentation timings, the spectator interpolation delay and the room-list poll interval.

## 9. Milestones

| Milestone | Goal | Tasks | Wire | Exit criteria |
| --- | --- | --- | --- | --- |
| M1 Quick wins | Zabrakło fix, results with reasons, next-folder timer, phone HUD + menu (solo pause) + camera, stable Kartoteka with resume, spawnKey, touch hints, client IP | S7-01..15 | v3 | Results show reasons, totals and points to the next star. Phone band ≤ 72 px. Kartoteka retry keeps its card and time. Deploy. |
| M2 Bag + difficulty + multi-stamp | Bag for l0–l4 and endless; 4 difficulties; multi-stamp; 34 stories; per-difficulty progress and leaderboard UI | S7-16..35 | v4 | `validate:content` clean on every difficulty; balance intents monotonic; station-load spread reduced. Deploy. |
| M3 Roles and abilities | 6 roles, 5 abilities + Koło ratunkowe | S7-36..47 | v5 | Abilities e2e on desktop and mobile; bot balance recorded. Deploy. |
| M4 New stations | 4 stations; l5/l6 at 24×14 on the bag; endless with 10 stations | S7-48..66 | v6 | Every minigame playable on every device at 640×360; perf and gameMax hold. Deploy. |
| M5 Config + ads + shell | `config.json`, shell + CSP, ads.txt, AdSense (off, gated), MOTD, privacy page | S7-67..76 | none | Smoke passes in both modes; no Google request without config; the config refuses ads without signOff. Deploy. |
| M6 Rooms + versus + spectators | Room browser (opt-in), lobby admin, versus, spectators with embargo | S7-77..93 | v7 | versus, spectate, room-browser and embargo e2e pass; perf passes. Deploy. |
| M7 Intro + help + about + profile | Station help, Jak grać, in-engine intro with an open-licensed Polish voice, O grze, profile, look | S7-94..106 | v8 | Intro autoplays once; help pauses the clock; docs consistent. Deploy. |

## 10. Docs and rules map

| Document | Updated by |
| --- | --- |
| `docs/implementation-plan.md` | S7-01 scaffold, then every task ticks its own row and logs its deviations; S7-106 verifies |
| `agents/design-rules.md` §1.3/§5 | S7-09, S7-10, S7-40, S7-89 |
| `agents/design-rules.md` §1.2 | S7-95 (first-use station card) |
| `agents/design-rules.md` §3 | S7-86 |
| `agents/design-rules.md` ad rules | S7-74 |
| `agents/glossary.md` | Every task with a new term; S7-48 fixes StationId → StationKind |
| `agents/game-feel.md` | Every cue task; S7-100 amends the asset-licence rule |
| `agents/content-authoring.md` | S7-21 (pools, deciding stations, pinned/flex, requiredStamps, the hint-only rule), S7-57 |
| `agents/platforms.md` | S7-10, S7-39, S7-91, S7-95 |
| `agents/architecture.md` | S7-76, S7-93 |
| `docs/design-document.pl.md` | S7-35, S7-47, S7-66, S7-93, S7-102, S7-106 |
| `docs/contest/how-to-play.pl.md` | S7-35, S7-47, S7-66, S7-93 |
| `docs/balance.md` | S7-35, S7-46, S7-66 |
| `docs/performance.md` | S7-56, S7-66, S7-90, S7-92, S7-96 |
| `docs/deploy.md` | S7-02, S7-71, S7-76, S7-93 |
| `docs/privacy.pl.md` | S7-26, S7-72, S7-75 (rewrite, text by ad mode), S7-82, S7-93, S7-95, S7-102, S7-104 |
| `docs/audio.md` | S7-42, S7-98, S7-100 |
| `docs/accessibility.md` | S7-11, S7-93, S7-106 |
| `apps/client/public/assets/CREDITS.md` | S7-100 (voice row; stale font rows) |



## Files in this folder

| File | Content |
| --- | --- |
| [`protocol.md`](protocol.md) | `PROTOCOL_VERSION` ledger and every wire change per milestone |
| [`tasks.md`](tasks.md) | Every S7 task with dependencies, scope and "done when" |
| [`risks.md`](risks.md) | Risks and resolved cross-cluster conflicts |
| [`review.md`](review.md) | Adversarial review of the first integrated draft (all blockers and majors fixed in this version) |
| [`cluster-a-core.md`](cluster-a-core.md) | Cluster A design (task ids inside are cluster-local, e.g. `S7-A12`; the binding ids are in `tasks.md`) |
| [`cluster-b-roles.md`](cluster-b-roles.md) | Cluster B design (task ids inside are cluster-local, e.g. `S7-A12`; the binding ids are in `tasks.md`) |
| [`cluster-c-stations.md`](cluster-c-stations.md) | Cluster C design (task ids inside are cluster-local, e.g. `S7-A12`; the binding ids are in `tasks.md`) |
| [`cluster-d-versus.md`](cluster-d-versus.md) | Cluster D design (task ids inside are cluster-local, e.g. `S7-A12`; the binding ids are in `tasks.md`) |
| [`cluster-e-config-ads.md`](cluster-e-config-ads.md) | Cluster E design (task ids inside are cluster-local, e.g. `S7-A12`; the binding ids are in `tasks.md`) |
| [`cluster-f-client-ux.md`](cluster-f-client-ux.md) | Cluster F design (task ids inside are cluster-local, e.g. `S7-A12`; the binding ids are in `tasks.md`) |

The cluster designs are the detailed reference (schemas, algorithms, copy proposals). Where a
cluster design and this file or `tasks.md` disagree, this file and `tasks.md` win.
