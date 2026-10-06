# AGENTS.md

Entry point for AI agents (and humans) working on this repository. Read this file fully, then the
files in [`agents/`](agents/) that are relevant to your task.

## Project

**Redakcja na Ostatnią Chwilę** ("Last-Minute Newsroom") — a cooperative, browser-based, 3–4 player
game about fact-checking under time pressure (think *Overcooked* meets a newsroom). Players carry
story folders between verification stations, collect evidence stamps and decide: publish, reject,
or publish with context. Target audience: Polish high-school students; one level lasts 6–8 minutes.

- Source of truth for game design: [`docs/design-document.pl.md`](docs/design-document.pl.md) (Polish).
- Staged plan and task list: [`docs/implementation-plan.md`](docs/implementation-plan.md).
- Polish → English naming for every game concept: [`agents/glossary.md`](agents/glossary.md).

## Repository layout

```
apps/client/        Vite + React 19 + React Three Fiber (scene/, stations/, screens/, net/, input/, store/)
apps/server/        Bun.serve authoritative game server (rooms/, loop, index)
packages/shared/    Game logic shared by client and server: sim/, protocol, constants
packages/content/   Content schemas, levels/*.json, stories/*.json, validate script
tools/              Optional tooling (level editor, content helpers)
docs/               Design document, implementation plan, contest materials
agents/             Working rules for agents
```

## Commands

| Command | What it does |
| --- | --- |
| `bun install` | Install all workspace dependencies |
| `bun run dev:server` | Run the game server with watch mode |
| `bun run dev:client` | Run the Vite dev server (proxies `/ws` to the game server) |
| `bun run lint` / `bun run format` | Biome check / Biome check with autofix |
| `bun run typecheck` | `tsc` in every workspace |
| `bun run test` | `bun test` across the repo |
| `bun run validate:content` | Validate game content against schemas |
| `bun run build` | Production build of the client |
| `bun run check` | lint + typecheck + test + validate — **must pass before every push** |

## Non-negotiable rules

1. **English everywhere in the repo** — code, identifiers, comments, commit messages, docs.
   The only exception is player-facing game text and content (Polish). See
   [`agents/code-conventions.md`](agents/code-conventions.md).
2. **Work goes directly to `main`** in small, green commits. Run `bun run check` before pushing;
   never push a red build. If `main` is red, fixing it beats everything else. See
   [`agents/workflow.md`](agents/workflow.md).
3. **The server is authoritative.** Clients send only input and player decisions; scoring,
   credibility, timers and verdict evaluation live in `packages/shared/src/sim` and run on the
   server. See [`agents/architecture.md`](agents/architecture.md).
4. **The simulation is deterministic and pure.** No `Date.now()`, `Math.random()`, I/O or DOM in
   `packages/shared/src/sim` — time and a seeded RNG are passed in.
5. **Every network message and every content file is validated with Zod.** Types are inferred from
   the schemas, never written twice.
6. **Balance numbers live in `packages/shared/src/constants.ts`**, not inline.
7. **Content must be fictional and safe**: city of Nowe Brzegi, no real people, companies or
   tragedies, every story has an explanation and a real-world mechanism. See
   [`agents/content-authoring.md`](agents/content-authoring.md).
8. **Pick tasks from the plan, one at a time**, and keep its status up to date in the same commit
   as the work.
9. **Respect the performance budget** (60 FPS on Intel UHD 620, ≤100k triangles, ~150 draw calls,
   ≤10 MB first load). See [`agents/architecture.md`](agents/architecture.md).

## Agent docs index

| File | Read when |
| --- | --- |
| [`agents/workflow.md`](agents/workflow.md) | Always — how to pick, do, verify and land a task |
| [`agents/code-conventions.md`](agents/code-conventions.md) | Writing any code |
| [`agents/architecture.md`](agents/architecture.md) | Touching sim, protocol, server, netcode or rendering |
| [`agents/testing.md`](agents/testing.md) | Writing or changing behaviour |
| [`agents/content-authoring.md`](agents/content-authoring.md) | Writing stories, levels or debrief texts |
| [`agents/glossary.md`](agents/glossary.md) | Naming anything that exists in the design doc |
