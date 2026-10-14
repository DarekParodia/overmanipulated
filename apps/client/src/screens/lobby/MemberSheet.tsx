// The host's manage sheet (S7-87): the „more” button on another member's card opens a native
// modal <dialog> with the moves the server would accept for that member (`memberOptions`):
// „Przenieś do: …” (Na punkty), „Na widownię” / „Do gry”, „Przekaż gospodarza”, and
// „Usuń z pokoju” behind a confirm step („Usunąć na pewno?” → „Tak, usuń” / „Anuluj”). Every
// action closes the sheet; so does the member leaving or the host role moving away. Keyboard
// (Tab, Enter, Esc), gamepad (the dialog-scoped menu navigation: d-pad, A, B) and touch.
import type { RoomStateMessage, TeamIndex } from '@redakcja/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { pl } from '../../strings/pl.ts';
import { Button } from '../../ui/Button.tsx';
import { Icon } from '../../ui/icons/Icon.tsx';
import { TeamBadge, teamName } from '../../ui/TeamBadge.tsx';
import { memberOptions } from './lobby-model.ts';
import styles from './Sheet.module.css';

export type MemberSheetProps = {
  room: Pick<RoomStateMessage, 'hostId' | 'mode' | 'players' | 'spectators'>;
  selfId: string | null;
  /** The member the sheet is open for; null keeps it closed. */
  targetId: string | null;
  /** The server's `spectators` feature flag. */
  spectatorsOn: boolean;
  disabled: boolean;
  onClose(): void;
  onMove(team: TeamIndex, playerId: string): void;
  onSpectator(spectator: boolean, playerId: string): void;
  onMakeHost(playerId: string): void;
  onKick(playerId: string): void;
};

export function MemberSheet({
  room,
  selfId,
  targetId,
  spectatorsOn,
  disabled,
  onClose,
  onMove,
  onSpectator,
  onMakeHost,
  onKick,
}: MemberSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const options = targetId === null ? null : memberOptions(room, selfId, targetId, spectatorsOn);
  const open = options !== null;
  const [confirming, setConfirming] = useState(false);

  // A new member (or a closed sheet) starts without the kick confirm.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `targetId` is the trigger.
  useEffect(() => setConfirming(false), [targetId]);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      // The member left or the host moved away: nothing to manage any more.
      element.close();
    }
  }, [open]);

  // The confirm step starts on the safe answer; back on the options, on the kick button again.
  useEffect(() => {
    const focus = confirming ? 'member-kick-cancel' : 'member-kick';
    if (dialog.current?.open) {
      dialog.current.querySelector<HTMLElement>(`[data-testid="${focus}"]`)?.focus();
    }
  }, [confirming]);

  function close(): void {
    dialog.current?.close();
  }

  function act(action: () => void): void {
    action();
    close();
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onClose={onClose}
      // Esc closes natively; it gets the same back sound as B and the ✗.
      onCancel={() => emitCue('ui.back')}
      aria-labelledby="member-sheet-title"
      data-testid="member-sheet"
    >
      {options && targetId !== null && (
        <div className={`panel ${styles.sheet}`}>
          <header className={styles.header}>
            <div className={styles.heading}>
              <p className={styles.kicker}>{pl.manage.kicker}</p>
              <h2 id="member-sheet-title" className={styles.title}>
                <Icon name={options.spectator ? 'eye' : 'user'} size={30} />
                {options.nickname}
              </h2>
            </div>
            <Button
              back
              icon={<Icon name="reject" size={24} label={pl.manage.close} />}
              data-testid="member-sheet-close"
              onClick={close}
            />
          </header>
          {options.spectator && (
            <p className={styles.note}>
              <Icon name="eye" size={22} />
              {pl.manage.watching}
            </p>
          )}
          {confirming ? (
            <section className={styles.confirm} aria-labelledby="kick-confirm">
              <p id="kick-confirm" className={styles.confirmText}>
                {pl.manage.kickConfirm}
              </p>
              <div className={styles.actions}>
                <Button
                  variant="red"
                  wide
                  icon={<Icon name="leave" size={24} />}
                  disabled={disabled}
                  data-testid="member-kick-yes"
                  onClick={() => act(() => onKick(targetId))}
                >
                  {pl.manage.kickYes}
                </Button>
                <Button
                  back
                  wide
                  icon={<Icon name="close" size={24} />}
                  data-testid="member-kick-cancel"
                  onClick={() => setConfirming(false)}
                >
                  {pl.manage.cancel}
                </Button>
              </div>
            </section>
          ) : (
            <div className={styles.actions}>
              {options.moveTo !== null && (
                <MoveButton
                  team={options.moveTo}
                  disabled={disabled}
                  onClick={(team) => act(() => onMove(team, targetId))}
                />
              )}
              {options.toSpectators && (
                <Button
                  wide
                  icon={<Icon name="eye" size={24} />}
                  disabled={disabled}
                  data-testid="member-to-spectators"
                  onClick={() => act(() => onSpectator(true, targetId))}
                >
                  {pl.lobbyRoom.toSpectators}
                </Button>
              )}
              {options.toPlayers && (
                <Button
                  wide
                  icon={<Icon name="play" size={24} />}
                  disabled={disabled}
                  data-testid="member-to-players"
                  onClick={() => act(() => onSpectator(false, targetId))}
                >
                  {pl.lobbyRoom.toPlayers}
                </Button>
              )}
              {options.makeHost && (
                <Button
                  wide
                  icon={<Icon name="crown" size={24} />}
                  disabled={disabled}
                  data-testid="member-make-host"
                  onClick={() => act(() => onMakeHost(targetId))}
                >
                  {pl.manage.makeHost}
                </Button>
              )}
              <Button
                variant="red"
                wide
                icon={<Icon name="leave" size={24} />}
                disabled={disabled}
                data-testid="member-kick"
                onClick={() => setConfirming(true)}
              >
                {pl.manage.kick}
              </Button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

function MoveButton({
  team,
  disabled,
  onClick,
}: {
  team: TeamIndex;
  disabled: boolean;
  onClick(team: TeamIndex): void;
}) {
  return (
    <Button
      wide
      icon={<TeamBadge team={team} size={26} />}
      disabled={disabled}
      data-testid="member-move"
      onClick={() => onClick(team)}
    >
      {pl.manage.moveTo(teamName(team))}
    </Button>
  );
}
