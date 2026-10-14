import { afterEach, describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LEVEL_ID } from '@redakcja/content';
import { type SnapshotMessage, TICK_MS } from '@redakcja/shared';
import { hitCamera } from '../fx/camera/view-camera.ts';
import { spawn } from '../fx/particles/pool.ts';
import { useGuidance } from '../guidance/store.ts';
import { contextFor, type GameplayEvent, routeViewEvent } from './game-events.ts';
import { useGame } from './game-store.ts';
import { createWatchView, type GameView } from './game-view.ts';
import { createWatchRuntime, SPECTATOR_INTERPOLATION_DELAY_MS } from './runtime.ts';

function snapshot(tick: number, x: number): SnapshotMessage {
  return {
    type: 'snapshot',
    tick,
    players: [{ id: 'p1', x, y: 5, facing: 0, moving: true, lastInputSeq: tick }],
    elapsedMs: tick * TICK_MS,
    timeLeftMs: 60_000,
    score: 120,
    credibility: 80,
    folders: [],
    stations: [],
    desks: [],
    nextFolder: null,
    conveyorFull: false,
    crew: [],
    paused: false,
  };
}

const ping: GameplayEvent = { kind: 'ping', playerId: 'p1', ping: 'fake' };

/** Two views of the two versus teams, as a spectator's split screen holds them. */
function twoViews(): [GameView, GameView] {
  return [createWatchView(0, DEFAULT_LEVEL_ID), createWatchView(1, DEFAULT_LEVEL_ID)];
}

/** Connects a view's particle and camera outputs the way Particles and CameraRig do. */
function connectWorld(view: GameView): void {
  view.particles.reset(16);
  view.feedback.connect({
    spawnParticles(_preset, count, context) {
      for (let i = 0; i < count; i++) {
        spawn(view.particles.pool, {
          x: context.position?.x ?? 0,
          y: context.position?.y ?? 0,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          life: 1,
          size: 1,
          gravity: 0,
          drag: 0,
          color: 0,
        });
      }
    },
    addTrauma: (amount) => hitCamera(view.camera, amount),
  });
}

describe('GameView isolation (S7-85)', () => {
  const views: GameView[] = [];
  afterEach(() => {
    for (const view of views.splice(0)) {
      view.bubbles.clear();
    }
  });

  it('keeps each game store apart, and the player store untouched', () => {
    const [a, b] = twoViews();
    useGame.getState().reset();
    a.store.getState().applySnapshot(snapshot(40, 3));
    expect(a.store.getState().tick).toBe(40);
    expect(a.store.getState().score).toBe(120);
    expect(b.store.getState().tick).toBe(0);
    expect(b.store.getState().score).toBe(0);
    expect(useGame.getState().tick).toBe(0);
    expect(a.store).not.toBe(useGame);
  });

  it('keeps each event store apart', () => {
    const [a, b] = twoViews();
    const failed: GameplayEvent = {
      kind: 'minigameFailed',
      stationId: 'st1',
      playerId: 'p1',
      folderId: 'f1',
      lockoutMs: 4000,
    };
    a.events.getState().handle(failed, () => 'Archiwum');
    expect(a.events.getState().lockoutTotals).toEqual({ st1: 4000 });
    expect(b.events.getState().lockoutTotals).toEqual({});
  });

  it('keeps each set of ping bubbles apart', () => {
    const [a, b] = twoViews();
    views.push(a, b);
    a.bubbles.show('p1', 'fake', 1000);
    expect(a.bubbles.use.getState().bubbles.p1?.ping).toBe('fake');
    expect(b.bubbles.use.getState().bubbles).toEqual({});
  });

  it('gives a spectator view a disabled guidance stub, apart from the player', () => {
    const [a, b] = twoViews();
    const step = { kind: 'pickup' as const, text: 'Weź teczkę', targetFixtureIds: ['c1'] };
    a.guidance.getState().setStep(step);
    a.guidance.getState().setHintsEnabled(true);
    expect(a.guidance.getState().step).toBeNull();
    expect(a.guidance.getState().hintsEnabled).toBe(false);
    expect(a.guidance).not.toBe(b.guidance);
    expect(a.guidance).not.toBe(useGuidance);
  });

  it('keeps each render state apart', () => {
    const [a, b] = twoViews();
    a.render.players.set('p1', { id: 'p1', x: 3, y: 4, facing: 0, moving: false, local: false });
    a.render.hands.set('p1', { x: 3, y: 4, height: 0.8 });
    a.render.local = { x: 3, y: 4 };
    expect(b.render.players.size).toBe(0);
    expect(b.render.hands.size).toBe(0);
    expect(b.render.local).toBeNull();
  });

  it('bursts particles and shakes the camera only in the view the cue belongs to', () => {
    const [a, b] = twoViews();
    connectWorld(a);
    connectWorld(b);
    a.feedback.emit('stamp.applied', { position: { x: 2, y: 2 } });
    expect(a.particles.pool.count).toBeGreaterThan(0);
    expect(a.camera.shake.trauma).toBeGreaterThan(0);
    expect(b.particles.pool.count).toBe(0);
    expect(b.camera.shake.trauma).toBe(0);
    expect(b.camera.punch.amount).toBe(0);
  });

  it('routes an event to its own view: listeners, cue and cue context', () => {
    const [a, b] = twoViews();
    const heard: string[] = [];
    a.bus.on((event) => heard.push(`a:${event.kind}`));
    b.bus.on((event) => heard.push(`b:${event.kind}`));
    a.feedback.onCue((id, context) => heard.push(`a:${id}@${context.position?.x}`));
    b.feedback.onCue((id) => heard.push(`b:${id}`));
    a.render.players.set('p1', { id: 'p1', x: 3, y: 4, facing: 0, moving: false, local: false });
    b.render.players.set('p1', { id: 'p1', x: 9, y: 2, facing: 0, moving: false, local: false });
    routeViewEvent(a, ping);
    expect(heard).toEqual(['a:ping', 'a:ping.fake@3']);
    expect(contextFor(b, ping).position).toEqual({ x: 9, y: 2 });
  });
});

describe('watch runtime (S7-85)', () => {
  it('renders 250 ms behind, every player remote', () => {
    expect(SPECTATOR_INTERPOLATION_DELAY_MS).toBe(250);
    const runtime = createWatchRuntime(DEFAULT_LEVEL_ID);
    runtime.onSnapshot(snapshot(10, 1), 500);
    runtime.onSnapshot(snapshot(11, 2), 550);
    // Tick 10 arrived at t=500 → tick 10.5 is t=525; 250 ms behind that is now=775.
    const halfway = runtime.frame(775, 16).get('p1');
    expect(halfway?.x).toBeCloseTo(1.5, 5);
    expect(halfway?.local).toBe(false);
    // At the player's 100 ms delay the same instant is still on the older snapshot.
    expect(runtime.frame(625, 16).get('p1')?.x).toBe(1);
    runtime.reset();
    expect(runtime.frame(775, 16).size).toBe(0);
  });
});

describe('scene files (S7-85)', () => {
  const src = join(import.meta.dir, '..');
  const sceneFiles = [
    ...readdirSync(join(src, 'scene'))
      .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
      .map((name) => join('scene', name)),
    join('abilities', 'AbilityMarkers.tsx'),
  ];
  /** Module-level stores and the player's runtime: a scene file reads its view's instead. */
  const forbidden =
    /\b(runtime|playerView|useGame|useEvents|usePingBubbles|showPingBubble|clearPingBubbles|playerBubbles|useGuidance|effectiveHintsNow|useEffectiveHints|onGameEvent|handleGameEvent|playerEvents|renderState|feedback|emitCue)\b/;

  it('import no module-level store or runtime from net/, events/, pings/, guidance/ or fx', () => {
    expect(sceneFiles.length).toBeGreaterThan(20);
    const offenders: string[] = [];
    for (const file of sceneFiles) {
      const source = readFileSync(join(src, file), 'utf8');
      for (const match of source.matchAll(/import\s+([^;]*?)\s+from\s+'([^']+)'/g)) {
        const [, names = '', from = ''] = match;
        if (from.endsWith('/session.ts') || from.endsWith('render-state.ts')) {
          if (!names.startsWith('type ') && !names.startsWith('{ type ')) {
            offenders.push(`${file}: ${from}`);
          }
        }
        if (/(net|events|pings|guidance|fx)\//.test(from) && forbidden.test(names)) {
          offenders.push(`${file}: ${names} from ${from}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
