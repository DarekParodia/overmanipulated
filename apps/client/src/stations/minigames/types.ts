// Contract between the station overlay and a minigame. A minigame is a self-contained React
// component: it builds its puzzle from `seed` (same seed → same puzzle), takes keyboard and
// gamepad through `useNavIntent` (input/ui-nav.ts) plus its own touch/mouse handling, and
// reports the outcome exactly once through `onDone`. The overlay handles the time limit,
// closing, sending the result to the server and the success/failure cues.
import type { Stamp, Story } from '@redakcja/content';
import type { StationKind } from '@redakcja/shared';
import type { ComponentType } from 'react';
import type { InputDevice } from '../../store/app.ts';

export type MinigameProps = {
  /** Server-chosen seed for this round. */
  seed: number;
  /** The story on the folder being checked. */
  story: Story;
  /** The stamp this station gives for the story, if the story has one for this station. */
  stamp: Stamp | undefined;
  /** Device the player used last, for button prompts. */
  device: InputDevice;
  /** The local player's role skips the phone queue (reporter, per `ROLE_STATIONS`). */
  skipsQueue?: boolean;
  /** 0..1 share of the time limit already used (for urgency visuals). */
  timeUsed: number;
  /** Report the result exactly once; later calls are ignored by the overlay. */
  onDone(success: boolean): void;
};

export type Minigame = ComponentType<MinigameProps>;

export type MinigameRegistry = Partial<Record<StationKind, Minigame>>;
