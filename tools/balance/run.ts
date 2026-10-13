// `bun run balance`: plays every level with bot crews and prints the balance report.
//   --seeds N          runs per level and crew (default 50)
//   --endless-seeds N  runs per crew in endless mode (default 24)
//   --levels a,b       level ids (default l1..l6 and endless)
//   --no-endless       skip endless
//   --difficulty a,b   difficulties (easy, normal, hard, expert; default normal)
//   --workers N        worker threads (default: cores, max 8; 1 = in-process)
//   --json FILE        also write every run result as JSON
//   --md               print markdown headings (for docs/balance.md)
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { maxLevelScore } from '../../packages/content/src/checks.ts';
import { LEVELS, STORIES } from '../../packages/content/src/index.ts';
import {
  DIFFICULTIES,
  type Difficulty,
  difficultySchema,
  ENDLESS_LEVEL_ID,
} from '../../packages/shared/src/index.ts';
import type { RunResult } from './game.ts';
import { buildMatrix, type Job, runJob } from './jobs.ts';
import {
  campaignTable,
  endlessTable,
  formatChecks,
  intentChecks,
  stationLoadTable,
  summarizeAll,
  trailTable,
} from './report.ts';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const campaignIds = LEVELS.map((l) => l.id).filter((id) => id !== 'l0-greybox');
const levels = option('levels')?.split(',') ?? campaignIds;
const includeEndless =
  !flag('no-endless') && (option('levels') === undefined || levels.includes(ENDLESS_LEVEL_ID));
const asked = (option('difficulty') ?? 'normal').split(',').map((d) => difficultySchema.parse(d));
// In ladder order whatever the order on the command line, each difficulty once.
const difficulties: Difficulty[] = DIFFICULTIES.filter((d) => asked.includes(d));
const jobs = buildMatrix({
  levels: levels.filter((id) => id !== ENDLESS_LEVEL_ID),
  seeds: Number(option('seeds') ?? 50),
  endlessSeeds: Number(option('endless-seeds') ?? 24),
  includeEndless,
  difficulties,
});

async function runAll(all: Job[], workers: number): Promise<RunResult[]> {
  if (workers <= 1) {
    return all.map(runJob);
  }
  // Interleave so each worker gets a similar mix of cheap and expensive runs.
  const chunks: Job[][] = Array.from({ length: workers }, () => []);
  for (const [index, job] of all.entries()) {
    chunks[index % workers]?.push(job);
  }
  const parts = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<RunResult[]>((resolve, reject) => {
          const worker = new Worker(new URL('./worker.ts', import.meta.url));
          worker.onmessage = (event: MessageEvent<RunResult[]>) => {
            resolve(event.data);
            worker.terminate();
          };
          worker.onerror = (event) => reject(new Error(String(event.message)));
          worker.postMessage(chunk);
        }),
    ),
  );
  // Back in job order, so the report does not depend on the worker count.
  return all.map((_, index) => {
    const result = parts[index % workers]?.[Math.floor(index / workers)];
    if (!result) {
      throw new Error(`Missing result for job ${index}`);
    }
    return result;
  });
}

const started = performance.now();
const workers = Number(option('workers') ?? Math.min(8, availableParallelism()));
const results = await runAll(jobs, workers);
const seconds = (performance.now() - started) / 1000;

const summaries = summarizeAll(results);
const crewOrder = ['rookie', 'average', 'expert', 'rookie+average+expert'];
const orderOf = (crew: string) => {
  const i = crewOrder.indexOf(crew);
  return i < 0 ? 99 : i;
};

const storiesById = new Map(STORIES.map((s) => [s.id, s]));
const levelInfo = LEVELS.map((l) => ({
  id: l.id,
  stars: l.stars,
  maxScore: maxLevelScore(l, storiesById),
}));

const md = flag('md');
const out: string[] = [];
const shown = [
  ...levels.filter((id) => id !== ENDLESS_LEVEL_ID),
  ...(includeEndless ? [ENDLESS_LEVEL_ID] : []),
];
const f0 = (v: number) => String(Math.round(v));
for (const levelId of shown) {
  for (const difficulty of difficulties) {
    // Crews of three first (by skill), then the other crew sizes.
    const rows = summaries
      .filter((s) => s.levelId === levelId && s.difficulty === difficulty)
      .sort(
        (a, b) =>
          Number(b.crewSize === 3) - Number(a.crewSize === 3) ||
          a.crewSize - b.crewSize ||
          orderOf(a.crew) - orderOf(b.crew),
      );
    const first = rows[0];
    if (!first) {
      continue;
    }
    // Every crew plays the same dealt runs (seeds 1..N), so the first row's means hold for all.
    const header = first.thresholds
      ? `${levelId} · ${difficulty}  (mean run max score ${f0(first.maxScore)}, stars at ${f0(first.thresholds.two)} / ${f0(first.thresholds.three)})`
      : `${levelId} · ${difficulty}  (generated, capped at 20 min)`;
    out.push(md ? `#### ${header}\n` : `== ${header}`);
    if (levelId === ENDLESS_LEVEL_ID) {
      out.push(endlessTable(rows), '');
      continue;
    }
    out.push(campaignTable(rows), '');
    out.push(md ? 'Credibility (mean) at tenths of the level:\n' : 'Credibility trajectory:');
    out.push(trailTable(rows), '');
    const events = rows.find((r) => r.crew === 'average' && r.crewSize === 3)?.events ?? {};
    if (Object.keys(events).length > 0) {
      out.push(`Events started per run: ${JSON.stringify(events)}`, '');
    }
  }
}
out.push(
  md
    ? '#### Station load (average ×3, share of level time busy)\n'
    : '== Station load (average ×3, share of level time busy)',
);
out.push(stationLoadTable(summaries), '');
out.push(md ? '#### Intent checks\n' : '== Intent checks');
out.push(formatChecks(intentChecks(summaries, levelInfo)));
console.log(out.join('\n'));
// Timing goes to stderr, so the report on stdout is the same on every run of the same matrix.
console.error(`\n${results.length} runs in ${seconds.toFixed(1)} s on ${workers} worker(s).`);

const jsonPath = option('json');
if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(results));
}
