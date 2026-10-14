// In-game menu sheet (S7-10), opened by the top-right menu button, Esc or a pad's Start. One
// yellow „Wróć do gry”, then settings, fullscreen, the room code with copy and ping, and
// „Wyjdź z redakcji”, which needs a second press. „Pomoc: stanowiska” (S7-97) opens „Jak grać”
// on its stations tab over the sheet, with practice off. Solo, the server holds the level still
// while the sheet is open („Pauza”); with teammates the shared level runs on („Gra trwa dalej”).
// A native modal dialog: it takes the input away from the world (movement stops), the pad
// navigates it through input/menu-nav.ts and B or Esc closes it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { TUTORIAL_DONE } from '../guidance/tutorial.ts';
import { useTutorial } from '../guidance/tutorial-store.ts';
import { useHowTo } from '../howto/store.ts';
import { subscribeMenuButton } from '../input/menu-button.ts';
import { captureInput, isInputCaptured } from '../input/ui-nav.ts';
import { canFullscreen, toggleFullscreen } from '../mobile/device.ts';
import { useGame } from '../net/game-store.ts';
import { leaveRoom, setPaused } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './GameMenu.module.css';
import {
  connectedPlayers,
  LEAVE_CONFIRM_MS,
  leavePress,
  menuStatus,
  useGameMenu,
  wantsPause,
} from './game-menu-model.ts';

/** How long the copy button shows its tick (client presentation timing). */
const COPIED_MS = 1600;

function tutorialActive(): boolean {
  const step = useTutorial.getState().step;
  return step !== null && step < TUTORIAL_DONE;
}

/** The dialog on top of all others (the settings may open over the menu). */
function topDialog(): HTMLDialogElement | null {
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  return dialogs[dialogs.length - 1] ?? null;
}

export function GameMenu() {
  const open = useGameMenu((s) => s.open);
  const setOpen = useGameMenu((s) => s.setOpen);
  const phase = useApp((s) => s.room?.phase ?? null);
  const connected = useApp((s) => connectedPlayers(s.room));
  const dialog = useRef<HTMLDialogElement>(null);
  const pause = wantsPause(open, phase, connected);

  // Layout effects: the dialog and the input capture follow `open` before the next paint, so
  // the menu button never shows a frame of „busy” while the sheet closes.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
      // The dialog focuses its first control (the copy button); the main action goes first.
      element.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  // Solo: the level waits while the sheet is open. Closing it, or a teammate arriving, resumes.
  useEffect(() => {
    if (!pause) {
      return;
    }
    setPaused(true);
    return () => setPaused(false);
  }, [pause]);

  useEffect(() => {
    const unsubscribe = subscribeMenuButton((source) => {
      const menu = useGameMenu.getState();
      if (menu.open) {
        // Start closes the sheet unless the settings sit on top of it (B closes those first).
        if (source === 'start' && topDialog() === dialog.current) {
          emitCue('ui.back');
          menu.setOpen(false);
        }
        return;
      }
      // Esc arrives only when it may open the menu; Start must not steal an overlay's input.
      if (source === 'escape' || !isInputCaptured()) {
        emitCue('ui.click');
        menu.setOpen(true);
      }
    }, tutorialActive);
    return () => {
      unsubscribe();
      useGameMenu.getState().setOpen(false);
    };
  }, []);

  // Movement stops while the sheet is open (menu-nav also captures for any open dialog).
  useLayoutEffect(() => (open ? captureInput() : undefined), [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keys close the native dialog themselves (Esc, B)
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="game-menu-title"
      data-testid="game-menu"
      onClose={() => setOpen(false)}
      // A tap on the backdrop closes the sheet, as the menu button under it would.
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setOpen(false);
        }
      }}
    >
      {open && <MenuSheet />}
    </dialog>
  );
}

function MenuSheet() {
  const phase = useApp((s) => s.room?.phase ?? null);
  const connected = useApp((s) => connectedPlayers(s.room));
  const paused = useGame((s) => s.paused);
  const status = menuStatus(phase, connected, paused);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const fullscreen = useFullscreen();
  const [armedAt, setArmedAt] = useState<number | null>(null);

  useEffect(() => {
    if (armedAt === null) {
      return;
    }
    const timer = setTimeout(() => setArmedAt(null), LEAVE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [armedAt]);

  function onLeave() {
    const press = leavePress(armedAt, performance.now());
    if (press.leave) {
      leaveRoom();
      return;
    }
    setArmedAt(press.armedAt);
  }

  return (
    <form method="dialog" className={`panel ${styles.sheet}`}>
      <header className={styles.header}>
        <h2 id="game-menu-title" className={styles.title}>
          <Icon name="menu" size={28} />
          {pl.gameMenu.title}
        </h2>
        {status && (
          <span
            className={`${styles.status} ${status === 'live' ? styles.live : styles.paused}`}
            role="status"
            data-testid="game-menu-status"
            data-state={status}
          >
            <Icon name={status === 'live' ? 'play' : 'pause'} size={20} />
            {typeset(status === 'live' ? pl.gameMenu.live : pl.gameMenu.paused)}
          </span>
        )}
      </header>

      <RoomRow />

      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          big
          data-autofocus
          data-area="wide"
          icon={<Icon name="play" size={26} />}
        >
          {typeset(pl.gameMenu.resume)}
        </Button>
        <Button
          icon={<Icon name="settings" size={24} />}
          onClick={() => setSettingsOpen(true)}
          data-area={fullscreen.available ? undefined : 'wide'}
        >
          {pl.gameMenu.settings}
        </Button>
        {fullscreen.available && (
          <Button icon={<Icon name="fullscreen" size={24} />} onClick={fullscreen.toggle}>
            {typeset(fullscreen.on ? pl.gameMenu.exitFullscreen : pl.gameMenu.fullscreen)}
          </Button>
        )}
        <Button
          icon={<Icon name="question" size={24} />}
          data-area="wide"
          data-testid="game-menu-help"
          onClick={() => useHowTo.getState().show('stations', { practiceAllowed: false })}
        >
          {typeset(pl.gameMenu.stationHelp)}
        </Button>
        <Button
          back
          variant={armedAt === null ? 'secondary' : 'red'}
          data-area="wide"
          data-testid="game-menu-leave"
          icon={<Icon name="leave" size={24} />}
          onClick={onLeave}
        >
          {typeset(armedAt === null ? pl.gameMenu.leave : pl.gameMenu.leaveConfirm)}
        </Button>
      </div>
    </form>
  );
}

/** Room code with a copy button, and the connection: ping when online (from the old RoomChip). */
function RoomRow() {
  const roomCode = useApp((s) => s.room?.roomCode ?? null);
  const connection = useApp((s) => s.connection);
  const rtt = useApp((s) => s.rttMs);
  const [copied, setCopied] = useState(false);
  const online = connection === 'online';

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (!roomCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(roomCode);
      emitCue('ui.copy');
      setCopied(true);
    } catch {
      // Clipboard blocked: the code is large enough to read aloud.
    }
  }

  return (
    <section className={`${styles.room} ${online ? '' : styles.roomOff}`}>
      <span className={styles.roomText}>
        {roomCode && (
          <span className={styles.roomCode} data-testid="game-menu-room">
            {pl.gameMenu.room(roomCode)}
          </span>
        )}
        <span className={styles.roomStatus} aria-live="polite">
          <span className={styles.roomDot} aria-hidden />
          {online && rtt !== null
            ? pl.gameMenu.ping(rtt)
            : pl.connection[connection === 'idle' ? 'offline' : connection]}
        </span>
      </span>
      {roomCode && (
        <Button
          icon={<Icon name={copied ? 'check' : 'copy'} size={24} label={pl.gameMenu.copy} />}
          onClick={() => void copy()}
        />
      )}
      <span className="visually-hidden" aria-live="polite">
        {copied ? pl.gameMenu.copied : ''}
      </span>
    </section>
  );
}

function useFullscreen(): { available: boolean; on: boolean; toggle(): void } {
  const [on, setOn] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  return { available: canFullscreen(), on, toggle: () => void toggleFullscreen() };
}
