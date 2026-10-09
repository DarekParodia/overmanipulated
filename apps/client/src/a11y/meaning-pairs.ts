// The pairs of colours the game uses for different meanings, and the non-colour signal that
// keeps them apart (agents/design-rules.md: colour is never the only channel). The colour-blind
// test requires every pair either to stay distinguishable under protanopia, deuteranopia and
// tritanopia, or to name its redundant channel here.
import { colors, playerColors } from '../ui/tokens.ts';

export type MeaningPair = {
  id: string;
  /** What the two colours mean in the game. */
  meaning: string;
  a: string;
  b: string;
  /** The non-colour signal that carries the difference; required when colours collapse. */
  redundancy: string;
};

export const meaningPairs: readonly MeaningPair[] = [
  {
    id: 'true-false',
    meaning: 'green (publish, true, success) vs red (reject, false, danger)',
    a: colors.green,
    b: colors.red,
    redundancy:
      'icons check / cross, stamp shapes, the words „Publikuj” / „Odrzuć”, verdict toast text',
  },
  {
    id: 'context-action',
    meaning: 'orange (publish with context, warning) vs yellow (the one main action)',
    a: colors.orange,
    b: colors.yellow,
    redundancy:
      'yellow is always a big outlined button with a label; orange is always a badge with an icon',
  },
  {
    id: 'info-hint',
    meaning: 'blue (information, selection) vs purple (hints, tutorial)',
    a: colors.blue,
    b: colors.purple,
    redundancy: 'hints carry the lightbulb icon and sit in the guidance dock',
  },
  {
    id: 'success-warning',
    meaning: 'green (ready, success) vs orange (warning, outage)',
    a: colors.green,
    b: colors.orange,
    redundancy: 'check vs bolt / hourglass icons and the words on every badge',
  },
  {
    id: 'danger-warning',
    meaning: 'red (danger, urgent) vs orange (warning, important)',
    a: colors.red,
    b: colors.orange,
    redundancy: 'priority flags count 3 vs 2; banners differ by icon (siren / phone vs bot / bolt)',
  },
  {
    id: 'priority-normal-important',
    meaning: 'blue (normal priority) vs orange (important priority)',
    a: colors.blue,
    b: colors.orange,
    redundancy: 'priority flags: one vs two vs three',
  },
  {
    id: 'priority-normal-urgent',
    meaning: 'blue (normal priority) vs red (urgent priority)',
    a: colors.blue,
    b: colors.red,
    redundancy: 'priority flags: one vs three',
  },
  ...playerColors.flatMap((a, i) =>
    playerColors.slice(i + 1).map((b, k) => ({
      id: `player-${i}-${i + 1 + k}`,
      meaning: `player colour ${i} vs ${i + 1 + k}`,
      a,
      b,
      redundancy: 'nickname on the name tag plus a circle / square / triangle / diamond mark',
    })),
  ),
];
