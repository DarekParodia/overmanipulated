// Aggregation of bot runs into per-level statistics and the checks against the balance intent.
import type { RunResult } from './game.ts';

export type Spread = { mean: number; p10: number; p50: number; p90: number };

export type Summary = {
  levelId: string;
  crew: string;
  crewSize: number;
  runs: number;
  /** Share of runs that survived to the end (endless: share that reached the time cap). */
  winRate: number;
  /** Shares of runs with 0, 1, 2, 3 stars. */
  stars: [number, number, number, number];
  score: Spread;
  /** Mean score as a share of the level's best possible score (0 when unknown). */
  scoreShare: number;
  maxScore: number;
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
  const maxScore = first.maxScore;
  return {
    levelId: first.levelId,
    crew: first.crew,
    crewSize: first.crewSize,
    runs: n,
    winRate: runs.filter((r) => r.won).length / n,
    stars,
    score: spread(runs.map((r) => r.score)),
    scoreShare: maxScore > 0 ? mean(runs.map((r) => r.score)) / maxScore : 0,
    maxScore,
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
  };
}

export function groupKey(run: RunResult): string {
  return `${run.levelId}|${run.crew}|${run.crewSize}`;
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

// --- Intent checks ---------------------------------------------------------------------------

export type Check = { name: string; ok: boolean; detail: string };

type Find = (levelId: string, crew: string, size?: number) => Summary | undefined;

/**
 * The balance intent from S6-01, as pass/fail checks over the summaries. `thresholds` are the
 * levels' star thresholds and best scores, for the 55 % / 80 % guideline.
 */
export function intentChecks(
  summaries: readonly Summary[],
  levels: readonly { id: string; maxScore: number; stars: { two: number; three: number } }[],
): Check[] {
  const find: Find = (levelId, crew, size = 3) =>
    summaries.find((s) => s.levelId === levelId && s.crew === crew && s.crewSize === size);
  const checks: Check[] = [];
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
  const ids = levels.map((l) => l.id).filter((id) => id !== 'l0-greybox');
  const shares = ids.map((id) => find(id, 'average')?.scoreShare ?? Number.NaN);
  const _wins = ids.map((id) => find(id, 'average')?.winRate ?? Number.NaN);
  add(
    'Difficulty rises: average score share of L1 > L6 by >= 5 points, no level 8 points easier than the one before',
    shares.length > 1 &&
      (shares[0] ?? 0) - (shares[shares.length - 1] ?? 0) >= 0.05 &&
      shares.every((v, i) => i === 0 || v <= (shares[i - 1] ?? 1) + 0.08),
    shares.map((v) => pct(v)).join(' > '),
  );
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

export function formatChecks(checks: readonly Check[]): string {
  return checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  [${c.detail}]`).join('\n');
}
