# Audio

All audio is synthesised from oscillators and filtered noise (no samples, nothing to license).
Generators live in `tools/audio/` and need `numpy` and `ffmpeg`.

| Script | Produces |
| --- | --- |
| `synth_placeholders.py` | `public/assets/audio/sfx.{webm,mp3}` (one sprite) and `src/fx/audio/sfx-sprite.json` |
| `synth_music.py` | `public/assets/audio/music/*.{webm,mp3}` and `src/fx/audio/music-manifest.json` |
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
they ring.

## Buses and mix

Effective volume = master x bus slider x `BUS_TRIM[bus]` (`mix.ts`: music 1, sfx 1, ui 0.9) x cue
`volume`. The master output goes through a limiter (DynamicsCompressor, threshold -9 dB, knee 6 dB,
ratio 12, attack 3 ms, release 180 ms) installed by `installMasterLimiter()` in `audio-manager.ts`.

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

## Budget

Whole payload (both formats are shipped, a browser loads one): webm about 2.2 MB, mp3 about 2.1 MB;
limit 2.5 MB. Only the sfx sprite (about 170 KB) is in the first-load path; music is fetched lazily.
