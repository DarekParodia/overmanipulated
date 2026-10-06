# Redakcja na Ostatnią Chwilę

Cooperative browser game (3–4 players) about fact-checking under time pressure — a newsroom where
players verify incoming stories and decide: publish, reject, or publish with context.

- Design document (Polish): [`docs/design-document.pl.md`](docs/design-document.pl.md)
- Implementation plan: [`docs/implementation-plan.md`](docs/implementation-plan.md)
- Contributor / agent rules: [`AGENTS.md`](AGENTS.md)

## Quick start

Requires [Bun](https://bun.sh) ≥ 1.4.

```sh
bun install
bun run check        # lint, typecheck, tests, content validation
bun run dev:server   # game server
bun run dev:client   # client on http://localhost:5173
bun run test:e2e     # multiplayer end-to-end tests (desktop + mobile)
```

Deployment: [`docs/deploy.md`](docs/deploy.md).
