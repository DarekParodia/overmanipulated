// The chosen level: title plus two chips (minutes, folders). With more than one level the host
// picks it from pill buttons (native radios); guests just see the choice.
import { getLevel, LEVELS } from '@redakcja/content';
import { useId } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { pl } from '../../strings/pl.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import styles from './LevelCard.module.css';

export type LevelCardProps = {
  levelId: string;
  isHost: boolean;
  onSelect(levelId: string): void;
  disabled?: boolean;
};

export function LevelCard({ levelId, isHost, onSelect, disabled = false }: LevelCardProps) {
  const groupName = useId();
  const level = getLevel(levelId);
  const choice = LEVELS.length > 1;
  return (
    <section
      className={`panel ${styles.card}`}
      aria-labelledby={`${groupName}-title`}
      data-testid="level-card"
    >
      <p className={styles.kicker}>{pl.lobbyRoles.levelKicker}</p>
      <h2 id={`${groupName}-title`} className={styles.title}>
        {level?.title ?? levelId}
      </h2>
      {level && (
        <p className={styles.chips}>
          <span className={styles.chip}>
            <Icon name="clock" size={22} />
            {pl.lobbyRoles.levelMinutes(Math.round(level.durationS / 60))}
          </span>
          <span className={styles.chip}>
            <Icon name="article" size={22} />
            {pl.lobbyRoles.levelFolders(level.schedule.length)}
          </span>
        </p>
      )}
      {choice && isHost && (
        <fieldset className={styles.options} disabled={disabled}>
          <legend className="visually-hidden">{pl.lobbyRoles.levelPick}</legend>
          {LEVELS.map((option) => (
            <label
              key={option.id}
              className={`${styles.option} ${option.id === levelId ? styles.current : ''}`}
            >
              <input
                type="radio"
                name={groupName}
                className={styles.native}
                checked={option.id === levelId}
                onChange={() => {
                  emitCue('ui.click');
                  onSelect(option.id);
                }}
              />
              {option.title}
            </label>
          ))}
        </fieldset>
      )}
      {choice && !isHost && <p className={styles.hostOnly}>{pl.lobbyRoles.levelHostOnly}</p>}
    </section>
  );
}
