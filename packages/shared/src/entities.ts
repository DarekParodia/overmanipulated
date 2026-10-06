// Gameplay entities as they live in the simulation state and travel in snapshots. One schema per
// entity; the simulation's TypeScript types are inferred from these (AGENTS.md rule 5).
import { z } from 'zod';
import { stationKindSchema, verdictSchema } from './domain.ts';

const finite = z.number().finite();
const id = z.string().min(1).max(64);

export const folderLocationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('carried'), playerId: id }),
  /** On a conveyor tile, table, station or desk; the fixture id comes from the tile map. */
  z.object({ kind: z.literal('fixture'), fixtureId: id }),
  z.object({ kind: z.literal('floor'), x: finite, y: finite }),
]);

export const folderSchema = z.object({
  id,
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
});

export const deskSchema = z.object({
  /** Fixture id of the desk tile. */
  id,
  /** Player who opened the verdict sheet for the folder on this desk; null when free. */
  operatorId: id.nullable(),
});

export const folderOutcomeSchema = z.enum([
  'correct',
  /** Correct verdict, but the chosen stamp does not justify it. */
  'wrongJustification',
  'wrong',
  'expired',
]);

/** One folder's fate, collected for the level summary (Kolegium redakcyjne). */
export const folderResultSchema = z.object({
  folderId: id,
  storyId: id,
  outcome: folderOutcomeSchema,
  verdict: verdictSchema.nullable(),
  scoreDelta: z.number().int(),
  credibilityDelta: z.number().int(),
  /** Justifying stamps the team did not collect. */
  missedStampIds: z.array(id).max(16),
});

export const levelOutcomeSchema = z.object({
  won: z.boolean(),
  stars: z.number().int().min(0).max(3),
});

export type FolderLocation = z.infer<typeof folderLocationSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type StationPhase = z.infer<typeof stationPhaseSchema>;
export type Station = z.infer<typeof stationSchema>;
export type Desk = z.infer<typeof deskSchema>;
export type FolderOutcome = z.infer<typeof folderOutcomeSchema>;
export type FolderResult = z.infer<typeof folderResultSchema>;
export type LevelOutcome = z.infer<typeof levelOutcomeSchema>;
