// Endless-mode leaderboard (S4-11): a segmented room / global switch over big readable rows
// (rank, crew, score, survived time). Loading, empty and error each have their own look; this
// crew's own run, when known, is outlined in blue and tagged „To wy”.
import { useId, useMemo, useState } from 'react';
import { formatScore } from '../hud/hud-model.ts';
import type { EndlessRun } from '../store/progress.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { findOwnRun, formatPlayers, formatSurvived } from './endless-model.ts';
import styles from './Leaderboard.module.css';
import { type LeaderboardScope, useLeaderboard } from './use-leaderboard.ts';

export type OwnRun = EndlessRun & { roomCode: string };

/** A pill switch; every option is a real button (keyboard, gamepad and touch alike). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string; icon?: 'folder' | 'trophy' | 'globe' | 'user' }[];
  onChange(id: T): void;
}) {
  return (
    <fieldset className={styles.segmented}>
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`${styles.segment} ${option.id === value ? styles.segmentOn : ''}`}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.icon && <Icon name={option.icon} size={22} />}
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

/** One scope's list with its loading / empty / error states. */
export function LeaderboardList({
  scope,
  roomCode,
  own,
}: {
  scope: LeaderboardScope;
  roomCode: string | null;
  own?: OwnRun | null;
}) {
  const board = useLeaderboard(scope, roomCode, own);
  const ownIndex = useMemo(() => (own ? findOwnRun(board.entries, own) : -1), [board.entries, own]);

  if (board.status === 'loading') {
    return (
      <p className={styles.state} role="status">
        <Icon name="hourglass" size={32} />
        {pl.leaderboard.loading}
      </p>
    );
  }
  if (board.status === 'error') {
    return (
      <div className={styles.state} role="alert">
        <p className={styles.stateLine}>
          <Icon name="cross" size={32} />
          {pl.leaderboard.error}
        </p>
        <Button onClick={board.retry}>{pl.leaderboard.retry}</Button>
      </div>
    );
  }
  if (board.entries.length === 0) {
    return (
      <p className={styles.state}>
        <Icon name="trophy" size={32} />
        {pl.leaderboard.empty}
      </p>
    );
  }
  return (
    <ol className={styles.list} aria-label={pl.leaderboard.listLabel(scope)}>
      {board.entries.map((entry, index) => {
        const mine = index === ownIndex;
        const players = formatPlayers(entry.players);
        const score = formatScore(entry.score);
        const time = formatSurvived(entry.survivedS);
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: ranks are positional
            key={index}
            className={`${styles.row} ${mine ? styles.mine : ''}`}
            data-own={mine ? 'true' : undefined}
            aria-label={pl.leaderboard.row(index + 1, players, score, time)}
          >
            <span
              className={`${styles.rank} ${index === 0 ? styles.first : ''}`}
              aria-hidden="true"
            >
              {index === 0 ? <Icon name="trophy" size={26} /> : index + 1}
            </span>
            <span className={styles.crew} aria-hidden="true">
              <span className={styles.players}>{players}</span>
              {mine && (
                <span className={styles.you}>
                  <Icon name="user" size={18} />
                  {pl.leaderboard.you}
                </span>
              )}
            </span>
            <span className={styles.score} aria-hidden="true">
              {score}
            </span>
            <span className={styles.time} aria-hidden="true">
              <Icon name="clock" size={20} />
              {time}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Room and global tabs in one block (the lobby dialog). */
export function Leaderboard({
  roomCode,
  initialScope = 'room',
}: {
  roomCode: string | null;
  initialScope?: LeaderboardScope;
}) {
  const [scope, setScope] = useState<LeaderboardScope>(initialScope);
  const labelId = useId();
  return (
    <section className={styles.board} aria-labelledby={labelId}>
      <h2 id={labelId} className="visually-hidden">
        {pl.leaderboard.title}
      </h2>
      <Segmented<LeaderboardScope>
        label={pl.leaderboard.scopeLabel}
        value={scope}
        onChange={setScope}
        options={[
          { id: 'room', label: pl.leaderboard.room, icon: 'user' },
          { id: 'global', label: pl.leaderboard.global, icon: 'globe' },
        ]}
      />
      <LeaderboardList key={scope} scope={scope} roomCode={roomCode} />
    </section>
  );
}
