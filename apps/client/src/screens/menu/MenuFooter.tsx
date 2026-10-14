// Main-menu footer (S7-74): a row of minor text links under the card, never yellow. In order:
// „Profil” and „O grze” (slots, S7-96, filled by S7-104 and S7-103), then „Zgody reklamowe”,
// the link AdSense requires for changing the ad consent; that one shows only once the ad script
// has loaded (Google's consent message comes with it). We use our own link instead of Google's
// floating button, which would sit over the game. With every slot empty (no ads, an ad blocker,
// phones) the footer renders nothing. S7-75 adds „Prywatność”.
import type { ReactNode } from 'react';
import { openConsentSettings, useAdLoader } from '../../ads/adsense.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Button } from '../../ui/Button.tsx';
import { Icon } from '../../ui/icons/Icon.tsx';
import styles from './MenuFooter.module.css';

export type MenuFooterProps = {
  className?: string | undefined;
  /** The „Profil” link (S7-104): a ghost button. */
  profile?: ReactNode;
  /** The „O grze” link (S7-103): a ghost button. */
  about?: ReactNode;
};

export function MenuFooter({ className = '', profile, about }: MenuFooterProps) {
  const adsReady = useAdLoader((s) => s.state === 'ready');
  if (!adsReady && !profile && !about) {
    return null;
  }
  return (
    <footer className={`${styles.footer} ${className}`} data-testid="menu-footer">
      {profile}
      {about}
      {adsReady && (
        <Button variant="ghost" icon={<Icon name="lock" size={22} />} onClick={openConsentSettings}>
          {typeset(pl.menu.adConsent)}
        </Button>
      )}
    </footer>
  );
}
