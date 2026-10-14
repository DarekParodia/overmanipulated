import { describe, expect, test } from 'bun:test';
import {
  blunderLeader,
  effectiveVotes,
  stepCard,
  voteConfirmed,
  votersByStory,
} from './debrief-model.ts';

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
