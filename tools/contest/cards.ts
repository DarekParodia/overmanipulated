// Printable cards (S6-03 deliverables 3 and 4): the role cards and sample story folders
// rendered from real content. Output in docs/contest/cards/: role-cards.html (six roles on two
// A4 landscape pages, 4 + 2, S7-46) with role-cards.pdf, folders.html (one A4 page per folder)
// plus a PNG of every card.

import { ABILITY_ICON, RESCUE_ICON } from '../../apps/client/src/abilities/ability-icons.ts';
import { abilityKeyCap } from '../../apps/client/src/screens/settings-model.ts';
import type { Ability, Role, StationFamily, Verdict } from '../../packages/shared/src/index.ts';
import {
  ABILITY,
  abilityOf,
  RESCUE_ADD_MS,
  ROLE_PERKS,
  ROLES,
  STATION_KINDS,
} from '../../packages/shared/src/index.ts';
import {
  colors,
  copyFonts,
  esc,
  fontCss,
  iconSvg,
  LEVELS,
  launchBrowser,
  levelNumber,
  outPath,
  PRIORITY_LABEL,
  pl,
  roleIconSvg,
  STATION_PURPOSE,
  storyById,
  TYPE_LABEL,
  writeOut,
} from './lib/common.ts';

/** Stories shown as sample folders: one per verdict, from different levels and types. */
export const SAMPLE_FOLDERS = [
  'l1-zalana-ulica',
  'l2-cytat-o-liceach',
  'l5-nagranie-podatek',
  'l4-ankieta-uczniow',
] as const;

const BASE_CSS = `
${fontCss('../')}
:root{--sky:${colors.sky};--surface:${colors.surface};--soft:${colors.surfaceSoft};--sunk:${colors.surfaceSunk};--ink:${colors.outline};--ink-soft:${colors.textSoft};--yellow:${colors.yellow};--yellow-dark:${colors.yellowDark};--green:${colors.green};--green-dark:${colors.greenDark};--red:${colors.red};--red-dark:${colors.redDark};--orange:${colors.orange};--orange-dark:${colors.orangeDark};--blue:${colors.blue};--blue-dark:${colors.blueDark};--folder:${colors.folder};--folder-dark:${colors.folderDark};}
*{box-sizing:border-box}
body{margin:0;background:var(--sky);color:var(--ink);font-family:Nunito,sans-serif;font-weight:600;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3,.display{font-family:'Baloo 2',sans-serif;font-weight:800;margin:0;line-height:1.1}
svg{display:block;flex:none}
.sheet{padding:24px;display:grid;gap:24px;justify-content:center}
@media print{body{background:var(--surface)}.sheet{padding:0}}
`;

// --- Role cards ---------------------------------------------------------------------------

const ROLE_INFO: Record<Role, { task: string; tip: string }> = {
  photoEditor: {
    task: 'Wyszukiwanie obrazem, wykrywanie edycji i AI.',
    tip: 'Piękne zdjęcie to jeszcze nie dowód. Najpierw sprawdź, skąd pochodzi.',
  },
  archivist: {
    task: 'Sprawdzanie dat, starych wersji stron i kontekstu.',
    tip: 'Data publikacji to nie data zdarzenia. Zajrzyj do tego, co było wcześniej.',
  },
  reporter: {
    task: 'Dotarcie do źródła pierwotnego i świadków.',
    tip: 'Najlepszy dowód to osoba, która tam była. Zadzwoń, zanim uwierzysz.',
  },
  managingEditor: {
    task: 'Decyzje przy stole redakcyjnym i koordynacja zespołu.',
    tip: 'Pilne nie znaczy prawdziwe. Przy stole zwolnij i zapytaj zespół o dowód.',
  },
  generalist: {
    task: 'Pomoc tam, gdzie właśnie jest kolejka.',
    tip: 'Jeden dowód to mało? Sprawdź drugim narzędziem.',
  },
  rescuer: {
    task: 'Pilnowanie terminów i podawanie teczek.',
    tip: 'Pośpiech sprzyja manipulacji. Zyskaj czas, zanim zdecydujesz.',
  },
};

/** The role is faster at every station (Wszechstronny): no station chips, one line instead. */
function fasterEverywhere(role: Role): boolean {
  return ROLE_PERKS[role].fasterAt.length === STATION_KINDS.length;
}

function bonusLine(role: Role): string {
  // The station chips under the line name the stations, so the line does not repeat them.
  const percent = Math.round((1 - ROLE_PERKS[role].workFactor) * 100);
  if (fasterEverywhere(role)) {
    return `Każde stanowisko działa o\u00a0${percent}% szybciej.`;
  }
  const faster = `stanowiska poniżej działają o\u00a0${percent}% szybciej.`;
  if (ROLE_PERKS[role].skipsPhoneQueue) {
    return `Telefon do źródła bez kolejki, a\u00a0${faster}`;
  }
  if (ROLE_PERKS[role].fasterAt.length > 0) {
    return `S${faster.slice(1)}`;
  }
  if (ROLE_PERKS[role].rescuesPerLevel > 0) {
    return `Koło ratunkowe: raz na poziom teczka w\u00a0jego rękach dostaje +${RESCUE_ADD_MS / 1000}\u00a0s.`;
  }
  return 'Bez premii za szybkość: jego siłą jest zdolność.';
}

/**
 * Where Ekspertyza works, by station family: the whole family, which can be more than the
 * passive's chips (the archivist's Ekspertyza also covers Biblioteka danych).
 */
const EXPERTISE_WHERE: Record<StationFamily, string> = {
  image: 'przy obrazie',
  documents: 'przy dokumentach',
  sources: 'przy źródłach',
};

/** What each ability does, in one printed sentence (the lobby's `abilityWhat`, spelled out). */
function abilityText(role: Role, ability: Ability): string {
  const family = ROLE_PERKS[role].expertiseFamily;
  return ability === 'expertise' && family
    ? `Następne zadanie ${EXPERTISE_WHERE[family]} zalicza się samo: pieczątka od razu.`
    : ABILITY_TEXT[ability];
}

const ABILITY_TEXT: Record<Ability, string> = {
  expertise: 'Następne zadanie jego działu zalicza się samo: pieczątka od razu.',
  fieldCall: `Dzwoni z\u00a0teczką w\u00a0ręce: po ${ABILITY.fieldCall.callMs / 1000}\u00a0s pieczątka Telefonu bez chodzenia.`,
  extendDeadline: `+${ABILITY.extendDeadline.addMs / 1000}\u00a0s dla teczki w\u00a0ręce, na jego stole albo najpilniejszej.`,
  secondChance: 'Po nieudanej minigrze gra od razu jeszcze raz, bez blokady.',
  passFolder: `Rzuca teczkę najbliższej wolnej osobie (do ${ABILITY.passFolder.rangeTiles}\u00a0pól).`,
};

/** How to press the ability on every device, and how long it takes to come back. */
function abilityKeysLine(ability: Ability): string {
  return `${abilityKeyCap('keyboard')} · ${abilityKeyCap('gamepad')} · przycisk ${pl.touch.ability[ability]} na ekranie · odnowienie ${ABILITY[ability].cooldownMs / 1000}\u00a0s`;
}

function roleCard(role: Role): string {
  const info = ROLE_INFO[role];
  const stations = fasterEverywhere(role) ? [] : ROLE_PERKS[role].fasterAt;
  const ability = abilityOf(role);
  const bonusIcon = ROLE_PERKS[role].rescuesPerLevel > 0 ? RESCUE_ICON : 'bolt';
  return `<article class="card role" data-role="${role}">
  <header>
    <div class="badge">${roleIconSvg(role, 76, colors.outline, colors.yellow)}</div>
    <div>
      <p class="kicker">Karta roli</p>
      <h2>${esc(pl.vocab.roles[role])}</h2>
    </div>
  </header>
  <section class="bonus">
    <h3>${iconSvg(bonusIcon, 26, colors.outline, colors.yellow)} Premia</h3>
    <p>${esc(bonusLine(role))}</p>
    ${
      stations.length
        ? `<ul class="chips">${stations.map((kind) => `<li>${iconSvg(kind, 18, colors.outline, colors.yellow)}${esc(pl.vocab.stations[kind])}</li>`).join('')}</ul>`
        : ''
    }
  </section>
  ${
    ability
      ? `<section class="ability">
    <h3>${iconSvg(ABILITY_ICON[ability], 26, colors.outline, colors.yellow)} ${esc(pl.lobbyRoles.abilityLabel)}: ${esc(pl.vocab.abilities[ability])}</h3>
    <p>${esc(abilityText(role, ability))}</p>
    <p class="keys">${esc(abilityKeysLine(ability))}</p>
  </section>`
      : ''
  }
  <section>
    <h3>${iconSvg('hand', 26, colors.outline, colors.surface)} Typowe zadanie</h3>
    <p>${esc(info.task)}</p>
  </section>
  <section class="tip">
    ${iconSvg('lightbulb', 34, colors.outline, colors.yellow)}
    <p>${esc(info.tip)}</p>
  </section>
  <footer>Role nie blokują stanowisk: każdy może pracować wszędzie.</footer>
</article>`;
}

/** Role cards per printed A4 landscape page (two rows of two). */
export const ROLE_CARDS_PER_PAGE = 4;

/** The roles of each printed page, in ROLES order: 6 roles give 4 + 2. */
export function rolePages(roles: readonly Role[] = ROLES): Role[][] {
  const pages: Role[][] = [];
  for (let i = 0; i < roles.length; i += ROLE_CARDS_PER_PAGE) {
    pages.push(roles.slice(i, i + ROLE_CARDS_PER_PAGE));
  }
  return pages;
}

const ROLE_CSS = `
.card.role{width:540px;height:510px;background:var(--surface);border:6px solid var(--ink);border-radius:28px;box-shadow:0 8px 0 var(--ink);padding:16px 22px 10px;display:flex;flex-direction:column;gap:7px;break-inside:avoid}
.role header{display:flex;gap:16px;align-items:center}
.role .badge{width:84px;height:84px;border-radius:50%;background:var(--sky);border:5px solid var(--ink);display:grid;place-items:center}
.role .kicker{margin:0 0 2px;font-weight:800;font-size:15px;color:var(--ink-soft)}
.role h2{font-size:32px}
.role h3{font-size:17px;display:flex;gap:8px;align-items:center;margin-bottom:2px}
.role p{margin:0;font-size:15px;line-height:1.28}
.role .bonus{background:var(--soft);border:4px solid var(--ink);border-radius:18px;padding:6px 14px}
.role .bonus p{font-weight:800;font-size:16px}
.role .ability{background:var(--surface);border:4px solid var(--ink);border-radius:18px;padding:6px 14px}
.role .ability p{font-weight:800}
.role .ability .keys{margin-top:3px;font-size:13px;color:var(--ink-soft)}
.chips{list-style:none;margin:5px 0 0;padding:0;display:flex;gap:5px;flex-wrap:wrap}
.chips li{display:flex;gap:6px;align-items:center;background:var(--surface);border:3px solid var(--ink);border-radius:999px;padding:1px 8px 1px 5px;font-weight:800;font-size:12px}
.role .tip{display:flex;gap:12px;align-items:center;background:var(--yellow);border:4px solid var(--ink);border-radius:18px;padding:6px 14px}
.role .tip p{font-weight:800;font-size:15px}
.role>*{flex:none}
.role footer{margin-top:auto;font-size:12px;color:var(--ink-soft);font-weight:700;text-align:center}
.role-sheet{grid-template-columns:repeat(2,540px);gap:28px}
@media print{@page{size:A4 landscape;margin:8mm}.role-sheet{zoom:.66;gap:22px;break-after:page}.role-sheet:last-child{break-after:auto}}
`;

function rolesHtml(): string {
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Karty ról: Redakcja na Ostatnią Chwilę</title>
<style>${BASE_CSS}${ROLE_CSS}</style></head>
<body><main>
${rolePages()
  .map(
    (roles) => `<section class="sheet role-sheet">\n${roles.map(roleCard).join('\n')}\n</section>`,
  )
  .join('\n')}
</main></body></html>
`;
}

// --- Sample folders -----------------------------------------------------------------------

const VERDICT_STYLE: Record<
  Verdict,
  { cls: string; icon: 'publish' | 'reject' | 'publishWithContext' }
> = {
  publish: { cls: 'v-publish', icon: 'publish' },
  reject: { cls: 'v-reject', icon: 'reject' },
  publishWithContext: { cls: 'v-context', icon: 'publishWithContext' },
};

const RELEVANCE = {
  decisive: { label: 'Dowód', cls: 'r-decisive' },
  misleading: { label: 'Myli tropem', cls: 'r-misleading' },
  irrelevant: { label: 'Nic nie wnosi', cls: 'r-irrelevant' },
} as const;

function folderCard(storyId: string): string {
  const story = storyById(storyId);
  const level = LEVELS.find((candidate) => storyId.startsWith(`${candidate.id.split('-')[0]}-`));
  const number = level ? levelNumber(level.id) : 0;
  const verdict = VERDICT_STYLE[story.correctVerdict];
  const justifying = new Set(story.justifyingStamps);
  const stamps = story.stamps
    .map((stamp) => {
      const rel = RELEVANCE[stamp.relevance];
      const key = justifying.has(stamp.id);
      return `<li class="stamp ${rel.cls}${key ? ' key' : ''}">
        <div class="stamp-head">${iconSvg(stamp.station, 24, colors.outline, colors.yellow)}<b>${esc(pl.vocab.stations[stamp.station])}</b><span class="tag">${rel.label}</span>${key ? `<span class="tag star">${iconSvg('star', 16, colors.outline, colors.yellow)} Uzasadnia werdykt</span>` : ''}</div>
        <p>${esc(stamp.text)}</p>
      </li>`;
    })
    .join('');
  const sections = (
    [
      ['what', 'Co to było'],
      ['technique', 'Jak działa ta sztuczka'],
      ['tool', 'Co to wykryło'],
      ['realWorld', 'Gdzie to się zdarza'],
    ] as const
  )
    .map(
      ([key, title]) =>
        `<section><h4>${esc(title)}</h4><p>${esc(story.debrief[key])}</p></section>`,
    )
    .join('');
  return `<article class="card folder" data-story="${esc(story.id)}">
  <div class="tab">${iconSvg(story.type, 26, colors.outline, colors.surface)}<b>${esc(TYPE_LABEL[story.type])}</b><span>${esc(PRIORITY_LABEL[story.priority])}</span></div>
  <div class="paper">
    <p class="kicker">Przykładowa teczka · ${number === 0 ? 'Trening' : `Poziom ${number}`} · ${esc(story.id)}</p>
    <h2>${esc(story.headline)}</h2>
    <p class="body">${esc(story.body)}</p>
    <p class="source">${iconSvg('sourceRegistry', 20, colors.outline, colors.yellow)}<span>Źródło:</span> ${esc(story.source)}</p>
    <h3>Pieczątki ze stanowisk</h3>
    <ul class="stamps">${stamps}</ul>
    <div class="verdict ${verdict.cls}">
      <div class="vchip">${iconSvg(verdict.icon, 30, colors.outline)}<span>Właściwy werdykt: ${esc(pl.vocab.verdicts[story.correctVerdict])}</span></div>
    </div>
    <div class="debrief"><h3>Kolegium: wyjaśnienie</h3>${sections}</div>
    <p class="note">Fikcyjne miasto Nowe Brzegi. Treść wymyślona na potrzeby gry, oparta na realnym mechanizmie dezinformacji.</p>
  </div>
</article>`;
}

const FOLDER_CSS = `
.card.folder{width:780px;position:relative;padding:38px 14px 14px 0;page-break-after:always}
.folder .tab{position:absolute;top:0;left:30px;height:46px;min-width:300px;background:var(--folder);border:5px solid var(--ink);border-bottom:none;border-radius:18px 18px 0 0;display:flex;gap:10px;align-items:center;padding:0 18px;font-family:'Baloo 2',sans-serif;font-size:20px}
.folder .tab span{margin-left:auto;background:var(--surface);border:3px solid var(--ink);border-radius:999px;padding:0 12px;font-size:16px;font-weight:800}
.folder .paper{background:var(--folder);border:5px solid var(--ink);border-radius:0 24px 24px 24px;box-shadow:0 8px 0 var(--ink);padding:22px 26px 16px;display:flex;flex-direction:column;gap:10px}
.folder .kicker{margin:0;font-size:13px;font-weight:800;color:var(--ink-soft)}
.folder h2{font-size:30px}
.folder h3{font-size:19px;margin-top:2px}
.folder h4{font-family:'Baloo 2',sans-serif;font-size:15px;margin:0 0 1px}
.folder p{margin:0}
.folder .body{background:var(--surface);border:4px solid var(--ink);border-radius:16px;padding:10px 14px;font-size:16px;line-height:1.35}
.folder .source{display:flex;gap:8px;align-items:center;font-size:15px;font-weight:800}
.folder .source span{color:var(--ink-soft)}
.stamps{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.stamp{background:var(--surface);border:4px solid var(--ink);border-radius:14px;padding:6px 12px}
.stamp p{font-size:14.5px;line-height:1.3;margin-top:2px}
.stamp-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:15px}
.stamp-head b{font-family:'Baloo 2',sans-serif;font-size:16px}
.tag{margin-left:auto;font-size:12.5px;font-weight:800;border:3px solid var(--ink);border-radius:999px;padding:0 9px;background:var(--soft)}
.tag.star{margin-left:0;background:var(--yellow);display:flex;gap:4px;align-items:center}
.r-decisive{background:var(--surface)}
.r-decisive .tag:first-of-type{background:var(--green)}
.r-misleading .tag:first-of-type{background:var(--orange)}
.stamp.key{border-color:var(--green-dark);box-shadow:0 0 0 3px var(--green)}
.verdict{margin:2px 0}
.vchip{display:flex;gap:10px;align-items:center;border:5px solid var(--ink);border-radius:18px;padding:8px 16px;font-family:'Baloo 2',sans-serif;font-size:24px;font-weight:800;box-shadow:0 5px 0 var(--ink)}
.v-publish .vchip{background:var(--green)}
.v-context .vchip{background:var(--orange)}
.v-reject .vchip{background:var(--red)}
.debrief{background:var(--surface);border:4px solid var(--ink);border-radius:16px;padding:10px 14px;display:grid;gap:6px}
.debrief section p{font-size:14.5px;line-height:1.32}
.folder .note{margin-top:auto;font-size:11.5px;color:var(--ink-soft);font-weight:700;text-align:center}
.folder-sheet{grid-template-columns:780px}
@media print{@page{size:A4 portrait;margin:8mm}.card.folder{zoom:.93}}
`;

function foldersHtml(): string {
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Przykładowe teczki: Redakcja na Ostatnią Chwilę</title>
<style>${BASE_CSS}${FOLDER_CSS}</style></head>
<body><main class="sheet folder-sheet">
${SAMPLE_FOLDERS.map(folderCard).join('\n')}
</main></body></html>
`;
}

/** Pages of a PDF Chromium printed (its `/Type /Page` objects). */
function pdfPageCount(pdf: Uint8Array): number {
  return new TextDecoder('latin1').decode(pdf).match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

export async function buildCards(): Promise<string[]> {
  await copyFonts();
  const written: string[] = [];
  const rolesPath = outPath('cards/role-cards.html');
  const foldersPath = outPath('cards/folders.html');
  await writeOut(rolesPath, rolesHtml());
  await writeOut(foldersPath, foldersHtml());
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 2,
    });
    await page.goto(`file://${rolesPath}`);
    await page.evaluate(() => document.fonts.ready);
    for (const role of ROLES) {
      const file = `cards/roles/${role}.png`;
      await page.locator(`[data-role="${role}"]`).screenshot({ path: outPath(file) });
      written.push(file);
    }
    await page.screenshot({ path: outPath('cards/role-cards.png'), fullPage: true });
    written.push('cards/role-cards.png');
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pages = pdfPageCount(pdf);
    if (pages !== rolePages().length) {
      throw new Error(`role-cards.pdf has ${pages} pages, expected ${rolePages().length}`);
    }
    await writeOut(outPath('cards/role-cards.pdf'), pdf);
    written.push('cards/role-cards.pdf');
    await page.goto(`file://${foldersPath}`);
    await page.evaluate(() => document.fonts.ready);
    for (const id of SAMPLE_FOLDERS) {
      const file = `cards/folders/${id}.png`;
      await page.locator(`[data-story="${id}"]`).screenshot({ path: outPath(file) });
      written.push(file);
    }
    await page
      .pdf({ path: outPath('cards/folders.pdf'), format: 'A4', printBackground: true })
      .catch(() => undefined);
    await page.close();
  } finally {
    await browser.close();
  }
  return written;
}

if (import.meta.main) {
  console.log((await buildCards()).join('\n'));
}

// Station purposes are reused by the guide; re-exported so other generators need no copy.
export { STATION_PURPOSE };
