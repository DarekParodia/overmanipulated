// Balance and engine constants shared by client and server.
// Change values here, never inline (AGENTS.md rule 6).

/** Bump on any breaking change to the wire protocol; the server rejects mismatched clients. */
export const PROTOCOL_VERSION = 1;

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
