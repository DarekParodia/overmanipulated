// The parts of content the simulation needs. `@redakcja/content` validates the full files with
// Zod; its inferred Story and Level types are structurally assignable to these views (checked
// in packages/content), so the simulation never depends on the content package.
import type {
  Priority,
  StampRelevance,
  StationKind,
  StoryType,
  Truth,
  Verdict,
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
};

export type SimSpawn = {
  /** Level time when the folder arrives, in seconds. */
  atS: number;
  storyId: string;
  /** Time the team has for this folder, in seconds. */
  deadlineS: number;
};

export type SimLevel = {
  id: string;
  durationS: number;
  layout: readonly string[];
  stations: readonly StationKind[];
  /** Sorted by `atS`. */
  schedule: readonly SimSpawn[];
  /** Score thresholds for two and three stars (one star = survived with a positive score). */
  stars: { two: number; three: number };
};

export type StoryBook = Readonly<Record<string, SimStory>>;
