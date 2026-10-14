// The intro's UI-kit scenes (S7-101, S7-102): the welcome masthead and scenes 7–11 (proof,
// credibility, roles, team, the Kolegium), drawn from the game's own kit. Pictures with a few
// words at most: the subtitles carry the sentences. The callouts over the in-engine scenes live
// with the renderer in the lazy stage chunk (IntroCallouts.tsx); nothing here imports the HUD's
// heavy modules or the renderer, so the art stays in the „Jak grać” chunk.
//
// Motion: each piece pops in once (staggered with `--delay`); the credibility bar drains and the
// ability ring refills once. Reduced motion fades them in and shows the end state; no-flash
// changes nothing because nothing loops or blinks. A paused intro pauses the art's animations
// (Intro.module.css).
import { abilityOf, ROLES, type Role } from '@redakcja/shared';
import type { CSSProperties, ReactNode } from 'react';
import { AbilityControl } from '../guidance/ControlsArt.tsx';
import { HudGlyph } from '../hud/HudGlyph.tsx';
import { GameLogo } from '../screens/GameLogo.tsx';
import type { InputDevice } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { RoleIcon } from '../ui/icons/RoleIcon.tsx';
import { PlayerMark } from '../ui/PlayerMark.tsx';
import { playerColors } from '../ui/tokens.ts';
import { VerdictStamp } from '../ui/VerdictStamp.tsx';
import styles from './Intro.module.css';
import type { IntroArt as IntroArtId } from './intro-script.ts';
import { INTRO_ROLE } from './intro-script.ts';

/** Stagger between the pieces of one scene, ms (presentation only). */
const ART_STAGGER_MS = 260;

/** A piece of a scene that pops in `step` beats after the scene starts. */
function Piece({
  step,
  className,
  children,
}: {
  step: number;
  className?: string | undefined;
  children: ReactNode;
}) {
  const style = { '--delay': `${step * ART_STAGGER_MS}ms` } as CSSProperties;
  return (
    <div className={`${styles.piece} ${className ?? ''}`} style={style}>
      {children}
    </div>
  );
}

/** A whole scene drawn from the UI kit. */
export function KitArt({ art, device }: { art: IntroArtId; device: InputDevice }) {
  switch (art) {
    case 'masthead':
      return (
        <div className={styles.masthead} data-art={art}>
          <GameLogo as="div" />
          <p className={styles.paper}>
            <Icon name="article" size={28} />
            {pl.masthead.paper}
          </p>
        </div>
      );
    case 'proofCards':
      return <ProofArt />;
    case 'hudPill':
      return <CredibilityArt />;
    case 'roleAbility':
      return <RolesArt device={device} />;
    case 'teamBubbles':
      return <TeamArt />;
    case 'kolegium':
      return <KolegiumArt />;
    default:
      return null;
  }
}

/** Proof: a deciding stamp gets the check, a weak one half; a harder folder needs two stamps. */
function ProofArt() {
  return (
    <div className={styles.kit} data-art="proofCards">
      <Piece step={0} className={`${styles.card} ${styles.cardGood}`}>
        <span className={`${styles.badge} ${styles.badgeGood}`}>
          <Icon name="check" size={22} />
        </span>
        <Icon name="stamp" size={44} className={styles.cardIcon ?? ''} />
        <span className={styles.caption}>{pl.intro.art.strongProof}</span>
      </Piece>
      <Piece step={1} className={`${styles.card} ${styles.cardWeak}`}>
        <span className={`${styles.badge} ${styles.badgeWarn}`}>{pl.intro.art.half}</span>
        <Icon name="stamp" size={44} className={styles.cardIcon ?? ''} />
        <span className={styles.caption}>{pl.intro.art.weakProof}</span>
      </Piece>
      <Piece step={2} className={styles.card}>
        <Icon name="folder" size={44} className={styles.cardIcon ?? ''} />
        <span className={styles.slots}>
          <span className={`${styles.slot} ${styles.slotOn}`}>
            <Icon name="stamp" size={18} />
          </span>
          <span className={styles.slot} />
        </span>
        <span className={styles.caption}>{pl.intro.art.stamps(1, 2)}</span>
      </Piece>
    </div>
  );
}

/** Credibility: the HUD pill with a draining shield, a late folder and a correction. */
function CredibilityArt() {
  return (
    <div className={`${styles.kit} ${styles.kitColumn}`} data-art="hudPill">
      <Piece step={0} className={styles.pill}>
        <span className={styles.pillPart}>
          <Icon name="clock" size={26} />
          {pl.intro.art.clock}
        </span>
        <span className={styles.pillPart}>
          <HudGlyph name="shieldCracked" size={28} fill="var(--red)" />
          <span className={styles.meter}>
            <span className={styles.meterFill} />
          </span>
        </span>
      </Piece>
      <span className={styles.row}>
        <Piece step={1} className={`${styles.card} ${styles.cardLate}`}>
          <Icon name="folder" size={40} className={styles.cardIcon ?? ''} />
          <span className={styles.caption}>
            <Icon name="hourglass" size={20} />
            {pl.intro.art.countdown}
          </span>
        </Piece>
        <Piece step={2}>
          <VerdictStamp kind="correction" size="md" />
        </Piece>
      </span>
    </div>
  );
}

/** The intro reporter's role first, then two more role passes. */
const ROLE_PASSES: readonly Role[] = [
  INTRO_ROLE,
  ...ROLES.filter((role) => role !== INTRO_ROLE).slice(0, 2),
];

/** Roles: three role passes, the photo editor's ability, its control and the refilling ring. */
function RolesArt({ device }: { device: InputDevice }) {
  const ability = abilityOf(INTRO_ROLE);
  return (
    <div className={`${styles.kit} ${styles.kitColumn}`} data-art="roleAbility">
      <span className={styles.row}>
        {ROLE_PASSES.map((role, index) => (
          <Piece
            key={role}
            step={index}
            className={`${styles.pass} ${role === INTRO_ROLE ? styles.passOn : ''}`}
          >
            <RoleIcon role={role} size={52} />
          </Piece>
        ))}
      </span>
      <Piece step={ROLE_PASSES.length} className={styles.ability}>
        <span className={styles.ring}>
          <svg className={styles.ringSvg} viewBox="0 0 64 64" aria-hidden="true">
            <circle className={styles.ringTrack} cx={32} cy={32} r={26} />
            <circle className={styles.ringFill} cx={32} cy={32} r={26} pathLength={100} />
          </svg>
          <Icon name="bolt" size={26} className={styles.ringIcon ?? ''} />
        </span>
        {ability && <span className={styles.caption}>{pl.vocab.abilities[ability]}</span>}
        <AbilityControl role={INTRO_ROLE} device={device} />
      </Piece>
    </div>
  );
}

/** Team: four reporters, a ping bubble over them and the purple hint bubble. */
function TeamArt() {
  return (
    <div className={`${styles.kit} ${styles.kitColumn}`} data-art="teamBubbles">
      <Piece step={1} className={`${styles.bubble} ${styles.bubblePing}`}>
        <Icon name="ping" size={22} />
        {pl.vocab.pings.fake}
      </Piece>
      <span className={styles.row}>
        {playerColors.map((color, index) => (
          <Piece key={color} step={0} className={styles.mate}>
            <PlayerMark colorIndex={index} size="100%" />
          </Piece>
        ))}
      </span>
      <Piece step={2} className={`${styles.bubble} ${styles.bubbleHint}`}>
        <Icon name="lightbulb" size={22} />
        {pl.guidance.hint.pickupConveyor}
      </Piece>
    </div>
  );
}

const STARS = [1, 2, 3] as const;

/** The end: the Kolegium card with a stamped folder and three stars. */
function KolegiumArt() {
  return (
    <div className={`${styles.kit} ${styles.kitColumn}`} data-art="kolegium">
      <Piece step={0} className={styles.kolegium}>
        <span className={styles.kolegiumTitle}>
          <Icon name="book" size={26} />
          {pl.debrief.title}
        </span>
        <span className={styles.row}>
          <Icon name="photo" size={36} className={styles.cardIcon ?? ''} />
          <VerdictStamp kind="publishWithContext" size="sm" />
          <span className={`${styles.badge} ${styles.badgeGood} ${styles.badgeInline}`}>
            <Icon name="check" size={22} />
          </span>
        </span>
      </Piece>
      <span className={styles.row}>
        {STARS.map((step) => (
          <Piece key={step} step={step} className={styles.star}>
            <HudGlyph name="star" size={52} fill="var(--yellow)" />
          </Piece>
        ))}
      </span>
    </div>
  );
}
