// Main-menu footer (S7-74): a row of minor text links under the card, never yellow. It holds
// „Zgody reklamowe”, the link AdSense requires for changing the ad consent; it shows only once
// the ad script has loaded (Google's consent message comes with it), so without ads, with an ad
// blocker and on phones the footer is empty and renders nothing. We use our own link instead of
// Google's floating button, which would sit over the game. S7-75 adds „Prywatność”.
import { openConsentSettings, useAdLoader } from '../../ads/adsense.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Button } from '../../ui/Button.tsx';
import { Icon } from '../../ui/icons/Icon.tsx';
import styles from './MenuFooter.module.css';

export function MenuFooter({ className = '' }: { className?: string | undefined }) {
  const adsReady = useAdLoader((s) => s.state === 'ready');
  if (!adsReady) {
    return null;
  }
  return (
    <footer className={`${styles.footer} ${className}`} data-testid="menu-footer">
      <Button variant="ghost" icon={<Icon name="lock" size={22} />} onClick={openConsentSettings}>
        {typeset(pl.menu.adConsent)}
      </Button>
    </footer>
  );
}
