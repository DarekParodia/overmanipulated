// All player-facing Polish text. Keys are English; wording follows agents/design-rules.md §9:
// a gruff, warm editor-in-chief — short, concrete, newsroom vocabulary, no marketing voice.
import type {
  Ability,
  AbilityBlockReason,
  Difficulty,
  ErrorCode,
  FolderBonuses,
  FolderOutcome,
  FolderReason,
  LevelEventKind,
  LossReason,
  PingKind,
  Priority,
  Role,
  RoomMode,
  RoomVisibility,
  StationKind,
  StoryType,
  Verdict,
} from '@redakcja/shared';
import { ABILITY } from '@redakcja/shared';
import type { ProofStatus } from '../debrief/debrief-model.ts';
import type { TotalsRowId } from '../debrief/results-model.ts';
import type { RoomListProblem } from '../rooms/room-list-model.ts';
import type { GeoOutcome, Landmark } from '../stations/minigames/geolocation.logic.ts';
import type { InputDevice as Device } from '../store/app.ts';
import type { Accessory } from '../store/profile-model.ts';
import { listPl, pluralPl } from './plural.ts';

/**
 * Key-cap hints shown under a minigame, per input device. On touch the cap names the gesture
 * („Stuknij”, „Przesuń”) or the on-screen button to press.
 */
export type KeyHint = { keys: readonly string[]; label: string };
type KeyHints = Record<Device, readonly KeyHint[]>;

/** Two or three short steps (each ≤ 8 words) for one input device. */
export type StationHelpSteps = readonly [string, string] | readonly [string, string, string];

/**
 * How one station works (S7-15): the single source for the station help card, the practice
 * round, the lobby level details and the contest materials. Every line but `realWorld` is read
 * during play, so it stays within 8 words (strings/station-help.test.ts).
 */
export type StationHelp = {
  /** The question the station answers. */
  purpose: string;
  /** What its stamp proves, read after `stationHelp.proofLabel`. */
  proves: string;
  /** What to do, for the device in use. */
  steps: Record<Device, StationHelpSteps>;
  /** The real-world tool or habit behind the station; longer, shown outside play only. */
  realWorld: string;
};

export const pl = {
  masthead: {
    paper: 'Kurier Nowobrzeski',
    edition: (n: number) => `Wydanie nr ${n}`,
  },
  menu: {
    /** The game logo; also the main menu's heading (e2e looks for it). */
    titleTop: 'Redakcja',
    titleBottom: 'na Ostatnią Chwilę',
    tagline: 'Sprawdź, zanim puścisz do druku!',
    bylineLabel: 'Twój podpis',
    bylinePlaceholder: 'np. Zośka',
    createAction: 'Otwórz pokój',
    or: 'albo dołącz',
    joinCodeLabel: 'Kod pokoju',
    joinCodePlaceholder: 'ABCD',
    joinAction: 'Dołącz',
    settings: 'Ustawienia',
    needByline: 'Najpierw wpisz podpis.',
    needCode: 'Kod ma cztery litery.',
    pressDown: 'Serwer gry nie odpowiada.',
    /** Message of the day (S7-72): the banner's name and its close button. */
    motdLabel: 'Komunikat redakcji',
    motdClose: 'Zamknij komunikat',
    /** Footer link (S7-74): reopens Google's ad consent message. */
    adConsent: 'Zgody reklamowe',
    /** Offered next to `matchInProgress` (S7-84): watch the same room from the Widownia. */
    watchAction: 'Oglądaj',
    /** `matchInProgress` when „Oglądaj” is offered next to it (S7-86). */
    matchInProgressWatch: 'Pojedynek trwa. Możesz go oglądać.',
    /** Room browser (S7-88): the entry under the join row, and the eye next to „Dołącz”. */
    browseRooms: 'Publiczne pokoje',
    watchByCode: 'Oglądaj pokój o tym kodzie',
    /** Footer link (S7-75): the privacy note at /prywatnosc, in the same tab. */
    privacy: 'Prywatność',
  },
  /** Ads (S7-73): the frame's label, also its name for screen readers. */
  ads: {
    label: 'Reklama',
  },
  lobby: {
    codeLabel: 'Kod pokoju',
    copy: 'Skopiuj kod',
    copied: 'Skopiowano!',
    host: 'Gospodarz',
    you: 'Ty',
    disconnected: 'Rozłączony',
    emptySlot: 'Wolne miejsce',
    start: 'Do składu!',
    waitingForHost: 'Gospodarz zaraz zaczyna.',
    leave: 'Wyjdź',
    settings: 'Ustawienia',
    playersCount: (n: number, max: number) => `${n} z ${max} przy biurkach`,
  },
  game: {
    leave: 'Wyjdź z redakcji',
    rotate: 'Obróć telefon poziomo',
    rotateHint: 'Gra działa tylko poziomo.',
    reconnecting: 'Łączymy ponownie…',
    loading: 'Wczytujemy redakcję…',
  },
  /**
   * In-game menu (S7-10): the one top-right button and its sheet. Solo, it pauses the level;
   * with teammates the level runs on.
   */
  gameMenu: {
    open: 'Menu',
    title: 'Menu',
    paused: 'Pauza',
    live: 'Gra trwa dalej',
    resume: 'Wróć do gry',
    settings: 'Ustawienia',
    /** S7-97: „Jak grać” on its stations tab, practice off. */
    stationHelp: 'Pomoc: stanowiska',
    fullscreen: 'Pełny ekran',
    exitFullscreen: 'Zamknij pełny ekran',
    leave: 'Wyjdź z redakcji',
    leaveConfirm: 'Na pewno? Wyjdź',
    room: (code: string) => `Pokój ${code}`,
    copy: 'Skopiuj kod',
    copied: 'Skopiowano!',
    ping: (ms: number) => `${ms}\u00a0ms`,
    offline: 'Brak połączenia',
  },
  touch: {
    interact: 'Podnieś',
    work: 'Pracuj',
    ping: 'Sygnał',
    joystick: 'Ruch',
    /** The fourth thumb button before it shows the role's own ability (S7-39). */
    abilityGeneric: 'Zdolność',
    /** The fourth thumb button's one-word label per ability (S7-40). */
    ability: {
      expertise: 'Ekspert',
      fieldCall: 'Dzwoń',
      extendDeadline: `+${ABILITY.extendDeadline.addMs / 1000}\u00a0s`,
      secondChance: 'Szansa',
      passFolder: 'Podaj',
    } satisfies Record<Ability, string>,
  },
  connection: {
    connecting: 'Łączenie…',
    online: 'Połączono',
    reconnecting: 'Łączymy ponownie…',
    offline: 'Brak połączenia',
  },
  errors: {
    invalidMessage: 'Coś poszło nie tak w łączności. Spróbuj jeszcze raz.',
    protocolMismatch: 'Masz starą wersję gry. Odśwież stronę.',
    invalidNickname: 'Ten podpis nie przejdzie. Od 1 do 16 znaków.',
    roomNotFound: 'Nie ma redakcji z takim kodem.',
    roomFull: 'W tej redakcji wszystkie biurka zajęte.',
    reconnectFailed: 'Twoje miejsce już przepadło. Dołącz od nowa.',
    notHost: 'Wydanie otwiera tylko gospodarz.',
    notInRoom: 'Nie jesteś w żadnej redakcji.',
    notReady: 'Nie wszyscy są gotowi.',
    unknownLevel: 'Nie ma takiego wydania.',
    teamFull: 'Ta redakcja ma już komplet.',
    spectatorsFull: 'Na widowni nie ma już miejsc.',
    spectatorsOff: 'Ta redakcja nie wpuszcza widowni.',
    /** Without „Oglądaj” (spectators off): nothing to offer, so no promise (S7-86). */
    matchInProgress: 'Pojedynek już trwa. Dołącz po meczu.',
    teamEmpty: 'Każda redakcja potrzebuje gracza.',
    kicked: 'Gospodarz usunął cię z pokoju.',
    kickCooldown: 'Gospodarz niedawno cię usunął. Wróć później.',
    invalidTarget: 'Tej osoby nie ma już w pokoju.',
    invalidName: 'Ta nazwa nie przejdzie. Wybierz inną.',
    featureDisabled: 'Ta opcja jest wyłączona na serwerze.',
    connectionLost: 'Zerwane połączenie z redakcją.',
  } satisfies Record<ErrorCode | 'connectionLost', string>,
  settings: {
    title: 'Ustawienia',
    sound: 'Dźwięk',
    master: 'Głośność',
    music: 'Muzyka',
    sfx: 'Efekty',
    ui: 'Przyciski',
    voice: 'Lektor',
    mute: 'Wycisz wszystko',
    display: 'Obraz',
    quality: 'Jakość grafiki',
    qualityLow: 'Niska',
    qualityMedium: 'Średnia',
    qualityHigh: 'Wysoka',
    qualityAuto: 'Auto',
    textScale: 'Wielkość tekstu',
    access: 'Dostępność',
    reducedMotion: 'Mniej ruchu',
    noFlash: 'Bez migania',
    haptics: 'Wibracje',
    leftHanded: 'Sterowanie dla leworęcznych',
    hints: 'Podpowiedzi „co dalej”',
    tutorialAgain: 'Pokaż samouczek jeszcze raz',
    tutorialQueued: 'Samouczek w następnej grze',
    /** Clears the seen station help cards (S7-95). */
    stationHelpAgain: 'Pokaż pomoc stanowisk od nowa',
    stationHelpQueued: 'Pomoc pokaże się znowu',
    close: 'Gotowe',
    closeIcon: 'Zamknij',
    // S5-06 settings screen.
    tabs: {
      sound: 'Dźwięk',
      display: 'Obraz',
      access: 'Ułatwienia',
      touch: 'Dotyk',
      controls: 'Sterowanie',
    },
    tabList: 'Działy ustawień',
    qualityNoteAuto: 'Gra sama dobiera jakość do urządzenia.',
    qualityNote: {
      low: 'Najlżejsza. Dla starych telefonów.',
      medium: 'Złoty środek na większości sprzętu.',
      high: 'Najładniejsza. Cienie i dużo detali.',
    },
    captions: 'Napisy do dźwięków',
    captionsNote: 'Pokazują, co słychać w grze.',
    reducedMotionNote: 'Mniej trzęsienia i skakania.',
    noFlashNote: 'Bez błysków i migania ekranu.',
    touchTitle: 'Przyciski na ekranie',
    touchScale: 'Wielkość przycisków',
    touchOpacity: 'Widoczność przycisków',
    leftHandedNote: 'Drążek po prawej, przyciski po lewej.',
    touchPreview: 'Podgląd przycisków na ekranie',
    hapticsTitle: 'Wibracje',
    rumble: 'Siła wibracji',
    rumbleNote: 'Telefon i pad. 0% to cisza.',
    reset: 'Przywróć domyślne',
    resetDone: 'Przywrócono!',
    controlsTitle: 'Sterowanie',
    devices: { keyboard: 'Klawiatura', gamepad: 'Pad', touch: 'Dotyk' },
    actions: {
      move: 'Ruch',
      interact: 'Podnieś / odłóż',
      work: 'Pracuj (trzymaj)',
      ping: 'Sygnał',
      ability: 'Zdolność roli',
      stationHelp: 'Pomoc stanowiska',
    },
    keySpace: 'Spacja',
    padStick: 'Lewa gałka',
    padDpad: 'Krzyżak',
    touchStick: 'Drążek',
    controlsMenuNote: 'W menu: strzałki lub krzyżak, Enter lub A, Esc lub B.',
    padHint: 'Y zmienia dział',
  },
  styleguide: {
    title: 'Styl gry',
    subtitle: 'Kreskówkowa redakcja – kolory, pismo, przyciski',
    colours: 'Kolory',
    meaningColours: 'Kolor = znaczenie',
    baseColours: 'Tło i neutralne',
    playerColours: 'Gracze',
    meanings: {
      yellow: 'Zrób to teraz',
      green: 'Prawda, gotowe',
      red: 'Fałsz, błąd',
      orange: 'Kontekst, uwaga',
      blue: 'Informacja, wybór',
      purple: 'Pomoc',
    },
    type: 'Pismo',
    buttons: 'Przyciski',
    panel: 'Panel',
    panelText: 'Biały panel z grubym konturem i twardym cieniem.',
    inputs: 'Pola i przełączniki',
    icons: 'Ikony',
    stamps: 'Pieczątki',
    stampAgain: 'Przybij jeszcze raz',
    minigames: 'Minigry',
    stationHelp: 'Pomoc stanowisk',
    stationHelpVariants: { inPlay: 'W grze', full: 'W „Jak grać”' },
    stampsHint: 'Pieczątki werdyktów – jedno pismo w całej grze.',
    iconGroups: {
      storyTypes: 'Rodzaje materiałów',
      stations: 'Stanowiska',
      verdicts: 'Werdykty',
      roles: 'Role',
      events: 'Zdarzenia',
      pings: 'Sygnały',
      techniques: 'Techniki manipulacji',
      ui: 'Interfejs',
    },
  },
  /** Final verdict stamp lettering (ui/VerdictStamp.tsx); short words, shown in capitals. */
  stamps: {
    publish: 'Opublikuj',
    reject: 'Odrzuć',
    publishWithContext: 'Z kontekstem',
    correction: 'Sprostowanie',
    expired: 'Przepadła',
  },
  // --- Stage 2 gameplay. Shared vocabulary first, then one namespace per feature. ----------
  vocab: {
    /** Versus newsrooms by team index (S7-84): 0 Kurier, 1 Głos. */
    teams: ['Kurier', 'Głos'],
    /** Room modes (S7-86): one shared newsroom, or two newsrooms for points. */
    modes: {
      coop: 'Razem',
      versus: 'Na punkty',
    } satisfies Record<RoomMode, string>,
    /** Room visibility (S7-86): reached by code only, or listed in the room browser. */
    visibility: {
      private: 'Prywatny',
      public: 'Publiczny',
    } satisfies Record<RoomVisibility, string>,
    storyTypes: {
      photo: 'Zdjęcie',
      quote: 'Cytat',
      post: 'Post',
      recording: 'Nagranie',
      statistic: 'Statystyka',
      article: 'Artykuł',
    } satisfies Record<StoryType, string>,
    priorities: {
      normal: 'Zwykły',
      important: 'Ważny',
      urgent: 'Pilny',
    } satisfies Record<Priority, string>,
    verdicts: {
      publish: 'Publikuj',
      reject: 'Odrzuć',
      publishWithContext: 'Publikuj z kontekstem',
    } satisfies Record<Verdict, string>,
    stations: {
      imageSearch: 'Lupa obrazu',
      archive: 'Archiwum',
      sourceRegistry: 'Kartoteka źródeł',
      phone: 'Telefon',
      aiScanner: 'Skaner AI',
      dataLibrary: 'Biblioteka danych',
      geolocation: 'Mapa',
      transcript: 'Stenogram',
      crossCheck: 'Inne media',
      metadata: 'Metadane',
    } satisfies Record<StationKind, string>,
    roles: {
      photoEditor: 'Fotoedytor',
      archivist: 'Archiwista',
      reporter: 'Reporter',
      managingEditor: 'Redaktor prowadzący',
      generalist: 'Wszechstronny',
      rescuer: 'Ratownik',
    } satisfies Record<Role, string>,
    /** Role abilities (S7-36, glossary): the HUD chip's accessible name and the help texts. */
    abilities: {
      expertise: 'Ekspertyza',
      fieldCall: 'Telefon z terenu',
      extendDeadline: 'Przedłużenie',
      secondChance: 'Druga szansa',
      passFolder: 'Podaj teczkę',
    } satisfies Record<Ability, string>,
    pings: {
      needArchive: 'Potrzebuję Archiwum!',
      fake: 'Fałszywka!',
      mine: 'Biorę to',
    } satisfies Record<PingKind, string>,
    /** One-word signs floating over interactive fixtures in the 3D newsroom. */
    signs: {
      imageSearch: 'Lupa',
      archive: 'Archiwum',
      sourceRegistry: 'Kartoteka',
      phone: 'Telefon',
      aiScanner: 'Skaner',
      dataLibrary: 'Dane',
      geolocation: 'Mapa',
      transcript: 'Stenogram',
      crossCheck: 'Media',
      metadata: 'Metadane',
      conveyor: 'Wejście',
      desk: 'Stół',
    } satisfies Record<StationKind | 'conveyor' | 'desk', string>,
  },
  /** Lobby: roles, readiness, level select (S2-10). */
  lobbyRoles: {
    passesTitle: 'Wybierz rolę',
    noRole: 'Bez roli',
    noRoleBonus: 'Bez premii',
    noRoleAbility: 'Bez zdolności',
    /** Lobby detail panel (S7-44): the passive's speed bonus; station chips follow it. */
    fasterPassive: (percent: number) => `Praca o\u00a0${percent}% szybciej`,
    /** The passive of a role that is faster at every station (Wszechstronny). */
    everywhereFaster: (percent: number) => `Wszędzie praca o\u00a0${percent}% szybciej`,
    /** The reporter's second passive rule (`ROLE_PERKS.skipsPhoneQueue`). */
    phoneQueue: 'Telefon bez kolejki',
    /** Koło ratunkowe (Ratownik), from RESCUE_ADD_MS. */
    rescuePassive: (seconds: number) => `Raz ratuje teczkę w\u00a0ręce (+${seconds}\u00a0s)`,
    /** What each role's ability does, in a few words (lobby detail panel, tutorial; S7-44/45). */
    abilityWhat: {
      photoEditor: 'zadanie przy obrazie od razu',
      archivist: 'zadanie przy dokumentach od razu',
      reporter: 'pieczątka Telefonu bez chodzenia',
      managingEditor: `+${ABILITY.extendDeadline.addMs / 1000}\u00a0s dla teczki w\u00a0ręce lub najpilniejszej`,
      generalist: 'po pudle od razu jeszcze raz',
      rescuer: 'rzut do najbliższej wolnej osoby',
    } satisfies Record<Role, string>,
    /** The ability line: its name and what it does. */
    abilityLine: (name: string, what: string) => `${name} – ${what}`,
    /** The ability's cooldown in the detail panel. */
    cooldown: (seconds: number) => `co ${seconds}\u00a0s`,
    /** The key cap of the ability on touch (the fourth thumb button). */
    touchKey: 'Przycisk',
    /** Headings of the detail panel's two lines (screen readers and the compact layout). */
    passiveLabel: 'Premia',
    abilityLabel: 'Zdolność',
    /** Notes under the detail panel when the shown role's perk does nothing on the chosen level. */
    passiveNotHere: 'Ta premia nie działa na tym poziomie.',
    abilityNotHere: 'Ta zdolność nie działa na tym poziomie.',
    /** Screen-reader line of a role pass: which teammates chose it (the dots on the pass). */
    pickedBy: (names: readonly string[]) =>
      `${names.length === 1 ? 'Tę rolę ma' : 'Tę rolę mają'}: ${listPl(names)}`,
    ready: 'Gotowy',
    readyDone: 'Gotowy!',
    readyHint: 'Zaznacz, gdy możesz grać.',
    readyState: 'Gotowy',
    notReady: 'Czeka',
    levelKicker: 'Poziom',
    levelPick: 'Wybierz poziom',
    levelHostOnly: 'Poziom wybiera gospodarz.',
    levelMinutes: (minutes: number) => `${minutes} min`,
    levelFolders: (folders: number) =>
      `${folders} ${pluralPl(folders, 'teczka', 'teczki', 'teczek')}`,
    startOffline: 'Brak połączenia z serwerem.',
    startWaiting: (names: readonly string[]) => `Czekamy na: ${names.join(', ')}.`,
    allReady: 'Wszyscy gotowi!',
  },
  /**
   * Lobby room settings (S7-86): name, visibility, mode, the two newsroom columns and the
   * Widownia strip.
   */
  lobbyRoom: {
    settingsTitle: 'Pokój',
    nameLabel: 'Nazwa pokoju',
    namePlaceholder: 'np. 3B – piątek',
    /** A room without a name shows its host. */
    noName: (host: string) => `Pokój: ${host}`,
    visibilityLabel: 'Widoczność pokoju',
    visibilityHints: {
      private: 'Wejście tylko z\u00a0kodem',
      public: 'Pokój widać na liście',
    } satisfies Record<RoomVisibility, string>,
    modeLabel: 'Tryb gry',
    modeHints: {
      coop: 'Jedna redakcja, wspólny wynik',
      versus: 'Dwie redakcje, wygrywa więcej punktów',
    } satisfies Record<RoomMode, string>,
    /** A newsroom column's head: its players out of its seats. */
    teamCount: (n: number, max: number) => `${n}\u00a0z\u00a0${max}`,
    joinTeam: 'Przejdź tutaj',
    uneven: 'Drużyny są nierówne',
    spectatorsTitle: (n: number, max: number) => `Widownia: ${n}\u00a0z\u00a0${max}`,
    /** The host's switch: may spectators join this room. */
    spectatorsAllowed: 'Widownia otwarta',
    spectatorsClosed: 'Widownia zamknięta',
    noSpectators: 'Nikt nie ogląda',
    toSpectators: 'Na widownię',
    toPlayers: 'Do gry',
    spectatorWaiting: 'Oglądasz. Gospodarz zaraz zaczyna.',
    spectatorFull: 'Brak wolnych miejsc przy biurkach.',
    /** Start gate (the server answers `teamEmpty`): a newsroom has no connected player. */
    startTeamEmpty: (team: string) => `${team}: brak graczy.`,
    startNoPlayers: 'Nikt nie siedzi przy biurku.',
    /** In-game toast when someone starts watching (S7-86). */
    spectatorJoined: 'Widz dołączył',
  },
  /**
   * The host's manage sheet (S7-87): the „more” button on another member's card opens it with
   * the moves the server would accept and the kick behind a confirm step.
   */
  manage: {
    /** The „more” button's accessible name (the sheet's heading is the nickname). */
    open: (name: string) => `Opcje: ${name}`,
    kicker: 'Opcje gracza',
    watching: 'Ogląda z\u00a0widowni',
    moveTo: (team: string) => `Przenieś do: ${team}`,
    makeHost: 'Przekaż gospodarza',
    kick: 'Usuń z\u00a0pokoju',
    kickConfirm: 'Usunąć na pewno?',
    kickYes: 'Tak, usuń',
    cancel: 'Anuluj',
    close: 'Zamknij',
  },
  /**
   * „Szczegóły” of the chosen level in the lobby (S7-87), for guests and the host: stations,
   * events, the star rule, the best stars from this browser and the rule of the mode.
   */
  levelDetails: {
    open: 'Szczegóły',
    kicker: 'Szczegóły poziomu',
    stations: 'Stanowiska',
    events: 'Zdarzenia',
    noEvents: 'Bez niespodzianek. Same teczki.',
    /** What each event does, one short line (outside play, so a little longer than a banner). */
    eventWhat: {
      viral: 'Teczka krąży po sieci i\u00a0zyskuje udostępnienia',
      bossCall: 'Szef naciska na publikację. Sprawdź mimo to',
      botRaid: 'Fala niemal takich samych teczek',
      outage: 'Jedno stanowisko na chwilę przestaje działać',
      correction: 'Opublikowany błąd trzeba sprostować przy stole',
    } satisfies Record<LevelEventKind, string>,
    folders: (n: number) => `${n} ${pluralPl(n, 'teczka', 'teczki', 'teczek')}`,
    /** A bag level: the folders a run deals out of how many stories it may draw. */
    pool: (n: number) => `z\u00a0puli ${n} historii`,
    stars: 'Gwiazdki',
    starOne: 'Wynik powyżej zera',
    starShare: (percent: number) => `${percent}% możliwych punktów`,
    starPoints: (points: number) => `${points}\u00a0pkt`,
    /** A bag level in the lobby: the run (and its points) is dealt at the briefing. */
    starsLater: 'Progi w\u00a0punktach zobaczycie na odprawie.',
    /** Accessible name of a star rule row. */
    starsLabel: (n: number) => `${n} ${pluralPl(n, 'gwiazdka', 'gwiazdki', 'gwiazdek')}`,
    best: 'Twoje gwiazdki',
    bestEndless: 'Twój najlepszy wynik',
    /** Best stars or score on one difficulty, for screen readers. */
    bestStarsLabel: (difficulty: string, stars: number) =>
      `${difficulty}: ${stars} ${pluralPl(stars, 'gwiazdka', 'gwiazdki', 'gwiazdek')}`,
    bestNone: '–',
    rules: 'Zasady',
    versusRule: 'Wygrywa redakcja z\u00a0większą liczbą punktów',
    versusEndless: (minutes: number) =>
      `Pojedynek trwa ${minutes} ${pluralPl(minutes, 'minutę', 'minuty', 'minut')}`,
    endlessRule: 'Gra trwa, dopóki macie wiarygodność',
    close: 'Gotowe',
  },
  /** Difficulty picker in the lobby and its chips (S7-25). */
  difficulty: {
    label: 'Poziom trudności',
    names: {
      easy: 'Łatwy',
      normal: 'Normalny',
      hard: 'Trudny',
      expert: 'Ekspert',
    } satisfies Record<Difficulty, string>,
    blurbs: {
      easy: 'Więcej czasu, łagodniejsze kary',
      normal: 'Tak, jak zaprojektowaliśmy',
      hard: 'Mniej czasu, więcej teczek',
      expert: 'Bez podpowiedzi i bez litości',
    } satisfies Record<Difficulty, string>,
    /** The read-only chip guests see next to the level. */
    chip: (name: string) => `Poziom: ${name}`,
  },
  /** In-game HUD and level-end plate (S2-09). */
  hud: {
    queueLabel: 'Teczki do sprawdzenia',
    queueEmpty: 'Czekamy na teczki',
    queueMore: (n: number) => `Jeszcze ${n} w kolejce`,
    /** The next scheduled folder (S7-09): ghost card in the queue and the conveyor sign. */
    next: {
      label: 'Następna teczka',
      in: (s: number) => `${s}\u00a0s`,
      full: 'Taśma pełna',
      /** Empty queue: the ghost card says it in words. */
      emptyIn: (s: number) => `Nowa teczka za\u00a0${s}\u00a0s`,
      none: 'To już wszystkie teczki',
      /** Second line of the conveyor sign's name pill. */
      sign: (s: number) => `za\u00a0${s}\u00a0s`,
      signFull: 'Pełna',
    },
    timer: 'Czas do końca',
    score: 'Punkty',
    credibility: 'Wiarygodność',
    credibilityLow: 'Wiarygodność spada!',
    timeLeftLabel: (clock: string) => `zostało ${clock}`,
    location: {
      carriedBy: (nickname: string) => `niesie ${nickname}`,
      carried: 'w rękach',
      conveyor: 'na taśmie',
      desk: 'na biurku',
      table: 'na stole',
      floor: 'na podłodze',
    },
    untitled: 'Teczka bez opisu',
    /**
     * Evidence badge on a multi-stamp folder card (S7-19): "have/N" with hints on, "×N" without;
     * these are the badge's accessible names.
     */
    evidenceHave: (have: number, need: number) => `Dowody: ${have} z ${need}`,
    evidenceNeed: (need: number) => `Wymaga ${need} dowodów`,
    evidenceShortHave: (have: number, need: number) => `${have}/${need}`,
    evidenceShortNeed: (need: number) => `×${need}`,
    /**
     * The role ability chip (keyboard and gamepad) and the touch button (S7-40): a status of at
     * most two words under the ability's short name.
     */
    ability: {
      ready: 'Gotowa',
      armed: 'Uzbrojona',
      calling: 'Dzwonię…',
      /** Cooling down; the ring shows the seconds left. */
      cooling: 'Odnowienie',
      blocked: {
        noStation: 'Nie tutaj',
        noFolder: 'Weź teczkę',
        noStamp: 'Bez Telefonu',
        noPhone: 'Brak Telefonu',
        noTarget: 'Nikt wolny',
        noFolders: 'Brak teczek',
        busy: 'Zajęty',
      } satisfies Record<AbilityBlockReason, string>,
      /** Accessible name of the chip and the button: ability name and its status. */
      label: (name: string, status: string) => `${name}: ${status}`,
      /** The same while the ring counts down (cooling, a field call). */
      labelSeconds: (name: string, status: string, s: number) => `${name}: ${status}, ${s}\u00a0s`,
      /** Koło ratunkowe's badge next to the chip or the button. */
      rescueReady: 'Koło ratunkowe gotowe',
      rescueUsed: 'Koło ratunkowe zużyte',
      /** The folder card's mark after Przedłużenie or Koło ratunkowe (seconds added). */
      extended: (s: number) => `+${s}`,
      extendedLabel: (s: number) => `Przedłużona o\u00a0${s}\u00a0s`,
      /** The folder card the local player's ready ability press would act on. */
      targetLabel: 'Cel twojej zdolności',
      /** The folder card carried by a Ratownik with the rescue left. */
      rescueLabel: 'Chroni ją koło ratunkowe',
      /** World markers over players (S7-42); they show icons only, these are their names. */
      marker: {
        armed: (nick: string, ability: string) => `${nick}: ${ability} uzbrojona`,
        calling: (nick: string) => `${nick} dzwoni`,
        passTarget: (nick: string) => `Podasz teczkę: ${nick}`,
      },
    },
    /** Verdict toasts take their titles from `outcome.title`. */
    toast: {
      credibility: (delta: string) => `wiarygodność ${delta}`,
    },
  },
  /**
   * One outcome vocabulary (S7-04): the verdict toast, the desk result and the Kolegium read
   * the same titles. Every title is at most 8 words (it shows during play).
   */
  outcome: {
    /** A folder result's title, by the reason it ended that way. */
    title: {
      correctNormal: 'Dobrze!',
      correctImportant: 'Dobrze!',
      correctWithContext: 'Dobrze, z kontekstem!',
      correctionFiled: 'Sprostowanie poszło!',
      weakProof: 'Słaby dowód',
      incompleteProof: 'Za mało dowodów',
      publishedFake: 'Fałszywka w druku!',
      rejectedTrue: 'To była prawda!',
      contextOnTrue: 'Kontekst niepotrzebny',
      publishedWithoutContext: 'Bez kontekstu!',
      rejectedContextStory: 'Wystarczył kontekst',
      expired: 'Teczka przepadła',
      expiredUnpenalized: 'Teczka przepadła',
      unfinished: 'Nie zdążyliście',
    } satisfies Record<FolderReason, string>,
    /** The outcome group: the accessible name of the ✓ / ✗ / hourglass marks. */
    group: {
      correct: 'Dobrze',
      wrongJustification: 'Słaby dowód',
      wrong: 'Błędny werdykt',
      expired: 'Przepadła',
      unfinished: 'Nie zdążyliście',
    } satisfies Record<FolderOutcome, string>,
    /**
     * The Kolegium's one-line reason under a card's title (S7-07); the debrief may be longer
     * than 8 words. `base` is the points without bonuses, already signed by `formatDelta`.
     */
    why: {
      correctNormal: (base: string) => `Trafny werdykt: ${base} pkt`,
      correctImportant: (base: string) => `Ważna teczka, trafny werdykt: ${base} pkt`,
      correctWithContext: (base: string) => `Kontekst w punkt: ${base} pkt`,
      correctionFiled: (base: string) =>
        `Sprostowanie opublikowane: ${base} pkt i odzyskana wiarygodność`,
      weakProof: () => 'Werdykt dobry, ale wskazany dowód nic nie rozstrzygał: połowa punktów',
      incompleteProof: () => 'Werdykt dobry, ale za mało dowodów: połowa punktów',
      publishedFake: () => 'Fałszywka trafiła do druku: najwyższa kara',
      rejectedTrue: () => 'Odrzuciliście prawdziwą wiadomość',
      contextOnTrue: () => 'Prawdziwa wiadomość nie potrzebowała kontekstu',
      publishedWithoutContext: () => 'Ta wiadomość wymagała kontekstu, a poszła bez niego',
      rejectedContextStory: () => 'Wystarczyło opublikować z kontekstem',
      expired: () => 'Termin minął: kara za spóźnienie',
      expiredUnpenalized: () => 'Termin minął bez kary: niepilna, niepotwierdzalna teczka',
      unfinished: () => 'Teczka została na koniec wydania: 0 pkt',
    } satisfies Record<FolderReason, (base: string) => string>,
    /** `incompleteProof` with the counts: fewer proofs cited than the story required. */
    whyTooFew: (have: number, need: number) =>
      `Za mało dowodów (${have} z ${need}): połowa punktów`,
    /** `incompleteProof` citing only hint-only stamps: „Skaner AI to tylko wskazówka…”. */
    whyHintOnly: (stations: readonly string[]) =>
      `${stations.join(' i ')} to tylko wskazówka: połowa punktów`,
    /** A story grouped in endless: its folders per outcome, e.g. „Dobrze ×2”. */
    whyGroup: (group: string, n: number) => `${group} ×${n}`,
    /** Bonus suffixes after the reason, joined with „ · ”. */
    bonus: {
      speed: (n: string) => `tempo ${n}`,
      multiStamp: (n: string) => `dowody ${n}`,
      bossCall: (n: string) => `szef ${n}`,
    } satisfies Record<keyof FolderBonuses, (n: string) => string>,
  },
  /** Station overlay and work progress (S2-03). */
  station: {
    leave: 'Odejdź',
    /** Key cap for "back" on each device; touch uses the close button. */
    backKey: { keyboard: 'Esc', gamepad: 'B', touch: '' } satisfies Record<Device, string>,
    timeLeft: (s: number) => `Zostało ${s} s`,
    hold: 'Trzymaj',
    workKey: { keyboard: 'Spacja', gamepad: 'X', touch: '' } satisfies Record<Device, string>,
    /** Touch has an on-screen button instead of a key. */
    holdTouch: 'Trzymaj „Pracuj”',
    failed: 'Pudło!',
    wait: 'Czekaj',
    seconds: (s: number) => `${s} s`,
    noFolder: 'Brak teczki na stanowisku.',
    unknownStory: 'Nieznana teczka.',
    /**
     * Role abilities around the overlay (S7-41). The header's Ekspertyza button shows
     * `touch.ability.expertise` (accessible name from `vocab.abilities`) and the lockout plate's
     * line `vocab.abilities.secondChance`; this is the button while the press is on its way
     * (the overlay closes when the stamp lands).
     */
    expertiseSending: 'Ekspertyza…',
  },
  desk: {
    title: 'Stół redakcyjny',
    close: 'Odłóż teczkę',
    source: 'Od:',
    deadline: 'Termin',
    overdue: 'Po terminie',
    stepEvidence: 'Wybierz dowód',
    /** Multi-stamp folders (S7-19): the step heading, its count chip and the status line. */
    stepEvidenceMany: (n: number) => `Wybierz ${n} ${pluralPl(n, 'dowód', 'dowody', 'dowodów')}`,
    evidenceCount: (k: number, n: number) => `${k}/${n}`,
    evidenceStatus: (k: number, n: number) => `Wybrano ${k} z ${n} dowodów`,
    /** Amber line when the folder holds fewer stamps than the story needs proofs. */
    tooFewProofs: 'Za mało dowodów: połowa punktów',
    /** A pick beyond N is blocked. */
    deselectFirst: 'Najpierw odznacz jeden dowód',
    stepVerdict: 'Wybierz werdykt',
    pickStamp: 'Stuknij pieczątkę – to twój dowód',
    pickVerdict: 'Teraz werdykt!',
    sending: 'Wysyłam…',
    noStamps: 'Pusta teczka. Zanieś ją na stanowisko.',
    verdictsLabel: 'Werdykt',
    /** Short visible labels; the full name (`vocab.verdicts`) stays the accessible name. */
    verdictShort: {
      publish: 'Publikuj',
      reject: 'Odrzuć',
      publishWithContext: 'Z kontekstem',
    } satisfies Record<Verdict, string>,
    next: 'Dalej',
    points: (n: string) => `${n} pkt`,
    credibility: (n: string) => `Wiarygodność ${n}`,
    /**
     * Lines under the desk result (`stations/desk-result-model.ts`), at most two; the chips
     * after a label carry station names only, so every line stays within 8 words.
     */
    result: {
      proof: 'Dowód:',
      weakProof: 'Ten dowód niczego nie rozstrzyga',
      tooFewProofs: (have: number, need: number) => `Dowody: ${have} z ${need}`,
      /** `stations` are full station names, e.g. [„Skaner AI”]. */
      hintOnly: (stations: readonly string[]) => `${stations.join(' i ')} to tylko wskazówka`,
      decidedBy: 'Rozstrzyga:',
      correctVerdict: 'Właściwy werdykt:',
      proofInFolder: 'Dowód był w teczce:',
      notChecked: 'Nie sprawdzono:',
      /** Bonus chips next to the points: an icon, this label, then the points ("+5"). */
      bonuses: {
        speed: 'Premia za tempo',
        multiStamp: 'Premia za dowody',
        bossCall: 'Szef dzwonił',
      } satisfies Record<keyof FolderBonuses, string>,
    },
    unknownStory: 'Nieznana teczka.',
  },
  minigames: {
    /** Shared by every minigame. */
    common: {
      mistakes: (n: number, of: number) => `Pomyłki: ${n} z ${of}`,
      failure: 'Pudło!',
    },
    imageSearch: {
      task: 'Znajdź wynik ze wszystkimi kółkami',
      submitted: 'Nadesłane zdjęcie',
      results: 'Wyniki wyszukiwania',
      fragment: (n: number, of: number) => `${n}/${of}`,
      nextFragment: 'Następny fragment',
      result: (n: number) => `Wynik ${n}`,
      published: (site: string, date: string) => `${site}, ${date}`,
      found: 'Wcześniejsza publikacja!',
      checked: 'Sprawdzone!',
      foundFallback: 'Znaleziono wcześniejszą kopię zdjęcia.',
      done: 'Gotowe',
      keys: {
        keyboard: [
          { keys: ['Strzałki'], label: 'wybierz' },
          { keys: ['Spacja'], label: 'sprawdź' },
          { keys: ['Q'], label: 'lupa' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'sprawdź' },
          { keys: ['Y'], label: 'lupa' },
        ],
        touch: [
          { keys: ['Stuknij'], label: 'wynik' },
          { keys: ['Przeciągnij'], label: 'lupę' },
        ],
      } satisfies KeyHints,
    },
    archive: {
      task: 'Znajdź najstarszą kartę z hasłem',
      /** Topics printed on the index cards; fictional Nowe Brzegi local news. */
      topics: [
        'zalany rynek',
        'nocny autobus',
        'remont mostu',
        'festyn nad rzeką',
        'nowa biblioteka',
        'awaria wodociągu',
        'dzik na osiedlu',
        'targ rybny',
        'mecz juniorów',
        'budowa ronda',
        'zegar na ratuszu',
        'koncert w parku',
      ],
      earlier: 'Wcześniej',
      later: 'Później',
      pull: 'Wyjmij',
      foundFallback: 'Pierwsza wzmianka odnaleziona w archiwum.',
      firstMention: (date: string) => `Pierwsza wzmianka: ${date}`,
      failed: 'Szuflada zamknięta',
      keys: {
        keyboard: [
          { keys: ['←', '→'], label: 'przewijaj' },
          { keys: ['Spacja'], label: 'stop / wyjmij' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'przewijaj' },
          { keys: ['A'], label: 'stop / wyjmij' },
        ],
        touch: [
          { keys: ['Przesuń'], label: 'przewijaj' },
          { keys: ['Stuknij'], label: 'stop / wyjmij' },
        ],
      } satisfies KeyHints,
    },
    sourceRegistry: {
      kinds: { account: 'Konto', website: 'Strona' },
      task: 'Zakreśl podejrzane wpisy, potem odłóż kartę',
      /** Task line when the same card comes back after a failure or a cancel (S7-14). */
      retryTask: 'Ta sama karta: dokończ zakreślanie',
      file: 'Odłóż kartę',
      marked: (n: number) => (n === 0 ? 'Nic nie zakreślone' : `Zakreślone: ${n}`),
      notThis: 'W porządku',
      missing: 'Czegoś brakuje!',
      filed: 'Sprawdzone!',
      failed: 'Źle zakreślone',
      /** Under „Źle zakreślone”: no answer is shown, the card comes back after the lockout. */
      failedSameCard: 'Karta na ciebie poczeka.',
      clean: 'Źródło w porządku',
      flagged: 'Źródło podejrzane',
      keys: {
        keyboard: [
          { keys: ['W', 'S'], label: 'wybierz' },
          { keys: ['E'], label: 'zakreśl' },
          { keys: ['Q'], label: 'odłóż' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'zakreśl' },
          { keys: ['Y'], label: 'odłóż' },
        ],
        touch: [
          { keys: ['Stuknij'], label: 'zakreśl' },
          { keys: ['Odłóż kartę'], label: 'gotowe' },
        ],
      } satisfies KeyHints,
      /**
       * Card fields. Each has a label, believable values (`clean`) and warning signs
       * (`flagged`). Everything is invented: Nowe Brzegi, no real people, brands or platforms.
       */
      fields: {
        account: {
          identity: {
            label: 'Nazwa i login',
            clean: [
              'Kasia Wróblewska · @kwroblewska',
              'Fotoklub Nadrzecze · @fotoklub_nadrzecze',
              'Marek Sowa · @marek.sowa',
              'Piekarnia Pod Mostem · @piekarnia_podmostem',
            ],
            flagged: [
              'Urząd Miasta Nowe Brzegi · @nb_news_2481',
              'Policja Nowe Brzegi · @xx_prawda_xx',
              'Kurier Nowobrzeski · @kurier_nb_0ficjalny',
            ],
          },
          created: {
            label: 'Konto założone',
            clean: ['w marcu 2019 r.', '6 lat temu', 'w 2016 r.', 'jesienią 2020 r.'],
            flagged: ['3 dni temu', 'wczoraj wieczorem', 'przedwczoraj'],
          },
          history: {
            label: 'Wcześniejsze wpisy',
            clean: [
              'ok. 1200, głównie zdjęcia z okolicy',
              'od lat sprawy osiedla i remonty',
              'zapowiedzi wystaw, relacje z klubu',
            ],
            flagged: [
              'brak, to pierwszy wpis',
              'wszystko sprzed tygodnia usunięte',
              'tylko ten jeden post, udostępniany',
            ],
          },
          avatar: {
            label: 'Zdjęcie profilowe',
            clean: [
              'zdjęcie znad rzeki, to samo od lat',
              'logo jak na szyldzie przy rynku',
              'zwykły portret, kilka starszych wersji',
            ],
            flagged: [
              'z banku zdjęć, znane z reklam',
              'herb miasta wycięty z cudzej strony',
              'twarz wygenerowana, rozmyte uszy',
            ],
          },
          followers: {
            label: 'Obserwujący',
            clean: ['312, głównie sąsiedzi', '1450 osób z regionu', '86 znajomych'],
            flagged: ['15 000 w dwa dni, konta bez zdjęć', '9800 kont założonych jednego dnia'],
          },
          activity: {
            label: 'Aktywność',
            clean: ['kilka wpisów w tygodniu', 'raz, dwa razy dziennie', 'zwykle wieczorami'],
            flagged: [
              '60 wpisów w godzinę',
              'ten sam tekst w 40 grupach',
              'co minutę, także w nocy',
            ],
          },
          place: {
            label: 'Miejscowość',
            clean: [
              'Nowe Brzegi, Nadrzecze',
              'Nowe Brzegi, Stare Miasto',
              'okolice Nowych Brzegów',
            ],
            flagged: ['zmieniana pięć razy w miesiącu', 'Nowe Brzegi, ale konto z innego kraju'],
          },
        },
        website: {
          address: {
            label: 'Adres',
            clean: ['nowe-brzegi.pl', 'mpk.nowe-brzegi.pl', 'kurier-nowobrzeski.pl'],
            flagged: [
              'nowe-brzegi-gov.info',
              'nowe-brzegl.pl',
              'kurier-nowobrzeski.pilne-wiesci.top',
            ],
          },
          registered: {
            label: 'Domena zarejestrowana',
            clean: ['w 2004 r.', 'w 2011 r.', 'w 1999 r.'],
            flagged: ['5 dni temu', 'wczoraj', 'tydzień temu'],
          },
          owner: {
            label: 'Właściciel domeny',
            clean: ['instytucja, dane jawne w rejestrze', 'firma z Nowych Brzegów, dane jawne'],
            flagged: ['dane ukryte, pośrednik za granicą', 'osoba prywatna, inna niż w stopce'],
          },
          contact: {
            label: 'Kontakt',
            clean: ['adres, telefon, godziny pracy', 'ul. Ratuszowa 1, sekretariat'],
            flagged: ['tylko formularz, brak adresu', 'mail na darmowej skrzynce'],
          },
          archive: {
            label: 'Inne artykuły',
            clean: ['archiwum komunikatów od 2010 r.', 'setki wpisów, ostatni wczoraj'],
            flagged: ['jeden, właśnie ten', 'pięć, wszystkie z dzisiaj'],
          },
          look: {
            label: 'Wygląd',
            clean: ['logo i układ jak w wersji drukowanej', 'herb zgodny z oficjalnym'],
            flagged: ['herb rozmyty, skopiowany', 'logo prawie jak oryginał, inna czcionka'],
          },
          links: {
            label: 'Linki',
            clean: ['prowadzą do źródeł i dokumentów', 'działają, do stron gminy'],
            flagged: ['wszystkie prowadzą do sklepu', 'puste, nigdzie nie prowadzą'],
          },
        },
      },
    },
    /** Phone minigame (S4-01): pick the right number, wait in the queue (reporters skip it). */
    phone: {
      task: 'Zadzwoń do źródła',
      onHold: 'Czekaj w kolejce',
      seconds: (n: number) => `${n} s`,
      skipped: 'Reporter: bez kolejki!',
      connected: 'Połączono!',
      wrong: 'Zły numer',
      wrongBody: 'Nikt nie odebrał',
      keys: {
        keyboard: [
          { keys: ['W', 'S'], label: 'wybierz' },
          { keys: ['E'], label: 'dzwoń' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'dzwoń' },
        ],
        touch: [{ keys: ['Stuknij'], label: 'numer' }],
      } satisfies KeyHints,
      /** Invented contacts of Nowe Brzegi used as wrong numbers next to the story's own source. */
      decoys: [
        'Komunikat prasowy ratusza',
        'Mail od czytelnika',
        'Portal „Brzeski Szpikulec”',
        'Konto „Nowe Brzegi Info”',
        'Rzecznik straży pożarnej',
        'Biuro prasowe szpitala',
        'Radio Nadrzecze',
        'Wiadomość od sąsiada',
        'Raport urzędu statystycznego',
        'Fotoklub Nadrzecze',
        'Stowarzyszenie Rowerowe NB',
        'Dziennik „Kurier Nowobrzeski”',
      ],
    },
    aiScanner: {
      task: 'Odczytaj skaner',
      reading: (percent: number, margin: number) => `${percent}\u00a0% ± ${margin}\u00a0%`,
      readingLabel: (percent: number, margin: number) =>
        `Skaner: ${percent} procent, błąd plus minus ${margin} procent`,
      human: 'prawdziwe',
      machine: 'AI',
      margin: 'margines błędu',
      answers: { real: 'Raczej prawdziwe', unsure: 'Nie wiem', ai: 'Raczej AI' },
      done: {
        ambiguous: 'Zakres obejmuje 50\u00a0%: „Nie wiem” trafia',
        clearAi: 'Cały zakres po stronie AI',
        clearReal: 'Cały zakres po stronie prawdy',
      },
      failed: {
        ambiguous: 'Margines sięga 50\u00a0%: skaner nie rozstrzyga',
        clearAi: 'Cały zakres był po stronie AI',
        clearReal: 'Cały zakres był po stronie prawdy',
      },
      success: 'Dobry odczyt!',
      failure: 'Zły odczyt',
      keys: {
        keyboard: [
          { keys: ['A', 'D'], label: 'wybierz' },
          { keys: ['E'], label: 'potwierdź' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'potwierdź' },
        ],
        touch: [{ keys: ['Stuknij'], label: 'odpowiedź' }],
      } satisfies KeyHints,
    },
    dataLibrary: {
      task: 'Znajdź liczbę lub zgłoś: nie pasuje',
      claimTitle: 'W artykule',
      average: (from: number, to: number) => `średnio ${from}–${to}`,
      mismatch: 'Nie pasuje',
      table: 'Tabela źródłowa',
      averageColumn: 'Średnia',
      cell: (row: string, column: string, value: string) => `${row}, ${column}: ${value}`,
      unitNote: (unit: string) => `w ${unit}`,
      right: 'Zgadza się!',
      wrong: 'Pudło!',
      /** Shown after the round: why the claim fits or what was changed. */
      reasons: {
        match: 'Ta liczba jest w tabeli.',
        wrongYear: 'Liczba z innego roku.',
        wrongRow: 'Liczba z innego wiersza.',
        wrongUnit: 'Inna jednostka niż w tabeli.',
        cherryPick: 'Najlepszy rok zamiast średniej.',
        invented: 'Takiej liczby nie ma w tabeli.',
      },
      keys: {
        keyboard: [
          { keys: ['Strzałki'], label: 'wybierz' },
          { keys: ['Spacja'], label: 'potwierdź' },
          { keys: ['Q'], label: 'nie pasuje' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'potwierdź' },
          { keys: ['Y'], label: 'nie pasuje' },
        ],
        touch: [
          { keys: ['Stuknij'], label: 'komórkę' },
          { keys: ['Nie pasuje'], label: 'zgłoś' },
        ],
      } satisfies KeyHints,
      /**
       * Original tables. All invented: Nowe Brzegi, no real institutions. `unit` is what the
       * table gives; `altUnit` is the wrong unit a manipulated claim uses. `step` rounds values.
       */
      topics: [
        {
          title: 'Wydatki miasta',
          unit: 'tys. zł',
          altUnit: 'mln zł',
          min: 400,
          max: 4800,
          step: 10,
          rows: ['Drogi', 'Szkoły', 'Parki', 'Transport', 'Kultura'],
        },
        {
          title: 'Mieszkańcy dzielnic',
          unit: 'osób',
          altUnit: 'tys. osób',
          min: 1200,
          max: 9800,
          step: 10,
          rows: ['Nadrzecze', 'Stare Miasto', 'Lipowa', 'Klonowa', 'Osiedle Słoneczne'],
        },
        {
          title: 'Frekwencja w szkołach',
          unit: '%',
          altUnit: 'pkt proc.',
          min: 55,
          max: 98,
          step: 1,
          rows: ['Szkoła nr 1', 'Szkoła nr 2', 'Liceum nr 2', 'Technikum', 'Szkoła nr 5'],
        },
        {
          title: 'Zgłoszenia alarmowe',
          unit: 'zgłoszeń',
          altUnit: 'tys. zgłoszeń',
          min: 120,
          max: 2400,
          step: 5,
          rows: ['Pożary', 'Wypadki', 'Zalania', 'Awarie prądu', 'Kolizje'],
        },
      ],
    },
    /**
     * Mapa (S7-55): the folder's photo shows two landmarks and its caption names a district; the
     * town map shows each district's two landmarks. All districts are invented parts of Nowe
     * Brzegi; the landmarks are generic shapes, no real buildings.
     */
    geolocation: {
      task: 'Znajdź na mapie miejsce ze zdjęcia',
      /** The caption chip on the photo: where the folder says it was taken. */
      caption: (district: string) => `Podpis: ${district}`,
      notHere: 'Nie ma na mapie',
      right: 'Namierzone!',
      wrong: 'Pudło!',
      /** Shown after the round: where the photo was really taken. */
      reasons: {
        match: () => 'Zdjęcie z miejsca z podpisu.',
        otherDistrict: (claimed: string, actual: string) => `To nie ${claimed} – to ${actual}.`,
        otherTown: () => 'Tych miejsc nie ma w Nowych Brzegach.',
      } satisfies Record<GeoOutcome, (claimed: string, actual: string) => string>,
      /** Screen-reader names: the photo and one district tile. */
      photoLabel: (a: string, b: string) => `Zdjęcie: ${a} i ${b}`,
      tileLabel: (district: string, a: string, b: string) => `${district}: ${a} i ${b}`,
      keys: {
        keyboard: [
          { keys: ['Strzałki'], label: 'wybierz' },
          { keys: ['Spacja'], label: 'tu!' },
          { keys: ['Q'], label: 'nie ma na mapie' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'tu!' },
          { keys: ['Y'], label: 'nie ma na mapie' },
        ],
        touch: [
          { keys: ['Stuknij'], label: 'dzielnicę' },
          { keys: ['Nie ma na mapie'], label: 'inne miasto' },
        ],
      } satisfies KeyHints,
      /** Twelve invented districts of Nowe Brzegi, each ≤ 9 characters to fit a map tile. */
      districts: [
        'Rynek',
        'Port',
        'Dworzec',
        'Lipowa',
        'Klonowa',
        'Młyny',
        'Zatoka',
        'Wzgórze',
        'Park',
        'Nadrzecze',
        'Stocznia',
        'Błonia',
      ],
      /** Landmark names, for screen readers (the glyphs carry the meaning on screen). */
      landmarks: {
        clockTower: 'wieża zegarowa',
        archBridge: 'most łukowy',
        fountain: 'fontanna',
        tramStop: 'przystanek tramwajowy',
        twinChurch: 'kościół z dwiema wieżami',
        waterTower: 'wieża ciśnień',
        portCrane: 'dźwig portowy',
        windmill: 'wiatrak',
        lighthouse: 'latarnia morska',
        monument: 'pomnik',
      } satisfies Record<Landmark, string>,
    },
    /**
     * Metadane (S7-52): the folder's description of a file next to the file's own data. One
     * field contradicts the description, none does, or a social site stripped the data.
     * All places, devices and programs are invented; no real brands or towns.
     */
    metadata: {
      task: 'Porównaj dane pliku z opisem',
      claimTitle: 'Opis w teczce',
      fileTitle: 'Dane pliku',
      /** Field labels, in the order of the 2×2 grid. */
      fields: {
        taken: 'Wykonano',
        device: 'Urządzenie',
        software: 'Program',
        place: 'Miejsce (GPS)',
      },
      /** What a stripped field shows, and the note under the empty grid. */
      empty: '—',
      emptyAria: 'brak',
      strippedNote: 'usunięte przez serwis',
      field: (label: string, value: string) => `${label}: ${value}`,
      matches: 'Zgadza się',
      noData: 'Brak danych',
      right: 'Trafione!',
      wrong: 'Pudło!',
      /** Shown after the round: what the file data says. */
      reasons: {
        consistent: 'Dane pliku zgadzają się z opisem.',
        taken: 'Plik jest starszy niż opis.',
        device: 'Plik powstał w generatorze, nie w urządzeniu.',
        software: 'Plik obrabiano w programie.',
        place: 'Plik powstał w innym miejscu.',
        stripped: 'Serwis usunął dane – to nic nie dowodzi.',
      },
      keys: {
        keyboard: [
          { keys: ['Strzałki'], label: 'wybierz' },
          { keys: ['Spacja'], label: 'potwierdź' },
          { keys: ['Q'], label: 'zgadza się' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'potwierdź' },
          { keys: ['Y'], label: 'zgadza się' },
        ],
        touch: [
          { keys: ['Stuknij'], label: 'sprzeczne pole' },
          { keys: ['Zgadza się'], label: 'nic nie przeczy' },
        ],
      } satisfies KeyHints,
      /** When the file was made: the claim, the matching file time, and a years-older one. */
      times: [
        { claim: 'dziś, ok. 14:00', file: 'dziś, 14:03', old: '14.06.2019, 14:03' },
        { claim: 'wczoraj wieczorem', file: 'wczoraj, 20:41', old: '3.11.2018, 20:41' },
        { claim: 'dziś rano', file: 'dziś, 7:52', old: '21.04.2020, 7:52' },
        { claim: 'w sobotę po południu', file: 'sobota, 16:15', old: '9.08.2017, 16:15' },
        { claim: 'wczoraj w nocy', file: 'wczoraj, 23:37', old: '30.01.2019, 23:37' },
      ],
      /** What made the file, per media kind: the claim and the matching file entry. */
      devices: {
        photo: [
          { claim: 'zdjęcie z telefonu świadka', file: 'Telefon, aparat tylny' },
          { claim: 'zdjęcie z aparatu reportera', file: 'Aparat cyfrowy' },
          { claim: 'zdjęcie z telefonu przechodnia', file: 'Telefon, aparat tylny' },
        ],
        recording: [
          { claim: 'nagranie z telefonu świadka', file: 'Telefon, dyktafon' },
          { claim: 'nagranie z kamery w ratuszu', file: 'Kamera sali obrad' },
          { claim: 'nagranie z dyktafonu reportera', file: 'Dyktafon cyfrowy' },
        ],
        screenshot: [
          { claim: 'zrzut ekranu z telefonu', file: 'Telefon, zrzut ekranu' },
          { claim: 'zrzut ekranu z komputera', file: 'Komputer, zrzut ekranu' },
        ],
      },
      /** The device entry of a file no camera or microphone ever recorded. */
      generated: 'brak – plik wygenerowany',
      /** Editing, per media kind: the claim, the clean file entry and edited ones. */
      software: {
        photo: {
          claim: 'bez obróbki',
          clean: 'zapis z aparatu',
          edited: ['Edytor zdjęć – zapisano 3 razy', 'Edytor zdjęć – fotomontaż'],
        },
        recording: {
          claim: 'bez montażu',
          clean: 'zapis z urządzenia',
          edited: ['Program do montażu', 'Program do montażu – 4 cięcia'],
        },
        screenshot: {
          claim: 'bez obróbki',
          clean: 'zrzut systemowy',
          edited: ['Edytor grafiki – zapisano 2 razy', 'Edytor grafiki – podmiana tekstu'],
        },
      },
      /** Places in Nowe Brzegi the description gives (the file agrees when it is consistent). */
      places: [
        'Nowe Brzegi, Rynek',
        'Nowe Brzegi, Port',
        'Nowe Brzegi, Dworzec',
        'Nowe Brzegi, Nadrzecze',
        'Nowe Brzegi, Błonia',
        'Nowe Brzegi, Stocznia',
      ],
      /** Invented other towns: where a contradicting file was really made. */
      otherTowns: ['Srebrne Wydmy', 'Mglisty Bród', 'Kamienna Zatoka', 'Wysokie Sady'],
    },
    /**
     * Stenogram (S7-53): the clip quoted in the folder next to the full record of what was said
     * (four numbered lines). Find the line the clip comes from, or answer „Nie ma w zapisie”;
     * then judge whether the cut changes the meaning. All speakers, places and settings are
     * invented (Nowe Brzegi); no real people or events.
     */
    transcript: {
      task: 'Znajdź cytat w zapisie i oceń sens',
      /** The task line once the clip's line is found. */
      judgeTask: 'Czy cięcie zmienia sens?',
      clipTitle: 'Cytat w teczce',
      recordTitle: 'Pełny zapis',
      /** Shown next to the found line: the underlined words are the ones the clip left out. */
      cutLegend: 'podkreślone – wycięte',
      line: (n: number, text: string) => `Linia ${n}: ${text}`,
      /** The find-phase button for a clip nobody said. */
      notInRecord: 'Nie ma w zapisie',
      same: 'Sens ten sam',
      changed: 'Sens zmieniony',
      right: 'Sprawdzone!',
      wrong: 'Pudło!',
      /** Shown after the round: what the record says about the clip. */
      reasons: {
        fair: 'Skrót, ale sens ten sam.',
        cut: 'Cięcie odwróciło sens wypowiedzi.',
        absent: 'Tych słów nie ma w zapisie.',
      },
      /** Key hints while looking for the line. */
      keys: {
        keyboard: [
          { keys: ['Strzałki'], label: 'wybierz' },
          { keys: ['Spacja'], label: 'potwierdź' },
          { keys: ['Q'], label: 'nie ma w zapisie' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'potwierdź' },
          { keys: ['Y'], label: 'nie ma w zapisie' },
        ],
        touch: [
          { keys: ['Stuknij'], label: 'linię z cytatem' },
          { keys: ['Nie ma w zapisie'], label: 'brak cytatu' },
        ],
      } satisfies KeyHints,
      /** Key hints while judging the cut. */
      judgeKeys: {
        keyboard: [
          { keys: ['Strzałki'], label: 'wybierz' },
          { keys: ['Spacja'], label: 'oceń' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'oceń' },
        ],
        touch: [{ keys: ['Stuknij'], label: 'ocenę' }],
      } satisfies KeyHints,
      /** Where the record comes from (the chip above the lines). */
      settings: [
        'Sesja rady miasta',
        'Wywiad w Radiu Nadrzecze',
        'Konferencja w ratuszu',
        'Spotkanie z mieszkańcami',
        'Debata w liceum na Wzgórzu',
      ],
      /** A shortening that keeps the meaning: only a filler phrase is left out. */
      fair: [
        {
          line: 'Proszę państwa, remont mostu ruszy w maju i potrwa do jesieni.',
          clip: 'Remont mostu ruszy w maju i potrwa do jesieni.',
        },
        {
          line: 'Szczerze mówiąc, nowa linia autobusowa to dobry pomysł dla Lipowej.',
          clip: 'Nowa linia autobusowa to dobry pomysł dla Lipowej.',
        },
        {
          line: 'Basen na Błoniach otworzymy w czerwcu – tak, jak obiecywaliśmy.',
          clip: 'Basen na Błoniach otworzymy w czerwcu.',
        },
        {
          line: 'Dziękuję za pytanie. Szkoła przy Klonowej dostanie nowe boisko.',
          clip: 'Szkoła przy Klonowej dostanie nowe boisko.',
        },
        {
          line: 'No cóż, przyznaję: w porcie zabrakło kontroli.',
          clip: 'W porcie zabrakło kontroli.',
        },
        {
          line: 'Jak już mówiłam, ceny biletów w tym roku nie wzrosną.',
          clip: 'Ceny biletów w tym roku nie wzrosną.',
        },
        {
          line: 'Krótko mówiąc: park nad rzeką zostaje parkiem.',
          clip: 'Park nad rzeką zostaje parkiem.',
        },
      ],
      /** A cut that flips the meaning: the left-out words were the point. */
      cut: [
        {
          line: 'Nie obchodzą mnie plotki – obchodzą mnie problemy mieszkańców.',
          clip: 'Nie obchodzą mnie problemy mieszkańców.',
        },
        {
          line: 'Mówi się, że podniesiemy podatki. To nieprawda.',
          clip: 'Podniesiemy podatki.',
        },
        {
          line: 'Nigdy nie powiem, że trzeba zamknąć bibliotekę.',
          clip: 'Trzeba zamknąć bibliotekę.',
        },
        {
          line: 'Gdyby nie wolontariusze, festyn byłby porażką.',
          clip: 'Festyn byłby porażką.',
        },
        {
          line: 'Słyszę, że tramwaj to strata pieniędzy. Nie zgadzam się.',
          clip: 'Tramwaj to strata pieniędzy.',
        },
        {
          line: 'Nie twierdzę, że woda w kranach jest skażona.',
          clip: 'Woda w kranach jest skażona.',
        },
        {
          line: 'Nie chodzi o to, by zamknąć targ, tylko go odnowić.',
          clip: 'Chodzi o to, by zamknąć targ.',
        },
      ],
      /** A clip nobody said: the decoy line shares its keywords but says something else. */
      absent: [
        {
          clip: 'Zlikwidujemy wszystkie przystanki na Lipowej.',
          decoy: 'Na Lipowej dobudujemy dwa nowe przystanki.',
        },
        {
          clip: 'Ratusz sprzeda park miejski deweloperowi.',
          decoy: 'Ratusz posadzi w parku miejskim sto drzew.',
        },
        {
          clip: 'Od jutra woda w kranach będzie dwa razy droższa.',
          decoy: 'Od jutra sprawdzamy wodę w kranach co tydzień.',
        },
        {
          clip: 'Szkoła na Wzgórzu zostanie zamknięta.',
          decoy: 'Szkoła na Wzgórzu dostanie nowy dach.',
        },
        {
          clip: 'Nikt nie wie, ile kosztował nowy most.',
          decoy: 'Każdy wie, ile kosztował nowy most: raport jest na stronie miasta.',
        },
        {
          clip: 'Port w Nowych Brzegach zostanie sprzedany.',
          decoy: 'Port w Nowych Brzegach przyjmie więcej promów.',
        },
        {
          clip: 'Mieszkańcy Młynów zimą nie dostaną ogrzewania.',
          decoy: 'Mieszkańcy Młynów dostaną nowe ogrzewanie przed zimą.',
        },
      ],
      /** The rest of the record: lines with no claim in them. */
      filler: [
        'Dzień dobry, witam wszystkich na dzisiejszym spotkaniu.',
        'Zacznijmy od spraw, o które pytali mieszkańcy.',
        'Szczegóły budżetu przedstawimy na kolejnej sesji.',
        'Pytania można też wysyłać przez stronę miasta.',
        'Dziękuję radnym za pracę w komisjach.',
        'Protokół z obrad będzie gotowy w przyszłym tygodniu.',
        'Proszę o ciszę, zostały nam jeszcze trzy punkty.',
        'Następne pytanie zadał pan z Nadrzecza.',
        'Za chwilę oddam głos przewodniczącej.',
        'Zrobimy krótką przerwę, wracamy za dziesięć minut.',
        'Na to pytanie odpowiem na piśmie.',
        'Wszystkie dokumenty leżą do wglądu w ratuszu.',
        'Dziękuję, przejdźmy do głosowania.',
      ],
    },
    /**
     * Inne media (S7-54): what other outlets say about the folder's claim. Only agencies and
     * newsrooms with their own reporter count; copies of someone else's post, satire and
     * anonymous groups do not. Every outlet is invented (Nowe Brzegi); no real brands.
     */
    crossCheck: {
      task: 'Co mówią niezależne media?',
      claimTitle: 'W teczce',
      cardsTitle: 'Inne media',
      /** The kind badge on a coverage card. */
      kinds: {
        agency: 'agencja',
        newsroom: 'redakcja',
        satire: 'satyra',
        anonymous: 'anonim',
        junk: 'portal-klon',
      },
      /** The stance chip: a copy looks exactly like a confirmation. */
      stances: { confirms: 'pisze to samo', echoes: 'pisze to samo', denies: 'zaprzecza' },
      /** The source line: own reporter, a copied post, none named, or made up for a joke. */
      sources: {
        own: 'własny reporter',
        unnamed: 'bez źródła',
        invented: 'wymyślone',
        copied: (via: string) => `za: ${via}`,
      },
      /** What a copy took the claim from. */
      vias: ['post z grupy', 'wpis w sieci', 'film z sieci', 'inny portal'],
      /** The stamp a copied card (an echo) gets after the round; satire and anonymous fade. */
      copy: 'kopia',
      card: (outlet: string, kind: string, stance: string, source: string) =>
        `${outlet} (${kind}): ${stance}, ${source}`,
      answers: {
        confirmed: 'Potwierdzają',
        denied: 'Zaprzeczają',
        unconfirmed: 'Za mało źródeł',
      },
      right: 'Trafione!',
      wrong: 'Pudło!',
      /** Shown after the round: what the independent coverage says. */
      reasons: {
        confirmed: 'Co najmniej dwa niezależne źródła to potwierdzają.',
        denied: 'Niezależne źródło temu zaprzecza.',
        unconfirmed: 'Za mało niezależnych źródeł, by potwierdzić.',
      },
      keys: {
        keyboard: [
          { keys: ['←', '→'], label: 'wybierz' },
          { keys: ['Spacja'], label: 'potwierdź' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'potwierdź' },
        ],
        touch: [{ keys: ['Stuknij'], label: 'odpowiedź' }],
      } satisfies KeyHints,
      /** Invented outlets of Nowe Brzegi, per kind. */
      outlets: {
        agency: ['Agencja Nadrzecze', 'Agencja Fala'],
        newsroom: [
          'Radio Nadrzecze',
          'Kurier Nowobrzeski',
          'TV Brzegi',
          'Gazeta Portowa',
          'Tygodnik Błonia',
        ],
        satire: ['Brzeski Szpikulec', 'Kurier Absurdu'],
        anonymous: ['Grupa „Nowe Brzegi Info”', 'Grupa „Plotki z Portu”'],
        junk: ['nb-prawda24.top', 'szok-brzegi24.top'],
      },
    },
  },
  /** Station help (S7-15): what each station checks and how to work it on every device. */
  stationHelp: {
    title: 'Jak to działa?',
    proofLabel: 'Dowód:',
    /** The help card's one (yellow) button: close the card and get to work (S7-94). */
    got: 'Rozumiem',
    /** The help card's note: reading help does not stop the folder's deadline. */
    deadlineRuns: 'Termin teczki biegnie dalej',
    /** The '?' in a station overlay's header (S7-95): its accessible name and key caps. */
    openLabel: (station: string) => `Jak działa: ${station}`,
    key: { keyboard: 'H', gamepad: 'Select', touch: '' } satisfies Record<Device, string>,
    /** Accessible names of the card's parts. */
    stepsLabel: 'Kroki',
    realWorldLabel: 'Tak jest naprawdę',
    kinds: {
      imageSearch: {
        purpose: 'Czy to zdjęcie krążyło już wcześniej?',
        proves: 'Zdjęcie jest starsze albo z innego miejsca',
        steps: {
          keyboard: [
            'Porównaj kółka na zdjęciu z wynikami',
            'Q przełącza lupę na inne kółko',
            'Strzałki wybierają wynik, spacja go sprawdza',
          ],
          gamepad: [
            'Porównaj kółka na zdjęciu z wynikami',
            'Y przełącza lupę na inne kółko',
            'Krzyżak wybiera wynik, A go sprawdza',
          ],
          touch: [
            'Porównaj kółka na zdjęciu z wynikami',
            'Stuknij lupę, by zobaczyć inne kółko',
            'Stuknij wynik albo przeciągnij na niego lupę',
          ],
        },
        realWorld:
          'Tak działa wyszukiwanie obrazem wstecz: wyszukiwarka pokazuje, gdzie i kiedy zdjęcie pojawiło się wcześniej.',
      },
      archive: {
        purpose: 'Kiedy po raz pierwszy o tym napisano?',
        proves: 'Data pierwszej wzmianki o sprawie',
        steps: {
          keyboard: [
            'Starsze karty leżą w szufladzie po lewej',
            '← i → przewijają, spacja zatrzymuje',
            'Spacją wyjmij najstarszą kartę z hasłem',
          ],
          gamepad: [
            'Starsze karty leżą w szufladzie po lewej',
            'Krzyżak przewija, A zatrzymuje szufladę',
            'A wyjmuje najstarszą kartę z hasłem',
          ],
          touch: [
            'Starsze karty leżą w szufladzie po lewej',
            'Przesuń szufladę palcem, stuknij, by zatrzymać',
            'Stuknij „Wyjmij” przy najstarszej karcie z hasłem',
          ],
        },
        realWorld:
          'Tak działają archiwa gazet i stron internetowych: pokazują, kiedy coś pojawiło się po raz pierwszy.',
      },
      sourceRegistry: {
        purpose: 'Kto naprawdę stoi za kontem lub stroną?',
        proves: 'Źródło jest wiarygodne albo podejrzane',
        steps: {
          keyboard: [
            'Szukaj podejrzanych pól; czasem nie ma żadnego',
            'W i S wybierają, E zakreśla pole',
            'Q odkłada kartę, gdy skończysz',
          ],
          gamepad: [
            'Szukaj podejrzanych pól; czasem nie ma żadnego',
            'Krzyżak wybiera, A zakreśla pole',
            'Y odkłada kartę, gdy skończysz',
          ],
          touch: [
            'Szukaj podejrzanych pól; czasem nie ma żadnego',
            'Stuknij podejrzane pole, by je zakreślić',
            'Stuknij „Odłóż kartę”, gdy skończysz',
          ],
        },
        realWorld:
          'Tak sprawdza się źródła: wiek konta, właściciela domeny i to, co piszą o nich inni.',
      },
      phone: {
        purpose: 'Co mówi o tym samo źródło?',
        proves: 'Źródło potwierdza albo zaprzecza',
        steps: {
          keyboard: [
            'Znajdź w książce numer do źródła',
            'W i S wybierają, E dzwoni',
            'Poczekaj w kolejce; reporter nie czeka',
          ],
          gamepad: [
            'Znajdź w książce numer do źródła',
            'Krzyżak wybiera numer, A dzwoni',
            'Poczekaj w kolejce; reporter nie czeka',
          ],
          touch: [
            'Znajdź w książce numer do źródła',
            'Stuknij numer, by zadzwonić',
            'Poczekaj w kolejce; reporter nie czeka',
          ],
        },
        realWorld:
          'Tak dziennikarze docierają do źródła: dzwonią do świadka, urzędu albo autora raportu i pytają wprost.',
      },
      aiScanner: {
        purpose: 'Czy ten materiał zrobiła maszyna?',
        proves: 'Tylko wskazówka, nigdy jedyny dowód',
        steps: {
          keyboard: [
            'Odczytaj wynik i margines błędu',
            'Margines sięga 50\u00a0%? Wybierz „Nie wiem”',
            'A i D wybierają, E potwierdza',
          ],
          gamepad: [
            'Odczytaj wynik i margines błędu',
            'Margines sięga 50\u00a0%? Wybierz „Nie wiem”',
            'Krzyżak wybiera, A potwierdza',
          ],
          touch: [
            'Odczytaj wynik i margines błędu',
            'Margines sięga 50\u00a0%? Wybierz „Nie wiem”',
            'Stuknij swoją odpowiedź',
          ],
        },
        realWorld:
          'Tak działają detektory treści z AI: podają prawdopodobieństwo, a nie pewność, i często się mylą.',
      },
      dataLibrary: {
        purpose: 'Czy liczba zgadza się z tabelą?',
        proves: 'Liczba jest prawdziwa albo zmieniona',
        steps: {
          keyboard: [
            'Porównaj liczbę z artykułu z tabelą',
            'Uważaj na rok, wiersz i jednostkę',
            'Spacja wybiera komórkę, Q zgłasza „Nie pasuje”',
          ],
          gamepad: [
            'Porównaj liczbę z artykułu z tabelą',
            'Uważaj na rok, wiersz i jednostkę',
            'A wybiera komórkę, Y zgłasza „Nie pasuje”',
          ],
          touch: [
            'Porównaj liczbę z artykułu z tabelą',
            'Uważaj na rok, wiersz i jednostkę',
            'Stuknij komórkę albo „Nie pasuje”',
          ],
        },
        realWorld:
          'Tak sprawdza się statystyki: u źródła, w oryginalnych tabelach urzędów i raportach badaczy.',
      },
      // Stage 7 stations (S7-48): Metadane (S7-52), Stenogram (S7-53), Inne media (S7-54) and
      // Mapa (S7-55) are final, settled against each minigame's controls and button labels.
      geolocation: {
        purpose: 'Gdzie naprawdę zrobiono to zdjęcie?',
        proves: 'Zdjęcie jest z innego miejsca niż podpis',
        steps: {
          keyboard: [
            'Znajdź dzielnicę z oboma obiektami ze zdjęcia',
            'Strzałki wybierają dzielnicę, spacja ją wskazuje',
            'Nie ma obu? Q – „Nie ma na mapie”',
          ],
          gamepad: [
            'Znajdź dzielnicę z oboma obiektami ze zdjęcia',
            'Krzyżak wybiera dzielnicę, A ją wskazuje',
            'Nie ma obu? Y – „Nie ma na mapie”',
          ],
          touch: [
            'Znajdź dzielnicę z oboma obiektami ze zdjęcia',
            'Stuknij dzielnicę, w której stoją oba',
            'Nie ma obu? Stuknij „Nie ma na mapie”',
          ],
        },
        realWorld:
          'Tak działa geolokalizacja: szczegóły zdjęcia porównuje się z mapami i zdjęciami ulic. Podpis może kłamać, widok nie.',
      },
      transcript: {
        purpose: 'Czy wycięty cytat znaczy to samo co całość?',
        proves: 'Cytat jest wycięty z kontekstu albo zmyślony',
        steps: {
          keyboard: [
            'Strzałki wybierają linię z cytatem, spacja wskazuje',
            'Brak cytatu? Q – „Nie ma w zapisie”',
            'Potem oceń: „Sens ten sam” czy „Sens zmieniony”?',
          ],
          gamepad: [
            'Krzyżak wybiera linię z cytatem, A wskazuje',
            'Brak cytatu? Y – „Nie ma w zapisie”',
            'Potem oceń: „Sens ten sam” czy „Sens zmieniony”?',
          ],
          touch: [
            'Stuknij linię, z której pochodzi cytat',
            'Brak cytatu? Stuknij „Nie ma w zapisie”',
            'Potem oceń: „Sens ten sam” czy „Sens zmieniony”?',
          ],
        },
        realWorld:
          'Tak sprawdza się cytaty: w pełnych stenogramach i nagraniach, a nie we fragmentach wyciętych z całości.',
      },
      crossCheck: {
        purpose: 'Co podają niezależne redakcje i agencje?',
        proves: 'Niezależne media potwierdzają albo zaprzeczają',
        steps: {
          keyboard: [
            'Licz tylko media z własnym reporterem',
            'Mniej niż dwa? „Za mało źródeł”',
            '← i → wybierają odpowiedź, spacja potwierdza',
          ],
          gamepad: [
            'Licz tylko media z własnym reporterem',
            'Mniej niż dwa? „Za mało źródeł”',
            'Krzyżak wybiera odpowiedź, A potwierdza',
          ],
          touch: [
            'Licz tylko media z własnym reporterem',
            'Mniej niż dwa? „Za mało źródeł”',
            'Stuknij swoją odpowiedź',
          ],
        },
        realWorld:
          'Tak działa czytanie w poprzek: zamiast ufać jednej stronie, sprawdza się, co podają agencje i inne redakcje. Kopia cudzego wpisu niczego nie potwierdza.',
      },
      metadata: {
        purpose: 'Kiedy, czym i gdzie powstał plik?',
        proves: 'Dane pliku pasują do opisu albo mu przeczą',
        steps: {
          keyboard: [
            'Znajdź pole, które przeczy opisowi w teczce',
            'Strzałki wybierają, spacja wskazuje; Q – „Zgadza się”',
            'Puste pola? „Brak danych” – to nic nie dowodzi',
          ],
          gamepad: [
            'Znajdź pole, które przeczy opisowi w teczce',
            'Krzyżak wybiera, A wskazuje; Y – „Zgadza się”',
            'Puste pola? „Brak danych” – to nic nie dowodzi',
          ],
          touch: [
            'Znajdź pole, które przeczy opisowi w teczce',
            'Stuknij to pole albo „Zgadza się”',
            'Puste pola? „Brak danych” – to nic nie dowodzi',
          ],
        },
        realWorld:
          'Tak czyta się metadane pliku (EXIF): datę, urządzenie, program i miejsce. Serwisy społecznościowe często je usuwają, a brak danych niczego nie dowodzi.',
      },
    } satisfies Record<StationKind, StationHelp>,
  },
  /** Ping picker (S2-11). Ping labels live in `vocab.pings`. */
  pings: {
    title: 'Sygnał',
    close: 'zamknij',
    closeTouch: 'Stuknij „Sygnał”, by zamknąć',
    closeKeys: { keyboard: ['Esc', 'Q'], gamepad: ['B'], touch: [] } satisfies Record<
      Device,
      readonly string[]
    >,
  },
  /** Level events (S4-05..S4-09): banners, folder badges, hints, the correction sheet. */
  events: {
    /** Big banner when an event starts: a short title and one short line. */
    banner: {
      viral: { title: 'To już wszędzie jest!', line: 'Najpierw sprawdź' },
      bossCall: { title: 'Telefon od szefa!', line: 'Żąda publikacji' },
      botRaid: { title: 'Nalot botów!', line: 'Jeden werdykt na wszystkie' },
      outage: { title: 'Awaria!', line: (station: string) => `${station} nie działa` },
      correction: { title: 'Sprostowanie!', line: 'Zanieś na stół' },
    },
    /** Short banners when something is over or solved. */
    done: {
      outage: { title: 'Naprawione', line: (station: string) => `${station} działa` },
      raid: { title: 'Nalot odparty!', line: 'Wszystkie fałszywki z głowy' },
    },
    /** Accessible names of the badges (the badges themselves show an icon and a number). */
    badge: {
      shares: (n: string) => `${n} udostępnień`,
      bossCall: (s: number) => `Szef czeka jeszcze ${s} s`,
      bossCallOver: 'Szef się rozłączył',
      raid: (n: number) => `Nalot botów: ${n} teczek`,
      correction: 'Sprostowanie',
      down: 'Awaria',
    },
    /** One-line hints (guidance bubble) for tagged folders. */
    hint: {
      viral: 'Viral! Sprawdź, zanim urośnie',
      bossCall: 'Szef dzwoni — sprawdź najpierw!',
      botRaid: 'Nalot! Jeden werdykt na wszystkie',
      correction: 'Sprostowanie — zanieś na stół!',
      stationDown: 'Stanowisko nie działa — zaczekaj',
    },
    /** Station overlay refused on a station that is down. */
    stationDown: 'Awaria!',
    /** Desk sheet for a correction folder. */
    correction: {
      title: 'Sprostowanie',
      line: 'Opublikowany materiał był zmanipulowany',
      button: 'Opublikuj sprostowanie',
      recover: (n: number) => `Odzyskasz ${n} Wiarygodności`,
    },
  },
  /** Level results (S2-08/S2-09). */
  results: {
    wonHeadline: 'Wydanie gotowe!',
    lostHeadline: 'Wydanie przepadło',
    /** Under the headline: why the level was won or lost (S7-06). */
    lede: {
      won: 'Gazeta idzie do druku.',
      credibility: 'Wiarygodność spadła do zera.',
      score: 'Wynik nie przekroczył zera.',
    } satisfies Record<'won' | LossReason, string>,
    stars: (n: number) => `${n} z 3 gwiazdek`,
    /** Captions under the three stars: what each one takes. */
    starRule: {
      one: 'wynik ponad 0',
      from: (points: number) => `od\u00a0${points}\u00a0pkt`,
    },
    /** The progress line under the stars. */
    toNext: (missing: number) => `brakuje ${missing}\u00a0pkt`,
    toNextLabel: (stars: number, missing: number) =>
      `Do ${stars} gwiazdek brakuje ${missing}\u00a0pkt`,
    allStars: 'Komplet gwiazdek!',
    starsNeedWin: 'Gwiazdki są tylko za wygraną',
    thresholdsWhyOpen: 'Skąd te progi?',
    thresholdsWhy: (max: number, two: number, three: number) =>
      `Progi liczymy od najlepszego wyniku możliwego w tym wydaniu (${max}\u00a0pkt): dwie gwiazdki od ${two}%, trzy od ${three}%.`,
    /** The 'Za co punkty' table: one row per outcome or bonus. */
    totals: {
      title: 'Za co punkty',
      what: 'Za co',
      count: 'Teczki',
      points: 'Punkty',
      credibility: 'Wiarygodność',
      times: (n: number) => `×${n}`,
      rows: {
        correct: 'Dobre werdykty',
        correction: 'Sprostowania',
        speed: 'Premia za tempo',
        proofs: 'Premia za dowody',
        bossCall: 'Szef dzwonił',
        weakProof: 'Słabe dowody',
        wrong: 'Błędne werdykty',
        expired: 'Przepadłe teczki',
        unfinished: 'Nie zdążyliście',
        other: 'Inne',
      } satisfies Record<TotalsRowId, string>,
      total: 'Razem',
      note: (max: number) => `Pasek nie spada poniżej 0 i nie rośnie ponad ${max}.`,
    },
    /** Phones: the Kolegium's first page. */
    summaryPage: 'Podsumowanie',
    score: 'Punkty',
    credibility: 'Wiarygodność',
    scoreDelta: (delta: string) => `${delta} pkt`,
    credibilityDelta: (delta: string) => `wiarygodność ${delta}`,
    folders: 'Teczki',
    noFolders: 'Żadna teczka nie dostała werdyktu.',
    backToLobby: 'Wróć do redakcji',
    waitingForHost: 'Czekamy na gospodarza…',
  },
  /** "What next" hint bubble and the first-game tutorial. */
  guidance: {
    /** Key names in the accusative, after „Trzymaj” / „Wciśnij”. */
    workKey: {
      keyboard: 'Spację',
      gamepad: 'X',
      touch: '„Pracuj”',
    } satisfies Record<'keyboard' | 'gamepad' | 'touch', string>,
    /** Short station names for hints: „Zanieś do: Lupa / Archiwum”. */
    stationShort: {
      imageSearch: 'Lupa',
      archive: 'Archiwum',
      sourceRegistry: 'Kartoteka',
      phone: 'Telefon',
      aiScanner: 'Skaner',
      dataLibrary: 'Dane',
      geolocation: 'Mapa',
      transcript: 'Stenogram',
      crossCheck: 'Inne media',
      metadata: 'Metadane',
    } satisfies Record<StationKind, string>,
    hint: {
      pickupConveyor: 'Weź teczkę z taśmy',
      pickupWaiting: 'Weź czekającą teczkę',
      pickupHere: {
        keyboard: 'Podnieś: E',
        gamepad: 'Podnieś: A',
        touch: 'Wciśnij „Podnieś”',
      } satisfies Record<'keyboard' | 'gamepad' | 'touch', string>,
      dropHere: {
        keyboard: 'Odłóż: E',
        gamepad: 'Odłóż: A',
        touch: 'Odłóż: wciśnij „Podnieś”',
      } satisfies Record<'keyboard' | 'gamepad' | 'touch', string>,
      toStation: (names: string) => `Zanieś do: ${names}`,
      work: (key: string) => `Trzymaj ${key}`,
      working: 'Trzymaj, sprawdzamy!',
      minigame: 'Rozwiąż zadanie',
      /** Facing a locked station that holds a folder: take the folder elsewhere. */
      lockout: 'Weź teczkę gdzie indziej',
      toDesk: 'Gotowe – zanieś na stół!',
      openDesk: (key: string) => `Werdykt: trzymaj ${key}`,
      verdict: 'Wybierz werdykt',
      wait: 'Czekaj na nową teczkę',
      /** Nothing to do, the next scheduled folder is this many seconds away. */
      waitIn: (s: number) => `Czekaj – teczka za\u00a0${s}\u00a0s`,
      /** A scheduled folder waits for a free conveyor tile. */
      conveyorFull: 'Taśma pełna – zabierz teczkę',
      /**
       * Role ability hints (S7-45): the device's key (`abilityHintKey`), then what a press does
       * right now. Przedłużenie for a warned folder in hand, Telefon z terenu instead of the walk
       * to the phone, Druga szansa at a locked station.
       */
      abilityExtend: (key: string) =>
        `${key}: +${ABILITY.extendDeadline.addMs / 1000}\u00a0s dla teczki`,
      abilityCall: (key: string) => `${key}: zadzwoń z\u00a0terenu`,
      abilitySecond: (key: string) => `${key}: druga szansa`,
    },
    /** The ability's key in a hint on touch: the fourth thumb button's own label, quoted. */
    abilityTouchKey: (label: string) => `„${label}”`,
    bubbleLabel: 'Podpowiedź',
    tutorial: {
      label: 'Samouczek',
      step: (n: number, total: number) => `Krok ${n} z ${total}`,
      skip: 'Pomiń samouczek',
      /** Before the drawn key: „lub Esc”, „lub B B”. */
      skipOr: 'lub',
      move: {
        keyboard: 'Ruszaj się: WASD',
        gamepad: 'Ruszaj się: lewa gałka',
        touch: 'Ruszaj się: przesuń kciukiem',
      } satisfies Record<'keyboard' | 'gamepad' | 'touch', string>,
      pickup: {
        keyboard: 'Podnieś teczkę z taśmy: E',
        gamepad: 'Podnieś teczkę z taśmy: A',
        touch: 'Przy taśmie wciśnij „Podnieś”',
      } satisfies Record<'keyboard' | 'gamepad' | 'touch', string>,
      work: (key: string) => `Zanieś ją na stanowisko, trzymaj ${key}`,
      minigame: 'Rozwiąż zadanie na stanowisku',
      verdict: 'Zanieś teczkę na stół, wybierz werdykt',
      /** The role ability step (S7-45, only with a role): key, ability name, what it does. */
      ability: (key: string, name: string, what: string) => `${key}: ${name} – ${what}`,
      /**
       * What the ability does, short enough for the card's 8 words with the key and the name
       * (the lobby's `lobbyRoles.abilityWhat` is longer).
       */
      abilityWhat: {
        photoEditor: 'zadanie przy obrazie od razu',
        archivist: 'zadanie przy dokumentach od razu',
        reporter: 'pieczątka Telefonu bez chodzenia',
        managingEditor: `+${ABILITY.extendDeadline.addMs / 1000}\u00a0s dla teczki`,
        generalist: 'po pudle jeszcze raz',
        rescuer: 'rzut do wolnej osoby',
      } satisfies Record<Role, string>,
      done: 'Super! Tak trzymaj!',
    },
  },
  /**
   * The intro (S7-99): the player's buttons and the narrator's script. The narrator is the
   * editor-in-chief; each line is both the subtitle (typeset at render) and the voiceover text
   * (`tools/audio/intro-lines.ts` respells key names for the TTS). One sentence is one subtitle
   * chunk and must fit two lines at 640×360 (intro/intro-script.test.ts). The scenes, their
   * order and the scripted input tracks are in `intro/intro-script.ts`.
   */
  intro: {
    label: 'Wprowadzenie',
    skip: 'Pomiń',
    next: 'Dalej',
    prev: 'Wstecz',
    pause: 'Pauza',
    resume: 'Wznów',
    /** „Dalej” on the last scene. */
    finish: 'Do roboty!',
    /** The chip shown while the browser still blocks audio; subtitles run on regardless. */
    soundLocked: 'Stuknij, by włączyć głos',
    scene: (n: number, total: number) => `Scena ${n} z ${total}`,
    /** S7-101: the name tag of the reporter on the intro's stage. */
    reporter: 'Ty',
    /** The stamp chip on the stations and desk callouts. */
    proof: 'Dowód',
    /** After the last scene or „Pomiń”, in „Jak grać”. */
    ended: 'Koniec wprowadzenia',
    replay: 'Obejrzyj jeszcze raz',
    /** Over the stage while paused. */
    paused: 'Pauza',
    /** The stage's accessible name. */
    stageLabel: 'Scena wprowadzenia',
    voice: {
      welcome:
        'Witaj w redakcji Kuriera Nowobrzeskiego! Jestem naczelnym. Czas goni, a na taśmę ciągle wpadają nowe teczki.',
      folders:
        'Każda teczka to zgłoszenie: prawda, fałszywka albo prawda bez kontekstu. Karta „Następna teczka” pokazuje, za ile sekund wpadnie kolejna.',
      pickup: {
        keyboard: 'Chodzisz klawiszami W, A, S i D. Podejdź do taśmy i weź teczkę klawiszem E.',
        gamepad: 'Chodzisz lewą gałką. Podejdź do taśmy i weź teczkę przyciskiem A.',
        touch:
          'Chodzisz, przesuwając kciukiem po lewej stronie ekranu. Przy taśmie wciśnij przycisk „Podnieś”.',
      } satisfies Record<Device, string>,
      work: {
        keyboard:
          'Zanieś teczkę na stanowisko i przytrzymaj spację. Potem rozwiąż krótkie zadanie.',
        gamepad:
          'Zanieś teczkę na stanowisko i przytrzymaj przycisk X. Potem rozwiąż krótkie zadanie.',
        touch:
          'Zanieś teczkę na stanowisko i przytrzymaj przycisk „Pracuj”. Potem rozwiąż krótkie zadanie.',
      } satisfies Record<Device, string>,
      stations:
        'Każde stanowisko sprawdza co innego, na przykład Lupa szuka starszych kopii zdjęcia. Dobrze rozwiązane zadanie daje pieczątkę: to twój dowód.',
      desk: 'Z dowodami idź do stołu redakcyjnego. Najpierw wskaż dowód, potem werdykt: Publikuj, Odrzuć albo Z kontekstem.',
      proof:
        'Liczy się dowód, który naprawdę rozstrzyga. Słaby dowód to tylko połowa punktów, nawet przy dobrym werdykcie. Trudniejsze teczki wymagają dwóch albo trzech dowodów.',
      credibility:
        'Pilnuj terminów i wiarygodności gazety. Spóźnienie kosztuje, ale fałszywka w druku kosztuje najwięcej. Gdy wiarygodność spadnie do zera, wydanie przepada.',
      roles: {
        keyboard:
          'Każdy może wybrać rolę. Rola daje premię i zdolność, na przykład Ekspertyzę. Zdolność włączasz klawiszem R, a potem musi się odnowić.',
        gamepad:
          'Każdy może wybrać rolę. Rola daje premię i zdolność, na przykład Ekspertyzę. Zdolność włączasz przyciskiem RB, a potem musi się odnowić.',
        touch:
          'Każdy może wybrać rolę. Rola daje premię i zdolność, na przykład Ekspertyzę. Zdolność włączasz czwartym przyciskiem po prawej, a potem musi się odnowić.',
      } satisfies Record<Device, string>,
      team: 'Rozmawiajcie i dzielcie się pracą. Fioletowy dymek podpowie, co dalej.',
      end: 'Po wydaniu Kolegium wyjaśni każdą teczkę i pokaże, za co są punkty i gwiazdki. Do roboty!',
    },
  },
  /** Editorial briefing before a level (S3-03). */
  briefing: {
    label: 'Briefing redakcyjny',
    levelNumber: (n: number) => `Poziom ${n}`,
    training: 'Trening',
    topic: 'Temat dnia:',
    newToday: 'Nowe dziś:',
    ready: 'Gotowy!',
    waiting: 'Czekamy na resztę',
    countdownLabel: (seconds: number) => `Start za ${seconds} s`,
    readyCount: (ready: number, total: number) => `Gotowi: ${ready} z ${total}`,
    playerReady: (nickname: string) => `${nickname}: gotowy`,
    playerWaiting: (nickname: string) => `${nickname}: czyta`,
    skipIntro: 'Pomiń animację',
    /** The dealt run (S7-25): its folders, star thresholds and the rule behind them. */
    runTitle: 'To wydanie:',
    starsFrom: (stars: number, points: number) => `${stars} gwiazdki od ${points}\u00a0pkt`,
    /** A threshold chip: „od” (dropped on phones, the label keeps it) and the points. */
    from: 'od',
    points: (points: number) => `${points}\u00a0pkt`,
    shareRule: (two: number, three: number, max: number) =>
      `Progi: ${two}\u00a0% i ${three}\u00a0% z\u00a0${max}\u00a0pkt możliwych`,
  },
  /** Campaign map in the lobby (S3-04). */
  campaign: {
    title: 'Wybierz poziom',
    training: 'Trening',
    locked: 'Zamknięty',
    tileLabel: (title: string, number: string, stars: number, locked: boolean) =>
      `${number}: ${title}, ${locked ? 'zamknięty' : `${stars} z 3 gwiazdek`}`,
  },
  /** Debrief (Kolegium) after a level: one card per story. Longer text is allowed only here. */
  debrief: {
    title: 'Kolegium',
    cardsLabel: 'Teczki tego wydania',
    count: (n: number) => `${n} ${pluralPl(n, 'teczka', 'teczki', 'teczek')}`,
    untitled: 'Teczka bez tytułu',
    yourVerdict: 'Wasz werdykt',
    correctVerdict: 'Właściwy',
    expired: 'Przepadła',
    sections: {
      what: 'Co to było',
      technique: 'Jak działa ta sztuczka',
      tool: 'Co to wykryło',
      realWorld: 'Gdzie to się zdarza',
    },
    /** The story's deciding proof on a folder that did not end well, with where each one was. */
    proofTitle: 'Dowód, który rozstrzygał',
    proofStatus: {
      cited: 'wskazany',
      collected: 'w teczce',
      missing: 'nie sprawdzono',
    } satisfies Record<ProofStatus, string>,
    /** Endless: a story that came back, grouped on one card. */
    repeats: (n: number) => `×${n}`,
    repeatsLabel: (n: number) =>
      `${n} ${pluralPl(n, 'teczka', 'teczki', 'teczek')} z tą wiadomością`,
    vote: 'Wpadka dnia?',
    voted: 'Twój głos',
    leader: 'Wpadka dnia!',
    votes: (n: number) => `${n} ${pluralPl(n, 'głos', 'głosy', 'głosów')}`,
    voteFor: (headline: string) => `Wpadka dnia: ${headline}`,
    prev: 'Poprzednia teczka',
    next: 'Następna teczka',
    position: (n: number, total: number) => `${n} z ${total}`,
  },
  /** Endless mode (S4-11): campaign card, briefing, HUD chip, results and the leaderboard. */
  endless: {
    title: 'Tryb bez końca',
    pitch: 'Im dłużej, tym szybciej',
    /** The only line of the briefing; there is no topic. */
    briefing: 'Bez końca – im dłużej, tym szybciej',
    briefingKicker: 'Bez końca',
    tileHint: 'Rekord czeka',
    locked: 'Zdobądź gwiazdkę na poziomie 1',
    tileLabel: (best: string | null, locked: boolean) =>
      locked
        ? 'Tryb bez końca, zamknięty: zdobądź gwiazdkę na poziomie 1'
        : `Tryb bez końca${best ? `, najlepszy wynik ${best}` : ''}`,
    timer: 'Czas gry',
    tempo: (n: number) => `Tempo ×${n}`,
    /** The same chip inside the one-row phone pill (S7-11): the icon carries „tempo”. */
    tempoShort: (n: number) => `×${n}`,
    tempoLabel: (n: number) => `Tempo: ${n} razy szybciej`,
    headline: (score: string) => `Redakcja upadła – wynik: ${score}`,
    lede: 'Spróbujcie jeszcze raz!',
    score: 'Wynik',
    survived: 'Czas gry',
    best: 'Najlepszy wynik',
    newRecord: 'Nowy rekord!',
    noBest: 'Pierwszy wynik!',
    tabs: { label: 'Wyniki i teczki', debrief: 'Teczki', room: 'Pokój', global: 'Wszyscy' },
  },
  /** Endless leaderboard (lobby button, dialog and the results tabs). */
  leaderboard: {
    title: 'Najlepsze wyniki',
    open: 'Wyniki',
    close: 'Zamknij wyniki',
    done: 'Gotowe',
    scopeLabel: 'Którzy gracze',
    room: 'Pokój',
    global: 'Wszyscy',
    loading: 'Wczytuję wyniki…',
    empty: 'Jeszcze pusto. Zagrajcie pierwsi!',
    error: 'Nie udało się wczytać wyników.',
    retry: 'Spróbuj ponownie',
    you: 'To wy',
    rank: (n: number) => `Miejsce ${n}`,
    row: (rank: number, players: string, score: string, time: string) =>
      `${rank}. ${players}: ${score} pkt, ${time}`,
    listLabel: (scope: 'room' | 'global', difficulty: string) =>
      `${scope === 'room' ? 'Wyniki w tym pokoju' : 'Najlepsze wyniki wszystkich'}, poziom ${difficulty.toLowerCase()}`,
  },
  /** S5-05 accessibility: captions for audio-only cues and the muted-sound suggestion. */
  a11y: {
    captionsRegion: 'Napisy dźwięków',
    suggestAction: 'Włącz napisy',
    suggestDismiss: 'Zamknij podpowiedź',
    captions: {
      /** S7-86: someone started watching from the Widownia. */
      spectatorJoined: 'Nowy widz',
      newFolder: 'Nowa teczka',
      deadlineNear: 'Termin blisko',
      folderLost: 'Teczka przepadła',
      moreTime: 'Więcej czasu',
      mistake: 'Błąd!',
      teammateMistake: 'Ktoś się pomylił',
      deskTaken: 'Biurko zajęte',
      lastSeconds: 'Ostatnie sekundy',
      pingArchive: 'Szukaj w archiwum',
      pingFake: 'Fałszywka!',
      pingMine: 'Biorę tę teczkę',
      playerJoined: 'Ktoś dołączył',
      playerBack: 'Wrócił do gry',
      playerLeft: 'Ktoś wyszedł',
      phoneRings: 'Telefon dzwoni',
      botRaid: 'Atak botów',
      outage: 'Awaria!',
      powerBack: 'Prąd wrócił',
      correction: 'Sprostowanie!',
      viral: 'Wiralowa teczka',
      raidResolved: 'Boty odparte',
      tempoUp: 'Tempo rośnie',
      record: 'Nowy rekord',
      beltFull: 'Taśma pełna',
      abilityArmed: 'Zdolność uzbrojona',
      expertise: 'Ekspertyza!',
      callStarted: 'Telefon z terenu',
      callStamp: 'Pieczątka z terenu',
      callDropped: 'Rozmowa przerwana',
      secondChance: 'Druga szansa',
      folderPassed: 'Teczka podana',
      rescued: 'Teczka uratowana!',
      abilityReady: 'Zdolność gotowa',
    },
  },
  /** Room browser (S7-88): the public rooms, opened from the main menu when the flag is on. */
  rooms: {
    title: 'Publiczne pokoje',
    close: 'Zamknij listę pokoi',
    searchLabel: 'Szukaj pokoju',
    searchPlaceholder: 'Kod, nazwa lub gospodarz',
    /** The phone toggle that shows the filters; `n` filters narrow the list. */
    filters: (n: number) => (n > 0 ? `Filtry (${n})` : 'Filtry'),
    filterLabels: { mode: 'Tryb gry', status: 'Stan pokoju', difficulty: 'Poziom trudności' },
    any: 'Wszystkie',
    modes: { coop: 'Razem', versus: 'Na punkty' } satisfies Record<RoomMode, string>,
    statuses: { open: 'Czekają', inGame: 'W grze' },
    /** A room without a name is called after its host. */
    untitled: (host: string) => `Pokój: ${host}`,
    host: (host: string) => `Gospodarz: ${host}`,
    code: (code: string) => `Kod ${code}`,
    players: (players: number, max: number) => `${players}/${max}`,
    playersLabel: (players: number, max: number) => `Gracze: ${players} z ${max}`,
    spectatorsLabel: (spectators: number) => `Widzowie: ${spectators}`,
    spectatorsClosed: 'Widownia zamknięta',
    inGame: 'W grze',
    full: 'Komplet',
    age: (minutes: number) => (minutes < 1 ? 'Nowy' : `${minutes} min`),
    ageLabel: (minutes: number) =>
      minutes < 1 ? 'Otwarty przed chwilą' : `Otwarty ${minutes} min temu`,
    join: 'Dołącz',
    watch: 'Oglądaj',
    loading: 'Szukam pokoi…',
    empty: 'Nie ma teraz publicznych pokoi.',
    emptyHint: 'Otwórz własny albo dołącz kodem.',
    filteredEmpty: 'Nic tu nie pasuje.',
    clearFilters: 'Pokaż wszystkie',
    /** Shown when the server found more rooms than it sends. */
    more: (shown: number, total: number) => `Widać ${shown} z ${total}. Zawęź szukanie.`,
    problems: {
      offline: 'Brak połączenia z serwerem.',
      busy: 'Za dużo zapytań. Zaraz spróbuję znowu.',
      unavailable: 'Lista pokoi jest teraz wyłączona.',
      failed: 'Nie udało się pobrać listy.',
    } satisfies Record<RoomListProblem, string>,
    retry: 'Spróbuj jeszcze raz',
    pick: 'Wybierz pokój z listy.',
    /** The picked room has no free seat and no open Widownia. */
    noSeat: 'Brak wolnych miejsc.',
  },
  /**
   * Spectators: the read-only briefing (S7-84) and the spectate screen (S7-90): one view per
   * newsroom, the top-bar scoreboard and the team plates. During play: at most 8 words per line.
   */
  spectate: {
    title: 'Widownia',
    watching: 'Oglądasz',
    waiting: 'Czekamy na pierwszy obraz…',
    leave: 'Wyjdź',
    /** One newsroom's line on the scoreboard (screen readers): name, points and credibility. */
    teamLine: (team: string, score: number, credibility: number) =>
      `${team}: ${score} pkt, wiarygodność ${credibility}`,
    /** The single newsroom of a co-op match. */
    coopTeam: 'Redakcja',
    /** The top bar (screen readers). */
    scoreboardLabel: 'Wynik meczu',
    /** The crown on the newsroom ahead. */
    leader: 'Prowadzi',
    clockLabel: (clock: string) => `Czas: ${clock}`,
    /** Co-op scoreboard: folders closed with a verdict and folders that ran out of time. */
    resolved: (count: number) => `Zamknięte teczki: ${count}`,
    expired: (count: number) => `Przeterminowane teczki: ${count}`,
    /** The results phase, before the spectator results (S7-91). */
    matchOver: 'Koniec meczu',
    /** The views region (screen readers). */
    viewsLabel: 'Podgląd redakcji',
    /** One-view layout: the score segment that shows its newsroom (phones). */
    showTeam: (team: string) => `Pokaż redakcję ${team}`,
    /** Split layout: the team plate focuses its newsroom, and a second tap brings both back. */
    focusTeam: (team: string) => `Tylko redakcja ${team}`,
    bothTeams: 'Pokaż obie redakcje',
    /** The keys of the spectate screen, keyboard and gamepad only (≤ 8 words). */
    hints: {
      keyboard: { split: 'Spacja – widok · 1, 2 – redakcja', single: 'Spacja – druga redakcja' },
      gamepad: { split: 'A – widok · B – obie redakcje', single: 'A – druga redakcja' },
    },
  },
  // --- S7-96 „Jak grać”: the help dialog with the intro, the stations and the controls. ---
  howTo: {
    /** The entry button (main menu corner, lobby, settings). */
    open: 'Jak grać?',
    title: 'Jak grać',
    tabsLabel: 'Działy pomocy',
    tabs: { intro: 'Wprowadzenie', stations: 'Stanowiska', controls: 'Sterowanie' },
    close: 'Gotowe',
    stationsLabel: 'Stanowiska redakcji',
    stationsLead: 'Wybierz stanowisko i zobacz, jak działa.',
    /** Gamepad only: the north button walks the tabs, as in the settings. */
    padHint: 'Y zmienia dział',
    /** S7-97: a station card's yellow action, a practice round with no server and no score. */
    practice: 'Wypróbuj',
    /** The practice round's header chip: nothing counts here. */
    practiceTag: 'Ćwiczenie',
    /** The practice round's close button: back to the station's card. */
    practiceExit: 'Wróć do opisu',
    practiceDone: 'Udało się!',
    practiceFailed: 'Nie tym razem',
    again: 'Jeszcze raz',
    back: 'Wróć',
    /** Opened from the in-game menu: practice waits until the level is over. */
    practiceInGame: 'Ćwiczenia po wydaniu',
  },
  // --- S7-103 „O grze”: authors, licence, privacy, version; asset credits; libraries. ---
  about: {
    /** The main-menu footer link. */
    open: 'O grze',
    title: 'O grze',
    tabsLabel: 'Działy',
    tabs: { game: 'Gra', credits: 'Zasoby', libraries: 'Biblioteki' },
    close: 'Gotowe',
    /** Gamepad only, as in „Jak grać”. */
    padHint: 'Y zmienia dział',
    authors: 'Autorzy',
    licence: 'Licencja',
    licenceSummary:
      'Kod, grafika, dźwięki i teksty gry są chronione prawem autorskim: bez pisemnej zgody autora nie wolno ich kopiować ani rozpowszechniać. Biblioteki i zasoby z innych źródeł mają własne licencje – patrz „Zasoby” i „Biblioteki”.',
    privacy: 'Prywatność',
    privacyBody:
      'Co gra zapisuje, na jak długo i po co – wszystko w notce o prywatności. Bez kont i bez e-maili.',
    privacyLink: 'Notka o prywatności',
    version: 'Wersja',
    versionLine: (version: string, protocol: number) => `${version} · protokół ${protocol}`,
    creditsLoading: 'Wczytuję listę zasobów…',
    creditsError: 'Nie udało się wczytać listy zasobów. Sprawdź połączenie.',
    retry: 'Spróbuj ponownie',
    voiceHeading: 'Głos lektora',
    /** Until the volunteer's recording ships (docs/voice-recording.pl.md). */
    voicePending: 'Czekamy na nagranie ochotnika. Do tego czasu wprowadzenie ma tylko napisy.',
    voiceCredit: (speaker: string, licence: string) => `${speaker} – licencja ${licence}.`,
    librariesLead: 'Gra powstała dzięki otwartemu oprogramowaniu. Dziękujemy jego autorom!',
    libraryColumns: { name: 'Biblioteka', licence: 'Licencja' },
    sides: { client: 'W przeglądarce', server: 'Na serwerze gry' },
  },
  // --- S7-104 Profil: this browser's statistics and the preferred look. ---
  profile: {
    /** The main-menu footer link. */
    open: 'Profil',
    title: 'Profil',
    close: 'Gotowe',
    lookTitle: 'Wygląd',
    noNickname: 'Bez podpisu',
    previewLabel: (nickname: string) => `Podgląd: ${nickname}`,
    colorLabel: 'Kolor gracza',
    /** Colour name and its shape (S5-05), so the choice never rests on colour alone. */
    colors: ['Pomarańczowy, koło', 'Niebieski, kwadrat', 'Morski, trójkąt', 'Różowy, romb'],
    accessoryLabel: 'Dodatek',
    accessories: {
      none: 'Bez dodatku',
      scarf: 'Szalik',
      bowTie: 'Muszka',
      pressCard: 'Legitymacja prasowa',
    } satisfies Record<Accessory, string>,
    statsTitle: 'Statystyki',
    stats: {
      levels: 'Rozegrane wydania',
      wins: 'Wygrane',
      accuracy: 'Trafne werdykty',
      favouriteRole: 'Ulubiona rola',
      stamps: 'Zebrane pieczątki',
      minigameFails: 'Nieudane zadania',
    },
    percent: (n: number) => `${n}\u00a0%`,
    /** No verdict or no finished level with a role yet. */
    none: '–',
    starsTitle: 'Gwiazdki',
    starsOf: (stars: number, max: number) => `${stars} z\u00a0${max}`,
    starsLabel: (difficulty: string, stars: number, max: number) =>
      `${difficulty}: ${stars} z\u00a0${max} ${pluralPl(max, 'gwiazdki', 'gwiazdek', 'gwiazdek')}`,
    localOnly: 'Zapisane tylko w tej przeglądarce.',
    clear: 'Wyczyść statystyki',
    clearConfirm: 'Na pewno? Wyczyść',
    clearCancel: 'Anuluj',
    cleared: 'Statystyki wyczyszczone.',
  },
  // --- S5-04 technique encyclopedia: collectible cards with the tricks met in the Kolegium. ---
  encyclopedia: {
    title: 'Encyklopedia technik',
    open: 'Encyklopedia',
    close: 'Zamknij encyklopedię',
    done: 'Gotowe',
    gridLabel: 'Karty technik',
    collected: (n: number, total: number) => `${n} z ${total}`,
    collectedLabel: (n: number, total: number) => `Zebrane karty: ${n} z ${total}`,
    locked: '???',
    lockedName: 'Zablokowana karta',
    lockedLabel: (n: number) => `Zablokowana karta ${n}`,
    lockedBody: 'Zagraj dalej, by ją odkryć',
    newCard: 'Nowa karta!',
    seeCard: 'Zobacz kartę',
    moreCards: (n: number) => `+${n}`,
    backToCards: 'Wróć do kart',
    sections: {
      how: 'Jak to działa',
      detect: 'Jak to wykryć',
      realWorld: 'Gdzie to się zdarza',
      met: 'Spotkane w grze',
    },
    level: (n: number, title: string) => (n === 0 ? `Trening: ${title}` : `Poziom ${n}: ${title}`),
  },
} as const;

export type Strings = typeof pl;
