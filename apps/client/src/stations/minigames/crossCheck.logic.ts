// Inne media minigame (S7-54): pure puzzle generation and rules. The folder's claim (the story's
// headline) next to five coverage cards from other outlets. Each card shows the outlet, its kind
// (agency, newsroom, satire, anonymous group, clone portal), its stance („pisze to samo” or
// „zaprzecza”) and its source line. Only an agency or a newsroom with its own reporter is
// independent; a copy of someone else's post looks exactly like a confirmation. The player
// answers „Potwierdzają”, „Zaprzeczają” or „Za mało źródeł”; one wrong answer fails.
// Real-world analogue: SIFT „find better coverage”, news agencies, lateral reading.
import type { Stamp, Story } from '@redakcja/content';
import {
  CROSS_CHECK_CARDS,
  CROSS_CHECK_CONFIRMATIONS,
  CROSS_CHECK_COVERAGE_CHANCE,
  CROSS_CHECK_MAX_MISTAKES,
  createRng,
  DEFAULT_DIFFICULTY,
  type Difficulty,
  mistakeLimit,
} from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import { hashText, pick, type Rng, shuffled } from './evidence.ts';

const t = pl.minigames.crossCheck;

export type OutletKind = 'agency' | 'newsroom' | 'satire' | 'anonymous' | 'junk';
/** `echoes`: repeats someone else's post (the card shows „pisze to samo”, like a confirmation). */
export type Stance = 'confirms' | 'denies' | 'echoes';

export type CoverageCard = {
  outlet: string;
  kind: OutletKind;
  stance: Stance;
  /** What an echo copied the claim from; `null` for every card that is not an echo. */
  via: string | null;
};

export type Conclusion = 'confirmed' | 'denied' | 'unconfirmed';

export type CrossCheckPuzzle = {
  /** The folder's claim: the story's headline. */
  claim: string;
  cards: readonly CoverageCard[];
  conclusion: Conclusion;
};

/** The three answers, in button (cursor) order. */
export const ANSWERS: readonly Conclusion[] = ['confirmed', 'denied', 'unconfirmed'];

/** Salt of this minigame's seed (each minigame has its own, so puzzles never correlate). */
const SEED_SALT = 0x5eed_000a;
/** Coverage beyond the minimum: a confirmed puzzle has 2–3 independent confirmations. */
const EXTRA_CONFIRMATIONS = 1;
/** A denied puzzle has 1–2 independent denials. */
const MAX_DENIALS = 2;

/** Agencies and newsrooms report on their own; satire, anonymous groups and clones do not. */
const REPORTING_KINDS: ReadonlySet<OutletKind> = new Set(['agency', 'newsroom']);

/** An agency or newsroom card with its own source: it confirms or denies, it does not echo. */
export function isIndependent(card: Pick<CoverageCard, 'kind' | 'stance'>): boolean {
  return REPORTING_KINDS.has(card.kind) && card.stance !== 'echoes';
}

/**
 * What the coverage says: any independent denial → denied; at least `CROSS_CHECK_CONFIRMATIONS`
 * independent confirmations → confirmed; anything else → unconfirmed.
 */
export function conclude(cards: readonly Pick<CoverageCard, 'kind' | 'stance'>[]): Conclusion {
  const independent = cards.filter(isIndependent);
  if (independent.some((card) => card.stance === 'denies')) {
    return 'denied';
  }
  const confirmations = independent.filter((card) => card.stance === 'confirms').length;
  return confirmations >= CROSS_CHECK_CONFIRMATIONS ? 'confirmed' : 'unconfirmed';
}

/**
 * The wanted conclusion. Media coverage speaks to the story's truth, not to its source:
 *
 * | stamp                   | true                  | false / misleading   | satire / unverifiable |
 * | decisive                | confirmed             | denied               | unconfirmed           |
 * | misleading / irrelevant | unconfirmed           | unconfirmed          | unconfirmed           |
 * | none (one RNG draw)     | confirmed/unconfirmed | denied/unconfirmed   | unconfirmed (no draw) |
 *
 * Without a stamp, independent coverage exists with `CROSS_CHECK_COVERAGE_CHANCE`.
 */
export function crossCheckOutcome(
  story: Pick<Story, 'truth'>,
  stamp: Pick<Stamp, 'relevance'> | undefined,
  rng: Rng,
): Conclusion {
  const covered: Conclusion | null =
    story.truth === 'true'
      ? 'confirmed'
      : story.truth === 'false' || story.truth === 'misleading'
        ? 'denied'
        : null;
  if (stamp) {
    return stamp.relevance === 'decisive' && covered ? covered : 'unconfirmed';
  }
  if (!covered) {
    return 'unconfirmed';
  }
  return rng.next() < CROSS_CHECK_COVERAGE_CHANCE ? covered : 'unconfirmed';
}

/** Outlet names per kind, shuffled once per puzzle and drawn without repeats. */
type OutletPools = Record<OutletKind, string[]>;

function draw(pools: OutletPools, kind: OutletKind): string {
  const outlet = pools[kind].pop();
  if (outlet === undefined) {
    throw new Error(`no ${kind} outlet left`);
  }
  return outlet;
}

/** The reporting outlets left (agencies and newsrooms), for independent cards and echoes. */
function reportingKind(rng: Rng, pools: OutletPools): OutletKind {
  const left = pools.agency.length + pools.newsroom.length;
  return rng.int(left) < pools.agency.length ? 'agency' : 'newsroom';
}

function reportingCard(rng: Rng, pools: OutletPools, stance: Stance): CoverageCard {
  const kind = reportingKind(rng, pools);
  return {
    outlet: draw(pools, kind),
    kind,
    stance,
    via: stance === 'echoes' ? pick(rng, t.vias) : null,
  };
}

/**
 * Cards that never count: the first is always an agency or newsroom echo (the lesson: a copy
 * looks like a confirmation); the rest are drawn from every outlet left, so echoes, clone
 * portals, satire and anonymous groups mix. Satire and anonymous groups „write the same” on
 * their own (no copied source); clones and echoes copy.
 */
function noiseCards(rng: Rng, pools: OutletPools, count: number): CoverageCard[] {
  if (count <= 0) {
    return [];
  }
  const cards = [reportingCard(rng, pools, 'echoes')];
  const kinds = shuffled(
    rng,
    (Object.keys(pools) as OutletKind[]).flatMap((kind) => pools[kind].map(() => kind)),
  );
  for (const kind of kinds.slice(0, count - 1)) {
    const echoes = kind !== 'satire' && kind !== 'anonymous';
    cards.push({
      outlet: draw(pools, kind),
      kind,
      stance: echoes ? 'echoes' : 'confirms',
      via: echoes ? pick(rng, t.vias) : null,
    });
  }
  return cards;
}

/**
 * Outlets that may cover the claim: never the story's own source (an outlet that published the
 * claim cannot independently confirm or deny it).
 */
function outletPool(rng: Rng, outlets: readonly string[], source: string): string[] {
  return shuffled(
    rng,
    outlets.filter((outlet) => !source.includes(outlet)),
  );
}

/** Same seed, story and stamp → same puzzle. */
export function generatePuzzle(
  seed: number,
  story: Pick<Story, 'headline' | 'truth' | 'source'>,
  stamp: Pick<Stamp, 'relevance' | 'text'> | undefined,
): CrossCheckPuzzle {
  const rng = createRng(seed ^ SEED_SALT ^ hashText(`${story.headline}|${stamp?.text ?? ''}`));
  const conclusion = crossCheckOutcome(story, stamp, rng);
  const pools: OutletPools = {
    agency: outletPool(rng, t.outlets.agency, story.source),
    newsroom: outletPool(rng, t.outlets.newsroom, story.source),
    satire: outletPool(rng, t.outlets.satire, story.source),
    anonymous: outletPool(rng, t.outlets.anonymous, story.source),
    junk: outletPool(rng, t.outlets.junk, story.source),
  };
  const independent: CoverageCard[] = [];
  switch (conclusion) {
    case 'confirmed': {
      const count = CROSS_CHECK_CONFIRMATIONS + rng.int(EXTRA_CONFIRMATIONS + 1);
      for (let i = 0; i < count; i++) independent.push(reportingCard(rng, pools, 'confirms'));
      break;
    }
    case 'denied': {
      const count = 1 + rng.int(MAX_DENIALS);
      for (let i = 0; i < count; i++) independent.push(reportingCard(rng, pools, 'denies'));
      break;
    }
    case 'unconfirmed': {
      // Fewer confirmations than needed: none, or one lonely report.
      const count = rng.int(CROSS_CHECK_CONFIRMATIONS);
      for (let i = 0; i < count; i++) independent.push(reportingCard(rng, pools, 'confirms'));
      break;
    }
  }
  const cards = shuffled(rng, [
    ...independent,
    ...noiseCards(rng, pools, CROSS_CHECK_CARDS - independent.length),
  ]);
  // Loop guard, as in the data library's diagnosis: the cards must say what was wanted.
  if (conclude(cards) !== conclusion) {
    throw new Error(`cross-check cards conclude ${conclude(cards)}, wanted ${conclusion}`);
  }
  return { claim: story.headline, cards, conclusion };
}

/** The line under a card's stance: own reporter, copied from…, none named, or made up. */
export function sourceLine(card: CoverageCard): string {
  if (card.via !== null) {
    return t.sources.copied(card.via);
  }
  switch (card.kind) {
    case 'satire':
      return t.sources.invented;
    case 'anonymous':
      return t.sources.unnamed;
    default:
      return t.sources.own;
  }
}

// --- Rules -------------------------------------------------------------------------------

export type Outcome = 'playing' | 'success' | 'failure';

export type GameState = {
  puzzle: CrossCheckPuzzle;
  /** Index into `ANSWERS` (keyboard / gamepad cursor). */
  cursor: number;
  /** Wrong answers, struck through (a second pick costs nothing). */
  struck: Record<Conclusion, boolean>;
  mistakes: number;
  /** Mistakes that fail the round: `CROSS_CHECK_MAX_MISTAKES` (1) on every difficulty. */
  maxMistakes: number;
  outcome: Outcome;
  /** What the player answered last. */
  picked: Conclusion | null;
};

export type Action =
  | { type: 'move'; delta: number }
  | { type: 'pick'; answer: Conclusion }
  | { type: 'confirm' };

/** What just happened, for feedback cues. */
export type Effect = 'move' | 'right' | 'mistake' | 'failed' | 'blocked';

export function initialState(
  puzzle: CrossCheckPuzzle,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
): GameState {
  return {
    puzzle,
    cursor: 0,
    struck: { confirmed: false, denied: false, unconfirmed: false },
    mistakes: 0,
    maxMistakes: mistakeLimit(CROSS_CHECK_MAX_MISTAKES, difficulty),
    outcome: 'playing',
    picked: null,
  };
}

function answer(state: GameState, picked: Conclusion): [GameState, Effect] {
  const cursor = ANSWERS.indexOf(picked);
  if (state.struck[picked]) {
    return [{ ...state, cursor }, 'blocked'];
  }
  if (picked === state.puzzle.conclusion) {
    return [{ ...state, cursor, picked, outcome: 'success' }, 'right'];
  }
  const mistakes = state.mistakes + 1;
  const failed = mistakes >= state.maxMistakes;
  return [
    {
      ...state,
      cursor,
      picked,
      struck: { ...state.struck, [picked]: true },
      mistakes,
      outcome: failed ? 'failure' : 'playing',
    },
    failed ? 'failed' : 'mistake',
  ];
}

export function reduce(state: GameState, action: Action): [GameState, Effect | null] {
  if (state.outcome !== 'playing') {
    return [state, null];
  }
  switch (action.type) {
    case 'move': {
      const cursor = Math.max(0, Math.min(ANSWERS.length - 1, state.cursor + action.delta));
      return cursor === state.cursor ? [state, null] : [{ ...state, cursor }, 'move'];
    }
    case 'pick':
      return answer(state, action.answer);
    case 'confirm': {
      const picked = ANSWERS[state.cursor];
      return picked ? answer(state, picked) : [state, null];
    }
  }
}
