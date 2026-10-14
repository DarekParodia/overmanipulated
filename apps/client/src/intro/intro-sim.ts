// The intro's in-engine scenes (S7-101): the shared deterministic sim runs locally on a mini
// layout (a three-tile conveyor, Lupa and Archiwum, one editorial desk) and a scripted input track
// plays one beat of the core loop per gameplay scene. No network, no commands from anyone but the
// script: the same track stepped to the same scene time always gives the same state, so the stage
// stays in step with the subtitles and the voice, also after Back, Pause or a skipped scene.
//
// The tracks form one short story: three folders ride in, the reporter picks up the photo, works
// it at Lupa, solves the round and earns the stamp, then cites it at the desk and publishes. Each
// track starts from the state the previous one ends in (`introTrackStart`), so a scene opened
// directly (Next, Back) looks exactly as if the intro had run up to it. Pure: no clock, no DOM.
import { getStory } from '@redakcja/content';
import {
  addPlayer,
  conveyorBlocked,
  createGameState,
  crewSnapshot,
  type GameEvent,
  type GameState,
  NORMAL_TUNING,
  nextScheduledSpawn,
  PLAYER_SPEED_TILES_PER_S,
  type PlayerCommand,
  type PlayerInput,
  parseLayout,
  type QueuedCommand,
  type SimContext,
  type SimLevel,
  type SimStory,
  type SnapshotMessage,
  type StoryBook,
  step,
  TICK_MS,
  type TileMap,
  timeLeftMs,
  type Vec2,
} from '@redakcja/shared';
import { INTRO_ROLE, type IntroTrackId } from './intro-script.ts';

/** The mini newsroom: conveyor top left, Lupa and Archiwum top right, the desk at the bottom. */
export const INTRO_LAYOUT: readonly string[] = [
  '##########',
  '#.CCC.I.A#',
  '#1.......#',
  '#........#',
  '#....D...#',
  '##########',
];
export const INTRO_MAP: TileMap = parseLayout(INTRO_LAYOUT);

/** The one player on stage: a photo editor, so Lupa's hold-to-work fits the scene. */
export const INTRO_PLAYER_ID = 'intro-reporter';
export const INTRO_PLAYER_ROLE = INTRO_ROLE;
/** Where the reporter stands when the first folder arrives. */
const INTRO_PLAYER_START: Vec2 = { x: 5.5, y: 2.5 };
/** The match seed of the intro's run (minigame seeds only; nothing random is drawn). */
const INTRO_SEED = 7;

/**
 * Training stories that ride in: a photo, a post and a quote (the folders line). The reporter
 * works the photo; its Lupa stamp is the decisive proof and the right verdict is Publikuj.
 */
export const INTRO_STORY_IDS = {
  photo: 'l0-tecza-nad-latarnia',
  post: 'l0-falszywa-straz',
  quote: 'l0-cytat-kandydatki',
} as const;
/** The stamp Lupa gives the photo, cited at the desk. */
export const INTRO_PROOF_STAMP_ID = 'l0-tecza-nad-latarnia-image';

/** Folder deadline: long enough that no folder runs late during the whole intro. */
const INTRO_DEADLINE_S = 75;
/** The fourth folder never arrives within the intro; the „Następna teczka” card counts to it. */
const INTRO_LAST_FOLDER_AT_S = 60;

export const INTRO_LEVEL: SimLevel = {
  id: 'intro',
  durationS: 600,
  layout: INTRO_LAYOUT,
  stations: ['imageSearch', 'archive'],
  schedule: [
    { atS: 0.5, storyId: INTRO_STORY_IDS.photo, deadlineS: INTRO_DEADLINE_S },
    { atS: 3, storyId: INTRO_STORY_IDS.post, deadlineS: INTRO_DEADLINE_S },
    { atS: 5.5, storyId: INTRO_STORY_IDS.quote, deadlineS: INTRO_DEADLINE_S },
    { atS: INTRO_LAST_FOLDER_AT_S, storyId: INTRO_STORY_IDS.post, deadlineS: INTRO_DEADLINE_S },
  ],
  stars: { two: 1000, three: 2000 },
};

function introStories(): StoryBook {
  const book: Record<string, SimStory> = {};
  for (const id of Object.values(INTRO_STORY_IDS)) {
    const story = getStory(id);
    if (story) {
      book[id] = story;
    }
  }
  return book;
}

export const INTRO_CONTEXT: SimContext = {
  dtMs: TICK_MS,
  map: INTRO_MAP,
  level: INTRO_LEVEL,
  stories: introStories(),
  tuning: NORMAL_TUNING,
};

// --- Scripted input tracks --------------------------------------------------------------------

/** One step of a track's script; each runs until done, then the next starts in the same tick. */
export type IntroBeat =
  /** Stand still. */
  | { do: 'wait'; ms: number }
  /** Walk in a straight line to a floor point. */
  | { do: 'walk'; to: Vec2 }
  /** Push towards a fixture for one tick: the reporter turns to it without moving. */
  | { do: 'face'; dir: Vec2 }
  /** Press pick-up / put-down once. */
  | { do: 'interact' }
  /** Hold the work input until the station in front opens its minigame. */
  | { do: 'workUntilMinigame' }
  /** Press work once (at the desk: opens the sheet). */
  | { do: 'workOnce' }
  /** A decision the reporter sends (the minigame's result, the verdict). */
  | { do: 'command'; command: PlayerCommand };

const UP: Vec2 = { x: 0, y: -1 };
const DOWN: Vec2 = { x: 0, y: 1 };
/** In front of the first conveyor tile, of Lupa and of the desk. */
const AT_CONVEYOR: Vec2 = { x: 2.5, y: 2.5 };
const ON_THE_WAY: Vec2 = { x: 4.5, y: 2.5 };
const AT_LUPA: Vec2 = { x: 6.5, y: 2.5 };
const AT_DESK: Vec2 = { x: 5.5, y: 3.5 };
/** The photo is the first folder the schedule spawns. */
const PHOTO_FOLDER_ID = 'f1';
const LUPA_ID = 'imageSearch-0';

/**
 * The script of each gameplay scene. Every track finishes its beats within the shortest
 * fallback time of its scene (intro-sim.test.ts), so the beat lands while the line is read.
 */
export const INTRO_TRACKS: Readonly<Record<IntroTrackId, readonly IntroBeat[]>> = {
  conveyorArrivals: [{ do: 'wait', ms: 6000 }],
  pickUpFolder: [
    { do: 'wait', ms: 300 },
    { do: 'walk', to: AT_CONVEYOR },
    { do: 'face', dir: UP },
    { do: 'interact' },
    { do: 'wait', ms: 400 },
    { do: 'walk', to: ON_THE_WAY },
  ],
  holdWork: [
    { do: 'wait', ms: 200 },
    { do: 'walk', to: AT_LUPA },
    { do: 'face', dir: UP },
    { do: 'interact' },
    { do: 'wait', ms: 150 },
    { do: 'workUntilMinigame' },
  ],
  earnStamp: [
    // The round is being solved while the first sentence names Lupa; the stamp lands with the
    // second („Dobrze rozwiązane zadanie daje pieczątkę”).
    { do: 'wait', ms: 4000 },
    { do: 'command', command: { kind: 'minigameResult', stationId: LUPA_ID, success: true } },
    { do: 'wait', ms: 900 },
    { do: 'interact' },
  ],
  citeAndVerdict: [
    { do: 'wait', ms: 200 },
    { do: 'walk', to: AT_DESK },
    { do: 'face', dir: DOWN },
    { do: 'interact' },
    { do: 'wait', ms: 150 },
    { do: 'workOnce' },
    // The sheet is open while „Najpierw wskaż dowód” is read; then the verdict.
    { do: 'wait', ms: 2500 },
    {
      do: 'command',
      command: {
        kind: 'verdict',
        folderId: PHOTO_FOLDER_ID,
        verdict: 'publish',
        justifyingStampIds: [INTRO_PROOF_STAMP_ID],
      },
    },
  ],
};

/** Track order: the gameplay scenes in the order the script plays them. */
export const INTRO_TRACK_ORDER: readonly IntroTrackId[] = [
  'conveyorArrivals',
  'pickUpFolder',
  'holdWork',
  'earnStamp',
  'citeAndVerdict',
];

/** A walk ends this close to its target (positions are quantised, a step is 0.225 tiles). */
const WALK_EPSILON = 0.05;
/** A walk or a hold never runs longer than this many ticks (a script error must not hang). */
const MAX_BEAT_TICKS = 400;
const STEP_TILES = (PLAYER_SPEED_TILES_PER_S * TICK_MS) / 1000;

type Cursor = { index: number; ticksIn: number };

const IDLE: PlayerInput['actions'] = { interact: false, work: false };

/** The reporter's input and commands for the next tick, and the cursor after it. */
function scriptedTick(
  beats: readonly IntroBeat[],
  cursor: Cursor,
  state: GameState,
  seq: number,
): { input: PlayerInput; commands: QueuedCommand[]; cursor: Cursor } {
  const idle = (next: Cursor) => ({
    input: { seq, move: { x: 0, y: 0 }, actions: IDLE },
    commands: [],
    cursor: next,
  });
  let { index, ticksIn } = cursor;
  // Finished beats hand the tick on to the next one; at most one beat per array entry.
  for (let guard = 0; guard <= beats.length; guard++) {
    const beat = beats[index];
    if (!beat) {
      return idle({ index, ticksIn: 0 });
    }
    const after: Cursor = { index, ticksIn: ticksIn + 1 };
    const done: Cursor = { index: index + 1, ticksIn: 0 };
    const player = state.players[INTRO_PLAYER_ID];
    switch (beat.do) {
      case 'wait':
        if (ticksIn < Math.ceil(beat.ms / TICK_MS)) {
          return idle(after);
        }
        break;
      case 'walk': {
        const dx = beat.to.x - (player?.x ?? beat.to.x);
        const dy = beat.to.y - (player?.y ?? beat.to.y);
        const distance = Math.hypot(dx, dy);
        if (distance >= WALK_EPSILON && ticksIn < MAX_BEAT_TICKS) {
          const scale = Math.min(1, distance / STEP_TILES) / distance;
          return {
            input: { seq, move: { x: dx * scale, y: dy * scale }, actions: IDLE },
            commands: [],
            cursor: after,
          };
        }
        break;
      }
      case 'face':
        return { input: { seq, move: beat.dir, actions: IDLE }, commands: [], cursor: done };
      case 'interact':
        return {
          input: { seq, move: { x: 0, y: 0 }, actions: { interact: true, work: false } },
          commands: [],
          cursor: done,
        };
      case 'workOnce':
        return {
          input: { seq, move: { x: 0, y: 0 }, actions: { interact: false, work: true } },
          commands: [],
          cursor: done,
        };
      case 'workUntilMinigame': {
        const opened = Object.values(state.stations).some(
          (station) => station.operatorId === INTRO_PLAYER_ID && station.phase === 'minigame',
        );
        if (!opened && ticksIn < MAX_BEAT_TICKS) {
          return {
            input: { seq, move: { x: 0, y: 0 }, actions: { interact: false, work: true } },
            commands: [],
            cursor: after,
          };
        }
        break;
      }
      case 'command':
        return {
          input: { seq, move: { x: 0, y: 0 }, actions: IDLE },
          commands: [{ playerId: INTRO_PLAYER_ID, command: beat.command }],
          cursor: done,
        };
    }
    index += 1;
    ticksIn = 0;
  }
  return idle({ index, ticksIn: 0 });
}

/** One track being played: the sim state now and one tick before (for interpolation). */
export type IntroRun = {
  readonly track: IntroTrackId;
  /** Ticks stepped since the track started. */
  readonly tick: number;
  readonly state: GameState;
  readonly previous: GameState;
  /** Steps one tick; returns the events it caused. */
  advance(): GameEvent[];
};

/** The state before the first folder: the reporter alone in the mini newsroom. */
export function introInitialState(): GameState {
  return addPlayer(
    createGameState({ map: INTRO_MAP, seed: INTRO_SEED }),
    INTRO_PLAYER_ID,
    INTRO_PLAYER_START,
    INTRO_PLAYER_ROLE,
  );
}

/** Starts a track from `start` (by default where the previous track's script ends). */
export function createIntroRun(track: IntroTrackId, start = introTrackStart(track)): IntroRun {
  const beats = INTRO_TRACKS[track];
  let state = start;
  let previous = start;
  let cursor: Cursor = { index: 0, ticksIn: 0 };
  let tick = 0;
  let seq = (start.players[INTRO_PLAYER_ID]?.lastInputSeq ?? -1) + 1;
  return {
    track,
    get tick() {
      return tick;
    },
    get state() {
      return state;
    },
    get previous() {
      return previous;
    },
    advance() {
      const next = scriptedTick(beats, cursor, state, seq++);
      cursor = next.cursor;
      const result = step(state, { [INTRO_PLAYER_ID]: [next.input] }, next.commands, INTRO_CONTEXT);
      previous = state;
      state = result.state;
      tick += 1;
      return result.events;
    },
  };
}

/** Ticks a track needs to play its script: until every beat is done. */
function scriptTicks(track: IntroTrackId, start: GameState): { ticks: number; end: GameState } {
  const beats = INTRO_TRACKS[track];
  let state = start;
  let cursor: Cursor = { index: 0, ticksIn: 0 };
  let seq = (start.players[INTRO_PLAYER_ID]?.lastInputSeq ?? -1) + 1;
  let ticks = 0;
  while (cursor.index < beats.length && ticks < MAX_BEAT_TICKS * beats.length) {
    const next = scriptedTick(beats, cursor, state, seq++);
    cursor = next.cursor;
    state = step(state, { [INTRO_PLAYER_ID]: [next.input] }, next.commands, INTRO_CONTEXT).state;
    ticks += 1;
  }
  return { ticks, end: state };
}

const starts = new Map<IntroTrackId, GameState>();
const lengths = new Map<IntroTrackId, number>();

function playChain(): void {
  if (starts.size > 0) {
    return;
  }
  let state = introInitialState();
  for (const track of INTRO_TRACK_ORDER) {
    starts.set(track, state);
    const { ticks, end } = scriptTicks(track, state);
    lengths.set(track, ticks * TICK_MS);
    state = end;
  }
}

/** Where a track starts: the end of the previous track's script (the first: the empty room). */
export function introTrackStart(track: IntroTrackId): GameState {
  playChain();
  return starts.get(track) ?? introInitialState();
}

/** How long a track's script runs, in ms; the scene may go on after it (the reporter idles). */
export function introTrackLengthMs(track: IntroTrackId): number {
  playChain();
  return lengths.get(track) ?? 0;
}

/** Plays `track` for `ms` of scene time from its start; returns the state and every event. */
export function runIntroTrack(
  track: IntroTrackId,
  ms: number,
): { state: GameState; events: GameEvent[] } {
  const run = createIntroRun(track);
  const events: GameEvent[] = [];
  const ticks = Math.floor(ms / TICK_MS);
  for (let i = 0; i < ticks; i++) {
    events.push(...run.advance());
  }
  return { state: run.state, events };
}

/** The snapshot the server would send for this state (co-op, never paused). */
export function introSnapshot(state: GameState): SnapshotMessage {
  return {
    type: 'snapshot',
    tick: state.tick,
    players: Object.values(state.players).map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      facing: p.facing,
      moving: p.moving,
      lastInputSeq: p.lastInputSeq,
    })),
    elapsedMs: state.elapsedMs,
    timeLeftMs: timeLeftMs(state, INTRO_LEVEL.durationS),
    score: state.score,
    credibility: state.credibility,
    folders: Object.values(state.folders),
    stations: Object.values(state.stations),
    desks: Object.values(state.desks),
    nextFolder: nextScheduledSpawn(state, INTRO_CONTEXT),
    conveyorFull: conveyorBlocked(state, INTRO_CONTEXT),
    crew: crewSnapshot(state),
    paused: false,
  };
}
