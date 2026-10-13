// Aggregation of bot runs into per-level statistics and the checks against the balance intent.
import {
  DIFFICULTIES,
  type Difficulty,
  ENDLESS_LEVEL_ID,
  STATION_KINDS,
  type StationKind,
} from '../../packages/shared/src/index.ts';
import type { RunResult, StarPair } from './game.ts';

export type Spread = { mean: number; p10: number; p50: number; p90: number };

export type Summary = {
  levelId: string;
  difficulty: Difficulty;
  crew: string;
  crewSize: number;
  runs: number;
  /** Share of runs that survived to the end (endless: share that reached the time cap). */
  winRate: number;
  /** Shares of runs with 0, 1, 2, 3 stars. */
  stars: [number, number, number, number];
  score: Spread;
  /** Mean of each run's score as a share of that run's best possible score (0 when unknown). */
  scoreShare: number;
  /** Mean best possible score of the runs (bag levels deal a different run per seed). */
  maxScore: number;
  /** Mean star thresholds of the runs; null for endless. */
  thresholds: StarPair | null;
  credibilityMin: Spread;
  /** Mean credibility at tenths of the level (endless: every minute). */
  trail: number[];
  /** Expired folders as a share of resolved folders. */
  expiredRate: number;
  /** Wrong verdicts and wrong justifications as a share of verdicts. */
  wrongRate: number;
  minigameFailuresPerRun: number;
  /** Mean number of level events that started per run, by kind. */
  events: Record<string, number>;
  firstVerdictS: Spread;
  /** Level time at the end of the run, in minutes (endless survival). */
  lastedMin: Spread;
  cappedShare: number;
  /** Mean share of level time each station was busy (a folder on it or an operator at it). */
  stationBusyShare: Partial<Record<StationKind, number>>;
};

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index] ?? 0;
}

export function spread(values: readonly number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.length === 0 ? 0 : sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    mean,
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
  };
}

const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

export function summarize(runs: readonly RunResult[]): Summary {
  const first = runs[0];
  if (!first) {
    throw new Error('No runs to summarise');
  }
  const n = runs.length;
  const stars: [number, number, number, number] = [0, 0, 0, 0];
  for (const run of runs) {
    const slot = Math.min(3, Math.max(0, run.stars));
    stars[slot] = (stars[slot] ?? 0) + 1 / n;
  }
  const trailLength = Math.max(...runs.map((r) => r.trail.length));
  const trail = Array.from({ length: trailLength }, (_, i) =>
    mean(runs.map((r) => r.trail[i] ?? r.trail[r.trail.length - 1] ?? 0)),
  );
  const eventKinds = new Set(runs.flatMap((r) => Object.keys(r.events)));
  const events: Record<string, number> = {};
  for (const kind of eventKinds) {
    events[kind] = mean(runs.map((r) => (r.events as Record<string, number>)[kind] ?? 0));
  }
  const resolved = runs.reduce((a, r) => a + r.resolved, 0);
  const verdicts = runs.reduce((a, r) => a + r.correct + r.wrong + r.wrongJustification, 0);
  const withThresholds = runs.flatMap((r) => (r.thresholds ? [r.thresholds] : []));
  const busy: Partial<Record<StationKind, number>> = {};
  for (const kind of STATION_KINDS) {
    const shares = runs.flatMap((r) => {
      const share = r.stationBusyShare[kind];
      return share === undefined ? [] : [share];
    });
    if (shares.length > 0) {
      busy[kind] = mean(shares);
    }
  }
  return {
    levelId: first.levelId,
    difficulty: first.difficulty,
    crew: first.crew,
    crewSize: first.crewSize,
    runs: n,
    winRate: runs.filter((r) => r.won).length / n,
    stars,
    score: spread(runs.map((r) => r.score)),
    scoreShare: mean(runs.map((r) => (r.maxScore > 0 ? r.score / r.maxScore : 0))),
    maxScore: mean(runs.map((r) => r.maxScore)),
    thresholds:
      withThresholds.length === 0
        ? null
        : {
            two: mean(withThresholds.map((t) => t.two)),
            three: mean(withThresholds.map((t) => t.three)),
          },
    credibilityMin: spread(runs.map((r) => r.credibilityMin)),
    trail,
    expiredRate: resolved === 0 ? 0 : runs.reduce((a, r) => a + r.expired, 0) / resolved,
    wrongRate:
      verdicts === 0 ? 0 : runs.reduce((a, r) => a + r.wrong + r.wrongJustification, 0) / verdicts,
    minigameFailuresPerRun: mean(runs.map((r) => r.minigameFailures)),
    events,
    firstVerdictS: spread(runs.flatMap((r) => (r.firstVerdictS === null ? [] : [r.firstVerdictS]))),
    lastedMin: spread(runs.map((r) => r.endedAtS / 60)),
    cappedShare: runs.filter((r) => r.capped).length / n,
    stationBusyShare: busy,
  };
}

export function groupKey(run: RunResult): string {
  return `${run.levelId}|${run.difficulty}|${run.crew}|${run.crewSize}`;
}

export function summarizeAll(runs: readonly RunResult[]): Summary[] {
  const groups = new Map<string, RunResult[]>();
  for (const run of runs) {
    const key = groupKey(run);
    const list = groups.get(key) ?? [];
    list.push(run);
    groups.set(key, list);
  }
  return [...groups.values()].map(summarize);
}

// --- Formatting ------------------------------------------------------------------------------

const pct = (v: number) => `${Math.round(v * 100)}%`;
const f0 = (v: number) => String(Math.round(v));
const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

export function formatEventCounts(events: Record<string, number>): string {
  const parts = Object.entries(events)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k} ${f1(v)}`);
  return parts.length > 0 ? parts.join(', ') : '-';
}

/** Markdown table of campaign summaries for one level. */
export function campaignTable(rows: readonly Summary[]): string {
  const head =
    '| Crew | Win | 0 / 1 / 2 / 3 stars | Score p10 / p50 / p90 | Score of max | Min credibility (mean) | Expired | Wrong verdicts | First verdict |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const body = rows.map(
    (s) =>
      `| ${s.crew} ×${s.crewSize} | ${pct(s.winRate)} | ${s.stars.map(pct).join(' / ')} | ${f0(s.score.p10)} / ${f0(s.score.p50)} / ${f0(s.score.p90)} | ${pct(s.scoreShare)} | ${f0(s.credibilityMin.mean)} | ${pct(s.expiredRate)} | ${pct(s.wrongRate)} | ${f0(s.firstVerdictS.p50)} s |`,
  );
  return [head, ...body].join('\n');
}

/** Markdown table of the credibility trajectory (tenths of the level). */
export function trailTable(rows: readonly Summary[]): string {
  const head = `| Crew | ${Array.from({ length: 10 }, (_, i) => `${(i + 1) * 10}%`).join(' | ')} |\n| --- | ${Array.from({ length: 10 }, () => '---').join(' | ')} |`;
  const body = rows.map((s) => `| ${s.crew} ×${s.crewSize} | ${s.trail.map(f0).join(' | ')} |`);
  return [head, ...body].join('\n');
}

export function endlessTable(rows: readonly Summary[]): string {
  const head =
    '| Crew | Lasted p10 / p50 / p90 (min) | Reached 20 min cap | Score p50 | Expired | Events per run |\n| --- | --- | --- | --- | --- | --- |';
  const body = rows.map(
    (s) =>
      `| ${s.crew} ×${s.crewSize} | ${f1(s.lastedMin.p10)} / ${f1(s.lastedMin.p50)} / ${f1(s.lastedMin.p90)} | ${pct(s.cappedShare)} | ${f0(s.score.p50)} | ${pct(s.expiredRate)} | ${formatEventCounts(s.events)} |`,
  );
  return [head, ...body].join('\n');
}

/**
 * Markdown table of station load: the mean busy share of each station for the average crew of
 * three, one row per level and difficulty, with the spread (busiest / least busy station).
 */
export function stationLoadTable(summaries: readonly Summary[]): string {
  const rows = summaries
    .filter((s) => s.crew === 'average' && s.crewSize === 3)
    .sort(
      (a, b) =>
        // Campaign levels by id, endless last (as in the per-level sections).
        Number(a.levelId === ENDLESS_LEVEL_ID) - Number(b.levelId === ENDLESS_LEVEL_ID) ||
        a.levelId.localeCompare(b.levelId) ||
        DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty),
    );
  const kinds = STATION_KINDS.filter((kind) =>
    rows.some((s) => s.stationBusyShare[kind] !== undefined),
  );
  const head =
    `| Level | Difficulty | ${kinds.join(' | ')} | Spread (max / min) |\n` +
    `| --- | --- | ${kinds.map(() => '---').join(' | ')} | --- |`;
  const body = rows.map((s) => {
    const cells = kinds.map((kind) => {
      const share = s.stationBusyShare[kind];
      return share === undefined ? '-' : pct(share);
    });
    return `| ${s.levelId} | ${s.difficulty} | ${cells.join(' | ')} | ${f1(loadSpread(s))} |`;
  });
  return [head, ...body].join('\n');
}

/**
 * Busiest station's share over the least busy one's (1 = perfectly even). A station that was
 * never busy counts as a hundredth of the level, so the ratio stays finite.
 */
export function loadSpread(summary: Pick<Summary, 'stationBusyShare'>): number {
  const shares = Object.values(summary.stationBusyShare);
  if (shares.length === 0) {
    return 1;
  }
  return Math.max(...shares) / Math.max(MIN_BUSY_SHARE, Math.min(...shares));
}

/** Floor for the least busy station in `loadSpread`. */
const MIN_BUSY_SHARE = 0.01;

// --- Intent checks ---------------------------------------------------------------------------

export type Check = { name: string; ok: boolean; detail: string };

type Find = (levelId: string, crew: string, size?: number) => Summary | undefined;

/**
 * The balance intent from S6-01, as pass/fail checks over the summaries. `thresholds` are the
 * levels' star thresholds and best scores, for the 55 % / 80 % guideline.
 */
export function intentChecks(
  all: readonly Summary[],
  levels: readonly { id: string; maxScore: number; stars: { two: number; three: number } }[],
): Check[] {
  // The S6-01 targets are Normal's; the other difficulties only have to keep the order.
  const summaries = all.filter((s) => s.difficulty === 'normal');
  const find: Find = (levelId, crew, size = 3) =>
    summaries.find((s) => s.levelId === levelId && s.crew === crew && s.crewSize === size);
  const checks: Check[] = [...monotonicChecks(all)];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const l1 = (crew: string) => find('l1-burza', crew);
  const rookie = l1('rookie');
  const average = l1('average');
  const expert = l1('expert');
  if (rookie && average && expert) {
    add('L1: rookies win >= 80%', rookie.winRate >= 0.8, pct(rookie.winRate));
    add(
      'L1: average reaches 2+ stars in >= 50% of runs',
      average.stars[2] + average.stars[3] >= 0.5,
      pct(average.stars[2] + average.stars[3]),
    );
    add(
      'L1: 3 stars mostly expert (rookie <= 5%, average <= 30%, expert >= 50%)',
      rookie.stars[3] <= 0.05 && average.stars[3] <= 0.3 && expert.stars[3] >= 0.5,
      `${pct(rookie.stars[3])} / ${pct(average.stars[3])} / ${pct(expert.stars[3])}`,
    );
  }
  const l6 = find('l6-atak', 'average');
  if (l6) {
    add('L6: average crew of 3 wins >= 60%', l6.winRate >= 0.6, pct(l6.winRate));
  }
  // Only the levels this report ran on Normal (a `--levels` subset skips the others).
  const ids = levels
    .map((l) => l.id)
    .filter((id) => id !== 'l0-greybox' && find(id, 'average') !== undefined);
  const shares = ids.map((id) => find(id, 'average')?.scoreShare ?? Number.NaN);
  if (shares.length > 1) {
    add(
      'Difficulty rises: average score share of L1 > L6 by >= 5 points, no level 8 points easier than the one before',
      (shares[0] ?? 0) - (shares[shares.length - 1] ?? 0) >= 0.05 &&
        shares.every((v, i) => i === 0 || v <= (shares[i - 1] ?? 1) + 0.08),
      shares.map((v) => pct(v)).join(' > '),
    );
  }
  if (ids.length > 0) {
    add(
      'No level unwinnable: expert wins >= 90% and average wins >= 60% everywhere',
      ids.every(
        (id) =>
          (find(id, 'expert')?.winRate ?? 0) >= 0.9 && (find(id, 'average')?.winRate ?? 0) >= 0.6,
      ),
      ids
        .map(
          (id) =>
            `${id.slice(0, 2)} ${pct(find(id, 'expert')?.winRate ?? 0)}/${pct(find(id, 'average')?.winRate ?? 0)}`,
        )
        .join(', '),
    );
    add(
      'No level trivially maxed: even the optimal expert crew stays <= 97% of max score',
      ids.every((id) => {
        const e = find(id, 'expert');
        return e !== undefined && e.scoreShare <= 0.97;
      }),
      ids.map((id) => pct(find(id, 'expert')?.scoreShare ?? 0)).join(', '),
    );
  }
  for (const level of levels) {
    if (level.maxScore <= 0 || level.id === 'l0-greybox') {
      continue;
    }
    const two = level.stars.two / level.maxScore;
    const three = level.stars.three / level.maxScore;
    add(
      `${level.id}: thresholds near 55% / 80% of max (two 48-62%, three 74-86%)`,
      two >= 0.48 && two <= 0.62 && three >= 0.74 && three <= 0.86,
      `${pct(two)} / ${pct(three)} (${level.stars.two} / ${level.stars.three} of ${level.maxScore})`,
    );
  }
  const endless = find('endless', 'average');
  if (endless) {
    add(
      'Endless: average crew of 3 lasts 6-10 min (median)',
      endless.lastedMin.p50 >= 6 && endless.lastedMin.p50 <= 10,
      `${f1(endless.lastedMin.p50)} min`,
    );
  }
  return checks;
}

/**
 * The per-difficulty intent (S7-34): on every level run on two or more difficulties, the average
 * crew of three never wins more often on a harder difficulty than on an easier one.
 */
export function monotonicChecks(summaries: readonly Summary[]): Check[] {
  const rows = summaries.filter((s) => s.crew === 'average' && s.crewSize === 3);
  const levelIds = [...new Set(rows.map((s) => s.levelId))];
  const checks: Check[] = [];
  for (const levelId of levelIds) {
    const ladder = DIFFICULTIES.flatMap((difficulty) =>
      rows.filter((s) => s.levelId === levelId && s.difficulty === difficulty),
    );
    if (ladder.length < 2) {
      continue;
    }
    checks.push({
      name: `${levelId}: average x3 win rate does not rise from easy to expert`,
      ok: ladder.every((s, i) => i === 0 || s.winRate <= (ladder[i - 1]?.winRate ?? 1)),
      detail: ladder.map((s) => `${s.difficulty} ${pct(s.winRate)}`).join(' >= '),
    });
  }
  return checks;
}

export function formatChecks(checks: readonly Check[]): string {
  return checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  [${c.detail}]`).join('\n');
}
