// The level section of the lobby. The host sees the campaign map (S3-04): a path of big level
// tiles — number (or „Trening”), title, best stars from this browser or a lock — and picks one
// (native radios under the tiles). Guests see the chosen level read-only: title plus two chips
// (minutes, folders).
import { getLevel, LEVELS } from '@redakcja/content';
import { useId } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { campaignTiles, useProgress } from '../../store/progress.ts';
import { pl } from '../../strings/pl.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import styles from './LevelCard.module.css';

export type LevelCardProps = {
  levelId: string;
  isHost: boolean;
  onSelect(levelId: string): void;
  disabled?: boolean;
};

const STAR_SLOTS = [0, 1, 2] as const;

function keepInView(tile: HTMLElement | null): void {
  tile?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

export function LevelCard({ levelId, isHost, onSelect, disabled = false }: LevelCardProps) {
  const groupName = useId();
  const best = useProgress((s) => s.best);
  const level = getLevel(levelId);
  const chips = level && (
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
  );

  if (!isHost) {
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
        {chips}
        {LEVELS.length > 1 && <p className={styles.hostOnly}>{pl.lobbyRoles.levelHostOnly}</p>}
      </section>
    );
  }

  const tiles = campaignTiles(LEVELS, best);
  return (
    <section
      className={`panel ${styles.card} ${styles.map}`}
      aria-labelledby={`${groupName}-title`}
      data-testid="level-card"
    >
      <h2 id={`${groupName}-title`} className={styles.mapTitle}>
        {pl.campaign.title}
      </h2>
      {chips}
      <fieldset className={styles.path} disabled={disabled}>
        <legend className="visually-hidden">{pl.lobbyRoles.levelPick}</legend>
        {tiles.map((tile) => {
          const current = tile.level.id === levelId;
          const badge = tile.training ? pl.campaign.training : String(tile.number);
          const locked = !tile.unlocked;
          return (
            <label
              key={tile.level.id}
              className={`${styles.tile} ${current ? styles.current : ''} ${locked ? styles.locked : ''}`}
              data-testid={`level-tile-${tile.level.id}`}
              // Keep the chosen tile in view when the campaign is wider than the card.
              ref={current ? keepInView : undefined}
            >
              <input
                type="radio"
                name={groupName}
                className={styles.native}
                checked={current}
                disabled={locked}
                aria-label={pl.campaign.tileLabel(tile.level.title, badge, tile.stars, locked)}
                onChange={() => {
                  emitCue('ui.click');
                  onSelect(tile.level.id);
                }}
              />
              <span
                className={`${styles.badge} ${tile.training ? styles.badgeWord : ''}`}
                aria-hidden="true"
              >
                {badge}
              </span>
              <span className={styles.tileTitle} aria-hidden="true">
                {tile.level.title}
              </span>
              {locked ? (
                <span className={styles.lock} aria-hidden="true">
                  <Icon name="lock" size={22} />
                  {pl.campaign.locked}
                </span>
              ) : (
                <span className={styles.stars} aria-hidden="true">
                  {STAR_SLOTS.map((slot) => (
                    <Icon
                      key={slot}
                      name="star"
                      size={22}
                      className={`${slot < tile.stars ? styles.starOn : styles.starOff}`}
                    />
                  ))}
                </span>
              )}
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}
