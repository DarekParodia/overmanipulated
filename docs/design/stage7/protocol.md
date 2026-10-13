# Stage 7 — protocol ledger

PROTOCOL_VERSION ledger. Current value: 2.

Rules
- At most one bump per milestone. A milestone is a deployment unit.
- The first wire-changing task of the milestone makes the bump and asserts the literal in protocol.test.ts. Later wire changes in the same milestone ride on it.
- Additive REST endpoints, HTML routes and config.json never bump.
- Every schema change updates every fixture in the same commit.
- Stale clients get the existing protocolMismatch error. Client and server images are always deployed together.

M1 → v3 (bumped by S7-03)
- entities:
  - folderOutcomeSchema += 'unfinished'.
  - New folderReasonSchema with 14 values.
  - New folderBonusesSchema {speed, multiStamp, bossCall}.
  - folderResultSchema += reason, justifyingStampIds (max MAX_REQUIRED_STAMPS = 3), requiredStamps (1..3), bonuses. missedStampIds is filled only on errors.
  - levelOutcomeSchema += lossReason ('credibility' | 'score' | null).
- S7-13 (rider):
  - folderSchema += spawnKey: string matching /^(s\d+|e\d+\.\d+)$/.
  - folderResultSchema += spawnKey.
- Commands: verdict.justifyingStampId becomes justifyingStampIds: array(entityId).min(1).max(3).
- Events: verdictResult = folderResultSchema.extend({kind, playerId}). justifyingStampId and speedBonus are removed (use bonuses.speed > 0).
- snapshot:
  - += nextFolder {atMs, sinceMs} | null (scheduled spawns only; level events are not telegraphed);
  - += conveyorFull: boolean (S7-08);
  - += paused: boolean (S7-10).
- Lobby actions: += {kind: 'setPaused', paused}. Accepted only in the playing phase of a co-op room with exactly one connected player and no spectators. It is cleared automatically when anyone else joins (S7-10).
- levelEnd += lossReason | null, starThresholds {two, three} | null (null in endless), maxScore | null.
- minigameStarted.seed keeps its schema. Its value is now derived from (sim seed, spawnKey, kind, attempt).

M2 → v4 (bumped by S7-17)
- minigameFailed += lockoutMs (difficulty-scaled; 0 after Druga szansa from M3).
- folderSchema += bagStation?: StationKind (S7-23). It is copied from the resolved schedule entry and used by guidance.
- Lobby actions: += {kind: 'setDifficulty', difficulty} (host only, lobby only, resets ready).
- roomState += difficulty and run: {folders, maxScore, stars {two, three} | null} | null.
- levelEnd += difficulty. starThresholds and maxScore now come from the generated run.
- REST, additive:
  - leaderboardQuerySchema += difficulty (default 'normal');
  - leaderboardEntrySchema += difficulty;
  - DB column leaderboard_entries.difficulty TEXT NOT NULL DEFAULT 'normal', with an index on (difficulty, score) and the committed generated migration.
- Bundled content, not wire: storySchema.requiredStamps; the levelFileSchema/levelSchema split; schedule entry station?.

M3 → v5 (bumped by S7-36)
- domain:
  - roleSchema += generalist, rescuer (S7-43, rides on v5).
  - New abilitySchema, stationFamilySchema, abilityStageSchema (armed, disarmed, started, done, cancelled), stampSourceSchema (minigame, expertise, fieldCall).
- entities:
  - abilityStateSchema {abilityReadyAtMs, abilityArmed, fieldCall {folderId, endsAtMs} | null, rescuesLeft};
  - folderSchema += extendedMs?.
- Commands: remove extendDeadline; add {kind: 'useAbility'}, with no target (the server resolves it via the shared abilityPreview, which the HUD chip also shows).
- snapshot: remove deadlineExtensionUsed; add crew: abilityStateSchema.extend({id})[] (max MAX_PLAYERS).
- Events:
  - remove deadlineExtended;
  - add ability {playerId, ability, stage, folderId?, stationId?, targetPlayerId?, addedMs?, reason?: 'dropped' | 'gone'};
  - add folderRescued {playerId, folderId, addedMs, folderIds[1..8]};
  - stampApplied += via (required).

M4 → v6 (bumped by S7-48)
- stationKindSchema += geolocation, transcript, crossCheck, metadata. This affects station.kind, minigameStarted.station, bagStation and every StationKind record.
- Bundled content: stamps.max(10).

M5 → no WebSocket bump
- REST:
  - GET /api/config returns PublicConfig per Host: {revision, siteOrigin, features (roomBrowser default false), defaultDifficulty, motd, ads {enabled, mode: 'limited', client, slots, ageTreatment}}.
  - /api/health += config {source, revision}.
- config.json, server side:
  - ads.enabled is refused by the schema unless ads.signOff {by, date} is present;
  - ads.mode must be 'limited' while ageTreatment is teen or child.
- HTML:
  - / and SPA paths render the shell. It has a per-request nonce in script-src only, plus 'strict-dynamic' in ads mode.
  - The embedded <script id='redakcja-config' type='application/json'> has <, U+2028 and U+2029 escaped.
  - Referrer-Policy is strict-origin-when-cross-origin in ads mode and no-referrer otherwise.
  - /ads.txt and /prywatnosc.
- Client IP (already in M1): Caddy sets X-Real-IP from {client_ip}.

M6 → v7 (bumped by S7-77)
- Primitives: roomMode (coop | versus), roomVisibility, memberKind, teamIndex (0..1), roomName (trimmed, 1..24, no control characters, passes the shared name filter), versusEndReason (score | credibility | forfeit | draw), clientId (opaque random id from localStorage, 16..64 chars).
- join += as? ('player' when omitted) and clientId?.
- Lobby actions: setMode, setTeam {team, playerId?}, setSpectator {spectator, playerId?}, setVisibility, setRoomName {name | null}, setSpectatorsAllowed {allowed}, kick {playerId}, transferHost {playerId}.
- roomState:
  - += mode, visibility, name, spectatorsAllowed, spectators[] (max 8);
  - players[] += team;
  - player lists, blunderVotes and briefing.skippedBy are capped at MAX_ROOM_PLAYERS = 8;
  - MAX_PLAYERS stays 4 per sim.
- New teamScoreSchema. snapshot += team?, scoreboard?. The event message += team?.
- Spectator-only messages:
  - spectatorEvent {team, event: spectatorEventSchema}, where spectatorEventSchema = gameEventSchema ∪ verdictMasked {kind, playerId, folderId, spawnKey, closedBy: 'verdict' | 'expired'} ∪ verdictRevealed {result: folderResult & {playerId}}.
  - In versus, verdictResult (and the reason of an expiry) for a spawnKey reaches spectators only as verdictMasked until both teams have closed that key or the level ends. Players never receive spectatorEvent.
  - New playerStatsSchema and matchStats {tick, players[], teams[]}, at 1 Hz to spectators.
- levelEnd += team?, stats?, versus? {winnerTeam | null, reason, teams[2], rivalResults[] keyed by spawnKey}.
- errorCode += teamFull, spectatorsFull, spectatorsOff, matchInProgress, teamEmpty, kicked, kickCooldown, invalidTarget, invalidName, featureDisabled.
- Close code 4002 (kicked).
- REST:
  - GET /api/rooms?q&mode&levelId&difficulty&status&limit returns {rooms: roomSummary[], total};
  - roomSummary = {code, name | null, hostNickname (masked by the name filter), levelId, mode, difficulty, players, maxPlayers, spectators, spectatorsAllowed, inGame, canJoinAsPlayer (lobby phase only), canSpectate, createdAt};
  - the result is cached for 2 s server-side;
  - 429 above ROOM_LIST_PER_MINUTE_PER_IP = 600;
  - 404 when roomBrowser is off.
- Pub/sub topics:
  - room:CODE: roomState, gameStarted;
  - room:CODE:t0 / room:CODE:t1: the team's snapshots, events and levelEnd;
  - room:CODE:spec: spectatorEvent, 10 Hz snapshots, matchStats and both levelEnds.

M7 → v8 (bumped by S7-105)
- domain: accessorySchema (none, scarf, bowTie, pressBadge).
- join += look? {color: 0..3 | null, accessory}.
- Lobby action setLook {look} (lobby only).
- lobbyPlayer += accessory.
- freeColorIndex(room, team, preferred) honours a free preferred colour.
