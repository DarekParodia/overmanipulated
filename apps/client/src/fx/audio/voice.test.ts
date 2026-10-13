import { describe, expect, it } from 'bun:test';
import { loadSettings, type Settings } from '../../store/settings.ts';
import { createDucker } from './duck.ts';
import {
  createVoicePlayer,
  playVoice,
  VOICE_LOAD_TIMEOUT_MS,
  VOICE_SOURCES,
  type VoiceBackend,
  type VoiceClips,
  voiceStatus,
} from './voice.ts';

const CLIPS: VoiceClips = {
  welcome: { startMs: 0, durationMs: 4000 },
  folders: { startMs: 4120, durationMs: 6000 },
};

type FakeState = {
  loadDone: ((ok: boolean) => void) | null;
  decoded: boolean;
  locked: boolean;
  settings: Settings;
  now: number;
  timers: { ms: number; fn: () => void }[];
  played: { id: string; volume: number; handle: number }[];
  stopped: number[];
  volumes: Map<number, number>;
  ends: Map<number, () => void>;
};

function setup() {
  const state: FakeState = {
    loadDone: null,
    decoded: false,
    locked: false,
    settings: loadSettings(null),
    now: 1000,
    timers: [],
    played: [],
    stopped: [],
    volumes: new Map(),
    ends: new Map(),
  };
  let nextHandle = 1;
  const backend: VoiceBackend = {
    load(_clips, done) {
      state.loadDone = (ok) => {
        state.decoded = ok;
        done(ok);
      };
    },
    loaded: () => state.decoded,
    play(id, volume, onEnd) {
      const handle = nextHandle++;
      state.played.push({ id, volume, handle });
      state.ends.set(handle, onEnd);
      return handle;
    },
    stop(handle) {
      state.stopped.push(handle);
      state.ends.delete(handle);
    },
    setVolume(handle, volume) {
      state.volumes.set(handle, volume);
    },
    locked: () => state.locked,
    settings: () => state.settings,
    now: () => state.now,
    after(ms, fn) {
      state.timers.push({ ms, fn });
    },
  };
  const ducker = createDucker();
  const player = createVoicePlayer(backend, ducker);
  /** Loads the clips and finishes decoding them. */
  const ready = () => {
    void player.load(CLIPS);
    state.loadDone?.(true);
  };
  return { state, ducker, player, ready };
}

describe('voice player: no-op cases (the intro keeps its fallback timer)', () => {
  it('does nothing before the sprite is loaded', () => {
    const { state, ducker, player } = setup();
    expect(player.status()).toBe('unloaded');
    let ended = 0;
    const stop = player.play('welcome', () => ended++);
    stop();
    void player.load(CLIPS);
    expect(player.status()).toBe('unloaded');
    player.play('welcome', () => ended++);
    expect(state.played).toEqual([]);
    expect(state.stopped).toEqual([]);
    expect(ended).toBe(0);
    expect(ducker.step(1500, 10)).toBe(1);
  });

  it('does nothing when muted, or when the voice bus is silent', () => {
    const { state, ducker, player, ready } = setup();
    ready();
    const defaults = loadSettings(null);
    for (const settings of [
      { ...defaults, muted: true },
      { ...defaults, voiceVolume: 0 },
      { ...defaults, masterVolume: 0 },
    ]) {
      state.settings = settings;
      expect(player.status()).toBe('muted');
      let ended = 0;
      player.play('welcome', () => ended++)();
      expect(ended).toBe(0);
    }
    expect(state.played).toEqual([]);
    expect(ducker.step(1500, 10)).toBe(1);
  });

  it('does nothing while the browser still blocks audio', () => {
    const { state, player, ready } = setup();
    ready();
    state.locked = true;
    expect(player.status()).toBe('locked');
    player.play('welcome', () => {});
    expect(state.played).toEqual([]);
  });

  it('ignores a clip id the sprite does not have', () => {
    const { state, player, ready } = setup();
    ready();
    expect(player.status()).toBe('ready');
    player.play('roles.touch', () => {});
    expect(state.played).toEqual([]);
  });

  it('a module-level playVoice before loadVoice is a no-op', () => {
    expect(voiceStatus()).toBe('unloaded');
    let ended = 0;
    const stop = playVoice('welcome', () => ended++);
    stop();
    expect(ended).toBe(0);
  });
});

describe('voice player: playing', () => {
  it('plays a line on the voice bus and ducks the music to 0.3 for its length', () => {
    const { state, ducker, player, ready } = setup();
    ready();
    let ended = 0;
    player.play('welcome', () => ended++);
    expect(state.played).toHaveLength(1);
    expect(state.played[0]?.id).toBe('welcome');
    // master 0.8 × Lektor 0.9 × trim 1.
    expect(state.played[0]?.volume).toBeCloseTo(0.72);
    expect(ducker.step(1500, 10)).toBe(0.3);
    expect(ducker.step(1000 + 4000 + 1, 10)).toBe(1);
    state.ends.get(1)?.();
    expect(ended).toBe(1);
  });

  it('stops the previous line when the next one starts; only the newest stop counts', () => {
    const { state, ducker, player, ready } = setup();
    ready();
    const stopWelcome = player.play('welcome', () => {});
    const stopFolders = player.play('folders', () => {});
    expect(state.played.map((p) => p.id)).toEqual(['welcome', 'folders']);
    expect(state.stopped).toEqual([1]);
    stopWelcome();
    expect(state.stopped).toEqual([1]);
    expect(ducker.step(1500, 10)).toBe(0.3);
    stopFolders();
    expect(state.stopped).toEqual([1, 2]);
    // A line cut short lets the music back up at once, not at the clip's planned end.
    expect(ducker.step(1600, 10)).toBe(1);
  });

  it('forgets a line that ended by itself: the next one stops nothing', () => {
    const { state, player, ready } = setup();
    ready();
    let ended = 0;
    const stopWelcome = player.play('welcome', () => ended++);
    state.ends.get(1)?.();
    expect(ended).toBe(1);
    stopWelcome();
    player.applyVolume({ ...state.settings, voiceVolume: 0.5 });
    expect(state.stopped).toEqual([]);
    expect(state.volumes.size).toBe(0);
    player.play('folders', () => {});
    expect(state.stopped).toEqual([]);
    expect(state.played.map((p) => p.id)).toEqual(['welcome', 'folders']);
  });

  it('follows the Lektor slider while a line plays', () => {
    const { state, player, ready } = setup();
    ready();
    player.applyVolume({ ...state.settings, voiceVolume: 0.2 });
    expect(state.volumes.size).toBe(0);
    player.play('welcome', () => {});
    player.applyVolume({ ...state.settings, voiceVolume: 0.5 });
    expect(state.volumes.get(1)).toBeCloseTo(0.4);
    player.stop();
    player.applyVolume({ ...state.settings, voiceVolume: 1 });
    expect(state.volumes.get(1)).toBeCloseTo(0.4);
  });
});

describe('voice loading', () => {
  it('fetches both formats from /assets/voice', () => {
    expect(VOICE_SOURCES).toEqual(['/assets/voice/intro.webm', '/assets/voice/intro.mp3']);
  });

  it('resolves true once decoded, and loads only once', async () => {
    const { state, player } = setup();
    const first = player.load(CLIPS);
    expect(player.load(CLIPS)).toBe(first);
    state.loadDone?.(true);
    expect(await first).toBe(true);
    expect(player.status()).toBe('ready');
  });

  it('resolves false on a load error', async () => {
    const { state, player } = setup();
    const loading = player.load(CLIPS);
    state.loadDone?.(false);
    expect(await loading).toBe(false);
    expect(player.status()).toBe('unloaded');
  });

  it('gives up after 4000 ms, but a late load still plays', async () => {
    const { state, player } = setup();
    const loading = player.load(CLIPS);
    expect(VOICE_LOAD_TIMEOUT_MS).toBe(4000);
    expect(state.timers.map((t) => t.ms)).toEqual([4000]);
    state.timers[0]?.fn();
    expect(await loading).toBe(false);
    state.loadDone?.(true);
    expect(await loading).toBe(false);
    expect(player.status()).toBe('ready');
  });
});
