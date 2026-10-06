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
export const pingKindSchema = z.enum(['needArchive', 'fake', 'mine']);
/** How a station's stamp bears on the verdict (content metadata, shown in the debrief). */
export const stampRelevanceSchema = z.enum(['decisive', 'misleading', 'irrelevant']);

export type StationKind = z.infer<typeof stationKindSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Truth = z.infer<typeof truthSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type StoryType = z.infer<typeof storyTypeSchema>;
export type Role = z.infer<typeof roleSchema>;
export type PingKind = z.infer<typeof pingKindSchema>;
export type StampRelevance = z.infer<typeof stampRelevanceSchema>;

export const STATION_KINDS = stationKindSchema.options;
export const VERDICTS = verdictSchema.options;
export const ROLES = roleSchema.options;
export const PING_KINDS = pingKindSchema.options;

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
