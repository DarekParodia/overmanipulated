// Landmark glyphs for the Mapa minigame (S7-55): ten flat silhouettes on a 24×24 grid, solid navy
// with white cut-outs (windows, a clock face, a door). They are told apart by shape alone — every
// glyph uses the same two token colours — so a colour-blind player matches them just as well.
// The same glyph is drawn small on the map tiles and large in the folder's photo.
import { memo, type ReactNode } from 'react';
import type { Landmark } from './geolocation.logic.ts';

/** The glyph grid: every shape fits a 24×24 box standing on y = 22. */
export const GLYPH_SIZE = 24;

const INK = 'var(--outline)';
const CUT = 'var(--surface)';
const ink = { fill: INK };
const cut = { fill: CUT };
const line = {
  fill: 'none',
  stroke: INK,
  strokeWidth: 1.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const GLYPHS: Record<Landmark, ReactNode> = {
  /** Square tower with a pointed roof and a round clock face. */
  clockTower: (
    <>
      <polygon points="7,8.5 12,1.5 17,8.5" {...ink} />
      <rect x={8.5} y={8} width={7} height={14} {...ink} />
      <rect x={7} y={19.5} width={10} height={2.5} {...ink} />
      <circle cx={12} cy={12} r={2.4} {...cut} />
      <path d="M12 12V10.5M12 12h1.3" {...line} strokeWidth={0.9} />
    </>
  ),
  /** One big arch under a flat deck with a railing. */
  archBridge: (
    <>
      <path d="M1 10.5H23V13H22V22H18.5A6.5 6.5 0 0 0 5.5 22H2V13H1Z" {...ink} />
      <rect x={2} y={7} width={20} height={1.2} {...ink} />
      {[3, 7.2, 11.4, 15.6, 19.8].map((x) => (
        <rect key={x} x={x} y={7} width={1.2} height={3.5} {...ink} />
      ))}
    </>
  ),
  /** Wide basin, a bowl on a stem and a drop of water on top. */
  fountain: (
    <>
      <path d="M2.5 17H21.5L20 22H4Z" {...ink} />
      <rect x={10.8} y={11} width={2.4} height={6} {...ink} />
      <path d="M7 10.5H17L15.5 13H8.5Z" {...ink} />
      <path
        d="M12 2.5C13.8 5 14.6 6.5 14.6 7.6a2.6 2.6 0 0 1-5.2 0C9.4 6.5 10.2 5 12 2.5Z"
        {...ink}
      />
    </>
  ),
  /** A shelter (roof on two posts, a bench) and a round stop sign on a pole. */
  tramStop: (
    <>
      <rect x={1.5} y={6} width={15} height={2.6} rx={0.6} {...ink} />
      <rect x={2.5} y={8.6} width={1.8} height={13.4} {...ink} />
      <rect x={13.7} y={8.6} width={1.8} height={13.4} {...ink} />
      <rect x={4.3} y={16} width={9.4} height={1.6} {...ink} />
      <rect x={19.6} y={6} width={1.6} height={16} {...ink} />
      <circle cx={20.4} cy={5.2} r={2.8} {...ink} />
      <circle cx={20.4} cy={5.2} r={1.2} {...cut} />
    </>
  ),
  /** Two spired towers with a gabled nave, a door and a round window between them. */
  twinChurch: (
    <>
      <polygon points="3,8 5.75,1 8.5,8" {...ink} />
      <polygon points="15.5,8 18.25,1 21,8" {...ink} />
      <rect x={3} y={8} width={5.5} height={14} {...ink} />
      <rect x={15.5} y={8} width={5.5} height={14} {...ink} />
      <path d="M8.5 22V13.5L12 10.5L15.5 13.5V22Z" {...ink} />
      <path d="M10.6 22V18.6a1.4 1.4 0 0 1 2.8 0V22Z" {...cut} />
      <circle cx={12} cy={14.5} r={1.1} {...cut} />
      <rect x={5} y={11} width={1.5} height={2.5} {...cut} />
      <rect x={17.5} y={11} width={1.5} height={2.5} {...cut} />
    </>
  ),
  /** A domed tank on three splayed legs with a cross brace. */
  waterTower: (
    <>
      <path d="M5 11.5V7.5C5 4.5 8 3 12 3S19 4.5 19 7.5V11.5Z" {...ink} />
      <rect x={5} y={8} width={14} height={0.9} {...cut} />
      <polygon points="6.5,11.5 8.5,11.5 7,22 4.5,22" {...ink} />
      <polygon points="15.5,11.5 17.5,11.5 19.5,22 17,22" {...ink} />
      <rect x={11} y={11.5} width={2} height={10.5} {...ink} />
      <rect x={6} y={16} width={12} height={1.2} {...ink} />
    </>
  ),
  /** A mast with a long jib, a cab, a counterweight and a hook on a cable. */
  portCrane: (
    <>
      <polygon points="5,3 6.5,0.8 8,3" {...ink} />
      <rect x={5} y={3} width={3} height={17} {...ink} />
      <rect x={2} y={3} width={20} height={2.4} {...ink} />
      <rect x={8} y={5.4} width={3.5} height={3} {...ink} />
      <rect x={2.4} y={5.4} width={2.4} height={2.4} {...ink} />
      <rect x={18.6} y={5.4} width={0.9} height={8} {...ink} />
      <rect x={17.3} y={13.4} width={3.5} height={2.6} {...ink} />
      <path d="M19 16v1.5a1.2 1.2 0 0 1-2.4 0" {...line} />
      <rect x={2} y={20} width={9.5} height={2} {...ink} />
    </>
  ),
  /** A tapered body under a cap with four sails crossed like an X. */
  windmill: (
    <>
      <polygon points="8.5,22 15.5,22 14.3,11 9.7,11" {...ink} />
      <path d="M9 11.2L12 8.2L15 11.2Z" {...ink} />
      <g transform="rotate(45 12 9.5)">
        <rect x={11} y={1} width={2} height={17} {...ink} />
        <rect x={3.5} y={8.5} width={17} height={2} {...ink} />
      </g>
      <circle cx={12} cy={9.5} r={1} {...cut} />
      <rect x={11} y={18.5} width={2} height={3.5} {...cut} />
    </>
  ),
  /** A tapered striped tower, a gallery, a lamp room and light rays. */
  lighthouse: (
    <>
      <polygon points="8.5,22 15.5,22 14.2,9 9.8,9" {...ink} />
      <polygon points="9.45,12.5 14.55,12.5 14.7,14 9.3,14" {...cut} />
      <polygon points="9,17 15,17 15.15,18.5 8.85,18.5" {...cut} />
      <rect x={8.5} y={8} width={7} height={1.4} {...ink} />
      <rect x={10} y={4.5} width={4} height={3.5} {...ink} />
      <rect x={10.9} y={5.3} width={2.2} height={2} {...cut} />
      <polygon points="9.5,4.6 12,1.6 14.5,4.6" {...ink} />
      <path d="M7.5 5.2 5 4.2M7.5 7.3 5 8.3M16.5 5.2 19 4.2M16.5 7.3 19 8.3" {...line} />
    </>
  ),
  /** A figure with a raised arm on a stepped pedestal with a plaque. */
  monument: (
    <>
      <rect x={4} y={19.5} width={16} height={2.5} {...ink} />
      <rect x={6.5} y={15.5} width={11} height={4} {...ink} />
      <rect x={9.5} y={16.8} width={5} height={1.4} {...cut} />
      <polygon points="10,15.5 14,15.5 13.6,8 10.4,8" {...ink} />
      <circle cx={12} cy={5.8} r={1.9} {...ink} />
      <polygon points="13.2,8.4 14.2,9.2 18,3.2 17,2.6" {...ink} />
    </>
  ),
};

/** The glyph's shapes on the 24×24 grid, for embedding in a larger SVG (the photo). */
export function LandmarkShape({ landmark }: { landmark: Landmark }) {
  return <g data-landmark={landmark}>{GLYPHS[landmark]}</g>;
}

/** A standalone glyph (the map tiles); decorative, the tile's label names the landmarks. */
export const LandmarkGlyph = memo(function LandmarkGlyph({
  landmark,
  className,
}: {
  landmark: Landmark;
  className?: string | undefined;
}) {
  return (
    <svg
      viewBox={`0 0 ${GLYPH_SIZE} ${GLYPH_SIZE}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <LandmarkShape landmark={landmark} />
    </svg>
  );
});
