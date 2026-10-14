# Balance (S6-01, S7-35, S7-46)

Status: **bot simulations only, not confirmed by humans.** Bots are not students. The numbers
below say how the levels behave for the bot models described here; the real playtest data (S3-09
kit, `docs/playtests/`) must still confirm or overturn them. Re-run `bun run balance` after every
change to content, `constants.ts` or the bag.

The current numbers are the **S7-35 pass** (Stage 7, M2): every campaign level and endless on all
four difficulties, after the station bag (S7-20..S7-22), multi-stamp folders (S7-18), the AI
scanner as a hint only (S7-03) and the l0–l4 bag content (S7-27..S7-33). The **S7-46 pass** (M3)
adds the role abilities to the bots and the role presets; its results are in "Abilities (S7-46)"
below and every cooldown stays at 60 s. The S6-01 pass (authored schedules, Normal only) is
summarised at the end.

## Method

`bun run balance` (`tools/balance/`) plays every campaign level and a generated endless level with
bot crews through the **real** `step()` from `@redakcja/shared`: real map, real `STATION_WORK_MS`
and role bonus, real `MINIGAME_FAIL_LOCKOUT_MS`, real walking speed and map distances (bots
path-find over the tile map and send the same inputs and commands a client sends). Nothing in the
game rules is mocked. Every run is the one a room would play: `prepareLevelRun(level, {seed,
difficulty})` deals it (a bag level gets its own schedule and star thresholds per seed, endless its
own schedule, an authored level its scaled deadlines), and the sim runs with that difficulty's
`simTuning`. A run is deterministic: the run seed deals the run and seeds the sim and every bot
(`tools/balance/game.ts`); the report on stdout is the same for the same matrix whatever the worker
count (timing goes to stderr).

Options: `--seeds N` (default 50), `--endless-seeds N` (default 24), `--levels a,b` (default l1–l6
and endless; add `l0-greybox` for the tutorial), `--no-endless`, `--difficulty
easy,normal,hard,expert` (default `normal`), `--crew-sizes 3` (only the matrix crews of those sizes,
a quick pass), `--roles mixed|rescue|generalists` or a role per seat (`reporter,rescuer,none`;
S7-46), `--no-abilities` (bots never press their ability; Koło ratunkowe stays passive),
`--workers N`, `--json file`, `--md`.

Output per level, difficulty and crew: win rate (survived with a positive score), star
distribution, score p10/p50/p90 and as share of the run's best possible score, minimum credibility,
credibility trajectory (tenths of the level), share of expired folders, share of wrong verdicts or
wrong justifications, time to first verdict, events started per run. Endless: survival time
distribution (runs are cut at 20 min). Then a **station-load** table (average crews of three and
four: share of level time each station had a folder or an operator, with the busiest / least busy
spread), the **ability use** per run of the average crews (abilities that took effect, by ability,
and Koło ratunkowe rescues; S7-46) and the pass/fail checks against the intent below, including
"no bot stalls" (no bot watchdog fired: a bot never gave up waiting at a station, a desk or a field
call).

**The S7-35 matrix:** l0–l6 and endless × easy, normal, hard, expert × the 8 matrix crews,
**24 seeds per campaign level and 8 per endless crew** (5632 runs, about 19 min on 4 workers on a
shared, heavily loaded machine). Tuning passes used crews of three only with 12 seeds (all levels,
4 difficulties: 1440 runs) and 40 seeds on the level being tuned. With 24 seeds a share moves by
about ±10 points between seed sets; treat single-digit differences as noise.

### Bot models (`tools/balance/models.ts`, all assumptions)

Roles by crew size (`--roles mixed`, the default): 1 = Wszechstronny (generalist, S7-43); 2 = photo
editor, archivist; 3 = + reporter; 4 = + managing editor. `--roles rescue` puts a Ratownik in the
last seat instead (×3 photo editor, archivist, Ratownik; ×4 photo editor, archivist, reporter,
Ratownik); `--roles generalists` makes everyone Wszechstronny.

| Parameter | rookie | average | expert |
| --- | --- | --- | --- |
| Pause before next job | 1.5-3.5 s | 0.6-1.5 s | 0.25-0.7 s |
| Reading time at the desk | 4-8 s | 2.5-4.5 s | 1.5-3 s |
| Walking speed used | 80% | 92% | 97% |
| Minigame failure (x station factor) | 35% | 15% | 3% |
| Minigame duration (x base 6-11 s) | 1.5 | 1.0 | 0.75 |
| Knows which station holds the decisive stamp | 25% | 60% | 100% (optimal routing) |
| Recognises a justifying stamp | 70% | 92% | 97% |
| Correct verdict with / without justifying stamp | 80% / 35% | 95% / 45% | 98% / 60% |
| Cites the wrong stamp | 35% | 10% | 2% |
| Skips "normal" folders | 50% | 0 | 0 |
| Stations tried per folder | 3 | 4 | 6 |
| Obeys a boss call unchecked | 40% | 10% | 0 |
| Files a correction at once | 50% | 90% | 100% |
| Uses the role ability at all (`usesAbility`, per bot and run; policies below) | never | 50% | always |

Teamwork: an idle bot claims the next folder on the conveyor (rookies first come first served,
others by deadline and priority), then carries it through the stations it chooses and to a free
desk. Bots wait for busy stations, avoid stations that are down and retry after a failed
minigame. "Mixed" is rookie + average + expert.

Ability policies (S7-46, `abilityPolicy` in `tools/balance/bot.ts`): a bot that uses its ability
presses it only when the shared `abilityPreview` says the press does something, as the HUD would.
Przedłużenie: a folder the team works on has under 5 s left and the preview targets it. Ekspertyza
and Druga szansa: armed whenever the preview offers `arm` (so the next covered minigame is skipped,
or the next failed minigame reopens at once), or pressed `now` at the bot's own station. Telefon z
terenu: when the bot's plan sends a folder to the phone and the preview offers the call for it, the
bot calls instead, stands still with the folder until the stamp lands (6 s) and counts the phone as
visited. **Podaj teczkę is not modelled:** the bots share work by claims and never hand folders
over, so a pass would only move a folder between two bots that both know the plan; whether students
use it to save walking can only be measured in playtests. The Ratownik bot therefore plays as a
role without a speed bonus whose Koło ratunkowe saves a folder only when it carries one to its
deadline.

Per difficulty and multi-stamp (S7-34, also assumptions): the minigame failure chance is
multiplied by `DIFFICULTY_FAIL_FACTOR` (easy 0.75, normal 1, hard 1.15, expert 1.4), halved
(`RETRY_FAIL_FACTOR`) when the same bot retries a folder at a station that keeps its card
(`MINIGAME_STABLE_SEED_STATIONS`, the Kartoteka), and capped at 90 %; an attempt that reaches the
difficulty's minigame time limit fails. A bot treats a folder as ready once it holds as many
proofs as the story requires (the AI scanner's hint never counts), heads first for the folder's
bag station, and cites that many stamps at the desk (proofs first); a wrong justification swaps
one cited stamp for a held stamp that proves nothing.

### Limits (read before trusting any number)

- All behaviour numbers are guesses. Real students differ in ways the bots cannot show: confusion
  about the UI, reading speed, social dynamics, mobile controls, boredom, fun.
- The expert is an optimal-play ceiling, not a typical good player. Its score share (90-96 %)
  is the practical maximum; "3 stars" mainly separates it from the others.
- Bots never get lost, never bump into each other, never talk, never park folders on tables
  and share the work perfectly. Real teams are probably slower and uneven, so real difficulty is
  probably higher than shown here.
- Whether players can tell which stations carry a stamp is modelled with the "knows the
  decisive station" probability; the real UI may make this easier or harder.
- The minigame duration and failure model is a flat estimate per station; the real minigames
  were never timed by humans.
- Win means "credibility above 0 and score above 0 at the end"; this is easy to reach with
  few wrong verdicts. The star distribution and score share are the sharper signals.
- Abilities are pressed at the best moment the preview allows, with no reaction delay and no
  forgotten cooldowns (50 % of average bots, every expert). Podaj teczkę is never used, so the
  Ratownik and the `rescue` preset are under-represented (see the bot models).
- Crew size matters little for the bots: on Normal the average crews of two, three and four
  score within 4 points of each other on l0–l2; from l3 on the crew of two loses 3–8 points and the
  fourth bot adds 2–4. Stations are busy at most 36 % of a Normal campaign level, so the third and
  fourth bot often wait (endless is the exception). Real crews of 3–4 probably lose time to each
  other; the playtests must say whether levels need more folders for bigger crews.

## Intent

Normal (the S6-01 targets): level 1 winnable by rookies (>= 80 %), 2 stars within reach of average
crews, 3 stars mostly experts; the tutorial (l0 Makieta) at least as winnable for rookies as level
1; later levels progressively harder, but a competent crew of 3 wins >= 60 % at level 6; no level
unwinnable or trivially maxed; star thresholds near 55 % / 80 % of the best possible score; endless
ramps so that average crews last 6–10 minutes.

Difficulties (S7-35, `DIFFICULTY_TARGETS` in `tools/balance/report.ts`):

- **Ladder:** on every level the average crew of three never wins more often, never scores a
  larger share of the run's best and (endless) never lasts longer on a harder difficulty.
- **Easy:** a first-time crew (rookies ×3) wins every level >= 80 %.
- **Hard:** the average crew of three still wins every level >= 80 %.
- **Expert:** the expert crew of three still reaches 2+ stars >= 80 % everywhere, and the average
  crew of three still wins >= 50 %.

Station load (S7-35, user decision 2): the station bag should spread the work; the l1 and l3
spread must be lower than before the bag. A station is **dominant** when, for an average crew of
three or four on Normal, it is busy more than 50 % of the level **and** more than twice as long as
the least busy station (`dominantStation`). Only a dominant station gets a duplicate fixture.

## Findings before the S7-35 changes

Measured on the merged M2 state (12 seeds, crews of three, all four difficulties; 40 seeds where
stated):

- Every Normal check passed at 12 seeds except endless (average ×3 median exactly 10.0 min, on the
  edge). At 40 seeds the l1 average crew reached 3 stars in 38 % of runs (target <= 30 %) with
  `starShares` 0.55 / 0.85: the bag's fifteen folders left enough slack for the speed bonus.
- The tutorial was harder for rookies than level 1: l0 rookies ×3 won 67 % (l1: 83 %), with 38 %
  of folders expired; ten folders in 240 s on three stations.
- `validate:content` warned that l0's last slot window (175 s + 90 s for an important folder) ran
  past its 240 s; the generator cut late folders short.
- Difficulty ladder: monotonic on every level (win rate and score share), endless survival
  17.6 / 10.0 / 7.9 / 5.7 min from easy to expert. No difficulty needed a new factor.
- Station load: spread 1.0–1.5 on l0–l4, busiest station 34 % of a Normal level; nothing near
  dominant.

## Changes (S7-35, data only)

1. **l0 Makieta bag:** `gapS` 18 → 22, `lastSpawnS` 175 → 165, important deadline 90 → 75 s
   (normal 75, urgent 50, `starShares` 0.5 / 0.8 unchanged). Folders by difficulty 8 / 10 / 11 / 12
   → **7 / 8 / 9 / 10**; the Normal preview's max 240 → 180 (★★ 90, ★★★ 145). Rookies now win
   the tutorial 88 % and the deadline-fit warning is gone (165 + 75 = 240 s).
2. **l1 Burza bag:** `gapS` 22 → 20, deadlines normal 55 → 50 s, important 60 → 55 s (urgent 40,
   `starShares` 0.55 / 0.85 unchanged). Folders 12 / 15 / 16 / 18 → **13 / 16 / 18 / 20** (the
   20-story pool covers Expert exactly). Average crews reach 3 stars in 21 % of runs (was 38 % at
   40 seeds); rookies still win 92 %.
3. **Endless:** `ENDLESS.intervalFactorPerMinute` 0.9 → 0.88 (the folder interval shrinks a bit
   faster). Average ×3 median 10.0 → 8.5 min; experts reach the 20 min cap in 13 % of runs (was 17 %).
4. **Kept:** `DIFFICULTY` presets (every ladder and per-difficulty target passes, each step costs
   the average crew 5–21 points of score share), `STAR_SHARES` 0.55 / 0.8, l2–l4 bag timing and
   deadlines, `BAG_FLEX_CHANCE` 0.3 (spread already 1.0–1.4 on Normal l0–l4; more flex would
   only move work between stations that are all under half busy).
5. **No duplicate station** (user decision 2): no station dominates any crew of 3–4 on any level
   or difficulty (busiest: 36 % on a Normal campaign level, 44 % in Normal endless ×4, 50 % at most
   anywhere, the endless archive on Expert ×4, whose 2.7 spread comes from the hint-only AI scanner). Re-checked in S7-66 with the new stations.

## Results (S7-35, crews of three, 24 seeds)

Per cell: win % / 2+ stars % / 3 stars % / score as % of the run's best. Folders and thresholds are
the mean over the dealt runs; l5 and l6 still played authored schedules (fixed thresholds) here;
l5 has dealt from a bag since S7-60 (see *l5 on the bag* below).

| Level | Difficulty | Folders (mean) | Stars at | Rookie ×3 | Average ×3 | Expert ×3 | Mixed ×3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| l0 | easy | 7.0 | 85 / 132 of 165 | 100 / 42 / 0 / 47 | 100 / 100 / 71 / 88 | 100 / 100 / 100 / 99 | 100 / 96 / 17 / 73 |
| l0 | normal | 8.0 | 95 / 152 of 190 | 88 / 8 / 0 / 24 | 100 / 100 / 67 / 83 | 100 / 100 / 96 / 98 | 100 / 79 / 13 / 63 |
| l0 | hard | 9.0 | 109 / 171 of 214 | 42 / 0 / 0 / -1 | 100 / 92 / 38 / 72 | 100 / 100 / 96 / 96 | 96 / 42 / 0 / 49 |
| l0 | expert | 10.0 | 118 / 189 of 236 | 8 / 0 / 0 / -19 | 100 / 67 / 13 / 61 | 100 / 100 / 83 / 91 | 100 / 21 / 0 / 37 |
| l1 | easy | 13.0 | 174 / 268 of 316 | 100 / 33 / 0 / 46 | 100 / 100 / 58 / 86 | 100 / 100 / 96 / 97 | 100 / 87 / 8 / 69 |
| l1 | normal | 16.0 | 216 / 334 of 393 | 92 / 0 / 0 / 16 | 100 / 92 / 21 / 75 | 100 / 100 / 92 / 93 | 100 / 58 / 0 / 55 |
| l1 | hard | 18.0 | 244 / 378 of 443 | 42 / 0 / 0 / 1 | 100 / 75 / 4 / 60 | 100 / 100 / 67 / 87 | 100 / 4 / 0 / 38 |
| l1 | expert | 20.0 | 270 / 415 of 490 | 4 / 0 / 0 / -14 | 100 / 29 / 0 / 44 | 100 / 96 / 42 / 80 | 83 / 0 / 0 / 19 |
| l2 | easy | 12.0 | 165 / 240 of 300 | 100 / 0 / 0 / 32 | 100 / 100 / 58 / 82 | 100 / 100 / 100 / 97 | 100 / 79 / 13 / 66 |
| l2 | normal | 15.0 | 206 / 303 of 378 | 63 / 0 / 0 / 3 | 100 / 92 / 13 / 68 | 100 / 100 / 100 / 96 | 100 / 25 / 0 / 46 |
| l2 | hard | 16.0 | 222 / 324 of 404 | 21 / 0 / 0 / -7 | 100 / 54 / 0 / 54 | 100 / 100 / 92 / 90 | 100 / 8 / 0 / 34 |
| l2 | expert | 18.0 | 250 / 360 of 450 | 4 / 0 / 0 / -19 | 100 / 13 / 0 / 39 | 100 / 100 / 50 / 79 | 96 / 0 / 0 / 19 |
| l3 | easy | 15.0 | 205 / 300 of 375 | 96 / 0 / 0 / 28 | 100 / 100 / 46 / 75 | 100 / 100 / 100 / 95 | 100 / 87 / 4 / 64 |
| l3 | normal | 18.0 | 245 / 356 of 445 | 58 / 0 / 0 / 4 | 100 / 75 / 4 / 62 | 100 / 100 / 92 / 93 | 100 / 33 / 0 / 48 |
| l3 | hard | 19.0 | 255 / 372 of 465 | 29 / 0 / 0 / -4 | 100 / 33 / 0 / 48 | 100 / 100 / 79 / 85 | 100 / 13 / 0 / 39 |
| l3 | expert | 21.0 | 282 / 408 of 510 | 0 / 0 / 0 / -15 | 96 / 0 / 0 / 32 | 100 / 96 / 42 / 77 | 96 / 0 / 0 / 29 |
| l4 | easy | 12.0 | 168 / 244 of 305 | 96 / 0 / 0 / 23 | 100 / 100 / 62 / 79 | 100 / 100 / 100 / 96 | 100 / 62 / 4 / 58 |
| l4 | normal | 15.0 | 208 / 303 of 380 | 58 / 0 / 0 / 4 | 100 / 62 / 0 / 58 | 100 / 100 / 83 / 90 | 100 / 21 / 0 / 44 |
| l4 | hard | 16.0 | 222 / 323 of 404 | 8 / 0 / 0 / -11 | 100 / 21 / 0 / 42 | 100 / 100 / 75 / 83 | 100 / 8 / 0 / 38 |
| l4 | expert | 18.0 | 254 / 368 of 460 | 0 / 0 / 0 / -19 | 92 / 0 / 0 / 23 | 100 / 100 / 46 / 78 | 96 / 0 / 0 / 22 |
| l5 | easy | 17.0 | 240 / 350 of 435 | 100 / 0 / 0 / 23 | 100 / 100 / 25 / 70 | 100 / 100 / 100 / 94 | 100 / 75 / 0 / 62 |
| l5 | normal | 17.0 | 240 / 350 of 435 | 63 / 0 / 0 / 3 | 100 / 50 / 0 / 52 | 100 / 100 / 87 / 87 | 100 / 13 / 0 / 40 |
| l5 | hard | 17.0 | 240 / 350 of 435 | 38 / 0 / 0 / -5 | 100 / 4 / 0 / 39 | 100 / 100 / 46 / 80 | 100 / 4 / 0 / 32 |
| l5 | expert | 16.9 | 240 / 350 of 435 | 4 / 0 / 0 / -19 | 92 / 4 / 0 / 27 | 100 / 100 / 4 / 75 | 75 / 0 / 0 / 11 |
| l6 | easy | 27.0 | 250 / 360 of 450 | 100 / 0 / 0 / 21 | 100 / 92 / 25 / 73 | 100 / 100 / 96 / 94 | 100 / 83 / 4 / 64 |
| l6 | normal | 27.0 | 250 / 360 of 450 | 42 / 0 / 0 / 1 | 100 / 46 / 0 / 54 | 100 / 100 / 87 / 89 | 100 / 17 / 0 / 45 |
| l6 | hard | 26.9 | 250 / 360 of 450 | 4 / 0 / 0 / -10 | 96 / 25 / 0 / 42 | 100 / 100 / 71 / 85 | 92 / 0 / 0 / 34 |
| l6 | expert | 25.8 | 250 / 360 of 450 | 0 / 0 / 0 / -15 | 63 / 8 / 0 / 28 | 100 / 100 / 46 / 76 | 33 / 0 / 0 / 14 |

Endless, median survival in minutes (p10–p90), 8 seeds per crew:

| Difficulty | Rookie ×3 | Average ×3 | Expert ×3 | Mixed ×3 | Average ×2 | Average ×4 |
| --- | --- | --- | --- | --- | --- | --- |
| easy | 9.8 (8.9–10.6) | 16.6 (15.3–18.2) | 20.0 (20.0–20.0), 100 % capped | 18.7 (15.9–20.0), 25 % capped | 14.2 (12.5–15.6) | 20.0 (20.0–20.0), 88 % capped |
| normal | 5.4 (4.6–6.1) | 8.5 (7.5–9.9) | 16.1 (15.4–17.1), 13 % capped | 10.3 (9.0–10.9) | 7.0 (6.3–8.0) | 10.4 (8.7–11.0) |
| hard | 4.5 (3.5–4.8) | 7.0 (6.0–7.8) | 12.1 (11.0–12.7) | 7.5 (6.1–8.2) | 5.5 (4.8–6.0) | 7.7 (6.7–9.1) |
| expert | 3.5 (2.8–3.7) | 5.1 (4.7–5.5) | 9.0 (8.7–9.3) | 6.0 (4.6–6.7) | 4.1 (3.6–4.6) | 5.8 (4.5–6.4) |

### Station load before and after the bag

Average crew, Normal, 40 seeds for the pre-bag schedules, 24 for the bag. "Before" plays the
authored schedule the level had before its bag task (`git show 476673a^:packages/content/levels/l1-burza.json`,
`git show a02b7a0^:packages/content/levels/l3-afera.json`) under today's rules and stories.

| Level | Crew | Before the bag (busy share by station) | Spread | With the bag | Spread |
| --- | --- | --- | --- | --- | --- |
| l1 | ×3 | image 33 %, registry 37 % | 1.12 | image 36 %, registry 35 % | 1.0 |
| l1 | ×4 | image 33 %, registry 37 % | 1.12 | image 36 %, registry 35 % | 1.0 |
| l3 | ×3 | image 20 %, archive 24 %, registry 24 %, phone 31 % | 1.59 | image 23 %, archive 28 %, registry 24 %, phone 28 % | 1.2 |
| l3 | ×4 | image 20 %, archive 24 %, registry 25 %, phone 33 % | 1.68 | image 26 %, archive 29 %, registry 24 %, phone 29 % | 1.2 |

Spread on Normal for the other levels: l0 1.1, l2 1.4, l4 1.1; l5 3.5 and l6 4.0 (authored
schedules; the AI scanner is a hint and rarely visited, so these drop when l5/l6 move to the bag in
M4); endless 2.6 (again the AI scanner). The full tables (all crews, crew sizes 2 and 4,
credibility trajectories, events per run) are printed by `bun run balance --levels
l0-greybox,l1-burza,l2-wybory,l3-afera,l4-zdrowie,l5-deepfake,l6-atak,endless --difficulty
easy,normal,hard,expert --seeds 24 --endless-seeds 8 --md`.

### Intent checks (S7-35 matrix)

All 35 checks pass: the ladder on l0–l6 and endless, the four per-difficulty targets, L0 rookies
88 %, L1 rookies 92 % / average 2+ stars 92 % / 3 stars 0 % · 21 % · 92 %, L6 average 100 %,
difficulty rises (average score share 75 > 68 > 62 > 58 > 52 > 54 % for l1–l6; l6 within the
8-point allowance), no level unwinnable or trivially maxed (expert 87–96 % of max), thresholds
55 % / 79–85 % of the preview max on l1–l6, no dominant station (busiest 44 %, Normal endless ×4), endless 8.5 min.

## Abilities (S7-46)

Measured on the merged M3 state with the S7-46 bot policies, l0–l6 and endless, crews of three
and four (`--crew-sizes 3,4`: rookies, average, experts and mixed ×3, average and rookies ×4),
**12 seeds per campaign level and 6 per endless crew**: `--roles mixed` on all four difficulties
(2160 runs), `--roles rescue`, `--roles generalists` and `--roles mixed --no-abilities` on Normal
(540 runs each); then **30 seeds** on l2 and l6 (Normal, with and without abilities, 720 runs;
×4 without the managing editor, 120 runs) and the cooldown variants below (30 seeds each, 420
runs). l5 and l6 were measured again after the new l6 (S7-58, S7-61: 24×14 with Mapa and Inne
media) landed: both on all four difficulties (12 seeds, 576 runs), Normal without abilities (144),
l6 at 30 seeds with and without abilities (360) and the l6 ladder at 30 seeds (480); the l6 numbers
below are the new level's. 6600 runs, about 28 min on 3 workers in all. With 12 seeds a
share moves by about ±15 points between seed sets, with 30 by about ±9.

**No stalls:** no bot watchdog fired in any of the 6600 runs (all presets, all difficulties). Every
`--roles mixed` check passes on all four difficulties except these, none of them about abilities:
"difficulty rises" (l6 scores more than l5, as without abilities: l5 45 % vs the new l6 57 %; l5
and l6 still play authored schedules until M4) and, at 12 seeds only, "no level trivially maxed" (expert
crew 97 % on l2; 96 % at 30 seeds). On the new l6 the win-rate ladder also fails by one run: the
average crew of three loses 1 of 30 runs on Normal and none on Hard (97 % vs 100 %; the same loss
happens without abilities, and the score share ladder 69 > 52 > 43 > 29 % holds).

Abilities that took effect per run, average crews on Normal (`--roles mixed`):

| Level | ×3 Ekspertyza | ×3 Telefon z terenu | ×4 Ekspertyza | ×4 Telefon z terenu | ×4 Przedłużenie |
| --- | --- | --- | --- | --- | --- |
| l0 | 1.3 | – | 1.3 | – | 0.0 |
| l1 | 1.4 | – | 1.4 | – | 0.3 |
| l2 | 2.4 | – | 2.2 | – | 0.9 |
| l3 | 1.8 | 0.7 | 1.7 | 0.6 | 1.4 |
| l4 | 1.0 | 0.3 | 0.8 | 0.4 | 1.7 |
| l5 | 3.2 | 0.4 | 3.3 | 0.6 | 1.8 |
| l6 (new, 30 seeds) | 2.6 | 0.3 | 2.5 | 0.1 | 1.5 |
| endless | 3.3 | 0.7 | 4.0 | 1.0 | 4.7 |

`--roles generalists`: Druga szansa 0.3–2.0 per run (endless 3.3 / 5.3). `--roles rescue`: Koło
ratunkowe saves 0–0.3 folders per run on the campaign levels (endless 0.7–0.8); average bots rarely
carry a folder to its deadline.

Effect on Normal, win / 2+ stars / 3 stars / score share in %, abilities off → on (`--roles mixed`,
12 seeds; l2 and l6 also at 30 seeds):

| Level | Average ×3 | Average ×4 | Expert ×3 |
| --- | --- | --- | --- |
| l0 | 100/100/75/82 → 100/100/75/82 | 100/100/75/82 → 100/100/75/82 | 100/100/92/98 → 100/100/92/96 |
| l1 | 100/100/17/79 → 100/100/17/80 | 100/100/17/79 → 100/100/17/80 | 100/100/100/94 → 100/100/100/94 |
| l2 (30 seeds) | 100/94/17/69 → 100/90/40/72 | 100/94/17/69 → 100/90/53/76 | 100/100/100/96 → 100/100/100/96 |
| l3 | 100/66/8/62 → 100/59/17/61 | 100/58/8/61 → 100/75/25/66 | 100/100/92/93 → 100/100/92/92 |
| l4 | 100/67/0/60 → 100/75/0/58 | 100/67/0/60 → 100/66/8/62 | 100/100/92/92 → 100/100/92/92 |
| l5 | 100/17/0/41 → 100/33/0/45 | 100/8/0/38 → 100/50/0/50 | 100/100/92/88 → 100/100/75/87 |
| l6 (new, 30 seeds) | 97/33/3/48 → 97/44/7/52 | 100/26/3/48 → 100/57/10/57 | 100/100/83/87 → 100/100/90/90 |

Endless, median survival on Normal (abilities off → on): average ×3 10.0 → 9.1 min, ×4 11.2 → 11.9,
experts ×3 15.6 → 18.4. The other presets on Normal (12 seeds, average ×3 score share l1–l6):
`rescue` 80 / 73 / 63 / 56 / 45 / 61 %, `generalists` 78 / 74 / 65 / 57 / 45 / 59 % (`mixed` 80 /
73 / 61 / 58 / 45 / 61 %; these l6 values are the old level's). With `generalists` rookies win l0
and l1 only 75 % (20 % faster
everywhere is less than 40 % at the stations they use most; rookies never press abilities); every
other check of the two presets matches `mixed`.

**Cooldowns: all stay at 60 s.** Abilities lift the average crews by 0–12 points of score share and
mostly turn 1-star runs into 2-star runs on the later levels, which is what they are for. The
written targets hold: the average crew of three or four reaches 3 stars on l1 in 17 % of runs
(target ≤ 30 %), the experts stay ≤ 97 % of max (30 seeds), the score-share ladder and every
per-difficulty target pass.
The one outlier is **l2**, where the average crew reaches 3 stars in 40 % (×3) and 53 % (×4) of
runs (17 % without abilities). Longer cooldowns do not fix it: Przedłużenie at 75 s or 90 s leaves
l2 ×4 at 50 % / 53 % (it is used 0.3–1.8 times a run, so a longer cooldown rarely binds), and
Ekspertyza at 90 s leaves l2 at 40 % (×3) / 43 % (×4) (30 seeds each); a ×4 crew without the
managing editor gets 40 %, so Przedłużenie adds about 13 points there. The gain comes from the
first press or two in a short level whose 3-star threshold sits close to what an average crew
scores, so it is a level question for the M4 balance pass (S7-66), not a cooldown one. The
cluster B proposals (Druga szansa 45 s, Podaj teczkę 30 s) are not adopted: Druga szansa is used
at most twice a level and Podaj teczkę is not modelled, so the bots give no reason to shorten them.

Re-run: `bun run balance --levels l0-greybox,l1-burza,l2-wybory,l3-afera,l4-zdrowie,l5-deepfake,l6-atak,endless
--seeds 12 --endless-seeds 6 --crew-sizes 3,4 --difficulty normal --roles mixed|rescue|generalists
[--no-abilities] --md`.

## l5 on the bag (S7-60, crews of three, 24 seeds)

Level 5 deals from a bag of its 23 non-event stories (two of them ask for two proofs) over six bag
stations; the boss calls and the AI scanner outage stay. The scope's bag `{4, 24, 340, 60/60/45}`
cost the average crew 5 points of score share against the old authored schedule on Normal (47 %
vs 52 %), because every folder in the 24×14 room needs a longer walk. A wider gap gives 13 Normal
folders instead of 15 (11 / 13 / 15 / 17 by difficulty) and pinned target 3 either way:

| `gapS` | Normal stars at | Average ×3 Normal | Average ×3 Easy | Average ×3 Expert |
| --- | --- | --- | --- | --- |
| 24 | 248 / 361 of 452 | 100 / 38 / 0 / 47 | 100 / 67 / 0 / 61 | 96 / 0 / 0 / 22 |
| **26 (kept)** | 220 / 320 of 400 | 100 / 42 / 0 / 49 | 100 / 92 / 17 / 66 | 88 / 0 / 0 / 21 |
| 28 | 220 / 320 of 400 | 100 / 46 / 0 / 49 | 100 / 80 / 13 / 65 | 92 / 4 / 0 / 22 |

The `gapS` sweep above ran before the bots pressed abilities (S7-46 policies, equal to today's
`--no-abilities`). `gapS` 26 keeps the ladder there (l4 58 % > l5 49 % ≥ l6 48 % for the average
crew on Normal) and the last Normal slot at 316 s, so a two-proof folder still ends by 396 s.
Full l5 rows at `gapS` 26 with abilities pressed (`--roles mixed`; folders are 13 / 15 / 17 / 19
with both boss calls):

| Level | Difficulty | Stars at | Rookie ×3 | Average ×3 | Expert ×3 | Mixed ×3 |
| --- | --- | --- | --- | --- | --- | --- |
| l5 | easy | 190 / 276 of 345 | 96 / 0 / 0 / 16 | 100 / 88 / 21 / 69 | 100 / 100 / 92 / 91 | 100 / 29 / 0 / 51 |
| l5 | normal | 220 / 320 of 400 | 46 / 0 / 0 / -1 | 100 / 50 / 0 / 51 | 100 / 100 / 92 / 88 | 100 / 0 / 0 / 38 |
| l5 | hard | 248 / 361 of 452 | 8 / 0 / 0 / -12 | 100 / 29 / 0 / 41 | 100 / 100 / 62 / 82 | 100 / 8 / 0 / 35 |
| l5 | expert | 280 / 406 of 508 | 0 / 0 / 0 / -19 | 96 / 0 / 0 / 27 | 100 / 100 / 58 / 79 | 100 / 0 / 0 / 25 |

Every intent check for l5 passes (thresholds 55 % / 80 % of the run maximum, expert crew ≤ 88 % of
max; on Normal the score-share ladder reads l4 57 % > l5 51 %, and l6 52 % stays within the
8-point allowance). The station spread falls from 3.5 to 2.8 on Normal: the six bag stations are
11–17 % busy and only the hint-only AI scanner (6 %) is below that; Ekspertyza takes effect 2.6
times a run. Reproduce with `bun run balance --levels l4-zdrowie,l5-deepfake,l6-atak --difficulty
easy,normal,hard,expert --crew-sizes 3 --seeds 24 --md` (1152 runs, no watchdog fired; the one
failing check, the l6 win-rate ladder, is the authored l6 and S7-63's). S7-66 re-runs the whole
matrix for M4.

## Open points for the playtests

- Does a first-time crew really win level 1 (the rookie model says 92 %), and the tutorial (88 %)?
  Compare with `results-log.md`.
- Is Easy too easy? Average bots reach 3 stars on Easy in 25–71 % of runs and last 16.6 min in
  endless (Normal 8.5). It is meant for a first lesson; watch whether classes stay on it.
- Expert is meant to be harsh: rookies never win it, experts get 3 stars in 4–83 % (l5 4 %).
- Crew size: see the limits above; bigger crews may need more folders.
- Time to first verdict: bots need 22–27 s on level 1 (rookies 53 s). If humans need much longer,
  the 4 s first spawn can feel like a pile-up.
- Abilities: do students press them at all, and at the right moment? The bots arm Ekspertyza and
  Druga szansa as soon as they can. Watch Podaj teczkę (not modelled) and whether the average crew
  really gets 3 stars on level 2 as often as the bots (40–53 %).
- Replace the model numbers in `tools/balance/models.ts` with measured values (minigame durations,
  failure rates, reading time) and re-run.

## S6-01 pass (authored schedules, Normal only; superseded)

The first pass (before Stage 7) found deadlines too generous (every crew earned the speed bonus;
the average crew got 3 stars in 42–66 % of runs on every level) and little difficulty growth
(average score share 83 / 77 / 76 / 77 / 72 / 71 % on l1–l6). It scaled every folder deadline per
level (×0.70–0.80, never below 40 s unless already lower) and moved the star thresholds onto the
55 % / 80 % guideline (l1 205 / 320, l3 240 / 350, l5 240 / 350, l6 250 / 360). Afterwards the
average crew of three scored 76 / 66 / 67 / 63 / 62 / 59 % on l1–l6 with 30 % three-star runs on
l1, rookies won 90 / 66 / 74 / 48 / 48 / 26 %, and endless was left unchanged (average median 10.0
min). l1–l4 have since moved to the station bag, whose deadlines and star shares replace those
values; l5 and l6 keep their S6-01 schedules until M4.
