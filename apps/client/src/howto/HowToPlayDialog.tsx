// „Jak grać” (S7-96): a lazy modal dialog with three tabs — „Wprowadzenie” (the narrated intro
// player, S7-101), „Stanowiska” (a grid of the ten
// stations; one opens its help card) and „Sterowanie” (the settings' controls tab). One yellow
// „Gotowe” closes it; on a station card the card's „Rozumiem” takes the yellow and goes back to
// the grid. Keyboard (Tab, Enter, Esc), gamepad (d-pad, A, B, Y switches tabs) and touch all work.
// A centred panel on desktop, a full-screen sheet on phones.
// S7-97: a station card offers a yellow „Wypróbuj” that turns the sheet into a practice round
// (PracticeRound.tsx, no server, no score); opened from the in-game menu it says „Ćwiczenia po
// wydaniu” instead. While a round runs the dialog hands its keys to the nav intents, as in a
// match; Esc / B / ✗ go back to the card.
// S7-101: while the intro plays, its keys (← / →, Space, Enter, Esc) and pad intents (d-pad
// left / right, A, B) go to the player first (`IntroInput`); its yellow „Dalej” takes the yellow
// from „Gotowe” until the end card.
import { STATION_KINDS, type StationKind } from '@redakcja/shared';
import {
  type MutableRefObject,
  type SyntheticEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Segmented } from '../endless/Leaderboard.tsx';
import { emitCue } from '../fx/feedback.ts';
import { handleMenuIntent } from '../input/menu-nav.ts';
import { handleNavKey, useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { type IntroInput, IntroPlayer } from '../intro/IntroPlayer.tsx';
import { ControlsTab } from '../screens/SettingsTabs.tsx';
import { STATION_ICON } from '../stations/kit.tsx';
import { StationHelpCard } from '../stations/StationHelpCard.tsx';
import { type InputDevice, useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import styles from './HowToPlay.module.css';
import { PracticeRound } from './PracticeRound.tsx';
import { HOW_TO_TABS, type HowToTab, nextHowToTab, useHowTo } from './store.ts';

const TAB_ICON: Record<HowToTab, IconName> = {
  intro: 'play',
  stations: 'stamp',
  controls: 'gamepad',
};

const TAB_OPTIONS = HOW_TO_TABS.map((id) => ({ id, label: pl.howTo.tabs[id], icon: TAB_ICON[id] }));

export function HowToPlayDialog() {
  const open = useHowTo((s) => s.open);
  const hide = useHowTo((s) => s.hide);
  const practicing = useHowTo((s) => s.practice !== 'off');
  const dialog = useRef<HTMLDialogElement>(null);
  /** The intro player's input while it is on the Wprowadzenie tab. */
  const intro = useRef<IntroInput | null>(null);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  // Esc in a practice round goes back to the card, on a station card back to the grid, like B.
  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    const state = useHowTo.getState();
    if (state.tab === 'intro' && intro.current?.cancel()) {
      // Esc skips a running intro to its end card; a second Esc closes.
      event.preventDefault();
    } else if (state.practice !== 'off') {
      event.preventDefault();
      emitCue('ui.back');
      state.setPractice('off');
    } else if (state.tab === 'stations' && state.station !== null) {
      event.preventDefault();
      emitCue('ui.back');
      state.setStation(null);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onClose={hide}
      onCancel={onCancel}
      aria-labelledby="how-to-title"
      data-testid="how-to-play"
      data-practice={practicing || undefined}
      // Keys belong to the dialog: the game's own key handler must not see them. A running
      // practice round gets them as nav intents, like a minigame in a match.
      onKeyDown={(event) => {
        event.nativeEvent.stopPropagation();
        if (useHowTo.getState().tab === 'intro' && intro.current?.key(event.nativeEvent)) {
          return;
        }
        if (useHowTo.getState().practice === 'playing' && handleNavKey(event.nativeEvent)) {
          useApp.getState().setInputDevice('keyboard');
        }
      }}
    >
      {open && <HowToSheet intro={intro} />}
    </dialog>
  );
}

function HowToSheet({ intro }: { intro: MutableRefObject<IntroInput | null> }) {
  const tab = useHowTo((s) => s.tab);
  const station = useHowTo((s) => s.station);
  const autoplay = useHowTo((s) => s.autoplay);
  const setTab = useHowTo((s) => s.setTab);
  const setStation = useHowTo((s) => s.setStation);
  const hide = useHowTo((s) => s.hide);
  const practice = useHowTo((s) => s.practice);
  const device = useApp((s) => s.inputDevice);
  const sheet = useRef<HTMLDivElement>(null);
  const cardOpen = tab === 'stations' && station !== null;
  const [introRunning, setIntroRunning] = useState(false);
  const introPlaying = tab === 'intro' && introRunning;

  function switchTab(next: HowToTab) {
    if (next !== tab) {
      emitCue('ui.click');
      setTab(next);
      // The focus follows the tab (a pad's Y), so the d-pad goes on from there.
      requestAnimationFrame(() =>
        sheet.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus(),
      );
    }
  }

  // Opens with the active tab focused, so the pad and the keyboard start at the top; opened on
  // a station's card (a briefing chip), the card's own yellow action keeps the focus it took.
  useEffect(() => {
    if (!sheet.current?.contains(document.activeElement)) {
      sheet.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    }
  }, []);

  useInputCapture(true);
  useNavIntent((intent) => {
    // The practice round handles its own intents; nothing it passes on may switch the tab.
    if (useHowTo.getState().practice !== 'off') {
      return true;
    }
    if (useHowTo.getState().tab === 'intro' && intro.current?.intent(intent)) {
      return true;
    }
    if (intent === 'back') {
      emitCue('ui.back');
      if (cardOpen) {
        setStation(null);
      } else {
        hide();
      }
    } else if (intent === 'alt') {
      if (!autoplay) {
        switchTab(nextHowToTab(tab, 1));
      }
    } else {
      handleMenuIntent(intent);
    }
    return true;
  });

  if (practice !== 'off' && station !== null) {
    return (
      <div ref={sheet} className={styles.practiceSheet}>
        <PracticeRound kind={station} device={device} />
      </div>
    );
  }

  return (
    <div ref={sheet} className={`panel ${styles.sheet}`}>
      <header className={styles.header}>
        <h2 id="how-to-title" className={styles.title}>
          <Icon name="question" size={32} />
          {pl.howTo.title}
        </h2>
        {!autoplay && (
          // A landscape phone hides the tabs while the intro plays (CSS): its stage needs the
          // row; „Pomiń” or the end brings them back, and a pad's Y switches tabs anyway.
          <div className={styles.tabs} data-intro-playing={introPlaying || undefined}>
            <Segmented<HowToTab>
              label={pl.howTo.tabsLabel}
              value={tab}
              options={TAB_OPTIONS}
              onChange={switchTab}
              testId="how-to-tab"
            />
          </div>
        )}
        <Button
          variant={cardOpen || introPlaying ? 'secondary' : 'primary'}
          back
          icon={<Icon name="check" size={24} />}
          data-testid="how-to-close"
          onClick={hide}
        >
          {pl.howTo.close}
        </Button>
      </header>

      <div
        className={`${styles.body} ${tab === 'intro' ? styles.bodyIntro : ''}`}
        data-testid={`how-to-panel-${tab}`}
      >
        {tab === 'intro' && (
          <IntroPlayer device={device} input={intro} onRunningChange={setIntroRunning} />
        )}
        {tab === 'stations' && <StationsTab device={device} station={station} />}
        {tab === 'controls' && <ControlsTab />}
      </div>

      {device === 'gamepad' && !autoplay && <p className={styles.padHint}>{pl.howTo.padHint}</p>}
    </div>
  );
}

function StationsTab({ device, station }: { device: InputDevice; station: StationKind | null }) {
  const setStation = useHowTo((s) => s.setStation);
  const setPractice = useHowTo((s) => s.setPractice);
  const practiceAllowed = useHowTo((s) => s.practiceAllowed);
  const lastStation = useRef<StationKind | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const card = useRef<HTMLDivElement>(null);

  // A card opens at its top with its yellow action focused („Wypróbuj”, or „Rozumiem” in a
  // match), also back from a practice round; back on the grid, the station just read keeps
  // the focus.
  useEffect(() => {
    if (station !== null) {
      lastStation.current = station;
      const main =
        card.current?.querySelector<HTMLElement>('[data-testid="how-to-practice"]') ??
        card.current?.querySelector<HTMLElement>('[data-testid="station-help-got"]');
      main?.focus({ preventScroll: true });
      // On a short screen the card scrolls; it starts at its header, not at the button.
      card.current?.scrollIntoView({ block: 'start' });
    } else if (lastStation.current) {
      grid.current
        ?.querySelector<HTMLElement>(`[data-kind="${lastStation.current}"]`)
        ?.focus({ preventScroll: false });
    }
  }, [station]);

  if (station !== null) {
    return (
      <div ref={card} className={styles.card}>
        <StationHelpCard
          kind={station}
          device={device}
          variant="full"
          onClose={() => setStation(null)}
          action={
            practiceAllowed ? (
              <Button
                variant="primary"
                icon={<Icon name="play" size={24} />}
                data-testid="how-to-practice"
                onClick={() => setPractice('playing')}
              >
                {pl.howTo.practice}
              </Button>
            ) : undefined
          }
        />
        {!practiceAllowed && (
          <p className={styles.practiceOff} data-testid="how-to-practice-off">
            <Icon name="lock" size={22} />
            {pl.howTo.practiceInGame}
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={grid} className={styles.stations}>
      <p className={styles.lead}>{typeset(pl.howTo.stationsLead)}</p>
      <ul className={styles.grid} aria-label={pl.howTo.stationsLabel}>
        {STATION_KINDS.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              className={styles.tile}
              data-kind={kind}
              data-testid={`how-to-station-${kind}`}
              onClick={() => {
                emitCue('ui.click');
                setStation(kind);
              }}
            >
              <Icon name={STATION_ICON[kind]} size={36} />
              <span>{pl.vocab.stations[kind]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
