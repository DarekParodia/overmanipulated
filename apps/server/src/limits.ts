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
