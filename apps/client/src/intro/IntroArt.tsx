// The intro's UI-kit scenes (S7-101): the welcome masthead and the art of the later scenes, drawn
// from the game's own kit. Pictures only: the subtitles carry the words. The callouts over the
// in-engine scenes live with the renderer in the lazy stage chunk (IntroCallouts.tsx).
import { AbilityControl } from '../guidance/ControlsArt.tsx';
import { GameLogo } from '../screens/GameLogo.tsx';
import type { InputDevice } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import { RoleIcon } from '../ui/icons/RoleIcon.tsx';
import styles from './Intro.module.css';
import type { IntroArt as IntroArtId } from './intro-script.ts';
import { INTRO_ROLE } from './intro-script.ts';

/**
 * The later scenes' art until S7-102 draws them (proof cards, the HUD pill, roles, team, the
 * Kolegium): one big icon of the topic.
 */
const LATER_ICON: Partial<Record<IntroArtId, IconName>> = {
  proofCards: 'stamp',
  hudPill: 'gauge',
  teamBubbles: 'ping',
  kolegium: 'star',
};

/** A whole scene drawn from the UI kit. */
export function KitArt({ art, device }: { art: IntroArtId; device: InputDevice }) {
  if (art === 'masthead') {
    return (
      <div className={styles.masthead} data-art={art}>
        <GameLogo as="div" />
        <p className={styles.paper}>
          <Icon name="article" size={28} />
          {pl.masthead.paper}
        </p>
      </div>
    );
  }
  if (art === 'roleAbility') {
    return (
      <div className={styles.later} data-art={art}>
        <RoleIcon role={INTRO_ROLE} size={88} />
        <AbilityControl role={INTRO_ROLE} device={device} />
      </div>
    );
  }
  return (
    <div className={styles.later} data-art={art}>
      <Icon name={LATER_ICON[art] ?? 'question'} size={96} />
    </div>
  );
}
