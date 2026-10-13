// Contract between the station overlay and a minigame. A minigame is a self-contained React
// component: it builds its puzzle from `seed` (same seed → same puzzle), takes keyboard and
// gamepad through `useNavIntent` (input/ui-nav.ts) plus its own touch/mouse handling, and
// reports the outcome exactly once through `onDone`. The overlay handles the time limit,
// closing, sending the result to the server and the success/failure cues. The room's difficulty
// (S7-24) sets the time limit, the mistake limit (`mistakeLimit` in each minigame's logic) and
// whether a failure shows the answer (`revealOnFail`, rules.ts).
import type { Stamp, Story } from '@redakcja/content';
import type { Difficulty, StationKind } from '@redakcja/shared';
import type { ComponentType } from 'react';
import type { InputDevice } from '../../store/app.ts';

export type MinigameProps = {
  /** Server-chosen seed for this round. */
  seed: number;
  /** The folder being checked (sim handle `f<n>`). */
  folderId: string;
  /** The room's difficulty: minigames read their mistake limit from it. */
  difficulty: Difficulty;
  /** The full time limit of one attempt on this difficulty (`minigameTimeLimitMs`). */
  timeLimitMs: number;
  /** Show the right answer after a failure (`revealsOnFail`: never on Ekspert or the Kartoteka). */
  revealOnFail: boolean;
  /**
   * The clock this round started with when it resumes a card put down unfinished (the
   * Kartoteka, retry-memory.ts); absent on a fresh round, which starts with `timeLimitMs`.
   */
  resumeMs?: number;
  /** The story on the folder being checked. */
  story: Story;
  /** The stamp this station gives for the story, if the story has one for this station. */
  stamp: Stamp | undefined;
  /** Device the player used last, for button prompts. */
  device: InputDevice;
  /** The local player's role skips the phone queue (reporter, per `ROLE_STATIONS`). */
  skipsQueue?: boolean;
  /** 0..1 share of `timeLimitMs` already used (for urgency visuals; a resumed round starts > 0). */
  timeUsed: number;
  /** Report the result exactly once; later calls are ignored by the overlay. */
  onDone(success: boolean): void;
};

export type Minigame = ComponentType<MinigameProps>;

export type MinigameRegistry = Partial<Record<StationKind, Minigame>>;
