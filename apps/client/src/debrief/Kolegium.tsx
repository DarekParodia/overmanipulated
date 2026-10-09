// The Kolegium: the level's stories as debrief cards. Desktop shows a scrollable list (the
// current card has a blue outline); phones show one card at a time, paged from the footer or by
// swiping. Votes go to the server; this player's own vote shows at once (optimistic).
import { useEffect, useMemo, useRef, useState } from 'react';
import { voteBlunder } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import styles from './Debrief.module.css';
import { DebriefCard } from './DebriefCard.tsx';
import {
  blunderLeader,
  type DebriefCard as Card,
  effectiveVotes,
  voteConfirmed,
  votersByStory,
} from './debrief-model.ts';

const NO_VOTES: never[] = [];

/** This player's vote with the server's tallies; the pending vote clears once confirmed. */
export function useBlunderVotes() {
  const playerId = useApp((s) => s.playerId);
  const serverVotes = useApp((s) => s.room?.blunderVotes ?? NO_VOTES);
  const players = useApp((s) => s.room?.players ?? NO_VOTES);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (pending !== null && voteConfirmed(serverVotes, playerId, pending)) {
      setPending(null);
    }
  }, [serverVotes, playerId, pending]);

  const votes = useMemo(
    () => effectiveVotes(serverVotes, playerId, pending),
    [serverVotes, playerId, pending],
  );
  const voters = useMemo(() => votersByStory(votes, players), [votes, players]);
  const myVote = votes.find((v) => v.playerId === playerId)?.storyId ?? null;

  const vote = (storyId: string) => {
    if (storyId === myVote) {
      return;
    }
    setPending(storyId);
    voteBlunder(storyId);
  };

  return { voters, myVote, leader: blunderLeader(voters), vote };
}

export type KolegiumProps = {
  cards: readonly Card[];
  paged: boolean;
  current: number;
  onCurrent(index: number): void;
  /** Cards whose verdict mark is shown (the reveal slams them on one by one). */
  marked(index: number): boolean;
  instant: boolean;
  voteKey: string | null;
  votes: ReturnType<typeof useBlunderVotes>;
};

export function Kolegium({
  cards,
  paged,
  current,
  onCurrent,
  marked,
  instant,
  voteKey,
  votes,
}: KolegiumProps) {
  const list = useRef<HTMLOListElement>(null);

  // Keyboard / gamepad moves keep the current card in view on the desktop list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the current card changes
  useEffect(() => {
    if (paged) {
      return;
    }
    list.current
      ?.querySelector<HTMLElement>('[data-current]')
      ?.scrollIntoView({ block: 'nearest', behavior: instant ? 'auto' : 'smooth' });
  }, [current, paged, instant]);

  if (cards.length === 0) {
    return <p className={styles.empty}>{pl.results.noFolders}</p>;
  }

  const render = (card: Card, index: number) => (
    <DebriefCard
      card={card}
      marked={marked(index)}
      instant={instant}
      current={index === current}
      voters={votes.voters.get(card.storyId) ?? NO_VOTES}
      votedByMe={votes.myVote === card.storyId}
      leader={votes.leader === card.storyId}
      voteKey={index === current ? voteKey : null}
      onVote={() => {
        onCurrent(index);
        votes.vote(card.storyId);
      }}
      onSelect={() => onCurrent(index)}
      {...(paged
        ? {
            onSwipe: (direction: -1 | 1) =>
              onCurrent(Math.max(0, Math.min(cards.length - 1, current + direction))),
          }
        : {})}
    />
  );

  if (paged) {
    const card = cards[current];
    return (
      <div className={styles.page} aria-live="polite">
        {card && <div key={card.storyId}>{render(card, current)}</div>}
      </div>
    );
  }

  return (
    <ol ref={list} className={styles.list} aria-label={pl.debrief.cardsLabel}>
      {cards.map((card, index) => (
        <li key={card.storyId}>{render(card, index)}</li>
      ))}
    </ol>
  );
}
