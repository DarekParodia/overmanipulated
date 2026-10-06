# Workflow

How an agent picks up, implements, verifies and lands a task.

## 1. Pick a task

- Tasks live in [`docs/implementation-plan.md`](../docs/implementation-plan.md), grouped by stage.
- Take the **lowest-numbered `todo` task in the current stage whose dependencies are `done`**.
  Do not start a later stage while the current one has open tasks unless the plan says the task is
  parallelisable.
- One task per agent at a time. If a task turns out to be bigger than ~1 day of work, split it in
  the plan (e.g. `S2-03a`, `S2-03b`) before starting.

### Claiming

Because everyone commits to `main`, claim a task with a tiny commit before doing the work:

1. `git pull --rebase origin main`
2. Change the task's status marker from `[ ]` to `[~]` and append `— claimed by <agent/person>`.
3. Commit `chore(plan): claim S1-03` and push immediately.

If the push is rejected because someone else claimed it first, pull and pick another task.
A claim older than 48 hours with no related commits may be taken over — leave a note in the plan.

## 2. Implement

- Read the task's *Scope* and *Done when* in the plan and the relevant section of the design doc.
- Stay within scope. If you find something else that needs doing, add it to the plan as a new task
  (or to *Backlog*) instead of widening your change.
- Follow [`code-conventions.md`](code-conventions.md) and [`architecture.md`](architecture.md).
- New behaviour comes with tests (see [`testing.md`](testing.md)).
- If you must deviate from the design document, record the decision in the plan's
  *Decision log* with a one-line reason.

## 3. Verify

Before every push:

```sh
bun run check   # lint + typecheck + test + validate:content
bun run build   # when you touched the client
```

For gameplay or UI changes also run the game (`bun run dev:server` + `bun run dev:client`) and
check the change in at least two browser tabs. Mention in the commit body what you verified
manually.

## 4. Land

- Small commits, each one green. Prefer several focused commits over one large one.
- Always `git pull --rebase origin main` before pushing; resolve conflicts locally and re-run
  `bun run check`.
- Never force-push `main`. Never rewrite published history.
- Mark the task `[x]` in the plan in the last commit of the task.
- After pushing, check that CI on `main` is green. If it is red because of your commit, fix it or
  revert it right away.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), English, imperative mood:

```
<type>(<scope>): <summary, max ~72 chars>

<optional body: why, what was verified, follow-ups>

Refs: S2-04
```

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `content`, `perf`, `ci`, `build`.
- Scopes: `client`, `server`, `shared`, `sim`, `protocol`, `content`, `scene`, `ui`, `net`, `plan`,
  `ci`, `deploy`.
- `Refs:` the plan task ID whenever the commit belongs to a task.

## 5. When stuck

- Ambiguity in the game rules → check the design doc; if still unclear, choose the simplest option
  that keeps the game playable, note it in the *Decision log*, and continue.
- Questions that need a human (content correctness, art direction, deadlines) → add them to
  *Open questions* in the plan and pick another task rather than guessing.
- Never disable, skip or delete a failing test to get green. Fix the cause or ask.

## Definition of done (every task)

- [ ] Scope of the task implemented; nothing unrelated changed.
- [ ] `bun run check` passes locally; CI green on `main` after push.
- [ ] Tests cover the new logic (sim/protocol/content always; UI where practical).
- [ ] No new magic numbers outside `constants.ts`; no `any`; no non-null assertions.
- [ ] Player-facing strings are Polish and live in the strings module, not inline.
- [ ] Works with keyboard, gamepad and touch; checked at desktop size and a 640×360 landscape
      phone viewport ([`platforms.md`](platforms.md)).
- [ ] New actions/events have their feedback cue (animation + sound + particles) registered in the
      catalogue, and respect mute / reduced motion / no-flash ([`game-feel.md`](game-feel.md)).
- [ ] Visual/UI/copy changes pass the design review checklist in
      [`design-rules.md`](design-rules.md) (paste it into the commit body).
- [ ] Plan status updated; decisions and new tasks recorded.
