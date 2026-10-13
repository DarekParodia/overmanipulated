// The parts of content the simulation needs. `@redakcja/content` validates the full files with
// Zod; its inferred Story and Level types are structurally assignable to these views (checked
// in packages/content), so the simulation never depends on the content package.
import {
  isHintOnly,
  type Priority,
  type StampRelevance,
  type StationKind,
  type StoryType,
  type Truth,
  type Verdict,
} from '../domain.ts';

export type SimStamp = {
  id: string;
  station: StationKind;
  relevance: StampRelevance;
};

export type SimStory = {
  id: string;
  type: StoryType;
  priority: Priority;
  truth: Truth;
  correctVerdict: Verdict;
  /** At most one stamp per station. */
  stamps: readonly SimStamp[];
  /** Stamp ids that validly justify `correctVerdict`. */
  justifyingStamps: readonly string[];
  /**
   * Distinct justifying, non-hint stamps the desk must cite (multi-stamp folders). Optional so
   * fixtures and content written before it stay valid; absent means 1.
   */
  requiredStamps?: number;
};

/** How many distinct proofs a verdict on this story must cite. */
export function requiredStampsOf(story: Pick<SimStory, 'requiredStamps'>): number {
  return story.requiredStamps ?? 1;
}

/** The stamp facts the proof rule reads; the content `Story` and client lookups fit it too. */
export type ProofStory = {
  stamps: readonly { id: string; station: StationKind }[];
  justifyingStamps: readonly string[];
};

/**
 * Whether a stamp counts toward the proofs a verdict needs: it justifies the story's verdict and
 * does not come from a hint-only station (the AI scanner). The one definition of "proof" for the
 * desk, guidance and the balance bot; the folder must also carry the stamp to cite it.
 */
export function countsAsProof(story: ProofStory, stampId: string): boolean {
  if (!story.justifyingStamps.includes(stampId)) {
    return false;
  }
  const station = story.stamps.find((stamp) => stamp.id === stampId)?.station;
  return station !== undefined && !isHintOnly(station);
}

export type SimSpawn = {
  /** Level time when the folder arrives, in seconds. */
  atS: number;
  storyId: string;
  /** Time the team has for this folder, in seconds. */
  deadlineS: number;
  /** The bag slot's station (dealt levels only); the folder carries it as `bagStation`. */
  station?: StationKind | undefined;
};

/** A scheduled level event. Every kind except `outage` spawns folders from `storyId`. */
export type SimLevelEvent =
  | { kind: 'viral' | 'bossCall' | 'correction'; atS: number; storyId: string; deadlineS: number }
  | { kind: 'botRaid'; atS: number; storyId: string; deadlineS: number; count: number }
  | { kind: 'outage'; atS: number; station: StationKind; durationS: number };

export type SimLevel = {
  id: string;
  durationS: number;
  layout: readonly string[];
  stations: readonly StationKind[];
  /** Sorted by `atS`. */
  schedule: readonly SimSpawn[];
  /** Sorted by `atS`; absent or empty on levels without events. */
  events?: readonly SimLevelEvent[];
  /** Endless mode: no duration limit, the level ends only when credibility reaches 0. */
  endless?: boolean;
  /** Score thresholds for two and three stars (one star = survived with a positive score). */
  stars: { two: number; three: number };
};

export type StoryBook = Readonly<Record<string, SimStory>>;
