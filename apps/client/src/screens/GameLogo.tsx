// The game logo: a chunky tilted sign with the title in Baloo and a navy ribbon underneath, plus
// a small clock sticker (the "last minute"). Pure CSS + one icon, so it costs nothing to load.
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './GameLogo.module.css';

export type GameLogoProps = {
  /** Smaller version for the loading screen. */
  small?: boolean;
  /** Render as the page heading (main menu) or as decoration. */
  as?: 'h1' | 'div';
};

export function GameLogo({ small = false, as: Tag = 'h1' }: GameLogoProps) {
  return (
    <Tag className={`${styles.logo} ${small ? styles.small : ''}`}>
      <span className={styles.sign}>
        <span className={styles.top}>{pl.menu.titleTop}</span>{' '}
        <span className={styles.ribbon}>{pl.menu.titleBottom}</span>
      </span>
      <span className={styles.sticker} aria-hidden="true">
        <Icon name="clock" size={small ? 26 : 40} />
      </span>
    </Tag>
  );
}
