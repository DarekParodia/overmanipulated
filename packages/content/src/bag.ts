// Station bag (S7-20): the pure building blocks of a generated campaign run. Folders are dealt in
// whole shuffled rounds over the stations that decide the level's pool stories (`stationSequence`),
// so every station gets its share of the work, and each slot gets a distinct story its station can
// decide (`matchStories`, Kuhn's augmenting paths). `generateBagLevel` (S7-21) composes these
// with the difficulty and the star rule; endless (S7-22) deals its station decks with `bagDrawer`.
// No I/O and no Math.random(): every random choice comes from the `Rng` passed in.
import {
  BAG_FLEX_CHANCE,
  BAG_MULTI_STAMP_MIN_SLOT,
  BAG_OPENING_SLOTS,
  DIFFICULTY,
  type Difficulty,
  type ProofStory,
  type Rng,
  requiredStampsOf,
  type SimStory,
  STAR_SHARES,
  STAR_THRESHOLD_STEP,
  type StarThresholds,
  type StationKind,
} from '@redakcja/shared';
import { proofCount } from './checks.ts';

/** The story facts the bag reads; the content `Story` and the sim fixtures both fit it. */
export type BagStory = ProofStory & Pick<SimStory, 'id' | 'priority' | 'requiredStamps'>;

/** The slot timing of a level's bag on Normal (seconds); the level file's `bag` block fits it. */
export type BagTiming = {
  /** Level time of the first folder. */
  readonly firstAtS: number;
  /** Seconds between folders on Normal; `DIFFICULTY[d].spawnGapFactor` scales it. */
  readonly gapS: number;
  /** No folder arrives after this, on any difficulty. */
  readonly lastSpawnS: number;
};

/** Star thresholds as shares of a run's maximum score (`STAR_SHARES` or a level's override). */
export type StarShares = { readonly two: number; readonly three: number };

/** Fisher–Yates over a copy, drawing from `rng`. */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * Shuffled rounds over `items`: every item once per round, in a fresh order each round, and never
 * the same item twice in a row across a round boundary (unless there is only one item).
 */
export function bagDrawer<T>(items: readonly T[], rng: Rng): () => T {
  if (items.length === 0) {
    throw new RangeError('bagDrawer needs at least one item');
  }
  let bag: T[] = [];
  let last: T | undefined;
  let hasLast = false;
  const refill = () => {
    bag = shuffled(items, rng);
    // The bag is drawn from the end; keep the previous round's last item away from it.
    const end = bag.length - 1;
    if (hasLast && bag.length > 1 && bag[end] === last) {
      [bag[0], bag[end]] = [bag[end] as T, bag[0] as T];
    }
  };
  return () => {
    if (bag.length === 0) {
      refill();
    }
    const item = bag.pop() as T;
    last = item;
    hasLast = true;
    return item;
  };
}

/**
 * Stations of `stations` that decide the story: it has a justifying, non-hint stamp from them (the
 * one rule, `proofCount`). A decisive stamp that does not justify the verdict decides nothing, and
 * neither does a hint-only station (the AI scanner). In `stations` order.
 */
export function decidingStations(
  story: ProofStory,
  stations: readonly StationKind[],
): StationKind[] {
  return stations.filter((station) => proofCount(story, [station]) > 0);
}

/**
 * A pinned story can be decided at exactly one of `stations` and needs one proof; every other
 * decidable story is flex. Multi-stamp stories are always flex.
 */
export function isPinned(story: BagStory, stations: readonly StationKind[]): boolean {
  return requiredStampsOf(story) === 1 && decidingStations(story, stations).length === 1;
}

/** Stations of `stations` that decide at least one pool story, in `stations` order. */
export function bagStations(
  pool: readonly ProofStory[],
  stations: readonly StationKind[],
): StationKind[] {
  return stations.filter((station) => pool.some((story) => proofCount(story, [station]) > 0));
}

/** Pinned pool stories per bag station (every bag station has an entry, 0 included). */
export function pinnedCounts(
  pool: readonly BagStory[],
  stations: readonly StationKind[],
): Map<StationKind, number> {
  const counts = new Map(bagStations(pool, stations).map((station) => [station, 0]));
  for (const story of pool) {
    const only = decidingStations(story, stations)[0];
    if (only !== undefined && isPinned(story, stations)) {
      counts.set(only, (counts.get(only) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The station designated for each of `count` slots: whole shuffled rounds over `stations`
 * (`bagDrawer`), so every station gets the same number of slots, ±1 in the last partial round.
 */
export function stationSequence(
  stations: readonly StationKind[],
  count: number,
  rng: Rng,
): StationKind[] {
  if (count <= 0) {
    return [];
  }
  const draw = bagDrawer(stations, rng);
  return Array.from({ length: count }, draw);
}

/**
 * Whether a slot would rather not get this story: the opening slots want single-proof, non-urgent
 * stories, and multi-stamp stories wait until slot BAG_MULTI_STAMP_MIN_SLOT.
 */
function avoidedAt(story: BagStory, slot: number): boolean {
  const required = requiredStampsOf(story);
  if (slot < BAG_OPENING_SLOTS) {
    return required > 1 || story.priority === 'urgent';
  }
  return slot < BAG_MULTI_STAMP_MIN_SLOT && required > 1;
}

/**
 * A maximum matching of slots to distinct pool stories decidable at the slot's station; undefined
 * where no story is left. Each slot lists its candidates as shuffled pinned stories, then shuffled
 * flex ones (flex first with BAG_FLEX_CHANCE), and Kuhn's augmenting paths re-route earlier slots
 * when a later one needs their story. The slot preferences (`avoidedAt`) hold whenever the pool
 * allows: the first pass matches slots to their preferred stories only, later passes extend that
 * matching over all candidates. Augmenting never unmatches a slot, and the last pass tries every
 * empty slot on the whole graph, so the result is a maximum matching: a run repeats a story only
 * when the pool cannot cover it.
 */
export function matchStories<S extends BagStory>(
  sequence: readonly StationKind[],
  pool: readonly S[],
  stations: readonly StationKind[],
  rng: Rng,
): (S | undefined)[] {
  const deciding = pool.map((story) => new Set(decidingStations(story, stations)));
  const pinned = pool.map((story, i) => requiredStampsOf(story) === 1 && deciding[i]?.size === 1);
  const candidates = sequence.map((station, slot) => {
    const at = pool.flatMap((_, i) => (deciding[i]?.has(station) ? [i] : []));
    const pinnedFirst = shuffled(
      at.filter((i) => pinned[i]),
      rng,
    );
    const flexFirst = shuffled(
      at.filter((i) => !pinned[i]),
      rng,
    );
    const ordered =
      rng.next() < BAG_FLEX_CHANCE
        ? [...flexFirst, ...pinnedFirst]
        : [...pinnedFirst, ...flexFirst];
    const avoided = (i: number) => avoidedAt(pool[i] as S, slot);
    const preferred = ordered.filter((i) => !avoided(i));
    return { preferred, all: [...preferred, ...ordered.filter(avoided)] };
  });

  const storyOfSlot: (number | undefined)[] = sequence.map(() => undefined);
  const slotOfStory: (number | undefined)[] = pool.map(() => undefined);
  const tryAssign = (slot: number, pass: 'preferred' | 'all', seen: boolean[]): boolean => {
    for (const story of candidates[slot]?.[pass] ?? []) {
      if (seen[story]) {
        continue;
      }
      seen[story] = true;
      const owner = slotOfStory[story];
      if (owner === undefined || tryAssign(owner, pass, seen)) {
        slotOfStory[story] = slot;
        storyOfSlot[slot] = story;
        return true;
      }
    }
    return false;
  };
  // 1. Preferred stories only, so the slot preferences hold whenever the pool allows.
  sequence.forEach((_, slot) => {
    tryAssign(slot, 'preferred', []);
  });
  // 2. A slot still empty takes a free story it would rather avoid itself, before 3. could push
  //    one onto an earlier slot that also avoids it. Later slots first: they avoid less.
  for (let slot = sequence.length - 1; slot >= 0; slot--) {
    if (storyOfSlot[slot] === undefined) {
      const free = candidates[slot]?.all.find((story) => slotOfStory[story] === undefined);
      if (free !== undefined) {
        slotOfStory[free] = slot;
        storyOfSlot[slot] = free;
      }
    }
  }
  // 3. Augmenting paths over every candidate for whatever is left.
  sequence.forEach((_, slot) => {
    if (storyOfSlot[slot] === undefined) {
      tryAssign(slot, 'all', []);
    }
  });
  return storyOfSlot.map((i) => (i === undefined ? undefined : pool[i]));
}

/**
 * `matchStories`, with every slot it leaves empty filled by a repeat: the least-used story the
 * slot's station decides (any pool story when it decides none), preferring one that differs from
 * its neighbours and suits the slot, then pool order. Throws only for an empty pool.
 */
export function assignStories<S extends BagStory>(
  sequence: readonly StationKind[],
  pool: readonly S[],
  stations: readonly StationKind[],
  rng: Rng,
): S[] {
  const matched = matchStories(sequence, pool, stations, rng);
  if (pool.length === 0 && sequence.length > 0) {
    throw new RangeError('assignStories needs a non-empty pool');
  }
  const uses = new Map<S, number>();
  for (const story of matched) {
    if (story) {
      uses.set(story, (uses.get(story) ?? 0) + 1);
    }
  }
  const out: S[] = [];
  sequence.forEach((station, slot) => {
    const story = matched[slot];
    if (story) {
      out.push(story);
      return;
    }
    const decidable = pool.filter((s) => proofCount(s, [station]) > 0);
    const from = decidable.length > 0 ? decidable : pool;
    const neighbours = new Set([out[slot - 1], matched[slot + 1]]);
    // Fewer uses first, then not next to itself, then suiting the slot; ties keep pool order.
    const better = (a: S, b: S) =>
      (uses.get(a) ?? 0) - (uses.get(b) ?? 0) ||
      Number(neighbours.has(a)) - Number(neighbours.has(b)) ||
      Number(avoidedAt(a, slot)) - Number(avoidedAt(b, slot));
    let best = from[0] as S;
    for (const candidate of from.slice(1)) {
      if (better(candidate, best) < 0) {
        best = candidate;
      }
    }
    uses.set(best, (uses.get(best) ?? 0) + 1);
    out.push(best);
  });
  return out;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Level times of a run's folders: `firstAtS + i × gapS × spawnGapFactor`, rounded to 0.1 s, while
 * they stay at or before `lastSpawnS`. A harder difficulty packs more slots into the same window.
 */
export function bagSlotTimes(bag: BagTiming, difficulty: Difficulty): number[] {
  const gapS = bag.gapS * DIFFICULTY[difficulty].spawnGapFactor;
  if (!(gapS > 0)) {
    throw new RangeError(`bag gap must be positive, got ${gapS}`);
  }
  const times: number[] = [];
  for (let i = 0; ; i++) {
    const atS = round1(bag.firstAtS + i * gapS);
    if (atS > bag.lastSpawnS) {
      return times;
    }
    times.push(atS);
  }
}

/** `value` rounded to the nearest multiple of STAR_THRESHOLD_STEP. */
function roundToStep(value: number): number {
  return Math.round(value / STAR_THRESHOLD_STEP) * STAR_THRESHOLD_STEP;
}

/**
 * Star thresholds of a run: the shares of its maximum score, rounded to STAR_THRESHOLD_STEP. Two
 * stars never drop below one step, three stars always need at least a step more than two and,
 * when the maximum allows, never more than the maximum.
 */
export function starThresholds(maxScore: number, shares: StarShares = STAR_SHARES): StarThresholds {
  const two = Math.max(STAR_THRESHOLD_STEP, roundToStep(maxScore * shares.two));
  const reachable = Math.floor(maxScore / STAR_THRESHOLD_STEP) * STAR_THRESHOLD_STEP;
  const three = Math.max(
    two + STAR_THRESHOLD_STEP,
    Math.min(roundToStep(maxScore * shares.three), reachable),
  );
  return { two, three };
}
