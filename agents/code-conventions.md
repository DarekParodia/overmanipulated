# Code conventions

## Language

- **English** for all code, identifiers, comments, commit messages, docs and test names.
- **Polish** only for player-facing text: UI strings, story content, debrief explanations,
  technique encyclopedia. Never put Polish words in identifiers — use [`glossary.md`](glossary.md).
- UI strings live in one module (`apps/client/src/strings/pl.ts`) keyed by English ids, so they
  can be reviewed by the content supervisor in one place and translated later.

## TypeScript

- `strict` with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (see
  `tsconfig.base.json`). Do not loosen these per package.
- No `any` (use `unknown` + narrowing), no non-null assertions (`!`), no `@ts-ignore`.
  `@ts-expect-error` is allowed only in tests, with a comment.
- Prefer `type` aliases and discriminated unions over classes and enums. Use string literal unions
  (`'publish' | 'reject' | 'publishWithContext'`) derived from Zod schemas.
- Types that cross the network or come from content files are **inferred from Zod schemas**
  (`z.infer<typeof X>`). Do not hand-write a parallel interface.
- Named exports only; no default exports (except where a tool requires it, e.g. `vite.config.ts`).
- Import with `import type` for type-only imports (`verbatimModuleSyntax` enforces it).
- Workspace packages are imported by name (`@redakcja/shared`), never by relative path across
  package boundaries.

## Files and naming

| Thing | Convention | Example |
| --- | --- | --- |
| Files | `kebab-case.ts` | `editorial-desk.ts` |
| React components | `PascalCase.tsx`, one component per file | `StationOverlay.tsx` |
| Tests | next to the code, `*.test.ts(x)` | `scoring.test.ts` |
| Types | `PascalCase` | `FolderState` |
| Functions/variables | `camelCase` | `applyVerdict` |
| Constants | `SCREAMING_SNAKE_CASE` in `constants.ts` | `TICK_RATE_HZ` |
| Content ids | `kebab-case`, prefixed by level | `l1-flooded-street` |

## Style

- Formatting and linting are Biome's job — run `bun run format`, do not hand-format.
- Small pure functions; keep side effects at the edges (server socket handlers, React effects,
  audio).
- Comments explain *why*, not *what*. Reference the design doc section when encoding a rule.
- No dead code or commented-out code. No `console.log` left in committed code except in scripts
  and the server's structured logger.

## React / R3F

- Function components and hooks only.
- Global client state in Zustand stores under `apps/client/src/store/`; components select the
  smallest slice they need.
- Per-frame updates in `useFrame` must not allocate (reuse vectors) and must not trigger React
  re-renders. Server snapshots go into a ref/store that `useFrame` reads.
- 2D overlays (stations, desk, HUD, screens) are plain React DOM on top of the canvas, not drawn
  in three.js.
- Components never call Howler, particles, camera shake or haptics directly — emit a cue via
  `emitCue()` from `fx/feedback.ts` (see [`game-feel.md`](game-feel.md)).
- Interactive UI uses pointer events (works for mouse, pen and touch); no hover-only affordances;
  every action reachable by keyboard, gamepad and touch (see [`platforms.md`](platforms.md)).
- Animate DOM UI with CSS transitions or the Web Animations API presets in `fx/ui-motion/`;
  check `prefers-reduced-motion` and the in-game reduced-motion setting.

## Server (Hono + Drizzle)

- One file per route group under `apps/server/src/routes/`; chain route definitions
  (`new Hono().get(...).post(...)`) so `AppType` keeps full types for the RPC client.
- Validate every REST input with `zValidator('json' | 'query' | 'param', schema)`; never read
  `c.req.json()` unvalidated.
- Return errors as `{ error: { code, message } }` with a proper status code; `code` is an English
  machine id, `message` may be shown to players only via the client strings module.
- Drizzle table names are `snake_case` plural (`leaderboard_entries`), TypeScript table objects
  `camelCase` (`leaderboardEntries`), columns `snake_case` in SQL via `casing: 'snake_case'`.
- Queries live in `db/queries/*.ts` as small named functions (`insertLeaderboardEntry`,
  `getTopEntries`) that take the `db` instance as the first argument, so tests can pass an
  in-memory DB.
- Prefer the query builder; raw `sql` templates only when Drizzle cannot express the query, and
  always with bound parameters.

## Dependencies

- Stick to the agreed stack: Bun, TS, Vite, React 19, three/R3F/drei, Zustand, Zod, Howler,
  Biome, Playwright, plus on the server **Hono** (`hono`, `@hono/zod-validator`) and **Drizzle**
  (`drizzle-orm`, `drizzle-kit`, `drizzle-zod`) on `bun:sqlite`. Adding any other runtime
  dependency requires a *Decision log* entry with the reason and its size impact on the client
  bundle.
- Add dependencies with `bun add` in the right workspace so `bun.lock` stays consistent; commit the
  lockfile.
