// The FollowCard (S7-91): what the followed player is up to, inside their newsroom's view. Their
// mark and nickname, a status line (carrying, a station's progress or task, a lockout, the desk)
// and the folder they handle: its headline and its stamps as station icons only. It never shows
// what a stamp says, the story's truth or a verdict, so it gives the embargo nothing away.
import { getStory } from '@redakcja/content';
import type { LobbyPlayer } from '@redakcja/shared';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { hudStory } from '../hud/story-lookup.ts';
import type { SpectateView } from '../net/spectate-store.ts';
import { STATION_ICON } from '../stations/kit.tsx';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { PlayerMark } from '../ui/PlayerMark.tsx';
import { type FollowActivity, followCard, stampStations } from './follow-model.ts';
import styles from './SpectatePanels.module.css';

function statusLine(activity: FollowActivity): string {
  const t = pl.spectate.follow.status;
  switch (activity.kind) {
    case 'working':
      return t.working(pl.vocab.stations[activity.station], activity.percent);
    case 'minigame':
      return t.minigame(pl.vocab.stations[activity.station]);
    case 'lockout':
      return t.lockout(activity.seconds);
    case 'desk':
      return t.desk;
    case 'carrying':
      return t.carrying;
    case 'idle':
      return t.idle;
  }
}

export function FollowCard({
  view,
  player,
  onStop,
}: {
  view: SpectateView;
  player: LobbyPlayer;
  onStop: () => void;
}) {
  const folders = useStore(view.store, (s) => s.folders);
  const stations = useStore(view.store, (s) => s.stations);
  const desks = useStore(view.store, (s) => s.desks);
  const card = useMemo(
    () => followCard({ folders, stations, desks }, player.id),
    [folders, stations, desks, player.id],
  );
  const folder = card.folder;
  const story = folder ? getStory(folder.storyId) : undefined;
  const headline = folder ? (hudStory(folder.storyId)?.headline ?? pl.hud.untitled) : null;
  const stamps = folder ? stampStations(folder.stamps, story?.stamps ?? []) : [];
  const station = 'station' in card.activity ? card.activity.station : null;

  return (
    <section
      className={styles.followCard}
      aria-label={pl.spectate.follow.following(player.nickname)}
      data-testid="follow-card"
      data-player={player.id}
      data-activity={card.activity.kind}
    >
      <header className={styles.followHead}>
        <PlayerMark colorIndex={player.colorIndex} size={20} />
        <span className={styles.followName}>{pl.spectate.follow.following(player.nickname)}</span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={pl.spectate.follow.stop}
          data-testid="follow-stop"
          onClick={onStop}
        >
          <Icon name="close" size={20} />
        </button>
      </header>
      <p className={styles.followStatus}>
        {station && <Icon name={STATION_ICON[station]} size={20} />}
        {typeset(statusLine(card.activity))}
      </p>
      {headline !== null && (
        <div className={styles.followFolder}>
          <Icon name="folder" size={20} />
          <span className={styles.followHeadline}>{typeset(headline)}</span>
          <span
            className={styles.followStamps}
            role="img"
            aria-label={
              stamps.length > 0
                ? pl.spectate.follow.stamps(
                    stamps.map((kind) => pl.vocab.stations[kind]).join(', '),
                  )
                : pl.spectate.follow.noStamps
            }
            data-testid="follow-stamps"
            data-count={stamps.length}
          >
            {stamps.map((kind, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stamps keep their order.
              <span key={index} className={styles.stampIcon}>
                <Icon name={STATION_ICON[kind]} size={18} />
              </span>
            ))}
          </span>
        </div>
      )}
    </section>
  );
}
