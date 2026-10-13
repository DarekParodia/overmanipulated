// Gameplay entities as they live in the simulation state and travel in snapshots. One schema per
// entity; the simulation's TypeScript types are inferred from these (AGENTS.md rule 5).
import { z } from 'zod';
import { MAX_REQUIRED_STAMPS } from './constants.ts';
import { stationKindSchema, verdictSchema } from './domain.ts';

const finite = z.number().finite();
const id = z.string().min(1).max(64);

/**
 * Where a folder came from, the same in every newsroom of a match (S7-13): `s<scheduleIndex>` for
 * a scheduled folder, `e<eventIndex>.<waveIndex>` for a level-event folder (the wave index counts
 * a botRaid's folders, 0 for other events). Minigame seeds and versus pairing key on it; the
 * folder id (`f<n>`) stays the per-sim handle.
 */
export const spawnKeySchema = z
  .string()
  .max(32)
  .regex(/^(s\d+|e\d+\.\d+)$/);

export const folderLocationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('carried'), playerId: id }),
  /** On a conveyor tile, table, station or desk; the fixture id comes from the tile map. */
  z.object({ kind: z.literal('fixture'), fixtureId: id }),
  z.object({ kind: z.literal('floor'), x: finite, y: finite }),
]);

/**
 * Marks a folder that belongs to a level event (S4-05..S4-09). Untagged folders are ordinary.
 * - viral: a share counter grows with age (`viralShares` in sim/events.ts); pure pressure.
 * - bossCall: the editor-in-chief demands this folder be published until `untilMs`; obeying
 *   scores only if the story was true.
 * - botRaid: one of several near-identical folders; a verdict on one resolves the whole raid.
 * - correction: a published story turned out manipulated; filing it recovers credibility.
 */
export const folderTagSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('viral') }),
  z.object({ kind: z.literal('bossCall'), untilMs: finite }),
  z.object({ kind: z.literal('botRaid'), raidId: id }),
  z.object({ kind: z.literal('correction'), recoverCredibility: z.number().int().nonnegative() }),
]);

export const folderSchema = z.object({
  id,
  spawnKey: spawnKeySchema,
  storyId: id,
  location: folderLocationSchema,
  /** Stamp ids collected so far, in the order they were applied. */
  stamps: z.array(id).max(16),
  /** Level time (ms since start) when the folder arrived. */
  spawnedAtMs: finite,
  /** Level time when the folder expires. */
  deadlineMs: finite,
  /** True once `deadlineWarning` was emitted for this folder. */
  warned: z.boolean(),
  /** Set on folders spawned by a level event. */
  tag: folderTagSchema.optional(),
  /**
   * The station the bag slot designated for this folder, copied from its schedule entry at
   * spawn (S7-23). Guidance suggests it first among the stations that decide the story; absent
   * on event folders and on levels with an authored schedule.
   */
  bagStation: stationKindSchema.optional(),
});

export const stationPhaseSchema = z.enum(['idle', 'working', 'minigame', 'lockout']);

export const stationSchema = z.object({
  /** Fixture id of the station tile. */
  id,
  kind: stationKindSchema,
  /** Player working here (holding work, or playing the minigame); null when free. */
  operatorId: id.nullable(),
  phase: stationPhaseSchema,
  /** Hold-to-work progress in ms towards `durationMs`. */
  progressMs: finite,
  /** Work time for the current operator (role bonus applied). */
  durationMs: finite,
  /** Seed for the current minigame round; the client generates the puzzle from it. */
  minigameSeed: z.number().int(),
  /** Remaining lockout after a failed minigame. */
  lockoutMs: finite,
  /** Remaining time the station is down (`outage` event); 0 when it works. */
  outageMs: finite,
});

export const deskSchema = z.object({
  /** Fixture id of the desk tile. */
  id,
  /** Player who opened the verdict sheet for the folder on this desk; null when free. */
  operatorId: id.nullable(),
});

export const folderOutcomeSchema = z.enum([
  'correct',
  /** Correct verdict, but the cited stamps are not (enough) proof (`reason` says which). */
  'wrongJustification',
  'wrong',
  'expired',
  /** The level ended while the folder was still in play. */
  'unfinished',
]);

/**
 * Why a folder ended the way it did; one value per branch of the scoring rules (desk.ts,
 * scoring.ts). Each reason belongs to exactly one outcome:
 * - correct: correctNormal, correctImportant, correctWithContext, correctionFiled;
 * - wrongJustification: weakProof (a cited stamp is not valid proof), incompleteProof (too few
 *   countable proofs, e.g. only the hint-only AI scanner);
 * - wrong: publishedFake, rejectedTrue, contextOnTrue, publishedWithoutContext,
 *   rejectedContextStory;
 * - expired: expired, expiredUnpenalized;
 * - unfinished: unfinished.
 */
export const folderReasonSchema = z.enum([
  'correctNormal',
  'correctImportant',
  'correctWithContext',
  'correctionFiled',
  'weakProof',
  'incompleteProof',
  'publishedFake',
  'rejectedTrue',
  'contextOnTrue',
  'publishedWithoutContext',
  'rejectedContextStory',
  'expired',
  'expiredUnpenalized',
  'unfinished',
]);

const bonusPoints = z.number().int().nonnegative();

/** Points on top of the base points; `scoreDelta − speed − multiStamp − bossCall` is the base. */
export const folderBonusesSchema = z.object({
  speed: bonusPoints,
  multiStamp: bonusPoints,
  bossCall: bonusPoints,
});

/** One folder's fate, collected for the level summary (Kolegium redakcyjne). */
export const folderResultSchema = z.object({
  folderId: id,
  spawnKey: spawnKeySchema,
  storyId: id,
  outcome: folderOutcomeSchema,
  reason: folderReasonSchema,
  verdict: verdictSchema.nullable(),
  scoreDelta: z.number().int(),
  credibilityDelta: z.number().int(),
  /** Stamps cited at the desk, without duplicates; [] without a verdict. */
  justifyingStampIds: z.array(id).max(MAX_REQUIRED_STAMPS),
  /** Distinct proofs the story required. */
  requiredStamps: z.number().int().min(1).max(MAX_REQUIRED_STAMPS),
  bonuses: folderBonusesSchema,
  /** Justifying stamps the folder lacked; filled for every outcome except `correct` ([]). */
  missedStampIds: z.array(id).max(16),
});

/** Why a level was lost: credibility ran out, or time ran out without a positive score. */
export const lossReasonSchema = z.enum(['credibility', 'score']);

/**
 * The next folder the level schedule brings (S7-08): the level time it is due and the level
 * time the previous scheduled folder was due (0 before the first), so the HUD can count down
 * and fill a ring between the two. Level-event folders are never announced.
 */
export const nextFolderSchema = z.object({
  atMs: finite.nonnegative(),
  sinceMs: finite.nonnegative(),
});

export const levelOutcomeSchema = z.object({
  won: z.boolean(),
  stars: z.number().int().min(0).max(3),
  /** null when the level was won. */
  lossReason: lossReasonSchema.nullable(),
});

export type SpawnKey = z.infer<typeof spawnKeySchema>;
export type FolderTag = z.infer<typeof folderTagSchema>;
export type FolderLocation = z.infer<typeof folderLocationSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type StationPhase = z.infer<typeof stationPhaseSchema>;
export type Station = z.infer<typeof stationSchema>;
export type Desk = z.infer<typeof deskSchema>;
export type FolderOutcome = z.infer<typeof folderOutcomeSchema>;
export type FolderReason = z.infer<typeof folderReasonSchema>;
export type FolderBonuses = z.infer<typeof folderBonusesSchema>;
export type FolderResult = z.infer<typeof folderResultSchema>;
export type LossReason = z.infer<typeof lossReasonSchema>;
export type LevelOutcome = z.infer<typeof levelOutcomeSchema>;
export type NextFolder = z.infer<typeof nextFolderSchema>;

/** A result without any bonus points (frozen: results share it). */
export const NO_BONUSES: Readonly<FolderBonuses> = Object.freeze({
  speed: 0,
  multiStamp: 0,
  bossCall: 0,
});
