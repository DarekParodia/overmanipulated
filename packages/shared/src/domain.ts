// Game vocabulary shared by content, simulation and protocol. Names follow agents/glossary.md.
import { z } from 'zod';

/** Verification stations from the design document. Stage 2 levels use the first three. */
export const stationKindSchema = z.enum([
  'imageSearch',
  'archive',
  'sourceRegistry',
  'phone',
  'aiScanner',
  'dataLibrary',
]);

export const verdictSchema = z.enum(['publish', 'reject', 'publishWithContext']);
export const truthSchema = z.enum(['true', 'false', 'misleading', 'satire', 'unverifiable']);
export const prioritySchema = z.enum(['normal', 'important', 'urgent']);
export const storyTypeSchema = z.enum([
  'photo',
  'quote',
  'post',
  'recording',
  'statistic',
  'article',
]);
export const roleSchema = z.enum(['photoEditor', 'archivist', 'reporter', 'managingEditor']);
/** A role's active ability (Stage 7, M3); each role has exactly one (`ROLE_PERKS`). */
export const abilitySchema = z.enum([
  'expertise',
  'fieldCall',
  'extendDeadline',
  'secondChance',
  'passFolder',
]);
/** Station families (`STATION_FAMILY`); in Stage 7 they only gate Ekspertyza. */
export const stationFamilySchema = z.enum(['image', 'documents', 'sources']);
/**
 * Stages of an ability use, as the `ability` event reports them: armed/disarmed (Ekspertyza and
 * Druga szansa wait for their trigger), started (Telefon z terenu dialling), done (the effect
 * applied), cancelled (the call was dropped or its folder is gone).
 */
export const abilityStageSchema = z.enum(['armed', 'disarmed', 'started', 'done', 'cancelled']);
/** What put a stamp on a folder: a solved minigame, Ekspertyza, or Telefon z terenu. */
export const stampSourceSchema = z.enum(['minigame', 'expertise', 'fieldCall']);
export const pingKindSchema = z.enum(['needArchive', 'fake', 'mine']);
/** How a station's stamp bears on the verdict (content metadata, shown in the debrief). */
export const stampRelevanceSchema = z.enum(['decisive', 'misleading', 'irrelevant']);
/** Room difficulty (Stage 7): picks one preset from `DIFFICULTY` in constants.ts. */
export const difficultySchema = z.enum(['easy', 'normal', 'hard', 'expert']);

/** Random level events (design doc, "Zdarzenia losowe"); scheduled from level data. */
export const levelEventKindSchema = z.enum([
  'viral',
  'bossCall',
  'botRaid',
  'outage',
  'correction',
]);

export type StationKind = z.infer<typeof stationKindSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Truth = z.infer<typeof truthSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type StoryType = z.infer<typeof storyTypeSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Ability = z.infer<typeof abilitySchema>;
export type StationFamily = z.infer<typeof stationFamilySchema>;
export type AbilityStage = z.infer<typeof abilityStageSchema>;
export type StampSource = z.infer<typeof stampSourceSchema>;
export type LevelEventKind = z.infer<typeof levelEventKindSchema>;
export type PingKind = z.infer<typeof pingKindSchema>;
export type StampRelevance = z.infer<typeof stampRelevanceSchema>;
export type Difficulty = z.infer<typeof difficultySchema>;

/**
 * Stations whose stamp is only a hint (design doc: "AI is only a hint"). Such a stamp may be
 * listed among a story's justifying stamps, but it never counts toward the proof a verdict needs.
 */
export const HINT_ONLY_STATIONS = ['aiScanner'] as const satisfies readonly StationKind[];

export function isHintOnly(kind: StationKind): boolean {
  return (HINT_ONLY_STATIONS as readonly StationKind[]).includes(kind);
}

export const LEVEL_EVENT_KINDS = levelEventKindSchema.options;
export const STATION_KINDS = stationKindSchema.options;
export const VERDICTS = verdictSchema.options;
export const ROLES = roleSchema.options;
export const ABILITIES = abilitySchema.options;
export const STATION_FAMILIES = stationFamilySchema.options;
export const PING_KINDS = pingKindSchema.options;
/** Easiest first; pickers and per-difficulty tables list them in this order. */
export const DIFFICULTIES = difficultySchema.options;

/**
 * The verdict a story must get (agents/content-authoring.md, "Truth → verdict").
 * Unverifiable material is rejected; that letting a non-urgent one expire costs nothing is a
 * scoring rule, not a different verdict.
 */
export function correctVerdictFor(truth: Truth, _priority: Priority): Verdict {
  switch (truth) {
    case 'true':
      return 'publish';
    case 'misleading':
    case 'satire':
      return 'publishWithContext';
    case 'false':
    case 'unverifiable':
      return 'reject';
  }
}

/** Expiry of an unverifiable, non-urgent story carries no penalty (design doc, Werdykty). */
export function expiryIsPenalized(truth: Truth, priority: Priority): boolean {
  return !(truth === 'unverifiable' && priority !== 'urgent');
}
