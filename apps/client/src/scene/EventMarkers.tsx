// Level event markers in the world (S4-05..S4-09), all DOM via drei Html (no draw calls):
// - viral: share and heart icons floating up off the folder, plus the growing share counter;
// - bossCall: a red ringing phone over the folder with the seconds left, and the same phone
//   shaking over the editorial desk where the call comes in;
// - botRaid: a bot chip with a glitch ghost on every folder of the wave;
// - correction: a siren light over the folder.
// The markers follow the rendered folder (scene group `folder:<id>`), so they ride along while
// a player carries it. Everything loops only without reduced motion / no-flash (see the CSS).
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { tileCenter } from '@redakcja/shared';
import { useMemo, useRef } from 'react';
import { type Group, Vector3 } from 'three';
import { useShallow } from 'zustand/react/shallow';
import { tagBadge } from '../events/event-model.ts';
import { useLevelClock } from '../hud/use-level-clock.ts';
import { useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './EventMarkers.module.css';
import { surfaceHeight } from './entities.ts';

/** Height of the marker's anchor above the folder. */
const MARKER_LIFT = 0.95;
/** Height of the phone above the editorial desk's surface. */
const DESK_PHONE_LIFT = 0.9;

/** Tagged folders as `id|kind` strings, stable across snapshots that change nothing here. */
function useTaggedFolders(): { id: string; kind: string }[] {
  const keys = useGame(
    useShallow((s) => s.folders.filter((f) => f.tag).map((f) => `${f.id}|${f.tag?.kind}`)),
  );
  return useMemo(
    () =>
      keys.map((key) => {
        const [id = '', kind = ''] = key.split('|');
        return { id, kind };
      }),
    [keys],
  );
}

export function EventMarkers() {
  const tagged = useTaggedFolders();
  const bossActive = useGame((s) =>
    s.folders.some((f) => f.tag?.kind === 'bossCall' && f.tag.untilMs > s.elapsedMs),
  );
  return (
    <>
      {tagged.map(({ id }) => (
        <FolderMarker key={id} id={id} />
      ))}
      {bossActive && <DeskPhone />}
    </>
  );
}

const worldPoint = new Vector3();

function FolderMarker({ id }: { id: string }) {
  const anchor = useRef<Group>(null);
  const scene = useThree((s) => s.scene);
  const folder = useGame((s) => s.folders.find((f) => f.id === id));
  // Folders of the same bot wave as this one (1 for any other folder).
  const raidSize = useGame((s) => {
    const tag = s.folders.find((f) => f.id === id)?.tag;
    return tag?.kind === 'botRaid'
      ? s.folders.filter((f) => f.tag?.kind === 'botRaid' && f.tag.raidId === tag.raidId).length
      : 1;
  });
  const { elapsedMs } = useLevelClock();
  const badge = folder ? tagBadge(folder, elapsedMs, () => raidSize) : null;

  useFrame(() => {
    const group = scene.getObjectByName(`folder:${id}`);
    if (group && anchor.current) {
      group.getWorldPosition(worldPoint);
      anchor.current.position.set(worldPoint.x, worldPoint.y, worldPoint.z);
    }
  });

  if (!badge) {
    return null;
  }
  return (
    <group ref={anchor} name={`event-marker:${id}`}>
      <Html position={[0, MARKER_LIFT, 0]} center zIndexRange={[9, 1]} className={styles.wrap}>
        <div
          className={styles.marker}
          data-kind={badge.kind}
          data-testid={`event-marker-${badge.kind}`}
        >
          {badge.kind === 'viral' && (
            <span className={styles.floaters} aria-hidden="true">
              <span className={styles.floater} style={{ '--i': 0 } as React.CSSProperties}>
                <Icon
                  name="heart"
                  size={22}
                  style={{ '--icon-fill': 'var(--red)' } as React.CSSProperties}
                />
              </span>
              <span className={styles.floater} style={{ '--i': 1 } as React.CSSProperties}>
                <Icon
                  name="share"
                  size={22}
                  style={{ '--icon-fill': 'var(--orange)' } as React.CSSProperties}
                />
              </span>
              <span className={styles.floater} style={{ '--i': 2 } as React.CSSProperties}>
                <Icon
                  name="heart"
                  size={22}
                  style={{ '--icon-fill': 'var(--red)' } as React.CSSProperties}
                />
              </span>
            </span>
          )}
          <span
            className={`${styles.chip} ${styles[badge.tone]} ${badge.urgent ? styles.urgent : ''}`}
            role="img"
            aria-label={badge.label}
          >
            {badge.kind === 'botRaid' ? (
              <span className={styles.glitch}>
                <Icon name="bot" size={24} />
              </span>
            ) : (
              <span className={badge.kind === 'bossCall' ? styles.ringing : styles.siren}>
                <Icon name={badge.icon} size={24} />
              </span>
            )}
            {badge.text && <span aria-hidden="true">{badge.text}</span>}
          </span>
        </div>
      </Html>
    </group>
  );
}

/** The red phone ringing on the first editorial desk while a boss call stands. */
function DeskPhone() {
  const position = useMemo<[number, number, number]>(() => {
    const desk = runtime.map.fixtures.find((f) => f.kind === 'desk');
    if (!desk) {
      return [0, DESK_PHONE_LIFT, 0];
    }
    const center = tileCenter(desk.col, desk.row);
    return [center.x, surfaceHeight(desk) + DESK_PHONE_LIFT, center.y];
  }, []);
  return (
    <group position={position} name="event-desk-phone">
      <Html center zIndexRange={[9, 1]} className={styles.wrap}>
        <span className={styles.deskPhone} data-testid="event-desk-phone">
          <span className={styles.deskPhoneIcon}>
            <Icon name="phone" size={30} />
          </span>
        </span>
      </Html>
    </group>
  );
}
