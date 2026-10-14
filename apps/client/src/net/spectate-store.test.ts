import { afterEach, describe, expect, it } from 'bun:test';
import { getLevel } from '@redakcja/content';
import { parseLayout, type SpectatorEventMessage } from '@redakcja/shared';
import type { CueId } from '../fx/cues.ts';
import type { GameplayEvent } from './game-events.ts';
import { isViewEvent, spectateViews, teamView, useSpectate } from './spectate-store.ts';

function message(team: number, event: SpectatorEventMessage['event']): SpectatorEventMessage {
  return { type: 'spectatorEvent', tick: 30, team, event };
}

/** What one watched newsroom's view heard: its gameplay events, its cues and its sounds. */
function listenTo(team: number) {
  const view = teamView(team).view;
  const events: GameplayEvent[] = [];
  const cues: { id: CueId; silent: boolean }[] = [];
  const sounds: string[][] = [];
  const stops = [
    view.bus.on((event) => events.push(event)),
    view.feedback.onCue((id, context) => cues.push({ id, silent: context.silent === true })),
    view.feedback.connect({ playSound: (ids) => sounds.push([...ids]) }),
  ];
  return {
    events,
    cues,
    sounds,
    stop: () => {
      for (const stop of stops) {
        stop();
      }
    },
  };
}

afterEach(() => useSpectate.getState().reset());

describe('spectate store views (S7-90)', () => {
  it('routes a watched newsroom’s gameplay events to its own view only', () => {
    const kurier = listenTo(0);
    const glos = listenTo(1);
    useSpectate
      .getState()
      .applyEvent(message(1, { kind: 'folderPickedUp', folderId: 'f4', playerId: 'p2' }));
    kurier.stop();
    glos.stop();
    expect(kurier.events).toEqual([]);
    expect(glos.events).toEqual([{ kind: 'folderPickedUp', folderId: 'f4', playerId: 'p2' }]);
  });

  it('plays the audible cues with sound and the rest silently', () => {
    const glos = listenTo(1);
    const store = useSpectate.getState();
    store.applyEvent(message(1, { kind: 'folderPickedUp', folderId: 'f4', playerId: 'p2' }));
    store.applyEvent(
      message(1, {
        kind: 'folderExpired',
        folderId: 'f4',
        spawnKey: 's3',
        storyId: 'zdjecie-powodzi',
        stamps: [],
      }),
    );
    glos.stop();
    expect(glos.cues).toEqual([
      { id: 'folder.pickup', silent: true },
      { id: 'folder.expired', silent: false },
    ]);
    expect(glos.sounds).toHaveLength(1);
  });

  it('keeps roster changes and the embargo’s masked results out of the views', () => {
    const glos = listenTo(1);
    useSpectate.getState().applyEvent(
      message(1, {
        kind: 'verdictMasked',
        playerId: 'p2',
        folderId: 'f4',
        spawnKey: 's3',
        closedBy: 'verdict',
      }),
    );
    useSpectate.getState().applyEvent(message(1, { kind: 'playerLeft', playerId: 'p2' }));
    glos.stop();
    expect(glos.events).toEqual([]);
    expect(glos.cues).toEqual([]);
    expect(useSpectate.getState().events).toHaveLength(2);
  });

  it('isViewEvent passes sim events and drops the feed-only kinds', () => {
    expect(isViewEvent({ kind: 'gameStarted' })).toBe(false);
    expect(isViewEvent({ kind: 'playerJoined', playerId: 'p1' })).toBe(false);
    expect(isViewEvent({ kind: 'folderPickedUp', folderId: 'f1', playerId: 'p1' })).toBe(true);
  });

  it('a reset with a level id loads that level’s room in every view', () => {
    const level = getLevel('l5-deepfake');
    expect(level).toBeDefined();
    const expected = parseLayout(level?.layout ?? []);
    useSpectate.getState().reset('l5-deepfake');
    for (const view of spectateViews) {
      expect(view.view.runtime.map.width).toBe(expected.width);
      expect(view.view.runtime.map.height).toBe(expected.height);
    }
    expect(expected.width).toBe(24);
    expect(expected.height).toBe(14);
  });

  it('teamView falls back to Kurier outside the teams', () => {
    expect(teamView(1).team).toBe(1);
    expect(teamView(5).team).toBe(0);
  });
});
