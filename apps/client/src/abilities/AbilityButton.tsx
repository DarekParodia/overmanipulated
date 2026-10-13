// The fourth thumb button (S7-40, agents/platforms.md): the role ability on touch, in the empty
// grid cell above „Pracuj” (mirrored for left-handed players). The ring round its edge fills as
// the cooldown or a field call runs; inside, the ability icon and its one-word label, or the
// seconds left. Not rendered without a role, so the cell stays empty. Pressable in every state:
// a press that cannot do anything gives the denied feedback (sound, shake) instead of a dead tap.
import { useRef } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { playMotion, useHudTrigger } from '../hud/hud-motion.ts';
import { touchInput } from '../input/input-manager.ts';
import { selectCrewMember, useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { ProgressRing } from '../ui/ProgressRing.tsx';
import styles from './AbilityButton.module.css';
import { ABILITY_RING_TONE, RescueBadge } from './AbilityRing.tsx';
import { ABILITY_ICON } from './ability-icons.ts';
import { abilityAriaLabel, abilityChipModel } from './ability-model.ts';
import { useLocalAbility } from './use-ability.ts';

export function AbilityButton() {
  const playerId = useApp((s) => s.playerId);
  const rescuesLeft = useGame((s) => selectCrewMember(s, playerId)?.rescuesLeft ?? 0);
  const local = useLocalAbility(runtime);
  const button = useRef<HTMLButtonElement>(null);

  useHudTrigger(['abilityReady', 'abilityDenied'], (trigger, _context, options) => {
    playMotion(button.current, trigger === 'abilityReady' ? 'bump' : 'shake', options);
  });

  const model = abilityChipModel(local.preview, local.ability, local.elapsedMs);
  if (!model) {
    return null;
  }
  const label = pl.touch.ability[model.ability];
  const idle = model.state === 'cooling' || model.state === 'blocked' || model.state === 'calling';
  return (
    <button
      ref={button}
      type="button"
      className={`${styles.button} ${styles[model.state]}`}
      aria-label={abilityAriaLabel(model, model.label)}
      aria-disabled={idle || undefined}
      data-testid="touch-ability"
      data-state={model.state}
      data-ability={model.ability}
      onPointerDown={() => {
        // A press that will be sent clicks; a refused one gets only the denied cue.
        if (!idle) {
          emitCue('ui.click');
        }
        touchInput.pressAbility();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ProgressRing
        progress={model.ring}
        tone={ABILITY_RING_TONE[model.state]}
        className={styles.ring}
      >
        {model.seconds !== null ? (
          <span className={styles.seconds}>{model.seconds}</span>
        ) : (
          <>
            <Icon name={ABILITY_ICON[model.ability]} size={24} />
            <span className={styles.label}>{label}</span>
          </>
        )}
      </ProgressRing>
      <RescueBadge role={local.role} rescuesLeft={rescuesLeft} className={styles.rescue} />
    </button>
  );
}
