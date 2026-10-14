# Audio

All sound effects and music are synthesised from oscillators and filtered noise (no samples,
nothing to license). The one exception is the intro voiceover (see Voice): speech, made by
`synth_voice.py` from a volunteer recording (pending, see Voice). Generators live in
`tools/audio/` and need `numpy` and `ffmpeg`.

| Script | Produces |
| --- | --- |
| `synth_placeholders.py` | `public/assets/audio/sfx.{webm,mp3}` (one sprite) and `src/fx/audio/sfx-sprite.json` |
| `synth_music.py` | `public/assets/audio/music/*.{webm,mp3}` and `src/fx/audio/music-manifest.json` |
| `synth_voice.py` | `public/assets/voice/intro.{webm,mp3}` and the voice sprite `public/assets/voice/intro.json` (see Voice) |
| `voice-script.ts` (bun) | The clip table of `docs/voice-recording.pl.md` (the volunteer's recording script) |
| `measure.py` | Decodes the shipped files and prints peak/RMS per file and per bus; exits non-zero on clipping, missing files, out-of-window buses or a payload over budget |

Run the generators, then `python3 tools/audio/measure.py`. Sprite offsets change whenever a sound's
length changes; the json is regenerated together with the audio, so never edit it by hand.

## Sound ids (sprite)

Ids are stable: existing ids keep their meaning, new ids are appended at the end of `SOUNDS`.
Cues (`apps/client/src/fx/cues.ts`) are the only thing gameplay code uses; they name sprite ids.

- UI: `click hover back copy slide deskopen ping1 ping2 ping3`
- Room: `join leave start step1 step2`
- Gameplay: `arrive rustle place warn tick buzzer keys fail chime fanfare hmm`
- Stingers: `stamp alarm lowsting lastsec win lose`
- Level events: `evviral evboss evraid evoutage evcorrection evclear evback evzap`
- Beds (loops): `roomtone`, `keys` (station typing), `ambchatter` (voice-less newsroom chatter)
- Ambience one-shots: `ambphone ambprinter ambfax ambtyping`

Every sound passes through `finish()` in the synth script: 1.5 ms fade-in, 8 ms fade-out (loops are
left alone so they stay seamless), a loudness target per class, and a soft peak ceiling of 0.9.

## Music

Eight sets, all mono and 16 bars, with a calm and a pressure layer that share tempo and key (so they
can be cross-faded in sync) and loop seamlessly. Files are `menu`, `<set>` (calm) and
`<set>-pressure`, lazily fetched: the menu loop after the first gesture, a level's pair when that
level starts (`trackSetForLevel` in `music-intensity.ts`; unknown ids and the greybox use `l1`).

| Set | Key | BPM | Character |
| --- | --- | --- | --- |
| menu | D minor | 104 | Rhodes, upright bass, brushes (noir jazz) |
| l1 | D minor | 104 | walking bass, muted piano, ride; typewriter and snare under pressure |
| l2 | A major | 112 | marimba arpeggios, pizzicato bass, shaker; wood-block clock and claps |
| l3 | E minor | 120 | plucked synth arpeggio, sub bass, four on the floor; 16th pulse and risers |
| l4 | G dorian | 98 | clavinet, slap bass, swung funk; wah-like riff and brass stabs |
| l5 | C minor | 126 | detuned string pad, heartbeat kick, eerie bells; glitch ticks |
| l6 | F# minor | 132 | taiko, staccato strings, drone; brass stabs and snare rolls |
| endless | Bb minor | 116 | pulse bass, bell arpeggio, pad; dense 16ths |

Runtime (`music.ts`): scenes (menu/game) cross-fade at 0.7 gain/s and only fade in once their files
are decoded. In game, `targetIntensity` (last minute and urgent folders) drives the pressure
layer while the calm layer dips by 35 % at full intensity (`layerGains`), so the sum stays level. The
last 30 s raise the playback rate by 6 %. Stingers listed in `duck.ts` dip the music to 45 % (for the sprite length of the sound, if audible) while
they ring. Intro voice lines dip it deeper, to 30 % (`DUCK_TUNING.voiceDepth`, see Voice). When dips
overlap the lowest depth wins, and a voice line cut short releases its dip at once.

## Buses and mix

Four buses, each with its own slider under Ustawienia → Dźwięk: `music` (Muzyka), `sfx` (Efekty),
`ui` (Przyciski) and `voice` (Lektor, the intro voiceover only). Effective volume =
`busVolume(settings, bus)` = master x bus slider x `BUS_TRIM[bus]` (`mix.ts`: music 1, sfx 1, ui 0.9,
voice 1) x cue `volume`. The master output goes through a limiter (DynamicsCompressor, threshold
-9 dB, knee 6 dB, ratio 12, attack 3 ms, release 180 ms) installed by `installMasterLimiter()` in
`limiter.ts`.

Loudness targets (RMS over the audible part of a file, dBFS, before any volume):

| Class | Target | Examples |
| --- | --- | --- |
| music calm / menu | -21 | all `<set>` files, `menu` |
| music pressure | -23 | all `<set>-pressure` files (layered on top of calm) |
| heavy | -19 | stamp, buzzer, alarms, win/lose/fanfare, level events |
| fx | -22 | steps, rustle, place, ticks, bells, join/leave |
| ui | -26 | click, hover, back, copy, pings, slide |
| ambience one-shots | -24 | phone, printer, fax, typing (cues play them at about 0.3) |
| beds | -34 | `roomtone`, `ambchatter` |

Peaks stay below -3 dBFS for music and -4.4 dBFS for effects. With the default sliders
(master 0.8, music 0.6, sfx 0.9) music sits about 5 dB under the one-shots. `measure.py` checks
each bus' in-game spread against a window.

## Chatter and ducking

`ambchatter` is a 10 s loop of syllable-like blips (a buzzy source through vowel formants, three
"speakers") over a muffled murmur; no words. It plays during a level at `CHATTER.level` of the sfx
volume, follows the ambience duck down to 15 % under station/desk overlays and the results screen,
and is off entirely in reduced-audio setups (`reducedAudio`: muted, the effective quality preset is `low` (Auto resolved), or
master x sfx volume below 0.12).

## Voice

The intro voiceover (S7-99 to S7-102) plays on the `voice` bus. Its slider, Lektor
(`settings.voiceVolume`), defaults to 0.9, so a line plays at 0.72 with the default master. No cue
uses the bus: the intro subtitles every line, so voice lines are not cues and need no captions.
`fx/audio/voice.ts` holds the runtime:

- `loadVoice(clips)` creates one Howl over `/assets/voice/intro.webm` and `intro.mp3` with the clip
  table of the voice sprite json. It resolves true once decoded, and false on a load error or after
  4 s (`VOICE_LOAD_TIMEOUT_MS`). A load that lands later still plays. Nothing is fetched before the
  call, and never in the first-load path.
- `voiceStatus()` is `unloaded`, `muted` (global mute, or master x Lektor at 0), `locked` (no user
  gesture on the page yet: `navigator.userActivation`, else Howler's audio context state) or
  `ready`.
- `playVoice(id, onEnd)` plays one line, stops the previous one, and dips the music to 30 % for the
  clip's length. Unless the status is `ready` it does nothing and `onEnd` never runs: the intro keeps
  its fallback timer and the subtitles carry the line. It returns a function that stops the line;
  `stopVoice()` stops whatever is playing. A stopped line releases its dip at once.
- `applyVoiceVolume(settings)` runs from `initAudio`'s settings subscription, so moving the slider
  reaches a line that is playing.

The lines come from the intro script (S7-99, `apps/client/src/intro/intro-script.ts`, words in
`pl.intro.voice`): 17 clips, ids such as `welcome` or `pickup.touch`.
`bun tools/audio/intro-lines.ts` prints them as JSON (`{clipId: {subtitle, tts, textSha1}}`) for the
generator; `tts` is the subtitle with plain spaces, no quotes and the key names respelled
(`PRONOUNCE`), and `textSha1`, the sha1 of the subtitle's words (`voiceText`: NFC, runs of spaces
collapsed, so typographic spacing never makes a clip stale).

### Generating the voice (`synth_voice.py`)

**Status: waiting for the volunteer recording ([`docs/voice-recording.pl.md`](voice-recording.pl.md)).**
The voice is a volunteer recording released under CC0 (user decision 2026-10-13, Decision log): no
TTS voice passed the licence audit below, so none is generated. Until the files exist the intro
runs on subtitles and fallback timing alone: `loadIntroVoice()` (`intro/voice-sprite.ts`) finds no
sprite and resolves false, `measure.py` reports the voice as not generated, and
`voice-sync.test.ts` only checks that no audio ships without its sprite.

`docs/voice-recording.pl.md` (Polish) is the guide for the volunteer and the teacher: who may
record (a parent or guardian also signs for a minor), the table of the 17 clips, the recording
requirements (WAV, mono, 44.1 or 48 kHz, 16 or 24-bit, one `<clipId>.wav` per clip, about
2 min 15 s of speech at most), re-recording rules, how to send the takes, and the CC0 dedication
and consent form. Its clip table (file, who hears it, exact subtitle, key-name respellings from
`PRONOUNCE`, rough length at `INTRO_WORD_MS` per word) is a generated section:
`bun tools/audio/voice-script.ts` rewrites it from the line export, and `voice-script.test.ts`
fails while it is stale. Once the takes are in, run the generator and commit the three files
together with the CREDITS row:

```
python3 tools/audio/synth_voice.py --recordings DIR --licence self-recorded-CC0 --credit 'NAME'
python3 tools/audio/measure.py && bun test apps/client/src/intro tools/audio
```

`DIR/<clipId>.wav` holds one take per clip (17: the ids `bun tools/audio/intro-lines.ts` prints).
The sprite's `voice` label defaults to the neutral `ochotnik-1` (`--voice LABEL` overrides it;
never the volunteer's name); `NAME` is the credit the
volunteer chose on the form (`anonimowy ochotnik` when anonymous). The raw WAVs and the signed
form never go into the repository. `--model PATH --voice LABEL --licence L [--credit TEXT]` uses
an offline Piper voice instead (`pip install piper-tts==1.8.0`), and `--voice NAME` downloads one
listed in the tool's `VOICES` table, checked against pinned SHA-256 values; both only for a voice
whose whole chain passed the audit below.

Every take gets the same treatment: silence below -45 dBFS trimmed (40 ms kept around speech),
10 ms fades, -20 dBFS RMS over the audible part with the peak at or under -3 dBFS. Clips are
joined with a 120 ms gap and encoded as `intro.webm` (Opus, mono, 24 kbps, VoIP tuning) and
`intro.mp3` (mono, 22.05 kHz, 40 kbps). The tool writes nothing when either file would exceed
`VOICE_MAX_BYTES` (700 000 bytes; a trial run of 117 s of speech gave 345 KiB webm and 570 KiB
mp3). Its sprite json is `{voice, source: 'tts' | 'recording', licence, credit?, clips: {[id]:
{startMs, durationMs, textSha1}}}`, validated by `voiceSpriteSchema` when the intro fetches it.
It is fetched at runtime from `/assets/voice/intro.json`, not imported, so the build never depends
on a file that may not exist and the json stays beside its audio.

Checks: `voice-sync.test.ts` fails when a clip of the script is missing from the sprite, when its
words changed since generation ("clip X out of date: run python3 tools/audio/synth_voice.py"),
when the sprite has unknown or overlapping clips, or when a file is missing or over the cap.
`measure.py` checks each clip against the voice window (-24 to -16 dBFS RMS) and the size cap.

### Licence audit (2026-10-13)

Only a voice whose whole chain (dataset and every checkpoint it was fine-tuned from) allows
redistribution and commercial use may be generated; the sprite's `licence` field only accepts
`CC0-1.0`, `CC-BY-4.0`, `MIT` or `self-recorded-CC0`, so a non-commercial voice cannot ship.
Sources: the Piper model cards (`raw.githubusercontent.com/rhasspy/piper-samples/.../MODEL_CARD`),
the OHF-Voice voice-datasets README, the MBROLA voices licence, the Arch Linux RHVoice packages and
the Piper licensing discussion (rhasspy/piper #271); the CSTR licence page itself was unreachable.

| Candidate | Chain | Verdict |
| --- | --- | --- |
| Piper `pl_PL-darkman-medium`, `gosia-medium` | dataset CC0 (OHF-Voice/NabuCasa voice-datasets) ← fine-tuned from `en_US-lessac-medium` ← Blizzard 2013 Lessac data: a research licence agreement, no commercial use | Blocked |
| Piper `pl_PL-mc_speech-medium` | MC Speech dataset CC0 ← fine-tuned from `en_US-lessac-medium` (as above) | Blocked |
| Piper `pl_PL-mls_6892-low` | MLS speaker 6892 (OpenSLR 94, CC BY 4.0) ← fine-tuned from `en_US-ryan-low` ← RyanSpeech, CC BY-NC-SA 4.0 | Blocked |
| RHVoice Polish (Magda, Natan…) | voices CC BY-NC-ND 4.0 | Blocked |
| eSpeak NG + MBROLA `pl1` | MBROLA databases: use only with the MBROLA program, not in a product that is sold without the author's permission | Blocked |
| eSpeak NG (formant synthesis, no recorded data) | GPL-3.0-or-later program; its output is not covered | Allowed, rejected on quality: a robotic voice for a 75 s narrated intro |
| Volunteer recording, `--recordings` | the volunteer releases the takes under CC0 | **Chosen** |

The Piper program (piper-tts 1.8.0, GPL-3.0-or-later) only runs offline; nothing from it ships.
A Piper voice trained from scratch on a CC0 dataset (e.g. darkman, without the lessac
checkpoint) would pass; it goes in through `--model` once its own audit is recorded.

## Budget

Whole payload (both formats are shipped, a browser loads one): webm about 2.2 MB, mp3 about 2.1 MB;
limit 2.5 MB. Only the sfx sprite (about 170 KB) is in the first-load path; music is fetched lazily.
The intro voice has its own cap (each of `intro.webm` / `intro.mp3` at most 700 000 bytes) and is
fetched only when the intro asks for it, never in the first-load path.
