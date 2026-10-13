// The Kolegium card's one-line reason (S7-07): why the folder ended that way and what it paid,
// e.g. „Trafny werdykt: +20 pkt · tempo +5”. A story grouped in endless lists its folders per
// outcome instead („Dobrze ×2 · Błędny werdykt ×1”). Pure, so every reason is unit-tested.
import { type FolderBonuses, folderOutcomeSchema } from '@redakcja/shared';
import { formatDelta } from '../hud/hud-model.ts';
import { pl } from '../strings/pl.ts';
import type { KolegiumCard } from './results-model.ts';

const BONUS_ORDER = [
  'speed',
  'multiStamp',
  'bossCall',
] as const satisfies readonly (keyof FolderBonuses)[];

export type CardWhyInput = Pick<
  KolegiumCard,
  | 'reason'
  | 'scoreDelta'
  | 'bonuses'
  | 'requiredStamps'
  | 'citedProofs'
  | 'hintStations'
  | 'count'
  | 'tally'
>;

/** The reason line of a card; bonus suffixes follow, joined with „ · ”. */
export function cardWhy(card: CardWhyInput): string {
  const bonuses = BONUS_ORDER.flatMap((kind) =>
    card.bonuses[kind] > 0 ? [pl.outcome.bonus[kind](formatDelta(card.bonuses[kind]))] : [],
  );
  return [reasonPart(card), ...bonuses].join(' · ');
}

function reasonPart(card: CardWhyInput): string {
  if (card.count > 1) {
    return folderOutcomeSchema.options
      .flatMap((outcome) =>
        card.tally[outcome] > 0
          ? [pl.outcome.whyGroup(pl.outcome.group[outcome], card.tally[outcome])]
          : [],
      )
      .join(' · ');
  }
  if (card.reason === 'incompleteProof') {
    if (card.hintStations.length > 0) {
      return pl.outcome.whyHintOnly(card.hintStations.map((s) => pl.vocab.stations[s]));
    }
    if (card.requiredStamps > 1) {
      return pl.outcome.whyTooFew(card.citedProofs, card.requiredStamps);
    }
  }
  const { speed, multiStamp, bossCall } = card.bonuses;
  return pl.outcome.why[card.reason](formatDelta(card.scoreDelta - speed - multiStamp - bossCall));
}
