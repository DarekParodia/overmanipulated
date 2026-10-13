# Stage 7 — tasks

Binding task list. Status lives in
[`docs/implementation-plan.md`](../../implementation-plan.md) (Stage 7).

## M1 — Quick wins

<a id="s7-01"></a>

### S7-01 — Stage 7 plan scaffold, protocol ledger and shared naming decisions

*Size:* S · *Depends on:* —

**Scope**

Docs only.
- docs/implementation-plan.md: a 'Stage 7 — Feedback round' section with M1–M7 and every S7-xx task (title, dependencies, done-when, status column). Each later task ticks its own row in its own commit.
- Decision log rows:
  - the protocol ledger (one bump per milestone);
  - final ids (StationKind G/Q/X/E, roles, abilities, families gating Ekspertyza only, passives kept as explicit station lists);
  - the definition 'a station decides a story = the story has a justifying, non-hint stamp from it';
  - hint-only stamps never count toward the proof count;
  - spawnKey as the cross-team folder identity;
  - the run-generation order;
  - the run seed separate from the sim seed.

**Done when**

The Stage 7 section lists all 106 tasks with ids, dependencies and a status column. The Decision log rows exist. bun run check is green.

<a id="s7-02"></a>

### S7-02 — Real client IP behind the external TLS proxy

*Size:* S · *Depends on:* S7-01

**Scope**

- Caddyfile global servers block: trusted_proxies static {$TRUSTED_PROXIES:private_ranges}, trusted_proxies_strict, client_ip_headers X-Forwarded-For. reverse_proxy gets header_up X-Real-IP {client_ip}.
- docker-compose: TRUSTED_PROXIES on the web service; a row in .env.example.
- New apps/server/src/client-address.ts: X-Real-IP, else getConnInfo in try/catch, else 'unknown'.
- ws.ts uses it and drops its X-Forwarded-For parsing.
- limits.test switches to x-real-ip and adds an 'ignores X-Forwarded-For' case.
- docs/deploy.md: TRUSTED_PROXIES row.
- Decision log row.

**Done when**

client-address.test passes (X-Real-IP preferred, X-Forwarded-For ignored, 'unknown' without a server). Limits tests pass. caddy validate accepts the Caddyfile. bun run check is green.

<a id="s7-03"></a>

### S7-03 — Folder result and verdict contract v3 (reasons, bonuses, unfinished, loss reason, cite array, hint-only rule, Zabrakło data fix)

*Size:* L · *Depends on:* S7-01

**Scope**

Constants and types:
- constants.ts: MAX_REQUIRED_STAMPS = 3, PROTOCOL_VERSION = 3.
- domain.ts: HINT_ONLY_STATIONS and isHintOnly.
- sim/content.ts: optional SimStory.requiredStamps and requiredStampsOf().
- entities.ts: outcome += 'unfinished'; folderReasonSchema (14 values); folderBonusesSchema; FolderResult += reason, justifyingStampIds, requiredStamps, bonuses; LevelOutcome.lossReason.

Protocol:
- verdict command justifyingStampIds[1..3];
- verdictResult = folderResultSchema.extend;
- levelEnd gains lossReason, starThresholds and maxScore (maxLevelScore exported from @redakcja/content; null in endless).

Sim rules:
- desk.ts evaluateVerdict(story, folder, verdict, cited[], nowMs):
  - dedupes cites;
  - valid = cited ∩ justifying ∩ folder.stamps; countable = valid minus hint-only stamps;
  - any invalid cite → weakProof; countable < N → incompleteProof (citing only the AI scanner now lands here; Decision log row);
  - missedStampIds = [] on correct.
- wrongPenalty returns its reason.
- evaluateTagged returns correctionFiled and bonuses.bossCall.
- scoring.ts:
  - expiry reasons and lossReason;
  - an end-of-level sweep that records one 'unfinished' result per folder still in play, but one per botRaid wave (mirrors countedRaids).

Compile-only consumers: DeskOverlay sends [id]; StationLayer fallback; Record<FolderOutcome> maps; bonuses.speed; balance bot arrays; contest fixtures.

Update every protocol, net, fx and server fixture.

**Done when**

- desk.test:
  - a correct verdict citing one collected justifying stamp of a two-justifying story gives missedStampIds [];
  - folder [image] cited [image, source] gives weakProof;
  - a story justified by aiScanner + phone with cite [ai] gives incompleteProof, and [ai, phone] gives correct.
- protocol.test rejects [] and 4 ids.
- scoring.test:
  - lossReason 'credibility' / 'score' / null;
  - 2 unfinished results for 2 plain folders in play;
  - 1 unfinished result for a 3-folder raid wave in play.
- The l1 levelEnd carries maxScore 375 and thresholds {205,320}.
- bun run check is green.

<a id="s7-04"></a>

### S7-04 — Desk result screen and one outcome vocabulary

*Size:* M · *Depends on:* S7-03

**Scope**

- New stations/desk-result-model.ts deskResultLines with the lines proof, weakProof, tooFewProofs, hintOnly ('Skaner AI to tylko wskazówka'), decidedBy, correctVerdict, proofInFolder, notChecked. At most 2 lines, station names only. The lines are the same on every difficulty: this is a debrief of a closed folder, not a minigame reveal (Decision log).
- DeskOverlay ResultView: replace the 'Zabrakło' block and add bonus chips.
- StationLayer VERDICT_RESULT_SHOW_MS {good 4000, bad 6500}.
- hud-model toast titles by reason.
- New pl.outcome and pl.desk.result. Delete pl.desk.missed, pl.desk.outcomes, pl.results.outcomes, the pl.hud.toast titles and pl.debrief.missed.
- Glossary row 'Powód wyniku'.

**Done when**

No 'Zabrakło' remains in pl.ts. The desk-result-model tests pass for every outcome, including hintOnly. Toast, desk and Kolegium share pl.outcome titles. Rejecting a misleading story shows 'Wystarczył kontekst'. bun run check is green.

<a id="s7-05"></a>

### S7-05 — Results model: totals, star progress, loss reason, per-folder cards, reveal plan

*Size:* M · *Depends on:* S7-03

**Scope**

- New apps/client/src/debrief/results-model.ts:
  - resultTotals (outcome rows; speed, proofs and boss bonus rows; an 'Inne' row when results were capped);
  - starProgress;
  - lossReasonOf;
  - kolegiumCards (per folder in campaign and versus, grouped per story in endless);
  - revealPlan (REVEAL_PROGRESS_MS 300, REVEAL_ROW_MS 140).
- It replaces debriefCards. Update debrief-model.test and the hud/dev-fixture levelEnd.

**Done when**

Literal tests pass:
- totals of the design fixture = 15;
- starProgress(305, true, 2, {205,320}, 400) gives missing 15 and shares 51/80;
- revealPlan({stars:2, rows:3, marks:2}) = [520, 940 | 1620 | 1920, 2060, 2200 | 2460, 2840];
- Σ rows = Σ scoreDelta.

<a id="s7-06"></a>

### S7-06 — Results summary: loss lede, star captions, points to next star, thresholds explainer, totals table, phone page 0

*Size:* M · *Depends on:* S7-05

**Scope**

- New ResultsSummary (desktop column; the phone Kolegium 'Podsumowanie' page via a lead prop) with:
  - star captions;
  - 'brakuje X pkt' / 'Komplet gwiazdek!' / 'Gwiazdki są tylko za wygraną';
  - a 'Skąd te progi?' details block (shares of the run maximum);
  - the 'Za co punkty' totals table with useRolledNumber.
- Ribbon lede by lossReason.
- useReveal driven by revealPlan.
- Cue debrief.row: ui tick, haptic, caption skip, game-feel row.
- Phone CSS.

**Done when**

Screenshots at 1366x768 and 640x360 show the captions, the progress line and the totals. Reduced motion shows everything at once, and any key finishes the reveal. captions.test passes. bun run check is green.

<a id="s7-07"></a>

### S7-07 — Kolegium per folder: reason line, credibility chip, deciding proof, unfinished folders

*Size:* M · *Depends on:* S7-04, S7-05

**Scope**

- DebriefCard head: title by reason, points and credibility chips, a why-line with bonus suffixes.
- 'Dowód, który rozstrzygał' (wskazany / w teczce / nie sprawdzono) only when outcome !== 'correct'.
- Endless '×N' grouping.
- Unfinished cards last, with an hourglass.
- Blunder votes stay per story.

**Done when**

Campaign card points sum to levelEnd.score (test). Endless cards are grouped. Unfinished folders are listed. The proof section is hidden on correct folders. bun run check is green.

<a id="s7-08"></a>

### S7-08 — Next-folder timing and conveyor-full flag in snapshots

*Size:* S · *Depends on:* S7-03

**Scope**

- folders.ts:
  - nextScheduledSpawn(state, ctx) returns {atMs, sinceMs} | null (scheduled only; level events excluded);
  - conveyorBlocked(state, ctx).
- Snapshot += nextFolder and conveyorFull (rides on v3). registry.broadcastSnapshot fills them.
- game-store fields and the hud-model nextFolderState.
- Fixtures.

**Done when**

folders.test on TEST_LEVEL gives atMs 1000 → 5000 → 10000 → null, with sinceMs set to the previous spawn. conveyorBlocked is true when every C tile is full and an entry is due. registry.test: the first snapshot's nextFolder.atMs = first atS × 1000. bun run check is green.

<a id="s7-09"></a>

### S7-09 — Next-folder UI: ghost card, 'Taśma pełna', conveyor sign ring, guidance hint

*Size:* M · *Depends on:* S7-08

**Scope**

- hud/queue-model.ts: queueView and useQueueCapacity.
- FolderQueue ghost card (dashed, hourglass, seconds), a phone sideways variant and the empty state.
- scene/entities.ts conveyorIndicator ('incoming' | 'full').
- StationIndicators: a 'za N s' / 'Pełna' pill.
- next-step waitIn and conveyorFull hints.
- Cue folder.beltFull: caption 'Taśma pełna', game-feel row.
- Amend agents/design-rules.md §1.3/§5 (ghost card).
- Glossary rows Następna teczka, Taśma pełna.

**Done when**

The queue-model literal tests pass (width 300 → 3; 4 folders → 2 + '+2'; width 240 → 2 + '+1'), as do the conveyorIndicator and guidance tests. The ghost card shows on desktop and on a Pixel 7. Belt full turns orange. The design-rules amendment is in the same commit.

<a id="s7-10"></a>

### S7-10 — In-game menu button and sheet (with solo pause) replacing tool buttons and room chip

*Size:* M · *Depends on:* S7-01, S7-03

**Scope**

- hud/GameMenuButton.tsx: 'menu' icon, offline dot, data-hud-band.
- hud/GameMenu.tsx, a native dialog with:
  - 'Wróć do gry' (yellow);
  - Ustawienia;
  - Pełny ekran;
  - room code with copy and ping;
  - 'Wyjdź z redakcji' with a two-press confirm.
- Solo pause (user decision 13 says 'pause sheet'):
  - lobby action setPaused (rides on v3), accepted only in a co-op room with exactly one connected player and no spectators;
  - the registry skips stepping the room while paused, and clears the pause when anyone joins;
  - snapshot.paused; the sheet shows a 'Pauza' chip and cue game.paused.
- With 2+ people the sheet shows the orange 'Gra trwa dalej' chip and does not pause. Decision log row: a shared co-op sim cannot pause for one player.
- input/menu-button.ts: Esc when input is not captured and the tutorial card is inactive; PAD.start = 9 on the rising edge.
- GameScreen drops the tool buttons and RoomChip.
- Amend design-rules §5; add a platforms.md row.
- e2e (bun run test:e2e): desktop leave via the menu; update the multiplayer spec.

**Done when**

Esc, Start and tap toggle the sheet, and movement is frozen while it is open. registry test: a solo room's elapsedMs does not advance while paused; a second join unpauses; a 2-player room rejects setPaused. Leaving needs two presses. e2e passes on desktop and mobile.

<a id="s7-11"></a>

### S7-11 — One-row phone HUD pill and measured HUD band

*Size:* M · *Depends on:* S7-10, S7-09

**Scope**

- Hud.module.css phone block: a row pill (19.5rem; 22.5rem in endless), inline tempo chip, credibility strip.
- New hud/hud-band.ts: pure bandBottom, the useHudBand store and the useHudBandMeasure ResizeObserver.
- GameScreen sets --hud-band.
- CaptionStack, EventBanners and VerdictToasts are offset by it.
- docs/accessibility.md.

**Done when**

At 640x360 the pill is ≤ 60 px and the band ≤ 72 px, and HUD numbers stay 30 px. Captions start below the band. The hud-band unit test passes. The left-handed layout is unchanged.

<a id="s7-12"></a>

### S7-12 — HUD-aware follow camera and 640x360 Playwright project

*Size:* M · *Depends on:* S7-11

**Scope**

- New scene/camera-framing.ts (computeFraming, placeCamera). Follow mode uses setViewOffset −inset/2 and clamps; fit mode clears it.
- CameraRig uses it.
- camera-framing.test covers every LEVELS layout plus ENDLESS_LAYOUT at 640x360 and 863x360. It is re-run in S7-57/58/64 for the 24x14 maps.
- Add a 'phone-small' project to playwright.config.ts, and e2e/phone-layout.spec.ts.
- Regenerate docs/contest/screenshots/pixel7.
- Decision log row superseding the 2026-10-09 camera row.

**Done when**

The framing test proves every conveyor tile and back-row sign projects below a 64 px band with the player at the belt. Inset 0 reproduces today's framing. phone-layout e2e (bun run test:e2e) is green on mobile and phone-small.

<a id="s7-13"></a>

### S7-13 — Folder spawnKey, per-folder minigame seeds and stable Kartoteka card (sim)

*Size:* M · *Depends on:* S7-03

**Scope**

- spawnKey (rides on v3):
  - folderSchema and folderResultSchema += spawnKey;
  - spawnFolderAt takes it: spawnFolders passes `s${scheduleIndex}`, startFolderEvent passes `e${eventIndex}.${waveIndex}`;
  - endless schedules likewise;
  - a testFolder helper for fixtures.
- shared/sim/rng.ts:
  - hashText (FNV-1a) moved from the client; dataLibrary.logic re-exports it;
  - minigameSeedFor(seed, spawnKey, kind, attempt).
- GameState.rng becomes a constant seed, plus minigameAttempts keyed 'spawnKey:kind'.
- stations.ts working → minigame uses the derived seed. The attempt counter increments on failure and cancel, except for MINIGAME_STABLE_SEED_STATIONS = ['sourceRegistry'].
- Export drawMinigameSeed.
- Rewrite the seed-literal tests, apps/server/src/rooms/endless.test.ts 'gives every run its own schedule' (game.rng → game.seed) and packages/shared/src/sim/stations.test.ts:188 (run.state.rng).
- Decision log rows: stable Kartoteka card; spawnKey derivation (versus fairness).

**Done when**

stations.test:
- sourceRegistry fail → retry gives the same seed; cancel → retry gives the same seed;
- another folder gives a different seed; an imageSearch retry gives a different one;
- two states with the same seed give the same seed for the same spawnKey whatever the order of station use.
events.test with the new belt-full raid fixture: state A starts a botRaid with 1 free tile less than state B; every spawnKey present in both maps to the same storyId and minigame seed, and later scheduled folders share keys. bun run check is green.

<a id="s7-14"></a>

### S7-14 — Kartoteka client: same card on retry, no reveal, circled fields kept, time resumes after cancel

*Size:* S · *Depends on:* S7-13

**Scope**

- New stations/minigames/retry-memory.ts, a non-persisted zustand store reset on gameStarted. It is keyed by seed and holds {circled, remainingMs}.
- sourceRegistry.logic initialState(card, remembered) restores circled flagged fields; mistakes and struck fields start fresh.
- SourceRegistry.tsx writes the memory on change and forgets it on success. It drops data-missed and the revealed state.
- After a cancel, the client minigame clock resumes from remainingMs (floor KARTOTEKA_RESUME_MIN_MS = 5000, a client UI constant). After a failure it restarts in full (the lockout is the cost). This closes the cancel-and-retry loophole.
- Strings failedSameCard and retryTask.
- Decision log row: memory and time resume are per client, like every minigame limit.

**Done when**

Logic tests pass: circles restored; a different seed is ignored; mistakes and struck fields reset; cancel at 15 s of 20 resumes at 5 s, and at 18 s resumes at 5 s (the floor). Manual 2-tab test: fail → lockout → the same card with circles kept and no reveal. bun run check is green.

<a id="s7-15"></a>

### S7-15 — Touch key hints and station help copy for the six stations

*Size:* S · *Depends on:* S7-01

**Scope**

- Fill pl.minigames.*.keys.touch for 6 minigames.
- New pl.stationHelp {title, kinds: Record<StationKind, {purpose, proves, steps per device, realWorld}>}, enforced with satisfies. This is the single source for lobby details, the help card, practice and contest STATION_PURPOSE.
- strings/plural.ts pluralPl replaces 3 inline copies.
- station-help.test.

**Done when**

Tests: every kind present; 2–3 steps per device; each step, purpose and proves line ≤ 8 words; touch hints non-empty. KeyHints render on touch in every minigame (640x360 screenshot). bun run check is green.

## M2 — Bag, difficulty, multi-stamp

<a id="s7-16"></a>

### S7-16 — Difficulty vocabulary, Stage-7 balance constants, pure difficulty helpers

*Size:* S · *Depends on:* S7-03

**Scope**

- domain.ts: difficultySchema, Difficulty, DIFFICULTIES.
- constants.ts:
  - DIFFICULTY presets, DEFAULT_DIFFICULTY, MINIGAME_MIN_MISTAKES;
  - MULTI_STAMP_EXTRA_DEADLINE_MS, MULTI_STAMP_FIRST_LEVEL, SCORE.multiStampBonus;
  - STAR_SHARES, STAR_THRESHOLD_STEP;
  - BAG_FLEX_CHANCE, BAG_OPENING_SLOTS, BAG_MULTI_STAMP_MIN_SLOT, BAG_MIN_DEADLINE_S, ENDLESS_MIN_DECK = 4.
- shared/src/difficulty.ts: simTuning, NORMAL_TUNING, minigameTimeLimitMs, mistakeLimit, failLockoutMs.
- Export Rng. Glossary rows. No wire change.

**Done when**

difficulty.test literals: 30000/20000/17000/15000; mistakeLimit(2,'easy') = 3, (2,'expert') = 1, (1,'easy') = 1; failLockoutMs 1500/3000/4500/6000. bun run check is green.

<a id="s7-17"></a>

### S7-17 — Sim tuning (work, lockout, penalties) and lockout on the wire (protocol v4)

*Size:* M · *Depends on:* S7-16

**Scope**

- SimContext.tuning becomes required; testContext defaults it.
- workDurationMs(state, playerId, kind, tuning).
- Lockout × lockoutFactor.
- scalePenalty(v, f) = Math.sign(v) * Math.round(Math.abs(v) * f), so a half rounds away from zero. Used by wrongPenalty, expiry and correction loss/recover.
- minigameFailed += lockoutMs; PROTOCOL_VERSION 4.
- StationHost uses event.lockoutMs.
- The server tick and the balance harness pass NORMAL_TUNING.

**Done when**

Unit tests:
- sourceRegistry work 4000 / 3200 (easy) / 5000 (expert); photoEditor imageSearch on expert 3000;
- lockout 6000 on expert;
- publishedFake −30/−38 on expert and −10/−13 on easy; expired −8/−8 on expert;
- scalePenalty(7.5→+8 with v=5,f=1.5) and (−7.5→−8);
- correction 30, recover 15.
protocol.test lockoutMs and literal 4 pass. bun run check is green.

<a id="s7-18"></a>

### S7-18 — Multi-stamp folders: content field, validation, bonus, spawn extra time

*Size:* M · *Depends on:* S7-16, S7-03

**Scope**

- storySchema.requiredStamps (default 1), with superRefine.
- checkStoryFitsLevel: error when requiredStamps exceeds the justifying non-hint stamps from the level's stations; warning below MULTI_STAMP_FIRST_LEVEL. Endless isSolvable applies the same rule.
- maxStoryScore includes the bonus.
- spawnFolderAt adds (N−1) × 20 s, event folders included.
- evaluateVerdict pays multiStamp using the countable rule from S7-03.
- Fixture story m2.
- l2-wybory.test becomes solvable.test over every level.

**Done when**

desk.test: m2 with both cited gives 35 / +5 and bonuses {5,10,0}; one cited gives incompleteProof 10; image+source gives weakProof 10. folders.test: N=2 at 1000 ms with deadlineS 60 gives 81000; N=3 gives 101000; a viral folder the same. checks.test errors for requiredStamps 2 on an aiScanner+phone story. bun run check is green.

<a id="s7-19"></a>

### S7-19 — Desk multi-select, folder-card evidence badge, multi-stamp guidance

*Size:* M · *Depends on:* S7-18, S7-04

**Scope**

- New stations/desk-model.ts: toggleEvidence, verdictReady, evidenceShortfall.
- VerdictView multi-select for keyboard/gamepad (focus jumps to publish when complete) and touch (numbered ticks, 48 px rows), with:
  - blocked state;
  - count chip;
  - amber 'Za mało dowodów';
  - aria status.
- Proofs-bonus chip.
- FolderCard evidenceBadge: have/N when the plain hints setting is on, ×N otherwise. S7-24 switches it to the effective-hints selector.
- next-step counts justifying stamps against requiredStamps.
- Cue desk.unjustify.

**Done when**

desk-model.test: verdictReady(['a'],2,1) = true; (['a'],2,2) = false; adding beyond N is blocked. The evidenceBadge and guidance multi-stamp tests pass. Manual check at 640x360 touch plus keyboard and gamepad in 2 tabs. bun run check is green.

<a id="s7-20"></a>

### S7-20 — Station bag core

*Size:* M · *Depends on:* S7-18

**Scope**

New packages/content/src/bag.ts:
- bagDrawer (replaces storyDrawer);
- decidingStations(story, levelStations): stations with a justifying, non-hint stamp, the one rule;
- bagStations; stationSequence;
- matchStories (Kuhn with flex and opening preferences; multi-stamp stories are always flex);
- assignStories with a fallback;
- bagSlotTimes; starThresholds;
- pinnedCounts (single deciding station and N = 1).
Fixture-based bag.test.ts, including a story whose only decisive non-hint stamp is not justifying.

**Done when**

bag.test:
- slots 12/15/16/18 with last values 320.8/340/328/330.4;
- 18 slots over 4 stations gives 5,5,4,4, each block a permutation;
- augmenting case {A:[IS], B:[IS,SR]} with [SR, IS] gives B → SR, A → IS;
- a decisive-not-justifying station is not counted as deciding;
- starThresholds with authored shares gives 205/320 (l1), 205/300 (l2, authored 206, rounded to 5), 240/350, 215/315, 240/350, 250/360, 120/190;
- deterministic per seed.
bun run check is green.

<a id="s7-21"></a>

### S7-21 — Level file schema split, generateBagLevel, prepareRun and pool validation

*Size:* L · *Depends on:* S7-20

**Scope**

- schema.ts: levelBagSchema; levelFileSchema (schedule XOR bag) and levelSchema (resolved; schedule entries may carry station).
- index.ts: resolves bag previews (BAG_PREVIEW_SEED 0, normal); prepareLevelRun; exports maxLevelScore, maxStoryScore, levelStoryIds.
- generateBagLevel runs the ordered transforms and writes each slot's station into its entry.
- New run.ts: prepareRun, runSummary, applyDifficulty.
- checks.ts checkBag:
  - errors: unknown, foreign or overlapping ids; coverage on every difficulty via matching;
  - warnings: pinned target ⌈Normal slots / bag stations⌉; true share; deadline fit; star shares; idle stations; and 'decisive non-hint stamp is not justifying' (also for fixed levels).
- rawStoryIds, used and hostStations read bag.pool. review-lib uses levelStoryIds.
- agents/content-authoring.md: pools, deciding stations, pinned vs flex, requiredStamps, the hint-only rule.

**Done when**

A fixture bag level validates; a thin pool gives a coverage error; a decisive-not-justifying fixture gives the warning. Output is deterministic per seed and difficulty, and every resolved entry carries a station. Urgent 45 s becomes 59 s on easy. The clamp at slot 340 on a 420 s level with N=2 gives 60. Fixed levels are unchanged. bun run check is green.

<a id="s7-22"></a>

### S7-22 — Endless on the station bag with difficulty and separate RNG streams

*Size:* M · *Depends on:* S7-21

**Scope**

- generateEndlessLevel(seed, levels, stories, difficulty):
  - bagStations over ENDLESS_STATIONS (6 for now);
  - per-station decks via bagDrawer built with decidingStations, never repeating a story back to back;
  - interval and deadline scaled;
  - events on their own stream;
  - entries carry station.
- endlessStoryPool uses levelStoryIds.
- ENDLESS_MIN_DECK warning.
- Rewrite the endless tests.

**Done when**

endless.test: deterministic per (seed, difficulty); first deadline 104/80/68/60; schedule length easy < normal < expert; no consecutive repeats; every pool story is in some deck. Server endless tests pass. bun run check is green.

<a id="s7-23"></a>

### S7-23 — Server run lifecycle, difficulty and bag station on the wire

*Size:* M · *Depends on:* S7-21, S7-17

**Scope**

- Protocol (rides on v4): setDifficulty; roomState.difficulty and run summary; levelEnd.difficulty; folderSchema.bagStation? (the sim copies the schedule entry's station at spawn).
- registry.ts:
  - Room.difficulty and Room.run;
  - setDifficulty: host only, lobby only, resets ready;
  - prepareRun at beginBriefing with a run seed separate from the sim seed;
  - the endless regeneration in setLevel/startLevel is removed;
  - tick ctx uses simTuning(difficulty);
  - levelEnd thresholds and maxScore from the run;
  - recordEndlessRun passes difficulty;
  - inspect() exposes difficulty and run.
- The endless 'own schedule' test moves to the run seed.
- The client app store keeps difficulty and run.

**Done when**

lobby/registry tests:
- host sets 'hard': broadcast, and ready resets; a guest gets notHost; ignored while playing;
- the briefing run equals runSummary(prepareRun(...));
- levelEnd carries difficulty and thresholds;
- a replay draws a new run seed;
- a spawned folder carries the bagStation of its entry.
bun run check is green.

<a id="s7-24"></a>

### S7-24 — Client difficulty rules: minigame time, mistakes, reveal, hints, bag-station guidance

*Size:* M · *Depends on:* S7-23, S7-14, S7-19

**Scope**

- MinigameProps += folderId, difficulty, timeLimitMs, revealOnFail (false for stable-seed stations and on Ekspert), resumeMs?.
- StationOverlay uses minigameTimeLimitMs and the S7-14 resume.
- Every minigame stores maxMistakes = mistakeLimit(base, d).
- Reveal gating in DataLibrary, AiScanner, ImageSearch and Archive.
- An effective-hints selector (setting && DIFFICULTY[d].hints) hides guidance on Ekspert and switches the FolderCard evidenceBadge to it (×N on Ekspert).
- next-step suggests folder.bagStation first when it is among the stations it would suggest anyway.
- The desk result is unchanged across difficulties.
- From S7-17: StationHost starts its local lockout estimate at failLockoutMs(d) (the event still sets the real length), and the HUD expiry toast (`expiredToast`) scales its deltas with scalePenalty(·, DIFFICULTY[d].penaltyFactor), because `folderExpired` carries no deltas.
- MinigameBench uses Normal defaults.

**Done when**

Minigame logic tests pass with an Expert limit of 1 mistake. A next-step test prefers bagStation. The evidenceBadge shows ×2 on Ekspert. A manual Expert run in 2 tabs shows a 15 s clock, no reveal and no 'co dalej' bubble. bun run check is green.

<a id="s7-25"></a>

### S7-25 — Lobby difficulty picker, run folder count and thresholds in the briefing

*Size:* S · *Depends on:* S7-23

**Scope**

- Four secondary chips next to LevelCard for the host; a read-only 'Poziom: Trudny' chip for guests.
- Keyboard and gamepad left/right; touch ≥ 48 px; one row at 640x360. Start stays the only yellow action.
- LevelCard shows roomState.run.folders when present (today it shows level.schedule.length, which is only the preview count).
- ui.click cue. pl.difficulty strings.
- The briefing shows the run thresholds and the share rule.

**Done when**

e2e multiplayer (desktop and mobile): the host picks Trudny; the guest sees it; the folder count and thresholds come from the run. lint:design is green.

<a id="s7-26"></a>

### S7-26 — Progress and endless leaderboard per difficulty (server and client)

*Size:* M · *Depends on:* S7-23

**Scope**

Client:
- Progress storage v2 {difficulty: {levelId: stars}}, migrating v1 into normal.
- Unlocks use the best stars across difficulties.
- Endless best per difficulty. session.ts records levelEnd.difficulty.
- LeaderboardDialog gets a difficulty Segmented control (default = the room's or last-used difficulty). use-leaderboard passes difficulty. endless-model tests are extended.

Server:
- Drizzle column leaderboard_entries.difficulty text().notNull().default('normal'), an index on (difficulty, score) and the generated migration.
- recordLeaderboardEntry stores difficulty; the query and entry schemas gain it.

Privacy line.

**Done when**

progress.test covers the migration and the cross-difficulty unlock. db.test: existing rows read back as 'normal'. api.test: difficulty=hard filters and the default is normal. A leaderboard dialog test switches tabs. bun run check is green.

<a id="s7-27"></a>

### S7-27 — Content l0 Makieta: 7 new stories and conversion to the bag

*Size:* L · *Depends on:* S7-21

**Scope**

- 7 new stories pinned to imageSearch (4) and archive (3): about 1/3 true, 3 stamps each, debrief/technique/realWorld, reviewed:false.
- l0-greybox.json bag {3, 18, 175, 75/90/50, starShares {0.5, 0.8}}, pool 17.
- Content tests.
- Decision log row: l0 on the bag; the tutorial is story-agnostic.

**Done when**

validate:content: no bag error and no pinned-target warning for l0 (target 4) on any difficulty. Training plays in 2 tabs with the tutorial working. bun run check is green.

<a id="s7-28"></a>

### S7-28 — Content l1 Burza: 5 imageSearch-only stories and conversion to the bag

*Size:* M · *Depends on:* S7-21

**Scope**

- 5 new stories pinned to imageSearch (2 stamps each).
- bag {4, 22, 312, 55/60/40, starShares {0.55, 0.85}}, pool 20.
- Level tests.

**Done when**

validate:content is clean for l1 on all difficulties (pinned target 8). bun run check is green.

<a id="s7-29"></a>

### S7-29 — Content l2 Wybory: 3 imageSearch-only stories and conversion to the bag

*Size:* M · *Depends on:* S7-21

**Scope**

- 3 new pinned imageSearch stories.
- bag {4, 24, 340, 55/60/45}, pool 18.
- The publishWithContext-share assertions move to the pool.

**Done when**

validate:content is clean for l2 (pinned target 5). bun run check is green.

<a id="s7-30"></a>

### S7-30 — Content l3 Afera part 1: 6 stories (imageSearch 4, sourceRegistry 2)

*Size:* L · *Depends on:* S7-21

**Scope**

6 new stories with 4 stamps each (IS, SR, A, P), reviewed:false. A 'not scheduled' warning is acceptable until S7-31.

**Done when**

The stories validate (schema, typography, techniques). bun run check is green.

<a id="s7-31"></a>

### S7-31 — Content l3 Afera part 2: 4 archive-only stories and conversion to the bag

*Size:* M · *Depends on:* S7-30

**Scope**

- 4 new stories pinned to archive.
- bag {4, 24, 340, 60/60/45}, pool 25.
- Events unchanged.

**Done when**

validate:content is clean for l3 with ≥ 4 pinned stories on each of IS, SR, A and P. bun run check is green.

<a id="s7-32"></a>

### S7-32 — Content l4 Zdrowie part 1: 5 stories (archive 4, phone 1)

*Size:* M · *Depends on:* S7-21

**Scope**

5 new pinned stories with 4 stamps each, reviewed:false.

**Done when**

The stories validate. bun run check is green.

<a id="s7-33"></a>

### S7-33 — Content l4 Zdrowie part 2: 4 stories, decisive-stamp cleanup, multi-stamp picks, conversion to the bag

*Size:* M · *Depends on:* S7-32, S7-18

**Scope**

- 4 new pinned stories (sourceRegistry 2, phone 2).
- Resolve the decisive-but-not-justifying stamps on l4-ankieta-uczniow (phone), l4-raport-pielegniarek (phone), l4-darmowe-badania-wzroku (archive, dataLibrary) and l4-woda-z-kranu (phone). Each is either rewritten as 'misleading' or added to justifyingStamps, chosen so the pinned counts hold.
- requiredStamps 2 on l4-raport-pielegniarek (SR+DL) and l4-cytat-dyrektorki (A+P).
- bag {4, 24, 340, 55/55/40}, pool 24. The outage event stays.

**Done when**

validate:content is clean for l4: pinned ≥ 4 on SR, A, P and DL, and no decisive-not-justifying warning. solvable.test passes for the 2-stamp stories. bun run check is green.

<a id="s7-34"></a>

### S7-34 — Balance harness: difficulty, bag runs, multi-stamp bot, retry model, station load

*Size:* M · *Depends on:* S7-21, S7-22, S7-18, S7-13, S7-17

**Scope**

- game.ts: scenarios go through prepareRun with tuning. RunResult += difficulty and stationBusyShare.
- bot.ts:
  - multi-stamp plan and verdict (never counts AI stamps as proof);
  - tuning in workDurationMs;
  - minigame limit per difficulty;
  - DIFFICULTY_FAIL_FACTOR and RETRY_FAIL_FACTOR;
  - verdict arrays;
  - prefers folder.bagStation.
- jobs.ts and run.ts --difficulty.
- report.ts: station-load table and the monotonic-intent check.

**Done when**

bun run balance --levels l1-burza --seeds 4 --difficulty easy,normal,hard,expert completes and prints the station-load table, deterministically. bun run check is green.

<a id="s7-35"></a>

### S7-35 — M2 balance pass and documentation

*Size:* L · *Depends on:* S7-34, S7-27, S7-28, S7-29, S7-31, S7-33, S7-19, S7-24, S7-25, S7-26

**Scope**

- The full matrix for l0–l4 and endless (6 stations) on 4 difficulties.
- Tune DIFFICULTY, bag gapS/deadlineS, STAR_SHARES overrides and BAG_FLEX_CHANCE.
- Measure the station-load spread. Add a duplicate of the busiest station only if it still dominates 3–4 player crews (user decision 2); log it.
- Docs:
  - rewrite docs/balance.md;
  - design-document.pl.md: Pętla, Punktacja (incl. the AI-not-proof rule), Kampania (bag), and new 'Poziomy trudności';
  - docs/contest/how-to-play.pl.md: scoring, multi-stamp, difficulty.
- Decision log rows.

**Done when**

Intent checks pass on Normal and are monotonic. The l1 and l3 station-load spread is lower than before the bag. The duplicate decision is recorded. Docs are merged. bun run check is green, and the M2 deploy smoke test passes.

## M3 — Roles and abilities

<a id="s7-36"></a>

### S7-36 — Ability contracts, crew state, role perks and station families (protocol v5)

*Size:* L · *Depends on:* S7-17, S7-23

**Scope**

- domain: abilitySchema, stationFamilySchema, abilityStageSchema, stampSourceSchema.
- constants:
  - STATION_FAMILY for 6 kinds (Ekspertyza only);
  - RolePerk/ROLE_PERKS for 4 roles, with fasterAt lists identical to today's ROLE_STATIONS (photoEditor IS+AI, archivist A, reporter P) and factor 0.6;
  - ABILITY (all cooldowns 60000), RESCUE_ADD_MS, ABILITY_FIRST_READY_MS;
  - delete ROLE_STATIONS and ROLE_WORK_TIME_FACTOR;
  - PROTOCOL_VERSION 5.
- entities: abilityStateSchema; folder.extendedMs.
- protocol: useAbility, snapshot.crew, 'ability' and 'folderRescued' events, stampApplied.via. extendDeadline stays until S7-37.
- state.ts CrewMember. New sim/roles.ts (roleWorkFactor). Server snapshot crew.
- Client compile fixes, cues/captions for the new events, contest cards.
- Glossary and Decision log rows (passives unchanged; families only gate Ekspertyza).

**Done when**

protocol.test parses useAbility, crew, ability, folderRescued and via; literal 5. roles.test: photoEditor imageSearch 2400, reporter phone 3600, reporter sourceRegistry 4000, archivist dataLibrary 5000. The sim ignores useAbility. bun run check is green.

<a id="s7-37"></a>

### S7-37 — stepAbilities: Przedłużenie, Koło ratunkowe, Telefon z terenu; remove the old extension

*Size:* L · *Depends on:* S7-36

**Scope**

Sim:
- sim/abilities.ts:
  - abilityPreview;
  - pickExtendTarget (the team's folder with the least time left);
  - extendFolders (a whole raid wave);
  - useAbility dispatch, progressFieldCalls, rescueCarriedFolders.
- stepAbilities runs first.
- desk.ts: delete canExtendDeadline and the extendDeadline handler; the speed bonus uses deadlineMs − extendedMs.
- Delete deadlineExtensionUsed, the extendDeadline command and the deadlineExtended event.

Client: delete deadline-extension.ts, the DeskOverlay EXTEND slot and the pl.desk.extend* strings; the cue becomes ability.extendDeadline.

Bot: the press is gated by the preview.

Decision log row: '+20 s to any folder' is resolved as an auto-picked target that the HUD chip previews via data-ability-target (S7-40), because R/RB/one touch button cannot pick a folder quickly.

**Done when**

abilities.test cases 1–6, 8, 11 and 12 pass. registry.test: f1 deadline 93000 → 113000 and readyAt = elapsed + 60000. Grep finds no extendDeadline or deadlineExtensionUsed. bun run check is green.

<a id="s7-38"></a>

### S7-38 — Sim: Ekspertyza, Druga szansa, Podaj teczkę

*Size:* M · *Depends on:* S7-37, S7-13

**Scope**

- abilityPreview rules for expertise (STATION_FAMILY), secondChance and passFolder.
- pickPassTarget: nearest free teammate within 6 tiles, not operating, not in ctx.absent; ties by join order.
- APPLY handlers.
- stations.ts:
  - armed Ekspertyza consumed at working → minigame;
  - armed Druga szansa consumed on failure (lockout 0; reopen via drawMinigameSeed, so Kartoteka shows the same card);
  - immediate variants.
- stepStations returns crew. The registry fills ctx.absent.

**Done when**

abilities.test cases 7, 9, 10 and 13 pass. The stations and determinism tests stay green. bun run check is green.

<a id="s7-39"></a>

### S7-39 — Ability input: R / RB / touch press, nav intent, runtime send, controls help

*Size:* M · *Depends on:* S7-36, S7-10

**Scope**

- KEY_BINDINGS.ability = ['KeyR']; PAD.rb = 5; PadReading.ability.
- input-manager latch and touchInput.pressAbility.
- ui-nav 'ability' intent; menu-nav passes it on.
- runtime.ts sendCommand: a press sends, or plays the local ability.denied cue.
- settings-model rows; 4th TouchPreview button.
- agents/platforms.md row.

**Done when**

Unit tests for KeyR, button 5, NAV_KEYS.KeyR and the settings rows. R in a dev room sends useAbility. bun run check is green.

<a id="s7-40"></a>

### S7-40 — HUD ability chip, touch ability button, folder-card marks, design-rules amendment

*Size:* M · *Depends on:* S7-38, S7-39, S7-11

**Scope**

- apps/client/src/abilities/: ability-view, use-ability, ability-model, ability-icons.
- AbilityChip: bottom-left, keyboard and gamepad only, clear of the HUD band and the guidance dock. It shows the preview target.
- AbilityButton: the 4th touch button, mirrored layout included.
- ui/ProgressRing.
- Icons retry, pass and lifebuoy.
- FolderCard data-extended, data-rescue and data-ability-target.
- ability.ready cue.
- Amend design-rules §1.3/§5 in the same commit.

**Done when**

ability-model.test (23 s, ring ≈ 0.617; calling 3 s, ring 0.5). Screenshots at 1366x768 and 640x360 (touch and mirrored) show no overlap. Reduced motion and no-flash are honoured. bun run check is green.

<a id="s7-41"></a>

### S7-41 — Overlays: Ekspertyza header action, StationHost round nonce, Druga szansa hint, desk intent

*Size:* M · *Depends on:* S7-38, S7-40

**Scope**

- OverlayFrame headerAction slot.
- StationOverlay: the Ekspertyza button and the 'ability' intent (settled before sending); skipsQueue reads ROLE_PERKS.
- StationHost roundNonce on the local minigameStarted.
- LockoutNote 'R/RB: Druga szansa' line, hidden when effective hints are off.
- DeskOverlay 'ability' intent for the managing editor.

**Done when**

Tests: the overlay reopens on a repeated seed (nonce); LockoutNote hides at lockoutMs 0. Manual: Ekspertyza stamps the folder; Druga szansa reopens the same Kartoteka card. bun run check is green.

<a id="s7-42"></a>

### S7-42 — Ability world feedback, clips, sounds and final cue catalogue

*Size:* M · *Depends on:* S7-38, S7-40

**Scope**

- AbilityMarkers (armed badge, call bubble, pass-target ring).
- Folders.tsx 450 ms pass arc that snaps under reduced motion.
- PlayerAvatar reactions; stopUpper; ABILITY_CLIPS.
- synth_placeholders.py abready, abpower, abthrow; regenerate the sprite and run measure.py.
- cueForEvent(localPlayerId) is null for a remote arm/disarm.
- game-feel rows; docs/audio.md.

**Done when**

fx.test covers every new event. The captions exhaustive check compiles. animation-polish passes. perf:budget is green with an unchanged draw-call count.

<a id="s7-43"></a>

### S7-43 — New roles Wszechstronny (generalist) and Ratownik (rescuer)

*Size:* L · *Depends on:* S7-38

**Scope**

- roleSchema += generalist, rescuer (rides on v5).
- ROLE_PERKS:
  - generalist: work factor 0.8 at every station, secondChance;
  - rescuer: passFolder, rescuesPerLevel 1.
- vocab.roles, abilityWhat and touch labels; RoleIcon; rig.ts accessories with unique vertex counts; 4 clips; contest ROLE_INFO; balance ROLES_BY_CREW.
- Glossary rows.

**Done when**

character.test finds 7 distinct vertex counts. animation-polish finds 6 unique fidgets and celebrations. icon-coverage passes. roles.test: generalist imageSearch 3200, phone 4800. The rescue, pass and second-chance tests run through the real roles. bun run check is green.

<a id="s7-44"></a>

### S7-44 — Lobby role picker for 6 roles + Bez roli with detail panel

*Size:* M · *Depends on:* S7-43, S7-25

**Scope**

- RolePasses: 7 native radios. Columns: 7 on desktop; 4 at ≤ 1000 px; 4 compact rows when max-height ≤ 520 px; 2 at ≤ 560 px.
- Detail panel: passive (station chips from fasterAt, filtered to the level), active ability with the device key, cooldown, family chips.
- Teammate dots.
- Pure role-summary.ts.
- Delete noEditor; add passiveNotHere / abilityNotHere.

**Done when**

role-summary.test: reporter on l1 gives passive and ability not useful; photoEditor on l4 gives both false. e2e pickRole works for Ratownik and Wszechstronny. Screenshots at 640x360 and 1366x768 pass design-rules §10.

<a id="s7-45"></a>

### S7-45 — Ability guidance hints and tutorial ability step

*Size:* M · *Depends on:* S7-40, S7-43, S7-24

**Scope**

- next-step 'ability' kind: an editor with a warned folder; a reporter heading for the phone; a generalist at a lockout.
- tutorial.ts 'ability' step and abilityUsed signal; skipAbilityStep without a role.
- Hidden on Ekspert through effective hints.
- pl strings.

**Done when**

next-step.test and tutorial.test pass with literal texts ('R: +20 s dla teczki'). The tutorial completes with and without a role. bun run check is green.

<a id="s7-46"></a>

### S7-46 — Balance bots with abilities, cooldown tuning, contest role cards

*Size:* M · *Depends on:* S7-38, S7-43, S7-34, S7-35

**Scope**

- bot.ts maybeUseAbility: extend, Ekspertyza, Druga szansa, fieldCall. Podaj teczkę is not modelled (documented).
- run.ts --roles presets mixed, rescue, generalists. RunResult abilities and rescues.
- Tune cooldowns away from 60 s only if targets are exceeded (Decision log).
- docs/balance.md.
- cards.ts: 6 cards on 2 A4 pages.

**Done when**

The report runs for all 3 presets with no stalls. balance.md is updated. The cards render to 2 pages. bun run check is green.

<a id="s7-47"></a>

### S7-47 — Roles and abilities: docs and e2e

*Size:* S · *Depends on:* S7-44, S7-45, S7-46

**Scope**

- design-document.pl.md role table (Premia, Zdolność); delete the 3-player rule; 'R to zdolność roli'.
- docs/contest/how-to-play.pl.md roles and abilities.
- Mark S4-04 superseded.
- Glossary abilities table.
- e2e/abilities.spec.ts: desktop editor R → cooling and data-extended; mobile Ratownik touch shows 'Podaj'.
- Regenerate the lobby and game contest screenshots.

**Done when**

Both e2e projects pass (bun run test:e2e). The docs match the code. The M3 deploy smoke test passes.

## M4 — New stations

<a id="s7-48"></a>

### S7-48 — Station kinds contract and every compile-enforced map (protocol v6)

*Size:* M · *Depends on:* S7-36, S7-15, S7-21

**Scope**

Shared and content:
- domain + geolocation, transcript, crossCheck, metadata; map.ts G/Q/X/E.
- constants:
  - STATION_WORK_MS 4000/5000/4000/4000;
  - the GEOLOCATION_*, TRANSCRIPT_*, CROSS_CHECK_* and METADATA_* blocks;
  - STATION_FAMILY rows;
  - ROLE_PERKS.fasterAt += geolocation and metadata (photoEditor), transcript (archivist), crossCheck (reporter);
  - PROTOCOL_VERSION 6.
- schema stamps.max(STATION_KINDS.length). checks.ts and endless.ts use isHintOnly.

Client: pl.vocab.stations and signs, stationShort, provisional pl.stationHelp, icons, STATION_ICON, SURFACE_HEIGHT, a temporary plainStation.

Tools: balance models, contest common.ts, review-lib.

Docs: glossary (StationId → StationKind), design doc station rows, Decision log (new passives).

**Done when**

parseLayout maps G/Q/X/E to geolocation-0 … metadata-0. checks.test accepts 10 stamps and rejects 11. icon-coverage covers 10. The protocol literal is 6. bun run check is green.

<a id="s7-49"></a>

### S7-49 — Fit the sun light and shadow box to the room

*Size:* S · *Depends on:* S7-01

**Scope**

- scene/sun.ts sunFrame(width, height) with SUN_OFFSET, SUN_MARGIN and SUN_TALLEST_PROP.
- SunLight.tsx (target at the room centre, inside the per-level group).
- GameCanvas uses it. sun.test.

**Done when**

sun.test: 20x12 gives about {12.65, 10.75}; 24x14 about {14.87, 12.42}. Shadows cover the room on High for l1, l6 and endless. The perf e2e passes.

<a id="s7-50"></a>

### S7-50 — Layout validation: station sign spacing and reachability

*Size:* S · *Depends on:* S7-21

**Scope**

- checks.ts STATION_SIGN_MIN_GAP_COLUMNS = 3 (warning).
- BFS from spawn 1: an unreachable fixture or spawn is an error.
- __fixtures__/broken.ts cases.

**Done when**

Every current level and endless validates with no new errors. The fixtures prove one warning and one error. bun run check is green.

<a id="s7-51"></a>

### S7-51 — 3D models for Mapa, Stenogram, Inne media, Metadane

*Size:* M · *Depends on:* S7-48

**Scope**

- Four builders in station-models.ts.
- Remove plainStation.
- station-models.test for 10 kinds: the folder area is clear above SURFACE_HEIGHT + 0.03, and the footprint is within ±0.55.

**Done when**

Each model is one merged mesh, distinct from aiScanner and readable from the game camera. The test passes. bun run check is green.

<a id="s7-52"></a>

### S7-52 — Minigame evidence helpers and the Metadane minigame

*Size:* M · *Depends on:* S7-48, S7-24

**Scope**

- minigames/evidence.ts: problemFromStamp, hashText re-export, shuffled, pick. sourceRegistry and dataLibrary use it with identical RNG consumption.
- metadata.logic, using mistakeLimit(METADATA_MAX_MISTAKES, d) and revealOnFail.
- Metadata.tsx and CSS.
- pl.minigames.metadata; final pl.stationHelp.metadata.
- Cues metadata.right / metadata.mistake.
- Register; data-answer on the root.

**Done when**

The existing sourceRegistry and dataLibrary tests pass unchanged. The metadata.test table and reduce cases pass. The minigame is playable in MinigameBench with keyboard, gamepad and touch at 640x360.

<a id="s7-53"></a>

### S7-53 — Stenogram (transcript) minigame

*Size:* M · *Depends on:* S7-52

**Scope**

- transcript.logic (variant rule, 4 lines, find and judge phases).
- Transcript.tsx (2x2 on phones).
- pl.minigames.transcript pools: fair ≥ 6, cut ≥ 6, absent ≥ 6, filler ≥ 12, settings ≥ 4.
- stationHelp; cues; register.

**Done when**

Unit tests: exactly one answer line for fair and cut, none for absent; the phase transitions; failure after 2 mistakes. Playable on all devices at 640x360. bun run check is green.

<a id="s7-54"></a>

### S7-54 — Inne media (crossCheck) minigame

*Size:* M · *Depends on:* S7-52

**Scope**

- crossCheck.logic: isIndependent, conclude, the outcome table, an asserting generator.
- CrossCheck.tsx (claim strip, 3+2 cards, 3 answers, 'kopia' reveal after the round).
- pl.minigames.crossCheck; stationHelp; cues; register.

**Done when**

The outcome table and conclude cases pass. 200 seeds give consistent results with 5 cards. One wrong answer fails. Playable on all devices at 640x360.

<a id="s7-55"></a>

### S7-55 — Mapa (geolocation) minigame with landmark glyphs

*Size:* L · *Depends on:* S7-52

**Scope**

- geolocation.logic: unique pairs; the match / otherDistrict / otherTown generator; reduce.
- landmarks.tsx: 10 token-only silhouettes.
- Geolocation.tsx: photo, caption chip, 4x3 district grid, 'Nie ma na mapie'.
- pl.minigames.geolocation; stationHelp; cues; register.

**Done when**

Unit tests: unique pairs, answer semantics, a decoy for otherTown, failure at 2 mistakes. Landmarks are told apart by shape. Tiles are ≥ 48 px at 640x360.

<a id="s7-56"></a>

### S7-56 — Complete minigame registry, minigame e2e, bundle check, contest shots

*Size:* S · *Depends on:* S7-53, S7-54, S7-55

**Scope**

- MinigameRegistry becomes a full Record<StationKind, Minigame>.
- e2e/minigames.spec.ts: the bench on desktop and at 640x360 for the 4 new kinds (≥ 48 px targets, no overflow, data-answer solve).
- Record the game-route gzip against BUDGET.gameMax (1.6 MB) in docs/performance.md. If it exceeds 90 % of the guard, lazy-load minigame components per kind with React.lazy in the registry.
- 4 contest shots; README 'dziesięć'.

**Done when**

A missing minigame is a compile error. e2e passes in both projects. perf:budget is green and the gameMax figure is recorded. bun run check is green.

<a id="s7-57"></a>

### S7-57 — l5 Głęboka podróbka: 24x14 room with Stenogram and Metadane, plus stamps

*Size:* L · *Depends on:* S7-51, S7-53, S7-50

**Scope**

One atomic commit (a station and its stamps land together).
- New layout; stations += transcript, metadata; briefing points.
- 34 new stamps (Q and E) on all 17 l5 stories.
- Retargets, each with justifyingStamps and debrief.tool rewritten:
  - wyciety-cytat: the decisive stamp becomes the transcript stamp;
  - wywiad-radio: +Q justifying;
  - burmistrz-na-jachcie: +E justifying;
  - zdjecie-sprzed-lat: +E justifying.
- The authored schedule and stars stay until S7-60.
- camera-framing test for the new layout.
- content-authoring.md rules for the new stations.

**Done when**

validate:content reports 0 errors. Every l5 story has stamps for all 7 stations. Sign spacing and framing pass. The level plays in 2 tabs with no placeholder minigame.

<a id="s7-58"></a>

### S7-58 — l6 Atak: 24x14 room with Mapa and Inne media, plus stamps and demotions

*Size:* L · *Depends on:* S7-51, S7-54, S7-55, S7-50

**Scope**

- New layout: back row I A R P, front row S L G X; stations += geolocation, crossCheck; briefing text.
- 40 new stamps (G and X) on all 20 l6 stories, event stories included.
- Multi-stamp groundwork: l6-hashtag-12-to-koniec gets a decisive, justifying crossCheck stamp as its third proof. l6-apel-mieszkancow stays archive + phone.
- Demotions (the stamp is rewritten as misleading or irrelevant):
  - nagranie-zastepcy: phone, giving pinned A;
  - wyrwany-cytat-radnej: phone, giving pinned A;
  - dowoz-seniorow: sourceRegistry, giving pinned P;
  - frekwencja-w-poludnie: dataLibrary plus its decisive-not-justifying archive stamp, giving pinned SR.
- Add justifying G or X stamps to fotka-urny, referendum-w-poniedzialek, anonimowa-komisja and autobusy-w-niedziele (flex).
- camera-framing test for the new layout.

**Done when**

validate:content reports 0 errors and no decisive-not-justifying warning on l6. Every l6 story has 8 stamps. botRaid count ≤ belt tiles. It plays in 2 tabs.

<a id="s7-59"></a>

### S7-59 — l5 new stories for Stenogram, Metadane, archive and sourceRegistry

*Size:* L · *Depends on:* S7-57

**Scope**

7 new l5 stories, 7 stamps each, with debrief/technique/realWorld, reviewed:false, about 1/3 true:
- transcript-pinned: l5-cytat-z-sesji, l5-wywiad-skrocony;
- metadata-pinned: l5-zdjecie-czytelnika, l5-film-z-montazu, plus one more;
- one archive-pinned and one sourceRegistry-pinned story, needed because burmistrz and zdjecie-sprzed-lat become flex or multi-stamp.

**Done when**

The stories validate. pinnedCounts on the l5 pool: transcript ≥ 3, metadata ≥ 3, archive ≥ 3, sourceRegistry ≥ 3. bun run check is green.

<a id="s7-60"></a>

### S7-60 — l5 conversion to the bag with multi-stamp picks

*Size:* S · *Depends on:* S7-59, S7-18

**Scope**

- 1 new imageSearch-pinned story (8 new l5 stories in total).
- requiredStamps 2 on l5-wolne-tempo (imageSearch + archive) and l5-burmistrz-na-jachcie (sourceRegistry + metadata). nagranie-podatek is not used, because its second proof would be the hint-only AI scanner (Decision log).
- bag {4, 24, 340, 60/60/45}; tune the gap for the larger map.
- Remove the authored schedule and stars.

**Done when**

validate:content shows no coverage error on any difficulty and no pinned-target warning for l5 (≥ 3 on all 6 bag stations). solvable.test passes. bun run check is green.

<a id="s7-61"></a>

### S7-61 — l6 new stories for Mapa and Inne media

*Size:* M · *Depends on:* S7-58

**Scope**

6 new stories, 8 stamps each, reviewed:false:
- geolocation-pinned: l6-most-zamkniety, l6-kolejka-do-lokalu, plus one more;
- crossCheck-pinned: l6-agencja-dementuje, l6-relacja-z-debaty, plus one more.

**Done when**

The stories validate. geolocation and crossCheck each have ≥ 3 pinned stories in the l6 pool.

<a id="s7-62"></a>

### S7-62 — l6 new stories for imageSearch and archive

*Size:* M · *Depends on:* S7-61

**Scope**

3 new stories, 8 stamps each: l6-plakat-sprzed-lat and one more imageSearch-pinned story; one archive-pinned story.

**Done when**

The stories validate. imageSearch ≥ 3 and archive ≥ 3 pinned in the l6 pool.

<a id="s7-63"></a>

### S7-63 — l6 phone and dataLibrary stories, multi-stamp picks, conversion to the bag

*Size:* M · *Depends on:* S7-62, S7-18

**Scope**

- 4 new stories (phone-pinned 2, dataLibrary-pinned 2); 13 new l6 stories in total.
- requiredStamps 2 on l6-apel-mieszkancow (A+P) and l6-sondaz-pracowni (SR+DL); 3 on l6-hashtag-12-to-koniec (A+DL+X).
- bag {4, 27, 382, 55/55/40}, tuned for the larger map.
- Events unchanged. Remove the authored schedule and stars.

**Done when**

validate:content is clean for l6: all 7 bag stations pinned ≥ 3; coverage holds on every difficulty; the true share is within CONTENT_TRUE_STORY_SHARE. solvable.test passes.

<a id="s7-64"></a>

### S7-64 — Endless mode with all 10 stations

*Size:* S · *Depends on:* S7-56, S7-22, S7-60, S7-63, S7-50

**Scope**

- Re-lay the existing 24x14 ENDLESS_LAYOUT with 10 stations (back row I A R Q E, front row P S L G X).
- ENDLESS_STATIONS = [...STATION_KINDS].
- The transcript, metadata, geolocation and crossCheck decks reach ENDLESS_MIN_DECK = 4. Add justifying stamps or 1–2 stories where needed and re-check the level pinned counts.
- Tests assert 10 stations. camera-framing test.

**Done when**

Endless starts with 10 stations in 2 tabs. The tests assert 10. There is no endless-deck warning. bun run check is green.

<a id="s7-65"></a>

### S7-65 — Technique cards for the new stations

*Size:* S · *Depends on:* S7-57, S7-58

**Scope**

techniques.json: station lists and detect texts on 11 cards (≤ 4 stations each), plus the alias zdjecie-z-innego-miejsca.

**Done when**

validateTechniques reports no errors and no new warnings. The encyclopedia shows the new stations.

<a id="s7-66"></a>

### S7-66 — M4 balance, performance and contest pass

*Size:* M · *Depends on:* S7-60, S7-63, S7-64, S7-49, S7-46

**Scope**

- bun run balance for l5, l6 and endless on 4 difficulties with the station-load table.
- Apply the duplicate-station rule.
- docs/balance.md.
- performance.spec.ts: an endless case; update docs/performance.md, including the gameMax figure.
- contest:build regenerates the l5/l6 maps and the station shots.
- Design doc campaign rows; docs/contest/how-to-play.pl.md stations.
- Decision log rows: 24x14, 8 stations on l6, stamps.max 10, HINT_ONLY_STATIONS, sun fit.

**Done when**

Endless on High stays within 150 draw calls on desktop, 100 on mobile and 100k triangles. perf:budget is green. Docs and contest artefacts are updated. The M4 deploy smoke test passes.

## M5 — Config, ads, shell

<a id="s7-67"></a>

### S7-67 — Shared public-config contract, ads legal gate and CSP nonce placeholder

*Size:* S · *Depends on:* S7-16

**Scope**

- packages/shared/src/csp-nonce.ts.
- public-config.ts:
  - publicConfigSchema;
  - feature flags with DEFAULT_FEATURE_FLAGS {roomBrowser: false, versus: true, spectators: true, intro: true};
  - ad schemas: ads.mode ('limited' is the only value accepted while ageTreatment is teen or child; limited ads do not use cookies or local storage), client, slots, ageTreatment;
  - motdSchema, hostnameSchema, DEFAULT_PUBLIC_CONFIG, normalizeHost, hostAllowed.
- Glossary. No WebSocket change.

**Done when**

public-config.test:
- defaults parse with roomBrowser false;
- ads enabled without a client is rejected; a non-limited mode with teen is rejected;
- normalizeHost('[::1]:3000') = '::1';
- hostAllowed('drkp.dev', ['bronsie.drkp.dev']) is false.
bun run check is green.

<a id="s7-68"></a>

### S7-68 — config.json loader with hot reload, signOff gate and registry settings()

*Size:* M · *Depends on:* S7-67, S7-23

**Scope**

- apps/server/src/config.ts:
  - strict schema with prefault;
  - ads.enabled: true requires ads.signOff {by, date} (supervisor/legal sign-off);
  - parseConfigText, applyOverrides, changedPaths, createConfigStore (fs.watch, 250 ms debounce), staticConfigStore.
- paths.ts. Optional env vars CONFIG_PATH, ADS_ENABLED, SHELL_HTML_PATH, PRIVACY_MD_PATH. ADS_ENABLED cannot bypass signOff.
- index.ts: exit 1 on an invalid file; reload on SIGHUP. startServer(env, options).
- RegistryOptions.settings(): hot maxRooms, rooms.defaultDifficulty, features.
- /api/health config meta.
- config/config.example.json; generated config.schema.json with a freshness test; config:check tool; .gitignore and .dockerignore.

**Done when**

config tests:
- literal defaults (maxRooms 300, teen, roomBrowser false, versus/spectators/intro true, defaultDifficulty normal);
- ads enabled without signOff is refused;
- an invalid or missing file at reload keeps the old config;
- watch and SIGHUP reload.
Existing server and smoke tests are unchanged.

<a id="s7-69"></a>

### S7-69 — GET /api/config and the client public-config store

*Size:* S · *Depends on:* S7-68

**Scope**

- Server public-config.ts: toPublicConfig, adsActiveFor, activeMotd, roomSettings. routes/api.ts .get('/config').
- Client: fetchPublicConfig via hc; store/public-config.ts (readEmbeddedConfig, refresh with a 60 s throttle, useFeature); refresh on boot.
- Vite dev and preview proxies for /ads.txt and /prywatnosc.

**Done when**

/api/config is schema-valid, ads-enabled only for configured hosts, and drops expired MOTDs. The client falls back to the defaults on a fetch failure (unit test).

<a id="s7-70"></a>

### S7-70 — Server-rendered HTML shell with config-driven CSP and ads.txt

*Size:* M · *Depends on:* S7-69

**Scope**

- vite.config html.cspNonce.
- shell/assets.ts.
- shell/render-shell.ts: nonce, verification meta, and the embedded config JSON serialised with <, U+2028 and U+2029 escaped as <,   and  .
- shell/csp.ts:
  - base CSP byte-identical to the Caddyfile;
  - in ads mode the nonce and 'strict-dynamic' go in script-src only;
  - style-src keeps 'unsafe-inline' (a nonce there would disable it and break React style attributes and AdSense);
  - Referrer-Policy is strict-origin-when-cross-origin in ads mode and no-referrer otherwise.
- routes/shell.ts: /, SPA paths and /index.html render the shell; /ads.txt; reserved paths and extension paths 404. Mounted last.
- tools/deploy/caddyfile.test.

**Done when**

Route tests:
- the ads host gets the strict-dynamic script-src with a nonce that matches the body and changes per request, and style-src has no nonce;
- other hosts get the base CSP;
- a MOTD containing '</script>' does not break the page;
- the Referrer-Policy differs per mode;
- /api/unknown is not HTML; ads.txt is text/plain.

<a id="s7-71"></a>

### S7-71 — Deploy wiring: Dockerfile, Caddyfile routing, compose, smoke test

*Size:* M · *Depends on:* S7-70, S7-02

**Scope**

- Dockerfile server stage copies dist/index.html and privacy.pl.md.
- Caddyfile: security_headers snippet with ? defaults (the server sets CSP and Referrer-Policy for shell responses); @static block; catch-all to the server; handle_errors 502–504 falls back to the static shell.
- compose: config mount and CONFIG_PATH. .env.example drops DOMAIN.
- smoke.ts: api/config, embedded config, CSP mode, nonce rotation, ads.txt not HTML, /prywatnosc, manifest.
- smoke.test runs in base and ads mode (ads mode uses a fixture config with signOff).

**Done when**

smoke.test passes in both modes. docker compose up --build plus bun run smoke --strict pass locally. Stopping the server still serves the menu shell (recorded).

<a id="s7-72"></a>

### S7-72 — MOTD banner in the main menu

*Size:* S · *Depends on:* S7-69

**Scope**

- MotdBanner.tsx and motd-model.ts. The dismissed id is kept in localStorage via safe-storage.
- pl.menu.motdLabel and motdClose. Tokens only, never yellow.
- e2e/config.spec.ts.
- Decision log row: runtime MOTD text is an exception to the pl.ts rule.
- Privacy line.

**Done when**

The banner shows with info or warning styling. Dismissal persists per id; a new id reappears (e2e). Readable at 640x360 and reachable on all devices.

<a id="s7-73"></a>

### S7-73 — AdSense client core: lazy loader (limited mode), AdSlot, pause guard

*Size:* M · *Depends on:* S7-69, S7-70

**Scope**

- ads-model.ts adEligible with a 'spectating' input (false until S7-91).
- placements.ts.
- adsense.ts:
  - limited mode: under-age-of-consent tagging and non-personalised requests set before load, with no storage-based features requested; the exact flags are taken from Google's current limited-ads documentation and recorded in S7-76;
  - a timeout leads to 'blocked';
  - pushSlot guard; setAdRequestsPaused; openConsentSettings.
- AdSlot.tsx and CSS; use-ad-pause.ts mounted in App.
- --space-ad-gap token; pl.ads.label.

**Done when**

Unit tests: the adEligible table; limited-mode flags set before the script tag; one script after 3 calls; blocked on error; one push under StrictMode. perf:budget is green.

<a id="s7-74"></a>

### S7-74 — Ad placements, menu footer with consent link, ad e2e guards

*Size:* M · *Depends on:* S7-73

**Scope**

- AdSlot placements: MainMenu left rail; Lobby below the footer; ResultsPlate side rail at ≥ 1780 px.
- screens/menu/MenuFooter.tsx with 'Zgody reklamowe'.
- e2e/ads.spec.ts: stubbed Google script; 150 px gap; none in game (pauseAdRequests = 1); silent with an ad blocker; none on phones.
- design-rules ad rules and checklist row; game-feel 'no cues for ads'.
- Decision log row: no ads on phones (screen space and accidental taps next to touch controls), narrowing user decision 11.

**Done when**

ads.spec passes on desktop and mobile. With no config there is no ad element and no Google request in any existing e2e. The design-rules change and Decision log row are in the same commit.

<a id="s7-75"></a>

### S7-75 — Shared markdown-lite parser, /prywatnosc page and privacy note rewrite

*Size:* M · *Depends on:* S7-70, S7-74

**Scope**

- packages/shared/src/markdown-lite.ts: a pure AST parser for headings, paragraphs, lists, tables, bold, code, links (https and / only), ads/no-ads blocks, and {{var|fallback}}.
- Server HTML renderer and the GET /prywatnosc route (base CSP).
- docs/privacy.pl.md rewrite:
  - the ads section describes limited ads (no ad cookies) and is shown only while ads are on;
  - CMP and the revocation link; real IP handling; progress, MOTD and other keys; operator variables.
- MenuFooter 'Prywatność'.

**Done when**

Parser tests: script escaped; javascript: links dropped; blocks toggle. /prywatnosc shows the ads section only when ads are on. Smoke passes. The text matches the shipped behaviour (reviewer checklist in the commit body).

<a id="s7-76"></a>

### S7-76 — Docs for config, ads and deploy

*Size:* S · *Depends on:* S7-68, S7-71, S7-74, S7-75

**Scope**

- docs/deploy.md:
  - topology; config table with a hot-reload column; reload commands and config:check;
  - header ownership and CSP modes;
  - AdSense operator checklist: the signOff gate (supervisor/legal sign-off before production); root domain and ads.txt on drkp.dev; Polish CMP message with the floating link off; Auto ads and overlay formats off; verifying the limited-ads flags.
- agents/architecture.md routes and config. Glossary.
- Decision log rows: shell, config precedence, AdSense limited-only for minors, signOff gate, X-Real-IP, MOTD exception, privacy page, roomBrowser off by default.
- docs/performance.md ads note. README line.

**Done when**

Every config key is documented with its default. The Decision log rows exist. bun run check is green. The M5 deploy smoke test passes.

## M6 — Rooms, versus, spectators

<a id="s7-77"></a>

### S7-77 — Shared wire contracts for rooms, versus and spectators (protocol v7)

*Size:* M · *Depends on:* S7-68, S7-36

**Scope**

- constants:
  - MAX_TEAM_PLAYERS, MAX_TEAMS, MAX_ROOM_PLAYERS, MAX_SPECTATORS, ROOM_NAME/SEARCH lengths, ROOM_LIST_MAX;
  - SPECTATOR_* (snapshot every 2nd tick, stats every 20 ticks);
  - VERSUS {endlessDurationS 600, leadCueCooldownMs};
  - MINIGAME_MIN_SOLVE_MS per kind (versus anti-cheat);
  - MAX_PLAYERS as an alias of 4.
- protocol:
  - primitives (incl. clientId);
  - join.as and join.clientId;
  - 8 lobby actions (incl. setSpectatorsAllowed);
  - roomState mode / visibility / name / spectatorsAllowed / spectators / team;
  - teamScore; snapshot team and scoreboard; event team;
  - spectatorEvent with spectatorEventSchema (verdictMasked, verdictRevealed);
  - playerStats and matchStats;
  - levelEnd team / versus (rivalResults keyed by spawnKey) / stats;
  - error codes incl. spectatorsOff, invalidName, kickCooldown, featureDisabled.
- PROTOCOL_VERSION 7.
- pl.errors strings.
- The registry emits default fields.

**Done when**

protocol.test accepts the new schemas and rejects team 2, 9 players, 25-character names and control characters. verdictMasked carries no verdict, outcome or score fields. Literal 7. bun run check is green.

<a id="s7-78"></a>

### S7-78 — Pure versus, match-stats, embargo, name-filter and room-list rules in shared

*Size:* S · *Depends on:* S7-77

**Scope**

- versus.ts: matchDurationMs, versusOutcome.
- match-stats.ts: emptyPlayerStats; applyStatsEvent (verdictResult, stampApplied, minigameFailed, 'ability' stage done); teamScoreOf. It is the only accumulator.
- spectator-embargo.ts (pure): open/close per (team, spawnKey); maskForSpectators(event, embargo) returns verdictMasked or passes through; release(spawnKey) returns the held results; releaseAll at level end.
- name-filter.ts: a small Polish blocklist matched after foldSearch with leetspeak folding; isAcceptableName and maskName.
- rooms.ts:
  - roomSummarySchema {code, name|null, hostNickname, levelId, mode, difficulty, players, maxPlayers, spectators, spectatorsAllowed, inGame, canJoinAsPlayer, canSpectate, createdAt};
  - the query schema;
  - foldSearch.

**Done when**

Literal tests pass:
- draw, forfeit, simultaneous credibility 0, endless 600000;
- foldSearch('Łukasz Żółć') = 'lukasz zolc';
- each stat counter;
- the embargo holds team-0's result for s3 until team 1 closes s3, then releases it; releaseAll flushes;
- the name filter rejects a blocklisted word written with diacritics or digits and accepts '3B piątek'.

<a id="s7-79"></a>

### S7-79 — Registry refactor: members, team runs, topics, lockstep tick (co-op unchanged)

*Size:* L · *Depends on:* S7-77

**Scope**

- RoomMember {kind, team, clientId?}; Room {mode, visibility, name, spectatorsAllowed, createdAt, members, teams: TeamRun[], stats, outcome, embargo}.
- pickTeam; per-team freeColorIndex; topicsFor and syncTopics; snapshotOf per team (crew, nextFolder, conveyorFull, paused); publishTeam (encode once); levelEndFor.
- One ctx per tick (tuning, absent); the run is shared from beginBriefing; one sim seed per match.
- A reconnect token maps to exactly one member and kind.
- inspect().game is an alias of team 0.
- __fixtures__/room-helpers.ts.

**Done when**

All existing registry, lobby, briefing-and-votes and endless tests pass unmodified. A co-op player on room:CODE:t0 receives team-0 snapshots. Smoke and e2e multiplayer pass.

<a id="s7-80"></a>

### S7-80 — Versus rules on the server

*Size:* L · *Depends on:* S7-78, S7-79, S7-13

**Scope**

- setMode (teams alternate; back to coop only with ≤ 4 players; featureDisabled when the flag is off). setTeam.
- matchInProgress for a mid-match player join; teamEmpty start gate.
- Scoreboard in snapshots. Forfeit after the reconnect grace. versusOutcome every tick; endless 600 s with a countdown.
- Per-team levelEnd with rivalResults matched by spawnKey, plus stats.
- No progress and no recordEndlessRun. Blunder votes per team.
- ctx.minSolveMs: a minigame success sooner than MINIGAME_MIN_SOLVE_MS[kind] after the minigame opened counts as a failure (station.minigameOpenedMs, sim-only). Off in co-op, so e2e data-answer solves are unaffected.

**Done when**

versus.test covers:
- alternating teams, teamFull, teamEmpty;
- equal seed and identical spawned storyIds after 100 ticks;
- with team 0's belt full when an l6 botRaid starts: shared spawnKeys map to the same story and minigame seed, and rivalResults pair by spawnKey;
- team-only snapshots with 2 scoreboard rows; input isolation;
- credibility win, draw, matchInProgress, reconnect into the right team, forfeit;
- endless 600 s with no leaderboard write; featureDisabled;
- a success 200 ms after opening counts as a failure in versus and as a success in co-op.

<a id="s7-81"></a>

### S7-81 — Spectators on the server, with the versus embargo and the Widownia toggle

*Size:* M · *Depends on:* S7-78, S7-79

**Scope**

- Join as spectator:
  - in any phase, only when room.spectatorsAllowed (else spectatorsOff) and the spectators flag is on (else featureDisabled);
  - capped at 8; no playerJoined event (players see the roomState spectator list instead).
- setSpectatorsAllowed (host). It defaults to false; a room created by a spectator host (a teacher on a projector) starts with it true.
- A spectator may be host. setSpectator.
- The spectator topic carries spectatorEvent via maskForSpectators:
  - in versus, verdictResult (and the expiry reason) for a spawnKey is sent as verdictMasked until both teams have closed it, then as verdictRevealed; releaseAll at level end;
  - co-op passes through unchanged.
- Every 2nd snapshot; matchStats every 20 ticks (only with spectators connected). Sync on attach.
- Spectators are excluded from the ready, briefing, input and vote gates. reassignHost prefers players.

**Done when**

spectators.test: cap; spectatorsOff while disallowed; mid-match sync; 10 Hz for both teams; 1 Hz stats; no blocking; input ignored; a spectator host can start; teamFull on setSpectator(false); co-op team-0 snapshots; flag off. Embargo test: while team 1 still holds s2, no message on room:CODE:spec contains team 0's verdict, outcome, reason or scoreDelta for s2; after team 1's verdict, verdictRevealed arrives for both.

<a id="s7-82"></a>

### S7-82 — Lobby administration on the server: visibility, name, kick with cooldown, host transfer

*Size:* M · *Depends on:* S7-79, S7-78

**Scope**

- setVisibility: host only, any phase; featureDisabled for public when roomBrowser is off; private by default.
- setRoomName (null clears it). A name failing isAcceptableName gets invalidName.
- kick:
  - host only, never self: send error kicked, removeMember, close 4002, invalidate the token;
  - record the member's clientId in a room-scoped kick list for KICK_REJOIN_COOLDOWN_MS (10 min, in limits.ts); a join with that clientId gets kickCooldown.
- The client keeps clientId as a random id in localStorage (shared across tabs) and sends it on join. Privacy line.
- transferHost: connected target only, never self.

**Done when**

lobby-admin.test: notHost for guests; the kicked socket gets the error, close 4002 and then reconnectFailed; a rejoin with the same clientId within 10 min gets kickCooldown, and one after it succeeds; transfer rejects disconnected targets; name and visibility round-trip; a blocklisted name gets invalidName.

<a id="s7-83"></a>

### S7-83 — GET /api/rooms room-list API (cached, class-sized limit)

*Size:* M · *Depends on:* S7-02, S7-78, S7-82

**Scope**

- registry.listRooms:
  - public rooms with connected members only;
  - roomSummary fields as in S7-78; hostNickname passed through maskName;
  - canJoinAsPlayer only in the lobby phase (user decision 10); canSpectate = spectatorsAllowed and the cap is not reached;
  - foldSearch over code, name and host; filters mode, levelId, difficulty and status; open rooms first, then newest; capped.
- The unfiltered list is cached for ROOM_LIST_CACHE_MS = 2000; filters run over the cached array.
- API route with zValidator.
- Rate limit ROOM_LIST_PER_MINUTE_PER_IP = 600 in limits.ts (with the class-NAT rationale), keyed by clientAddress.
- 404 when roomBrowser is off. Smoke check (flag on in the smoke config).

**Done when**

api.test:
- private rooms hidden;
- every roomSummary field asserted;
- Polish-folded search; filters; limit;
- a room in the playing phase has canJoinAsPlayer false;
- 30 polls from one IP within 10 s all succeed and rebuild the list at most 5 times;
- request 601 from one IP gets 429 while another IP gets 200;
- disabled gives 404.
Smoke passes.

<a id="s7-84"></a>

### S7-84 — Client session and stores for modes, spectators and kicks

*Size:* M · *Depends on:* S7-77

**Scope**

- joinRoom(nickname, code?, as) with clientId; lastJoinCode.
- Spectator routing: lobby → read-only Briefing → spectate screen.
- Per-team routing of snapshots, events, levelEnd and matchStats; spectatorEvent goes to the spectate store only.
- Kicked and kickCooldown handling.
- No progress record when levelEnd.versus is set.
- game-store scoreboard; ScreenId 'spectate'; LOBBY_ERRORS (spectatorsOff, invalidName, kickCooldown).
- matchInProgress offers 'Oglądaj' when spectating is allowed.

**Done when**

net tests: a spectator's team-1 snapshot leaves useGame untouched; kicked returns to the menu with pl.errors.kicked; spectatorEvent never reaches the player stores. Existing e2e passes.

<a id="s7-85"></a>

### S7-85 — GameView refactor of the client scene (no behaviour change)

*Size:* L · *Depends on:* S7-12, S7-42, S7-51

**Scope**

- New net/game-view.ts holding per-view instances of:
  - the game store (createGameStore);
  - the events store (events/event-store.ts);
  - ping bubbles (pings/bubble-store.ts);
  - guidance (guidance/store.ts, a disabled stub for spectators);
  - render state (createRenderState);
  - particle pools;
  - camera shake;
  - feedback / CueContext (silent option).
- createWatchRuntime with SPECTATOR_INTERPOLATION_DELAY_MS = 250 (client constant); players keep INTERPOLATION_DELAY_MS.
- playerView.
- Migrate every scene file (incl. EventMarkers, EventsWorld, PingBubbles, GuidanceMarkers, Particles, CameraRig) to useGameView, keeping S7-12 framing, the S7-09 indicator and the S7-42 markers.
- Providers inside each Canvas, each useOverlay root and each drei Html child.
- GameCanvas primary prop; PerfProbe viewKey; contextFor takes a ViewLookup.

**Done when**

The e2e multiplayer, pings and performance specs pass with unchanged budgets. game-view.test proves isolation between two views for every listed store, and that the watch runtime renders 250 ms behind. The feedback test proves that silent mutes sound only. No scene file imports runtime or a module-level store from net/, events/, pings/ or guidance/.

<a id="s7-86"></a>

### S7-86 — Lobby UI: mode, teams, spectators (Widownia), visibility, room name

*Size:* L · *Depends on:* S7-84, S7-80, S7-81, S7-82, S7-44

**Scope**

- Lobby regions:
  - header with the name Field and visibility Segmented (public hidden when roomBrowser is off);
  - mode Segmented;
  - co-op seats or two team columns with TeamBadge and 'Przejdź tutaj';
  - spectator strip with the host 'Widownia' toggle;
  - spectator lobby state;
  - sticky footer with one yellow action and startTeamEmpty.
- Team tokens and TeamBadge; icons eye, swap and more; strings.
- Cues:
  - lobby.modeSwitch and teamSwitch;
  - room.spectatorJoined, played in the lobby and in game (a toast 'Widz dołączył' with a caption), triggered from the roomState spectator diff.
- design-rules §3 team rows.

**Done when**

e2e versus.spec lobby part passes on desktop and mobile. An in-game toast appears when a spectator joins (e2e). lint:design is green. A 640x360 screenshot is reviewed. captions.test passes.

<a id="s7-87"></a>

### S7-87 — Host manage sheet and level details for guests

*Size:* M · *Depends on:* S7-86, S7-15, S7-25

**Scope**

- MemberSheet: move to team, spectate/play, transfer host, kick with confirm.
- LevelDetailsSheet ('Szczegóły', for everyone) from a pure levelDetails(level, mode, difficulty, run):
  - stations with the pl.stationHelp purpose; events; pool size, run folder count and minutes;
  - star rule as shares plus the run thresholds when known;
  - difficulty chip; best local stars per difficulty; versus and endless lines.
- Cues lobby.hostChanged and lobby.kicked.

**Done when**

level-details.test passes. e2e kicks a guest (who lands on the menu with the message) and transfers host. The sheets are navigable by keyboard, gamepad and touch at 640x360.

<a id="s7-88"></a>

### S7-88 — Room browser UI

*Size:* M · *Depends on:* S7-83, S7-84, S7-69

**Scope**

- fetchRooms.
- useRoomList: polls every ROOM_LIST_POLL_MS = 8000 while the dialog is open and document.visibilityState is 'visible'; on 429 it doubles the interval up to 60 s; abort support.
- RoomBrowserDialog:
  - search; mode, status and difficulty filters (collapsing on phones);
  - radio rows with every roomSummary field;
  - yellow Dołącz only when canJoinAsPlayer, white Oglądaj only when canSpectate;
  - a nickname field; empty and error states.
- MainMenu entry hidden when useFeature('roomBrowser') is false, plus an 'Oglądaj' by-code button.
- The e2e server config enables roomBrowser.

**Done when**

e2e room-browser.spec passes on desktop and mobile: a public room named '3B piątek' is found by '3b' and joined. Model tests: backoff on 429 and the pause while hidden.

<a id="s7-89"></a>

### S7-89 — Versus HUD rival chip and versus results for players

*Size:* M · *Depends on:* S7-80, S7-84, S7-06, S7-07

**Scope**

- VersusChip: under the pill on desktop, a pill segment on phones.
- Endless versus countdown.
- versus-model with lead cues.
- ResultsPlate versus variant: win/lose/draw ribbon with the reason; 2 TeamScoreCards; own totals; 'Wy' / 'Rywale' chips per folder paired by spawnKey from rivalResults.
- Cues versus.*.
- design-rules §1.3/§5 rival chip.

**Done when**

versus-model literal tests pass, including pairing by spawnKey when the rival has an extra raid folder. e2e shows the chip for both teams and only own-team avatars. Screenshots for win, lose and draw at 1366x768 and 640x360.

<a id="s7-90"></a>

### S7-90 — Spectate screen I: views, split layout, scoreboard

*Size:* L · *Depends on:* S7-81, S7-84, S7-85

**Scope**

- Spectate store with per-team GameViews; SpectateScreen in the game chunk.
- spectate-layout.ts: side by side when width ≥ 1000 and aspect ≥ 1.2; stacked when width ≥ 700 and height ≥ 900; otherwise single. Phones are always single, with a one-tap team switch and both scores always in the top bar. Decision log row: two WebGL contexts are too heavy for phones.
- One Canvas per view (medium preset, DPR 1.5, no shadows); players filtered by team; spectator camera; top-bar scoreboard; team plates.
- Audio policy: SPECTATOR_AUDIBLE_CUES, gain 0.6, team pan.
- Read-only Briefing.
- Record the game-route gzip against gameMax.

**Done when**

e2e spectate.spec: 1 canvas in co-op, 2 in desktop versus, 1 in mobile versus with a working switch. Layout tests pass. A mid-match join renders both newsrooms within 1 s. perf:budget is green.

<a id="s7-91"></a>

### S7-91 — Spectate screen II: follow, feed, stats, spectator results, ad slot

*Size:* L · *Depends on:* S7-90, S7-89, S7-74

**Scope**

- Follow on keyboard, gamepad and touch with a blue ring.
- FollowCard: headline, station and minigame kind/progress, stamp icons only; never a verdict, truth or stamp text.
- feed-model and EventFeed from spectatorEvent:
  - verdictMasked renders as 'Zespół X: werdykt' (no outcome or points); verdictRevealed renders the full row;
  - plus blunders (revealed only), expiries, events, raids, 'ability' done and folderRescued.
- stats-model and StatsSheet. In versus, accuracy counts only revealed results.
- SpectatorResults: team Segmented and read-only Kolegium.
- Cues spectate.follow and spectate.feed.
- 'spectating' input to useAdRequestPause; AdSlot 'spectator' only in results and in the side stats sheet.
- agents/platforms.md spectate rows.

**Done when**

feed-model and stats-model tests pass, including masked → revealed. e2e follows a player on each device and sees a feed row after a verdict. Versus e2e: while the other team still holds the folder, the spectator DOM has no verdict, outcome or points text for that spawnKey; after both close it, the row appears. The spectator ad placement passes the gap test.

<a id="s7-92"></a>

### S7-92 — Performance checks for versus and spectating

*Size:* S · *Depends on:* S7-80, S7-91

**Scope**

- tools/perf/server-tick.ts bench: 150 versus rooms × 8 scripted inputs, with spectators attached to 50 of them.
- e2e performance.spec.ts spectator case via perfStats.views: desktop split summed ≤ 150 draw calls and ≤ 100k triangles; mobile single ≤ 100.
- Numbers in docs/performance.md.

**Done when**

The spectator perf e2e passes on both projects. The bench result is recorded; if the mean tick is > 25 ms, a MAX_ROOMS config change is proposed.

<a id="s7-93"></a>

### S7-93 — Docs, rules and privacy for rooms, versus and spectators

*Size:* M · *Depends on:* S7-80, S7-81, S7-83, S7-91, S7-75

**Scope**

- design-document.pl.md: Tryb na punkty, Widownia, Lista pokoi, network caps, protocol table.
- docs/contest/how-to-play.pl.md: versus and spectators.
- agents/architecture.md: topics, embargo, caps. Glossary.
- Decision log rows:
  - parallel newsrooms keyed by spawnKey; win, draw and forfeit; endless 10 min; caps 8+8;
  - join rules: browser join as player only in the lobby; co-op code join mid-game kept as an existing feature;
  - the spectator embargo, with the residual leak of the live rival total accepted;
  - client-reported minigame results accepted in versus with the minimum-solve check, and the client bundle contains answers;
  - Widownia off by default; kick with clientId cooldown and no IP ban; the name filter; roomBrowser off by default; private by default; host may spectate.
- privacy.pl.md: public rooms, spectators, clientId.
- docs/accessibility.md: team badges; the feed replaces captions for spectators.
- deploy.md limits. Contest criteria note.

**Done when**

The docs match the shipped constants and rules. bun run check is green. The M6 deploy smoke test passes.

## M7 — Intro, help, about, profile

<a id="s7-94"></a>

### S7-94 — Shared control drawings and StationHelpCard

*Size:* M · *Depends on:* S7-15, S7-48

**Scope**

- Move Key, PadButton, TouchButton, Control and Illustration from Tutorial.tsx into guidance/ControlsArt.tsx.
- stations/StationHelpCard.tsx with two variants:
  - 'inPlay': purple header; purpose (≤ 8 words); steps for the active device (≤ 8 words each); an animated control drawing (static under reduced motion); a 'Dowód:' line (≤ 8 words); the 'Termin teczki biegnie dalej' note; yellow 'Rozumiem';
  - 'full': adds realWorld, used only in 'Jak grać'.
- All 10 kinds, shown in the Styleguide.

**Done when**

The Tutorial renders identically. station-help.test passes with 10 kinds and the word limits. The Styleguide shows both variants at 640x360.

<a id="s7-95"></a>

### S7-95 — First-use station help with paused client timer and '?' in the overlay header

*Size:* M · *Depends on:* S7-94, S7-24

**Scope**

- station-help-store (redakcja.stationHelp.v1).
- overlay-logic minigameElapsed and useMinigameClock(timeLimitMs, paused, resumeMs?), used by StationOverlay and MinigameBench; the S7-14 resume is kept.
- The 'inPlay' card shows on first use and swallows nav intents.
- OverlayFrame help prop after headerAction; H and Select.
- Settings: 'Pokaż pomoc stanowisk od nowa'.
- Amend agents/design-rules.md §1.2: the first-use station card is the one allowed in-play explanation; it pauses the minigame clock and keeps every line ≤ 8 words.
- platforms.md row; privacy key line.

**Done when**

overlay-logic pause test: start 0, pause 3000–8000, now 10000 → 5000; and with resumeMs 4000 the remaining time is 4000 at open. On the first open of a station the timer bar does not move while the card is shown. '?' and H/Select reopen it. The design-rules amendment is in the same commit.

<a id="s7-96"></a>

### S7-96 — 'Jak grać' dialog shell, bundle 'extras' category, entry points

*Size:* M · *Depends on:* S7-74

**Scope**

- howto/store.ts.
- Lazy HowToPlayDialog with Segmented tabs Wprowadzenie / Stanowiska / Sterowanie; Y switches tabs.
- Entry points: MainMenu corner 'Jak grać?'; Lobby top action; Settings entry.
- MenuFooter slots for Profil and O grze.
- check-bundle.ts: EXTRAS_SOURCES (src/intro, howto, about, profile); extrasGraph and voiceFiles; extrasMax 1 MB; firstLoad = menu + game + extras; tests.
- docs/performance.md.

**Done when**

The dialog opens from the menu, lobby and settings on all devices. check-bundle reports menu, game and extras separately and its tests pass. perf:budget is green.

<a id="s7-97"></a>

### S7-97 — Stanowiska tab, practice round ('Wypróbuj'), briefing chips, in-game help row

*Size:* M · *Depends on:* S7-96, S7-95, S7-10

**Scope**

- 10 station tiles; StationHelpCard 'full' plus 'Wypróbuj'.
- PracticeRound: pure practiceStory; useMinigameClock; outcome banner; never imports net/session.
- Briefing 'Nowe dziś' chips open the tab.
- In-game menu row 'Pomoc: stanowiska' with practice disabled.

**Done when**

Practice plays all 10 minigames without sending commands (import test). practice-story test passes. Works at 640x360.

<a id="s7-98"></a>

### S7-98 — Voice audio bus, voice loader, voice volume, deeper ducking

*Size:* S · *Depends on:* S7-01

**Scope**

- AudioBus 'voice'; busVolume and BUS_TRIM.
- settings voiceVolume (.catch 0.9) and a 'Lektor' slider.
- fx/audio/voice.ts: loadVoice, playVoice, applyVoiceVolume.
- duck.ts depth parameter, voiceDepth 0.3.
- docs/audio.md.

**Done when**

Unit tests: busVolume voice, the settings default, duck depth (0.3 beats 0.45). playVoice is a no-op when muted or not loaded.

<a id="s7-99"></a>

### S7-99 — Intro script, timeline model and line export

*Size:* M · *Depends on:* S7-43, S7-19

**Scope**

- intro/intro-script.ts: 11 scenes and 17 clips with device variants; final ability names and keys, multi-stamp and roles lines; each gameplay scene names its scripted input track.
- pl.intro.
- intro-model: fallbackMs, sceneDurationMs, introReducer, subtitleChunks, shouldAutoplayIntro (lobby, level 0, not seen, not spectator).
- Seen flag.
- tools/audio/intro-lines.ts prints JSON to stdout with ttsText and PRONOUNCE.

**Done when**

intro-model literals: fallbackMs 2500/4800/12000; subtitleChunks split at 2154 ms. The export prints 17 clips. Every chunk fits in ≤ 2 lines at 640x360.

<a id="s7-100"></a>

### S7-100 — Offline Polish TTS voiceover with a licence audit, and licence notes

*Size:* M · *Depends on:* S7-99

**Scope**

1. Licence audit (blocking). For each candidate Polish voice (the Piper pl_PL voices first, then other open engines such as eSpeak NG/MBROLA or RHVoice), check the model card, the training dataset and every checkpoint the model was fine-tuned from. Record the findings in the Decision log. Only a voice whose whole chain allows redistribution and commercial use may be generated. If none qualifies, the pipeline runs in --recordings mode with a volunteer recording released under CC0. Generation is never done from a non-commercial chain.
2. tools/audio/synth_voice.py:
   - the chosen engine and voice, pinned by SHA-256;
   - flags --model, --voice, --recordings;
   - trim, normalise to −20 dBFS, encode to webm and mp3.
3. Generated public/assets/voice/intro.{webm,mp3} and voice-sprite.json. Its zod schema has a licence field limited to CC0-1.0, CC-BY-4.0, MIT or self-recorded-CC0, so a non-commercial voice cannot ship.
4. voice-sync.test (sha1 per subtitle); measure.py voice window.
5. apps/client/public/assets/CREDITS.md: voice row; fix the stale font rows.
6. Amend agents/game-feel.md:47 (CC0 / self-made only) to allow the chosen licence with attribution, in the same commit.

It runs where the model host is reachable (blocked in the cloud sandbox).

**Done when**

The audit row is in the Decision log. Both files are ≤ 700 KB. measure.py and voice-sync pass. The voice-sprite schema rejects 'CC-BY-NC'. CREDITS and game-feel.md are updated.

<a id="s7-101"></a>

### S7-101 — IntroPlayer (in-engine): stage, subtitles, controls, scenes 1–6

*Size:* M · *Depends on:* S7-96, S7-98, S7-99, S7-85

**Scope**

- IntroPlayer with an always-on SubtitleBar, progress dots and Wstecz / Pauza / Dalej (yellow) / Pomiń. Keyboard, gamepad and touch.
- Fallback timing when the voice is missing or audio is locked, with a 'Stuknij, by włączyć głos' chip. Ducking per clip.
- In-engine scenes: intro/intro-sim.ts runs the shared deterministic sim locally on a mini layout (conveyor, 2 stations, desk) with the scripted input tracks. One small Canvas renders it through a GameView (S7-85). No network, no commands; it is deterministic, so it stays in sync with the voice.
- Scenes welcome (UI kit), then folders, pickup, work, stations and desk (in-engine, with UI-kit callouts).
- Reduced-motion and no-flash variants.
- Decision log row: 'in-engine' = rendered live by the game's own sim and renderer, never a video file.

**Done when**

The player runs silently on fallback timing and with the voice when present. Subtitles stay in sync. The intro-sim test reaches the expected state at each scene end. It works at 1366x768 and 640x360. Reduced motion uses fades only. extras stays within budget.

<a id="s7-102"></a>

### S7-102 — IntroPlayer scenes 7–11, lobby autoplay, intro flag, replay, e2e

*Size:* M · *Depends on:* S7-101, S7-69

**Scope**

- Scenes proof, credibility, roles, team and end.
- Lobby autoplay via shouldAutoplayIntro, gated by useFeature('intro'); early loadVoice.
- Settings: 'Obejrzyj wprowadzenie'.
- The flag is set on finish or skip.
- e2e/intro.spec.ts.
- Privacy line.
- Design-document Ekrany row.

**Done when**

A new room on training autoplays once per browser. Skip and finish set the flag. Replay from the menu and settings works. With the flag off there is no autoplay. e2e is green.

<a id="s7-103"></a>

### S7-103 — 'O grze' dialog: authors, licences, credits, libraries, version

*Size:* M · *Depends on:* S7-96, S7-75

**Scope**

- Lazy AboutDialog:
  - authors and licence from build-time defines (vite.config reads LICENSE and package.json; __APP_VERSION__ = package + git sha);
  - CREDITS fetched at runtime from /assets/CREDITS.md (apps/client/public/assets/CREDITS.md), parsed with the shared markdown-lite AST and rendered with React (no dangerouslySetInnerHTML, no ?raw import from public/);
  - the protocol version.
- about/libraries.ts with a test against package.json.
- Privacy section links to /prywatnosc.
- MenuFooter 'O grze'.

**Done when**

Credits render headings, lists and tables, with an offline error state. The version shows package + sha + protocol. Tests pass. Navigable by keyboard, gamepad and touch at 640x360.

<a id="s7-104"></a>

### S7-104 — Player profile: local stats, tracking, profile dialog

*Size:* M · *Depends on:* S7-96, S7-78

**Scope**

- store/profile.ts (redakcja.profile.v1, zod with .catch).
- profile-model: withEvent and withLevelEnd on the shared match-stats accumulator; accuracy; favouriteRole.
- Tracking via onGameEvent and levelEnd; spectators skipped.
- ProfileDialog: preview; colour and accessory (local until S7-105); stats grid; stars per difficulty; reset with confirm.
- MenuFooter 'Profil'.
- Privacy line.

**Done when**

profile-model literals: 2 correct + 1 wrong gives 67 %; a role tie is broken by ROLES order. Stats update after a real match. The dialog is navigable on all devices.

<a id="s7-105"></a>

### S7-105 — Look over the wire: preferred colour and accessory (protocol v8)

*Size:* M · *Depends on:* S7-104, S7-79, S7-86

**Scope**

- accessorySchema; join look; lobby setLook (lobby only); lobbyPlayer.accessory. PROTOCOL_VERSION 8.
- freeColorIndex(room, team, preferred).
- rig.ts cosmeticParts.
- PlayerCard accessory glyph.
- Taken swatches disabled while in a room.

**Done when**

Server tests: a free preferred colour is assigned; a taken one falls back to the lowest free; setLook is ignored while playing. The accessory is visible in the lobby and in 3D. The protocol literal is 8.

<a id="s7-106"></a>

### S7-106 — Stage 7 close-out: docs consistency and contest refresh

*Size:* S · *Depends on:* S7-95, S7-97, S7-100, S7-102, S7-103, S7-105

**Scope**

- Verify (do not batch-mark) that every S7 row was ticked by its own task; fix any gaps with a reference to the commit.
- Glossary sweep.
- design-document.pl.md Ekrany (Wprowadzenie, Jak grać, O grze, Profil) and Pętla step 5.
- game-feel catalogue check.
- docs/accessibility.md: intro subtitles.
- docs/contest/how-to-play.pl.md final read.
- Regenerate contest screenshots and README captions.
- UI polish pass against the design-rules checklist on every new screen.

**Done when**

Every S7 row was ticked in its own commit (git log check). The docs match the shipped UI. bun run check and bun run test:e2e are green. The M7 deploy smoke test passes.
