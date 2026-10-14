// "What next" for the local player (agents/design-rules.md §1.6): one short line and the
// fixtures it points at. Pure: everything comes in as arguments, so every case is unit-tested.
// It never reveals a story's truth or verdict; it only points at stations whose stamp the
// folder still lacks (the ones whose stamp proves a verdict first) and at the desk once the
// folder holds as many proofs as its story needs (`requiredStamps`, S7-19; the hint-only AI
// scanner never is one). A dealt folder's bag station (`folder.bagStation`, S7-24) comes first
// among the stations it would point at anyway, so flex stories spread over the stations the bag
// planned instead of drifting back to the busiest one.
// With a role, a ready ability that would help right now takes the hint (S7-45): Przedłużenie
// for a warned folder in hand, Telefon z terenu instead of the walk to the phone and Druga
// szansa at a locked station. The bubble hides on Ekspert with every other hint.
import {
  type Ability,
  type AbilityPreview,
  countsAsProof,
  type Desk,
  type Fixture,
  type Folder,
  type ProofStory,
  requiredStampsOf,
  type StationKind,
  type TileMap,
} from '@redakcja/shared';
import type { NextFolderState } from '../hud/hud-model.ts';
import { abilityKeyCap } from '../screens/settings-model.ts';
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
  /** The station in front of the player is locked after a failed minigame but holds a folder. */
  | 'lockout'
  /** Carrying a folder with all the proofs it needs: take it to a desk. */
  | 'toDesk'
  /** At a desk with a folder on it: hold work to open the verdict sheet. */
  | 'openDesk'
  /** The verdict sheet is open. */
  | 'verdict'
  /** The local role ability would help right now: press it (S7-45). */
  | 'ability'
  /** Nothing to do: no folders anywhere (says when the next scheduled folder comes). */
  | 'wait';

export type NextStep = {
  kind: NextStepKind;
  text: string;
  /** Fixtures to mark in the scene, most useful first. */
  targetFixtureIds: string[];
  /** The ability an `ability` step names (its icon in the bubble). */
  ability?: Ability;
};

/** The local player's role ability as the hint reads it. */
export type NextStepAbility = {
  ability: Ability;
  preview: AbilityPreview;
  /** The ability's key on the current device (`abilityHintKey`). */
  key: string;
};

/**
 * What next-step needs to know about a story: its stamps, which of them justify, and how many
 * proofs a verdict must cite (absent means 1).
 */
export type StoryStamps = ProofStory & { requiredStamps?: number };

export type NextStepInput = {
  playerId: string | null;
  folders: readonly Folder[];
  stations: readonly {
    id: string;
    operatorId: string | null;
    phase: string;
    /** > 0 while the station is down (outage event). */
    outageMs?: number;
  }[];
  desks: readonly Desk[];
  map: TileMap;
  /** The fixture the local player currently faces (their interaction target), if any. */
  targetFixtureId: string | null;
  device: InputDevice;
  story(storyId: string): StoryStamps | undefined;
  /** The next scheduled folder (`nextFolderState`): the wait hint counts down to it, and a full
   * belt turns the conveyor pick-up into „Taśma pełna”. */
  next: NextFolderState;
  /** The local role ability; absent without a role. */
  ability?: NextStepAbility;
};

/** Steps during which another piece of UI (overlay, work prompt) already says what to do. */
export const BUSY_KINDS: ReadonlySet<NextStepKind> = new Set(['working', 'minigame', 'verdict']);

/** Steps done right where the player stands: the target needs a ring, not an arrow. */
export const HERE_KINDS: ReadonlySet<NextStepKind> = new Set([
  'pickupHere',
  'dropHere',
  'work',
  'openDesk',
  'lockout',
  'ability',
]);

/** The ability's key for a hint: R / RB, or the touch button's own label in quotes. */
export function abilityHintKey(device: InputDevice, ability: Ability): string {
  return device === 'touch'
    ? pl.guidance.abilityTouchKey(pl.touch.ability[ability])
    : abilityKeyCap(device);
}

/** The ability's `now` preview, when the local ability is this one and acts at once. */
function readyNow(input: NextStepInput, ability: Ability) {
  const local = input.ability;
  return local?.ability === ability && local.preview.kind === 'now'
    ? { key: local.key, preview: local.preview }
    : undefined;
}

function abilityStep(ability: Ability, text: string, targetFixtureIds: string[] = []): NextStep {
  return { ...step('ability', text, targetFixtureIds), ability };
}

function step(kind: NextStepKind, text: string, targetFixtureIds: string[] = []): NextStep {
  return { kind, text, targetFixtureIds };
}

function folderOn(folders: readonly Folder[], fixtureId: string): Folder | undefined {
  return folders.find((f) => f.location.kind === 'fixture' && f.location.fixtureId === fixtureId);
}

/** Hint for a folder that belongs to a level event, if it has one (S4-05..S4-09). */
export function tagHint(folder: Folder): string | undefined {
  switch (folder.tag?.kind) {
    case 'viral':
      return pl.events.hint.viral;
    case 'bossCall':
      return pl.events.hint.bossCall;
    case 'botRaid':
      return pl.events.hint.botRaid;
    case 'correction':
      return pl.events.hint.correction;
    default:
      return undefined;
  }
}

function byDeadline(a: Folder, b: Folder): number {
  return a.deadlineMs - b.deadlineMs;
}

/** Distinct stamps on the folder that prove the story's verdict (never the AI scanner). */
export function justifyingCount(folder: Folder, story: StoryStamps | undefined): number {
  if (!story) {
    return 0;
  }
  return new Set(folder.stamps.filter((id) => countsAsProof(story, id))).size;
}

/**
 * Whether the folder carries as many proofs as its story needs: one for most stories, N for a
 * multi-stamp folder. The hint-only AI scanner never counts: citing it alone earns half points.
 */
export function hasEnoughProofs(folder: Folder, story: StoryStamps | undefined): boolean {
  return story !== undefined && justifyingCount(folder, story) >= requiredStampsOf(story);
}

/** The stamp a station of `kind` would add to the folder, if it still lacks it. */
function missingStamp(folder: Folder, story: StoryStamps | undefined, kind: StationKind) {
  const stamp = story?.stamps.find((s) => s.station === kind);
  return stamp && !folder.stamps.includes(stamp.id) ? stamp : undefined;
}

/**
 * Stations worth visiting with this folder: the level's stations whose stamp it still lacks,
 * the ones whose stamp would prove the verdict first, free ones (no folder on them, not locked)
 * first, and among those the folder's bag station first.
 */
export function stationsToVisit(
  folder: Folder,
  story: StoryStamps | undefined,
  input: Pick<NextStepInput, 'map' | 'folders' | 'stations'>,
): Fixture[] {
  const unchecked = input.map.fixtures.filter(
    (f) => f.kind === 'station' && f.station && missingStamp(folder, story, f.station),
  );
  const justifying = unchecked.filter((f) => {
    const stamp = f.station ? missingStamp(folder, story, f.station) : undefined;
    return stamp !== undefined && story !== undefined && countsAsProof(story, stamp.id);
  });
  const pool = justifying.length > 0 ? justifying : unchecked;
  const free = pool.filter((f) => !folderOn(input.folders, f.id) && !isLocked(input, f.id));
  return bagStationFirst(free.length > 0 ? free : pool, folder.bagStation);
}

/** The fixtures of the folder's bag station first, the rest in their order (a stable sort). */
function bagStationFirst(fixtures: Fixture[], bagStation: StationKind | undefined): Fixture[] {
  if (bagStation === undefined) {
    return fixtures;
  }
  const rank = (f: Fixture) => (f.station === bagStation ? 0 : 1);
  return [...fixtures].sort((a, b) => rank(a) - rank(b));
}

/** The station is locked after a failed minigame or down in an outage: nothing to do there. */
function isLocked(input: Pick<NextStepInput, 'stations'>, fixtureId: string): boolean {
  return input.stations.some(
    (s) => s.id === fixtureId && (s.phase === 'lockout' || (s.outageMs ?? 0) > 0),
  );
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
  // Przedłużenie on the warned folder in hand beats any walk.
  const extend = readyNow(input, 'extendDeadline');
  if (extend && folder.warned && extend.preview.folderId === folder.id) {
    return abilityStep('extendDeadline', guidance.hint.abilityExtend(extend.key));
  }
  const story = input.story(folder.storyId);
  const target = input.targetFixtureId;
  const targetFree =
    target !== null && !folderOn(input.folders, target) && !isLocked(input, target);
  // A correction needs no checking: straight to the desk.
  if (folder.tag?.kind === 'correction') {
    const desks = deskTargets(input);
    return targetFree && desks.includes(target)
      ? step('dropHere', guidance.hint.dropHere[input.device], [target])
      : step('toDesk', guidance.hint.toDesk, desks);
  }
  const visit = hasEnoughProofs(folder, story) ? [] : stationsToVisit(folder, story, input);
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
  // A reporter heading for the phone calls from the field instead.
  const call = readyNow(input, 'fieldCall');
  if (call && call.preview.folderId === folder.id && visit.some((f) => f.station === 'phone')) {
    return abilityStep('fieldCall', guidance.hint.abilityCall(call.key));
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
    if ((station?.outageMs ?? 0) > 0) {
      return step('lockout', pl.events.hint.stationDown, [target.id]);
    }
    if (station?.phase === 'lockout') {
      const second = readyNow(input, 'secondChance');
      return second?.preview.stationId === target.id
        ? abilityStep('secondChance', guidance.hint.abilitySecond(second.key), [target.id])
        : step('lockout', guidance.hint.lockout, [target.id]);
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
    // A full belt holds the next folder back: clearing it comes first, unless the folder's own
    // event hint says something more pressing.
    const conveyorText =
      input.next.kind === 'full' ? guidance.hint.conveyorFull : guidance.hint.pickupConveyor;
    return step('pickup', tagHint(onConveyor) ?? conveyorText, [fixtureOf(onConveyor)]);
  }
  // Folders left on tables, stations and desks; most urgent first.
  const elsewhere = [
    ...waitingFolders(input, 'table'),
    ...waitingFolders(input, 'station'),
    ...waitingFolders(input, 'desk'),
  ].sort(byDeadline)[0];
  if (elsewhere) {
    return step('pickup', tagHint(elsewhere) ?? guidance.hint.pickupWaiting, [
      fixtureOf(elsewhere),
    ]);
  }
  // Dropped on the floor: no fixture to mark, but the folder still needs someone.
  if (input.folders.some((f) => f.location.kind === 'floor')) {
    return step('pickup', guidance.hint.pickupWaiting);
  }
  return waitStep(input.next);
}

/** Nothing to do: how long until the next scheduled folder, while that is still ahead. */
function waitStep(next: NextFolderState): NextStep {
  const seconds = next.kind === 'in' ? Math.ceil(next.ms / 1000) : 0;
  return step('wait', seconds > 0 ? pl.guidance.hint.waitIn(seconds) : pl.guidance.hint.wait);
}

/** Two steps say and point at the same thing (avoids store churn). */
export function sameStep(a: NextStep | null, b: NextStep | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.kind === b.kind &&
    a.text === b.text &&
    a.ability === b.ability &&
    a.targetFixtureIds.length === b.targetFixtureIds.length &&
    a.targetFixtureIds.every((id, i) => b.targetFixtureIds[i] === id)
  );
}
