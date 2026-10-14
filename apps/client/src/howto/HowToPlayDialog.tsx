// „Jak grać” (S7-96): a lazy modal dialog with three tabs — „Wprowadzenie” (the intro; until the
// animated player lands, S7-101, its narrator lines to read), „Stanowiska” (a grid of the ten
// stations; one opens its help card) and „Sterowanie” (the settings' controls tab). One yellow
// „Gotowe” closes it; on a station card the card's „Rozumiem” takes the yellow and goes back to
// the grid. Keyboard (Tab, Enter, Esc), gamepad (d-pad, A, B, Y switches tabs) and touch all work.
// A centred panel on desktop, a full-screen sheet on phones.
import { STATION_KINDS, type StationKind } from '@redakcja/shared';
import { type SyntheticEvent, useEffect, useLayoutEffect, useRef } from 'react';
import { Segmented } from '../endless/Leaderboard.tsx';
import { emitCue } from '../fx/feedback.ts';
import { handleMenuIntent } from '../input/menu-nav.ts';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { introClipsFor } from '../intro/intro-script.ts';
import { ControlsTab } from '../screens/SettingsTabs.tsx';
import { STATION_ICON } from '../stations/kit.tsx';
import { StationHelpCard } from '../stations/StationHelpCard.tsx';
import { type InputDevice, useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import styles from './HowToPlay.module.css';
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
  const dialog = useRef<HTMLDialogElement>(null);

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

  // Esc on a station card goes back to the grid first, like B.
  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    const state = useHowTo.getState();
    if (state.tab === 'stations' && state.station !== null) {
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
      // Keys belong to the dialog: the game's own key handler must not see them.
      onKeyDown={(event) => event.nativeEvent.stopPropagation()}
    >
      {open && <HowToSheet />}
    </dialog>
  );
}

function HowToSheet() {
  const tab = useHowTo((s) => s.tab);
  const station = useHowTo((s) => s.station);
  const autoplay = useHowTo((s) => s.autoplay);
  const setTab = useHowTo((s) => s.setTab);
  const setStation = useHowTo((s) => s.setStation);
  const hide = useHowTo((s) => s.hide);
  const device = useApp((s) => s.inputDevice);
  const sheet = useRef<HTMLDivElement>(null);
  const cardOpen = tab === 'stations' && station !== null;

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

  // Opens with the active tab focused, so the pad and the keyboard start at the top.
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  }, []);

  useInputCapture(true);
  useNavIntent((intent) => {
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

  return (
    <div ref={sheet} className={`panel ${styles.sheet}`}>
      <header className={styles.header}>
        <h2 id="how-to-title" className={styles.title}>
          <Icon name="question" size={32} />
          {pl.howTo.title}
        </h2>
        {!autoplay && (
          <div className={styles.tabs}>
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
          variant={cardOpen ? 'secondary' : 'primary'}
          back
          icon={<Icon name="check" size={24} />}
          data-testid="how-to-close"
          onClick={hide}
        >
          {pl.howTo.close}
        </Button>
      </header>

      <div className={styles.body} data-testid={`how-to-panel-${tab}`}>
        {tab === 'intro' && <IntroTab device={device} />}
        {tab === 'stations' && <StationsTab device={device} station={station} />}
        {tab === 'controls' && <ControlsTab />}
      </div>

      {device === 'gamepad' && !autoplay && <p className={styles.padHint}>{pl.howTo.padHint}</p>}
    </div>
  );
}

/** The intro's narrator lines for this device, in scene order (the player replaces it, S7-101). */
function IntroTab({ device }: { device: InputDevice }) {
  return (
    <ol className={styles.intro} aria-label={pl.howTo.introLabel}>
      {introClipsFor(device).map((clip, index) => (
        <li key={clip.id} className={styles.introLine}>
          <span className={styles.number} aria-hidden="true">
            {index + 1}
          </span>
          <p>{clip.subtitle}</p>
        </li>
      ))}
    </ol>
  );
}

function StationsTab({ device, station }: { device: InputDevice; station: StationKind | null }) {
  const setStation = useHowTo((s) => s.setStation);
  const lastStation = useRef<StationKind | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const card = useRef<HTMLDivElement>(null);

  // A card opens at its top with „Rozumiem” focused; back on the grid, the station just read
  // keeps the focus.
  useEffect(() => {
    if (station !== null) {
      lastStation.current = station;
      card.current
        ?.querySelector<HTMLElement>('[data-testid="station-help-got"]')
        ?.focus({ preventScroll: true });
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
        />
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
