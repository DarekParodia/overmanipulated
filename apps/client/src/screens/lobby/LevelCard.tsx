// The level section of the lobby. The host sees the campaign map (S3-04): a path of big level
// tiles — number (or „Trening”), title, best stars from this browser or a lock — and picks one
// (native radios under the tiles). Guests see the chosen level read-only: title plus chips
// (minutes, folders, and the room's difficulty, which the host picks next to the card, S7-25).
// The folder count is the dealt run's when there is one, else what the room's difficulty deals.
import { getLevel, LEVELS } from '@redakcja/content';
import { type Difficulty, ENDLESS_LEVEL_ID } from '@redakcja/shared';
import { useId } from 'react';
import { endlessUnlocked } from '../../endless/endless-model.ts';
import { emitCue } from '../../fx/feedback.ts';
import { campaignTiles, useEndlessBest, useProgress } from '../../store/progress.ts';
import { pl } from '../../strings/pl.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import styles from './LevelCard.module.css';
import { levelCardFolders } from './level-card-model.ts';

export type LevelCardProps = {
  levelId: string;
  difficulty: Difficulty;
  /** Folders of the dealt run (`roomState.run`); null counts what `difficulty` deals. */
  runFolders: number | null;
  isHost: boolean;
  onSelect(levelId: string): void;
  disabled?: boolean;
};

const STAR_SLOTS = [0, 1, 2] as const;

function keepInView(tile: HTMLElement | null): void {
  tile?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

export function LevelCard({
  levelId,
  difficulty,
  runFolders,
  isHost,
  onSelect,
  disabled = false,
}: LevelCardProps) {
  const groupName = useId();
  const best = useProgress((s) => s.best);
  const endlessBest = useEndlessBest((s) => s.best);
  const endless = levelId === ENDLESS_LEVEL_ID;
  const level = getLevel(levelId);
  // Guests cannot change the difficulty, so they read it here; the host has the picker.
  const difficultyChip = !isHost && (
    // Keyed by the difficulty, so the chip pops again when the host picks another one.
    <span
      key={difficulty}
      className={`${styles.chip} ${styles.difficultyChip}`}
      data-testid="difficulty-chip"
    >
      <Icon name="gauge" size={22} />
      {pl.difficulty.chip(pl.difficulty.names[difficulty])}
    </span>
  );
  const chips = endless ? (
    <p className={styles.chips}>
      <span className={styles.chip}>
        <Icon name="infinity" size={22} />
        {pl.endless.pitch}
      </span>
      {difficultyChip}
    </p>
  ) : (
    level && (
      <p className={styles.chips}>
        <span className={styles.chip}>
          <Icon name="clock" size={22} />
          {pl.lobbyRoles.levelMinutes(Math.round(level.durationS / 60))}
        </span>
        <span className={styles.chip} data-testid="level-folders">
          <Icon name="article" size={22} />
          {pl.lobbyRoles.levelFolders(levelCardFolders(level, difficulty, runFolders))}
        </span>
        {difficultyChip}
      </p>
    )
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
          {endless ? pl.endless.title : (level?.title ?? levelId)}
        </h2>
        {chips}
        <p className={styles.hostOnly}>{pl.lobbyRoles.levelHostOnly}</p>
      </section>
    );
  }

  const tiles = campaignTiles(LEVELS, best);
  const endlessLocked = !endlessUnlocked(LEVELS, best);
  const endlessScore = endlessBest ? String(endlessBest.score) : null;
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
        <label
          className={`${styles.tile} ${styles.endlessTile} ${endless ? styles.current : ''} ${endlessLocked ? styles.locked : ''}`}
          data-testid={`level-tile-${ENDLESS_LEVEL_ID}`}
          ref={endless ? keepInView : undefined}
        >
          <input
            type="radio"
            name={groupName}
            className={styles.native}
            checked={endless}
            disabled={endlessLocked}
            aria-label={pl.endless.tileLabel(endlessScore, endlessLocked)}
            onChange={() => {
              emitCue('ui.click');
              onSelect(ENDLESS_LEVEL_ID);
            }}
          />
          <span className={styles.badge} aria-hidden="true">
            <Icon name="infinity" size={28} />
          </span>
          <span className={styles.tileTitle} aria-hidden="true">
            {pl.endless.title}
          </span>
          {endlessLocked ? (
            <span className={styles.lock} aria-hidden="true">
              <Icon name="lock" size={22} />
              {pl.campaign.locked}
            </span>
          ) : (
            <span className={styles.lock} aria-hidden="true">
              <Icon name="trophy" size={22} />
              {endlessBest ? endlessBest.score : pl.endless.tileHint}
            </span>
          )}
        </label>
      </fieldset>
    </section>
  );
}
