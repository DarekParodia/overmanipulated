// Shared code of the supervisor review pack (S6-02): loads every story and level from a content
// root, renders the review tables (Markdown and CSV) and applies approvals back to the story
// files. The content files stay the single source of truth; nothing here keeps its own copy.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// --- Data model (a loose view of the files; the Zod schemas in packages/content are the law) ---

export type ReviewStamp = {
  id: string;
  station: string;
  text: string;
  relevance: string;
};

export type ReviewStory = {
  id: string;
  type: string;
  priority: string;
  truth: string;
  correctVerdict: string;
  headline: string;
  body: string;
  source: string;
  stamps: ReviewStamp[];
  justifyingStamps: string[];
  technique: string;
  debrief: { what: string; technique: string; tool: string; realWorld: string };
  reviewed: boolean;
};

export type ReviewLevel = {
  id: string;
  title: string;
  topic?: string;
  briefing: string;
  stations: string[];
  schedule: { atS: number; storyId: string }[];
  events: { kind: string; atS: number; storyId?: string }[];
};

export type ContentSet = {
  /** Level number → level (level 0 is the greybox test level). */
  levels: Map<number, ReviewLevel>;
  /** Stories in file order, grouped by level number. */
  stories: Map<number, ReviewStory[]>;
  /** File each story id lives in, relative to the root (`stories/l1-burza.json`). */
  fileOf: Map<string, string>;
  techniqueNames: Map<string, string>;
};

export const levelNumberOf = (id: string): number => Number(/^l(\d+)-/.exec(id)?.[1] ?? Number.NaN);

export function loadContent(root: string): ContentSet {
  const readDir = (dir: string): { file: string; data: unknown }[] =>
    readdirSync(join(root, dir))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => ({
        file: `${dir}/${name}`,
        data: JSON.parse(readFileSync(join(root, dir, name), 'utf8')),
      }));

  const levels = new Map<number, ReviewLevel>();
  for (const { data } of readDir('levels')) {
    const level = data as ReviewLevel;
    levels.set(levelNumberOf(level.id), { ...level, events: level.events ?? [] });
  }
  const stories = new Map<number, ReviewStory[]>();
  const fileOf = new Map<string, string>();
  for (const { file, data } of readDir('stories')) {
    for (const story of data as ReviewStory[]) {
      const n = levelNumberOf(story.id);
      stories.set(n, [...(stories.get(n) ?? []), story]);
      fileOf.set(story.id, file);
    }
  }
  const techniqueNames = new Map<string, string>([['none', 'brak (prawdziwa wiadomość)']]);
  if (existsSync(join(root, 'techniques'))) {
    for (const { data } of readDir('techniques')) {
      for (const t of data as { id: string; name: string; aliases?: string[] }[]) {
        techniqueNames.set(t.id, t.name);
        for (const alias of t.aliases ?? []) {
          techniqueNames.set(alias, t.name);
        }
      }
    }
  }
  return { levels, stories, fileOf, techniqueNames };
}

// --- Polish labels ---------------------------------------------------------------------------

export const TYPE_PL: Record<string, string> = {
  photo: 'zdjęcie',
  quote: 'cytat',
  post: 'post',
  recording: 'nagranie',
  statistic: 'statystyka',
  article: 'artykuł',
};
export const TRUTH_PL: Record<string, string> = {
  true: 'prawda',
  false: 'fałsz',
  misleading: 'zwodnicze',
  satire: 'satyra',
  unverifiable: 'niepotwierdzalne',
};
export const PRIORITY_PL: Record<string, string> = {
  normal: 'zwykły',
  important: 'ważny',
  urgent: 'pilny',
};
export const VERDICT_PL: Record<string, string> = {
  publish: 'publikuj',
  reject: 'odrzuć',
  publishWithContext: 'publikuj z kontekstem',
};
export const STATION_PL: Record<string, string> = {
  imageSearch: 'Lupa obrazu',
  archive: 'Archiwum',
  sourceRegistry: 'Kartoteka źródeł',
  phone: 'Telefon',
  aiScanner: 'Skaner AI',
  dataLibrary: 'Biblioteka danych',
};
export const RELEVANCE_PL: Record<string, string> = {
  decisive: 'rozstrzygająca',
  misleading: 'zwodnicza',
  irrelevant: 'nieistotna',
};
export const EVENT_PL: Record<string, string> = {
  viral: 'wiralowa wiadomość',
  bossCall: 'telefon od szefa',
  correction: 'sprostowanie',
  botRaid: 'najazd botów',
};

/** What the reviewer should look at first, per level (shown in the export). */
export const LEVEL_FOCUS: Record<number, string> = {
  0: 'Poziom testowy (makieta): tylko poprawność merytoryczna i literówki.',
  4: 'Uwaga: treści zdrowotne. Żadna historia nie może brzmieć jak porada medyczna ani zachęcać do kuracji. Sprawdź, czy „badanie” i „suplement” są wymyślone i czy wyjaśnienie nie ocenia realnych terapii.',
  2: 'Uwaga: wybory (fikcyjne). Sprawdź neutralność: żadna strona nie może przypominać realnej partii ani kandydata i żadna nie może być przedstawiona jako lepsza.',
  6: 'Uwaga: referendum (fikcyjne). Sprawdź neutralność: żadna opcja nie jest „słuszna”, a manipulacje są pokazane po obu stronach sporu.',
};

// --- Rows ------------------------------------------------------------------------------------

/** One reviewable story with everything the supervisor needs, already in Polish. */
export type ReviewRow = {
  level: number;
  levelTitle: string;
  id: string;
  headline: string;
  body: string;
  source: string;
  type: string;
  truth: string;
  priority: string;
  verdict: string;
  stamps: string[];
  justifying: string;
  technique: string;
  what: string;
  techniqueText: string;
  tool: string;
  realWorld: string;
  usage: string;
  approved: boolean;
};

function usageOf(level: ReviewLevel | undefined, id: string): string {
  if (!level) {
    return '';
  }
  const parts: string[] = [];
  const scheduled = level.schedule.filter((s) => s.storyId === id);
  if (scheduled.length > 0) {
    parts.push(`taśma (${scheduled.map((s) => `${s.atS} s`).join(', ')})`);
  }
  for (const event of level.events.filter((e) => e.storyId === id)) {
    parts.push(`${EVENT_PL[event.kind] ?? event.kind} (${event.atS} s)`);
  }
  return parts.join('; ') || 'poza harmonogramem (pula trybu bez końca)';
}

export function buildRows(content: ContentSet): ReviewRow[] {
  const rows: ReviewRow[] = [];
  for (const n of [...content.stories.keys()].sort((a, b) => a - b)) {
    const level = content.levels.get(n);
    for (const story of content.stories.get(n) ?? []) {
      const stamps = story.stamps.map((stamp) => {
        const star = story.justifyingStamps.includes(stamp.id) ? ' *' : '';
        const station = STATION_PL[stamp.station] ?? stamp.station;
        return `${station} [${RELEVANCE_PL[stamp.relevance] ?? stamp.relevance}]${star}: ${stamp.text}`;
      });
      const justifying = story.justifyingStamps
        .map((id) => STATION_PL[story.stamps.find((s) => s.id === id)?.station ?? ''] ?? id)
        .join(', ');
      rows.push({
        level: n,
        levelTitle: level ? `${level.title}${level.topic ? ` – ${level.topic}` : ''}` : '',
        id: story.id,
        headline: story.headline,
        body: story.body,
        source: story.source,
        type: TYPE_PL[story.type] ?? story.type,
        truth: TRUTH_PL[story.truth] ?? story.truth,
        priority: PRIORITY_PL[story.priority] ?? story.priority,
        verdict: VERDICT_PL[story.correctVerdict] ?? story.correctVerdict,
        stamps,
        justifying,
        technique: content.techniqueNames.get(story.technique)
          ? `${content.techniqueNames.get(story.technique)} (${story.technique})`
          : story.technique,
        what: story.debrief.what,
        techniqueText: story.debrief.technique,
        tool: story.debrief.tool,
        realWorld: story.debrief.realWorld,
        usage: usageOf(level, story.id),
        approved: story.reviewed,
      });
    }
  }
  return rows;
}

// --- CSV (UTF-8 with BOM, ';' separator: opens correctly in Polish Excel and in Sheets) -------

export const APPROVE_COLUMN = 'Zatwierdzam (TAK/NIE)';
export const COMMENT_COLUMN = 'Uwagi recenzenta';
export const ID_COLUMN = 'ID';

export const CSV_COLUMNS = [
  'Poziom',
  ID_COLUMN,
  'Nagłówek',
  'Treść',
  'Źródło',
  'Typ',
  'Prawdziwość',
  'Waga',
  'Poprawny werdykt',
  'Pieczątki (* = uzasadnia werdykt)',
  'Technika',
  'Wyjaśnienie: co to było',
  'Wyjaśnienie: technika',
  'Wyjaśnienie: narzędzie',
  'Wyjaśnienie: przykład z życia',
  'Użycie w poziomie',
  APPROVE_COLUMN,
  COMMENT_COLUMN,
] as const;

export function rowToCsvCells(row: ReviewRow): string[] {
  return [
    `${row.level}: ${row.levelTitle}`,
    row.id,
    row.headline,
    row.body,
    row.source,
    row.type,
    row.truth,
    row.priority,
    row.verdict,
    row.stamps.join('\n'),
    row.technique,
    row.what,
    row.techniqueText,
    row.tool,
    row.realWorld,
    row.usage,
    row.approved ? 'TAK' : '',
    '',
  ];
}

const csvCell = (value: string, separator: string): string =>
  /["\n\r]/.test(value) || value.includes(separator) ? `"${value.replaceAll('"', '""')}"` : value;

export function toCsv(rows: ReviewRow[], separator = ';'): string {
  const lines = [CSV_COLUMNS as readonly string[], ...rows.map(rowToCsvCells)].map((cells) =>
    cells.map((c) => csvCell(c, separator)).join(separator),
  );
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** RFC 4180 parser; the separator (`;` or `,`) is detected from the header line. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const separator =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === separator) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') {
        i++;
      }
      row.push(cell);
      cell = '';
      if (row.some((c) => c !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c !== '')) {
    rows.push(row);
  }
  return rows;
}

// --- Markdown ----------------------------------------------------------------------------------

const mdCell = (value: string): string => value.replaceAll('|', '\\|').replaceAll('\n', '<br>');

export function toMarkdown(content: ContentSet, rows: ReviewRow[]): string {
  const total = rows.length;
  const approved = rows.filter((r) => r.approved).length;
  const out: string[] = [
    '# Historie do weryfikacji merytorycznej',
    '',
    '<!-- Plik wygenerowany poleceniem `bun run review:export`. Nie edytuj go ręcznie: zatwierdzenia',
    'wpisuj w pliku CSV (stories-for-review.csv) i wczytaj poleceniem `bun run review:apply`. -->',
    '',
    `Razem **${total}** historii (poziomy 0–6 i zdarzenia), zatwierdzonych: **${approved}**.`,
    'Jak sprawdzać i jak zatwierdzać: [README.pl.md](README.pl.md).',
    '',
    'Skróty: pieczątka z gwiazdką (*) uzasadnia poprawny werdykt; „rozstrzygająca” oznacza,',
    'że pieczątka sama pozwala rozstrzygnąć sprawę, „zwodnicza” brzmi wiarygodnie, ale prowadzi',
    'na manowce, „nieistotna” nic nie wnosi.',
    '',
    '## Spis',
    '',
    '| Poziom | Historii | Zatwierdzonych |',
    '| --- | --- | --- |',
  ];
  const byLevel = new Map<number, ReviewRow[]>();
  for (const row of rows) {
    byLevel.set(row.level, [...(byLevel.get(row.level) ?? []), row]);
  }
  for (const [n, list] of byLevel) {
    out.push(
      `| [${n}: ${mdCell(list[0]?.levelTitle ?? '')}](#poziom-${n}) | ${list.length} | ${list.filter((r) => r.approved).length} |`,
    );
  }
  for (const [n, list] of byLevel) {
    const level = content.levels.get(n);
    out.push(
      '',
      `<a id="poziom-${n}"></a>`,
      '',
      `## Poziom ${n}: ${list[0]?.levelTitle ?? ''}`,
      '',
    );
    if (level) {
      out.push(
        `Stanowiska: ${level.stations.map((s) => STATION_PL[s] ?? s).join(', ')}.`,
        '',
        `Odprawa: ${level.briefing}`,
        '',
      );
    }
    if (LEVEL_FOCUS[n]) {
      out.push(`> ${LEVEL_FOCUS[n]}`, '');
    }
    out.push(
      '| Zatw. | ID | Nagłówek | Typ | Prawdziwość | Werdykt | Uwagi |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const row of list) {
      out.push(
        `| ${row.approved ? '☑' : '☐'} | \`${row.id}\` | ${mdCell(row.headline)} | ${row.type} | ${row.truth} | ${row.verdict} | |`,
      );
    }
    for (const row of list) {
      out.push(
        '',
        `### ${row.id}`,
        '',
        `**${row.headline}**`,
        '',
        `> ${row.body}`,
        '',
        `Źródło: ${row.source} · Typ: ${row.type} · Waga: ${row.priority} · Użycie: ${row.usage}`,
        '',
        `Prawdziwość: **${row.truth}** → poprawny werdykt: **${row.verdict}** · Technika: ${row.technique}`,
        '',
        'Pieczątki:',
        '',
        ...row.stamps.map((s) => `- ${s}`),
        '',
        'Wyjaśnienie na kolegium:',
        '',
        `- **Co to było:** ${row.what}`,
        `- **Technika:** ${row.techniqueText}`,
        `- **Narzędzie:** ${row.tool}`,
        `- **Przykład z życia:** ${row.realWorld}`,
        '',
        `- [${row.approved ? 'x' : ' '}] Zatwierdzam`,
        '- Uwagi: ',
      );
    }
  }
  return `${out.join('\n')}\n`;
}

// --- Applying approvals ---------------------------------------------------------------------

const YES = new Set(['tak', 't', 'yes', 'y', 'x', '1', 'ok', 'true']);
const NO = new Set(['nie', 'n', 'no', '0', 'false']);

export type Decision = { id: string; approved: boolean; comment: string; line: number };

export type ParsedApprovals = {
  decisions: Decision[];
  /** Problems that make the file unusable: the tool stops on them. */
  errors: string[];
  /** Cells that are neither a yes nor a no nor empty: treated as "not approved". */
  warnings: string[];
};

export function parseApprovals(csv: string): ParsedApprovals {
  const table = parseCsv(csv);
  const header = table[0] ?? [];
  const idCol = header.findIndex((h) => h.trim() === ID_COLUMN);
  const approveCol = header.findIndex((h) => h.trim().startsWith('Zatwierdzam'));
  const commentCol = header.findIndex((h) => h.trim().startsWith('Uwagi'));
  const result: ParsedApprovals = { decisions: [], errors: [], warnings: [] };
  if (idCol < 0 || approveCol < 0) {
    result.errors.push(`Brak kolumn "${ID_COLUMN}" i "${APPROVE_COLUMN}" w nagłówku pliku.`);
    return result;
  }
  const seen = new Set<string>();
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const id = (cells[idCol] ?? '').trim();
    if (id === '') {
      return;
    }
    if (seen.has(id)) {
      result.errors.push(`Wiersz ${line}: powtórzone ID ${id}.`);
      return;
    }
    seen.add(id);
    const mark = (cells[approveCol] ?? '').trim().toLowerCase();
    if (mark !== '' && !YES.has(mark) && !NO.has(mark)) {
      result.warnings.push(
        `Wiersz ${line} (${id}): nierozpoznana wartość "${mark}", traktuję jako brak zatwierdzenia.`,
      );
    }
    result.decisions.push({
      id,
      approved: YES.has(mark),
      comment: commentCol >= 0 ? (cells[commentCol] ?? '').trim() : '',
      line,
    });
  });
  return result;
}

/**
 * Sets `"reviewed": true` for one story by editing the file text, so formatting, ordering and
 * every other byte stay as they are. The story's `id` line is the anchor; `reviewed` is the next
 * `"reviewed"` key after it, which must come before the next story starts.
 */
export function markReviewed(fileText: string, storyId: string): string | null {
  const anchor = new RegExp(`"id":\\s*"${storyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
  const start = anchor.exec(fileText);
  if (!start) {
    return null;
  }
  const rest = fileText.slice(start.index + start[0].length);
  const nextStory = /"id":\s*"l\d+-[^"]*"\s*,\s*"type"/.exec(rest);
  const reviewed = /"reviewed":\s*(true|false)/.exec(rest);
  if (!reviewed || (nextStory && reviewed.index > nextStory.index)) {
    return null;
  }
  const at = start.index + start[0].length + reviewed.index;
  return `${fileText.slice(0, at)}"reviewed": true${fileText.slice(at + reviewed[0].length)}`;
}
