// The Widownia's event feed (S7-91): the newest rows of `useSpectate().feed` (feed-model.ts), the
// spectators' visual twin of every sound they hear, so spectators get no captions. A masked
// versus result names only the newsroom; its row turns into the full one (verdict, points) once
// the embargo reveals it. A new row plays `spectate.feed` and slides in (`feedPop`; a fade under
// reduced motion).
import type { LobbyPlayer, TeamIndex } from '@redakcja/shared';
import { useEffect, useRef, useState } from 'react';
import { ABILITY_ICON, RESCUE_ICON } from '../abilities/ability-icons.ts';
import { EVENT_ICON } from '../events/event-model.ts';
import { emitCue, feedback } from '../fx/feedback.ts';
import { formatDelta } from '../hud/hud-model.ts';
import { useSpectate } from '../net/spectate-store.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import { TeamBadge } from '../ui/TeamBadge.tsx';
import type { FeedItem, FeedTone } from './feed-model.ts';
import styles from './SpectatePanels.module.css';

const NO_PLAYERS: readonly LobbyPlayer[] = [];

const TONE_ICON = {
  correct: 'check',
  weak: 'question',
  wrong: 'cross',
  blunder: 'blunder',
} as const satisfies Record<FeedTone, IconName>;

type Tone = 'good' | 'warn' | 'bad' | 'plain';

const TONE_CLASS: Record<FeedTone, Tone> = {
  correct: 'good',
  weak: 'warn',
  wrong: 'bad',
  blunder: 'bad',
};

type Row = { icon: IconName; text: string; tone: Tone; points: number | null };

function nicknameOf(roster: readonly LobbyPlayer[], playerId: string | null): string {
  return roster.find((player) => player.id === playerId)?.nickname ?? pl.spectate.feed.someone;
}

function teamLabel(team: TeamIndex): string {
  return pl.vocab.teams[team] ?? pl.spectate.coopTeam;
}

/** What one feed row says: never a verdict, outcome or points for a masked result. */
export function feedRow(item: FeedItem, roster: readonly LobbyPlayer[]): Row {
  const t = pl.spectate.feed;
  switch (item.kind) {
    case 'masked':
      return {
        icon: 'folder',
        text:
          item.closedBy === 'verdict'
            ? t.masked(teamLabel(item.team))
            : t.maskedExpired(teamLabel(item.team)),
        tone: 'plain',
        points: null,
      };
    case 'verdict':
      return {
        icon: TONE_ICON[item.tone],
        text: t.verdict[item.tone](nicknameOf(roster, item.playerId)),
        tone: TONE_CLASS[item.tone],
        points: item.points,
      };
    case 'expired':
      return { icon: 'expired', text: t.expired, tone: 'bad', points: item.points };
    case 'event':
      return {
        icon: EVENT_ICON[item.event],
        text: pl.events.banner[item.event].title,
        tone: 'warn',
        points: null,
      };
    case 'raid':
      return { icon: 'bot', text: t.raid, tone: 'good', points: null };
    case 'ability':
      return {
        icon: ABILITY_ICON[item.ability],
        text: t.ability(nicknameOf(roster, item.playerId), pl.vocab.abilities[item.ability]),
        tone: 'plain',
        points: null,
      };
    case 'rescue':
      return {
        icon: RESCUE_ICON,
        text: t.rescue(nicknameOf(roster, item.playerId)),
        tone: 'good',
        points: null,
      };
  }
}

/** The pop of the newest row: its id, and whether it fades (reduced motion) or slides. */
type Pop = { id: number; fade: boolean };

export function EventFeed({ visible, versus }: { visible: number; versus: boolean }) {
  const feed = useSpectate((s) => s.feed);
  const roster = useApp((s) => s.room?.players ?? NO_PLAYERS);
  const newest = feed[0]?.id ?? null;
  const seen = useRef(newest);
  const [pop, setPop] = useState<Pop | null>(null);

  useEffect(
    () =>
      feedback.onAnimation((trigger, context, options) => {
        if (trigger === 'feedPop' && context.value !== undefined) {
          setPop({ id: context.value, fade: options.reducedMotion });
        }
      }),
    [],
  );

  // One cue per new top row (a burst of reveals is one sound); rows already there on mount
  // came before the screen and make none.
  useEffect(() => {
    if (newest !== null && newest !== seen.current) {
      emitCue('spectate.feed', { value: newest });
    }
    seen.current = newest;
  }, [newest]);

  const rows = feed.slice(0, visible);
  return (
    <section
      className={styles.feed}
      aria-label={pl.spectate.feed.title}
      data-testid="spectate-feed"
    >
      <h2 className={styles.feedTitle}>
        <Icon name="eye" size={18} />
        {pl.spectate.feed.title}
      </h2>
      <ol className={styles.feedRows} aria-live="polite">
        {rows.map((item) => {
          const row = feedRow(item, roster);
          const popping = pop?.id === item.id ? (pop.fade ? styles.fadeIn : styles.slideIn) : '';
          return (
            <li
              key={item.id}
              className={`${styles.feedRow} ${styles[row.tone]} ${popping}`}
              data-testid="feed-row"
              data-kind={item.kind}
              data-team={item.team}
              data-folder={'folderId' in item ? item.folderId : undefined}
            >
              {versus && <TeamBadge team={item.team} size={20} />}
              <span className={styles.feedIcon}>
                <Icon name={row.icon} size={18} />
              </span>
              <span className={styles.feedText}>{typeset(row.text)}</span>
              {row.points !== null && (
                <span className={styles.feedPoints}>
                  {pl.spectate.feed.points(formatDelta(row.points))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
