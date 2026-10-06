// Source registry minigame („Kartoteka źródeł”, S2-06): pure puzzle generation and rules.
// A seeded index card describes an account or a website of Nowe Brzegi; some fields are warning
// signs. The player circles the warning signs (or none, for a clean card) and files the card.
// Real-world analogue: lateral reading — checking who stands behind a source before trusting it.
import type { Stamp, Story } from '@redakcja/content';
import {
  createRng,
  SOURCE_REGISTRY_CLEAN_CHANCE,
  SOURCE_REGISTRY_FIELDS,
  SOURCE_REGISTRY_MAX_FLAGS,
  SOURCE_REGISTRY_MAX_MISTAKES,
  SOURCE_REGISTRY_MIN_FLAGS,
  type StoryType,
} from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';

export type CardKind = keyof typeof pl.minigames.sourceRegistry.fields;

export type CardField = {
  /** Field id, e.g. `created`, `address`. */
  slot: string;
  label: string;
  value: string;
  /** True if this field is a warning sign the player has to circle. */
  flagged: boolean;
};

export type SourceCard = {
  kind: CardKind;
  /** Printed index-card number, for the look only. */
  number: number;
  fields: CardField[];
};

/** Posts, photos, quotes and recordings come from accounts; articles and figures from sites. */
const KIND_BY_STORY_TYPE: Record<StoryType, CardKind> = {
  photo: 'account',
  quote: 'account',
  post: 'account',
  recording: 'account',
  statistic: 'website',
  article: 'website',
};

type Rng = ReturnType<typeof createRng>;

/**
 * Whether the card must show warning signs, consistent with the stamp the station gives:
 * a decisive stamp on an untrue story means the source is the problem; a decisive stamp on a
 * true story means the source checks out. A misleading stamp points the wrong way (a dodgy
 * looking source behind a true story). An irrelevant stamp means the source is unremarkable.
 * Without a stamp the card is random.
 */
export function cardHasFlags(story: Story, stamp: Stamp | undefined, rng: Rng): boolean {
  if (!stamp) {
    return rng.next() >= SOURCE_REGISTRY_CLEAN_CHANCE;
  }
  const isTrue = story.truth === 'true';
  switch (stamp.relevance) {
    case 'decisive':
      return !isTrue;
    case 'misleading':
      return isTrue;
    case 'irrelevant':
      return false;
  }
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.int(items.length)];
  if (item === undefined) {
    throw new Error('empty pool');
  }
  return item;
}

/** Fisher–Yates on a copy. */
function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Same seed, story and stamp → same card. */
export function generateCard(seed: number, story: Story, stamp: Stamp | undefined): SourceCard {
  const rng = createRng(seed ^ 0x5eed_0006);
  const kind = KIND_BY_STORY_TYPE[story.type];
  const pools = pl.minigames.sourceRegistry.fields[kind];
  const slots = Object.keys(pools).slice(0, SOURCE_REGISTRY_FIELDS) as (keyof typeof pools)[];
  const flagCount = cardHasFlags(story, stamp, rng)
    ? SOURCE_REGISTRY_MIN_FLAGS + rng.int(SOURCE_REGISTRY_MAX_FLAGS - SOURCE_REGISTRY_MIN_FLAGS + 1)
    : 0;
  const flaggedSlots = new Set(shuffled(rng, slots).slice(0, flagCount));
  const fields = slots.map((slot): CardField => {
    const pool: { label: string; clean: readonly string[]; flagged: readonly string[] } =
      pools[slot];
    const flagged = flaggedSlots.has(slot);
    return {
      slot,
      label: pool.label,
      value: pick(rng, flagged ? pool.flagged : pool.clean),
      flagged,
    };
  });
  return { kind, number: 100 + rng.int(9900), fields };
}

// --- Rules -------------------------------------------------------------------------------

export type Outcome = 'playing' | 'success' | 'failure';

export type GameState = {
  card: SourceCard;
  /** Focused row for keyboard/gamepad; `card.fields.length` is the file button. */
  cursor: number;
  /** Circled warning signs. */
  circled: boolean[];
  /** Clean fields the player circled by mistake (crossed out, cannot be circled again). */
  struck: boolean[];
  mistakes: number;
  /** The last filing missed a warning sign. */
  missing: boolean;
  outcome: Outcome;
};

export type Action =
  | { type: 'move'; delta: number }
  | { type: 'focus'; index: number }
  | { type: 'toggle'; index: number }
  | { type: 'confirm' }
  | { type: 'file' };

/** What just happened, for feedback cues. */
export type Effect =
  | 'move'
  | 'circle'
  | 'uncircle'
  | 'mistake'
  | 'missing'
  | 'filed'
  | 'failed'
  | 'blocked';

export function initialState(card: SourceCard): GameState {
  return {
    card,
    cursor: 0,
    circled: card.fields.map(() => false),
    struck: card.fields.map(() => false),
    mistakes: 0,
    missing: false,
    outcome: 'playing',
  };
}

function withMistake(state: GameState, patch: Partial<GameState>): [GameState, Effect] {
  const mistakes = state.mistakes + 1;
  const failed = mistakes >= SOURCE_REGISTRY_MAX_MISTAKES;
  return [
    { ...state, ...patch, mistakes, outcome: failed ? 'failure' : 'playing' },
    failed ? 'failed' : patch.missing ? 'missing' : 'mistake',
  ];
}

function toggle(state: GameState, index: number): [GameState, Effect | null] {
  const field = state.card.fields[index];
  if (!field) {
    return [state, null];
  }
  if (state.struck[index]) {
    // Crossed out already: no second penalty, but the tap still gets a response.
    return [{ ...state, cursor: index }, 'blocked'];
  }
  if (field.flagged) {
    const circled = [...state.circled];
    circled[index] = !circled[index];
    return [
      { ...state, cursor: index, circled, missing: false },
      circled[index] ? 'circle' : 'uncircle',
    ];
  }
  const struck = [...state.struck];
  struck[index] = true;
  return withMistake(state, { cursor: index, struck, missing: false });
}

function file(state: GameState): [GameState, Effect] {
  const complete = state.card.fields.every((f, i) => !f.flagged || state.circled[i]);
  if (complete) {
    return [{ ...state, missing: false, outcome: 'success' }, 'filed'];
  }
  return withMistake(state, { missing: true });
}

export function reduce(state: GameState, action: Action): [GameState, Effect | null] {
  if (state.outcome !== 'playing') {
    return [state, null];
  }
  const rows = state.card.fields.length + 1;
  switch (action.type) {
    case 'move': {
      const cursor = (((state.cursor + action.delta) % rows) + rows) % rows;
      return [{ ...state, cursor }, 'move'];
    }
    case 'focus':
      return [{ ...state, cursor: Math.max(0, Math.min(rows - 1, action.index)) }, null];
    case 'toggle':
      return toggle(state, action.index);
    case 'confirm':
      return state.cursor === state.card.fields.length ? file(state) : toggle(state, state.cursor);
    case 'file':
      return file(state);
  }
}

export function flagCount(card: SourceCard): number {
  return card.fields.filter((f) => f.flagged).length;
}
