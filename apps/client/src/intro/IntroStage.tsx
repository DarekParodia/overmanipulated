// The intro's live newsroom (S7-101): the game's own renderer drawing the intro's GameView in a
// small canvas inside the „Jak grać” dialog, with the scene's UI-kit callout beside it (above on
// desktop, to the left on a landscape phone), never over the newsroom. A lazy
// chunk of its own: the renderer, three.js and the HUD cards the callouts borrow already belong
// to the game route (tools/perf/check-bundle.ts counts a chunk once), and the dialog's other tabs
// never load them. Not the primary canvas: it does not probe the GPU, adapt the quality or install
// the debug hooks of a match. A renderer that fails (no WebGL) leaves the callout on its own. The
// intro's GameView (intro-view.ts) and its sim are made here, so they load with the renderer.
import { Component, type ReactNode, useState } from 'react';
import { GameCanvas } from '../scene/GameCanvas.tsx';
import type { InputDevice } from '../store/app.ts';
import styles from './Intro.module.css';
import { Callout } from './IntroCallouts.tsx';
import type { IntroArt } from './intro-script.ts';
import { createIntroView, type IntroClock } from './intro-view.ts';

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export type IntroStageProps = {
  /** The gameplay scene's track and time; the stage's own sim follows it. */
  clock: () => IntroClock;
  /** The callout of the scene on stage; it changes per scene while the canvas stays. */
  callout: IntroArt;
  /** Key of the scene, so each scene's callout pops in afresh. */
  sceneKey: string;
  device: InputDevice;
};

export function IntroStage({ clock, callout, sceneKey, device }: IntroStageProps) {
  // One view while the gameplay scenes follow each other; the clock says which track to play.
  const [view] = useState(() => createIntroView(clock));
  return (
    <div className={styles.engine} data-testid="intro-engine">
      <div key={sceneKey} className={styles.calloutSlot}>
        <Callout art={callout} view={view} device={device} />
      </div>
      <div className={styles.canvasSlot}>
        <CanvasBoundary>
          <GameCanvas view={view} primary={false} viewKey="intro" />
        </CanvasBoundary>
      </div>
    </div>
  );
}
