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

## Dependencies

- Stick to the stack in the design doc (Bun, TS, Vite, React 19, three/R3F/drei, Zustand, Zod,
  Howler, Biome, Playwright). Adding any other runtime dependency requires a *Decision log* entry
  with the reason and its size impact on the client bundle.
- Add dependencies with `bun add` in the right workspace so `bun.lock` stays consistent; commit the
  lockfile.
