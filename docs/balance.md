# Balance (S6-01)

Status: **first pass from bot simulations. Not confirmed by humans.** Bots are not students. The
numbers below say how the levels behave for the bot models described here; the real playtest
data (S3-09 kit, `docs/playtests/`) must still confirm or overturn them. Re-run `bun run balance`
after every change to content or constants.

## Method

`bun run balance` (`tools/balance/`) plays every campaign level (l1..l6) and a generated endless
level with bot crews through the **real** `step()` from `@redakcja/shared`: real map, real
`STATION_WORK_MS` and role bonus, real `MINIGAME_FAIL_LOCKOUT_MS`, real walking speed and map
distances (bots path-find over the tile map and send the same inputs and commands a client
sends). Nothing in the game rules is mocked. A run is deterministic: the sim RNG and each bot's
RNG derive from the run seed (`tools/balance/game.ts`). The default matrix is 8 crews x 6 levels
x 40 seeds + endless x 8 crews x 24 seeds (about 2600 runs, about 60-80 s on 4 cores; worker
threads). Options: `--seeds N`, `--endless-seeds N`, `--levels l1-burza,l4-zdrowie`,
`--no-endless`, `--workers N`, `--json file`, `--md`.

Output per level and crew: win rate (survived with a positive score), star distribution, score
p10/p50/p90 and as share of the level's best possible score, minimum credibility, credibility
trajectory (tenths of the level), share of expired folders, share of wrong verdicts or wrong
justifications, time to first verdict, events started per run. Endless: survival time
distribution (runs are cut at 20 min). The last block prints pass/fail checks against the
intent (below).

### Bot models (`tools/balance/models.ts`, all assumptions)

Roles by crew size: 2 = photo editor, archivist; 3 = + reporter; 4 = + managing editor.

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
| Uses the role ability (`usesAbility`; so far Przedłużenie on a claimed folder under 5 s left) | never | 50% | always |

Teamwork: an idle bot claims the next folder on the conveyor (rookies first come first served,
others by deadline and priority), then carries it through the stations it chooses and to a free
desk. Bots wait for busy stations, avoid stations that are down and retry after a failed
minigame. "Mixed" is rookie + average + expert.

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

## Intent

Level 1 winnable by rookies (>= 80 %), 2 stars within reach of average crews, 3 stars mostly
experts; later levels progressively harder, but a competent crew of 3 wins >= 60 % at level 6;
no level unwinnable or trivially maxed; star thresholds near 55 % / 80 % of the best possible
score; endless ramps so that average crews last 6-10 minutes.

## Findings before the change

- Deadlines were generous: 45-90 s per folder, while an expert needs about 20 s from arrival to
  verdict. Every crew earned the speed bonus (verdict with more than half the time left), so
  the average crew got 3 stars in 42-66 % of the runs on **every** level (level 1: 60 %).
- Difficulty hardly rose: the average crew's score share was 83 / 77 / 76 / 77 / 72 / 71 % on
  levels 1-6. Crew size (2 vs 4) made almost no difference, because load was low.
- Thresholds: level 5 (47 % / 69 % of max), level 6 (56 % / 76 %), level 3 (55 % / 75 %) and
  level 1 (51 % / 80 %) were off the 55 / 80 guideline.
- Endless: average crew median 10.2 min (just above the target), experts never died.

## Changes (data only, no rules)

1. **Folder deadlines** (`deadlineS` of schedule entries and events) scaled per level, rounded
   to 5 s, never below 40 s unless the value was already lower (urgent folders keep their 45-60 s):
   level 1 x0.70, level 2 x0.78, level 3 x0.80, level 4 x0.70, level 5 x0.72, level 6 x0.70.
   Spawn times, stories, events and durations are unchanged. Reason: the speed bonus becomes a
   skill reward, and later levels feel tighter (more expiry, more pressure on small crews).
2. **Star thresholds** moved onto the guideline: level 1 190/300 -> 205/320 (55 % / 85 %; the
   higher third star keeps it for experts), level 3 240/330 -> 240/350, level 5 205/300 ->
   240/350, level 6 250/340 -> 250/360. Levels 2 and 4 were already at 55 % / 80 %.
3. Endless (`ENDLESS` in `constants.ts`) left unchanged: the average crew's median is 10.0 min,
   on the edge of the target, and the first playtests should decide.

## Results (3 players, 40 seeds)

Win / share of runs with 2+ stars / with 3 stars / score as share of the best possible score.

| Level | Crew | Before | After |
| --- | --- | --- | --- |
| 1 | rookie | 94 % / 12 % / 0 % / 29 % | 90 % / 0 % / 0 % / 18 % |
| 1 | average | 100 % / 100 % / 60 % / 83 % | 100 % / 96 % / 30 % / 76 % |
| 1 | expert | 100 % / 100 % / 98 % / 97 % | 100 % / 100 % / 96 % / 93 % |
| 2 | average | 100 % / 96 % / 48 % / 77 % | 100 % / 84 % / 14 % / 66 % |
| 3 | average | 100 % / 98 % / 50 % / 76 % | 100 % / 90 % / 14 % / 67 % |
| 4 | average | 100 % / 94 % / 48 % / 77 % | 100 % / 76 % / 18 % / 63 % |
| 5 | average | 100 % / 98 % / 66 % / 72 % | 100 % / 74 % / 8 % / 62 % |
| 6 | average | 100 % / 92 % / 42 % / 71 % | 100 % / 68 % / 6 % / 59 % |
| 6 | rookie | 28 % / 0 % / 0 % / 2 % | 26 % / 0 % / 0 % / -1 % |
| 6 | expert | 100 % / 100 % / 100 % / 96 % | 100 % / 100 % / 94 % / 90 % |

Rookie win rate after the change by level: 90 / 66 / 74 / 48 / 48 / 26 %. The average crew's
minimum credibility at level 6 is 63 (was 68). The full tables (all crews, crew sizes 2 and 4,
credibility trajectories, events per run, endless) are printed by `bun run balance --md`.

Endless (unchanged): median survival rookie 6.2 min, average 10.0 min, mixed 10.3 min, expert
17.3 min (21 % reach the 20 min cap). Experts survive very long because the folder interval
stops shrinking at 7 s; consider lowering `ENDLESS.minIntervalS` if playtests show skilled crews
never die.

## Open points for the playtests

- Does a first-time crew really win level 1 (the rookie model says 90 %)? Compare with
  `results-log.md`.
- Time to first verdict: bots need 24-36 s on level 1 (rookies 53 s). If humans need much
  longer, the 4 s first spawn can feel like a pile-up; consider a later first spawn.
- Level 6 needs a real crew of 3 to check the 60 % win target; the bots say 100 % for average
  crews, so real difficulty is more likely too high than too low.
- Replace the model numbers in `tools/balance/models.ts` with measured values (minigame
  durations, failure rates, reading time) and re-run.
