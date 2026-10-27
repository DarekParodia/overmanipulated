// Contest visualisation (the entry form's "wizualizacja projektu"): the game on two A4 portrait
// pages, built from the real screenshots, cards and maps in docs/contest/. Output:
// wizualizacja.html, wizualizacja.pdf (must be exactly two pages) and one PNG per page.
// Run `contest:build` first so the images it embeds are current.

import type { StationKind } from '../../packages/shared/src/index.ts';
import { STATION_KINDS } from '../../packages/shared/src/index.ts';
import {
  colors,
  copyFonts,
  esc,
  fontCss,
  ICON_FOR_STATION,
  iconSvg,
  launchBrowser,
  outPath,
  pl,
  writeOut,
} from './lib/common.ts';

const PAGES = 2;

/** The real-world method behind each station, as on the design document's station table. */
const REAL_METHOD: Record<StationKind, string> = {
  imageSearch: 'wyszukiwanie obrazem',
  archive: 'archiwa stron, daty',
  sourceRegistry: 'autor, domena, wiek konta',
  phone: 'kontakt ze źródłem',
  aiScanner: 'detektor AI (tylko wskazówka)',
  dataLibrary: 'dane źródłowe (GUS, raporty)',
  geolocation: 'geolokalizacja zdjęcia',
  transcript: 'pełny zapis wypowiedzi',
  crossCheck: 'niezależne redakcje',
  metadata: 'dane pliku (EXIF)',
};

const ink = colors.outline;

function step(n: number, icon: Parameters<typeof iconSvg>[0], title: string, text: string) {
  return `<div class="step"><div class="step-icon">${iconSvg(icon, 26, ink, colors.yellow)}<span class="step-n">${n}</span></div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

function verdict(icon: 'publish' | 'publishWithContext' | 'reject', cls: string, text: string) {
  return `<div class="verdict ${cls}">${iconSvg(icon, 22, ink)}<div><b>${esc(pl.vocab.verdicts[icon])}</b><span>${esc(text)}</span></div></div>`;
}

function shot(src: string, caption: string, cls = '') {
  return `<figure class="shot ${cls}"><img src="${src}" alt=""><figcaption>${esc(caption)}</figcaption></figure>`;
}

function stations(): string {
  return STATION_KINDS.map(
    (kind) =>
      `<div class="station">${iconSvg(ICON_FOR_STATION[kind], 22, ink, colors.blue)}<div><b>${esc(pl.vocab.stations[kind])}</b><span>${esc(REAL_METHOD[kind])}</span></div></div>`,
  ).join('');
}

function pageOne(): string {
  return `<section class="page">
  <header class="hero">
    <div>
      <p class="kicker">Gra o bezpieczeństwie informacji w sieci</p>
      <h1>Redakcja na Ostatnią Chwilę</h1>
      <p class="lead">Kooperacyjna gra przeglądarkowa: zespół prowadzi redakcję fikcyjnego miasta Nowe Brzegi, sprawdza zgłoszenia z sieci i zanim minie czas decyduje, co trafi do gazety.</p>
    </div>
    <ul class="chips">
      <li>${iconSvg('user', 18, ink)}3–4 graczy</li>
      <li>${iconSvg('clock', 18, ink)}poziom 6–8 min</li>
      <li>${iconSvg('book', 18, ink)}licealiści 15–19 lat</li>
      <li>${iconSvg('globe', 18, ink)}przeglądarka: komputer i telefon</li>
    </ul>
  </header>
  ${shot('screenshots/desktop/rozgrywka.png', 'Rozgrywka: redakcja z góry. Teczki wpadają na taśmę (lewy górny róg), u góry kolejka zgłoszeń z licznikami, czas, punkty i Wiarygodność.', 'hero-shot')}
  <h2>Jak się gra: 4 kroki</h2>
  <div class="steps">
    ${step(1, 'folder', 'Teczka wpada', 'Zdjęcie, cytat, post, nagranie albo statystyka z licznikiem czasu.')}
    ${step(2, 'imageSearch', 'Stanowisko', 'Gracz niesie teczkę do stanowiska i rozwiązuje krótką minigrę (3–8 s).')}
    ${step(3, 'stamp', 'Pieczątka', 'Wynik sprawdzenia trafia na teczkę jako dowód.')}
    ${step(4, 'desk', 'Werdykt', 'Przy stole zespół wskazuje dowód i wybiera jeden z trzech werdyktów:')}
  </div>
  <div class="verdicts">
    ${verdict('publish', 'v-green', 'prawdziwe i potwierdzone')}
    ${verdict('publishWithContext', 'v-orange', 'prawdziwe, ale mylące')}
    ${verdict('reject', 'v-red', 'fałszywe lub zmyślone')}
  </div>
  <div class="pair">
    ${shot('screenshots/desktop/stanowisko-lupa-obrazu.png', 'Minigra Lupa obrazu: czy to zdjęcie krążyło w sieci wcześniej?')}
    ${shot('screenshots/desktop/stol-werdykt.png', 'Stół redakcyjny: najpierw dowód, potem werdykt. Bez dowodu nie da się zgadywać.')}
  </div>
  <div class="bottom">
    <div class="box goal">
      <h3>${iconSvg('lightbulb', 20, ink, colors.yellow)}Czego uczy</h3>
      <p><b>Nawyku „zatrzymaj się i sprawdź”</b>, zanim uwierzysz lub udostępnisz. Gracze rozpoznają stare zdjęcie jako nowe, zmyślony cytat, fałszywe konto, zmanipulowaną statystykę i deepfake, a do materiału dobierają właściwe narzędzie (metoda SIFT, czytanie lateralne). Presja czasu w grze to ta sama presja, której używa dezinformacja.</p>
    </div>
    ${shot('screenshots/pixel7/rozgrywka.png', 'Na telefonie: joystick i duże przyciski.', 'phone')}
  </div>
</section>`;
}

function pageTwo(): string {
  return `<section class="page">
  <h2 class="top">Elementy gry</h2>
  <div class="grid2">
    <figure class="shot folder"><img src="cards/folders/l1-zalana-ulica.png" alt=""><figcaption>Karta teczki: pieczątki ze stanowisk, właściwy werdykt i wyjaśnienie. Treści są fikcyjne, ale oparte na prawdziwych mechanizmach dezinformacji.</figcaption></figure>
    <div class="col">
      ${shot('maps/l1-burza.png', 'Plan redakcji, poziom 1: taśma z teczkami, stanowiska, stół redakcyjny i miejsca startowe graczy.')}
      <div class="box">
        <h3>${iconSvg('stamp', 20, ink, colors.yellow)}10 stanowisk = 10 prawdziwych metod</h3>
        <div class="stations">${stations()}</div>
      </div>
    </div>
  </div>
  <h3 class="sub">${iconSvg('user', 20, ink, colors.yellow)}Role: każda daje premię i zdolność, ale nie zamyka stanowisk</h3>
  <div class="roles">
    <img src="cards/roles/photoEditor.png" alt="">
    <img src="cards/roles/reporter.png" alt="">
    <img src="cards/roles/managingEditor.png" alt="">
  </div>
  <div class="grid2 end">
    ${shot('screenshots/desktop/kolegium.png', 'Kolegium po poziomie: gwiazdki, „za co punkty” i omówienie każdej teczki: co to było, jak działa sztuczka, co ją wykryło.', 'kolegium')}
    <div class="box score">
      <h3>${iconSvg('star', 20, ink, colors.yellow)}Punkty i wygrana</h3>
      <table>
        <tr><td>Trafny werdykt</td><td>+10 / +20</td></tr>
        <tr><td>Trafny „z kontekstem”</td><td>+30</td></tr>
        <tr class="bad"><td>Opublikowana fałszywka</td><td>−20, Wiarygodność −25</td></tr>
        <tr class="bad"><td>Spóźnienie</td><td>−5, Wiarygodność −5</td></tr>
      </table>
      <p><b>Wygrana:</b> co najmniej 1 gwiazdka, a Wiarygodność redakcji nie spadła do zera. Lepiej się spóźnić niż skłamać.</p>
    </div>
  </div>
  <p class="foot">Wszystkie grafiki to zrzuty i karty z działającej gry. Miasto Nowe Brzegi, osoby i zgłoszenia są fikcyjne.</p>
</section>`;
}

const CSS = `
${fontCss('')}
@page{size:A4;margin:0}
:root{--sky:${colors.sky};--surface:${colors.surface};--soft:${colors.surfaceSoft};--ink:${ink};--ink-soft:${colors.textSoft};--yellow:${colors.yellow};--green:${colors.green};--orange:${colors.orange};--red:${colors.red};--red-dark:${colors.redDark};--blue:${colors.blue};}
*{box-sizing:border-box}
html,body{margin:0;background:var(--sky);color:var(--ink);font-family:Nunito,sans-serif;font-weight:600;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3{font-family:'Baloo 2',sans-serif;font-weight:800;margin:0;line-height:1.05}
svg{display:inline-block;flex:none;vertical-align:middle}
.page{width:210mm;height:297mm;padding:7mm 8mm;overflow:hidden;display:flex;flex-direction:column;gap:2.6mm;background:var(--sky);page-break-after:always}
.page:last-child{page-break-after:auto}
.hero{background:var(--surface);border:3px solid var(--ink);border-radius:14px;box-shadow:4px 4px 0 var(--ink);padding:3.5mm 5mm;display:flex;flex-direction:column;gap:2mm}
.kicker{margin:0;font-size:10pt;color:var(--ink-soft);font-weight:800;text-transform:uppercase;letter-spacing:.06em}
h1{font-size:26pt}
.lead{margin:1mm 0 0;font-size:10pt;line-height:1.32}
.chips{list-style:none;margin:0;padding:0;display:flex;flex-wrap:nowrap;gap:1.6mm}
.chips li{display:flex;align-items:center;gap:1.5mm;background:var(--yellow);border:2px solid var(--ink);border-radius:999px;padding:.5mm 2.4mm;font-size:8.6pt;font-weight:800;white-space:nowrap}
h2{font-size:15pt}
h2.top{font-size:22pt}
.shot{margin:0;display:flex;flex-direction:column;gap:1mm;min-width:0}
.shot img{width:100%;display:block;border:3px solid var(--ink);border-radius:10px;box-shadow:3px 3px 0 var(--ink);background:var(--surface)}
figcaption{font-size:8.5pt;line-height:1.3;color:var(--ink)}
.hero-shot img{aspect-ratio:1366/560;object-fit:cover;object-position:top}
.pair img{aspect-ratio:1366/660;object-fit:cover;object-position:top}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm}
.step{background:var(--surface);border:2.5px solid var(--ink);border-radius:10px;padding:2mm 2.5mm;box-shadow:3px 3px 0 var(--ink)}
.step-icon{display:flex;align-items:center;justify-content:space-between}
.step-n{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:16pt;color:var(--ink-soft)}
.step h3{font-size:11pt;margin:.5mm 0 .3mm}
.step p{margin:0;font-size:8.5pt;line-height:1.3}
.verdicts{display:grid;grid-template-columns:repeat(3,1fr);gap:2.5mm}
.verdict{display:flex;align-items:center;gap:2mm;border:2.5px solid var(--ink);border-radius:10px;padding:1.2mm 2.5mm;box-shadow:3px 3px 0 var(--ink)}
.verdict b{display:block;font-family:'Baloo 2',sans-serif;font-size:11pt;line-height:1.1}
.verdict span{font-size:8.5pt}
.v-green{background:var(--green)}.v-orange{background:var(--orange)}.v-red{background:var(--red)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:3mm}
.bottom{display:grid;grid-template-columns:1fr 72mm;gap:3mm;align-items:start}
.box{background:var(--surface);border:2.5px solid var(--ink);border-radius:10px;padding:3mm;box-shadow:3px 3px 0 var(--ink)}
.box h3{font-size:12pt;display:flex;align-items:center;gap:1.5mm;margin-bottom:1.5mm}
.box p{margin:0;font-size:9pt;line-height:1.38}
.grid2{display:grid;grid-template-columns:78mm 1fr;gap:3.5mm;align-items:start}
.grid2.end{grid-template-columns:1fr 76mm}
.col{display:flex;flex-direction:column;gap:3mm;min-width:0}
.stations{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm 2.5mm}
.station{display:flex;align-items:center;gap:1.5mm;font-size:8pt;line-height:1.15}
.station b{display:block;font-size:8.8pt}
.station span{color:var(--ink-soft)}
.sub{font-size:12.5pt;display:flex;align-items:center;gap:1.5mm}
.roles{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}
.roles img{width:100%;display:block;filter:drop-shadow(3px 3px 0 var(--ink))}
.score table{width:100%;border-collapse:collapse;font-size:8.8pt;margin-bottom:2mm}
.score td{padding:.9mm 0;border-bottom:1.5px solid var(--soft)}
.score td:last-child{text-align:right;font-weight:800;white-space:nowrap;padding-left:2mm}
.score tr.bad td:last-child{color:var(--red-dark)}
.foot{margin:auto 0 0;font-size:8.5pt;text-align:center;color:var(--ink-soft)}
.phone img{aspect-ratio:2265/945}
.kolegium img{aspect-ratio:1366/660;object-fit:cover;object-position:top}
@media screen{body{display:grid;gap:8mm;justify-content:center;padding:8mm 0}.page{box-shadow:0 0 0 1px var(--ink)}}
`;

export function visualizationHtml(): string {
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redakcja na Ostatnią Chwilę: wizualizacja</title><style>${CSS}</style></head>
<body>${pageOne()}${pageTwo()}</body></html>`;
}

function pdfPageCount(pdf: Uint8Array): number {
  return new TextDecoder('latin1').decode(pdf).match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

export async function buildVisualization(): Promise<string[]> {
  await copyFonts();
  const htmlPath = outPath('wizualizacja.html');
  await writeOut(htmlPath, visualizationHtml());
  const written = ['wizualizacja.html'];
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: 900, height: 1200 },
      deviceScaleFactor: 2.5,
    });
    await page.goto(`file://${htmlPath}`);
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('.page')].map((el) => el.scrollHeight - el.clientHeight),
    );
    if (overflow.some((px) => px > 0)) {
      throw new Error(`wizualizacja overflows its A4 pages by ${overflow.join(', ')} px`);
    }
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pages = pdfPageCount(pdf);
    if (pages !== PAGES) {
      throw new Error(`wizualizacja.pdf has ${pages} pages, expected ${PAGES}`);
    }
    await writeOut(outPath('wizualizacja.pdf'), pdf);
    written.push('wizualizacja.pdf');
    // One PNG per page at ~200 dpi, for a form that only accepts images.
    await page.emulateMedia({ media: 'print' });
    const sheets = page.locator('.page');
    for (let i = 0; i < PAGES; i += 1) {
      const file = `wizualizacja-strona-${i + 1}.png`;
      await sheets.nth(i).screenshot({ path: outPath(file), scale: 'device' });
      written.push(file);
    }
    await page.close();
  } finally {
    await browser.close();
  }
  return written;
}

if (import.meta.main) {
  console.log((await buildVisualization()).join('\n'));
}
