# Project analysis, 2026-10-16

Purpose: record the state of the project at commit `ba3184c` (main), rank its gaps, and track the
recommendations and the work that addresses them.

## 1. Scope and method

- Read-only review of the documentation (`AGENTS.md`, `agents/`, `docs/`), the CI configuration
  (`.github/workflows/ci.yml`), the server (`apps/server/`), the shared simulation
  (`packages/shared/src/sim/`) and the content (`packages/content/`).
- GitHub Actions was queried read-only: the CI run for the merge of PR #29.
- Counts come from `git ls-files`, `wc` and `grep` at commit `ba3184c`. Section 8 lists the commands.
- Lint, typecheck, unit tests and E2E were **not** run for this analysis. The CI results quoted
  below come from the GitHub run, not from a local run.

## 2. Snapshot

Counts were taken from grep and wc at commit `ba3184c`. They are a snapshot, not a contract.

| Item | Value | Source |
| --- | --- | --- |
| Commits on main | 461 | `git rev-list --count` |
| Tracked files | 1,039 | `git ls-files` |
| TS/TSX lines, tests included | client 68,910; server 11,276; shared 13,066; content 6,640 | `wc -l` |
| Test declarations | 2,271 in 182 unit test files (288 `test()`, 1,983 `it()`); the 39 Playwright specs add 97 `test()` calls | `grep` |
| Playwright specs | 39 files in `e2e/`, run on desktop, mobile and phone-small (640×360) | `git ls-files` |
| Levels | 7: l0 greybox and l1 to l6 | `packages/content/levels/` |
| Stories | 165 in 7 files; every story has `reviewed: false` | `grep` |
| Plan | Stages 0 to 5 marked done, with four task markers still partial (gap 8); stage 6 open (S6-01 to S6-04 unchecked); stage 7 done except S7-100 | `docs/implementation-plan.md` |

## 3. Strengths

- **Architecture.** The server is authoritative: clients send input and decisions, and the server
  runs scoring, timers and verdicts. The simulation is pure and seeded
  (`packages/shared/src/sim/`), so the same code runs on the server and in tests. Every network
  message and every content file is validated with Zod.
- **Abuse limits.** A per-socket message budget (sustained rate and burst), per-IP limits on joins
  and room creation, a room cap (`MAX_ROOMS` = 300), a CSP nonce per request, and a `config.json`
  that is validated and hot-reloaded. Ads have a kill switch and a recorded sign-off. The numbers
  are in `apps/server/src/limits.ts`.
- **Container hardening.** The server image runs as the non-root `bun` user. The server service
  sets `cap_drop: ALL` and `no-new-privileges`. Both images have health checks. The backup script
  checks each copy's integrity, and `docs/deploy.md` says its backup and restore commands were run
  against a real stack.
- **Strict CI gates.** Biome fails on `any` and on non-null assertions. The `check` job runs lint, a
  design-token lint that rejects colour literals outside the token files, typecheck, tests, content
  validation, a migration freshness check and the client build. The bundle budget is a separate
  script that CI does not run (gap 4).
- **Documentation depth.** `AGENTS.md` and `agents/`, a glossary, the Polish design document, a plan
  with a decision log, and a deploy document with a release checklist.
- **Accessibility built in.** A colour-blind module (`apps/client/src/a11y/colorblind.ts`),
  captions (`apps/client/src/a11y/captions.ts`), reduced-motion rules in the CSS, and a no-flash
  path in the feedback cues (`apps/client/src/fx/cues.ts`). No browser accessibility audit has
  been run; see section 7.

## 4. Gaps, ranked

1. **Main is red on the E2E job.** CI run 38611201415 (run 45) is the push of the merge of PR #29,
   commit `ba3184c` on main. The `check` and `docker` jobs passed. The `e2e` job failed after about
   24 minutes (started 17:59 UTC, finished 18:23 UTC on 2026-10-14). The names of the failing tests
   could not be read: the log download returned HTTP 403. No job in `ci.yml` depends on `e2e`, so
   as far as the workflow file shows, E2E does not block merges. Branch protection was not visible
   from this session.

   | Job (run 38611201415) | Result | Duration |
   | --- | --- | --- |
   | `check`: lint, design lint, typecheck, tests, content validation, migration check, build | success | 28 s |
   | `e2e`: `bun run test:e2e` (the test step alone ran about 24 min) | failure | 24 min 40 s |
   | `docker`: server and web images | success | 33 s |

2. **Content review is not enforced.** All 165 stories have `reviewed: false`. No CI gate and no
   runtime path reads the value. `validate:content` only checks that the field is a boolean
   (`packages/content/src/schema.ts`). The review tools in `tools/content/` read and write the
   flag. Several content tests pin `reviewed` to `false` for named stories or fixed sets (for
   example `packages/content/src/l3-afera.test.ts`), so signing off one of those stories turns
   its test red.

3. **No app-level error boundary and no error reporting.** The only error boundary is
   `CanvasBoundary` in `apps/client/src/intro/IntroStage.tsx`. It hides the intro's canvas on
   failure and reports nothing. There is no global `error` or `unhandledrejection` listener and no
   error reporting service. An uncaught render error outside that boundary unmounts the React
   tree. Recovery was not tested in a browser.

4. **Real-device performance is unverified.** The device matrix in `docs/deploy.md` has no results.
   It has not been run on the school laptops (Intel UHD 620) or on mid-range phones, which are the
   performance targets in `AGENTS.md` (rule 10). The bundle budget (`bun run perf:budget`) runs
   only in `bun run check`, not in `ci.yml`, so a pull request can exceed it and still pass CI.

5. **Balance is bot-tested only** (S6-01). `bun run balance` produces the numbers. Real playtest
   data is needed to confirm them.

6. **Not deployed** (S6-04; step 1 of the Stage 7 release checklist in `docs/deploy.md`). The smoke
   test on the real stack and the school-network test have not been done.

7. **Architectural limits.** Live game state is kept in memory (`AGENTS.md`, rule 9). A server
   restart ends every live room. The server is a single process. SQLite holds only the endless
   leaderboard and the blunder votes.

8. **Plan status disagrees with the work.** S1-08 and S1-14 still need a real-device check; S2-12
   has animation triggers that are emitted but not yet consumed; S2-13 needs a listening pass. All
   four are correctly `[~]`. But the Stage 2 status line says all its tasks have landed, then names
   S2-12 and S2-13 as still open. A reader can take that as done. The stage text and the markers
   must say the same thing.

9. **`registry.ts` is 2,132 lines** (`apps/server/src/rooms/registry.ts`), which makes it hard to
   review and change safely.

10. **Open questions.** Nine questions in the plan's "Open questions" section are unanswered. The
    most important: the submission deadline, team size and roles, whether a subject-matter
    supervisor is available and when, whether play must work on a school network, and which
    phones students have.

11. **Minor rule drift.**
    - The Styleguide page (`apps/client/src/screens/Styleguide.tsx`) has hard-coded Polish text.
      `AGENTS.md` rule 1 allows Polish only for player-facing text.
    - 165 TS and CSS files have a comment line with Polish letters, 10 of them in the HUD folder
      (command in section 8). A repo tool, `tools/content/review-apply.ts`, prints Polish messages.
    - The web service in `docker-compose.yml` has `no-new-privileges` but not `cap_drop: ALL`, and
      its image stage sets no `USER`.
    - The kick cooldown is per browser (`clientId`) and per room, not per IP (`docs/deploy.md`).
      A kicked player can rejoin from a fresh browser profile.

## 5. Recommendations

Priorities: P0 blocks all other work; P1 is needed before the first lesson; P2 is planned; P3 is
optional. Items marked "human" need a person; no code change can close them.

**P0**

- R1. Make main green: fix the failing E2E test or tests, and rerun the job. (Gap 1.)
- R2. Require the `check` and `e2e` checks on main. Human: a repository setting. (Gap 1.)

**P1**

- R3. Add a client error boundary and error reporting. (Gap 3.)
- R4. Run the real-device pass: a full 8-minute level on the school laptops and on mid-range
  phones, recorded in the device matrix. Human. (Gap 4.)
- R5. Content review: a supervisor reads the 165 stories and signs off with `bun run review:apply`.
  Human (S6-02). (Gap 2.)
- R6. Run the deploy smoke test on the real stack and the school-network test. Human (S6-04).
  (Gap 6.)
- R7. Write a teacher note on restarts: a server restart ends live rooms. A person reviews the
  wording. (Gap 7.)

**P2**

- R8. Split `registry.ts` into smaller modules with no change in behaviour. (Gap 9.)
- R9. Reconcile the plan with the work: make the Stage 2 status line and the four partial markers
  say the same thing. Keep a marker `[~]` until its work is done (`AGENTS.md` rule 8). (Gap 8.)
- R10. Move the Styleguide page text to English. (Gap 11.)
- R11. Harden the web service in `docker-compose.yml` (`cap_drop: ALL`, a non-root user). Deferred:
  this cannot be verified without Docker, which this environment does not have. (Gap 11.)

**P3**

- R12. Publish a coverage report from CI. Not tied to a gap.
- R13. Document the scope of the kick cooldown in the known-limits docs. (Gap 11.)
- R14. Decide whether to freeze features before the playtests and the contest. A decision for the
  team, not a code task.

Suggested order: R1 first. R3, R8, R9 and R10 need no person and can run in parallel. The human
items (R2, R4 to R7) can proceed alongside them. R11 waits for a machine with Docker.

## 6. Status

Units: unit 1 makes main green; unit 2 covers client error handling and the Styleguide copy; unit 3
splits the registry; unit 4 is the content review report; unit 5 reconciles the plan status; unit 6
is the known-limits docs; unit 7 is this document. "In batch" means the work is part of this
analysis batch. The PR column names the unit only.

| Rec | Priority | Recommendation | Status | PR |
| --- | --- | --- | --- | --- |
| R1 | P0 | Make main green | In batch | unit 1 |
| R2 | P0 | Require `check` and `e2e` on main | Human action: repository setting | none |
| R3 | P1 | Client error boundary and reporting | In batch | unit 2 |
| R4 | P1 | Real-device pass | Human action | none |
| R5 | P1 | Content review sign-off | Report in batch; sign-off is a human action (S6-02) | unit 4 |
| R6 | P1 | Deploy smoke test and school-network test | Human action (S6-04) | none |
| R7 | P1 | Teacher note on restarts | Known-limits text in batch; wording needs a person | unit 6 |
| R8 | P2 | Split `registry.ts` | In batch | unit 3 |
| R9 | P2 | Reconcile plan status with the work | In batch | unit 5 |
| R10 | P2 | Styleguide copy to English | In batch | unit 2 |
| R11 | P2 | Compose hardening of the web service | Deferred: needs Docker to verify | none |
| R12 | P3 | Coverage report in CI | Not scheduled | none |
| R13 | P3 | Kick-cooldown documentation | In batch (expected) | unit 6 |
| R14 | P3 | Feature freeze | Decision for the team | none |

Not covered by any recommendation, and still open: gap 10 (open questions, which need a person to
answer), the Polish comments (gap 11), and the bundle budget not running in CI (gap 4).

## 7. What was not verified

- Lint, typecheck, unit tests and E2E were not run for this analysis.
- The names of the failing E2E tests (the log download returned HTTP 403).
- Client recovery after a server restart.
- Real-device performance on the school laptops and mid-range phones.
- Browser accessibility: no screen-reader, keyboard-only or contrast audit.
- Branch protection settings on main.
- Findings about code come from reading and grep. The game was not run.

## 8. Commands used for the counts

Run from the repository root at commit `ba3184c`. Each command prints one number.

```sh
git rev-list --count HEAD                                              # commits
git ls-files | wc -l                                                   # tracked files
git ls-files apps/client | grep -E '\.tsx?$' | xargs cat | wc -l       # client TS/TSX lines
git ls-files apps/server | grep -E '\.tsx?$' | xargs cat | wc -l       # server TS/TSX lines
git ls-files packages/shared | grep -E '\.tsx?$' | xargs cat | wc -l   # shared TS/TSX lines
git ls-files packages/content | grep -E '\.tsx?$' | xargs cat | wc -l  # content TS/TSX lines
git ls-files | grep -E '\.test\.tsx?$' | wc -l                         # unit test files
git ls-files | grep -E '\.test\.tsx?$' | xargs grep -h -E '^\s*test\(' | wc -l  # test() in unit tests
git ls-files | grep -E '\.test\.tsx?$' | xargs grep -h -E '^\s*it\(' | wc -l    # it() in unit tests
git ls-files | grep -E '\.spec\.ts$' | wc -l                           # Playwright specs
git ls-files | grep -E '\.spec\.ts$' | xargs grep -h -E '^\s*test\(' | wc -l   # test() in specs
git grep -h '"reviewed": false' -- packages/content/stories | wc -l    # stories not reviewed
git grep -l -E "^\s*(//|/?\*).*(ą|ć|ę|ł|ń|ó|ś|ź|ż|Ą|Ć|Ę|Ł|Ń|Ó|Ś|Ź|Ż)" -- '*.ts' '*.tsx' '*.css' | wc -l  # files with Polish comment lines
```
