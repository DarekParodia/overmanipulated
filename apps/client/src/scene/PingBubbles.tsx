// Ping bubbles (S2-11): a short torn speech slip above the player who pinged, for
// PING_DURATION_MS. DOM via drei Html (no extra draw calls); the anchor follows the rendered
// player position every frame. Only players with an active ping get an anchor.
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Group } from 'three';
import { onGameEvent } from '../net/game-events.ts';
import {
  clearPingBubbles,
  type PingBubble,
  showPingBubble,
  usePingBubbles,
} from '../pings/bubble-store.ts';
import styles from '../pings/PingBubble.module.css';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { playerColorVar } from '../ui/tokens.ts';
import { renderState } from './render-state.ts';

/** Height of the bubble's anchor above the floor (above the name strip). */
const BUBBLE_HEIGHT = 1.95;

export function PingBubbles() {
  const bubbles = usePingBubbles((s) => s.bubbles);
  const players = useApp((s) => s.room?.players);

  useEffect(() => {
    const unsubscribe = onGameEvent((event) => {
      if (event.kind !== 'ping') {
        return;
      }
      // The sound and particles come from the event cue (net/game-events.ts).
      showPingBubble(event.playerId, event.ping);
    });
    return () => {
      unsubscribe();
      clearPingBubbles();
    };
  }, []);

  return (
    <>
      {Object.entries(bubbles).map(([playerId, bubble]) => {
        const player = players?.find((p) => p.id === playerId);
        return player ? (
          <BubbleAnchor
            key={playerId}
            playerId={playerId}
            colorIndex={player.colorIndex}
            bubble={bubble}
          />
        ) : null;
      })}
    </>
  );
}

function BubbleAnchor({
  playerId,
  colorIndex,
  bubble,
}: {
  playerId: string;
  colorIndex: number;
  bubble: PingBubble;
}) {
  const anchor = useRef<Group>(null);
  const start = renderState.players.get(playerId);

  useFrame(() => {
    const player = renderState.players.get(playerId);
    const group = anchor.current;
    if (group && player) {
      group.position.set(player.x, 0, player.y);
    }
  });

  return (
    <group ref={anchor} name={`ping:${playerId}`} position={[start?.x ?? 0, 0, start?.y ?? 0]}>
      <Html position={[0, BUBBLE_HEIGHT, 0]} center zIndexRange={[11, 1]} className={styles.wrap}>
        <p
          key={bubble.seq}
          className={`${styles.bubble} ${styles[bubble.ping]}`}
          style={{ borderColor: playerColorVar(colorIndex) }}
          data-testid="ping-bubble"
          data-player-id={playerId}
          data-ping={bubble.ping}
          role="status"
        >
          {pl.vocab.pings[bubble.ping]}
        </p>
      </Html>
    </group>
  );
}
