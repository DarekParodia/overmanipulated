// The one top-right button during play (S7-10): opens the in-game menu sheet (hud/GameMenu).
// A red dot says the connection is down; the room code and ping live inside the sheet. While a
// station, the desk or the ping picker owns the input the button rests (disabled): the menu
// would fight that overlay for the keys, and the overlay has its own way out.
import { useInputCaptured } from '../input/ui-nav.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './GameMenu.module.css';
import { useGameMenu } from './game-menu-model.ts';

export function GameMenuButton() {
  const open = useGameMenu((s) => s.open);
  const setOpen = useGameMenu((s) => s.setOpen);
  const offline = useApp((s) => s.connection !== 'online');
  // The open menu captures the input itself; only someone else's capture disables the button.
  const busy = useInputCaptured() && !open;
  return (
    <div className={styles.anchor} data-hud-band>
      <Button
        icon={
          <Icon
            name="menu"
            size={28}
            label={offline ? `${pl.gameMenu.open}: ${pl.gameMenu.offline}` : pl.gameMenu.open}
          />
        }
        disabled={busy}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="game-menu-button"
        onClick={() => setOpen(!open)}
      />
      {offline && <span className={styles.offlineDot} data-testid="game-menu-offline" />}
    </div>
  );
}
