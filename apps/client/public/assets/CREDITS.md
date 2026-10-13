# Asset credits

Every asset shipped with the game is listed here with its source and licence
(agents/design-rules.md, agents/game-feel.md). Allowed: CC0, self-made, and assets under
CC BY 4.0 or MIT with the attribution given here. Nothing non-commercial or research-only, and that
covers the whole chain of a generated asset (for a TTS voice: its dataset and every checkpoint it
was fine-tuned from).

| Asset | Path | Source | Licence |
| --- | --- | --- | --- |
| Sound effects, final pass (click, hover, back, copy, join, leave, step1–2, start, stamp, roomtone; gameplay: arrive, rustle, place, warn, tick, buzzer, keys, slide, fail, deskopen, chime, fanfare, hmm, alarm, lowsting, lastsec, win, lose, ping1–3; ambience: ambphone, ambprinter, ambfax, ambtyping, ambchatter voice-less chatter bed; level events: evviral, evboss, evraid, evoutage, evcorrection, evclear, evback, evzap) | `audio/sfx.webm`, `audio/sfx.mp3` | Self-made: synthesised by `tools/audio/synth_placeholders.py` | Project's own |
| Music: menu loop and per-level loops (levels 1–6 and endless), each a calm + pressure pair with its own key, tempo and instrumentation | `audio/music/*.webm`, `audio/music/*.mp3` | Self-made: synthesised by `tools/audio/synth_music.py` | Project's own |
| Intro voiceover — **not generated yet** (the intro runs on subtitles and fallback timing until it is) | `voice/intro.webm`, `voice/intro.mp3`, `voice/intro.json` | Made by `tools/audio/synth_voice.py`. Licence audit 2026-10-13 (docs/audio.md, Voice): every Polish Piper voice failed (darkman, gosia and mc_speech are fine-tuned from en_US-lessac, whose Blizzard 2013 data is research-only; mls_6892 from en_US-ryan, RyanSpeech CC BY-NC-SA 4.0), so the voice will be a volunteer recording (`--recordings`). When it ships, this row names the speaker and `intro.json` carries the licence. | self-recorded-CC0 (CC0 1.0) |
| App icon | `../icons/icon.svg`, `icon-*.png` | Self-made | Project's own |
| Baloo 2 typeface (headings, buttons) | npm `@fontsource-variable/baloo-2` | The Baloo 2 Project Authors (Ek Type), via Fontsource | SIL OFL 1.1 |
| Nunito typeface (body text) | npm `@fontsource-variable/nunito` | The Nunito Project Authors, via Fontsource | SIL OFL 1.1 |
| Paper, cork and floor textures | generated in code (SVG noise, canvas) | Self-made | Project's own |
