# Stage 7 — review of the first integrated draft

Kept as a record. Every blocker and major gap below is fixed in `README.md` / `tasks.md`.

## Gaps

### [major] Versus fairness is keyed on folderId, but folder ids are not the same in both newsrooms. minigameSeedFor(seed, folderId, kind, attempt), the S7-80 test 'identical minigame seed for the same folder in both teams' and the 'Wy/Rywale' chips from rivalResults all assume that f<n> means the same folder in both teams. It does not once the two teams' conveyors differ.

*Evidence:* packages/shared/src/sim/folders.ts spawnFolderAt assigns id `f${state.nextFolderNumber}`, and spawnFolders waits while the belt is full. packages/shared/src/sim/events.ts startFolderEvent spawns `wanted = Math.min(event.count, total, tiles.length)` raid folders, so a team with a fuller belt gets fewer raid folders and every later folder number shifts. l6 has botRaids at 60 s and 285 s, and endless generates raids too. The S7-80 test with 100 ticks of idle play would pass and hide this.

*Fix:* Add a stable spawnKey to folderSchema, for example `s<scheduleIndex>` for scheduled folders and `e<eventIndex>.<waveIndex>` for event folders. Derive minigame seeds from (seed, spawnKey, kind, attempt). Match rivalResults and the spectator feed by spawnKey. Add a versus test where team A's belt is full when a botRaid starts and assert that seeds and keys still line up.

### [major] In versus, the spectator view leaks answers. Both teams get the identical story stream, and the live feed shows verdicts and blunders as they happen. A teacher projecting the spectator view, or a player with a second tab joined as spectator (allowed in any phase, with no playerJoined event), shows the slower team the faster team's verdicts on folders it still holds.

*Evidence:* §5: identical folder stream. S7-81: spectators can join any phase. S7-91: the feed covers verdicts, blunders, expiries and abilities. The only reveal guard is 'No stamp result text ... before verdictResult', and that is per team.

*Fix:* In versus, the spectator feed and FollowCard withhold story identity and verdict for a spawnKey until both teams have resolved or lost that folder. Until then show only 'Zespół A: werdykt' and a points delta, or delay the feed. Do the same for rivalResults chips. Add a test that no verdict or story text for a spawnKey reaches the spectator DOM while the other team still holds that folder. Also forbid one connection or token from being both player and spectator in the same room.

### [major] The room-list rate limit breaks the room browser for school classes. The limit is 60 requests per minute per IP, and the dialog polls every 4 s, which is 15 requests per minute per open dialog. A class behind one NAT IP gets 429s after about 4 open dialogs.

*Evidence:* apps/server/src/limits.ts: 'A school class often shares one public IP, so the per-IP numbers are deliberately generous' (JOINS_PER_MINUTE_PER_IP = 120). S7-83: '429 above 60 requests per minute per IP'. S7-88: 'polls every 4 s while the dialog is visible'.

*Fix:* Cache the listRooms result server-side for about 2 s, so the cost per request is flat. Set the per-IP limit in the class-sized range (for example 600 per minute) in limits.ts with the same rationale. Poll at 8–10 s with backoff on 429, and stop when document.hidden. Add a test with 30 polls from one IP.

### [major] The bag counts stations that 'decide' a story, but in this repo a 'decisive' stamp is not always a justifying one. If matchStories, coverage or the pinned counts use decisive stamps, a slot can go to a station whose stamp does not justify the verdict. Citing that stamp gives weakProof. Guidance (next-step.ts stationsToVisit) points at justifying stations, so the load balance the user asked for (decisions 2 and 3) is not achieved.

*Evidence:* Stamps that are decisive but not justifying today:
- l4-ankieta-uczniow and l4-raport-pielegniarek: decisive SR, P, DL; justifying SR, DL.
- l4-darmowe-badania-wzroku: decisive SR, A, P, DL; justifying SR, P.
- l4-woda-z-kranu: decisive SR, P; justifying SR.
- l6-frekwencja-w-poludnie: decisive A, SR, DL; justifying SR, DL.
S7-20 names the helper `decisiveStations`; §4 step 3 says 'stations that decide at least one pool story'.

*Fix:* Define 'decides at station K' as: the story has a justifying, non-hint stamp from K. Use that one rule in bagStations, matchStories, checkBag coverage and the pinned target. Add a fixture story with a decisive-only stamp to bag.test. Optionally put the bag-assigned station in the run schedule and let next-step prefer it among justifying stations, so flex stories do not drift back to the busiest station.

### [major] l5 needs more new stories than its tasks include, so the S7-60 done-when ('no pinned-target warning for l5') cannot be met as scoped. The risk text also contradicts §6 on the stamp count.

*Evidence:* After the S7-57 retargets, the 15 scheduled l5 stories pinned to one non-hint station are:
- imageSearch 2: przecinanie-wstegi, wideo-obietnica
- archive 2: przemowa-na-rynku, tlum-na-wiecu
- sourceRegistry 2: komunikat-budzet, parodia-rap
- phone 4
- transcript 1: wyciety-cytat
- metadata 0
wolne-tempo becomes N=2, and burmistrz, zdjecie-sprzed-lat and wywiad-radio become flex. The target is ⌈15/6⌉ = 3, so l5 needs IS +1, A +1, SR +1, Q +2, E +3 = 8 stories. S7-59 (4 + 1) plus S7-60 (1) give 6. The risks say '≈142 new stamp texts on existing l5/l6 stories', while §6 says 34 + 40 = 74.

*Fix:* Add one archive-pinned and one sourceRegistry-pinned l5 story, about 8 in total, and resize S7-59 to L. Re-derive the l6 numbers with the same script before scheduling. Correct the stamp-count figure. Treat checkBag output as the arbiter in each content task's done-when, as the plan already intends.

### [major] The ads plan has no legal gate for minors. The audience is high-school students, and Poland's GDPR Art. 8 consent age is 16. Non-personalised AdSense still uses cookies or local storage for frequency capping and fraud checks, which needs ePrivacy consent, and a consent click by a player under 16 is not valid. The plan lists this as a risk but ships an enable switch with no condition.

*Evidence:* AGENTS.md: target audience is Polish high-school students. S7-73: 'NPA set before load', teen age treatment. S7-76: an operator checklist only. The risks say 'Consent from players under 16 is legally doubtful'. docs/privacy.pl.md:11 currently promises no advertising cookies.

*Fix:* Add `ads.mode` to config.json. When the age treatment is teen or child, the only accepted value is Google's limited-ads mode (no consent-based storage); the config schema rejects personalised or NPA-with-cookies modes. Add a deploy-checklist and Decision log gate: supervisor or legal sign-off before `ads.enabled: true` in production. Keep the privacy note text tied to the active mode, which the markdown-lite ads blocks already allow.

### [major] The default feature flags expose minors. S7-68 makes every flag true by default. That turns on the public room list, which shows host nicknames and free-text room names, and spectators, who can join private rooms mid-game by code with no playerJoined event. Kick only invalidates the token, so a kicked person can rejoin at once. Room names and nicknames are not filtered.

*Evidence:* S7-68 done-when: 'all features true'. S7-81: 'no playerJoined event' for spectators, join in any phase. S7-82: kick sends the error, closes 4002 and invalidates the token, with no rejoin block. The risks admit 'Room names are not profanity-filtered' and 'Kick has no IP ban'.

*Fix:* Default roomBrowser to false, so the operator opts in. Add a host lobby toggle 'Widownia' that allows spectators, on by default only for rooms the host creates as a teacher or presenter, or off by default. Announce spectator joins in-game with a caption and cue. Add a room-scoped kick cooldown keyed by a per-browser id kept in sessionStorage (IP is unusable in classes). Run a small blocklist filter on public room names and on host nicknames shown in the list. Log all of this in the Decision log and the privacy note.

### [major] The TTS voice may break a binding asset rule and the user's 'open-licensed' requirement. The plan picks pl_PL-darkman-medium while admitting it may be non-commercial, and defers the fix to 'replace before ads'. It also points at a CREDITS.md that does not exist at that path.

*Evidence:* agents/game-feel.md:47-48: 'Every sound and texture has an entry in apps/client/public/assets/CREDITS.md (CC0 / self-made only)'. User decision 7: 'open-licensed Polish voice'. S7-100: 'the lessac caveat, replace before ads are enabled in production'. The plan's doc map says 'CREDITS.md', but there is no root CREDITS.md; the file is apps/client/public/assets/CREDITS.md.

*Fix:* Make step 1 of S7-100 a licence audit of the model card and every dataset and checkpoint in its fine-tune chain. Choose a voice whose whole chain is open, or a human recording, and block generation otherwise. Amend the agents/game-feel.md asset rule in the same commit. Add a licence field to voice-sprite.json and a config check that refuses ads.enabled while it is non-commercial. Fix the CREDITS path, which S7-103 also imports.

### [minor] The plan names an e2e script that does not exist.

*Evidence:* package.json has `test:e2e` (playwright test), and AGENTS.md documents `bun run test:e2e`. The plan says '`bun run e2e` ... runs for every task whose done-when names an e2e spec'.

*Fix:* Use `bun run test:e2e`, and add the phone-small project to playwright.config.ts in S7-12.

### [minor] The penalty literals in S7-17 need rounding half away from zero, but JS Math.round rounds -x.5 toward +∞.

*Evidence:* S7-17 done-when gives publishedFake −38 on Expert and −13 on Easy, and expired −8. Math.round(−37.5) is −37, Math.round(−12.5) is −12 and Math.round(−7.5) is −7.

*Fix:* Specify scalePenalty as `Math.sign(v) * Math.round(Math.abs(v) * factor)` and test both signs.

### [minor] Renaming GameState.rng to seed in S7-13 breaks tests the plan does not list. 'Seed-literal tests' does not cover them.

*Evidence:* apps/server/src/rooms/endless.test.ts:138-145 ('gives every run its own schedule') compares `inspect().game.rng` across runs. packages/shared/src/sim/stations.test.ts:188 asserts `run.state.rng` changed.

*Fix:* List both in S7-13. Rewrite the endless test against `game.seed` here, and against the run seed once S7-23 lands.

### [minor] The S7-85 GameView refactor names only the session runtime, the game store, render state and feedback. The scene also reads other module singletons, so a two-canvas spectator view would show team 0's events, pings and guidance in both canvases.

*Evidence:* - scene/EventMarkers.tsx and scene/EventsWorld.tsx read events/event-store.ts useEvents.
- scene/PingBubbles.tsx reads pings/bubble-store.ts usePingBubbles.
- scene/GuidanceMarkers.tsx reads guidance/store.ts useGuidance.
- scene/render-state.ts exports one renderState.
- The particle pool is per component.

*Fix:* In S7-85, list every per-view store (game, events, ping bubbles, guidance (off for spectators), render state, particles, camera shake) and test isolation for each in game-view.test.

### [minor] Spectator snapshots arrive at 10 Hz but are rendered with the 100 ms interpolation delay. That leaves no buffer, so remote avatars stutter or extrapolate.

*Evidence:* constants.ts: INTERPOLATION_DELAY_MS = 100. S7-81: the spectator topic carries 'every 2nd snapshot'. S7-85 introduces createWatchRuntime but no delay.

*Fix:* Give the watch runtime its own delay of at least 2 snapshot intervals (about 250 ms) as a client constant, and test it in game-view.test.

### [minor] The first-use station help card adds an explanation in the middle of play without amending the design rule that forbids it.

*Evidence:* agents/design-rules.md §1.2: 'Explanations belong in the tutorial or the debrief, never in the middle of play', and instructions are at most 8 words. S7-95 shows purpose, steps, a 'Dowód:' line and a deadline note while the folder deadline runs. The doc map lists no §1.2 amendment.

*Fix:* Amend design-rules §1.2 in S7-95 to allow the first-use station card, which pauses the client minigame timer, or show only the ≤ 8-word steps in play and keep the realWorld text for the 'Jak grać' tab.

### [minor] The endless leaderboard per difficulty (decision 9) is done only on the server and API side. The client leaderboard UI has no difficulty filter.

*Evidence:* apps/client/src/endless/LeaderboardDialog.tsx and use-leaderboard.ts are not in the S7-26 scope. S7-26 changes only progress storage, session.ts, the DB column and the query and entry schemas.

*Fix:* Add difficulty tabs or a Segmented control to LeaderboardDialog, pass the difficulty through use-leaderboard, and extend endless-model tests.

### [minor] Several deviations from user decisions have no explicit Decision log row.

*Evidence:* - 'pause sheet' (decision 13) becomes a non-pausing menu (S7-10).
- 'join as player only in lobby' (decision 10) becomes lobby or results in the browser, plus co-op code join mid-game.
- Ads get 'nothing on mobile' (S7-74).
- Phone spectators always get a single view (decision 8 says both teams at once).
- Managing editor '+20 s to any folder' becomes a server-picked target with no target in useAbility.
- Ekspert hides decidedBy (decision 14 promises the deciding station).
- Reporter and archivist passives widen from ROLE_STATIONS to whole families: reporter gets −40% at sourceRegistry, the busiest station.

*Fix:* Add one Decision log row per item in the owning task (S7-10, S7-83/93, S7-74, S7-90, S7-37, S7-24, S7-36). For the editor, consider letting R cycle the target while the role chip shows the preview.

### [minor] The stable Kartoteka card plus free cancel removes the minigame time limit. The risk text calls the peek-and-cancel exploit 'moot', which is the opposite of what happens.

*Evidence:* S7-13: the attempt counter does not advance at sourceRegistry on cancel. StationOverlay restarts the 20 s client timer on every open. retry-memory (S7-14) keeps the circled fields, so a player can cancel at 19 s and retry the same card any number of times. A cancel has no lockout (stations.ts minigame→cancel→idleStation).

*Fix:* Store the remaining time in retry-memory and resume it after a cancel, or count cancel after more than X s as a failure with lockout at stable-seed stations. Correct the risk statement.

### [minor] Versus makes client-reported minigame success a competitive cheat. The existing Decision log row justifies client trust only for co-op.

*Evidence:* implementation-plan Decision log 2026-10-06: 'Minigame outcomes are reported by the client ... cheating is not a threat in a c[o-op]'. The sim accepts `minigameResult.success` as sent.

*Fix:* Add a Decision log row in S7-93 that accepts or mitigates this for versus. A cheap sanity check: the server rejects a success that arrives sooner than a per-kind minimum after minigameStarted.

### [minor] S7-19 depends on a selector that only appears in S7-24, a later task.

*Evidence:* S7-19: FolderCard evidenceBadge shows 'have/N when hints are effectively on'. The effective-hints selector (setting && DIFFICULTY[d].hints) is created in S7-24, and S7-19 does not depend on S7-24.

*Fix:* Have S7-19 use the plain hints setting and S7-24 switch the badge to the effective selector, or add S7-24 to S7-19's dependencies.

### [minor] Two shell security details in M5 are unspecified.

*Evidence:* - A nonce in style-src makes browsers ignore 'unsafe-inline', which would break React inline style attributes and AdSense inline styles.
- The embedded `<script type=application/json>` config carries operator MOTD text; without escaping `<`, a `</script>` sequence in it breaks the page.
- Caddyfile sends Referrer-Policy no-referrer, which may impair ad serving.

*Fix:* In shell/csp.ts, put the nonce and 'strict-dynamic' only in script-src. Serialise the embedded JSON with `<` escaped as < and test it. Decide Referrer-Policy per CSP mode (strict-origin-when-cross-origin in ads mode).

### [minor] The unfinished sweep could count a botRaid wave once per folder. Expiry counts a wave once.

*Evidence:* scoring.ts counts one expired result per raid (countedRaids). S7-03 says 'one unfinished result per folder still in play'.

*Fix:* Count one 'unfinished' result per raid wave and add that case to the S7-03 scoring test.

### [minor] l5-nagranie-podatek with N=2 requires an aiScanner stamp, but §1.1 makes aiScanner hint-only and the bag excludes it. The l5 aiScanner outage at 170 s can then block full points on that folder, and nothing balances the extra aiScanner load.

*Evidence:* l5-nagranie-podatek: justifying phone and aiScanner. S7-60: 'requiredStamps 2 on l5-nagranie-podatek (phone + AI)'. levels/l5-deepfake.json has an aiScanner outage at 170 s.

*Fix:* State whether hint-only stamps count toward requiredStamps. Make checkStoryFitsLevel, the endless isSolvable check and checkBag apply that rule. Otherwise choose a different l5 N=2 story, such as l5-zdjecie-sprzed-lat after it gains E.

### [minor] Batch-marking task status at the end breaks repo rule 8.

*Evidence:* AGENTS.md rule 8: 'keep its status up to date in the same commit as the work'. S7-106: 'implementation-plan: every Stage 7 row is marked done with refs'.

*Fix:* Each S7 task ticks its own row in its own commit; S7-106 only verifies.

### [minor] The doc map misses stale contest docs and does not pin down the room-list item fields.

*Evidence:* docs/contest/how-to-play.pl.md describes roles, stations and scoring that Stage 7 changes, and is not in the doc map. Decision 10 requires the list to show level, mode, difficulty, players/spectators count, host nickname and an in-game flag, but S7-78/83 only say 'rooms.ts: schemas'.

*Fix:* Add how-to-play.pl.md to S7-47, S7-66 and S7-93. List the roomSummarySchema fields in S7-78 and assert them in api.test.

### [minor] Bundle and asset-path risks in M7.

*Evidence:* S7-103 imports CREDITS.md from apps/client/public via ?raw and LICENSE from the repo root. Vite discourages importing from public/, and the dev server needs server.fs.allow for files outside apps/client. Separately, four minigames, abilities, versus and the spectate screen all go into the game chunk under the BUDGET.gameMax 1.6 MB gzip guard (tools/perf/check-bundle.ts), and no task measures that growth.

*Fix:* Move the credits source under src/ (copied to public at build time) or fetch it at runtime. Record the gameMax figure in S7-56, S7-66 and S7-90, and lazy-load minigames per station kind if it grows beyond the guard.

### [minor] Smaller follow-ups.

*Evidence:* - LevelCard.tsx:50 shows level.schedule.length, which after S7-23 is the preview count and not the run's folder count for the chosen difficulty.
- S7-26 does not specify a default for leaderboard_entries.difficulty on existing rows.
- 'In-engine animation' (decision 7) becomes 'scenes built from the UI kit' (DOM) without saying so explicitly.
- §6 says ENDLESS_LAYOUT 'becomes' 24×14, but it already is.

*Fix:* LevelCard reads roomState.run.folders when present. Give the Drizzle column `.notNull().default('normal')`. Add a Decision log row defining 'in-engine' as live-rendered client UI, not video. Correct the endless layout wording.

## Decision coverage (first draft)

| Decision | Covered | Where |
| --- | --- | --- |
| 1 Multi-stamp folders (N=2-3 distinct justifying stamps on l4-l6 and endless) | yes | S7-16, S7-18; picks in S7-33 (l4), S7-60 (l5), S7-63 (l6). l5-nagranie-podatek needs a rule for hint-only stamps. |
| 1a Desk multi-select, cite all | yes | S7-03 (array command), S7-19 (desk-model, VerdictView multi-select) |
| 1b +20 s per extra required stamp (constant) | yes | S7-16 MULTI_STAMP_EXTRA_DEADLINE_MS, S7-18 spawnFolderAt, bag clamp in S7-21 |
| 1c Score bonus per extra stamp | yes | S7-16 SCORE.multiStampBonus, S7-18 evaluateVerdict, maxStoryScore |
| 1d Folder card progress '0/2' | yes | S7-19 evidenceBadge; Ekspert shows ×N (S7-24). Ordering: S7-19 needs the S7-24 selector. |
| 2 Stop queueing at one station: fix via the bag, duplicate station only if needed | yes | S7-20..S7-22 bag; station-load table in S7-34; duplicate-station rule in S7-35/S7-66. Must use justifying stamps, not decisive ones. |
| 3 Tetris station bag for campaign and endless, every attempt differs | yes | S7-20, S7-21, S7-22, S7-23 (prepareRun at beginBriefing, new run seed per replay) |
| 3a New stories for under-used stations (reviewed:false) | yes | S7-27..S7-33 (34 stories), S7-59..S7-63. l5 is short by about 2 stories. |
| 3b Star thresholds adapt to the generated run and are explainable | yes | S7-20 starThresholds, S7-21 run stars, S7-06 'Skąd te progi?', S7-25 briefing thresholds, S7-87 lobby share rule |
| 4 Kartoteka: same card after failure (no reroll) | yes | S7-13 minigameSeedFor with MINIGAME_STABLE_SEED_STATIONS (cancel and peek loophole noted) |
| 4a Kartoteka: no answer reveal on failure | yes | S7-14 (drops data-missed and the reveal), S7-24 revealOnFail is false for stable-seed stations |
| 4b Kartoteka: correctly circled fields stay on retry | yes | S7-14 retry-memory store; per client only, logged |
| 5 Active abilities button R / RB / 4th touch button, ~60 s cooldown | yes | S7-36 (ABILITY at 60000), S7-39 input, S7-40 chip and touch button |
| 5a Ekspertyza for photoEditor (image family) and archivist (documents family) | yes | S7-36 STATION_FAMILY, S7-38 sim, S7-41 overlay header action |
| 5b Reporter: Telefon z terenu | yes | S7-37 fieldCall and progressFieldCalls; stampApplied.via |
| 5c Managing editor: +20 s to any folder, on cooldown | yes | S7-37 extendDeadline ability. The target is auto-picked, not chosen ('any folder'); needs a Decision log row or a target-cycling option. |
| 5d New class Wszechstronny: 20% faster everywhere plus Druga szansa | yes | S7-43 (otherWorkFactor 0.8), S7-38 secondChance, S7-41 LockoutNote |
| 5e New class Ratownik: automatic rescue once per level plus Podaj teczkę | yes | S7-37 rescueCarriedFolders, S7-38 passFolder and pickPassTarget, S7-43 role |
| 5f Roles optional and non-exclusive | yes | Kept: S7-44 picker includes 'Bez roli' |
| 5g Role and ability state visible in the HUD | yes | S7-40 AbilityChip (keyboard and gamepad), AbilityButton (touch), design-rules amendment |
| 5h Abilities explained in the tutorial | yes | S7-45 tutorial ability step; S7-99/S7-102 intro roles scene |
| 6 Four new stations | yes | S7-48 contract, S7-51 models, S7-52..S7-56 minigames |
| 6a Mapa (geolocation) | yes | S7-55 |
| 6b Stenogram (transcript) | yes | S7-53 |
| 6c Inne media (crossCheck, SIFT 'find better coverage') | yes | S7-54 |
| 6d Metadane (metadata/EXIF) | yes | S7-52 |
| 6e l5 gets Stenogram + Metadane | yes | S7-57, S7-59, S7-60 |
| 6f l6 gets Mapa + Inne media | yes | S7-58, S7-61..S7-63 |
| 6g Endless gets all 10 stations | yes | S7-64 |
| 6h l5/l6 maps grow to about 24x14 | yes | S7-57, S7-58; sun fit in S7-49; framing tests from S7-12 |
| 6i Every l5/l6 story gets stamps for the new stations | yes | S7-57 (34 stamps), S7-58 (40 stamps); stamps.max(10) in S7-48 |
| 7 Animated intro before the training level | yes | S7-98..S7-102 |
| 7a In-engine animation, not video | yes | S7-101 scenes built from the UI kit (DOM). What 'in-engine' means should be stated in the Decision log. |
| 7b Intro adapts to input device | yes | S7-99 device-variant clips, S7-101 |
| 7c Subtitles always on | yes | S7-101 always-on SubtitleBar, S7-99 subtitleChunks |
| 7d Polish voiceover generated offline with TTS | yes | S7-100 Piper. The licence chain is unverified and conflicts with the agents/game-feel.md CC0 rule. |
| 7e Voice easily replaceable by a human recording | yes | S7-100 --recordings flag and voice-sprite.json |
| 7f Intro skippable | yes | S7-101 Pomiń, S7-102 seen flag |
| 7g Intro replayable from menu and settings | yes | S7-102 'Obejrzyj wprowadzenie' in settings; 'Jak grać' Wprowadzenie tab (S7-96) |
| 8 Versus: separate identical newsrooms (same level, seed, folder stream) | yes | S7-79, S7-80. Seeds and rivalResults are keyed by folderId, which diverges across teams; needs a spawnKey. |
| 8a Live opponent score | yes | S7-80 snapshot scoreboard, S7-89 VersusChip |
| 8b Room up to 8 players, 1v1..4v4, uneven teams allowed | yes | S7-77 MAX_ROOM_PLAYERS 8 and MAX_TEAM_PLAYERS 4, S7-80 setMode and setTeam |
| 8c Higher score wins; credibility 0 means that team loses | yes | S7-78 versusOutcome, S7-80 |
| 8d Spectators see both teams at once (split screen) | yes | S7-90 spectate-layout. Phones always get a single view; needs a Decision log row. |
| 8e Spectator follows a player (camera, folder, station or minigame state, no answers) | yes | S7-91 FollowCard. The feed still leaks rival verdicts in versus. |
| 8f Spectator scoreboard and live event feed (verdicts, blunders, expiries, abilities) | yes | S7-90 scoreboard, S7-91 feed-model and EventFeed |
| 8g Live per-player stats (resolved, accuracy, stamps, minigame fails) | yes | S7-78 match-stats, S7-81 matchStats at 1 Hz, S7-91 StatsSheet |
| 8h Spectators allowed in co-op (teacher on a projector) | yes | S7-81, S7-90 (1 canvas in co-op) |
| 9 Difficulty: four levels chosen by the host in the lobby | yes | S7-16 presets, S7-23 setDifficulty, S7-25 picker |
| 9a Scales folder time, spawn gaps, work time, minigame time, penalties | yes | S7-16, S7-17 (work, lockout, penalties), S7-21 (gaps, deadlines), S7-24 (minigame time and mistakes) |
| 9b Ekspert: no hints, no reveal, harsher penalties | yes | S7-24 effective-hints selector and revealOnFail, S7-16/S7-17 penalties |
| 9c Stars and progress stored per difficulty | yes | S7-26 progress v2 with migration |
| 9d Endless leaderboard per difficulty | no | S7-26 covers only the DB, API and schemas. The client LeaderboardDialog and use-leaderboard filter are missing. |
| 10 Room browser | yes | S7-83 API, S7-88 UI |
| 10a Rooms private by default; host can make them public | yes | S7-82 setVisibility, defaultVisibility private |
| 10b List shows level, mode, difficulty, players/spectators, host nickname, in-game flag | no | S7-78/S7-83 do not list the item fields; they need to be enumerated and asserted. |
| 10c Search and filters | yes | S7-78 foldSearch, S7-83 filters, S7-88 UI |
| 10d Join as player only in lobby; as spectator also mid-game | yes | S7-80 matchInProgress, S7-81 spectator in any phase. The browser also allows joining as player in results, and co-op code join mid-game is kept; both are deviations to log. |
| 10e Host can kick | yes | S7-82 kick with close 4002, S7-87 MemberSheet. No rejoin cooldown. |
| 11 AdSense configurable in server config.json | yes | S7-67 public-config schemas, S7-68 loader, S7-70 CSP and ads.txt |
| 11a Config holds enable, ca-pub id, slot ids, allowed domains (incl. bronsie.drkp.dev), ads.txt lines, CSP | yes | S7-67 (hostAllowed test with bronsie.drkp.dev), S7-70 (/ads.txt, config-driven CSP) |
| 11b Ads off by default | yes | S7-68 defaults; S7-74 'no Google request without config' |
| 11c Ads only on menu, lobby, results and spectator view, never in gameplay or minigames | yes | S7-73 adEligible and pause guard, S7-74 placements and e2e, S7-91 spectator slot. Mobile excluded; to log. |
| 11d Consent via Google's certified CMP | yes | S7-73 openConsentSettings, S7-74 'Zgody reklamowe' link, S7-76 CMP checklist. Under-16 consent validity is unresolved; needs a limited-ads gate. |
| 11e Non-personalised ads only | yes | S7-73 NPA set before load |
| 11f Privacy note rewritten | yes | S7-75 full rewrite plus /prywatnosc page |
| 12 Server-side config.json for global settings and feature flags | yes | S7-67, S7-68 (hot reload, SIGHUP), S7-69 /api/config. All flags default to true, which is too permissive. |
| 13a In-game menu sheet replacing tool buttons and room chip (settings, station help, room code, leave) | yes | S7-10 GameMenu, S7-97 'Pomoc: stanowiska' row. It does not pause; needs a Decision log row. |
| 13b Lobby management: kick, host transfer, room name | yes | S7-82 server, S7-86 name field, S7-87 MemberSheet |
| 13c Level details for guests (stations, events, star thresholds) | yes | S7-87 LevelDetailsSheet (thresholds shown as shares; run thresholds in the briefing, S7-25) |
| 13d 'O grze' screen (authors, licences/CREDITS, privacy, version) | yes | S7-103. CREDITS path and ?raw import need fixing. |
| 13e Player profile: local stats (levels played, accuracy, favourite class) | yes | S7-104 profile-model on shared match-stats |
| 13f Profile colour and accessory choice | yes | S7-104 local, S7-105 over the wire (protocol v8) |
| 14a Fix 'Zabrakło': only on errors, explicit wording, correct verdict and deciding station | yes | S7-03 (missedStampIds [] on correct), S7-04 desk-result-model, S7-07 |
| 14b End-of-level feedback: points, stars, why (reasons, totals, thresholds, points to next star, loss reason, unfinished) | yes | S7-03 reasons, lossReason and unfinished; S7-05 model; S7-06 summary; S7-07 Kolegium |
| 14c Next-folder timer: ghost card, conveyor ring, events not telegraphed, 'Taśma pełna' | yes | S7-08 snapshot nextFolder and conveyorFull, S7-09 UI and cue |
| 14d Mobile HUD: one-row pill, menu button, HUD-aware follow camera | yes | S7-10, S7-11, S7-12 (phone-small project) |
| 14e Station how-to: first-use card pausing the timer, '?', 'Jak grać → Stanowiska' practice, touch KeyHints | yes | S7-15 touch hints and stationHelp, S7-94/S7-95 card and pause, S7-96/S7-97 tab and practice. design-rules §1.2 is not amended. |
