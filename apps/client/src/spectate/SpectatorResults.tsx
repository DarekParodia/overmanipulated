// The spectator results (S7-91), once every watched newsroom's `levelEnd` is in: who won (versus:
// the winner or a draw, with the reason said of the newsrooms by name; co-op: the edition went to
// print or not), a card per newsroom (points, credibility, folders closed with a verdict), each
// player's final figures (`levelEnd.stats`) and the Kolegium, read-only (no blunder vote), one
// newsroom at a time in versus (Segmented). No stars, progress or leaderboard. Beside the figures,
// on a big enough screen, the spectator ad unit (AdSlot decides whether ads are on). ←/→ (d-pad)
// walk the Kolegium cards, Q / Y switch the newsroom.
import { getStory } from '@redakcja/content';
import {
  ENDLESS_LEVEL_ID,
  type LevelEndMessage,
  type LobbyPlayer,
  type PlayerStats,
  type TeamIndex,
} from '@redakcja/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { AdSlot } from '../ads/AdSlot.tsx';
import { Kolegium, useBlunderVotes } from '../debrief/Kolegium.tsx';
import { kolegiumCards, lossReasonOf } from '../debrief/results-model.ts';
import { PHONE_QUERY, useMediaQuery } from '../debrief/use-media-query.ts';
import { Segmented } from '../endless/Leaderboard.tsx';
import { emitCue } from '../fx/feedback.ts';
import { HudGlyph } from '../hud/HudGlyph.tsx';
import { formatScore } from '../hud/hud-model.ts';
import { hudStory } from '../hud/story-lookup.ts';
import { useNavIntent } from '../input/ui-nav.ts';
import { teamView } from '../net/spectate-store.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { TeamBadge, teamName } from '../ui/TeamBadge.tsx';
import styles from './SpectatePanels.module.css';
import { StatsTables } from './StatsTables.tsx';
import { statsTeams } from './stats-model.ts';

const NO_PLAYERS: readonly LobbyPlayer[] = [];

/** Content story for the debrief; dev-fixture stories only have a headline. */
function debriefStory(storyId: string) {
  return getStory(storyId) ?? hudStory(storyId);
}

type Ribbon = { tone: 'won' | 'lost' | 'draw'; headline: string; lede: string };

/** The ribbon: versus from nobody's side, co-op as the newsroom's own result. */
export function spectatorRibbon(ends: readonly LevelEndMessage[]): Ribbon {
  const [first] = ends;
  const versus = first?.versus;
  if (versus) {
    const winner = versus.winnerTeam;
    if (winner === null) {
      return { tone: 'draw', headline: pl.spectate.results.draw, lede: pl.versus.reasons.draw };
    }
    const loser: TeamIndex = winner === 0 ? 1 : 0;
    const named = versus.reason === 'score' ? teamName(winner) : teamName(loser);
    return {
      tone: 'won',
      headline: pl.spectate.results.winner(teamName(winner)),
      lede: pl.spectate.results.reasons[versus.reason](named),
    };
  }
  if (!first) {
    return { tone: 'draw', headline: pl.spectate.matchOver, lede: '' };
  }
  return first.won
    ? { tone: 'won', headline: pl.results.wonHeadline, lede: pl.results.lede.won }
    : {
        tone: 'lost',
        headline: pl.results.lostHeadline,
        lede: pl.results.lede[lossReasonOf(first) ?? 'credibility'],
      };
}

/** Every player's final counters, from whichever newsroom's level end carries them. */
function finalStats(ends: readonly LevelEndMessage[]): PlayerStats[] {
  const byPlayer = new Map<string, PlayerStats>();
  for (const end of ends) {
    for (const stats of end.stats ?? []) {
      byPlayer.set(stats.playerId, stats);
    }
  }
  return [...byPlayer.values()];
}

function TeamCard({
  end,
  team,
  versus,
  winner,
}: {
  end: LevelEndMessage;
  team: TeamIndex;
  versus: boolean;
  winner: boolean;
}) {
  const standing = end.versus?.teams.find((entry) => entry.team === team);
  const resolved =
    standing?.resolved ?? end.results.filter((result) => result.verdict !== null).length;
  return (
    <li
      className={`${styles.teamCard} ${winner ? styles.teamWinner : ''}`}
      data-testid={`spectator-team-${team}`}
      data-winner={winner || undefined}
    >
      <div className={styles.teamCardHead}>
        {versus ? <TeamBadge team={team} size={30} /> : <Icon name="eye" size={26} />}
        <span className={styles.teamCardName}>
          {versus ? teamName(team) : pl.spectate.coopTeam}
        </span>
        {winner && (
          <span className={styles.crown}>
            <Icon name="crown" size={24} label={pl.versus.winner} />
          </span>
        )}
      </div>
      <dl className={styles.figures}>
        <div className={styles.figure}>
          <dt>
            <HudGlyph name="star" size={22} fill="var(--yellow)" label={pl.results.score} />
          </dt>
          <dd>{formatScore(end.score)}</dd>
        </div>
        <div className={styles.figure}>
          <dt>
            <HudGlyph
              name="shield"
              size={22}
              fill={end.credibility > 0 ? 'var(--green)' : 'var(--red)'}
              label={pl.results.credibility}
            />
          </dt>
          <dd>{end.credibility}</dd>
        </div>
        <div className={styles.figure}>
          <dt>
            <Icon name="folder" size={22} label={pl.versus.resolved} />
          </dt>
          <dd>{resolved}</dd>
        </div>
      </dl>
    </li>
  );
}

export function SpectatorResults({
  teams,
  versus,
  ends,
}: {
  teams: readonly TeamIndex[];
  versus: boolean;
  /** Each watched newsroom's level end, in `teams` order. */
  ends: readonly LevelEndMessage[];
}) {
  const roster = useApp((s) => s.room?.players ?? NO_PLAYERS);
  const phone = useMediaQuery(PHONE_QUERY);
  const [team, setTeam] = useState<TeamIndex>(teams[0] ?? 0);
  const [current, setCurrent] = useState(0);
  const votes = useBlunderVotes();
  const ribbon = spectatorRibbon(ends);
  const winnerTeam = ends[0]?.versus?.winnerTeam ?? null;
  const shownEnd = ends.find((end) => (end.team ?? 0) === team) ?? ends[0];
  const levelStations = useStore(teamView(team).store, (s) => s.stations);
  const cards = useMemo(() => {
    if (!shownEnd) {
      return [];
    }
    const endless = shownEnd.levelId === ENDLESS_LEVEL_ID && !shownEnd.versus;
    return kolegiumCards(
      shownEnd.results,
      debriefStory,
      endless ? 'story' : 'folder',
      levelStations.map((station) => station.kind),
    );
  }, [shownEnd, levelStations]);
  const groups = useMemo(() => statsTeams(teams, roster, finalStats(ends)), [teams, roster, ends]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new newsroom starts at its first card.
  useEffect(() => setCurrent(0), [team]);
  // The Kolegium scrolls its first card into view on mount, which on a short screen hides the
  // ribbon; the results open at the top, on who won (this runs after the child's effect).
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.scrollTo({ top: 0 });
  }, []);

  const switchTeam = (next: TeamIndex) => {
    if (next !== team) {
      emitCue('ui.click');
      setTeam(next);
    }
  };
  const step = (direction: 1 | -1) =>
    setCurrent((index) => Math.max(0, Math.min(cards.length - 1, index + direction)));

  // ←/→ (d-pad) walk the cards and Q / Y switch the newsroom; ↑/↓, A and B stay with the menu
  // navigation (the buttons).
  useNavIntent((intent) => {
    if (intent === 'left' || intent === 'right') {
      step(intent === 'right' ? 1 : -1);
      return true;
    }
    if (intent === 'alt' && teams.length > 1) {
      switchTeam(teams.find((entry) => entry !== team) ?? team);
      return true;
    }
    return false;
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector('dialog[open]')
      ) {
        return;
      }
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault();
        step(event.code === 'ArrowRight' ? 1 : -1);
      } else if (event.code === 'KeyQ' && teams.length > 1 && !event.repeat) {
        event.preventDefault();
        switchTeam(teams.find((entry) => entry !== team) ?? team);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section
      ref={root}
      className={styles.results}
      aria-labelledby="spectator-results-title"
      data-testid="spectator-results"
    >
      <header className={`${styles.ribbon} ${styles[ribbon.tone]}`} data-tone={ribbon.tone}>
        <span className={styles.ribbonDisc}>
          <Icon
            name={ribbon.tone === 'draw' ? 'equal' : ribbon.tone === 'won' ? 'trophy' : 'reject'}
            size={34}
          />
        </span>
        <div>
          <h1 id="spectator-results-title" className={styles.ribbonTitle}>
            {ribbon.headline}
          </h1>
          {ribbon.lede && <p className={styles.ribbonLede}>{typeset(ribbon.lede)}</p>}
        </div>
      </header>
      <div className={styles.resultsBody}>
        <div className={styles.resultsMain}>
          <ul className={styles.teamCards} aria-label={pl.spectate.results.teamsLabel}>
            {ends.map((end) => {
              const endTeam = end.team ?? 0;
              return (
                <TeamCard
                  key={endTeam}
                  end={end}
                  team={endTeam}
                  versus={versus}
                  winner={versus && winnerTeam === endTeam}
                />
              );
            })}
          </ul>
          <h2 className={styles.resultsHeading}>{pl.spectate.results.statsTitle}</h2>
          <StatsTables groups={groups} versus={versus} />
          {!phone && <AdSlot placement="spectator" className={styles.resultsAd} />}
        </div>
        <section className={styles.resultsKolegium} aria-label={pl.debrief.title}>
          <div className={styles.kolegiumHead}>
            <h2 className={styles.resultsHeading}>{pl.spectate.results.kolegiumTitle}</h2>
            {versus && (
              <Segmented
                label={pl.spectate.results.kolegiumTabs}
                value={String(team)}
                options={teams.map((entry) => ({ id: String(entry), label: teamName(entry) }))}
                onChange={(id) => switchTeam(Number(id) === 1 ? 1 : 0)}
                lead="folder"
                testId="spectator-kolegium-team"
              />
            )}
          </div>
          <Kolegium
            cards={cards}
            paged={false}
            current={current}
            onCurrent={setCurrent}
            marked={() => true}
            instant
            voteKey={null}
            votes={votes}
            readOnly
          />
        </section>
      </div>
    </section>
  );
}
