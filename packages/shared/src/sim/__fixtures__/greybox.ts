// Test fixtures for gameplay subsystems: the greybox level with a short schedule and one story
// per truth value. Plain data, independent of the content package.
import { TICK_MS } from '../../constants.ts';
import type { PlayerCommand } from '../../protocol.ts';
import type { SimLevel, SimStory, StoryBook } from '../content.ts';
import type { QueuedCommand, SimContext } from '../frame.ts';
import { GREYBOX_LAYOUT, parseLayout } from '../map.ts';
import type { GameState } from '../state.ts';
import { type PlayerInput, type StepResult, step } from '../step.ts';

export const TEST_MAP = parseLayout(GREYBOX_LAYOUT);

function story(
  id: string,
  truth: SimStory['truth'],
  priority: SimStory['priority'],
  correctVerdict: SimStory['correctVerdict'],
): SimStory {
  return {
    id,
    type: 'photo',
    priority,
    truth,
    correctVerdict,
    stamps: [
      { id: `${id}-image`, station: 'imageSearch', relevance: 'decisive' },
      { id: `${id}-archive`, station: 'archive', relevance: 'misleading' },
      { id: `${id}-source`, station: 'sourceRegistry', relevance: 'irrelevant' },
    ],
    justifyingStamps: [`${id}-image`],
  };
}

export const TEST_STORIES: StoryBook = {
  't-true': story('t-true', 'true', 'normal', 'publish'),
  't-false': story('t-false', 'false', 'important', 'reject'),
  't-misleading': story('t-misleading', 'misleading', 'normal', 'publishWithContext'),
  't-satire': story('t-satire', 'satire', 'normal', 'publishWithContext'),
  't-unverifiable': story('t-unverifiable', 'unverifiable', 'normal', 'reject'),
  't-unverifiable-urgent': story('t-unverifiable-urgent', 'unverifiable', 'urgent', 'reject'),
};

export const TEST_LEVEL: SimLevel = {
  id: 'test-greybox',
  durationS: 120,
  layout: GREYBOX_LAYOUT,
  stations: ['imageSearch', 'archive', 'sourceRegistry'],
  schedule: [
    { atS: 1, storyId: 't-true', deadlineS: 60 },
    { atS: 5, storyId: 't-false', deadlineS: 60 },
    { atS: 10, storyId: 't-misleading', deadlineS: 45 },
  ],
  stars: { two: 30, three: 60 },
};

export function testContext(overrides: Partial<SimContext> = {}): SimContext {
  return { dtMs: TICK_MS, map: TEST_MAP, level: TEST_LEVEL, stories: TEST_STORIES, ...overrides };
}

const NO_ACTIONS = { interact: false, work: false };

/** An input with the given move and actions (default: standing still, nothing pressed). */
export function testInput(
  seq: number,
  move: { x: number; y: number } = { x: 0, y: 0 },
  actions: Partial<PlayerInput['actions']> = {},
): PlayerInput {
  return { seq, move, actions: { ...NO_ACTIONS, ...actions } };
}

/** A command from a player, as the server queues it. */
export function testCommand(playerId: string, command: PlayerCommand): QueuedCommand {
  return { playerId, command };
}

/** Runs one tick with the test context. */
export function runStep(
  state: GameState,
  inputs: Readonly<Record<string, readonly PlayerInput[]>> = {},
  commands: readonly QueuedCommand[] = [],
  ctx: SimContext = testContext(),
): StepResult {
  return step(state, inputs, commands, ctx);
}
