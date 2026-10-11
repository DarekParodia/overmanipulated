// The lazy game screen (three.js, the scene, stations). One import promise shared by the
// React.lazy in App and the preloader, so the chunk is requested exactly once.
let promise: Promise<typeof import('../screens/GameScreen.tsx')> | null = null;

export function loadGameScreen(): Promise<typeof import('../screens/GameScreen.tsx')> {
  promise ??= import('../screens/GameScreen.tsx');
  return promise;
}
