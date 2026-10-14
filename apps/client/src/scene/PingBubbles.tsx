// Ping bubbles (S2-11): a short torn speech slip above the player who pinged, for
// PING_DURATION_MS. DOM via drei Html (no extra draw calls); the anchor follows the rendered
// player position every frame. Only players with an active ping get an anchor. The bubbles are
// the GameView's own (S7-85).
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Group } from 'three';
import { useStore } from 'zustand';
import { useGameView, useViewRoster } from '../net/view-context.tsx';
import type { PingBubble } from '../pings/bubble-store.ts';
import styles from '../pings/PingBubble.module.css';
import { pl } from '../strings/pl.ts';
import { PlayerMark } from '../ui/PlayerMark.tsx';
import { playerColorVar } from '../ui/tokens.ts';
import { ViewHtml } from './ViewHtml.tsx';

/** Height of the bubble's anchor above the floor (above the name strip). */
const BUBBLE_HEIGHT = 1.95;

export function PingBubbles() {
  const view = useGameView();
  const bubbles = useStore(view.bubbles.use, (s) => s.bubbles);
  const players = useViewRoster();

  useEffect(() => {
    const unsubscribe = view.bus.on((event) => {
      if (event.kind !== 'ping') {
        return;
      }
      // The sound and particles come from the event cue (net/game-events.ts).
      view.bubbles.show(event.playerId, event.ping);
    });
    return () => {
      unsubscribe();
      view.bubbles.clear();
    };
  }, [view]);

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
  const { render } = useGameView();
  const anchor = useRef<Group>(null);
  const start = render.players.get(playerId);

  useFrame(() => {
    const player = render.players.get(playerId);
    const group = anchor.current;
    if (group && player) {
      group.position.set(player.x, 0, player.y);
    }
  });

  return (
    <group ref={anchor} name={`ping:${playerId}`} position={[start?.x ?? 0, 0, start?.y ?? 0]}>
      <ViewHtml
        position={[0, BUBBLE_HEIGHT, 0]}
        center
        zIndexRange={[11, 1]}
        className={styles.wrap}
      >
        <p
          key={bubble.seq}
          className={`${styles.bubble} ${styles[bubble.ping]}`}
          style={{ borderColor: playerColorVar(colorIndex) }}
          data-testid="ping-bubble"
          data-player-id={playerId}
          data-ping={bubble.ping}
          role="status"
        >
          <PlayerMark colorIndex={colorIndex} size={20} />
          {pl.vocab.pings[bubble.ping]}
        </p>
      </ViewHtml>
    </group>
  );
}
