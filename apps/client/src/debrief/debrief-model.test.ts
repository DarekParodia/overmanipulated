import { describe, expect, test } from 'bun:test';
import type { FolderResult } from '@redakcja/shared';
import {
  blunderLeader,
  type DebriefStory,
  debriefCards,
  effectiveVotes,
  stepCard,
  voteConfirmed,
  votersByStory,
} from './debrief-model.ts';

function result(folderId: string, storyId: string, patch: Partial<FolderResult> = {}) {
  return {
    folderId,
    storyId,
    outcome: 'correct',
    verdict: 'publish',
    scoreDelta: 10,
    credibilityDelta: 0,
    missedStampIds: [],
    ...patch,
  } satisfies FolderResult;
}

const stories: Record<string, DebriefStory> = {
  'l1-a': {
    headline: 'Rynek pod wodą',
    correctVerdict: 'publishWithContext',
    stamps: [
      { id: 'l1-a-image', station: 'imageSearch', text: 'Zdjęcie z 2019 r.' },
      { id: 'l1-a-source', station: 'sourceRegistry', text: 'Konto aktywne od lat.' },
    ],
    debrief: {
      what: 'Stare zdjęcie.',
      technique: 'Nowy podpis.',
      tool: 'Lupa.',
      realWorld: 'Po burzach.',
    },
  },
  'l1-b': { headline: 'Nocny autobus', correctVerdict: 'publish' },
};
const lookup = (id: string) => stories[id];

describe('debrief cards', () => {
  test('orders cards by folder arrival, not by resolution', () => {
    const cards = debriefCards([result('f10', 'l1-b'), result('f2', 'l1-a')], lookup);
    expect(cards.map((c) => c.storyId)).toEqual(['l1-a', 'l1-b']);
  });

  test('keeps one card per story, from its first folder', () => {
    const cards = debriefCards(
      [result('f3', 'l1-a', { outcome: 'wrong' }), result('f1', 'l1-a')],
      lookup,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.folderId).toBe('f1');
  });

  test('carries the correct verdict, the debrief and the missed stamp texts', () => {
    const [card] = debriefCards(
      [
        result('f1', 'l1-a', {
          outcome: 'expired',
          verdict: null,
          missedStampIds: ['l1-a-image', 'unknown'],
        }),
      ],
      lookup,
    );
    expect(card?.verdict).toBeNull();
    expect(card?.correctVerdict).toBe('publishWithContext');
    expect(card?.debrief?.technique).toBe('Nowy podpis.');
    expect(card?.missedStamps).toEqual([
      { id: 'l1-a-image', station: 'imageSearch', text: 'Zdjęcie z 2019 r.' },
    ]);
  });

  test('still shows a card for a story the content does not know', () => {
    const [card] = debriefCards([result('f1', 'l9-missing')], lookup);
    expect(card?.headline).toBeNull();
    expect(card?.debrief).toBeNull();
    expect(card?.correctVerdict).toBeNull();
  });
});

describe('blunder votes', () => {
  const players = [
    { id: 'p1', colorIndex: 2 },
    { id: 'p2', colorIndex: 0 },
    { id: 'p3', colorIndex: 1 },
  ];

  test('replaces my server vote with my pending one', () => {
    const server = [
      { playerId: 'p1', storyId: 'l1-a' },
      { playerId: 'p2', storyId: 'l1-a' },
    ];
    expect(effectiveVotes(server, 'p1', 'l1-b')).toEqual([
      { playerId: 'p2', storyId: 'l1-a' },
      { playerId: 'p1', storyId: 'l1-b' },
    ]);
    expect(effectiveVotes(server, 'p1', null)).toEqual(server);
  });

  test('confirms the pending vote once the server has it', () => {
    expect(voteConfirmed([{ playerId: 'p1', storyId: 'l1-a' }], 'p1', 'l1-a')).toBe(true);
    expect(voteConfirmed([{ playerId: 'p1', storyId: 'l1-a' }], 'p1', 'l1-b')).toBe(false);
  });

  test('groups voters per story in roster order with their colours', () => {
    const voters = votersByStory(
      [
        { playerId: 'p3', storyId: 'l1-a' },
        { playerId: 'p1', storyId: 'l1-a' },
        { playerId: 'p2', storyId: 'l1-b' },
      ],
      players,
    );
    expect(voters.get('l1-a')).toEqual([
      { playerId: 'p1', colorIndex: 2 },
      { playerId: 'p3', colorIndex: 1 },
    ]);
    expect(voters.get('l1-b')).toEqual([{ playerId: 'p2', colorIndex: 0 }]);
  });

  test('names a blunder of the day only without a tie', () => {
    const voters = votersByStory(
      [
        { playerId: 'p1', storyId: 'l1-a' },
        { playerId: 'p2', storyId: 'l1-a' },
        { playerId: 'p3', storyId: 'l1-b' },
      ],
      players,
    );
    expect(blunderLeader(voters)).toBe('l1-a');
    expect(
      blunderLeader(
        votersByStory(
          [
            { playerId: 'p1', storyId: 'l1-a' },
            { playerId: 'p3', storyId: 'l1-b' },
          ],
          players,
        ),
      ),
    ).toBeNull();
    expect(blunderLeader(new Map())).toBeNull();
  });
});

test('steps between cards within the list', () => {
  expect(stepCard(0, -1, 3)).toBe(0);
  expect(stepCard(1, 1, 3)).toBe(2);
  expect(stepCard(2, 1, 3)).toBe(2);
  expect(stepCard(0, 1, 0)).toBe(0);
});
