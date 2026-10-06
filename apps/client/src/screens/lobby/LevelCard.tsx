// Today's edition: a typed briefing slip pinned under the room code. The host flips through
// the editions on manila index tabs (native radios); guests read the chosen one.
import { getLevel, LEVELS } from '@redakcja/content';
import { useId } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { pl } from '../../strings/pl.ts';
import { bindOrphans } from '../../strings/typography.ts';
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
  return (
    <section
      className={styles.card}
      aria-labelledby={`${groupName}-title`}
      data-testid="level-card"
    >
      <span className={styles.pin} aria-hidden="true" />
      <p className="label">{pl.lobbyRoles.levelKicker}</p>
      {isHost && (
        <fieldset className={styles.tabs} disabled={disabled}>
          <legend className="visually-hidden">{pl.lobbyRoles.levelPick}</legend>
          {LEVELS.map((option) => (
            <label
              key={option.id}
              className={`${styles.tab} ${option.id === levelId ? styles.current : ''}`}
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
      <h2 id={`${groupName}-title`} className={styles.title}>
        {level?.title ?? levelId}
      </h2>
      {level && (
        <>
          <p className={styles.meta}>
            {pl.lobbyRoles.levelMeta(Math.round(level.durationS / 60), level.schedule.length)}
          </p>
          <p className={styles.briefing}>{bindOrphans(level.briefing)}</p>
          <p className={styles.stations}>
            <span className="label">{pl.lobbyRoles.levelStations}</span>{' '}
            {level.stations.map((station) => pl.vocab.stations[station]).join(', ')}
          </p>
        </>
      )}
      {!isHost && <p className={styles.hostOnly}>{pl.lobbyRoles.levelHostOnly}</p>}
    </section>
  );
}
