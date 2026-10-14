// Main-menu footer (S7-74, S7-75, S7-96): a row of minor text links under the card, never
// yellow. In order:
// - „Profil” and „O grze” (slots, S7-96, filled by S7-104 and S7-103);
// - „Prywatność” opens the privacy note (/prywatnosc, rendered by the game server; it links back
//   to the game) in the same tab, which the gamepad can open too; always shown, so the footer
//   always renders;
// - „Zgody reklamowe” is the link AdSense requires for changing the ad consent; it shows only once
//   the ad script has loaded (Google's consent message comes with it), so without ads, with an ad
//   blocker and on phones it is not there. We use our own link instead of Google's floating
//   button, which would sit over the game.
import type { ReactNode } from 'react';
import { openConsentSettings, useAdLoader } from '../../ads/adsense.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Button } from '../../ui/Button.tsx';
import { Icon } from '../../ui/icons/Icon.tsx';
import { LinkButton } from '../../ui/LinkButton.tsx';
import styles from './MenuFooter.module.css';

/** Where the game server renders the privacy note. */
export const PRIVACY_PATH = '/prywatnosc';

export type MenuFooterProps = {
  className?: string | undefined;
  /** The „Profil” link (S7-104): a ghost button. */
  profile?: ReactNode;
  /** The „O grze” link (S7-103): a ghost button. */
  about?: ReactNode;
};

export function MenuFooter({ className = '', profile, about }: MenuFooterProps) {
  const adsReady = useAdLoader((s) => s.state === 'ready');
  return (
    <footer className={`${styles.footer} ${className}`} data-testid="menu-footer">
      {profile}
      {about}
      <LinkButton href={PRIVACY_PATH} icon={<Icon name="user" size={22} />}>
        {typeset(pl.menu.privacy)}
      </LinkButton>
      {adsReady && (
        <Button variant="ghost" icon={<Icon name="lock" size={22} />} onClick={openConsentSettings}>
          {typeset(pl.menu.adConsent)}
        </Button>
      )}
    </footer>
  );
}
