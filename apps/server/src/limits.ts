// Abuse limits of the public server (S6-04). These are operational limits, not game balance.
// A school class often shares one public IP, so the per-IP numbers are deliberately generous:
// they stop scripts, not a room full of students.

/** Messages one socket may send: sustained rate (input runs at 20 Hz) and burst allowance. */
export const WS_MESSAGES_PER_SECOND = 60;
export const WS_MESSAGE_BURST = 200;
/** Close code for a socket that exceeded its message budget (RFC 6455: policy violation). */
export const CLOSE_RATE_LIMITED = 1008;

/** `join` messages (create or join a room) per IP: a class of 35 joining within a minute. */
export const JOINS_PER_MINUTE_PER_IP = 120;
/** New rooms per IP per minute. */
export const ROOMS_PER_MINUTE_PER_IP = 20;
/** Rooms alive at once; keeps memory bounded on a small VPS. */
export const MAX_ROOMS = 300;
/**
 * How long a browser (`clientId`) the host kicked may not rejoin that room (S7-82): 10 minutes.
 * Not an IP ban, which would lock out the whole class behind one address.
 */
export const KICK_REJOIN_COOLDOWN_MS = 10 * 60 * 1000;

// --- Room browser, GET /api/rooms (S7-83) --------------------------------------------------

/**
 * Room-list requests per IP per minute (token bucket: this burst, refilled evenly over a minute).
 * A whole school shares one NAT address: 35 students each polling every 8 s is ~260 a minute,
 * and two classes in the lab at once stay under 600. A script hammering the list does not.
 */
export const ROOM_LIST_PER_MINUTE_PER_IP = 600;
/** The unfiltered public room list is rebuilt at most this often; filters run over the copy. */
export const ROOM_LIST_CACHE_MS = 2000;
/** The room-list limiter forgets idle addresses once every this many requests (no timer). */
export const ROOM_LIST_PRUNE_EVERY = 256;

// --- Client error reports, POST /api/client-errors ----------------------------------------

/**
 * Client error reports per IP per minute (token bucket, as the room list). A school shares one
 * address: a broken build can fail for 35 students at once, each with a few distinct errors. The
 * browser already sends a repeated message once a minute, so this counts distinct ones.
 */
export const CLIENT_ERROR_REPORTS_PER_MINUTE_PER_IP = 300;
/** The client-error limiter forgets idle addresses once every this many reports (no timer). */
export const CLIENT_ERROR_PRUNE_EVERY = 256;
/**
 * Largest request body this server reads for a report. A report at the schema's limits is about
 * 17 KB with every character escaped as `\u00XX` (6 bytes), so anything larger is refused before
 * it is parsed. In production Caddy refuses bodies over 8 KB on all of /api before this runs
 * (Caddyfile `request_body`); a typical report is a few hundred bytes to a few KB.
 */
export const CLIENT_ERROR_BODY_MAX_BYTES = 32 * 1024;
/** Characters of a report's message and of its stack written to the server log. */
export const CLIENT_ERROR_LOG_MESSAGE_CHARS = 200;
export const CLIENT_ERROR_LOG_STACK_CHARS = 500;

// --- config.json (S7-68) -------------------------------------------------------------------

/** Highest `rooms.maxRooms` config.json may set; a typo of an extra zero stays bounded. */
export const MAX_ROOMS_CEILING = 5000;
/** Quiet time after the last file event before config.json is re-read (atomic saves, partial writes). */
export const CONFIG_RELOAD_DEBOUNCE_MS = 250;
/** Most host names in `ads.domains`. */
export const AD_DOMAINS_MAX = 16;
/** Most lines in `ads.adsTxt`, and the longest line. */
export const ADS_TXT_MAX_LINES = 100;
export const ADS_TXT_LINE_MAX_CHARS = 300;
/** Most sources one CSP directive may gain from `csp.extra` or `csp.adsExtra`. */
export const CSP_EXTRA_MAX_SOURCES = 20;
/** Longest operator name and longest contact or hosting line (privacy page variables). */
export const OPERATOR_NAME_MAX_CHARS = 120;
export const OPERATOR_LINE_MAX_CHARS = 200;
/** Longest `ads.signOff.by` (who signed off on ads: supervisor or legal reviewer). */
export const AD_SIGN_OFF_BY_MAX_CHARS = 120;

// --- HTML shell (S7-70) --------------------------------------------------------------------

/** Random bytes in each per-request CSP nonce (128 bits; 24 base64 characters). */
export const CSP_NONCE_BYTES = 16;
/** How long browsers and crawlers may cache `/ads.txt` (seconds); a config reload shows within it. */
export const ADS_TXT_MAX_AGE_S = 300;
