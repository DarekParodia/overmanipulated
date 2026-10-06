// Balance and engine constants shared by client and server.
// Change values here, never inline (AGENTS.md rule 6).
import type { Role, StationKind } from './domain.ts';

/** Bump on any breaking change to the wire protocol; the server rejects mismatched clients. */
export const PROTOCOL_VERSION = 2;

// --- Simulation timing ---------------------------------------------------------------------

/** Server simulation rate. Each client input covers exactly one tick. */
export const TICK_RATE_HZ = 20;
export const TICK_MS = 1000 / TICK_RATE_HZ;

// --- Rooms ---------------------------------------------------------------------------------

export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;
/** Letters only, without the easily confused I and O. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** How long a disconnected player's slot is kept for reconnection. */
export const RECONNECT_GRACE_MS = 60_000;
export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 16;
/** Number of distinct player colours; colour index is assigned per room slot. */
export const PLAYER_COLOR_COUNT = 4;

// --- Movement ------------------------------------------------------------------------------

/** World units are tiles. */
export const PLAYER_SPEED_TILES_PER_S = 4.5;
/** Half the side of the player's square collision box, in tiles. */
export const PLAYER_HALF_SIZE = 0.3;
/** Positions are quantised to this step so wire values and simulation values are identical. */
export const POSITION_QUANTUM = 1 / 1024;

// --- Networking ----------------------------------------------------------------------------

/** Inputs buffered per player on the server; older ones are dropped beyond this. */
export const INPUT_QUEUE_MAX = 8;
/** If more inputs than this are queued, the server processes extra ones to catch up. */
export const INPUT_QUEUE_CATCH_UP_THRESHOLD = 3;
/** Remote entities are rendered this far in the past, interpolating between snapshots. */
export const INTERPOLATION_DELAY_MS = 100;
/** Maximum WebSocket message size the server accepts, in bytes. */
export const MAX_CLIENT_MESSAGE_BYTES = 4096;

// --- Persistence ---------------------------------------------------------------------------

/** Leaderboard entries older than this are deleted (no long-term storage of student data). */
export const LEADERBOARD_RETENTION_DAYS = 90;
export const LEADERBOARD_DEFAULT_LIMIT = 10;

// --- Level and scoring (design doc, "Punktacja") -------------------------------------------

export const CREDIBILITY_START = 100;
export const CREDIBILITY_MAX = 100;

/** Score changes; see the scoring table in docs/design-document.pl.md. */
export const SCORE = {
  correctNormal: 10,
  correctImportant: 20,
  correctWithContext: 30,
  speedBonus: 5,
  publishedFake: -20,
  rejectedTrue: -10,
  expired: -5,
} as const;

/** Credibility changes; see the scoring table in docs/design-document.pl.md. */
export const CREDIBILITY = {
  correctImportant: 5,
  correctWithContext: 5,
  publishedFake: -25,
  rejectedTrue: -10,
  expired: -5,
} as const;

/** The speed bonus is paid when more than this fraction of the folder's time is left. */
export const SPEED_BONUS_REMAINING_FRACTION = 0.5;
/** A correct verdict justified by a stamp that does not justify it earns this share of points. */
export const WRONG_JUSTIFICATION_SCORE_FACTOR = 0.5;

// --- Folders, stations, desk ---------------------------------------------------------------

/** How far from the player's centre a fixture or floor folder can be reached, in tiles. */
export const INTERACTION_REACH_TILES = 1.1;
/** A folder enters the "deadline warning" state with this much time left. */
export const DEADLINE_WARNING_MS = 10_000;
/** Managing editor: one deadline extension per level, by this much. */
export const DEADLINE_EXTENSION_MS = 20_000;

/** Hold-to-work time at each station before its minigame opens (design doc: 3–8 s). */
export const STATION_WORK_MS = {
  imageSearch: 4000,
  archive: 5000,
  sourceRegistry: 4000,
  phone: 6000,
  aiScanner: 3000,
  dataLibrary: 5000,
} as const satisfies Record<StationKind, number>;

/** Role bonus: work time multiplier at the role's stations ("40% faster"). */
export const ROLE_WORK_TIME_FACTOR = 0.6;
export const ROLE_STATIONS = {
  photoEditor: ['imageSearch', 'aiScanner'],
  archivist: ['archive'],
  reporter: ['phone'],
  managingEditor: [],
} as const satisfies Record<Role, readonly StationKind[]>;

/** A failed minigame blocks the station for this long ("failure costs time"). */
export const MINIGAME_FAIL_LOCKOUT_MS = 3000;
/** Client-side time limit for one minigame attempt; running out counts as a failure. */
export const MINIGAME_TIME_LIMIT_MS = 20_000;

// --- Pings ---------------------------------------------------------------------------------

/** How long a ping bubble stays above a player. */
export const PING_DURATION_MS = 2000;
/** Minimum time between two pings from the same player. */
export const PING_COOLDOWN_MS = 750;

/** Commands (verdicts, minigame results, pings) buffered per player between two ticks. */
export const COMMAND_QUEUE_MAX = 8;

// --- Folders (S2-02) -----------------------------------------------------------------------

/** A folder dropped on the floor lands this far in front of the player's centre, in tiles. */
export const FLOOR_DROP_DISTANCE_TILES = 0.6;

// --- S2-07 Editorial desk and verdicts -----------------------------------------------------

/**
 * Wrong verdicts the design-doc scoring table does not name ("Opublikowana fałszywka" and
 * "Odrzucony prawdziwy materiał" are in SCORE / CREDIBILITY); see the Decision log.
 */
export const WRONG_VERDICT_PENALTY = {
  /** Plain publish of a misleading or satirical story: it reaches readers without context. */
  publishedWithoutContext: { score: -10, credibility: -10 },
  /** Rejecting a misleading or satirical story: the true core is lost, but nobody was misled. */
  rejectedContextStory: { score: -5, credibility: 0 },
  /** Publishing a true story with a needless context note: overcautious, harmless. */
  contextOnTrue: { score: -5, credibility: 0 },
} as const;
