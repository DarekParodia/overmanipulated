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
