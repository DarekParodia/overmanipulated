// The icon of each role ability (S7-40): the HUD chip, the touch button and the captions draw
// the same picture for the same ability.
import type { Ability } from '@redakcja/shared';
import type { IconName } from '../ui/icons/Icon.tsx';

export const ABILITY_ICON = {
  expertise: 'bolt',
  fieldCall: 'phone',
  extendDeadline: 'hourglass',
  secondChance: 'retry',
  passFolder: 'pass',
} as const satisfies Record<Ability, IconName>;

/** The passive Koło ratunkowe's badge next to the chip or the touch button. */
export const RESCUE_ICON: IconName = 'lifebuoy';
