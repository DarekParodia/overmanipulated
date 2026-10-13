// The role ability chip (S7-40, design-rules §5): bottom-left on keyboard and gamepad, clear of
// the guidance dock. A 64 px ring with the ability icon (or the seconds while cooling or calling),
// the key cap (R / RB) with the ability's short name, and one status line: „Gotowa”, the press's
// target (a teammate or a station), „Uzbrojona”, „Dzwonię…” or why a press would do nothing.
// Touch players get the fourth thumb button instead (AbilityButton). Bumps when the ability is
// ready again and shakes on a denied press (neither under reduced motion; nothing blinks).
import { useRef } from 'react';
import { playMotion, useHudTrigger } from '../hud/hud-motion.ts';
import { selectCrewMember, useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { isCoarsePointer } from '../scene/quality.ts';
import { abilityKeyCap } from '../screens/settings-model.ts';
import { KeyCap } from '../stations/kit.tsx';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import styles from './AbilityChip.module.css';
import { AbilityRing, RescueBadge } from './AbilityRing.tsx';
import { abilityAriaLabel, abilityChipModel, abilityTargetName } from './ability-model.ts';
import { useLocalAbility } from './use-ability.ts';

export function AbilityChip() {
  const device = useApp((s) => s.inputDevice);
  const playerId = useApp((s) => s.playerId);
  const players = useApp((s) => s.room?.players);
  const ended = useGame((s) => s.levelEnd !== null);
  const stations = useGame((s) => s.stations);
  const rescuesLeft = useGame((s) => selectCrewMember(s, playerId)?.rescuesLeft ?? 0);
  const local = useLocalAbility(runtime);
  const chip = useRef<HTMLDivElement>(null);

  useHudTrigger(['abilityReady', 'abilityDenied'], (trigger, _context, options) => {
    playMotion(chip.current, trigger === 'abilityReady' ? 'bump' : 'shake', options);
  });

  const model = abilityChipModel(local.preview, local.ability, local.elapsedMs);
  if (!model || ended || device === 'touch' || isCoarsePointer()) {
    return null;
  }
  const name = pl.touch.ability[model.ability];
  const target = abilityTargetName(model, {
    player: (id) => players?.find((p) => p.id === id)?.nickname,
    station: (id) => {
      const kind = stations.find((s) => s.id === id)?.kind;
      return kind ? pl.vocab.signs[kind] : undefined;
    },
  });
  const status = target ?? model.label;
  return (
    <div
      ref={chip}
      className={`${styles.chip} ${styles[model.state]}`}
      role="status"
      aria-label={abilityAriaLabel(model, status)}
      data-testid="hud-ability"
      data-state={model.state}
      data-ability={model.ability}
    >
      <AbilityRing model={model} className={styles.ring} iconSize={30} />
      <span className={styles.text} aria-hidden="true">
        <span className={styles.name}>
          <KeyCap>{abilityKeyCap(device === 'gamepad' ? 'gamepad' : 'keyboard')}</KeyCap>
          {name}
        </span>
        <span className={styles.status}>{status}</span>
      </span>
      <RescueBadge role={local.role} rescuesLeft={rescuesLeft} className={styles.rescue} />
    </div>
  );
}
