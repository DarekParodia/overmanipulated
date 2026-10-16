// Shapes of a room, its members and its newsroom runs, shared by the registry and its pure
// helpers. Types only: the rules that act on them live in team-rules.ts and stats-fold.ts.
import type { Level, Story } from '@redakcja/content';
import type {
  Accessory,
  ClientId,
  Difficulty,
  GameState,
  MemberKind,
  PlayerCommand,
  PlayerInput,
  PlayerStats,
  Role,
  RoomMode,
  RoomPhase,
  RoomVisibility,
  RunSummary,
  SpectatorEmbargo,
  SpectatorEvent,
  TeamIndex,
  TileMap,
  VersusResult,
} from '@redakcja/shared';
import type { Connection } from './connection.ts';

/** A room member: a player in one newsroom, or a spectator watching the room (S7-79). */
export type RoomMember = {
  id: string;
  kind: MemberKind;
  /** The member's newsroom; always 0 in co-op. A spectator keeps the last one it played in. */
  team: TeamIndex;
  /** The browser's id from the join (the kick cooldown follows it, S7-82). */
  clientId?: ClientId;
  nickname: string;
  /** Per team: two newsrooms reuse the same four colours and spawn points. */
  colorIndex: number;
  /** The profile's colour (S7-105): taken whenever the team has it free; null = no preference. */
  preferredColor: number | null;
  /** Worn in the lobby and in 3D (S7-105). */
  accessory: Accessory;
  /** Resumes exactly this member, with its kind and team. */
  reconnectToken: string;
  connection: Connection | null;
  /** Server time when the connection dropped; null while connected. */
  disconnectedAt: number | null;
  inputQueue: PlayerInput[];
  lastQueuedSeq: number;
  /** Decisions (verdicts, minigame results, pings) waiting for the next tick. */
  commandQueue: PlayerCommand[];
  role: Role | null;
  ready: boolean;
};

/** One newsroom of the room: its own sim, stepped in lockstep with the other team's. */
export type TeamRun = {
  game: GameState;
  /** Every player of the team left while playing (the versus forfeit, S7-80). */
  forfeited: boolean;
};

export type Room = {
  code: string;
  hostId: string;
  phase: RoomPhase;
  /** Players of every team and spectators; insertion order is join order. */
  members: Map<string, RoomMember>;
  /**
   * One newsroom per team: one in co-op, two in versus. All are built from `map`, share the
   * dealt run and, from the level start, one sim seed.
   */
  teams: [TeamRun, ...TeamRun[]];
  /**
   * The selected level as `getLevel` serves it (a bag level's Normal preview, the endless
   * preview) in the lobby; from the briefing on, the level the dealt run plays.
   */
  level: Level;
  stories: Readonly<Record<string, Story>>;
  /** Picked by the host in the lobby; it persists across level changes and replays. */
  difficulty: Difficulty;
  /**
   * The run dealt at the briefing (`prepareRun`), kept through play and results; null in the
   * lobby. Its seed is drawn apart from the sim seed and never leaves the server.
   */
  run: { seed: number; summary: RunSummary } | null;
  map: TileMap;
  nextPlayerNumber: number;
  /** Set while `phase === 'briefing'`. */
  briefing: { endsAt: number; skippedBy: Set<string> } | null;
  /** Blunder-of-the-day votes of the current results screen, by player id. */
  blunderVotes: Map<string, { storyId: string; rowId: number | null }>;
  /** A solo player has the in-game menu open: the level is not stepped (S7-10). */
  paused: boolean;
  /**
   * Room settings on the wire since protocol 7 (S7-77). A room starts co-op, private and unnamed;
   * its spectator seats are closed unless a spectator created the room (S7-81).
   */
  mode: RoomMode;
  visibility: RoomVisibility;
  name: string | null;
  spectatorsAllowed: boolean;
  /** Unix ms (the room browser sorts by it, S7-83). */
  createdAt: number;
  /** Every player's counters of the current level, folded with `applyStatsEvent`. */
  stats: Map<string, PlayerStats>;
  /**
   * The same counters folded over what the spectators were shown: in versus a verdict counts once
   * its result is revealed, so `matchStats` never gives an embargoed outcome away (S7-81).
   */
  spectatorStats: Map<string, PlayerStats>;
  /** How the versus match ended; null while it runs and in co-op (S7-80). */
  outcome: VersusResult | null;
  /** What the spectator topic still holds back of the current level (S7-81). */
  embargo: SpectatorEmbargo;
  /**
   * Browsers the host kicked, by `clientId`, with the `now()` time their cooldown ends: a join
   * from one of them before then gets `kickCooldown` (S7-82). Room-scoped; expired entries go.
   */
  kicked: Map<ClientId, number>;
};

/** One `spectatorEvent` as the spectators get it: the team it happened in and the event. */
export type SpectatorItem = { team: TeamIndex; event: SpectatorEvent };

/** A connection's (or a reconnect token's) one member of one room. */
export type Membership = { roomCode: string; memberId: string };
