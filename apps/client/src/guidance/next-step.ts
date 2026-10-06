// "What next" for the local player (agents/design-rules.md §1.6): one short line and the
// fixtures it points at. Pure: everything comes in as arguments, so every case is unit-tested.
// It never reveals a story's truth or verdict; it only points at stations whose stamp the
// folder still lacks (the ones that can justify a verdict first) and at the desk once a
// justifying stamp is collected.
import type { Desk, Fixture, Folder, StationKind, TileMap } from '@redakcja/shared';
import type { InputDevice } from '../store/app.ts';
import { pl } from '../strings/pl.ts';

export type NextStepKind =
  /** Go to a fixture and pick up a folder there. */
  | 'pickup'
  /** Standing at a fixture with a folder to take: press interact. */
  | 'pickupHere'
  /** Carrying a folder: take it to one of the target stations. */
  | 'toStation'
  /** Carrying a folder at a useful free fixture: put it down. */
  | 'dropHere'
  /** At a station with an unchecked folder: hold work. */
  | 'work'
  /** Holding work at a station (the work prompt shows the progress). */
  | 'working'
  /** The local player's minigame overlay is open. */
  | 'minigame'
  /** The station in front of the player is locked after a failed minigame. */
  | 'lockout'
  /** Carrying a folder with a justifying stamp: take it to a desk. */
  | 'toDesk'
  /** At a desk with a folder on it: hold work to open the verdict sheet. */
  | 'openDesk'
  /** The verdict sheet is open. */
  | 'verdict'
  /** Nothing to do: no folders anywhere. */
  | 'wait';

export type NextStep = {
  kind: NextStepKind;
  text: string;
  /** Fixtures to mark in the scene, most useful first. */
  targetFixtureIds: string[];
};

/** What next-step needs to know about a story: its stamps and which of them justify. */
export type StoryStamps = {
  stamps: readonly { id: string; station: StationKind }[];
  justifyingStamps: readonly string[];
};

export type NextStepInput = {
  playerId: string | null;
  folders: readonly Folder[];
  stations: readonly { id: string; operatorId: string | null; phase: string }[];
  desks: readonly Desk[];
  map: TileMap;
  /** The fixture the local player currently faces (their interaction target), if any. */
  targetFixtureId: string | null;
  device: InputDevice;
  story(storyId: string): StoryStamps | undefined;
};

/** Steps during which another piece of UI (overlay, work prompt) already says what to do. */
export const BUSY_KINDS: ReadonlySet<NextStepKind> = new Set([
  'working',
  'minigame',
  'lockout',
  'verdict',
]);

/** Steps done right where the player stands: the target needs a ring, not an arrow. */
export const HERE_KINDS: ReadonlySet<NextStepKind> = new Set([
  'pickupHere',
  'dropHere',
  'work',
  'openDesk',
  'lockout',
]);

function step(kind: NextStepKind, text: string, targetFixtureIds: string[] = []): NextStep {
  return { kind, text, targetFixtureIds };
}

function folderOn(folders: readonly Folder[], fixtureId: string): Folder | undefined {
  return folders.find((f) => f.location.kind === 'fixture' && f.location.fixtureId === fixtureId);
}

function byDeadline(a: Folder, b: Folder): number {
  return a.deadlineMs - b.deadlineMs;
}

/** Whether the folder carries at least one stamp that can justify its verdict. */
export function hasJustifyingStamp(folder: Folder, story: StoryStamps | undefined): boolean {
  return story ? story.justifyingStamps.some((id) => folder.stamps.includes(id)) : false;
}

/** The stamp a station of `kind` would add to the folder, if it still lacks it. */
function missingStamp(folder: Folder, story: StoryStamps | undefined, kind: StationKind) {
  const stamp = story?.stamps.find((s) => s.station === kind);
  return stamp && !folder.stamps.includes(stamp.id) ? stamp : undefined;
}

/**
 * Stations worth visiting with this folder: the level's stations whose stamp it still lacks,
 * the ones that can justify a verdict first, free ones (no folder on them) first.
 */
export function stationsToVisit(
  folder: Folder,
  story: StoryStamps | undefined,
  input: Pick<NextStepInput, 'map' | 'folders'>,
): Fixture[] {
  const unchecked = input.map.fixtures.filter(
    (f) => f.kind === 'station' && f.station && missingStamp(folder, story, f.station),
  );
  const justifying = unchecked.filter((f) => {
    const stamp = f.station ? missingStamp(folder, story, f.station) : undefined;
    return stamp !== undefined && (story?.justifyingStamps.includes(stamp.id) ?? false);
  });
  const pool = justifying.length > 0 ? justifying : unchecked;
  const free = pool.filter((f) => !folderOn(input.folders, f.id));
  return free.length > 0 ? free : pool;
}

function stationNames(fixtures: readonly Fixture[]): string {
  const kinds: StationKind[] = [];
  for (const fixture of fixtures) {
    if (fixture.station && !kinds.includes(fixture.station)) {
      kinds.push(fixture.station);
    }
  }
  return kinds.map((kind) => pl.guidance.stationShort[kind]).join(' / ');
}

function deskTargets(input: NextStepInput): string[] {
  const desks = input.map.fixtures.filter((f) => f.kind === 'desk');
  const free = desks.filter((f) => !folderOn(input.folders, f.id));
  return (free.length > 0 ? free : desks).map((f) => f.id);
}

function carryingStep(input: NextStepInput, folder: Folder): NextStep {
  const { guidance } = pl;
  const story = input.story(folder.storyId);
  const target = input.targetFixtureId;
  const targetFree = target !== null && !folderOn(input.folders, target);
  const visit = hasJustifyingStamp(folder, story) ? [] : stationsToVisit(folder, story, input);
  if (visit.length === 0) {
    const desks = deskTargets(input);
    if (targetFree && desks.includes(target)) {
      return step('dropHere', guidance.hint.dropHere[input.device], [target]);
    }
    return step('toDesk', guidance.hint.toDesk, desks);
  }
  if (targetFree && visit.some((f) => f.id === target)) {
    return step('dropHere', guidance.hint.dropHere[input.device], [target]);
  }
  return step(
    'toStation',
    guidance.hint.toStation(stationNames(visit)),
    visit.map((f) => f.id),
  );
}

/** Next step for a player with empty hands standing at `target`, if the target has one. */
function stepAtTarget(input: NextStepInput, target: Fixture): NextStep | undefined {
  const { guidance } = pl;
  const folder = folderOn(input.folders, target.id);
  if (!folder) {
    return undefined;
  }
  const workKey = guidance.workKey[input.device];
  if (target.kind === 'station' && target.station) {
    const station = input.stations.find((s) => s.id === target.id);
    if (station?.operatorId && station.operatorId !== input.playerId) {
      return undefined;
    }
    if (station?.phase === 'lockout') {
      return step('lockout', guidance.hint.lockout, [target.id]);
    }
    if (missingStamp(folder, input.story(folder.storyId), target.station)) {
      return step('work', guidance.hint.work(workKey), [target.id]);
    }
  }
  if (target.kind === 'desk') {
    const desk = input.desks.find((d) => d.id === target.id);
    if (desk?.operatorId && desk.operatorId !== input.playerId) {
      return undefined;
    }
    return step('openDesk', guidance.hint.openDesk(workKey), [target.id]);
  }
  return step('pickupHere', guidance.hint.pickupHere[input.device], [target.id]);
}

/** Folders on fixtures nobody is working at, most urgent first. */
function waitingFolders(input: NextStepInput, kind: Fixture['kind']): Folder[] {
  const busy = new Set<string>();
  for (const s of input.stations) {
    if (s.operatorId !== null) busy.add(s.id);
  }
  for (const d of input.desks) {
    if (d.operatorId !== null) busy.add(d.id);
  }
  const fixtureIds = new Set(
    input.map.fixtures.filter((f) => f.kind === kind && !busy.has(f.id)).map((f) => f.id),
  );
  return input.folders
    .filter((f) => f.location.kind === 'fixture' && fixtureIds.has(f.location.fixtureId))
    .sort(byDeadline);
}

function fixtureOf(folder: Folder): string {
  return folder.location.kind === 'fixture' ? folder.location.fixtureId : '';
}

export function nextStep(input: NextStepInput): NextStep {
  const { guidance } = pl;
  const { playerId } = input;
  if (playerId === null) {
    return step('wait', guidance.hint.wait);
  }

  const desk = input.desks.find((d) => d.operatorId === playerId);
  if (desk) {
    return step('verdict', guidance.hint.verdict);
  }
  const station = input.stations.find((s) => s.operatorId === playerId);
  if (station?.phase === 'minigame') {
    return step('minigame', guidance.hint.minigame);
  }
  if (station?.phase === 'working') {
    return step('working', guidance.hint.working, [station.id]);
  }

  const carried = input.folders.find(
    (f) => f.location.kind === 'carried' && f.location.playerId === playerId,
  );
  if (carried) {
    return carryingStep(input, carried);
  }

  const target = input.map.fixtures.find((f) => f.id === input.targetFixtureId);
  const here = target ? stepAtTarget(input, target) : undefined;
  if (here) {
    return here;
  }

  const onConveyor = waitingFolders(input, 'conveyor')[0];
  if (onConveyor) {
    return step('pickup', guidance.hint.pickupConveyor, [fixtureOf(onConveyor)]);
  }
  // Folders left on tables, stations and desks; most urgent first.
  const elsewhere = [
    ...waitingFolders(input, 'table'),
    ...waitingFolders(input, 'station'),
    ...waitingFolders(input, 'desk'),
  ].sort(byDeadline)[0];
  if (elsewhere) {
    return step('pickup', guidance.hint.pickupWaiting, [fixtureOf(elsewhere)]);
  }
  return step('wait', guidance.hint.wait);
}

/** Two steps say and point at the same thing (avoids store churn). */
export function sameStep(a: NextStep | null, b: NextStep | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.kind === b.kind &&
    a.text === b.text &&
    a.targetFixtureIds.length === b.targetFixtureIds.length &&
    a.targetFixtureIds.every((id, i) => b.targetFixtureIds[i] === id)
  );
}
