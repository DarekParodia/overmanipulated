// The ring both the HUD chip and the touch button draw (S7-40): the ability icon, or the whole
// seconds while the ability cools down or a field call runs, inside a ring in the state's tone.
// Koło ratunkowe's badge (S7-43 Ratownik) hangs on the ring while the role has the perk.
import { ROLE_PERKS, type Role } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { ProgressRing, type RingTone } from '../ui/ProgressRing.tsx';
import styles from './AbilityRing.module.css';
import { ABILITY_ICON, RESCUE_ICON } from './ability-icons.ts';
import type { AbilityChipModel, AbilityChipState } from './ability-model.ts';

/** The ring's tone per chip state; blocked shares cooling's grey. */
export const ABILITY_RING_TONE: Record<AbilityChipState, RingTone> = {
  ready: 'ready',
  armed: 'armed',
  calling: 'call',
  cooling: 'cooling',
  blocked: 'cooling',
};

export function AbilityRing({
  model,
  className,
  iconSize,
}: {
  model: AbilityChipModel;
  className?: string | undefined;
  iconSize: number;
}) {
  return (
    <ProgressRing progress={model.ring} tone={ABILITY_RING_TONE[model.state]} className={className}>
      {model.seconds !== null ? (
        <span className={styles.seconds}>{model.seconds}</span>
      ) : (
        <Icon name={ABILITY_ICON[model.ability]} size={iconSize} />
      )}
    </ProgressRing>
  );
}

/** Koło ratunkowe: a lifebuoy with the rescues left, greyed out once used; null without it. */
export function RescueBadge({
  role,
  rescuesLeft,
  className,
}: {
  role: Role | null;
  rescuesLeft: number;
  className?: string | undefined;
}) {
  if (!role || ROLE_PERKS[role].rescuesPerLevel <= 0) {
    return null;
  }
  const used = rescuesLeft <= 0;
  return (
    <span
      className={`${styles.rescue} ${used ? styles.rescueUsed : ''} ${className ?? ''}`}
      role="img"
      aria-label={used ? pl.hud.ability.rescueUsed : pl.hud.ability.rescueReady}
      data-testid="ability-rescue"
      data-left={rescuesLeft}
    >
      <Icon name={RESCUE_ICON} size={18} />
      <span aria-hidden="true">{rescuesLeft}</span>
    </span>
  );
}
