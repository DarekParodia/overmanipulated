// The leaderboard as a modal sheet, opened from the lobby: room tab and global tab, one yellow
// „Gotowe” closes it (Esc and the round close button too).
import { useEffect, useRef } from 'react';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { Leaderboard } from './Leaderboard.tsx';
import styles from './LeaderboardDialog.module.css';

export function LeaderboardDialog({
  open,
  roomCode,
  onClose,
}: {
  open: boolean;
  roomCode: string;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
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

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onClose={onClose}
      aria-labelledby="leaderboard-title"
      data-testid="leaderboard-dialog"
    >
      <form method="dialog" className={`panel ${styles.sheet}`}>
        <header className={styles.header}>
          <h2 id="leaderboard-title" className={styles.title}>
            <Icon name="trophy" size={32} />
            {pl.leaderboard.title}
          </h2>
          <Button
            type="submit"
            back
            icon={<Icon name="reject" size={24} label={pl.leaderboard.close} />}
          />
        </header>
        {open && <Leaderboard roomCode={roomCode} />}
        <footer className={styles.footer}>
          <Button type="submit" variant="primary" big>
            {pl.leaderboard.done}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
