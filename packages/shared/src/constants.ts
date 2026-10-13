// Balance and engine constants shared by client and server.
// Change values here, never inline (AGENTS.md rule 6).
import type { Ability, Difficulty, Role, StationFamily, StationKind } from './domain.ts';

/** Bump on any breaking change to the wire protocol; the server rejects mismatched clients. */
export const PROTOCOL_VERSION = 6;

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

// --- Stage 7: public config (S7-67) ----------------------------------------------------------

/** Longest operator message of the day (MOTD): at most two lines in the menu column at 640 px. */
export const MOTD_MAX_CHARS = 140;

// --- Level and scoring (design doc, "Punktacja") -------------------------------------------

export const CREDIBILITY_START = 100;
export const CREDIBILITY_MAX = 100;

/** Score changes; see the scoring table in docs/design-document.pl.md. */
export const SCORE = {
  correctNormal: 10,
  correctImportant: 20,
  correctWithContext: 30,
  speedBonus: 5,
  /** Paid once per proof beyond the first on a fully proven multi-stamp folder (Stage 7). */
  multiStampBonus: 10,
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
/** Most distinct justifying stamps a story can require, and a verdict can cite (Stage 7). */
export const MAX_REQUIRED_STAMPS = 3;
/** Extra folder time per proof beyond the first, added when a multi-stamp folder spawns. */
export const MULTI_STAMP_EXTRA_DEADLINE_MS = 20_000;
/** Campaign level number from which stories may require more than one proof (earlier: warning). */
export const MULTI_STAMP_FIRST_LEVEL = 4;

// --- Folders, stations, desk ---------------------------------------------------------------

/** How far from the player's centre a fixture or floor folder can be reached, in tiles. */
export const INTERACTION_REACH_TILES = 1.1;
/** A folder enters the "deadline warning" state with this much time left. */
export const DEADLINE_WARNING_MS = 10_000;

/** Hold-to-work time at each station before its minigame opens (design doc: 3–8 s). */
export const STATION_WORK_MS = {
  imageSearch: 4000,
  archive: 5000,
  sourceRegistry: 4000,
  phone: 6000,
  aiScanner: 3000,
  dataLibrary: 5000,
  geolocation: 4000,
  transcript: 5000,
  crossCheck: 4000,
  metadata: 4000,
} as const satisfies Record<StationKind, number>;

// --- Stage 7: roles, station families, abilities (S7-36) --------------------------------------

/**
 * The family of every station kind. In Stage 7 families only gate Ekspertyza (a photo editor's
 * covers the image stations, an archivist's the documents); role passives keep explicit lists.
 */
export const STATION_FAMILY = {
  imageSearch: 'image',
  aiScanner: 'image',
  geolocation: 'image',
  metadata: 'image',
  archive: 'documents',
  dataLibrary: 'documents',
  transcript: 'documents',
  sourceRegistry: 'sources',
  phone: 'sources',
  crossCheck: 'sources',
} as const satisfies Record<StationKind, StationFamily>;

/** What a role brings: its passive work bonus, its active ability and its special rules. */
export type RolePerk = {
  /** Stations where the role's hold-to-work time is multiplied by `workFactor` (the passive). */
  fasterAt: readonly StationKind[];
  /** Work-time multiplier at `fasterAt` stations ("40% faster" is 0.6); 1 elsewhere. */
  workFactor: number;
  /** The role's active ability (R / RB / the fourth touch button). */
  ability: Ability;
  /** The station family the role's Ekspertyza covers; null for roles without Ekspertyza. */
  expertiseFamily: StationFamily | null;
  /** The phone minigame starts without the queue (client-side, design doc). */
  skipsPhoneQueue: boolean;
  /** Koło ratunkowe: deadline rescues of a carried folder per level (0 without the perk). */
  rescuesPerLevel: number;
};

export const ROLE_PERKS = {
  photoEditor: {
    fasterAt: ['imageSearch', 'aiScanner', 'geolocation', 'metadata'],
    workFactor: 0.6,
    ability: 'expertise',
    expertiseFamily: 'image',
    skipsPhoneQueue: false,
    rescuesPerLevel: 0,
  },
  archivist: {
    fasterAt: ['archive', 'transcript'],
    workFactor: 0.6,
    ability: 'expertise',
    expertiseFamily: 'documents',
    skipsPhoneQueue: false,
    rescuesPerLevel: 0,
  },
  reporter: {
    fasterAt: ['phone', 'crossCheck'],
    workFactor: 0.6,
    ability: 'fieldCall',
    expertiseFamily: null,
    skipsPhoneQueue: true,
    rescuesPerLevel: 0,
  },
  managingEditor: {
    fasterAt: [],
    workFactor: 1,
    ability: 'extendDeadline',
    expertiseFamily: null,
    skipsPhoneQueue: false,
    rescuesPerLevel: 0,
  },
} as const satisfies Record<Role, RolePerk>;

/**
 * Ability tuning. Every cooldown starts at 60 s and is retuned only from bot data (S7-46); the
 * cooldown starts when the effect happens, not when an ability is armed.
 * - fieldCall.callMs: how long Telefon z terenu dials before the phone stamp lands;
 * - extendDeadline.addMs: time Przedłużenie adds to a folder (a botRaid wave moves together);
 * - secondChance.rangeTiles: how far a locked station may be for an immediate Druga szansa;
 * - passFolder.rangeTiles: how far Podaj teczkę reaches a free teammate.
 */
export const ABILITY = {
  expertise: { cooldownMs: 60_000 },
  fieldCall: { cooldownMs: 60_000, callMs: 6000 },
  extendDeadline: { cooldownMs: 60_000, addMs: 20_000 },
  secondChance: { cooldownMs: 60_000, rangeTiles: 2.5 },
  passFolder: { cooldownMs: 60_000, rangeTiles: 6 },
} as const satisfies Record<Ability, { cooldownMs: number } & Record<string, number>>;

/** Koło ratunkowe: time added to a folder that reaches its deadline in a Ratownik's hands. */
export const RESCUE_ADD_MS = 20_000;
/** Abilities are first ready this long after the level (or a mid-game join) starts. */
export const ABILITY_FIRST_READY_MS = 0;

/** A failed minigame blocks the station for this long ("failure costs time"). */
export const MINIGAME_FAIL_LOCKOUT_MS = 3000;
/** Client-side time limit for one minigame attempt; running out counts as a failure. */
export const MINIGAME_TIME_LIMIT_MS = 20_000;
/**
 * Stations whose minigame keeps its puzzle for a folder after a failure or a cancel (S7-13): the
 * Kartoteka shows the same card again. Elsewhere every retry gets a fresh puzzle.
 */
export const MINIGAME_STABLE_SEED_STATIONS: readonly StationKind[] = ['sourceRegistry'];

// --- Stage 7: difficulty (S7-16) -------------------------------------------------------------
// Pure helpers that apply a preset live in `difficulty.ts`. Normal is the identity: every factor
// is 1, so Normal plays exactly like the authored levels. Rewards are never scaled.

/** One difficulty's tuning. Factors multiply the Normal value; read through `difficulty.ts`. */
export type DifficultyPreset = {
  /** Folder time (`deadlineS`) of scheduled and event folders. */
  readonly deadlineFactor: number;
  /** Time between scheduled folders, so a smaller factor means more folders per level. */
  readonly spawnGapFactor: number;
  /** Hold-to-work time at a station. */
  readonly workTimeFactor: number;
  /** Station lockout after a failed minigame. */
  readonly lockoutFactor: number;
  /** Score and credibility penalties (wrong verdicts, expiry, corrections). */
  readonly penaltyFactor: number;
  /** Time limit of one minigame attempt. */
  readonly minigameTimeFactor: number;
  /** Added to the mistake limit of minigames that allow more than one mistake. */
  readonly extraMistakes: number;
  /** Whether the "what next" hints may show (the player's setting must allow them too). */
  readonly hints: boolean;
  /** Whether a failed minigame reveals its answer. */
  readonly revealOnFail: boolean;
};

/** Difficulty presets; provisional until the balance-bot pass (S7-35) retunes them. */
export const DIFFICULTY = {
  easy: {
    deadlineFactor: 1.3,
    spawnGapFactor: 1.2,
    workTimeFactor: 0.8,
    lockoutFactor: 0.5,
    penaltyFactor: 0.5,
    minigameTimeFactor: 1.5,
    extraMistakes: 1,
    hints: true,
    revealOnFail: true,
  },
  normal: {
    deadlineFactor: 1,
    spawnGapFactor: 1,
    workTimeFactor: 1,
    lockoutFactor: 1,
    penaltyFactor: 1,
    minigameTimeFactor: 1,
    extraMistakes: 0,
    hints: true,
    revealOnFail: true,
  },
  hard: {
    deadlineFactor: 0.85,
    spawnGapFactor: 0.9,
    workTimeFactor: 1.15,
    lockoutFactor: 1.5,
    penaltyFactor: 1.25,
    minigameTimeFactor: 0.85,
    extraMistakes: 0,
    hints: true,
    revealOnFail: true,
  },
  expert: {
    deadlineFactor: 0.75,
    spawnGapFactor: 0.8,
    workTimeFactor: 1.25,
    lockoutFactor: 2,
    penaltyFactor: 1.5,
    minigameTimeFactor: 0.75,
    extraMistakes: -1,
    hints: false,
    revealOnFail: false,
  },
} as const satisfies Record<Difficulty, DifficultyPreset>;

/** New rooms start here; the room keeps its difficulty across level changes. */
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';
/** A difficulty never lowers a minigame's mistake limit below this. */
export const MINIGAME_MIN_MISTAKES = 1;

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

// --- S2-01 — Content validation ------------------------------------------------------------
// Targets `bun run validate:content` warns about (agents/content-authoring.md).

/** Share of true stories a level should schedule ("roughly 30–40% true"). */
export const CONTENT_TRUE_STORY_SHARE = { min: 0.25, max: 0.45 } as const;
/** Two-star threshold as a share of the level's maximum score (≈ 50%). */
export const CONTENT_TWO_STARS_SHARE = { min: 0.35, max: 0.65 } as const;
/** Three-star threshold as a share of the level's maximum score (≈ 80%). */
export const CONTENT_THREE_STARS_SHARE = { min: 0.65, max: 0.95 } as const;

// --- Stage 7: station bag and star shares (S7-16) --------------------------------------------

/**
 * Star thresholds of a generated run, as shares of its maximum score (balance intent 55 % / 80 %);
 * a level's `starShares` may override them within the CONTENT_*_STARS_SHARE ranges.
 */
export const STAR_SHARES = { two: 0.55, three: 0.8 } as const;
/** Star thresholds are rounded to a multiple of this many points. */
export const STAR_THRESHOLD_STEP = 5;
/** Chance that a bag slot tries stories decidable at several stations before single-station ones. */
export const BAG_FLEX_CHANCE = 0.3;
/** The first this many folders get single-proof, non-urgent stories when the pool allows. */
export const BAG_OPENING_SLOTS = 2;
/** Multi-stamp stories are drawn only from this slot index (0-based) on, when the pool allows. */
export const BAG_MULTI_STAMP_MIN_SLOT = 4;
/** Floor of a bag folder's deadline after difficulty scaling and the fit-the-level clamp (s). */
export const BAG_MIN_DEADLINE_S = 30;
/** Seed of the Normal run `LEVELS` and `getLevel` show for a bag level (lobby, briefing, tools). */
export const BAG_PREVIEW_SEED = 0;

// --- S2-11 Pings (client picker) -----------------------------------------------------------

/** Pressing the ping button again this soon after opening the picker re-sends the last ping. */
export const PING_QUICK_REPEAT_MS = 350;

// --- Minigame: source registry (S2-06) -----------------------------------------------------

/** Wrong marks or premature filings that end the source-registry minigame as a failure. */
export const SOURCE_REGISTRY_MAX_MISTAKES = 2;
/** Fields on one source card (account or website). */
export const SOURCE_REGISTRY_FIELDS = 7;
/** Red flags on a suspicious card: between min and max inclusive. */
export const SOURCE_REGISTRY_MIN_FLAGS = 1;
export const SOURCE_REGISTRY_MAX_FLAGS = 3;
/** Chance that a card for a folder without a source-registry stamp is clean. */
export const SOURCE_REGISTRY_CLEAN_CHANCE = 0.3;

// --- Core gameplay feedback (S2-12) --------------------------------------------------------

/** The level timer's "last seconds" phase (design doc: last 30 s): sting, HUD pulse, music. */
export const LEVEL_LAST_SECONDS_MS = 30_000;

// --- S2-05 Archive minigame ----------------------------------------------------------------

/** Index cards in one archive drawer (the timeline the player scrolls through). */
export const ARCHIVE_CARD_COUNT = 14;
/** How many cards carry the searched topic; only the earliest one is the right answer. */
export const ARCHIVE_TOPIC_MENTIONS = 3;
/** Wrong cards pulled before the minigame counts as failed. */
export const ARCHIVE_MAX_MISTAKES = 2;

// --- S2-04 Image search minigame -----------------------------------------------------------

/** Wrong picks allowed before the image search attempt fails (the second one fails it). */
export const IMAGE_SEARCH_MAX_MISTAKES = 2;
/** Marked fragments on the submitted photo (inclusive range). */
export const IMAGE_SEARCH_FRAGMENTS = { min: 2, max: 3 } as const;
/** Search-result printouts on the light table (inclusive range). */
export const IMAGE_SEARCH_RESULTS = { min: 4, max: 6 } as const;

// --- HUD (S2-09) ---------------------------------------------------------------------------

/** Credibility at or below this reads as "low" (HUD gauge warning, heartbeat layer later). */
export const CREDIBILITY_LOW = 30;

// --- Stage 3: briefing and debrief ---------------------------------------------------------

/** The briefing (topic of the day) starts the level by itself after this long. */
export const BRIEFING_DURATION_MS = 18_000;

// --- S3-02: blunder-of-the-day votes -------------------------------------------------------

/** Stored blunder votes older than this are deleted (same window as the leaderboard). */
export const BLUNDER_VOTE_RETENTION_DAYS = LEADERBOARD_RETENTION_DAYS;

// --- Level events (S4-05..S4-09) ------------------------------------------------------------

export const EVENTS = {
  /** `viral`: shares shown on the folder are `start * growthPerS ** ageS`, rounded. */
  viralSharesStart: 120,
  viralGrowthPerS: 1.07,
  /** `bossCall`: how long the demand stands, and the bonus for publishing a true story in time. */
  bossCallWindowMs: 12_000,
  bossCallBonusScore: 10,
  /** `outage`: used when level data gives no duration (design doc: 20 s). */
  outageDefaultMs: 20_000,
  /** `correction`: credibility lost when the event starts; filing recovers this fraction. */
  correctionCredibilityLoss: 20,
  correctionRecoverFraction: 0.5,
  correctionScore: 10,
} as const;

// --- Endless mode (S4-11) -------------------------------------------------------------------

/** Level id selected in the lobby for endless mode; not a content file. */
export const ENDLESS_LEVEL_ID = 'endless';

/**
 * Endless mode balance (S4-11). The generator in `@redakcja/content` builds the whole schedule up
 * front; the folder interval shrinks by `intervalFactorPerMinute` every minute (down to
 * `minIntervalS`) and the folder time by `deadlineShrinkPerMinuteS` (down to `minDeadlineS`).
 */
export const ENDLESS = {
  /** Level length handed to the sim; effectively unlimited, a run ends only at 0 credibility. */
  durationS: 86_400,
  /** The generated schedule covers this much level time. */
  scheduleLengthS: 3600,
  firstSpawnS: 4,
  startIntervalS: 18,
  minIntervalS: 7,
  intervalFactorPerMinute: 0.9,
  /** Each interval is randomised by up to this fraction either way. */
  intervalJitter: 0.15,
  startDeadlineS: 80,
  minDeadlineS: 35,
  deadlineShrinkPerMinuteS: 3,
  /** Random events start after this much level time, then come every `eventIntervalS`. */
  eventsStartS: 150,
  eventIntervalS: 75,
  minEventIntervalS: 30,
  eventIntervalFactorPerMinute: 0.95,
  /** Wave size of a `botRaid` event. */
  botRaidCount: 3,
  /** Unused by endless scoring (no stars), required by the level shape. */
  stars: { two: 500, three: 1000 },
  /** `levelEnd.results` keeps at most this many (the latest) entries in a long run. */
  maxResultsSent: 512,
} as const;
/** Endless: every station deck should hold at least this many stories (fewer → validator warning). */
export const ENDLESS_MIN_DECK = 4;
// --- S4-01: phone station minigame ------------------------------------------------------------

/** Numbers in the phone book the player picks from. */
export const PHONE_CONTACT_COUNT = 4;
/** The queue after the right number is dialled lasts between these (seeded); reporters skip it. */
export const PHONE_QUEUE_MIN_MS = 2500;
export const PHONE_QUEUE_MAX_MS = 4500;
/** One beat of the hold music while waiting in the queue. */
export const PHONE_HOLD_BEAT_MS = 500;

// --- S4-02 AI scanner minigame --------------------------------------------------------------

/** Reading centre (percent "machine made") before noise, by story truth. */
export const AI_SCANNER_BASE_BY_TRUTH = {
  true: 18,
  false: 80,
  misleading: 62,
  satire: 45,
  unverifiable: 50,
} as const;
/** Pictures and recordings are easier for a detector than short texts and figures (percent). */
export const AI_SCANNER_MEDIA_SHIFT = 8;
/** The detector is noisy: the centre moves up to this far from the base (percent). */
export const AI_SCANNER_NOISE = 24;
/** Error margin shown as "± N%" is drawn from this range (percent, whole numbers). */
export const AI_SCANNER_MARGIN_MIN = 6;
export const AI_SCANNER_MARGIN_MAX = 28;
/** The side threshold: a reading is "AI" above it and "real" below it (percent). */
export const AI_SCANNER_THRESHOLD = 50;
/** The detector never reads exactly 0 or 100 (percent). */
export const AI_SCANNER_READING_MIN = 3;
export const AI_SCANNER_READING_MAX = 97;

// --- Minigame: data library (S4-03) ----------------------------------------------------------

/** Wrong picks (a cell or "doesn't match") that end the data-library minigame as a failure. */
export const DATA_LIBRARY_MAX_MISTAKES = 2;
/** Rows and year columns of the original table (a „Średnia” column is added after the years). */
export const DATA_LIBRARY_ROWS = 3;
export const DATA_LIBRARY_YEARS = 3;
/** Chance that the claimed figure is altered, for a folder without a data-library stamp. */
export const DATA_LIBRARY_ALTERED_CHANCE = 0.6;

// --- Stage 7: Mapa (geolocation) minigame (S7-48, played from S7-55) --------------------------

export const GEOLOCATION_MAX_MISTAKES = 2;
/** The town map: 12 district tiles. */
export const GEOLOCATION_MAP = { columns: 4, rows: 3 } as const;
/** Without a geolocation stamp: chance the photo is not from the captioned place. */
export const GEOLOCATION_PROBLEM_CHANCE = 0.5;
/** A photo not from the captioned place comes from another district (else another town). */
export const GEOLOCATION_OTHER_DISTRICT_SHARE = 0.5;

// --- Stage 7: Stenogram (transcript) minigame (S7-48, played from S7-53) ----------------------

export const TRANSCRIPT_MAX_MISTAKES = 2;
/** Lines of the full record; fits 640x360 as a 2x2 grid of lines at least 48 px tall. */
export const TRANSCRIPT_LINES = 4;
/** Without a transcript stamp: chance the clip is cut or absent. */
export const TRANSCRIPT_PROBLEM_CHANCE = 0.5;

// --- Stage 7: Inne media (crossCheck) minigame (S7-48, played from S7-54) ---------------------

/** Three answers; like aiScanner and phone, one wrong pick fails. */
export const CROSS_CHECK_MAX_MISTAKES = 1;
export const CROSS_CHECK_CARDS = 5;
/** Independent confirmations needed for „Potwierdzają”. */
export const CROSS_CHECK_CONFIRMATIONS = 2;
/**
 * Without a crossCheck stamp: chance that independent media already cover a true story
 * (confirm it) or an untrue one (deny it); otherwise nobody has checked it yet.
 */
export const CROSS_CHECK_COVERAGE_CHANCE = 0.5;

// --- Stage 7: Metadane (metadata) minigame (S7-48, played from S7-52) -------------------------

export const METADATA_MAX_MISTAKES = 2;
/** File fields compared with the claim: taken, device, software, place. */
export const METADATA_FIELDS = 4;
/** Without a metadata stamp: weights of the three puzzle outcomes. */
export const METADATA_NO_STAMP_WEIGHTS = {
  consistent: 0.4,
  contradiction: 0.4,
  stripped: 0.2,
} as const;

// --- S4-05..S4-09: level event presentation (client) -----------------------------------------

/** How long an event banner stays up, and how many may be on screen at once. */
export const EVENT_BANNER_MS = 3200;
export const EVENT_BANNER_MAX = 2;
/** A boss call badge shows urgency (shakes, red) in its last seconds. */
export const EVENT_BOSS_URGENT_MS = 4000;
/** Seconds between spark / smoke bursts on a station that is down. */
export const EVENT_OUTAGE_SPARK_EVERY_S = 0.9;
