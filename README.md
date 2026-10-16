# Redakcja na Ostatnią Chwilę

Cooperative browser game (3–4 players) about fact-checking under time pressure — a newsroom where
players verify incoming stories at ten stations and decide: publish, reject, or publish with
context. Optional extras: a two-newsroom versus mode with spectators, a room browser, four
difficulty levels and an animated intro.

- Design document (Polish): [`docs/design-document.pl.md`](docs/design-document.pl.md)
- Implementation plan: [`docs/implementation-plan.md`](docs/implementation-plan.md)
- Contributor / agent rules: [`AGENTS.md`](AGENTS.md)
- Project analysis, 2026-10-16: [`docs/analysis/project-analysis-2026-10.md`](docs/analysis/project-analysis-2026-10.md)

## Quick start

Requires [Bun](https://bun.sh) ≥ 1.4.

```sh
bun install
bun run check        # lint, typecheck, tests, content validation, bundle budget
bun run dev:server   # game server
bun run dev:client   # client on http://localhost:5173
bun run test:e2e     # multiplayer end-to-end tests (desktop, mobile, 640×360 phone)
```

Deployment: [`docs/deploy.md`](docs/deploy.md). Runtime settings (feature flags, message of the
day, ads) live in `config/config.json` (copy `config/config.example.json`; hot-reloaded, every key
documented in `docs/deploy.md`).
