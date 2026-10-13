// The master limiter (S5-08): a fast DynamicsCompressor between Howler's gain stage and the
// speakers. Its own module so every Howl owner (sfx, music, voice) can install it without
// importing the others.
import { Howler } from 'howler';
import { LIMITER } from './mix.ts';

let limiterInstalled = false;

/**
 * Puts a limiter (a fast DynamicsCompressor) between Howler's gain stage and the speakers, so
 * stacked stingers and the music never clip. Safe to call repeatedly; call after the first Howl
 * exists (that is when Howler creates its audio context).
 */
export function installMasterLimiter(): void {
  const ctx = Howler.ctx;
  const gainStage = Howler.masterGain;
  if (limiterInstalled || !Howler.usingWebAudio || !ctx || !gainStage) {
    return;
  }
  limiterInstalled = true;
  try {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = LIMITER.thresholdDb;
    limiter.knee.value = LIMITER.kneeDb;
    limiter.ratio.value = LIMITER.ratio;
    limiter.attack.value = LIMITER.attackS;
    limiter.release.value = LIMITER.releaseS;
    gainStage.disconnect();
    gainStage.connect(limiter);
    limiter.connect(ctx.destination);
  } catch {
    // Without a limiter the audio still plays: drop any half-built path, go straight to the output.
    try {
      gainStage.disconnect();
      gainStage.connect(ctx.destination);
    } catch {
      // Nothing more to do.
    }
  }
}
