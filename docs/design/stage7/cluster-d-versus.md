# Cluster D — Versus mode, spectators, room browser, lobby management (+ client IP behind proxy)

# Cluster D: versus, spectators, room browser, lobby management

## 0. Decisions (binding for this design)

| Topic | Decision |
| --- | --- |
| Versus model | Each team plays in its **own identical newsroom**: one `GameState` per team in one `Room`. Both use the same level, the same seed and the same generated schedule (endless/bag). They are stepped in lockstep in `registry.tick()`. No sim or map changes. |
| Sizes | 1v1 to 4v4. Uneven teams are allowed. Room cap is 8 players (`MAX_ROOM_PLAYERS`) plus 8 spectators (`MAX_SPECTATORS`). Each newsroom still has at most 4 players (`MAX_TEAM_PLAYERS`), so snapshot caps, spawns and colours stay as they are. |
| Winner | (1) Credibility 0, or forfeit (a team has no players left after the 60 s reconnect grace), ends the match at once and the other team wins. (2) If both teams are out on the same tick, or the time runs out, the higher score wins. (3) Equal scores are a draw (`winnerTeam: null`). |
| Endless versus | The match lasts `VERSUS.endlessDurationS = 600` (10 min). It is **not** written to the endless leaderboard. |
| Progress | Versus never calls `useProgress.record`. Campaign stars and progress stay co-op only. |
| Join rules | **Co-op:** join as player in any phase (unchanged; late classmates by code still work). **Versus:** join as player only in `lobby` or `results`; otherwise `matchInProgress`. **Spectator:** any phase, any mode, up to 8. The browser offers "Dołącz" only for `lobby`/`results` rooms. |
| Host | The host may be a spectator (teacher flow): create the room, then press "Na widownię". |
| Visibility | Rooms are private by default. The host can mark a room public. Public rooms list code, name, host nickname, level, mode, difficulty and counts. |
| Kick | Removes the member and invalidates the token. There is **no IP ban**, because a whole class shares one IP. |
| Spectator transport | A dedicated spectator topic carries both teams' snapshots at 10 Hz, tagged with `team`, plus realtime events. Live per-player stats are computed **on the server** (a pure reducer in shared), sent at 1 Hz, and also sent in full in `levelEnd`. |
| Split screen | **Two R3F `<Canvas>` elements**, not one canvas with scissored viewports (justification in §4.3). |
| Team identity | Names **Kurier** (team 0) and **Głos** (team 1). Kurier badge: navy shield, white "K". Głos badge: white round seal with a navy outline and a navy "G". They differ by luminance, shape and letter, and add no new hue that could clash with the meaning colours or `--player-0..3`. |

## 1. Verified current state (what this design builds on)

**Room model** (`apps/server/src/rooms/registry.ts`)
- One `Room` holds exactly one `game: GameState` (L71-86). `RoomPlayer` has no team or kind (L55-69).
- There is one topic, `room:${code}` (L140). Everything is published on it: events via `broadcastEvent` (L169-171), roomState (L173-201), snapshots (L684-706).
- Join and create: `handleJoin` (L254-330). Room creation (L286-315) has no name, visibility, mode or createdAt. The capacity check against `MAX_PLAYERS` is at L322.
- Mid-game joins go straight into the sim: `addToRoom` (L242-249).

**Places that touch `room.game` and must become team-aware**
- `selectLevel` L422, `backToLobby` L452, `voteBlunder` L510, `startLevel` L533-552 (seed at L540, spawn by colorIndex at L542), `removePlayer` L579, `tick` L655-681, `broadcastSnapshot`, `recordEndlessRun` L708-723, `endLevel` L725-746, `inspect` L757-781.
- `freeColorIndex` (L203-211) is per room; it becomes per team.

**Sim**
- `step()` is a no-op once `state.ended` (step.ts L62-64).
- `levelOutcome` returns `null` for endless levels unless credibility is 0 (scoring.ts L28-41).
- The only sim RNG use is the minigame seed (stations.ts L176). Two sims with the same seed therefore get identical folder and event streams.
- `spawnPoint(map, slot)` (state.ts L116-122). `removePlayer` drops the carried folder and frees the station and desk (state.ts ~L152-174).

**Protocol** (`packages/shared/src/protocol.ts`)
- `joinMessageSchema` L63-71, `lobbyActionSchema` L73-87, `briefingStateSchema.skippedBy.max(MAX_PLAYERS)` L151, `lobbyPlayerSchema` L156-167, `roomStateMessageSchema` L176-187 (players and blunderVotes `.max(MAX_PLAYERS)`), `snapshotMessageSchema` L199-213, `errorCodeSchema` L310-321, `levelEndMessageSchema` L331-341.
- `PROTOCOL_VERSION = 2` (constants.ts L6). `MAX_PLAYERS = 4` (L16). `PLAYER_COLOR_COUNT = 4` (L25).

**REST and networking**
- REST: `createApiRoutes(deps)` with chained routes and `zValidator` (routes/api.ts L31-59); the leaderboard is the pattern for shared REST schemas (`packages/shared/src/leaderboard.ts`).
- Reusable token bucket: `createRateLimiter` (rate-limit.ts).
- **Client IP bug.** `clientAddress` takes the first `X-Forwarded-For` entry (routes/ws.ts L33-36). Caddy has no `trusted_proxies` (Caddyfile L6-44), so it replaces XFF with the external proxy's address. The per-IP limits (`JOINS_PER_MINUTE_PER_IP = 120`, `ROOMS_PER_MINUTE_PER_IP = 20`, limits.ts L12-14) are therefore site-wide. docs/deploy.md L108 says the opposite.

**Client singletons**
- `runtime` is created once in `net/session.ts` L60-63.
- `useGame` is a global zustand store (game-store.ts L38-59).
- `renderState` is a module object (scene/render-state.ts L4-8).
- `feedback` is a global `createFeedback(...)` (fx/feedback.ts L214-217). Its `connect` merges outputs (L183-195), so two cameras would overwrite each other's `addTrauma` and `screenX`.
- 13 scene files import `runtime` from session.ts: Ambience, CameraRig, Decor, Driver, EventMarkers, EventsWorld, Fixtures, Folders, GuidanceMarkers, InteractionHighlight, Newsroom, PlayerAvatar, StationIndicators. More read `useGame` and `renderState` (Folders, PlayerAvatar, EventsWorld, EventMarkers, GuidanceMarkers, StationIndicators, InteractionHighlight, Ambience, PingBubbles).
- `useOverlay` creates a **separate React root** at `gl.domElement.parentElement` (scene/overlay.ts L12-32), and drei `Html` is used in EventMarkers and PingBubbles. React context does not reach either, so they need an explicit provider.
- `Players.tsx` renders every `room.players` entry (L4-19). `PlayerAvatar` hides itself when the id is missing from `renderState` (L284-291).
- `CameraRig` follows `renderState.local` (L65-79).
- `PerfProbe` writes `perfStats.drawCalls` for its own canvas only.

**Tests**
- 33 `registry.inspect(code)?.game` uses across registry.test.ts (8), lobby.test.ts (13), briefing-and-votes.test.ts (7) and endless.test.ts (5).
- `createFakeHub()` (`__fixtures__/fake-transport.ts`) supports topics, so per-team topic delivery is observable through each connection's `received`.

## 2. Shared contracts

### 2.1 constants.ts (new block "Stage 7 — rooms, versus, spectators (S7-D)")

```ts
/** Players in one newsroom (one sim): a co-op room, or one versus team. */
export const MAX_TEAM_PLAYERS = 4;
/** Kept as the per-sim cap (snapshot players, spawns); equals MAX_TEAM_PLAYERS. */
export const MAX_PLAYERS = MAX_TEAM_PLAYERS; // replaces the literal 4 at L16
export const MAX_TEAMS = 2;
export const MAX_ROOM_PLAYERS = MAX_TEAMS * MAX_TEAM_PLAYERS; // 8
export const MAX_SPECTATORS = 8;
export const ROOM_NAME_MAX_LENGTH = 24;
export const ROOM_SEARCH_MAX_LENGTH = 24;
/** Public rooms returned by GET /api/rooms at most. */
export const ROOM_LIST_MAX = 50;
/** Spectators get every 2nd snapshot (10 Hz) and stats every 20 ticks (1 Hz). */
export const SPECTATOR_SNAPSHOT_INTERVAL_TICKS = 2;
export const SPECTATOR_STATS_INTERVAL_TICKS = 20;
/** Spectator views interpolate one 10 Hz interval further back than players. */
export const SPECTATOR_INTERPOLATION_DELAY_MS = 200;
export const VERSUS = {
  /** Endless has no natural end; a versus endless match lasts this long. */
  endlessDurationS: 600,
  /** The lead-change cue fires at most this often. */
  leadCueCooldownMs: 5000,
} as const;
```

`PROTOCOL_VERSION` goes from 2 to 3. This is **one bump for all of Stage 7**: whichever protocol task lands first on the branch bumps it, and later Stage 7 changes in the same release do not bump again.

### 2.2 protocol.ts

```ts
// primitives
export const roomModeSchema = z.enum(['coop', 'versus']);
export const roomVisibilitySchema = z.enum(['private', 'public']);
export const memberKindSchema = z.enum(['player', 'spectator']);
export const teamIndexSchema = z.number().int().min(0).max(MAX_TEAMS - 1);
export const roomNameSchema = z.string().trim().min(1).max(ROOM_NAME_MAX_LENGTH)
  .regex(/^[^\p{Cc}\p{Cf}]+$/u);
export const versusEndReasonSchema = z.enum(['score', 'credibility', 'forfeit', 'draw']);

// join: `as` omitted = 'player' (old flows unchanged)
joinMessageSchema = z.object({ ...existing, as: memberKindSchema.optional() });

// lobby actions (added to the discriminated union)
z.object({ kind: z.literal('setMode'), mode: roomModeSchema }),                 // host, lobby
z.object({ kind: z.literal('setTeam'), team: teamIndexSchema,
           playerId: playerIdSchema.optional() }),                              // self, or host for others; lobby|results; versus
z.object({ kind: z.literal('setSpectator'), spectator: z.boolean(),
           playerId: playerIdSchema.optional() }),                              // self, or host for others; lobby|results
z.object({ kind: z.literal('setVisibility'), visibility: roomVisibilitySchema }), // host, any phase
z.object({ kind: z.literal('setRoomName'), name: roomNameSchema.nullable() }),   // host, any phase
z.object({ kind: z.literal('kick'), playerId: playerIdSchema }),                // host, any phase, not self
z.object({ kind: z.literal('transferHost'), playerId: playerIdSchema }),        // host, any phase, connected target

briefingStateSchema.skippedBy: z.array(playerIdSchema).max(MAX_ROOM_PLAYERS)
lobbyPlayerSchema = { ...existing, team: teamIndexSchema }
export const lobbySpectatorSchema = z.object({ id: playerIdSchema, nickname: nicknameSchema,
  connected: z.boolean() });
roomStateMessageSchema = { ...existing,
  mode: roomModeSchema, visibility: roomVisibilitySchema, name: roomNameSchema.nullable(),
  players: z.array(lobbyPlayerSchema).max(MAX_ROOM_PLAYERS),
  spectators: z.array(lobbySpectatorSchema).max(MAX_SPECTATORS),
  blunderVotes: z.array(blunderVoteSchema).max(MAX_ROOM_PLAYERS) }
// (the difficulty cluster adds `difficulty` here)

export const teamScoreSchema = z.object({
  team: teamIndexSchema,
  score: z.number().int(),
  credibility: z.number().int(),
  /** Folders with a verdict (any outcome but expired). */
  resolved: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
  /** Connected players of the team. */
  connected: z.number().int().min(0).max(MAX_TEAM_PLAYERS),
});
snapshotMessageSchema = { ...existing,
  /** Which newsroom this snapshot is from (always set from protocol 3). */
  team: teamIndexSchema.optional(),
  /** Versus only: both teams, for the rival chip and the spectator scoreboard. */
  scoreboard: z.array(teamScoreSchema).max(MAX_TEAMS).optional() }
eventMessageSchema = { ...existing, team: teamIndexSchema.optional() }

export const playerStatsSchema = z.object({
  playerId: playerIdSchema, team: teamIndexSchema,
  verdicts: z.number().int().nonnegative(),      // verdictResult by this player
  correct: z.number().int().nonnegative(),       // outcome 'correct'
  wrong: z.number().int().nonnegative(),         // outcome 'wrong' (blunders)
  stamps: z.number().int().nonnegative(),        // stampApplied
  minigameFails: z.number().int().nonnegative(), // minigameFailed
  abilities: z.number().int().nonnegative(),     // abilityUsed (roles cluster event)
});
export const matchStatsMessageSchema = z.object({
  type: z.literal('matchStats'), tick: z.number().int().nonnegative(),
  players: z.array(playerStatsSchema).max(MAX_ROOM_PLAYERS),
  teams: z.array(teamScoreSchema).min(1).max(MAX_TEAMS) });
export const versusSummarySchema = z.object({
  winnerTeam: teamIndexSchema.nullable(), reason: versusEndReasonSchema,
  teams: z.array(teamScoreSchema).length(MAX_TEAMS) });
levelEndMessageSchema = { ...existing,
  team: teamIndexSchema.optional(),
  versus: versusSummarySchema.optional(),
  stats: z.array(playerStatsSchema).max(MAX_ROOM_PLAYERS).optional() }
errorCodeSchema += 'teamFull' | 'spectatorsFull' | 'matchInProgress' | 'teamEmpty' | 'kicked'
                 | 'invalidTarget' | 'featureDisabled'
serverMessageSchema += matchStatsMessageSchema
```

New types: `RoomMode`, `RoomVisibility`, `MemberKind`, `TeamIndex`, `TeamScore`, `PlayerStats`, `MatchStatsMessage`, `VersusSummary`, `VersusEndReason`, `LobbySpectator`.

In versus, `levelEnd.won` means "this team won the match". `stars` stays `starsFor(score, score > 0 && credibility > 0, level.stars)` and is shown for information only.

### 2.3 New shared modules (pure, exported from `packages/shared/src/index.ts`)

**`versus.ts`**

```ts
export type TeamStanding = { team: TeamIndex; score: number; credibility: number; forfeited: boolean };
export type VersusResult = { winnerTeam: TeamIndex | null; reason: VersusEndReason };
export function matchDurationMs(level: { durationS: number; endless?: boolean }): number
  // endless → VERSUS.endlessDurationS * 1000 (600_000), else durationS * 1000
export function versusOutcome(teams: readonly TeamStanding[], elapsedMs: number,
  durationMs: number): VersusResult | null
```

`versusOutcome` algorithm:
1. `out` = teams with `credibility <= 0 || forfeited`.
2. If exactly one team is not out: it wins. The reason is `'forfeit'` if every out team forfeited, otherwise `'credibility'`.
3. If all teams are out on the same tick, or `elapsedMs >= durationMs`: use `byScore`.
4. Otherwise return `null`.

`byScore` sorts teams by score, descending. Equal top scores give `{ winnerTeam: null, reason: 'draw' }`; otherwise `{ winnerTeam: top.team, reason: 'score' }`.

**`match-stats.ts`**
- `emptyPlayerStats(playerId, team): PlayerStats`
- `applyStatsEvent(stats: PlayerStats, event: GameEvent): PlayerStats` counts events whose `playerId` matches: verdictResult, stampApplied, minigameFailed, and `abilityUsed` once the roles cluster adds it.
- `teamScoreOf(game: GameState, team, connected): TeamScore` derives `resolved` and `expired` from `game.results`.

**`rooms.ts`** (REST, modelled on leaderboard.ts)

```ts
export const roomListStatusSchema = z.enum(['any', 'open', 'inGame']); // open = lobby|results
export const roomSummarySchema = z.object({
  code: roomCodeSchema, name: roomNameSchema.nullable(), hostNickname: nicknameSchema,
  levelId: levelIdSchema, mode: roomModeSchema, /* difficulty: difficultySchema (difficulty cluster) */
  phase: roomPhaseSchema, inGame: z.boolean(),
  players: z.number().int().min(0).max(MAX_ROOM_PLAYERS),
  playerCapacity: z.number().int().min(1).max(MAX_ROOM_PLAYERS),
  teamSizes: z.array(z.number().int().min(0).max(MAX_TEAM_PLAYERS)).max(MAX_TEAMS),
  spectators: z.number().int().min(0).max(MAX_SPECTATORS),
  canJoinAsPlayer: z.boolean(), canJoinAsSpectator: z.boolean() });
export const roomListQuerySchema = z.object({
  q: z.string().trim().max(ROOM_SEARCH_MAX_LENGTH).optional(),
  mode: roomModeSchema.optional(), levelId: levelIdSchema.optional(),
  /* difficulty: difficultySchema.optional(), */
  status: roomListStatusSchema.default('any'),
  limit: z.coerce.number().int().min(1).max(ROOM_LIST_MAX).default(ROOM_LIST_MAX) });
export const roomListResponseSchema = z.object({
  rooms: z.array(roomSummarySchema).max(ROOM_LIST_MAX), total: z.number().int().nonnegative() });
/** Lower-case and strip Polish diacritics (ą→a … ż→z, ł→l) for search. */
export function foldSearch(text: string): string
```

## 3. Server design

### 3.1 Room model (registry.ts)

```ts
type RoomMember = RoomPlayer /* existing fields */ & {
  kind: MemberKind; team: TeamIndex; // spectators keep the last team for switching back
};
type TeamRun = { game: GameState; forfeited: boolean };
type Room = { code; hostId; phase; level; stories; map; nextPlayerNumber; briefing; blunderVotes;
  mode: RoomMode;                // 'coop' at creation
  visibility: RoomVisibility;    // options.defaultVisibility ?? 'private' (config cluster)
  name: string | null; createdAt: number /* now() */;
  members: Map<string, RoomMember>; // players AND spectators, join order (renamed from players)
  teams: TeamRun[];              // length 1 (coop) or 2 (versus), always built from room.map
  stats: Map<string, PlayerStats>; outcome: VersusResult | null; };
```

New `RegistryOptions` fields:
- `features?: () => { versus: boolean; roomBrowser: boolean }` (default both `true`; supplied by the config cluster).
- `defaultVisibility?: RoomVisibility`.

Helper functions:
- `playersOf(room, team?)`, `spectatorsOf(room)`, `teamTotal(room)` (1 or 2).
- `pickTeam(room): TeamIndex | null`: co-op returns 0 if there are fewer than 4 players. Versus returns the smaller team, ties go to 0, and `null` if both teams are full.
- `freeColorIndex(room, team)`: per team, values 0..3.
- `freshTeams(room, seed?)`.
- `topicsFor(room, m)`:
  - `room:${code}` always.
  - Players add `room:${code}:t${m.team}`.
  - Spectators add `room:${code}:spec`.
- `syncTopics(room, m, before)` diffs the topic sets and calls `subscribe`/`unsubscribe`.

### 3.2 Topics and publishing

| Topic | Subscribers | Carries |
| --- | --- | --- |
| `room:CODE` | everyone | `roomState`, `gameStarted` |
| `room:CODE:t0` / `:t1` | that team's players | team snapshots and events; `playerJoined`/`Left`/`Reconnected` of that team's players (opponents' joins are no longer shown in-game); that team's `levelEnd` |
| `room:CODE:spec` | spectators | every team event, tagged with `team`; every 2nd snapshot (`game.tick % SPECTATOR_SNAPSHOT_INTERVAL_TICKS === 0`); `matchStats` every 20 ticks; both `levelEnd`s |

`publishTeam(room, team, message, toSpectators)` encodes once and publishes the same string to the team topic and, when the room has at least one connected spectator, to the spec topic. The team snapshot always carries `team`, so one encoding serves both topics.

**Bandwidth.** A snapshot with 4 players, 6 folders, 6 stations and 2 desks is about 3 KB.
- Player: 20 Hz ≈ 60 KB/s (unchanged).
- Spectator: 2 teams × 10 Hz ≈ 60 KB/s, plus about 1 KB/s of stats. A spectator costs about the same as one player.
- Full versus room (8 players + 8 spectators): about 1 MB/s.

### 3.3 Join rules (`handleJoin`)
1. Reconnect token: unchanged. `attach()` subscribes to `topicsFor(member)`, so a member always lands back in the right team or on the spectator topic.
2. Create (no code): `as === 'spectator'` creates a room whose host is a spectator.
3. `as === 'spectator'`:
   - If spectators ≥ `MAX_SPECTATORS`, answer `spectatorsFull`.
   - Otherwise add the member. No `playerJoined` event (players are not interrupted).
   - In `briefing`/`playing`/`results`, `sendSpectatorSync`: the latest `snapshotOf(room, t)` for each team plus `matchStatsOf(room)`, sent directly after `broadcastRoomState`.
4. Player:
   - In versus during `briefing`/`playing`: `matchInProgress`.
   - If `pickTeam` returns `null`: `roomFull`.
   - Mid-game co-op: `addPlayer` into `teams[0].game` (unchanged behaviour).
5. `enqueueInput` and `enqueueCommand` silently ignore spectators.

### 3.4 Lobby actions (`handleLobby`)

| Action | Who / phase | Effect / errors |
| --- | --- | --- |
| `setMode` | host, lobby | features.versus false → `featureDisabled`. **To versus:** players get `team = joinIndex % 2`, colorIndex is recomputed per team, `teams = freshTeams`, `resetReady`. **To coop:** more than 4 players → `teamFull`; otherwise everyone goes to team 0 and colours are recomputed. |
| `setTeam` | target = self, or host for others; lobby/results; versus only | Unknown target or a spectator → `invalidTarget`; team full → `teamFull`. Otherwise assign a new colorIndex, `syncTopics`, broadcast. |
| `setSpectator` | self or host; lobby/results | `true`: spectators full → `spectatorsFull`; otherwise set ready=false, drop the blunder vote, `syncTopics`. `false`: `pickTeam` returns null → `teamFull`. |
| `setVisibility` | host, any phase | `'public'` with features.roomBrowser false → `featureDisabled`. |
| `setRoomName` | host, any phase | Name is already trimmed by the schema; `null` clears it. |
| `kick` | host, any phase, target ≠ host | Unknown target → `invalidTarget`. Otherwise send `error kicked` to the target, call `removeMember` (deletes the token, unsubscribes, drops it from the sim), then `close(CLOSE_KICKED = 4002, 'kicked')`. |
| `transferHost` | host, any phase | Target must exist, be connected and not be self; else `invalidTarget`. Then `hostId = target`. |
| `start` | host | Existing ready gate (connected non-host **players** only). Then a team gate: every team in `teamTotal(room)` needs at least one connected player, else `teamEmpty` with detail `team N`. |
| `voteBlunder` | players only | Validates against the voter's team results: `room.teams[member.team].game.results`. |

`reassignHost` prefers a connected player, then a connected spectator, then anyone.

`notReadyPlayers` and `finishBriefingIfAllSkipped` count only `kind === 'player'`.

### 3.5 Start, tick, end

**`startLevel`**
- `setLevel` runs once: the endless or bag schedule is generated once per room and **shared**.
- `seed = floor(random() * 0x7fffffff)`.
- `teams = range(teamTotal).map(t => ({ game: players of t added to createGameState({ map, seed }) at spawnPoint(map, p.colorIndex), forfeited: false }))`.
- Reset `stats` (an `emptyPlayerStats` entry for every player) and set `outcome = null`.
- `gameStarted` goes to the room topic.

**`tick`** (per room, after grace and briefing handling)

```
ctx = { dtMs, map, level, stories /*, difficulty */ }          // once, shared by every team
events[t] = step(teams[t].game, inputsOf(t), commandsOf(t), ctx) for each t (same tick count)
stats = events.reduce(applyStatsEvent)
scoreboard = mode==='versus' ? teams.map(teamScoreOf) : undefined
for t: publishTeam(event messages {tick, team:t, event}); publishTeam(snapshotOf(room,t,scoreboard),
       toSpectators = tick % SPECTATOR_SNAPSHOT_INTERVAL_TICKS === 0)
if spectators && tick % SPECTATOR_STATS_INTERVAL_TICKS === 0: publish matchStats to :spec
ended = coop ? teams[0].game.ended !== null
             : (room.outcome = versusOutcome(standings, elapsedMs, matchDurationMs(level))) !== null
if ended: endLevel(room)
```

In versus endless, `snapshotOf` sets `timeLeftMs = max(0, 600_000 - elapsedMs)`, so the HUD counts down.

A team becomes `forfeited` when `removeMember` drops its last player while `phase === 'playing'`. That happens once the 60 s grace has run out.

**`endLevel`**
- Co-op: unchanged, except it is published on `t0` and spec, and adds `stats`.
- Versus: send a per-team `levelEnd` with `team`, `won = winnerTeam === team`, `versus: { winnerTeam, reason, teams: scoreboard }` and `stats`.
- `recordEndlessRun` only runs in co-op.
- `backToLobby` and `selectLevel` reset to `freshTeams`.

### 3.6 `inspect()` and test churn plan

`inspect(code)` keeps `game` as an **alias of `teams[0].game`**, so the 33 existing uses do not change. It adds:
- `games: GameState[]`, `mode`, `visibility`, `name`, `outcome`
- `players[].team`
- `spectators: [{ id, nickname, connected }]`

New tests use a shared fixture, `apps/server/src/__fixtures__/room-helpers.ts`, with `join(nickname, { code, as, token })`, `welcomeOf`, `startPastBriefing`, `versusRoom(n0, n1)` and `forceStep(teamOf, patch)`, which wraps the real `step` and patches one team's state. The old files keep their local helpers.

### 3.7 GET /api/rooms
- `registry.listRooms(query): RoomListResponse`:
  1. Filter: `visibility === 'public'`, at least one connected member, features.roomBrowser on.
  2. Map with `summaryOf`. `canJoinAsPlayer = players < capacity && phase ∈ {lobby, results}`; `canJoinAsSpectator = spectators < 8`; capacity is 4 in co-op, 8 in versus.
  3. Apply filters: `q` with `foldSearch` against the code prefix, room name and host nickname; `mode`; `levelId`; `status`.
  4. Sort: `canJoinAsPlayer` descending, then `createdAt` descending.
  5. Cap at `limit` and return `{ rooms, total }`.
- Route: `.get('/rooms', zValidator('query', roomListQuerySchema), …)` in `createApiRoutes`.
  - Rate limit: `ROOM_LIST_REQUESTS_PER_MINUTE_PER_IP = 60` (limits.ts), keyed by `clientAddress(c)`. Prune lazily every 256 requests (no timers in tests). Over the limit: 429 `{ error: 'too many requests' }`.
  - Feature off: 404.
  - `ApiDeps` gains an optional `features`.

### 3.8 Client IP fix (S7-D01)

**Caddyfile**, global options block:

```
{
	servers {
		trusted_proxies static {$TRUSTED_PROXIES:private_ranges}
		trusted_proxies_strict
	}
}
```

Add `header_up X-Real-IP {client_ip}` to the `reverse_proxy server:3000` block. In compose, the `web` service gets `TRUSTED_PROXIES: ${TRUSTED_PROXIES:-private_ranges}`.

**New `apps/server/src/client-address.ts`**: `clientAddress(c: Context): string`.
1. Use the `x-real-ip` header if present. Caddy always overwrites it, and the server is never exposed directly.
2. Otherwise use `getConnInfo(c).remote.address`, wrapped in try/catch because `app.request()` in tests has no Bun server.
3. Otherwise `'unknown'`.

ws.ts and api.ts both use it, and XFF parsing is removed. docs/deploy.md L108-109 is rewritten, and a `TRUSTED_PROXIES` row is added to the config table.

## 4. Client design

### 4.1 GameView refactor (S7-D10, no behaviour change for players)

**New `net/game-view.ts`:**

```ts
export type ViewRuntime = { readonly map: TileMap; readonly buffer: SnapshotBuffer;
  onSnapshot(s: SnapshotMessage, receivedAt: number): void;
  frame(now: number, dtMs: number): Map<string, RenderedPlayer>; reset(levelId?: string): void };
export type GameView = {
  kind: 'player' | 'spectator'; team: TeamIndex;
  runtime: ViewRuntime; store: GameStoreApi; render: RenderState;
  feedback: Feedback; // ReturnType<typeof createFeedback>
  /** Local player (player view) or followed player (spectator view). */
  subjectId(): string | null;
};
export const GameViewContext = createContext<GameView | null>(null);
export function useGameView(): GameView   // context ?? playerView
export function useViewGame<T>(selector: (s: GameStore) => T): T // useStore(useGameView().store, selector)
```

**Supporting changes**
- `game-store.ts`: export `createGameStore()`. `useGame = createGameStore()` (same API) and gains `scoreboard: TeamScore[] | null`.
- `runtime.ts`: `GameRuntime extends ViewRuntime { predictor }`, plus `createWatchRuntime(levelId, delayMs = SPECTATOR_INTERPOLATION_DELAY_MS)`, a buffer-only runtime in which every player is remote.
- `render-state.ts`: `createRenderState()`; `renderState` stays as the default instance.
- `session.ts` exports `playerView = { kind: 'player', team: 0, runtime, store: useGame, render: renderState, feedback, subjectId: () => useApp.getState().playerId }`.

**Migration of the scene files.** Ambience, CameraRig, Decor, Driver, EventMarkers, EventsWorld, Fixtures, Folders, GuidanceMarkers, InteractionHighlight, Newsroom, PlayerAvatar, StationIndicators, Players, PingBubbles, Particles and GameCanvas change mechanically: `runtime.map` → `view.runtime.map`, `useGame` → `useViewGame`/`view.store`, `renderState` → `view.render`, `feedback` → `view.feedback`, and the local id → `view.subjectId()`.

**Context across separate roots.** `useOverlay` wraps its node in `<GameViewContext.Provider value={view}>`, because it is a separate root. drei `Html` children get the same wrapper. Each `<Canvas>` also renders an explicit Provider inside, so nothing relies on R3F context bridging.

**Spectator-specific scene behaviour**
- `Players` filters by `p.team === view.team`.
- CameraRig: `follow = view.kind === 'spectator' ? view.render.local !== null : (tilePxIfFit < MIN_TILE_PX && local !== null)`. Only the player view connects `addTrauma`/`screenX` to the global feedback. Spectator fit uses a top margin of 2 tiles instead of 5.

**`GameCanvas({ primary = true })`**
- Spectator views omit InteractionHighlight and GuidanceMarkers.
- `PerfProbe`, the `__scene`/`installGameHook` debug wiring and the preset-detection effect run only when `primary`. PerfProbe takes a `viewKey`, writes `perfStats.views[viewKey]`, and PerfOverlay shows the sum.

**`CueContext.silent?: boolean`**: when set, `feedback.emit` skips sound and loops.

### 4.2 Session, stores, routing (S7-D09)

**API and stores**
- `joinRoom(nickname, roomCode?, as: MemberKind = 'player')`; `useApp.lastJoinCode` remembers the code.
- `ScreenId` adds `'spectate'`.
- `selfKind(room, playerId)` is derived from `room.spectators`.

**`roomState` routing for spectators**
- `lobby` → lobby screen.
- `briefing` → Briefing (read-only: "Oglądasz" replaces Gotowy; reset the spectate views).
- `playing`/`results` → `'spectate'`.

**Message routing when this client is a spectator**
- Snapshot with `team` → `useSpectate.getState().views[team].runtime/store`.
- Events → `routeViewEvent(view, event)`. `contextFor` in net/game-events.ts is refactored to take a `ViewLookup { map, store, render }`.
- `matchStats` → spectate store.
- `levelEnd` → `levelEnds[team]`.

**Errors**
- `'kicked'`: `setSlot(null)`, `closeSession()`, `resetToMenu()`, then show `pl.errors.kicked` on the menu.
- `'matchInProgress'` on the menu shows an "Oglądaj" button that calls `joinRoom(nick, lastJoinCode, 'spectator')`.

**Lobby and screen loading**
- `LOBBY_ERRORS` adds teamFull, spectatorsFull, teamEmpty, invalidTarget and featureDisabled.
- The lazy chunk `loading/game-chunk.ts` imports a module that exports both `GameScreen` and `SpectateScreen`. `GameGate` gets `which: 'game' | 'spectate'`.

### 4.3 Spectate screen (S7-D15, S7-D16)

**Why two canvases.** Each spectator view is its own `<Canvas>`.
- **Nothing that depends on `useThree` changes.** That covers camera/size in CameraRig, `screenTransform` and `useOverlay` anchored to `gl.domElement.parentElement`, drei `Html`, PlayerAvatar tags and StationIndicators.
- **Budget.** Spectator canvases are capped at the `medium` preset, `maxDpr ≤ 1.5`, no shadows. Measured cost is 35–37 calls and 12.5–12.8k triangles per view, so two views come to about 74 calls and about 26k triangles. That is under 150 calls on desktop and under 100 on mobile, and far under 100k triangles.
- **Phones always use the `single` layout**, so a second WebGL context never exists on weak GPUs.
- **R3F runs one shared rAF loop** for all roots.
- **Costs:** duplicate procedural GPU resources (a few MB), a Warmup shader compile per canvas, and 2 of the browser's 8–16 contexts.
- **Rejected alternative.** A scissored single canvas (drei `View`) would need a per-view camera/size and a rewrite of the overlay/`Html` anchoring. That is high regression risk for the player view, which matters more.

**Layout.** `spectate-layout.ts` is a pure function, `chooseSpectateLayout({ width, height }, teams)`:
- One team → `'single'`.
- `width ≥ 1000 && width / height ≥ 1.2` → `'side'`.
- `width ≥ 700 && height ≥ 900` → `'stacked'`.
- Otherwise `'single'`.

The user can override with a focus toggle (`'focus0'`/`'focus1'`), which unmounts the other canvas.

**Screen elements**

- **Top bar (full width).** `[K badge] Kurier 240 ♥72 | ⏱ 4:12 | ♥55 195 Głos [G badge]`. The leader gets the `crown` icon. Data comes from `scoreboard`, or from the view store in co-op.
- **Per-view header plate.**
  - Team badge and name.
  - Player chips: PlayerMark, nickname and a status icon (folder / station icon / desk).
  - Tapping a chip, or `←/→`, follows that player.
  - The followed player gets a **blue** selection ring (blue = selection, per design rules §3).
- **FollowCard** (bottom of the followed team's view, ≤ 8 words per line). It never reveals answers:
  - The carried folder: headline via `typeset`, stamp **icons only** (no stamp result text, no truth before `verdictResult`), deadline ring.
  - Station phase: "Pracuje 60%", "Rozwiązuje zadanie", or "Blokada 2 s".
  - Or the desk: "Wydaje werdykt".
  - Built with `selectCarried`, `selectOperatedStation` and `selectOperatedDesk` on the view store. No protocol additions.
- **Event feed.**
  - `feed-model.ts` (pure): `feedItemFor(event, team, lookups) → FeedItem | null`. It handles:
    - `verdictResult`: correct → ✓; wrong → ✗; wrong + publish on a `false` story → "opublikował fałszywkę!".
    - `folderExpired`.
    - `levelEvent` start.
    - `raidResolved`.
    - `deadlineExtended`.
    - `abilityUsed` (from the roles cluster).
  - It keeps the newest 8 items (`SPECTATOR_FEED_MAX = 8`; 4 visible on desktop, 2 at 640×360).
  - It starts empty on a mid-match join, since the stats already carry the totals.
- **Stats sheet.** A side sheet of `min(420px, 40vw)`; full screen on phones.
  - Rows grouped by team: PlayerMark + nick | Werdykty | Trafność | Pieczątki | Pomyłki w zadaniach | Umiejętności.
  - Accuracy (`stats-model.ts`) = `round(100 * correct / verdicts)`, or "–" when there are no verdicts.
- **Spectator results** (phase `results`):
  - Winner ribbon for versus; won/lost for co-op.
  - Team score cards and the final stats from `levelEnd.stats`.
  - A Kolegium tab per team (Segmented control from endless/Leaderboard.tsx), read-only with no votes.
  - If the spectator is the host: yellow "Wróć do redakcji" (`backToLobby`); start/replay as in ResultsPlate.

**Audio and captions**
- Each spectator view has its own `createFeedback(...)`. Particles and animations connect per view.
- `playSound` is connected with `volume × SPECTATOR_SFX_GAIN (0.6)` and pan `TEAM_PAN = [-0.5, 0.5]` (0 in `single`).
- Only `SPECTATOR_AUDIBLE_CUES` play: verdict outcomes, folder expiry, `event.*.start`, raid resolved and ability cues. Everything else is emitted with `silent: true`. These are presentation constants in the client spectate module.
- Captions are not used, because the feed is the visual twin of every audible cue (documented in docs/accessibility.md).
- Music: `requestMusic('game')` plus ambience. No haptics, no shake, no `attachInput`.

**Per-device controls.** `useInputCapture(true)` plus `useNavIntent`.

| Action | Keyboard | Gamepad | Touch / mouse |
| --- | --- | --- | --- |
| Previous / next player to follow (team 0 players, then team 1) | ←/→ or A/D | D-pad/stick ←/→ | Tap a player chip |
| Toggle split / focus on the followed player's team | Space/Enter | A | Tap the team plate; in `single`, tap a team segment in the top bar |
| Focus team 0 / team 1 | Digit1 / Digit2 | — | — |
| Stop following | Esc | B | Tap the FollowCard close button |
| Stats sheet | Tab or Q | Y | "Statystyki" button |

A hint row ≤ 8 words is shown for keyboard and gamepad. Touch chips need none.

**At 640×360.** `single` layout:
- Top bar 2.75 rem.
- Feed with 2 rows, bottom-left. The FollowCard replaces the feed while following.
- Bottom-right: stats and leave buttons, 48 px.
- No RotatePrompt (spectating works in portrait).
- `data-compact` on the view root shrinks station signs to the 46 px phone size inside narrow views.

**Co-op spectating.** A single view with a co-op scoreboard (score, credibility, time, resolved and expired counts), plus the same feed, follow and stats. This is the teacher-on-a-projector flow.

**Ads.** The config/ads cluster mounts `AdSlot placement="spectator"` only in spectator results and in the side-layout stats sheet, never over the live canvases.

### 4.4 Lobby UI (S7-D11, S7-D12)

**Header**
- Code pill.
- Room name: host gets an inline `Field`, `maxLength` 24, committed on blur/Enter, sent as `setRoomName`; guests see text or the default "Pokój: {host}".
- Visibility (host only, any phase): Segmented "Prywatny" (lock) / "Publiczny" (globe) with a one-line hint. Guests see a chip.
- Existing top actions unchanged.

**Mode**: host Segmented "Razem" / "Na punkty"; guests see a chip.

**Players**
- Co-op: today's row of 4 seats.
- Versus: two columns.
  - Column header: TeamBadge, name, "n z 4"; a white "Przejdź tutaj" button for self when there is room.
  - Up to 4 PlayerCards per column, using a compact variant on phones.
  - A "Drużyny są nierówne" note shows when sizes differ (it does not block the start).

**Spectator strip**: "Widownia: n z 8" with eye chips. Self gets "Na widownię" / "Do gry".

**Spectators in the lobby**: no RolePasses and no ReadyToggle. "Oglądasz. Gospodarz zaraz zaczyna." If a seat is free, the yellow action is "Do gry"; otherwise there is no yellow button.

**Host manage sheet** (S7-D12). A "more" button on each other member's card opens a `<dialog>` with:
- "Przenieś do: Głos"
- "Na widownię" / "Do gry"
- "Przekaż gospodarza" (crown icon)
- "Usuń z pokoju", a destructive back-style button with a confirm step ("Usunąć na pewno?" / "Tak, usuń")

**Start reasons**: add `startTeamEmpty(team)`.

**Level details** (S7-D12). LevelCard gets "Szczegóły", visible to guests too, which opens `LevelDetailsSheet`. The pure helper `levelDetails(level, mode)` provides:
- Minutes; folder count, or the pool size when the bag applies.
- Stations: icon, name and purpose line (the purpose strings come from the UI cluster).
- Events (icons and names).
- Star rule, worded as shares of the maximum score so the bag/results cluster's adaptive thresholds stay explainable.
- The versus rule line, and the 10-minute endless versus line.

**Devices**
- Gamepad and keyboard use the existing spatial `menu-nav`. Every new control is a native button or radio.
- At 640×360 the page scrolls. The footer with the single yellow action is sticky, and touch targets are at least 48 px.

**Cues**: `lobby.modeSwitch`, `lobby.teamSwitch`, `lobby.hostChanged`, and `lobby.spectatorJoined` (fires when the spectators list grows).

### 4.5 Room browser (S7-D13)

**Data**
- `fetchRooms(query, signal)` in net/api.ts, modelled on `fetchLeaderboard`, parsed with `roomListResponseSchema`.
- `useRoomList` follows the use-leaderboard pattern with loading/ready/error states. It polls every `ROOM_LIST_POLL_MS = 4000` (client const) while the dialog is open and `document.visibilityState === 'visible'`, aborting on close.

**Entry points in MainMenu**
- A secondary "Publiczne pokoje" button with the globe icon, under the join row. It is hidden when the public config says `features.roomBrowser` is false.
- An icon-only eye button "Oglądaj" next to "Dołącz", for spectating by code.

**`RoomBrowserDialog`**, using the native `<dialog>` like LeaderboardDialog; full screen on phones.
- Header: title and close.
- Search `Field`: "Kod, nazwa lub gospodarz".
- Filters as Segmented controls:
  - Tryb: Wszystkie / Razem / Na punkty
  - Stan: Wszystkie / Czekają / W grze
  - Difficulty, once the difficulty cluster lands
  - At `max-height: 500px` the filters collapse behind a "Filtry (n)" toggle.
- List rows, at least 56 px, used as a radio list (blue selection):
  - mode icon, name or "Pokój: {host}", "Gospodarz: {host}"
  - level title from `getLevel`
  - difficulty chip
  - players "n/max" (and "2 v 3" in versus), eye + spectator count
  - a "W grze" chip with the play icon
- Footer: one yellow button, "Dołącz", enabled when `canJoinAsPlayer`, plus a white "Oglądaj". With no selection, the yellow button is disabled.
- An empty nickname shows the nickname Field inside the dialog.
- States: empty, filtered-empty, and error with retry.
- Cues: reuse the existing `ui.*` button cues.

### 4.6 Versus HUD and results (S7-D14)

**`hud/VersusChip.tsx`**
- Shown only when `useGame(s => s.scoreboard)` is non-null.
- Content: the rival's TeamBadge, the rival's score (`use-rolled-number`), and an `arrow` icon rotated up (ahead) or down (behind); no arrow when tied.
- `aria-label`: "Rywale – Głos: 195 pkt".
- Desktop: hangs under the pill like `.tempo` (Hud.module.css L71). In endless versus it replaces the TempoChip, and LevelTimer counts down.
- Phone: a segment at the end of the one-row pill (coordinate with the mobile HUD cluster).

**`hud/versus-model.ts`** (pure)
- `leadState(own, opp): 'ahead' | 'behind' | 'tied'`.
- `leadCue(prev, next, lastCueAtMs, nowMs): 'versus.leadTaken' | 'versus.leadLost' | null`, honouring `VERSUS.leadCueCooldownMs`.

**ResultsPlate** gets a `VersusBanner` above the existing ribbon:
- "Wygrana!" (green + trophy) / "Przegrana" (red + cross) / "Remis" (blue).
- Score line "Kurier 240 : 195 Głos" with badges, and a reason line.
- Cues `versus.win` / `versus.lose` / `versus.draw` fire at the reveal.

**Design rules amended in the same commit**
- §1.3 and §5: "in versus also the rival's points (one chip)".
- §3 colour table: rows for `--team-0/--team-1`.

### 4.7 Tokens and icons

**tokens.css**

```css
--team-0: var(--outline); --team-0-ink: var(--surface);  /* Kurier: navy shield */
--team-1: var(--surface); --team-1-ink: var(--outline);  /* Głos: white seal, navy outline */
```

**tokens.ts**: `teamColors = [{ fill: colors.outline, ink: colors.surface }, { fill: colors.surface, ink: colors.outline }] as const`.

**`ui/TeamBadge.tsx`**: an SVG shield or seal with the team letter, in the PlayerMark style.

**Icons added to `Icon.tsx`**: `eye`, `search`, `swap`, `more`.

### 4.8 Cues (fx/cues.ts), captions, game-feel rows

All sounds reuse existing sprite ids.

| Cue | Sound | Animation | Particles | Haptic | Sev. | Caption |
| --- | --- | --- | --- | --- | --- | --- |
| `versus.leadTaken` | `chime` sfx 0.7 | new trigger `versusLead` (chip pop) | — | `tick` | 2 | chip('arrow', 'Prowadzicie!', 'good') |
| `versus.leadLost` | `lowsting` sfx 0.5 | `versusLead` (shake; fade with reduced motion) | — | `tick` | 2 | chip('arrow', 'Rywale prowadzą', 'warn') |
| `versus.win` | `fanfare` | ribbon slam | confetti | `success` | 3 | skip('visual-elsewhere') |
| `versus.lose` | `lose` | ribbon slam | — | `thud` | 3 | skip('visual-elsewhere') |
| `versus.draw` | `hmm` | ribbon slam | — | — | 2 | skip('visual-elsewhere') |
| `lobby.modeSwitch` | `slide` ui | — | — | `tick` | 1 | skip('ui') |
| `lobby.teamSwitch` | `slide` ui | card slides between columns | — | `tick` | 1 | skip('visual-elsewhere') |
| `lobby.hostChanged` | `chime` ui 0.6 | crown pop | — | — | 1 | skip('visual-elsewhere') |
| `lobby.spectatorJoined` | `join` ui 0.5 | — | — | — | 1 | chip('eye', 'Nowy widz', 'info') |
| `lobby.kicked` | `buzzer` | — | — | `thud` | 2 | skip('visual-elsewhere') |
| `spectate.follow` | `slide` ui | camera glide | — | — | 1 | skip('ui') |
| `spectate.feed` | `tick` ui 0.3 | new trigger `feedPop` (row slides in; fade with reduced motion) | — | — | 1 | skip('visual-elsewhere') |

Each cue gets a row in agents/game-feel.md. All cues respect mute, reduced motion and no-flash: no flashing anywhere, and no shake when reduced motion is on.

### 4.9 Strings (apps/client/src/strings/pl.ts, via `typeset()` for sentences)

**`errors`** (added)
- teamFull: 'Ta redakcja ma już komplet.'
- spectatorsFull: 'Na widowni nie ma już miejsc.'
- matchInProgress: 'Pojedynek trwa. Możesz go oglądać.'
- teamEmpty: 'Każda redakcja potrzebuje gracza.'
- kicked: 'Gospodarz usunął cię z pokoju.'
- invalidTarget: 'Tej osoby nie ma już w pokoju.'
- featureDisabled: 'Ta opcja jest wyłączona na serwerze.'

**`vocab`**
- `modes: { coop: 'Razem', versus: 'Na punkty' } satisfies Record<RoomMode, string>`
- `visibility: { private: 'Prywatny', public: 'Publiczny' } satisfies Record<RoomVisibility, string>`
- `teams: ['Kurier', 'Głos'] as const`

**`lobbyRoom`**
- modeHints:
  - coop: 'Jedna redakcja, wspólny wynik'
  - versus: 'Dwie redakcje, wygrywa więcej punktów'
- visibilityHints:
  - private: 'Wejście tylko z kodem'
  - public: 'Pokój widać na liście'
- nameLabel: 'Nazwa pokoju'
- namePlaceholder: 'np. 3B – piątek'
- noName: (h) => `Pokój: ${h}`
- teamCount: (n, m) => `${n} z ${m}`
- joinTeam: 'Przejdź tutaj'
- uneven: 'Drużyny są nierówne'
- spectatorsTitle: (n, m) => `Widownia: ${n} z ${m}`
- toSpectators: 'Na widownię'
- toPlayers: 'Do gry'
- spectatorWaiting: 'Oglądasz. Gospodarz zaraz zaczyna.'
- startTeamEmpty: (t) => `${t}: brak graczy.`

**`manage`**
- open: (n) => `Opcje: ${n}`
- moveTo: (t) => `Przenieś do: ${t}`
- makeHost: 'Przekaż gospodarza'
- kick: 'Usuń z pokoju'
- kickConfirm: 'Usunąć na pewno?'
- kickYes: 'Tak, usuń'
- cancel: 'Anuluj'

**`levelDetails`**
- open: 'Szczegóły'
- stations: 'Stanowiska'
- events: 'Zdarzenia'
- stars: 'Gwiazdki'
- starOne: 'Przetrwajcie z wynikiem ponad zero'
- starShare: (p) => `${p}% możliwych punktów`
- versusRule: 'Wygrywa redakcja z większą liczbą punktów'
- versusEndless: (m) => `Pojedynek trwa ${m} minut`
- endlessRule: 'Gra trwa, dopóki macie wiarygodność'

**`rooms`**
- open: 'Publiczne pokoje'
- title: 'Publiczne pokoje'
- close: 'Zamknij listę'
- searchLabel: 'Szukaj'
- searchPlaceholder: 'Kod, nazwa lub gospodarz'
- filters: (n) => `Filtry (${n})`
- filterMode: 'Tryb'
- filterStatus: 'Stan'
- all: 'Wszystkie'
- statusOpen: 'Czekają'
- statusInGame: 'W grze'
- host: (h) => `Gospodarz: ${h}`
- players: (n, m) => `Gracze: ${n} z ${m}`
- spectators: (n) => `Widzowie: ${n}`
- join: 'Dołącz'
- watch: 'Oglądaj'
- loading: 'Szukam pokoi…'
- empty: 'Brak publicznych pokoi. Otwórz własny!'
- emptyFiltered: 'Nic nie pasuje. Zmień filtry.'
- error: 'Nie udało się wczytać listy.'
- retry: 'Spróbuj ponownie'
- full: 'Pełny'

**`versus`**
- chipLabel: (t, s) => `Rywale – ${t}: ${s} pkt`
- win: 'Wygrana!'
- lose: 'Przegrana'
- draw: 'Remis'
- reasons:
  - score: 'Więcej punktów'
  - credibility: 'Rywale stracili wiarygodność'
  - ownCredibility: 'Straciliście wiarygodność'
  - forfeit: 'Rywale opuścili pojedynek'
  - ownForfeit: 'Wasza redakcja opuściła pojedynek'
  - draw: 'Tyle samo punktów'

**`spectate`**
- title: 'Widownia'
- following: (n) => `Śledzisz: ${n}`
- stopFollow: 'Przestań śledzić'
- feedTitle: 'Na żywo'
- statsTitle: 'Statystyki'
- stats:
  - player: 'Gracz'
  - verdicts: 'Werdykty'
  - accuracy: 'Trafność'
  - stamps: 'Pieczątki'
  - fails: 'Pomyłki w zadaniach'
  - abilities: 'Umiejętności'
- feed:
  - correct: (n) => `${n}: trafny werdykt`
  - wrong: (n) => `${n}: błędny werdykt`
  - blunder: (n) => `${n}: puścił fałszywkę!`
  - expired: 'Teczka przepadła'
  - extended: (n) => `${n}: więcej czasu`
- status:
  - carrying: 'Niesie teczkę'
  - working: (p) => `Pracuje ${p}%`
  - minigame: 'Rozwiązuje zadanie'
  - lockout: (s) => `Blokada ${s} s`
  - desk: 'Wydaje werdykt'
  - idle: 'Szuka zajęcia'
- hintKeys: '←/→ śledź · Spacja widok · Tab statystyki'
- hintPad: '←/→ śledź · A widok · Y statystyki'
- watching: 'Oglądasz'

**`a11y.captions`** (added)
- leadTaken: 'Prowadzicie!'
- leadLost: 'Rywale prowadzą'
- spectatorJoined: 'Nowy widz'

## 5. Tests

### Shared
- **versus.test.ts**, with teams A = `{ team: 0, score: 120, cred: 40 }` and B = `{ team: 1, score: 90, cred: 55 }` and duration 480_000:
  - At elapsed 479_950 → `null`.
  - At 480_000 → `{ 0, 'score' }`.
  - B cred 0 at 100_000 with B score 300 → `{ 0, 'credibility' }`.
  - Both cred 0, scores 50 and 70 → `{ 1, 'score' }`.
  - 100 : 100 at time → `{ null, 'draw' }`.
  - B forfeited → `{ 0, 'forfeit' }`.
  - `matchDurationMs({ durationS: 86400, endless: true }) === 600_000`; `matchDurationMs({ durationS: 480 }) === 480_000`.
- **match-stats.test.ts**:
  - verdictResult correct → verdicts 1, correct 1.
  - wrongJustification → verdicts 1, correct 0, wrong 0.
  - wrong → wrong 1.
  - stampApplied → stamps 1.
  - minigameFailed → minigameFails 1.
  - An event for another player leaves the stats unchanged.
- **rooms.test.ts**:
  - Query defaults: `status 'any'`, `limit 50`.
  - Rejects limit 51 and a 25-character `q`.
  - `foldSearch('Łukasz Żółć') === 'lukasz zolc'`.
- **protocol.test.ts**: accepts the 7 new lobby actions; rejects `setTeam` team 2, a room name with `\u0007`, a 25-character name, a roomState with 9 players or 9 spectators, a snapshot with `team: 2`, and a `matchStats` with 9 players.

### Server
- **versus.test.ts**:
  - setMode by host alternates teams [0, 1, 0]; a guest gets `notHost`.
  - setTeam to a full team → `teamFull`.
  - Start with team 1 empty → `teamEmpty`.
  - After start, `games.length === 2`, `games[0].rng === games[1].rng`, and each player is only in their team's game.
  - A team-0 socket receives only `team: 0` snapshots, each with `scoreboard.length === 2`.
  - After 100 ticks the ticks are equal and the spawned storyIds are equal.
  - Team-1 input moves only in `games[1]`.
  - `forceStep` sets team-1 credibility to 0 → both teams get `levelEnd.versus` `{ winnerTeam: 0, reason: 'credibility' }`, phase `results`.
  - Equal scores at time-out → draw.
  - Mid-match player join → `matchInProgress`.
  - A reconnecting team-1 player receives team-1 snapshots.
  - Every team-1 player removed after `RECONNECT_GRACE_MS` → `forfeit`.
  - Endless versus ends at 600 s (stubbed `elapsedMs`) and `recordLeaderboardEntry` is not called.
- **spectators.test.ts**:
  - Join as spectator in the lobby and mid-match; the ninth spectator → `spectatorsFull`.
  - Snapshots arrive only on even ticks, with team tags 0 and 1.
  - `matchStats` arrives every 20 ticks.
  - A sync is sent on attach.
  - Spectators never block ready or briefing.
  - Spectator input is ignored.
  - A spectator host can start.
  - `setSpectator(false)` with no free seat → `teamFull`.
  - Co-op spectators receive `team: 0` snapshots.
- **lobby-admin.test.ts**:
  - kick: host only; not self; the target gets an `error kicked` and close 4002; its token gives `reconnectFailed`.
  - transferHost: to a disconnected member → `invalidTarget`.
  - setVisibility and setRoomName (trim; `null` clears).
  - Host leaves → a connected player is preferred over a spectator.
- **api.test.ts** (rooms):
  - Private rooms are hidden.
  - A public room is listed with its fields.
  - `q` matches the host 'Łukasz' by 'luk'.
  - The `mode` and `status` filters work, and the `limit` cap holds.
  - The 61st request from `x-real-ip: 1.2.3.4` gets 429, while another IP still gets 200.
  - With the feature off → 404.
- **client-address.test.ts**: X-Real-IP is preferred, X-Forwarded-For is ignored, and the result is `'unknown'` when there is no server.
- **Existing files**: unchanged and green (the `game` alias).

### Client unit
- **spectate-layout.test.ts**: (1366,768) → side; (1280,720) → side; (1024,768) → side; (863,360) → single; (640,360) → single; (768,1024) → stacked; (390,844) → single; teams = 1 → single.
- **feed-model.test.ts**: correct, wrong, blunder (publish on a false story), expired; botRaid start → 'Atak botów'; an end event → `null`; stampApplied → `null`; the cap of 8.
- **versus-model.test.ts**: (240,195) → ahead; (195,240) → behind; (100,100) → tied; behind→ahead at 6000 ms with the last cue at 0 → leadTaken; at 3000 ms → `null`; ahead→tied → `null`.
- **stats-model.test.ts**: accuracy 4/5 = 80; 0 verdicts → `null`.
- **game-view.test.ts**: a snapshot applied to a spectator view does not touch `useGame`.
- **feedback test**: `silent` suppresses sound but keeps particles.
- **captions.test.ts**: exhaustiveness covers the new cues automatically.

### e2e (desktop + mobile projects)
- **versus.spec.ts**: the host switches to "Na punkty"; two guests land in opposite columns; start → each sees `data-testid="versus-chip"`; `avatarPositions` shows only own-team nicknames.
- **spectate.spec.ts**:
  - Co-op: the host presses "Na widownię" and starts → `spectate-screen` with 1 canvas and the scoreboard.
  - Versus: 2 canvases on desktop, 1 on mobile.
- **room-browser.spec.ts**: the host sets Publiczny and the name "3B piątek"; a viewer opens Publiczne pokoje, searches "3b", selects the row, presses Dołącz and sees the room code.
- **performance.spec.ts** (new case): spectator split, desktop, summed draw calls ≤ 150 and triangles ≤ 100k; mobile `single` ≤ 100. `__scenes`/`perfStats.views` are exposed for this.

### Smoke, bench
- tools/smoke/smoke.ts: `GET /api/rooms` → 200 and parses `roomListResponseSchema`.
- `tools/perf/server-tick.ts`: 150 versus rooms × 8 scripted inputs, mean `tick()` over 200 ticks. Target < 25 ms on CI-class hardware; the result is documented in docs/performance.md.

## 6. Docs and rules (land with the code that needs them)
- **docs/design-document.pl.md**:
  - New section "Tryb na punkty, widownia i lista pokoi" (rules, winner, endless 10 min, no leaderboard, spectators, public rooms).
  - "Model sieciowy": 4 per newsroom, 8 per room in versus, 8 spectators.
  - Protocol table: `matchStats`, the lobby actions.
  - Screens: Lista pokoi, Widownia.
- **agents/architecture.md** L53-55: topics and caps.
- **agents/platforms.md**: input table rows for spectate.
- **agents/design-rules.md**: §1.3, §3 (team tokens), §5.
- **agents/glossary.md**: Razem/Na punkty `mode`, Redakcja Kurier/Głos `team`, Widz/Widownia `spectator`/`spectate`, Publiczny/prywatny `visibility`, Nazwa pokoju `roomName`, Lista pokoi `roomBrowser`, Usuń z pokoju `kick`, Przekaż gospodarza `transferHost`, Śledź `follow`, Na żywo `eventFeed`, Tablica wyników `scoreboard`, Statystyki `matchStats`, Walkower `forfeit`, Remis `draw`.
- **agents/game-feel.md**: the 12 rows.
- **docs/implementation-plan.md**: Stage 7 S7-D01..S7-D18 and the Decision log rows below.
- **docs/privacy.pl.md** (coordinate with the ads rewrite): "Pokój jest prywatny, dopóki gospodarz nie oznaczy go jako publiczny. Na liście pokoi widać wtedy kod, nazwę pokoju, podpis gospodarza, poziom i liczbę osób. Widzowie widzą podpisy graczy i ich statystyki w trakcie gry."
- **docs/deploy.md**: TRUSTED_PROXIES, the client IP paragraph, the limits table (players 4/8, spectators 8, room list 60/min/IP).
- **docs/accessibility.md**: team badges; feed instead of captions for spectators.
- **docs/performance.md**: spectator numbers and the server tick bench.
- **docs/contest/criteria-mapping.pl.md**: versus as an optional mode (co-op stays the pillar).

**Decision log rows**
1. Versus = parallel identical newsrooms.
2. Winner, draw, forfeit and endless-10-min rules; no leaderboard or campaign progress for versus.
3. Room caps 8 + 8; player-join rules.
4. Spectator topic at 10 Hz, server-side stats, two canvases.
5. Private by default.
6. Kick without IP ban.
7. Client IP via Caddy `client_ip` / X-Real-IP.
8. HUD rule: the rival chip.
9. Team identity: navy/white shapes.
10. The host may be a spectator.

## 7. Cross-cluster contracts and landing order
- **protocol.ts / constants.ts.** Every Stage 7 cluster edits these: difficulty, abilities, nextFolderInMs, multi-stamp verdict, results "why", new stations. Land S7-D02 early. There is **one** PROTOCOL_VERSION bump. Others only add fields. `MAX_PLAYERS` keeps its per-sim meaning.
- **registry.ts.** S7-D04 restructures it (`room.teams[]`, `snapshotOf`, `levelEndFor`, a single `ctx` per tick). Difficulty (ctx), bag (`setLevel`/`startLevel`), abilities (commands), the next-folder timer (`snapshotOf`) and results-why (`levelEndFor`) should rebase onto these helpers. Land S7-D04 first, or coordinate.
- **Client scene files.** The GameView refactor (S7-D10) touches the same files as new station models, the HUD-aware CameraRig (mobile cluster) and the conveyor ring (next-folder). Land S7-D10 early. Others then use `useGameView()`.
- **Lobby.tsx, MainMenu.tsx, ResultsPlate.tsx.** Shared with difficulty, roles explanation, the intro tutorial, O grze/profile and ads. S7-D11 defines the layout regions (header, mode/visibility row, roster, roles, level and details, sticky footer).
- **Config cluster.** Supplies the `features` getter (versus, roomBrowser), `defaultVisibility`, the public-config flags the client reads, and `AdSlot` placements (`spectator` added).
- **Roles cluster.** Supplies the `abilityUsed` event for the feed and stats. "Podaj teczkę" stays within one team's sim automatically.
- **Difficulty cluster.** Supplies `difficulty` in roomState and roomSummary and a list filter. Both teams share one difficulty.
- **Mobile HUD cluster.** Gives the phone one-row pill a segment for the VersusChip, and the in-game menu sheet a room code and spectator count.


## Contract changes

- packages/shared/src/constants.ts: + MAX_TEAM_PLAYERS=4, MAX_TEAMS=2, MAX_ROOM_PLAYERS=8, MAX_SPECTATORS=8, ROOM_NAME_MAX_LENGTH=24, ROOM_SEARCH_MAX_LENGTH=24, ROOM_LIST_MAX=50, SPECTATOR_SNAPSHOT_INTERVAL_TICKS=2, SPECTATOR_STATS_INTERVAL_TICKS=20, SPECTATOR_INTERPOLATION_DELAY_MS=200, VERSUS={endlessDurationS:600, leadCueCooldownMs:5000}. MAX_PLAYERS becomes an alias of MAX_TEAM_PLAYERS (per-sim cap, value unchanged at 4).
- packages/shared/src/constants.ts: PROTOCOL_VERSION 2 -> 3. ONE bump for all of Stage 7, made by whichever protocol task lands first; coordinate with every other cluster.
- protocol.ts primitives: roomModeSchema('coop'|'versus'), roomVisibilitySchema('private'|'public'), memberKindSchema('player'|'spectator'), teamIndexSchema(0..MAX_TEAMS-1), roomNameSchema(trim 1..24, no control chars), versusEndReasonSchema('score'|'credibility'|'forfeit'|'draw').
- protocol.ts joinMessageSchema: + as: memberKindSchema.optional() (omitted = player).
- protocol.ts lobbyActionSchema: + setMode{mode}, setTeam{team, playerId?}, setSpectator{spectator, playerId?}, setVisibility{visibility}, setRoomName{name|null}, kick{playerId}, transferHost{playerId}.
- protocol.ts: briefingStateSchema.skippedBy and roomState.blunderVotes caps -> MAX_ROOM_PLAYERS. lobbyPlayerSchema + team. New lobbySpectatorSchema{id,nickname,connected}. roomStateMessageSchema + mode, visibility, name (nullable), spectators[] (max 8); players max -> MAX_ROOM_PLAYERS. The difficulty cluster adds difficulty here.
- protocol.ts: new teamScoreSchema{team,score,credibility,resolved,expired,connected}. snapshotMessageSchema + team? + scoreboard?: TeamScore[] (versus only). eventMessageSchema + team?.
- protocol.ts: new playerStatsSchema{playerId,team,verdicts,correct,wrong,stamps,minigameFails,abilities}. New server message matchStatsMessageSchema{type:'matchStats',tick,players[],teams[]} added to serverMessageSchema.
- protocol.ts levelEndMessageSchema: + team?, versus?: {winnerTeam|null, reason, teams[2]}, stats?: PlayerStats[]. In versus, `won` means the match was won.
- protocol.ts errorCodeSchema: + teamFull, spectatorsFull, matchInProgress, teamEmpty, kicked, invalidTarget, featureDisabled (each needs a Polish string in pl.errors in the same commit; the satisfies Record forces it).
- New shared modules exported from packages/shared/src/index.ts: rooms.ts (roomSummarySchema, roomListQuerySchema, roomListResponseSchema, roomListStatusSchema, foldSearch), versus.ts (matchDurationMs, versusOutcome, TeamStanding, VersusResult), match-stats.ts (emptyPlayerStats, applyStatsEvent, teamScoreOf).
- REST: new GET /api/rooms?q&mode&levelId&status&limit (&difficulty once the difficulty cluster lands) -> RoomListResponse; 429 over 60 requests/min/IP; 404 when roomBrowser is disabled.
- Server: RegistryOptions + features?: () => {versus, roomBrowser} and defaultVisibility? (supplied by the config cluster). Registry API + listRooms(query). inspect() + games[], mode, visibility, name, outcome, spectators[], players[].team; `game` kept as an alias of team 0.
- Server: limits.ts + ROOM_LIST_REQUESTS_PER_MINUTE_PER_IP=60. connection.ts + CLOSE_KICKED=4002. New client-address.ts (X-Real-IP, then socket address). ApiDeps + features?.
- Pub/sub topics: room:CODE (roomState, gameStarted), room:CODE:t0|t1 (team snapshots, events, levelEnd, that team's player join/leave events), room:CODE:spec (tagged events, 10 Hz snapshots, 1 Hz matchStats, both levelEnds).
- Deploy: Caddyfile global `servers { trusted_proxies static {$TRUSTED_PROXIES:private_ranges}; trusted_proxies_strict }` plus `header_up X-Real-IP {client_ip}`. docker-compose web service gets env TRUSTED_PROXIES.
- Client architecture: net/game-view.ts (GameView, GameViewContext, useGameView, useViewGame). game-store createGameStore() and useGame.scoreboard. runtime ViewRuntime and createWatchRuntime. render-state createRenderState(). useOverlay and drei Html children wrapped in a GameView provider. CueContext.silent. ScreenId + 'spectate'. joinRoom(nickname, code?, as?).
- Design tokens: --team-0/--team-0-ink (navy/white) and --team-1/--team-1-ink (white/navy) in tokens.css; teamColors in tokens.ts. New icons: eye, search, swap, more. agents/design-rules.md §1.3/§3/§5 amended (versus rival chip, team tokens).
- Cue catalogue: new CueIds versus.leadTaken, versus.leadLost, versus.win, versus.lose, versus.draw, lobby.modeSwitch, lobby.teamSwitch, lobby.hostChanged, lobby.spectatorJoined, lobby.kicked, spectate.follow, spectate.feed. New AnimationTriggers versusLead and feedPop. Matching captions.ts entries and game-feel.md rows.
- DB schema: no change (versus is not persisted; endless versus is not written to the leaderboard).

## Cluster tasks (superseded by `tasks.md`)

- **S7-D01 — Client IP behind the external proxy** (S; depends on —). Caddyfile: global servers block with trusted_proxies static {$TRUSTED_PROXIES:private_ranges} and trusted_proxies_strict; header_up X-Real-IP {client_ip} on reverse_proxy. docker-compose web env TRUSTED_PROXIES. New apps/server/src/client-address.ts (X-Real-IP, then getConnInfo in try/catch, then 'unknown'); ws.ts uses it and XFF parsing is removed. Unit test. docs/deploy.md: client IP paragraph (L108-109) and TRUSTED_PROXIES row in the config table. Decision log row. *Done when:* client-address.test.ts passes (X-Real-IP preferred, XFF ignored, 'unknown' without a server); `caddy validate` accepts the Caddyfile; bun run check passes; deploy.md updated.
- **S7-D02 — Shared wire contracts for rooms, versus and spectators (+PROTOCOL_VERSION 3)** (M; depends on —). constants.ts block (MAX_TEAM_PLAYERS, MAX_TEAMS, MAX_ROOM_PLAYERS, MAX_SPECTATORS, ROOM_NAME/SEARCH lengths, ROOM_LIST_MAX, SPECTATOR_*, VERSUS); MAX_PLAYERS becomes an alias. protocol.ts primitives and every schema change from §2.2 (join.as, 7 lobby actions, roomState mode/visibility/name/spectators/team, teamScore, snapshot team/scoreboard, event team, playerStats, matchStats message, versusSummary, levelEnd team/versus/stats, 7 error codes); exported types. pl.errors Polish strings for the new codes. protocol.test.ts accept/reject cases. Single PROTOCOL_VERSION bump, coordinated with the other clusters. The registry emits the new required roomState fields with defaults (mode 'coop', visibility 'private', name null, spectators [], team 0) so the server stays green. *Done when:* protocol tests for every new schema pass (incl. rejecting team 2, 9 players, 25-char names, control characters); server and client typecheck; existing server tests green; bun run check passes.
- **S7-D03 — Pure versus, stats and room-list rules in shared** (S; depends on S7-D02). packages/shared/src/versus.ts (matchDurationMs, versusOutcome, byScore), match-stats.ts (emptyPlayerStats, applyStatsEvent, teamScoreOf), rooms.ts (roomSummary/query/response schemas, roomListStatusSchema, foldSearch). Export from index.ts. Unit tests with the literal values from §5. *Done when:* versus.test.ts, match-stats.test.ts and rooms.test.ts pass with the literal cases in the design (incl. draw, forfeit, simultaneous credibility 0, 600_000 endless duration, foldSearch('Łukasz Żółć')==='lukasz zolc').
- **S7-D04 — Registry refactor: members, team runs, topics, lockstep tick (co-op unchanged)** (L; depends on S7-D02). registry.ts: RoomMember{kind,team}, Room{mode,visibility,name,createdAt,members,teams:TeamRun[],stats,outcome}. Helpers playersOf, spectatorsOf, pickTeam, per-team freeColorIndex, topicsFor/syncTopics, freshTeams, snapshotOf, publishTeam (encode once), levelEndFor. Room/team/spec topics. The tick builds one ctx and steps each team; events and snapshots go to the team topic. Team-aware addToRoom, selectLevel, backToLobby, voteBlunder, startLevel (shared seed and level), removeMember, endLevel. inspect() keeps `game` as the team-0 alias and adds games/mode/visibility/name/spectators/team. New __fixtures__/room-helpers.ts. *Done when:* All existing registry, lobby, briefing-and-votes and endless tests pass unmodified; a new test shows co-op players subscribed to room:CODE:t0 receive snapshots tagged team 0; smoke and e2e multiplayer still pass.
- **S7-D05 — Versus rules on the server** (L; depends on S7-D03, S7-D04). setMode (alternate teams by join order, coop back only with ≤4 players, featureDisabled flag), setTeam (self or host, lobby|results, teamFull/invalidTarget). Versus join refused mid-match (matchInProgress). Start gate teamEmpty. Per-team colorIndex/spawn. Scoreboard in snapshots. Forfeit when a team's last player is removed while playing. versusOutcome each tick using matchDurationMs (endless 600 s; countdown timeLeftMs). Per-team levelEnd with won=match result, versus summary and stats. No recordEndlessRun in versus. Blunder votes per team. RegistryOptions.features. *Done when:* apps/server/src/rooms/versus.test.ts covers every case listed in §5 (alternating teams, teamFull, teamEmpty, equal rng/seed, team-only snapshots with a scoreboard of 2, lockstep ticks/storyIds, input isolation, credibility win, draw, matchInProgress, reconnect into the right team, forfeit, endless 600 s with no leaderboard write) and passes.
- **S7-D06 — Spectators on the server** (M; depends on S7-D03, S7-D04). join as:'spectator' in any phase (spectatorsFull cap 8, no playerJoined event, spectator host on create). setSpectator (self or host, lobby|results, teamFull when no seat). Spectator topic: tagged events, every 2nd snapshot, matchStats every 20 ticks (only when spectators are connected). sendSpectatorSync on attach mid-match. Spectators excluded from the ready/briefing gates, input/commands and votes. reassignHost prefers players. Stats reducer applied per tick; final stats in levelEnd. *Done when:* spectators.test.ts passes (cap, mid-match join with immediate sync, 10 Hz snapshots for both teams, 1 Hz matchStats, no blocking of ready/briefing, input ignored, spectator host can start, setSpectator(false) → teamFull when full, co-op spectator gets team-0 snapshots).
- **S7-D07 — Lobby administration on the server** (M; depends on S7-D04). setVisibility (host, any phase, featureDisabled for public when the browser is off; defaultVisibility option), setRoomName (host, any phase, null clears), kick (host only, not self; error 'kicked' then removeMember then close CLOSE_KICKED=4002; token invalidated), transferHost (connected target, not self, invalidTarget otherwise). Unit tests. *Done when:* lobby-admin.test.ts passes: non-host gets notHost; kicked socket receives the error and close 4002 and cannot reconnect (reconnectFailed); host transfer works and rejects disconnected targets; visibility and name round-trip in roomState.
- **S7-D08 — GET /api/rooms (room list API)** (M; depends on S7-D01, S7-D03, S7-D07). registry.listRooms(query) (public + connected members, summaryOf with canJoinAsPlayer only in lobby|results, foldSearch on code/name/host, mode/levelId/status filters, sort open-first then newest, cap). api.ts route with zValidator and the shared schemas; rate limiter ROOM_LIST_REQUESTS_PER_MINUTE_PER_IP=60 keyed by clientAddress with lazy prune; 404 when the feature is off. tools/smoke/smoke.ts check. Contract for the difficulty filter left as a TODO for the difficulty cluster. *Done when:* api.test.ts room-list cases pass (private hidden, fields, Polish-folded search, filters, limit, 429 on request 61 for one IP but not another, 404 when disabled); smoke passes locally.
- **S7-D09 — Client session and stores for modes, spectators and kicks** (M; depends on S7-D02). session.ts: joinRoom(nickname, code?, as); lastJoinCode; screen routing for spectators (lobby/briefing read-only/spectate); per-team routing of snapshots/events/levelEnd/matchStats to the spectate store (stub views until S7-D15); kicked handling (clear slot, menu, error); no progress record when levelEnd.versus is set. game-store scoreboard. store/app.ts ScreenId 'spectate'. Lobby LOBBY_ERRORS extended. MainMenu matchInProgress 'Oglądaj' CTA. *Done when:* net tests cover routing (spectator snapshot with team 1 does not touch useGame; kicked → mainMenu with pl.errors.kicked); typecheck and existing e2e pass.
- **S7-D10 — GameView refactor of the client scene (no behaviour change)** (L; depends on —). net/game-view.ts; createGameStore; ViewRuntime and createWatchRuntime; createRenderState; playerView in session.ts. Migrate Ambience, CameraRig, Decor, Driver, EventMarkers, EventsWorld, Fixtures, Folders, GuidanceMarkers, InteractionHighlight, Newsroom, PlayerAvatar, StationIndicators, Players, PingBubbles, Particles and GameCanvas to useGameView. useOverlay and drei Html wrap the provider. GameCanvas primary prop (PerfProbe, debug hooks, preset detection only when primary); PerfProbe viewKey and perfStats.views. game-events contextFor takes a ViewLookup. CueContext.silent in feedback.emit. *Done when:* e2e multiplayer, pings and performance specs pass with unchanged budgets; game-view.test.ts proves store isolation; feedback test proves silent suppresses sound only; no scene file imports `runtime` from session.ts any more.
- **S7-D11 — Lobby UI: mode, teams, spectators, visibility, room name** (L; depends on S7-D09, S7-D05, S7-D06, S7-D07). Lobby.tsx layout regions (header with name Field/text and visibility Segmented, mode Segmented, co-op seats or two team columns with TeamBadge and 'Przejdź tutaj', spectator strip with 'Na widownię'/'Do gry', spectator lobby state, sticky footer with one yellow action, startTeamEmpty reason). TeamBadge component, team tokens and icons (eye, swap, more). Strings pl.vocab.modes/visibility/teams and pl.lobbyRoom. Cues lobby.modeSwitch, lobby.teamSwitch, lobby.spectatorJoined with captions and game-feel rows. design-rules §3 team rows. 640x360 and gamepad check. *Done when:* e2e versus.spec.ts lobby part passes on desktop and mobile (mode switch, guests in opposite columns, start); lint:design passes (tokens only); 640x360 screenshot reviewed; captions.test passes.
- **S7-D12 — Lobby UI: host manage sheet and level details for guests** (M; depends on S7-D11). MemberSheet dialog (move to team, spectate/play, transfer host, kick with confirm) opened from the 'more' button on member cards (host only). LevelDetailsSheet with pure levelDetails(level, mode) helper and test (stations with purpose line, events, star rule as shares of max score, versus/endless lines). Cues lobby.hostChanged, lobby.kicked. Strings pl.manage and pl.levelDetails. *Done when:* level-details.test.ts passes; an e2e step kicks a guest (guest lands on the menu with the kicked message) and transfers host; the sheets are navigable by keyboard, gamepad and touch at 640x360.
- **S7-D13 — Room browser UI** (M; depends on S7-D08, S7-D09). net/api.ts fetchRooms; useRoomList (poll 4 s while visible, abort, loading/ready/error); RoomBrowserDialog (search, Segmented filters collapsing on phones, radio list rows, yellow Dołącz + white Oglądaj, nickname field when empty, empty/error states); MainMenu entry button (hidden when the public config disables it) and the eye 'Oglądaj' by-code button. Strings pl.rooms; icon search. *Done when:* e2e room-browser.spec.ts passes on desktop and mobile (public + named room is found by '3b' and joined); room-browser-model tests pass; dialog usable with keyboard/gamepad.
- **S7-D14 — Versus HUD chip and versus results** (M; depends on S7-D05, S7-D09). hud/VersusChip.tsx (desktop under the pill; phone segment coordinated with the mobile HUD cluster; endless versus countdown in LevelTimer); hud/versus-model.ts with lead cues (VERSUS.leadCueCooldownMs); ResultsPlate VersusBanner with reasons; cues versus.leadTaken/leadLost/win/lose/draw with captions and game-feel rows; design-rules §1.3/§5 amendment; strings pl.versus. *Done when:* versus-model.test.ts passes with the literal cases; e2e versus.spec.ts asserts versus-chip visible for both teams and only own-team avatars rendered; captions.test passes.
- **S7-D15 — Spectate screen I: views, split layout, scoreboard** (L; depends on S7-D06, S7-D09, S7-D10). spectate store (views per team with createWatchRuntime/createGameStore/createRenderState/createFeedback, layout, follow); SpectateScreen in the game chunk (GameGate which='spectate'); spectate-layout.ts and tests; SpectatorView with its own Canvas (primary only for the first), Players filtered by team, spectator camera fit/follow, data-compact signs, quality capped at medium/maxDpr 1.5/no shadows; top-bar scoreboard (versus and co-op); team plates with player chips; per-view audio policy (SPECTATOR_AUDIBLE_CUES, gain 0.6, team pan) via silent; read-only Briefing for spectators. *Done when:* e2e spectate.spec.ts shows 1 canvas in co-op, 2 on desktop versus and 1 on mobile versus; spectate-layout tests pass; spectator join mid-match renders both newsrooms within 1 s of the sync.
- **S7-D16 — Spectate screen II: follow, feed, stats, results, controls** (L; depends on S7-D15). Follow (keyboard ←/→ A/D Digit1/2 Space Esc Tab/Q, gamepad D-pad/A/B/Y, touch chips/plates) with blue ring and FollowCard (no answers: stamp icons only); feed-model.ts plus EventFeed (cap 8; 4 desktop / 2 phone); stats-model.ts plus StatsSheet from matchStats; SpectatorResults (winner, team cards, final stats, per-team read-only Kolegium, host buttons); cues spectate.follow and spectate.feed; strings pl.spectate; AdSlot mount point for the ads cluster (results and side stats sheet only). *Done when:* feed-model and stats-model tests pass; e2e spectate.spec.ts follows a player on each device type and sees the FollowCard and a feed row after a verdict; results show both teams; no stamp result text or truth is visible in the spectator DOM before verdictResult (asserted in e2e).
- **S7-D17 — Performance checks for versus and spectating** (S; depends on S7-D05, S7-D16). tools/perf/server-tick.ts bench (150 versus rooms × 8 scripted inputs, mean tick over 200 ticks); e2e/performance.spec.ts spectator case (desktop split summed draw calls ≤150 and triangles ≤100k; mobile single ≤100) using perfStats.views and __scenes; docs/performance.md numbers; propose a MAX_ROOMS/config adjustment if the bench exceeds 25 ms. *Done when:* Spectator perf e2e passes on both projects; bench result recorded in docs/performance.md; Decision log updated if limits change.
- **S7-D18 — Docs, rules and glossary sweep for cluster D** (M; depends on S7-D05, S7-D06, S7-D08, S7-D16). design-document.pl.md (Tryb na punkty, Widownia, Lista pokoi, network model caps, protocol table); agents/architecture.md L53-55; agents/platforms.md spectate input rows; agents/glossary.md terms; docs/implementation-plan.md Stage 7 S7-D entries and the 10 Decision log rows; docs/privacy.pl.md public rooms and spectators paragraph (coordinated with the ads rewrite); docs/accessibility.md team badges and feed-instead-of-captions; docs/deploy.md limits table; docs/contest/criteria-mapping.pl.md note. Each earlier task already ships its own doc lines; this is the final consistency pass. *Done when:* All listed docs updated and cross-checked against the shipped constants and rules; bun run check passes; supervisor-facing privacy text reviewed.

## Risks

- The registry refactor (S7-D04) touches every room code path that other clusters also edit (difficulty ctx, bag setLevel/startLevel, abilities commands, next-folder snapshot field, results-why levelEnd). Mitigation: land S7-D04 early, keep co-op observable behaviour identical, keep inspect().game as the team-0 alias so the 33 existing assertions stay unchanged, and route other clusters through the snapshotOf/levelEndFor/ctx helpers.
- The protocol is edited by most Stage 7 clusters. Several PROTOCOL_VERSION bumps or conflicting schema edits would break client/server compatibility. Mitigation: one bump (2→3) for the whole release, made by whichever protocol task lands first, plus a single owner reviewing protocol.ts merges.
- The GameView refactor touches ~18 scene files that the station, mobile-HUD and next-folder clusters also edit. A missed singleton (runtime.map, useGame, renderState, feedback) would make a spectator view read the player's state. Mitigation: land S7-D10 early with a 'no scene file imports runtime from session.ts' check, plus explicit GameView providers inside each Canvas, useOverlay roots and drei Html, without relying on R3F context bridging.
- Two WebGL contexts in spectator split mode double GPU resources. Weak devices or iOS Safari context limits could struggle. Mitigation: phones always get the 'single' layout; spectator canvases are capped at medium preset, maxDpr 1.5 and no shadows; focus mode unmounts the other canvas; budgets are verified by a new perf e2e that sums both renderers.
- Server CPU roughly doubles per versus room (two sims), and spectator fan-out adds egress (a full versus room with 8 players and 8 spectators is about 1 MB/s). Mitigation: 10 Hz spectator snapshots encoded once, nothing published to the spec topic when no spectator is connected, the S7-D17 tick bench, and MAX_ROOMS tunable through the config cluster.
- Privacy and safety for minors: public rooms expose host nicknames and room names to anyone, and strangers can join or watch a class. Mitigation: private by default, opt-in public, host kick and host transfer, and an updated privacy note. Residual: kick has no ban (a class shares one IP), so a kicked stranger can rejoin a public room by code.
- Fairness and pedagogy in versus. Minigame puzzles diverge once the teams act differently, because the rng is shared but advances with actions. Uneven teams (1v4) are allowed without a handicap. A speed race can push teams to guess. Penalties already outweigh correct verdicts, but this needs playtesting and a design-doc note.
- Client IP fix depends on the real proxy topology. If the external TLS proxy does not connect from a private range, TRUSTED_PROXIES must be set, otherwise per-IP limits (joins, rooms, the room list) stay effectively global. Trusting too wide a range would let clients spoof X-Forwarded-For; trusted_proxies_strict reduces that.
- The HUD rule amendment (rival chip) and the team tokens change binding design rules. They must land in the same commit as the code, and the phone pill space is shared with the mobile HUD cluster's one-row redesign.
- Spectator 'no answers' guarantee: snapshots still carry station minigameSeed and folder stamps, so a technically savvy spectator could derive puzzle answers. This only affects watching, and the team's own clients already receive the seed, but the UI must never render stamp result text or truth before verdictResult.

## Open points (defaults chosen)

- Team identity: defaulted to the names Kurier/Głos with navy-shield vs white-seal badges (luminance + shape + letter, no new hue). Coloured team tokens would need a fresh colour-blind audit against --player-0..3 and the meaning colours.
- Mid-game player join: defaulted to keeping co-op join-by-code in any phase (late classmates). Versus allows player join only in lobby/results, and the room browser offers 'Dołącz' only for lobby/results rooms. Join-as-spectator is allowed everywhere.
- Draw rule: defaulted to equal score = draw, with no credibility tie-break.
- Endless versus: defaulted to a 10-minute match (VERSUS.endlessDurationS=600) that is not written to the endless leaderboard.
- Versus progress: defaulted to not recording campaign stars or progress. levelEnd.stars is shown for information only, and `won` means the match was won.
- Forfeit: defaulted to triggering when a team has no players left after the 60 s reconnect grace (RECONNECT_GRACE_MS). No separate forfeit timer.
- Kick: defaulted to no IP ban and no room lock. A 'lock room' toggle or a temporary nickname ban could follow if public-room abuse shows up.
- Spectator feed history: defaulted to not replaying past events on a mid-match join. Server-side matchStats carry the totals.
- Spectator audio: defaulted to severity-2+ team-outcome cues only, at 0.6 gain and panned per team, with no captions (the event feed is the visual twin). Confirm with the accessibility review.
- Teacher flow: defaulted to create the room normally, then press 'Na widownię' in the lobby (the host may be a spectator). No separate 'Otwórz jako widz' menu button.
- Shuffle teams: not included. The host moves players through the manage sheet.
- Room names are not profanity-filtered. They are only visible publicly if the host opts in, and only the host can set them.
- Difficulty filter and difficulty chip in the room browser and lobby are wired once the difficulty cluster's difficultySchema exists. Until then those fields are omitted.
- Ads on the spectator view: only in spectator results and the side-layout stats sheet, never over the live canvases. Exact placement belongs to the config/ads cluster.
