// A balance bot: plays one crew member through the real simulation by producing the same
// per-tick inputs and commands a client would send (move, interact, hold work, minigame result,
// verdict). It sees only the game state, never the sim's RNG. Skill is a SkillProfile; the
// models are assumptions, see models.ts and docs/balance.md.
import {
  abilityEnvOf,
  abilityOf,
  abilityPreview,
  carriedFolder,
  countsAsProof,
  createRng,
  type Difficulty,
  type Folder,
  folderOnFixture,
  type GameState,
  MINIGAME_STABLE_SEED_STATIONS,
  minigameTimeLimitMs,
  PLAYER_SPEED_TILES_PER_S,
  type PlayerCommand,
  type PlayerInput,
  type Rng,
  ROLE_PERKS,
  raidOfFolder,
  requiredStampsOf,
  type SimContext,
  type SimStory,
  type StationKind,
  VERDICTS,
  type Vec2,
  type Verdict,
  workDurationMs,
} from '../../packages/shared/src/index.ts';
import {
  DIFFICULTY_FAIL_FACTOR,
  MAX_FAIL_CHANCE,
  MINIGAME_BASE_S,
  MINIGAME_DIFFICULTY,
  MINIGAME_FAIL_AT,
  MINIGAME_SPREAD,
  RETRY_FAIL_FACTOR,
  type SkillProfile,
} from './models.ts';
import { directionToFixture, distanceTo, nextWaypoint, walkSeconds } from './nav.ts';

/** Shared by the crew: which folder each player has taken. */
export class Team {
  readonly claims = new Map<string, string>();
}

type Phase =
  | 'idle'
  | 'toPickup'
  | 'pickupVerify'
  | 'decide'
  | 'walk'
  | 'placeVerify'
  | 'work'
  | 'minigame'
  | 'afterGame'
  | 'collect'
  | 'collectVerify'
  | 'deskWait'
  | 'think';

type Target = { fixtureId: string; station: StationKind | null };

/** What the bot remembers about a folder it handles. */
type Memory = {
  informed: boolean;
  visited: Set<StationKind>;
  order: StationKind[];
  direct: Verdict | null;
  recognised: boolean | undefined;
  /** Stations where a minigame for this folder already failed (for the retry model). */
  failedAt: Set<StationKind>;
};

export type BotOutput = {
  move: Vec2;
  interact: boolean;
  work: boolean;
  commands: PlayerCommand[];
};

const STILL: Vec2 = { x: 0, y: 0 };
const RETRY_WAIT_MS = 400;
const WORK_WATCHDOG_MS = 45_000;
const DESK_WATCHDOG_MS = 20_000;
const WAIT_FOR_STATION_MS = 6000;
const EMERGENCY_MS = 5000;
const RANK_BONUS_MS = { normal: 0, important: 10_000, urgent: 20_000 } as const;

export class Bot {
  private phase: Phase = 'idle';
  private readyAtMs = 0;
  private idleSinceMs = 0;
  private folderId: string | null = null;
  private target: Target | null = null;
  private faced = false;
  private seq = 0;
  private attempts = 0;
  private phaseSinceMs = 0;
  private waitSinceMs: number | null = null;
  private resultAtMs = 0;
  private resultSuccess = false;
  private stationFailures = 0;
  private verdictAtMs = 0;
  private readonly memory = new Map<string, Memory>();
  private readonly wanted = new Map<string, boolean>();
  private readonly rng: Rng;
  private readonly abilityUser: boolean;

  constructor(
    readonly playerId: string,
    private readonly profile: SkillProfile,
    private readonly team: Team,
    seed: number,
    private readonly difficulty: Difficulty,
  ) {
    this.rng = createRng(seed);
    this.abilityUser = this.rng.next() < profile.usesAbility;
  }

  /** The next input and commands, given the state after the previous tick. */
  act(state: GameState, ctx: SimContext): BotOutput {
    const out: BotOutput = { move: STILL, interact: false, work: false, commands: [] };
    const now = state.elapsedMs;
    if (this.folderId !== null && !(this.folderId in state.folders)) {
      this.reset(now);
    }
    this.maybeUseAbility(state, ctx, out);
    this.stepPhase(state, ctx, out);
    return out;
  }

  /** The `PlayerInput` for the output (the harness numbers inputs per player). */
  toInput(out: BotOutput): PlayerInput {
    return { seq: this.seq++, move: out.move, actions: { interact: out.interact, work: out.work } };
  }

  // --- Phases -------------------------------------------------------------------------------

  private stepPhase(state: GameState, ctx: SimContext, out: BotOutput): void {
    const now = state.elapsedMs;
    switch (this.phase) {
      case 'idle': {
        if (now < this.readyAtMs) {
          return;
        }
        const folder = this.pickJob(state, ctx);
        if (folder?.location.kind !== 'fixture') {
          return;
        }
        this.team.claims.set(folder.id, this.playerId);
        this.folderId = folder.id;
        this.setTarget({ fixtureId: folder.location.fixtureId, station: null });
        this.attempts = 0;
        this.enter('toPickup', now);
        return;
      }
      case 'toPickup': {
        const folder = this.folder(state);
        if (folder?.location.kind !== 'fixture') {
          // Someone else took it, or it expired: forget it.
          this.reset(now);
          return;
        }
        if (this.approach(state, ctx, out)) {
          out.interact = true;
          this.enter('pickupVerify', now);
        }
        return;
      }
      case 'pickupVerify': {
        if (carriedFolder(state, this.playerId)?.id === this.folderId) {
          this.enter('decide', now);
          this.stepPhase(state, ctx, out);
        } else if (++this.attempts >= 3) {
          this.reset(now);
        } else {
          this.enter('toPickup', now);
          this.faced = false;
        }
        return;
      }
      case 'decide': {
        const folder = this.folder(state);
        if (!folder || now < this.readyAtMs) {
          return;
        }
        const plan = this.plan(state, ctx, folder);
        if (plan === 'wait') {
          return;
        }
        this.waitSinceMs = null;
        this.setTarget(plan);
        this.attempts = 0;
        this.enter('walk', now);
        this.stepPhase(state, ctx, out);
        return;
      }
      case 'walk': {
        if (this.target && this.approach(state, ctx, out)) {
          out.interact = true;
          this.enter('placeVerify', now);
        }
        return;
      }
      case 'placeVerify': {
        const folder = this.folder(state);
        const target = this.target;
        if (!folder || !target) {
          return;
        }
        const placed =
          folder.location.kind === 'fixture' && folder.location.fixtureId === target.fixtureId;
        if (!placed) {
          // The spot was taken in the meantime: choose again.
          this.enter(++this.attempts >= 4 ? 'decide' : 'walk', now);
          this.faced = this.attempts < 4;
          return;
        }
        this.stationFailures = 0;
        if (target.station) {
          this.enter('work', now);
        } else {
          this.enter('deskWait', now);
        }
        out.work = true;
        return;
      }
      case 'work': {
        const target = this.target;
        const station = target ? state.stations[target.fixtureId] : undefined;
        if (!target || !station) {
          return;
        }
        out.work = true;
        if (station.outageMs > 0 || now - this.phaseSinceMs > WORK_WATCHDOG_MS) {
          out.work = false;
          this.enter('collect', now);
          return;
        }
        if (station.operatorId === this.playerId && station.phase === 'minigame') {
          this.planMinigame(state, station.kind, this.mem(state, ctx));
          this.enter('minigame', now);
        }
        return;
      }
      case 'minigame': {
        const target = this.target;
        const station = target ? state.stations[target.fixtureId] : undefined;
        if (!target || !station) {
          return;
        }
        if (station.operatorId !== this.playerId || station.phase !== 'minigame') {
          out.work = true;
          this.enter('work', now);
          return;
        }
        if (now >= this.resultAtMs) {
          out.commands.push({
            kind: 'minigameResult',
            stationId: target.fixtureId,
            success: this.resultSuccess,
          });
          this.enter('afterGame', now);
        }
        return;
      }
      case 'afterGame': {
        const mem = this.mem(state, ctx);
        const kind = this.target?.station;
        if (!this.resultSuccess && kind && mem) {
          mem.failedAt.add(kind);
        }
        if (this.resultSuccess || ++this.stationFailures >= this.profile.maxStationFailures) {
          if (kind && mem) {
            mem.visited.add(kind);
          }
          this.enter('collect', now);
          this.stepPhase(state, ctx, out);
        } else {
          out.work = true;
          this.enter('work', now);
        }
        return;
      }
      case 'collect': {
        out.interact = true;
        this.enter('collectVerify', now);
        return;
      }
      case 'collectVerify': {
        if (carriedFolder(state, this.playerId)?.id === this.folderId) {
          this.enter('decide', now);
          this.stepPhase(state, ctx, out);
        } else if (++this.attempts >= 6) {
          this.reset(now);
        } else {
          this.enter('collect', now);
        }
        return;
      }
      case 'deskWait': {
        out.work = true;
        const target = this.target;
        const desk = target ? state.desks[target.fixtureId] : undefined;
        if (desk?.operatorId === this.playerId) {
          this.verdictAtMs = now + this.thinkMs(state);
          this.enter('think', now);
        } else if (now - this.phaseSinceMs > DESK_WATCHDOG_MS) {
          out.work = false;
          this.enter('collect', now);
        }
        return;
      }
      case 'think': {
        out.work = true;
        const folder = this.folder(state);
        const story = folder ? ctx.stories[folder.storyId] : undefined;
        if (now < this.verdictAtMs || !folder || !story) {
          return;
        }
        const mem = this.mem(state, ctx);
        const call = this.chooseVerdict(folder, story, mem);
        out.commands.push({
          kind: 'verdict',
          folderId: folder.id,
          verdict: call.verdict,
          justifyingStampIds: call.stampIds.length > 0 ? call.stampIds : ['none'],
        });
        out.work = false;
        // The folder disappears next tick; the bot is free again after a reaction delay.
        this.reset(now);
        return;
      }
    }
  }

  // --- Decisions ----------------------------------------------------------------------------

  /** The next idle job: an unclaimed folder on the conveyor. */
  private pickJob(state: GameState, ctx: SimContext): Folder | undefined {
    const now = state.elapsedMs;
    const conveyors = new Set(
      ctx.map.fixtures.filter((f) => f.kind === 'conveyor').map((f) => f.id),
    );
    const idleMs = now - this.idleSinceMs;
    const candidates: Folder[] = [];
    for (const folder of Object.values(state.folders)) {
      if (
        folder.location.kind !== 'fixture' ||
        !conveyors.has(folder.location.fixtureId) ||
        this.team.claims.has(folder.id)
      ) {
        continue;
      }
      const raid = raidOfFolder(state, folder.id);
      if (raid?.folderIds.some((id) => this.team.claims.has(id))) {
        continue;
      }
      const story = ctx.stories[folder.storyId];
      if (story?.priority === 'normal' && !this.wantsFolder(folder.id) && idleMs < 8000) {
        continue;
      }
      candidates.push(folder);
    }
    if (candidates.length === 0) {
      return undefined;
    }
    const rank = (folder: Folder): number => {
      if (this.profile.id === 'rookie') {
        return folder.spawnedAtMs; // first come, first served
      }
      const priority = ctx.stories[folder.storyId]?.priority ?? 'normal';
      return folder.deadlineMs - RANK_BONUS_MS[priority];
    };
    candidates.sort((a, b) => rank(a) - rank(b));
    return candidates[0];
  }

  /** Decided once per folder: low-priority folders are skipped with `ignoreNormal` chance. */
  private wantsFolder(folderId: string): boolean {
    let wanted = this.wanted.get(folderId);
    if (wanted === undefined) {
      wanted = this.rng.next() >= this.profile.ignoreNormal;
      this.wanted.set(folderId, wanted);
    }
    return wanted;
  }

  /** Where to carry the folder next: a station, the desk, or wait for a free spot. */
  private plan(state: GameState, ctx: SimContext, folder: Folder): Target | 'wait' {
    const now = state.elapsedMs;
    const mem = this.mem(state, ctx);
    const story = ctx.stories[folder.storyId];
    if (!mem || !story) {
      return this.deskTarget(state, ctx);
    }
    // Enough proof once the folder holds as many proofs as the story needs; the AI scanner's
    // stamp is only a hint and never counts (`countsAsProof`).
    const proofs = folder.stamps.filter((id) => countsAsProof(story, id)).length;
    const holdsProof = proofs >= requiredStampsOf(story);
    if (holdsProof && mem.recognised === undefined) {
      mem.recognised = this.rng.next() < this.profile.recognise;
    }
    const waited = this.waitSinceMs === null ? 0 : now - this.waitSinceMs;
    const enough =
      mem.direct !== null ||
      (holdsProof && mem.recognised === true) ||
      mem.visited.size >= this.profile.patience;

    let stationChoice: StationKind | 'desk' | 'wait' = 'desk';
    if (!enough) {
      stationChoice = this.chooseStation(state, ctx, folder, story, mem, waited);
    }
    if (stationChoice === 'wait') {
      this.waitSinceMs ??= now;
      this.readyAtMs = now + RETRY_WAIT_MS;
      return 'wait';
    }
    if (stationChoice === 'desk') {
      return this.deskTarget(state, ctx);
    }
    const fixture = ctx.map.fixtures.find((f) => f.station === stationChoice);
    return fixture
      ? { fixtureId: fixture.id, station: stationChoice }
      : this.deskTarget(state, ctx);
  }

  private chooseStation(
    state: GameState,
    ctx: SimContext,
    folder: Folder,
    story: SimStory,
    mem: Memory,
    waitedMs: number,
  ): StationKind | 'desk' | 'wait' {
    const me = state.players[this.playerId];
    if (!me) {
      return 'desk';
    }
    // Stations whose stamp proves the verdict (never the hint-only AI scanner).
    const justifying = new Set(
      story.stamps.filter((s) => countsAsProof(story, s.id)).map((s) => s.station),
    );
    const open = ctx.level.stations.filter((kind) => !mem.visited.has(kind));
    const usable = open.filter((kind) => {
      const fixture = ctx.map.fixtures.find((f) => f.station === kind);
      return fixture !== undefined && (state.stations[fixture.id]?.outageMs ?? 0) <= 0;
    });
    if (usable.length === 0) {
      // Only broken stations are left: wait for a short outage, else go on without them.
      const shortOutage = open.some((kind) => {
        const fixture = ctx.map.fixtures.find((f) => f.station === kind);
        return fixture !== undefined && (state.stations[fixture.id]?.outageMs ?? 0) <= 8000;
      });
      return shortOutage && waitedMs < 10_000 ? 'wait' : 'desk';
    }
    const isFree = (kind: StationKind): boolean => {
      const fixture = ctx.map.fixtures.find((f) => f.station === kind);
      if (!fixture) {
        return false;
      }
      const station = state.stations[fixture.id];
      return !folderOnFixture(state, fixture.id) && station?.operatorId == null;
    };
    const cost = (kind: StationKind): number => {
      const fixture = ctx.map.fixtures.find((f) => f.station === kind);
      const walk = fixture ? walkSeconds(distanceTo(ctx.map, fixture.id, me)) : 99;
      return walk + workDurationMs(state, this.playerId, kind, ctx.tuning) / 1000;
    };
    // Like guidance, the folder's bag station comes first among the proof stations.
    const bagFirst = (k: StationKind) => (k === folder.bagStation ? 0 : 1);
    const ordered = mem.informed
      ? [
          ...usable
            .filter((k) => justifying.has(k))
            .sort((a, b) => bagFirst(a) - bagFirst(b) || cost(a) - cost(b)),
          ...mem.order.filter((k) => usable.includes(k) && !justifying.has(k)),
        ]
      : mem.order.filter((k) => usable.includes(k));
    const pool =
      mem.informed && ordered.some((k) => justifying.has(k))
        ? ordered.filter((k) => justifying.has(k))
        : ordered;
    const free = pool.find(isFree);
    if (free) {
      return free;
    }
    if (waitedMs < WAIT_FOR_STATION_MS) {
      return 'wait';
    }
    // Waited long enough: take any free station, else go on to the desk.
    return ordered.find(isFree) ?? 'desk';
  }

  private deskTarget(state: GameState, ctx: SimContext): Target | 'wait' {
    const me = state.players[this.playerId];
    const desks = ctx.map.fixtures.filter((f) => f.kind === 'desk');
    const free = desks.filter(
      (d) => !folderOnFixture(state, d.id) && state.desks[d.id]?.operatorId == null,
    );
    if (free.length === 0) {
      this.waitSinceMs ??= state.elapsedMs;
      this.readyAtMs = state.elapsedMs + RETRY_WAIT_MS;
      return 'wait';
    }
    free.sort((a, b) => (me ? distanceTo(ctx.map, a.id, me) - distanceTo(ctx.map, b.id, me) : 0));
    return { fixtureId: (free[0] ?? desks[0])?.id ?? '', station: null };
  }

  private mem(state: GameState, ctx: SimContext): Memory | undefined {
    const folder = this.folder(state);
    if (!folder) {
      return undefined;
    }
    let mem = this.memory.get(folder.id);
    if (!mem) {
      const order = [...ctx.level.stations];
      for (let i = order.length - 1; i > 0; i--) {
        const j = this.rng.int(i + 1);
        [order[i], order[j]] = [order[j] as StationKind, order[i] as StationKind];
      }
      let direct: Verdict | null = null;
      if (folder.tag?.kind === 'correction' && this.rng.next() < this.profile.recogniseCorrection) {
        direct = 'publishWithContext';
      } else if (folder.tag?.kind === 'bossCall' && this.rng.next() < this.profile.obeyBoss) {
        direct = 'publish';
      }
      mem = {
        informed: this.rng.next() < this.profile.insight,
        visited: new Set(),
        order,
        direct,
        recognised: undefined,
        failedAt: new Set(),
      };
      this.memory.set(folder.id, mem);
    }
    return mem;
  }

  private chooseVerdict(
    folder: Folder,
    story: SimStory,
    mem: Memory | undefined,
  ): { verdict: Verdict; stampIds: string[] } {
    const held = story.stamps.filter((s) => folder.stamps.includes(s.id));
    const cited = citeStamps(story, folder.stamps);
    if (mem?.direct) {
      return { verdict: mem.direct, stampIds: cited };
    }
    const holdsJustifying = held.some((s) => story.justifyingStamps.includes(s.id));
    const misled = held.some((s) => s.relevance === 'misleading');
    const p = holdsJustifying
      ? this.profile.verdictAccuracy
      : misled
        ? this.profile.guessAccuracy * 0.6
        : this.profile.guessAccuracy;
    let verdict = story.correctVerdict;
    if (this.rng.next() >= p) {
      const others = VERDICTS.filter((v) => v !== story.correctVerdict);
      verdict = others[this.rng.int(others.length)] as Verdict;
    }
    // A wrong justification: one cited stamp is swapped for a held stamp that proves nothing.
    const wrong = held.filter(
      (s) => !story.justifyingStamps.includes(s.id) && !cited.includes(s.id),
    );
    const citesJustifying = cited.some((id) => story.justifyingStamps.includes(id));
    if (citesJustifying && wrong.length > 0 && this.rng.next() < this.profile.wrongJustification) {
      const swap = wrong[this.rng.int(wrong.length)];
      if (swap) {
        cited[cited.length - 1] = swap.id;
      }
    }
    return { verdict, stampIds: cited };
  }

  private planMinigame(state: GameState, kind: StationKind, mem: Memory | undefined): void {
    const role = state.crew[this.playerId]?.role ?? null;
    let durationMs =
      MINIGAME_BASE_S[kind] *
      1000 *
      this.profile.minigameSpeed *
      (1 + MINIGAME_SPREAD * (this.rng.next() * 2 - 1));
    if (kind === 'phone' && !(role && ROLE_PERKS[role].skipsPhoneQueue)) {
      durationMs += 2500 + this.rng.next() * 2000; // the queue (PHONE_QUEUE_MIN/MAX_MS)
    }
    const retry = mem?.failedAt.has(kind) ?? false;
    const chance = failChance(this.profile, kind, this.difficulty, retry);
    let success = this.rng.next() >= chance;
    if (!success) {
      durationMs *= MINIGAME_FAIL_AT;
    }
    const limitMs = minigameTimeLimitMs(this.difficulty);
    if (durationMs >= limitMs) {
      durationMs = limitMs;
      success = false;
    }
    this.resultAtMs = state.elapsedMs + durationMs;
    this.resultSuccess = success;
  }

  /**
   * Presses the role ability when the shared preview says it acts now, as a client would. Only
   * Przedłużenie has a policy so far: the managing editor saves a claimed folder that is about to
   * expire when the preview targets it (S7-46 adds the other abilities).
   */
  private maybeUseAbility(state: GameState, ctx: SimContext, out: BotOutput): void {
    const ability = abilityOf(state.crew[this.playerId]?.role ?? null);
    if (!this.abilityUser || ability !== 'extendDeadline') {
      return;
    }
    const preview = abilityPreview(state, this.playerId, abilityEnvOf(ctx));
    const folder =
      preview.kind === 'now' && preview.folderId ? state.folders[preview.folderId] : undefined;
    if (
      folder &&
      this.team.claims.has(folder.id) &&
      folder.deadlineMs - state.elapsedMs < EMERGENCY_MS
    ) {
      out.commands.push({ kind: 'useAbility' });
    }
  }

  // --- Helpers ------------------------------------------------------------------------------

  private folder(state: GameState): Folder | undefined {
    return this.folderId ? state.folders[this.folderId] : undefined;
  }

  private enter(phase: Phase, now: number): void {
    this.phase = phase;
    this.phaseSinceMs = now;
  }

  private setTarget(target: Target): void {
    this.target = target;
    this.faced = false;
  }

  private reset(now: number): void {
    if (this.folderId) {
      this.team.claims.delete(this.folderId);
    }
    this.folderId = null;
    this.target = null;
    this.waitSinceMs = null;
    this.phase = 'idle';
    this.phaseSinceMs = now;
    this.idleSinceMs = now;
    this.readyAtMs = Math.max(this.readyAtMs, now + this.reaction());
  }

  private reaction(): number {
    const [min, max] = this.profile.reactionMs;
    return min + this.rng.next() * (max - min);
  }

  private thinkMs(state: GameState): number {
    const [min, max] = this.profile.verdictThinkMs;
    const wanted = min + this.rng.next() * (max - min);
    const folder = this.folder(state);
    const left = folder ? folder.deadlineMs - state.elapsedMs : wanted;
    // Under pressure people decide faster, but never instantly.
    return Math.max(min * 0.4, Math.min(wanted, left - 600));
  }

  /**
   * Walks towards the target fixture and turns to face it. Returns true once the bot stands
   * in place facing the fixture.
   */
  private approach(state: GameState, ctx: SimContext, out: BotOutput): boolean {
    const target = this.target;
    const me = state.players[this.playerId];
    if (!target || !me) {
      return false;
    }
    if (this.faced) {
      return true;
    }
    const waypoint = nextWaypoint(ctx.map, target.fixtureId, me);
    if (waypoint === 'arrived') {
      out.move = directionToFixture(ctx.map, target.fixtureId, me);
      this.faced = true;
      return false; // turning takes this tick; act on the next one
    }
    if (!waypoint) {
      return false;
    }
    const dx = waypoint.x - me.x;
    const dy = waypoint.y - me.y;
    const length = Math.hypot(dx, dy);
    const stepTiles = (PLAYER_SPEED_TILES_PER_S * ctx.dtMs) / 1000;
    const magnitude = Math.min(this.profile.walkFactor, length / stepTiles);
    out.move = { x: (dx / length) * magnitude, y: (dy / length) * magnitude };
    return false;
  }
}

/**
 * The stamps a verdict cites: as many as the story needs (`requiredStamps`) or as the folder
 * holds, proofs first (`countsAsProof`), then other justifying stamps (the AI scanner's hint,
 * which never counts), then the rest, each group in the story's stamp order.
 */
export function citeStamps(story: SimStory, folderStamps: readonly string[]): string[] {
  const held = story.stamps.filter((s) => folderStamps.includes(s.id)).map((s) => s.id);
  const rank = (id: string) =>
    countsAsProof(story, id) ? 0 : story.justifyingStamps.includes(id) ? 1 : 2;
  const ordered = [...held].sort((a, b) => rank(a) - rank(b));
  return ordered.slice(0, Math.min(requiredStampsOf(story), ordered.length));
}

/**
 * Chance that one minigame attempt fails: the profile's chance × the station's fiddliness × the
 * difficulty factor, halved again on a retry at a station that keeps its puzzle
 * (MINIGAME_STABLE_SEED_STATIONS), capped at MAX_FAIL_CHANCE.
 */
export function failChance(
  profile: Pick<SkillProfile, 'minigameFailChance'>,
  kind: StationKind,
  difficulty: Difficulty,
  retry: boolean,
): number {
  const retryFactor = retry && MINIGAME_STABLE_SEED_STATIONS.includes(kind) ? RETRY_FAIL_FACTOR : 1;
  return Math.min(
    MAX_FAIL_CHANCE,
    profile.minigameFailChance *
      MINIGAME_DIFFICULTY[kind] *
      DIFFICULTY_FAIL_FACTOR[difficulty] *
      retryFactor,
  );
}
