// drei's Html renders its children in a separate React root, which does not inherit context:
// this wrapper hands the GameView on (S7-85), so DOM markers read the view they belong to.
import { Html } from '@react-three/drei';
import type { ComponentProps } from 'react';
import { GameViewProvider, useGameView } from '../net/view-context.tsx';

export function ViewHtml({ children, ...props }: ComponentProps<typeof Html>) {
  const view = useGameView();
  return (
    <Html {...props}>
      <GameViewProvider view={view}>{children}</GameViewProvider>
    </Html>
  );
}
