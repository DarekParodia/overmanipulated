// biome-ignore-all lint/suspicious/noExplicitAny: page.evaluate bodies reach the untyped ?debug hook
// Screenshots of every screen and state (S6-03 deliverable 1), at 1366x768 and Pixel 7
// landscape, plus the index page docs/contest/screenshots/README.md with Polish captions.
//
// Real server, real browser: lobbies, briefings and the first-game tutorial are driven through
// the UI; station minigames, the desk, level events and the results are put on screen with the
// `?debug` game hook (`window.__game`), which pins state over the server's snapshots.
// Run through `bun run contest:build` (or `bun tools/contest/screenshots.ts`).
import { type Browser, type BrowserContextOptions, devices, type Page } from '@playwright/test';
import {
  getStory,
  LEVELS,
  STORIES,
  starThresholds,
  TECHNIQUES,
} from '../../packages/content/src/index.ts';
import {
  CREDIBILITY,
  CREDIBILITY_MAX,
  CREDIBILITY_START,
  SCORE,
  STATION_KINDS,
  type StationKind,
} from '../../packages/shared/src/index.ts';
import { launchBrowser, outPath, pl, writeOut } from './lib/common.ts';
import {
  ALL_STARS,
  confirmBriefing,
  createRoom,
  faceTowards,
  gameInfo,
  joinRoom,
  openExtraPlayer,
  openPlayer,
  type Player,
  pickRole,
  selectLevel,
  setReady,
  startAndBrief,
  walkTo,
} from './lib/session.ts';
import { startStack } from './lib/stack.ts';

type Device = { id: string; label: string; options: BrowserContextOptions };

const DEVICES: Device[] = [
  {
    id: 'desktop',
    label: 'Komputer, 1366×768',
    options: { viewport: { width: 1366, height: 768 } },
  },
  {
    id: 'pixel7',
    label: 'Telefon (Pixel 7, poziomo)',
    options: { ...devices['Pixel 7 landscape'] },
  },
];

/** One entry of the screenshot index. */
type Shot = { key: string; title: string; caption: string };

const SHOTS: Shot[] = [];
const defineShot = (key: string, title: string, caption: string) => {
  SHOTS.push({ key, title, caption });
  return key;
};

const S = {
  menu: defineShot(
    'menu',
    'Menu główne',
    'Podpis i kod pokoju albo lista publicznych pokoi. Bez konta, bez instalacji.',
  ),
  roomBrowser: defineShot(
    'lista-pokoi',
    'Publiczne pokoje',
    'Pokoje są prywatne, dopóki gospodarz ich nie upubliczni. Wyszukiwarka, filtry trybu i trudności.',
  ),
  howToIntro: defineShot(
    'jak-grac-wprowadzenie',
    'Jak grać: wprowadzenie',
    'Animowana scenka z napisami: teczka, pieczątka, werdykt. Włącza się sama przed pierwszym treningiem.',
  ),
  howToStations: defineShot(
    'jak-grac-stanowiska',
    'Jak grać: stanowiska',
    'Dziesięć stanowisk z instrukcją i rundą próbną „Wypróbuj”.',
  ),
  about: defineShot(
    'o-grze',
    'O grze',
    'Autorzy, licencja, użyte zasoby i biblioteki oraz wersja gry.',
  ),
  profile: defineShot(
    'profil',
    'Profil',
    'Statystyki zapisane tylko w tej przeglądarce oraz kolor i dodatek postaci.',
  ),
  settingsSound: defineShot(
    'ustawienia-dzwiek',
    'Ustawienia: dźwięk',
    'Głośność ogólna, muzyki, efektów i lektora oraz wyciszenie.',
  ),
  settingsDisplay: defineShot(
    'ustawienia-obraz',
    'Ustawienia: obraz',
    'Jakość grafiki (auto, niska, średnia, wysoka) i wielkość tekstu.',
  ),
  settingsAccess: defineShot(
    'ustawienia-ulatwienia',
    'Ustawienia: ułatwienia',
    'Mniej ruchu, bez migania, napisy do dźwięków, podpowiedzi „co dalej” i ponowne wprowadzenie.',
  ),
  settingsControls: defineShot(
    'ustawienia-sterowanie',
    'Ustawienia: sterowanie',
    'Klawiatura, pad i dotyk: ściąga ze sterowania dla jury.',
  ),
  encyclopedia: defineShot(
    'encyklopedia',
    'Encyklopedia technik',
    'Karty technik manipulacji zbierane w trakcie gry. Nieodkryte karty są zablokowane.',
  ),
  encyclopediaCard: defineShot(
    'encyklopedia-karta',
    'Encyklopedia: karta techniki',
    'Jak to działa, jak to wykryć i gdzie się zdarza.',
  ),
  lobby: defineShot(
    'lobby',
    'Poczekalnia',
    'Kod pokoju, cztery miejsca, sześć ról z premią i zdolnością, poziom trudności, gotowość graczy.',
  ),
  lobbyVersus: defineShot(
    'poczekalnia-pojedynek',
    'Poczekalnia: pojedynek',
    'Tryb „Na punkty”: dwie redakcje grają te same teczki, każda w swojej sali.',
  ),
  lobbyLevels: defineShot(
    'lobby-poziomy',
    'Mapa kampanii',
    'Sześć poziomów kampanii, trening i tryb bez końca z gwiazdkami postępu.',
  ),
  leaderboard: defineShot(
    'wyniki',
    'Najlepsze wyniki',
    'Tablica wyników trybu bez końca: pokój i wszyscy gracze.',
  ),
  briefing: defineShot(
    'briefing',
    'Briefing redakcyjny',
    'Temat dnia i nowość poziomu. Gra rusza, gdy wszyscy są gotowi.',
  ),
  tutorialMove: defineShot(
    'samouczek-ruch',
    'Samouczek: ruch',
    'Pierwsza gra zaczyna się od krótkiego samouczka, krok po kroku.',
  ),
  tutorialPickup: defineShot('samouczek-teczka', 'Samouczek: teczka', 'Podnieś teczkę z taśmy.'),
  tutorialWork: defineShot(
    'samouczek-stanowisko',
    'Samouczek: stanowisko',
    'Zanieś teczkę na stanowisko i przytrzymaj przycisk pracy.',
  ),
  hud: defineShot(
    'rozgrywka',
    'Rozgrywka (poziom 1)',
    'Redakcja z góry. U góry czas, punkty i Wiarygodność oraz kolejka teczek z licznikami.',
  ),
  hudAbility: defineShot(
    'rozgrywka-zdolnosc',
    'Zdolność roli',
    'Redaktor prowadzący nacisnął R (na telefonie czwarty przycisk): teczka ma 20 sekund więcej, a zdolność się odnawia.',
  ),
  gameMenu: defineShot(
    'menu-gry',
    'Menu gry',
    'Jeden przycisk w rogu: pomoc, ustawienia, wyjście. W grze solo także pauza.',
  ),
  hudSix: defineShot(
    'rozgrywka-poziom-6',
    'Rozgrywka (poziom 6)',
    'Osiem stanowisk w większej sali, stół redakcyjny i stoliki do odkładania teczek.',
  ),
  stImageSearch: defineShot(
    'stanowisko-lupa-obrazu',
    'Lupa obrazu',
    'Minigra: znajdź wersję zdjęcia z wszystkimi znacznikami i sprawdź jej datę.',
  ),
  stArchive: defineShot(
    'stanowisko-archiwum',
    'Archiwum',
    'Minigra: przewiń oś czasu i zatrzymaj się na właściwej dacie.',
  ),
  stSourceRegistry: defineShot(
    'stanowisko-kartoteka-zrodel',
    'Kartoteka źródeł',
    'Minigra: porównaj profil z sygnałami ostrzegawczymi.',
  ),
  stPhone: defineShot(
    'stanowisko-telefon',
    'Telefon',
    'Minigra: wybierz właściwy numer, potem cierpliwie poczekaj w kolejce.',
  ),
  stAiScanner: defineShot(
    'stanowisko-skaner-ai',
    'Skaner AI',
    'Minigra: odczyt w procentach z marginesem błędu. To prawdopodobieństwo, nie dowód.',
  ),
  stDataLibrary: defineShot(
    'stanowisko-biblioteka-danych',
    'Biblioteka danych',
    'Minigra: porównaj liczbę z oryginalną tabelą.',
  ),
  stMetadata: defineShot(
    'stanowisko-metadane',
    'Metadane',
    'Minigra: porównaj dane pliku z opisem w teczce i wskaż pole, które się nie zgadza.',
  ),
  stTranscript: defineShot(
    'stanowisko-stenogram',
    'Stenogram',
    'Minigra: znajdź cytat w zapisie rozmowy i oceń, czy skrót zmienia jego sens.',
  ),
  stCrossCheck: defineShot(
    'stanowisko-inne-media',
    'Inne media',
    'Minigra: policz niezależne źródła. Kopia cudzego wpisu nie jest potwierdzeniem.',
  ),
  stGeolocation: defineShot(
    'stanowisko-mapa',
    'Mapa',
    'Minigra: znajdź dzielnicę, w której stoją oba budynki ze zdjęcia.',
  ),
  stationHelp: defineShot(
    'pomoc-stanowiska',
    'Pomoc stanowiska',
    'Przy pierwszej wizycie karta z instrukcją. Zegar minigry stoi, termin teczki biegnie.',
  ),
  deskEvidence: defineShot(
    'stol-dowod',
    'Stół redakcyjny: wybór dowodu',
    'Krok 1: wskaż pieczątkę, która uzasadnia werdykt. To blokuje zgadywanie.',
  ),
  deskVerdict: defineShot(
    'stol-werdykt',
    'Stół redakcyjny: werdykt',
    'Krok 2: Publikuj, Publikuj z kontekstem albo Odrzuć.',
  ),
  deskResultGood: defineShot(
    'stol-wynik-trafny',
    'Wynik werdyktu: trafny',
    'Natychmiastowa informacja zwrotna: punkty i Wiarygodność.',
  ),
  deskResultBad: defineShot(
    'stol-wynik-blad',
    'Wynik werdyktu: błąd',
    'Przy błędzie gra pokazuje właściwy werdykt i stanowisko, które go rozstrzyga.',
  ),
  evBoss: defineShot(
    'zdarzenie-telefon-od-szefa',
    'Zdarzenie: telefon od szefa',
    'Naczelny żąda natychmiastowej publikacji. Presja, której używa dezinformacja.',
  ),
  evViral: defineShot(
    'zdarzenie-wszedzie',
    'Zdarzenie: „To już wszędzie jest!”',
    'Licznik udostępnień rośnie na oczach graczy i kusi, żeby nie sprawdzać.',
  ),
  evRaid: defineShot(
    'zdarzenie-nalot-botow',
    'Zdarzenie: nalot botów',
    'Fala niemal identycznych zgłoszeń. Wystarczy rozpoznać jedno.',
  ),
  evOutage: defineShot(
    'zdarzenie-awaria',
    'Zdarzenie: awaria',
    'Jedno stanowisko przestaje działać, zespół improwizuje.',
  ),
  evCorrection: defineShot(
    'zdarzenie-sprostowanie',
    'Zdarzenie: sprostowanie',
    'Opublikowany materiał okazał się fałszywy: napraw własny błąd.',
  ),
  results: defineShot(
    'wyniki-poziomu',
    'Wyniki poziomu',
    'Gwiazdki, punkty, Wiarygodność i werdykty zespołu.',
  ),
  kolegium: defineShot(
    'kolegium',
    'Kolegium redakcyjne',
    'Omówienie każdej teczki: co to było, jak działa sztuczka, co ją wykryło i gdzie się zdarza.',
  ),
  kolegiumMissed: defineShot(
    'kolegium-blad',
    'Kolegium: błędny werdykt',
    'Przy błędzie widać dowód, który rozstrzygał. Wpadka dnia wybierana głosowaniem.',
  ),
  endlessBriefing: defineShot(
    'bez-konca-briefing',
    'Tryb bez końca: briefing',
    'Im dłużej, tym szybciej: tempo teczek rośnie.',
  ),
  endlessHud: defineShot(
    'bez-konca-rozgrywka',
    'Tryb bez końca: rozgrywka',
    'Licznik czasu gry i tempo zamiast sztywnego limitu poziomu.',
  ),
  endlessResults: defineShot(
    'bez-konca-wyniki',
    'Tryb bez końca: wyniki',
    'Wynik, czas przetrwania i tablica najlepszych wyników.',
  ),
  spectate: defineShot(
    'widownia',
    'Widownia',
    'Reszta klasy ogląda pojedynek: wynik obu redakcji i relacja „Na żywo”; na komputerze obie sale obok siebie, na telefonie jedna z przełącznikiem.',
  ),
};

/** Folder-result fields the screenshot fixtures share (protocol v3). */
const outcomeBase = {
  requiredStamps: 1,
  bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
  missedStampIds: [] as string[],
};

/** The reason each fixture outcome stands for (+20/+5, −20/−25, half points, −5/−5). */
const FIXTURE_REASON = {
  correct: 'correctImportant',
  wrongJustification: 'weakProof',
  wrong: 'publishedFake',
  expired: 'expired',
} as const;

type FixtureOutcome = 'correct' | 'wrong' | 'expired';
type FixtureStory = (typeof STORIES)[number];

/**
 * Folder results of a finished run whose totals add up the way the server scores them (design
 * doc „Punktacja”): a correct verdict pays by priority or context, a wrong one is a published fake
 * (pick a story whose correct verdict is reject), an expired folder costs the penalty. The score
 * is their sum and the credibility runs from the start and stays within 0–100, so the results'
 * points table has no unexplained „Inne” row. The best possible score pays every folder its
 * correct verdict plus the speed bonus.
 */
function fixtureRun(stories: readonly FixtureStory[], outcomes: readonly FixtureOutcome[]) {
  let credibility = CREDIBILITY_START;
  let score = 0;
  let maxScore = 0;
  const results = stories.map((s, i) => {
    const outcome = outcomes[i] ?? 'correct';
    const context = s.correctVerdict === 'publishWithContext';
    const important = s.priority !== 'normal';
    const correct = context
      ? {
          reason: 'correctWithContext',
          score: SCORE.correctWithContext,
          cred: CREDIBILITY.correctWithContext,
        }
      : important
        ? {
            reason: 'correctImportant',
            score: SCORE.correctImportant,
            cred: CREDIBILITY.correctImportant,
          }
        : { reason: 'correctNormal', score: SCORE.correctNormal, cred: 0 };
    const scored =
      outcome === 'correct'
        ? correct
        : outcome === 'wrong'
          ? { reason: 'publishedFake', score: SCORE.publishedFake, cred: CREDIBILITY.publishedFake }
          : { reason: 'expired', score: SCORE.expired, cred: CREDIBILITY.expired };
    maxScore += correct.score + SCORE.speedBonus;
    score += scored.score;
    credibility = Math.min(CREDIBILITY_MAX, Math.max(0, credibility + scored.cred));
    return {
      ...outcomeBase,
      folderId: `r${i}`,
      spawnKey: `s${i}`,
      storyId: s.id,
      outcome,
      reason: scored.reason,
      justifyingStampIds: outcome === 'expired' ? [] : s.justifyingStamps.slice(0, 1),
      verdict: outcome === 'expired' ? null : outcome === 'wrong' ? 'publish' : s.correctVerdict,
      scoreDelta: scored.score,
      credibilityDelta: scored.cred,
      // The cited stamp was in the folder; the other deciding proofs never were.
      missedStampIds: outcome === 'wrong' ? s.justifyingStamps.slice(1) : [],
    };
  });
  return { results, score, credibility, maxScore };
}

/**
 * A story with a stamp for the station, from l6 when it has one, else from any level (l5 stamps
 * Stenogram and Metadane). A station no story stamps yet (Mapa and Inne media before S7-58) shows
 * an l6 story: its minigame then rolls the puzzle's outcome from the seed.
 */
function storyForStation(kind: StationKind) {
  const stamped = (s: (typeof STORIES)[number]) => s.stamps.some((st) => st.station === kind);
  return (
    STORIES.find((s) => s.id.startsWith('l6-') && stamped(s)) ??
    STORIES.find(stamped) ??
    STORIES.find((s) => s.id.startsWith('l6-'))
  );
}

/** Seeds the encyclopedia: about two thirds of the cards collected, the rest locked. */
function seededMet(): Record<string, string[]> {
  const met: Record<string, string[]> = {};
  TECHNIQUES.forEach((technique, index) => {
    if (index % 3 === 2) {
      return;
    }
    const story = STORIES.find(
      (s) => s.technique === technique.id || technique.aliases.includes(s.technique),
    );
    if (story) {
      met[technique.id] = [story.id];
    }
  });
  return met;
}

async function injectScene(
  page: Page,
  scene: {
    station?: { kind: StationKind; folderStoryId: string };
    desk?: { storyId: string; stamps: string[] };
    extraFolders?: { id: string; storyId: string; tag?: unknown; fixture?: string }[];
    outage?: StationKind;
  },
): Promise<void> {
  await page.evaluate((s) => {
    const g = (window as unknown as { __game: any }).__game;
    const me = g.localPlayerId();
    const state = g.getState();
    const folders: any[] = [];
    const base = { stamps: [] as string[], spawnedAtMs: 0, deadlineMs: 600000, warned: false };
    // A station kind the level lacks (l6 has eight of the ten) joins as an extra station off the
    // map: the overlay needs only its state.
    const kinds = state.stations.map((st: any) => st.kind);
    const extra =
      s.station && !kinds.includes(s.station.kind)
        ? [{ ...state.stations[0], id: `demo-${s.station.kind}`, kind: s.station.kind }]
        : [];
    const stations = [...state.stations, ...extra].map((st: any) => {
      let next = { ...st, operatorId: null, phase: 'idle', progressMs: 0, outageMs: 0 };
      if (s.station && st.kind === s.station.kind) {
        next = {
          ...next,
          operatorId: me,
          phase: 'minigame',
          progressMs: 4000,
          durationMs: 4000,
          minigameSeed: 424242,
        };
        folders.push({
          ...base,
          id: 'demo-st',
          spawnKey: 's0',
          storyId: s.station.folderStoryId,
          location: { kind: 'fixture', fixtureId: st.id },
        });
      }
      if (s.outage && st.kind === s.outage) {
        next = { ...next, outageMs: 14000 };
      }
      return next;
    });
    const desks = state.desks.map((d: any, i: number) => ({
      ...d,
      operatorId: s.desk && i === 0 ? me : null,
    }));
    if (s.desk) {
      folders.push({
        ...base,
        id: 'demo-desk',
        spawnKey: 's1',
        storyId: s.desk.storyId,
        stamps: s.desk.stamps,
        location: { kind: 'fixture', fixtureId: state.desks[0].id },
      });
    }
    const conveyors = g.map().fixtures.filter((f: any) => f.kind === 'conveyor');
    (s.extraFolders ?? []).forEach((f: any, i: number) => {
      folders.push({
        ...base,
        id: f.id,
        spawnKey: `e${i}.0`,
        storyId: f.storyId,
        tag: f.tag,
        location: { kind: 'fixture', fixtureId: f.fixture ?? conveyors[i % conveyors.length].id },
      });
    });
    g.inject({ folders, stations, desks });
  }, scene);
}

async function clearScene(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __game: any }).__game;
    const state = g.getState();
    g.inject({
      folders: [],
      stations: state.stations.map((st: any) => ({
        ...st,
        operatorId: null,
        phase: 'idle',
        outageMs: 0,
      })),
      desks: state.desks.map((d: any) => ({ ...d, operatorId: null })),
    });
  });
}

/** A lobby action sent through the `?debug` session hook, as the lobby's own buttons send it. */
async function lobbyAction(page: Page, action: Record<string, unknown>): Promise<void> {
  await page.evaluate((a) => {
    (window as unknown as { __session: { lobby(a: unknown): void } }).__session.lobby(a);
  }, action);
  await page.waitForTimeout(300);
}

/** A profile after a few weeks of play (S7-104), so its dialog has figures to show. */
const PLAYER_PROFILE = {
  levels: 14,
  wins: 11,
  verdicts: 96,
  correct: 81,
  wrong: 9,
  stamps: 143,
  minigameFails: 12,
  abilities: 23,
  roleLevels: { managingEditor: 6, photoEditor: 4, archivist: 2, rescuer: 2 },
  color: 3,
  accessory: 'scarf',
};

async function emit(page: Page, event: unknown): Promise<void> {
  await page.evaluate((e) => (window as unknown as { __game: any }).__game.emit(e), event);
}

/**
 * `browser` holds the photographed player; `crowd` the players who only fill seats (see
 * `openExtraPlayer`), so their scenes never queue in the photographed page's GPU process.
 */
async function shootDevice(
  browser: Browser,
  crowd: Browser,
  baseUrl: string,
  device: Device,
): Promise<string[]> {
  const missing: string[] = [];
  const dir = (key: string) => outPath('screenshots', device.id, `${key}.png`);
  const take = async (page: Page, key: string, pause = 500) => {
    await page.waitForTimeout(pause);
    await page.screenshot({ path: dir(key) });
  };
  const attempt = async (key: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      console.warn(`[${device.id}] ${key} failed: ${(error as Error).message.split('\n')[0]}`);
      missing.push(key);
    }
  };
  // The players who only fill seats keep no preferred look, so the room gives each a colour.
  const crew = {
    progress: ALL_STARS,
    tutorialDone: true,
    met: seededMet(),
    stationHelpSeen: STATION_KINDS,
  };
  const veteran = { ...crew, playerProfile: PLAYER_PROFILE };
  const touch = device.options.hasTouch === true;

  // --- Menu, settings, encyclopedia (one veteran browser) --------------------------------
  const solo = await openPlayer(browser, baseUrl, 'Zośka', device.options, veteran);
  await solo.page.waitForTimeout(800);
  await attempt(S.menu, async () => take(solo.page, S.menu));
  await attempt(S.settingsSound, async () => {
    await solo.page.getByRole('button', { name: 'Ustawienia' }).first().click();
    await take(solo.page, S.settingsSound);
  });
  const tabs: [string, string][] = [
    [pl.settings.tabs.display, S.settingsDisplay],
    [pl.settings.tabs.access, S.settingsAccess],
    [pl.settings.tabs.controls, S.settingsControls],
  ];
  for (const [name, key] of tabs) {
    await attempt(key, async () => {
      await solo.page.getByRole('tab', { name }).click({ timeout: 4000 });
      await take(solo.page, key, 400);
    });
  }
  await solo.page
    .getByRole('button', { name: pl.settings.close })
    .first()
    .click()
    .catch(() => solo.page.keyboard.press('Escape'));
  await attempt(S.encyclopedia, async () => {
    await solo.page.getByTestId('open-encyclopedia').click();
    await take(solo.page, S.encyclopedia, 900);
  });
  await attempt(S.encyclopediaCard, async () => {
    const grid = solo.page.getByRole('group', { name: pl.encyclopedia.gridLabel });
    const first = grid.getByRole('button').first();
    await first.click({ timeout: 4000 });
    await take(solo.page, S.encyclopediaCard, 900);
  });
  await solo.page.keyboard.press('Escape');
  await solo.page.keyboard.press('Escape');
  await solo.page.waitForTimeout(400);
  await attempt(S.howToIntro, async () => {
    await solo.page.getByTestId('open-how-to').click();
    const dialog = solo.page.getByTestId('how-to-play');
    await dialog.getByTestId('intro-player').waitFor({ timeout: 8000 });
    // Into the second scene: the folder on the belt, with its subtitle.
    await take(solo.page, S.howToIntro, 7000);
    await dialog.getByTestId('intro-skip').click();
  });
  await attempt(S.howToStations, async () => {
    const dialog = solo.page.getByTestId('how-to-play');
    await dialog.getByTestId('how-to-tab-stations').click({ timeout: 4000 });
    await take(solo.page, S.howToStations, 700);
    await dialog.getByTestId('how-to-close').click();
  });
  await attempt(S.about, async () => {
    await solo.page.getByTestId('menu-footer').getByTestId('open-about').click();
    await solo.page.getByTestId('about').waitFor({ timeout: 4000 });
    await take(solo.page, S.about, 700);
    await solo.page.keyboard.press('Escape');
  });
  await attempt(S.profile, async () => {
    await solo.page.getByTestId('menu-footer').getByTestId('open-profile').click();
    await solo.page.getByTestId('profile').waitFor({ timeout: 4000 });
    await take(solo.page, S.profile, 900);
    await solo.page.keyboard.press('Escape');
  });
  await solo.context.close();

  // --- Room A: lobby, briefing and level 1 -----------------------------------------------
  const host = await openPlayer(browser, baseUrl, 'Zośka', device.options, veteran);
  const code = await createRoom(host);
  const guests: Player[] = [];
  for (const name of ['Łukasz', 'Ola', 'Kuba']) {
    const guest = await openExtraPlayer(crowd, baseUrl, name, crew);
    await joinRoom(guest, code);
    guests.push(guest);
  }
  await selectLevel(host, 'l1-burza');
  await pickRole(host, 'Redaktor prowadzący');
  await pickRole(guests[0] as Player, 'Fotoedytor');
  await pickRole(guests[1] as Player, 'Archiwista');
  // Level 1 has no phone, so the fourth seat is Wszechstronny rather than Reporter (the lobby's
  // role panel would warn that Telefon z terenu does nothing there).
  await pickRole(guests[2] as Player, 'Wszechstronny');
  for (const guest of guests) {
    await setReady(guest);
  }
  await attempt(S.lobby, async () => {
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await take(host.page, S.lobby, 700);
  });
  await attempt(S.lobbyLevels, async () => {
    await host.page.getByTestId('level-card').scrollIntoViewIfNeeded();
    await take(host.page, S.lobbyLevels, 400);
    await host.page.evaluate(() => window.scrollTo(0, 0));
  });
  await attempt(S.leaderboard, async () => {
    await host.page.getByRole('button', { name: pl.leaderboard.open }).click();
    await take(host.page, S.leaderboard, 1200);
    await host.page
      .getByRole('button', { name: pl.leaderboard.done })
      .first()
      .click()
      .catch(() => host.page.keyboard.press('Escape'));
  });
  await startAndBrief(host, guests);
  await attempt(S.briefing, async () => take(host.page, S.briefing, 1200));
  await confirmBriefing([host, ...guests]);
  await attempt(S.hud, async () => take(host.page, S.hud, 5500));
  await attempt(S.hudAbility, async () => {
    const ability = host.page.getByTestId(touch ? 'touch-ability' : 'hud-ability');
    await ability.waitFor({ timeout: 4000 });
    if (touch) {
      await ability.tap();
    } else {
      await host.page.keyboard.press('r');
    }
    await host.page.locator('[data-extended]').first().waitFor({ timeout: 4000 });
    await take(host.page, S.hudAbility, 600);
  });
  await attempt(S.gameMenu, async () => {
    const button = host.page.getByTestId('game-menu-button');
    await (touch ? button.tap() : button.click());
    await host.page.getByTestId('game-menu').waitFor({ timeout: 4000 });
    await take(host.page, S.gameMenu, 600);
    await host.page.keyboard.press('Escape');
  });
  for (const player of [host, ...guests]) {
    await player.context.close();
  }

  // --- Room B: level 6, injected scenes --------------------------------------------------
  const six = await openPlayer(browser, baseUrl, 'Zośka', device.options, veteran);
  const sixCode = await createRoom(six);
  const mate = await openExtraPlayer(crowd, baseUrl, 'Łukasz', crew);
  await joinRoom(mate, sixCode);
  await selectLevel(six, 'l6-atak');
  await setReady(mate);
  await startAndBrief(six, [mate]);
  await confirmBriefing([six, mate]);
  await attempt(S.hudSix, async () => take(six.page, S.hudSix, 4500));

  const stationShots: [StationKind, string][] = [
    ['imageSearch', S.stImageSearch],
    ['archive', S.stArchive],
    ['sourceRegistry', S.stSourceRegistry],
    ['phone', S.stPhone],
    ['aiScanner', S.stAiScanner],
    ['dataLibrary', S.stDataLibrary],
    ['metadata', S.stMetadata],
    ['transcript', S.stTranscript],
    ['crossCheck', S.stCrossCheck],
    ['geolocation', S.stGeolocation],
  ];
  for (const [kind, key] of stationShots) {
    await attempt(key, async () => {
      const story = storyForStation(kind);
      if (!story) {
        throw new Error(`no story for a ${kind} station`);
      }
      await injectScene(six.page, { station: { kind, folderStoryId: story.id } });
      await take(six.page, key, 1400);
      await clearScene(six.page);
    });
  }
  await attempt(S.stationHelp, async () => {
    // Stenogram unseen again: its overlay opens on the first-use help card.
    await six.page.evaluate(
      (kinds) => localStorage.setItem('redakcja.stationHelp.v1', JSON.stringify(kinds)),
      STATION_KINDS.filter((kind) => kind !== 'transcript'),
    );
    const story = storyForStation('transcript');
    if (!story) {
      throw new Error('no story for a transcript station');
    }
    await injectScene(six.page, { station: { kind: 'transcript', folderStoryId: story.id } });
    await six.page.getByTestId('station-help-card').waitFor({ timeout: 6000 });
    await take(six.page, S.stationHelp, 900);
    await clearScene(six.page);
  });

  // Desk: a story with a decisive stamp, evidence picked, then good and bad outcomes.
  const deskStory = getStory('l2-cytat-o-liceach') ?? STORIES[0];
  if (deskStory) {
    const stampIds = deskStory.stamps.map((s) => s.id);
    const decisive =
      deskStory.stamps.find((s) => deskStory.justifyingStamps.includes(s.id)) ??
      deskStory.stamps[0];
    await attempt(S.deskEvidence, async () => {
      await injectScene(six.page, { desk: { storyId: deskStory.id, stamps: stampIds } });
      await take(six.page, S.deskEvidence, 1200);
    });
    await attempt(S.deskVerdict, async () => {
      // The evidence list scrolls inside the sheet, under its sticky verdict footer, which can
      // take the pointer; a dispatched click picks the stamp the way a tap would.
      const evidence = six.page.getByTestId(`desk-stamp-${decisive?.id ?? stampIds[0]}`);
      await evidence.scrollIntoViewIfNeeded({ timeout: 8000 });
      await evidence.dispatchEvent('click');
      await take(six.page, S.deskVerdict, 600);
    });
    const me = (await gameInfo(six)).me ?? 'p1';
    await attempt(S.deskResultGood, async () => {
      await emit(six.page, {
        kind: 'verdictResult',
        folderId: 'demo-desk',
        spawnKey: 's1',
        storyId: deskStory.id,
        playerId: me,
        verdict: deskStory.correctVerdict,
        justifyingStampIds: [decisive?.id ?? stampIds[0]],
        outcome: 'correct',
        reason: FIXTURE_REASON.correct,
        scoreDelta: 20,
        credibilityDelta: 5,
        ...outcomeBase,
      });
      await take(six.page, S.deskResultGood, 900);
    });
    await attempt(S.deskResultBad, async () => {
      await six.page.keyboard.press('Escape');
      await injectScene(six.page, {
        desk: { storyId: deskStory.id, stamps: stampIds.slice(0, 1) },
      });
      await emit(six.page, {
        kind: 'verdictResult',
        folderId: 'demo-desk',
        spawnKey: 's1',
        storyId: deskStory.id,
        playerId: me,
        verdict: 'publish',
        justifyingStampIds: [stampIds[0]],
        outcome: 'wrong',
        reason: FIXTURE_REASON.wrong,
        scoreDelta: -20,
        credibilityDelta: -25,
        ...outcomeBase,
        missedStampIds: deskStory.justifyingStamps,
      });
      await take(six.page, S.deskResultBad, 900);
    });
    await clearScene(six.page);
    await six.page.keyboard.press('Escape');
  }

  // Level events: banner plus the folder badge or station sign each event adds.
  const pool = STORIES.filter((s) => s.id.startsWith('l6-')).map((s) => s.id);
  const eventShots: {
    key: string;
    event: 'viral' | 'bossCall' | 'botRaid' | 'outage' | 'correction';
    scene: Parameters<typeof injectScene>[1];
    extra?: object;
  }[] = [
    {
      key: S.evBoss,
      event: 'bossCall',
      scene: {
        extraFolders: [
          { id: 'ev-1', storyId: pool[0] as string, tag: { kind: 'bossCall', untilMs: 40000 } },
          { id: 'ev-2', storyId: pool[1] as string },
        ],
      },
    },
    {
      key: S.evViral,
      event: 'viral',
      scene: {
        extraFolders: [
          { id: 'ev-1', storyId: pool[2] as string, tag: { kind: 'viral' } },
          { id: 'ev-2', storyId: pool[3] as string },
        ],
      },
    },
    {
      key: S.evRaid,
      event: 'botRaid',
      scene: {
        extraFolders: [0, 1, 2].map((i) => ({
          id: `ev-${i}`,
          storyId: pool[4] as string,
          tag: { kind: 'botRaid', raidId: 'raid-1' },
        })),
      },
    },
    {
      key: S.evOutage,
      event: 'outage',
      scene: { outage: 'archive', extraFolders: [{ id: 'ev-1', storyId: pool[5] as string }] },
      extra: { stationId: 'archive-0', durationMs: 20000 },
    },
    {
      key: S.evCorrection,
      event: 'correction',
      scene: {
        extraFolders: [
          {
            id: 'ev-1',
            storyId: pool[6] as string,
            tag: { kind: 'correction', recoverCredibility: 12 },
          },
        ],
      },
    },
  ];
  for (const shot of eventShots) {
    await attempt(shot.key, async () => {
      await injectScene(six.page, shot.scene);
      await emit(six.page, {
        kind: 'levelEvent',
        event: shot.event,
        phase: 'start',
        folderIds: ['ev-1'],
        ...shot.extra,
      });
      await take(six.page, shot.key, 1100);
      await clearScene(six.page);
      await six.page.waitForTimeout(4200);
    });
  }

  // Results and the Kolegium (debrief) for a finished level 1.
  // Fourteen l1 folders: one fake published (the third card, the Kolegium's „błąd” shot) and one
  // urgent folder lost; two stars on the run's own thresholds.
  const l1Stories = STORIES.filter((s) => s.id.startsWith('l1-')).slice(0, 14);
  const l1Run = fixtureRun(
    l1Stories,
    l1Stories.map((s, i) =>
      i === 2 ? 'wrong' : s.id === 'l1-ostrzezenie-burzowe' ? 'expired' : 'correct',
    ),
  );
  const l1Level = LEVELS.find((level) => level.id === 'l1-burza');
  const l1Thresholds = starThresholds(l1Run.maxScore, l1Level?.bag?.starShares);
  await attempt(S.results, async () => {
    await six.page.evaluate(
      ({ run, thresholds }) => {
        (window as unknown as { __game: any }).__game.setState({
          levelEnd: {
            type: 'levelEnd',
            levelId: 'l1-burza',
            difficulty: 'normal',
            won: true,
            stars: run.score >= thresholds.three ? 3 : run.score >= thresholds.two ? 2 : 1,
            score: run.score,
            credibility: run.credibility,
            results: run.results,
            lossReason: null,
            starThresholds: thresholds,
            maxScore: run.maxScore,
          },
        });
      },
      { run: l1Run, thresholds: l1Thresholds },
    );
    await take(six.page, S.results, 3500);
  });
  await attempt(S.kolegium, async () => {
    await scrollToKolegium(six.page);
    await take(six.page, S.kolegium, 900);
  });
  await attempt(S.kolegiumMissed, async () => {
    // The wrong verdict is the third card. Phones page the Kolegium (page 0 is the summary,
    // S7-06); wider screens list every card, so scroll to it.
    const next = six.page.getByRole('button', { name: pl.debrief.next });
    if (await next.isVisible()) {
      for (let i = 0; i < 3; i++) {
        await next.click({ timeout: 8000 });
        await six.page.waitForTimeout(250);
      }
    } else {
      await six.page.getByTestId('kolegium-card').nth(2).scrollIntoViewIfNeeded({ timeout: 8000 });
    }
    await take(six.page, S.kolegiumMissed, 700);
  });
  await six.context.close();
  await mate.context.close();

  // --- Room C: endless mode --------------------------------------------------------------
  const endless = await openPlayer(browser, baseUrl, 'Zośka', device.options, veteran);
  await createRoom(endless);
  await selectLevel(endless, 'endless');
  await endless.page.getByRole('button', { name: 'Do składu!' }).click();
  await endless.page.getByRole('button', { name: 'Gotowy!' }).waitFor();
  await attempt(S.endlessBriefing, async () => take(endless.page, S.endlessBriefing, 1200));
  await confirmBriefing([endless]);
  await attempt(S.endlessHud, async () => take(endless.page, S.endlessHud, 6000));
  await attempt(S.endlessResults, async () => {
    // A long endless run from l2–l4 folders: after the eighteenth folder the team publishes
    // every fake it gets, and the 32nd folder takes the credibility bar to zero.
    const pool = STORIES.filter((s) => /^l[234]-/.test(s.id)).slice(0, 32);
    const run = fixtureRun(
      pool,
      pool.map((s, i) =>
        s.correctVerdict === 'reject' && i >= 18 ? 'wrong' : i % 11 === 5 ? 'expired' : 'correct',
      ),
    );
    await endless.page.evaluate((r) => {
      (window as unknown as { __game: any }).__game.setState({
        levelEnd: {
          type: 'levelEnd',
          levelId: 'endless',
          difficulty: 'normal',
          won: false,
          stars: 0,
          score: r.score,
          credibility: 0,
          results: r.results,
          lossReason: 'credibility',
          starThresholds: null,
          maxScore: null,
          survivedS: 212,
        },
      });
    }, run);
    await take(endless.page, S.endlessResults, 3500);
  });
  await endless.context.close();

  // --- Room D: room browser, versus lobby and the Widownia ---------------------------------
  // Ola hosts a public versus room („3B piątek”) open to spectators; Marta a second public room
  // so the list has more than one row. Zośka (photographed) finds the room in the browser, joins
  // Ola's newsroom for the lobby shot, then moves to the Widownia and watches Ola against Kuba.
  const rival = await openExtraPlayer(crowd, baseUrl, 'Ola', crew);
  const versusCode = await createRoom(rival);
  for (const action of [
    { kind: 'setRoomName', name: '3B piątek' },
    { kind: 'setVisibility', visibility: 'public' },
    { kind: 'setSpectatorsAllowed', allowed: true },
    { kind: 'setMode', mode: 'versus' },
    // The extra player's small page has no room for the level tiles.
    { kind: 'selectLevel', levelId: 'l1-burza' },
  ]) {
    await lobbyAction(rival.page, action);
  }
  const other = await openExtraPlayer(crowd, baseUrl, 'Marta', crew);
  await createRoom(other);
  for (const action of [
    { kind: 'setRoomName', name: 'Kółko dziennikarskie' },
    { kind: 'setVisibility', visibility: 'public' },
  ]) {
    await lobbyAction(other.page, action);
  }
  // Kuba joins first (Głos), so Zośka lands in Kurier with Ola and leaves it to Kuba's rival
  // when she moves to the Widownia: both newsrooms keep a player and the match can start.
  const kuba = await openExtraPlayer(crowd, baseUrl, 'Kuba', crew);
  await joinRoom(kuba, versusCode);
  await setReady(kuba);
  const watcher = await openPlayer(browser, baseUrl, 'Zośka', device.options, veteran);
  await attempt(S.roomBrowser, async () => {
    await watcher.page.getByTestId('open-room-browser').click();
    const dialog = watcher.page.getByTestId('room-browser');
    const row = dialog.getByTestId(`room-row-${versusCode}`);
    // The server caches the list for 2 s and the dialog asks every 8 s.
    await row.waitFor({ timeout: 20_000 });
    await row.click();
    await dialog.getByTestId('room-join').waitFor({ timeout: 4000 });
    await take(watcher.page, S.roomBrowser, 600);
    await dialog.getByTestId('room-join').click();
  });
  // „Dołącz” in the browser joins the picked room; if that shot failed, join by code instead.
  const joined = await watcher.page
    .getByTestId('room-code')
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!joined) {
    await watcher.page.keyboard.press('Escape');
    await joinRoom(watcher, versusCode);
  }
  await setReady(watcher);
  await attempt(S.lobbyVersus, async () => {
    await watcher.page.evaluate(() => window.scrollTo(0, 0));
    await take(watcher.page, S.lobbyVersus, 900);
  });
  await attempt(S.spectate, async () => {
    await lobbyAction(watcher.page, { kind: 'setSpectator', spectator: true });
    await rival.page.getByRole('button', { name: 'Do składu!' }).click({ timeout: 8000 });
    for (const player of [rival, kuba]) {
      await player.page.getByRole('button', { name: 'Gotowy!' }).click({ timeout: 20_000 });
    }
    await watcher.page.getByTestId('spectate-screen').waitFor({ timeout: 90_000 });
    await watcher.page.getByTestId('spectate-score-1').waitFor({ timeout: 30_000 });
    await take(watcher.page, S.spectate, 9000);
  });
  for (const player of [watcher, rival, other, kuba]) {
    await player.context.close();
  }

  // --- First-game tutorial (a browser that has never played) -----------------------------
  const newbie = await openPlayer(browser, baseUrl, 'Zośka', device.options, {});
  await createRoom(newbie);
  await selectLevel(newbie, 'l1-burza').catch(() => undefined);
  await newbie.page.getByRole('button', { name: 'Do składu!' }).click();
  await newbie.page.getByRole('button', { name: 'Gotowy!' }).click();
  await newbie.page.getByTestId('hud').waitFor({ timeout: 30_000 });
  await attempt(S.tutorialMove, async () => take(newbie.page, S.tutorialMove, 3500));
  if (!touch) {
    await attempt(S.tutorialPickup, async () => {
      // Walking moves the tutorial on; stop at the conveyor.
      const info = await gameInfo(newbie);
      const conveyor = info.folders.find((f) => f.location.kind === 'fixture');
      const fx = info.fixtures.find((f) => f.id === conveyor?.location.fixtureId);
      if (!fx) {
        throw new Error('no folder on the conveyor yet');
      }
      await walkTo(newbie, { x: fx.col + 0.5, y: fx.row + 1.5 });
      await faceTowards(newbie, 'KeyW');
      await take(newbie.page, S.tutorialPickup, 600);
      await newbie.page.keyboard.press('KeyE');
    });
    await attempt(S.tutorialWork, async () => take(newbie.page, S.tutorialWork, 900));
  } else {
    // The walk to the conveyor is keyboard-driven; on phones these two shots are not taken, so the
    // index says so instead of linking files that do not exist.
    missing.push(S.tutorialPickup, S.tutorialWork);
  }
  await newbie.context.close();
  return missing;
}

async function scrollToKolegium(page: Page): Promise<void> {
  await page
    .getByRole('region', { name: pl.debrief.title })
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);
  await page
    .getByText(pl.debrief.title, { exact: true })
    .first()
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);
}

function indexMarkdown(missingByDevice: Record<string, string[]>): string {
  const rows = SHOTS.map((shot) => {
    const cells = DEVICES.map((device) => {
      const missing = missingByDevice[device.id]?.includes(shot.key);
      const path = `${device.id}/${shot.key}.png`;
      return missing ? 'brak' : `[![${shot.title}, ${device.label}](${path})](${path})`;
    });
    return `| **${shot.title}**<br>${shot.caption} | ${cells.join(' | ')} |`;
  });
  return `# Zrzuty ekranu

Zrzuty wszystkich ekranów i stanów gry: komputer (1366×768) i telefon (Pixel 7, poziomo). Plik jest **generowany** poleceniem \`bun run contest:build\`, więc po zmianach w interfejsie wystarczy uruchomić je ponownie.

Menu, poczekalnia, briefing i samouczek to prawdziwe ekrany prowadzone przez serwer gry. Stanowiska, stół, zdarzenia i podsumowanie zostały ustawione pomocniczym uchwytem \`?debug\` (ten sam stan, który serwer wysyła w rozgrywce). Dzięki temu wszystkie dziesięć stanowisk i pięć zdarzeń widać na jednym zestawie zrzutów.

| Ekran i opis | ${DEVICES.map((d) => d.label).join(' | ')} |
| --- | --- | --- |
${rows.join('\n')}
`;
}

export async function buildScreenshots(): Promise<Record<string, string[]>> {
  const stack = await startStack();
  const browser = await launchBrowser();
  const crowd = await launchBrowser();
  const missing: Record<string, string[]> = {};
  try {
    for (const device of DEVICES) {
      console.log(`screenshots: ${device.label}`);
      missing[device.id] = await shootDevice(browser, crowd, stack.baseUrl, device);
    }
  } finally {
    await crowd.close();
    await browser.close();
    await stack.stop();
  }
  await writeOut(outPath('screenshots/README.md'), indexMarkdown(missing));
  return missing;
}

if (import.meta.main) {
  const missing = await buildScreenshots();
  const all = Object.entries(missing).flatMap(([device, keys]) =>
    keys.map((key) => `${device}/${key}`),
  );
  console.log(all.length ? `missing: ${all.join(', ')}` : 'all screenshots taken');
  process.exit(0);
}

export { LEVELS };
