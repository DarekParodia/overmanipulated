// What the room's difficulty means for one minigame round (S7-24): its time limit and whether a
// failure shows the right answer. Pure, so the rules are unit-tested; the mistake limits live in
// each minigame's logic (`mistakeLimit` from the shared difficulty helpers).
import {
  DIFFICULTY,
  type Difficulty,
  MINIGAME_STABLE_SEED_STATIONS,
  minigameTimeLimitMs,
  type StationKind,
} from '@redakcja/shared';

/**
 * A failed round shows the answer unless the difficulty hides it (Ekspert) or the station keeps
 * its card for the retry (the Kartoteka): there the answer would solve the next round.
 */
export function revealsOnFail(kind: StationKind, difficulty: Difficulty): boolean {
  return DIFFICULTY[difficulty].revealOnFail && !MINIGAME_STABLE_SEED_STATIONS.includes(kind);
}

export type RoundRules = {
  difficulty: Difficulty;
  timeLimitMs: number;
  revealOnFail: boolean;
};

/** The difficulty props a minigame of `kind` gets for one round. */
export function roundRules(kind: StationKind, difficulty: Difficulty): RoundRules {
  return {
    difficulty,
    timeLimitMs: minigameTimeLimitMs(difficulty),
    revealOnFail: revealsOnFail(kind, difficulty),
  };
}
