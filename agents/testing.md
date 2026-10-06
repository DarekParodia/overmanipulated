# Testing

## What must be tested

| Area | Tool | Requirement |
| --- | --- | --- |
| `packages/shared/src/sim` | `bun test` | Every rule from the design doc (scoring table, credibility, deadlines, stars, role bonuses, events) has a unit test. Bug fixes start with a failing test. |
| `packages/shared/src/protocol.ts` | `bun test` | Each schema accepts a valid example and rejects malformed input. |
| `packages/content` | `bun run validate:content` | All levels and stories parse; referential integrity (ids exist, every story is solvable with the stations available in its level). |
| `apps/server` rooms | `bun test` | Room lifecycle (create, join, full room, reconnect window, cleanup) with an in-process server. |
| `apps/server` routes | `bun test` + Hono `app.request()` | Each REST route: happy path, validation error, not found. No real network needed. |
| `apps/server` DB | `bun test` with in-memory SQLite (`new Database(':memory:')`) and migrations applied via `migrate()` | Every query function; a test that all migrations apply cleanly from empty. |
| `apps/client` | `bun test` for pure helpers (interpolation, input mapping); Playwright for flows | UI components only where logic is non-trivial. |
| Multiplayer flows | Playwright (several browser contexts) | Join by code, movement sync, a full verdict round, level end. |

## Rules

- Tests are deterministic: seed the RNG, pass explicit `dtMs`, never sleep on wall-clock time in
  unit tests.
- Test names describe behaviour in English: `it('removes 25 credibility when a fake is published')`.
- Use the constants in assertions (`-PENALTY_PUBLISHED_FAKE`) only when the test is about wiring;
  when the test is about the design rule, assert the literal design value so a balance change is a
  conscious, visible test update.
- DB tests create a fresh `:memory:` database per test (or per file) — never share the dev DB
  file and never depend on test order.
- Keep fixtures small and colocated (`__fixtures__/` next to the tests).
- Never skip, disable or delete a failing test to get CI green.

## Running

```sh
bun run test                 # all unit tests
bun test packages/shared     # one package
bun run validate:content     # content checks
bunx playwright test         # e2e (once set up in stage 1)
```

Playwright uses the pre-installed Chromium; do not run `playwright install` in CI images that
already ship browsers.
