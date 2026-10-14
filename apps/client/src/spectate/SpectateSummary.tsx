// The spectate screen's first cut (S7-84): a light, canvas-free card with each watched newsroom's
// points and credibility from the spectate store, and a way out. The full spectate screen with
// one canvas per team, follow, feed and stats (S7-90/91) replaces it in the game chunk.
import { useEffect } from 'react';
import { requestMusic } from '../fx/audio/music.ts';
import { leaveRoom } from '../net/session.ts';
import { type SpectateView, spectateViews, useSpectate } from '../net/spectate-store.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './SpectateSummary.module.css';

function TeamRow({ view, versus }: { view: SpectateView; versus: boolean }) {
  const score = view.store((s) => s.score);
  const credibility = view.store((s) => s.credibility);
  const name = versus ? (pl.vocab.teams[view.team] ?? pl.spectate.coopTeam) : pl.spectate.coopTeam;
  return (
    <li
      className={styles.team}
      aria-label={pl.spectate.teamLine(name, score, credibility)}
      data-testid={`spectate-team-${view.team}`}
    >
      <span className={styles.name} aria-hidden="true">
        {name}
      </span>
      <span className={styles.score} aria-hidden="true">
        <Icon name="star" size={22} />
        {score}
      </span>
      <span className={styles.credibility} aria-hidden="true">
        <Icon name="heart" size={22} />
        {credibility}
      </span>
    </li>
  );
}

export function SpectateSummary() {
  const teams = useSpectate((s) => s.teams);
  const versus = useApp((s) => s.room?.mode === 'versus');
  useEffect(() => requestMusic('game'), []);

  return (
    <main className={styles.page} data-testid="spectate-screen">
      <section className={`panel ${styles.card}`} aria-labelledby="spectate-title">
        <h1 id="spectate-title" className={styles.title}>
          <Icon name="eye" size={30} />
          {pl.spectate.watching}
        </h1>
        {teams.length === 0 ? (
          <p className={styles.waiting} role="status">
            {pl.spectate.waiting}
          </p>
        ) : (
          <ul className={styles.teams}>
            {teams.map((team) => {
              const view = spectateViews[team];
              return view ? <TeamRow key={team} view={view} versus={versus} /> : null;
            })}
          </ul>
        )}
        <Button back icon={<Icon name="leave" size={24} />} onClick={leaveRoom}>
          {pl.spectate.leave}
        </Button>
      </section>
    </main>
  );
}
