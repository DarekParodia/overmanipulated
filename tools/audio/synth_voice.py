#!/usr/bin/env python3
"""Generates the intro voiceover (S7-100): one narrator sprite plus its json.

Reads the 17 narrator lines from `bun tools/audio/intro-lines.ts` ({clipId: {subtitle, tts,
textSha1}}), gets one take per clip, post-processes every take the same way, joins them with a
120 ms gap and writes

  apps/client/public/assets/voice/intro.webm   Opus, mono, 24 kbps (VoIP tuning)
  apps/client/public/assets/voice/intro.mp3    mono, 22.05 kHz, 40 kbps
  apps/client/public/assets/voice/intro.json   the voice sprite (voiceSpriteSchema in
                                               apps/client/src/intro/voice-sprite.ts)

Takes come from one of two sources:

  --recordings DIR [--voice LABEL] [--licence self-recorded-CC0] [--credit NAME]
      A volunteer's recordings, DIR/<clipId>.wav (any rate, mono or stereo), released under CC0.
      Licence `self-recorded-CC0`; LABEL, stored in the sprite, defaults to RECORDING_LABEL
      (`ochotnik-1`). This is the shipping path (user decision 2026-10-13); the volunteer's
      guide, clip table and consent form are in docs/voice-recording.pl.md.

  --voice NAME                      a Piper voice from VOICES (downloaded, SHA-256 pinned)
  --model PATH --voice LABEL --licence L [--credit TEXT]
      Offline Piper TTS (pip install piper-tts==1.8.0). A voice is used only when its whole
      chain (dataset, every checkpoint it was fine-tuned from) allows redistribution and
      commercial use; see the licence audit in docs/audio.md and the Decision log. Every Polish
      Piper voice failed it on 2026-10-13, so VOICES marks them blocked and the tool refuses
      them. --model is for a voice audited later (e.g. one trained from scratch on the CC0
      darkman dataset): record its audit first, then pass its licence.

Post-processing per take: trim silence below -45 dBFS (keeping 40 ms around speech), 10 ms
fades, normalise to -20 dBFS RMS over the audible part with the peak held at or under -3 dBFS.
Fails (writing nothing) when either audio file would exceed VOICE_MAX_BYTES.

Usage:
  python3 tools/audio/synth_voice.py --recordings ~/takes --licence self-recorded-CC0 --credit 'Name'
  python3 tools/audio/synth_voice.py --model pl_PL-x.onnx --voice pl_PL-x --licence CC0-1.0
  [--out DIR] writes the three files to DIR instead (for a trial run)
  [--lines FILE] reads the line export from FILE instead of running bun

Then run python3 tools/audio/measure.py and bun test apps/client/src/intro.
Requires numpy and ffmpeg (and piper-tts for TTS).
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "apps/client/public/assets/voice"
# The sprite's `voice` label for a recording when --voice is not given: neutral, never a name
# (the volunteer's chosen credit goes to --credit).
RECORDING_LABEL = "ochotnik-1"
CACHE = Path.home() / ".cache/redakcja/piper"

# Must match apps/client/src/intro/voice-sprite.ts (voice-sync.test.ts checks both literals).
VOICE_MAX_BYTES = 700_000
LICENCES = ("CC0-1.0", "CC-BY-4.0", "MIT", "self-recorded-CC0")

RATE = 24000  # working rate; Piper medium voices are 22.05 kHz, recordings anything
GAP_S = 0.12  # silence between clips, as in synth_placeholders.py
FRAME_S = 0.01  # trim analysis frame
SILENCE_DBFS = -45.0
KEEP_S = 0.04  # kept before the first and after the last voiced frame
FADE_S = 0.01
TARGET_RMS_DBFS = -20.0
PEAK_CEILING_DBFS = -3.0

# Piper synthesis settings: a touch slower than default, slightly less random.
SYNTHESIS = {"length_scale": 1.05, "noise_scale": 0.6, "noise_w_scale": 0.8}

PIPER_VOICES_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"

# Licence audit, 2026-10-13 (model cards at raw.githubusercontent.com/rhasspy/piper-samples,
# dataset READMEs; huggingface.co itself is unreachable from the build sandbox). `cleared` is
# True only when the whole chain allows redistribution and commercial use; `licence` is then the
# LICENCES value the sprite carries. `sha256` pins {".onnx": hex, ".onnx.json": hex}; it is filled
# in when a voice is cleared and first downloaded (the tool prints both hashes).
VOICES = {
    "pl_PL-darkman-medium": {
        "path": "pl/pl_PL/darkman/medium",
        "chain": "dataset darkman (OHF-Voice/NabuCasa voice-datasets, CC0) <- fine-tuned from "
        "en_US-lessac-medium <- Blizzard 2013 Lessac data (research licence, no commercial use)",
        "cleared": False,
        "licence": None,
        "sha256": None,
    },
    "pl_PL-gosia-medium": {
        "path": "pl/pl_PL/gosia/medium",
        "chain": "dataset gosia (OHF-Voice/NabuCasa voice-datasets, CC0) <- fine-tuned from "
        "en_US-lessac-medium <- Blizzard 2013 Lessac data (research licence, no commercial use)",
        "cleared": False,
        "licence": None,
        "sha256": None,
    },
    "pl_PL-mc_speech-medium": {
        "path": "pl/pl_PL/mc_speech/medium",
        "chain": "MC Speech dataset (Kaggle, CC0) <- fine-tuned from en_US-lessac-medium <- "
        "Blizzard 2013 Lessac data (research licence, no commercial use)",
        "cleared": False,
        "licence": None,
        "sha256": None,
    },
    "pl_PL-mls_6892-low": {
        "path": "pl/pl_PL/mls_6892/low",
        "chain": "Multilingual LibriSpeech speaker 6892 (OpenSLR 94, CC BY 4.0) <- fine-tuned "
        "from en_US-ryan-low <- RyanSpeech (CC BY-NC-SA 4.0, non-commercial)",
        "cleared": False,
        "licence": None,
        "sha256": None,
    },
}


def fail(message):
    print(f"synth_voice: {message}", file=sys.stderr)
    sys.exit(1)


def db(x):
    return 20 * np.log10(max(float(x), 1e-12))


def from_db(value):
    return 10 ** (value / 20)


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def read_lines(lines_file):
    if lines_file:
        text = Path(lines_file).read_text(encoding="utf-8")
    else:
        run = subprocess.run(
            ["bun", str(ROOT / "tools/audio/intro-lines.ts")], check=True, capture_output=True, cwd=ROOT
        )
        text = run.stdout.decode("utf-8")
    lines = json.loads(text)
    for clip_id, line in lines.items():
        if not {"subtitle", "tts", "textSha1"} <= set(line):
            fail(f"line export for {clip_id} lacks subtitle/tts/textSha1")
    return lines


def decode(path):
    """Any audio file -> mono float64 at RATE."""
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(out, dtype="<f4").astype(np.float64)


def post_process(take, clip_id):
    frame = int(RATE * FRAME_S)
    count = len(take) // frame
    if count == 0:
        fail(f"{clip_id}: empty take")
    frames = take[: count * frame].reshape(count, frame)
    voiced = np.flatnonzero(np.sqrt(np.mean(frames**2, axis=1)) > from_db(SILENCE_DBFS))
    if voiced.size == 0:
        fail(f"{clip_id}: silent take")
    keep = int(RATE * KEEP_S)
    start = max(0, int(voiced[0]) * frame - keep)
    end = min(len(take), (int(voiced[-1]) + 1) * frame + keep)
    clip = take[start:end].copy()

    fade = min(int(RATE * FADE_S), len(clip) // 2)
    if fade > 0:
        ramp = np.linspace(0.0, 1.0, fade)
        clip[:fade] *= ramp
        clip[-fade:] *= ramp[::-1]

    peak = np.max(np.abs(clip))
    audible = clip[np.abs(clip) > 0.05 * peak]
    rms = np.sqrt(np.mean(audible**2))
    gain = from_db(TARGET_RMS_DBFS) / rms
    gain = min(gain, from_db(PEAK_CEILING_DBFS) / peak)
    return clip * gain


def recording_takes(lines, directory):
    directory = Path(directory)
    missing = [clip_id for clip_id in lines if not (directory / f"{clip_id}.wav").exists()]
    if missing:
        fail(f"missing recordings in {directory}: " + ", ".join(f"{m}.wav" for m in missing))
    return {clip_id: decode(directory / f"{clip_id}.wav") for clip_id in lines}


def download_voice(name):
    entry = VOICES[name]
    if not entry["cleared"]:
        fail(
            f"{name} did not pass the licence audit and is never generated from:\n  {entry['chain']}\n"
            "Use --recordings (volunteer, CC0) or --model with a voice whose whole chain is cleared."
        )
    pins = entry["sha256"]
    if not pins:
        fail(f"{name} has no pinned SHA-256; download it by hand, check it, pass --model and pin the printed hashes")
    CACHE.mkdir(parents=True, exist_ok=True)
    model = CACHE / f"{name}.onnx"
    for suffix in (".onnx", ".onnx.json"):
        target = CACHE / f"{name}{suffix}"
        if not target.exists():
            url = f"{PIPER_VOICES_URL}/{entry['path']}/{name}{suffix}"
            print(f"downloading {url}", file=sys.stderr)
            with urllib.request.urlopen(url) as response, open(target, "wb") as handle:
                shutil.copyfileobj(response, handle)
        digest = sha256_of(target)
        if digest != pins[suffix]:
            target.unlink()
            fail(f"{target.name}: SHA-256 {digest} does not match the pinned {pins[suffix]}")
    return model


def tts_takes(lines, model_path, tmp):
    try:
        from piper import PiperVoice, SynthesisConfig
    except ImportError:
        fail("piper-tts is not installed: pip install piper-tts==1.8.0")
    model_path = Path(model_path)
    if not model_path.exists() or not Path(f"{model_path}.json").exists():
        fail(f"need {model_path} and {model_path}.json")
    print(f"model {model_path.name} sha256 {sha256_of(model_path)}", file=sys.stderr)
    print(f"config {model_path.name}.json sha256 {sha256_of(f'{model_path}.json')}", file=sys.stderr)
    voice = PiperVoice.load(str(model_path))
    config = SynthesisConfig(**SYNTHESIS)
    takes = {}
    for clip_id, line in lines.items():
        path = Path(tmp) / f"{clip_id}.wav"
        with wave.open(str(path), "wb") as wav_file:
            voice.synthesize_wav(line["tts"], wav_file, syn_config=config)
        takes[clip_id] = decode(path)
    return takes


def encode(audio, tmp):
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    wav_path = Path(tmp) / "intro.wav"
    with wave.open(str(wav_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(RATE)
        wav_file.writeframes(pcm.tobytes())
    formats = (
        ("webm", ["-ar", "48000", "-c:a", "libopus", "-b:a", "24k", "-application", "voip"]),
        ("mp3", ["-ar", "22050", "-c:a", "libmp3lame", "-b:a", "40k"]),
    )
    paths = {}
    for ext, args in formats:
        paths[ext] = Path(tmp) / f"intro.{ext}"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-ac", "1", *args, str(paths[ext])],
            check=True,
        )
    return paths


def sprite_json(sprite):
    """Two-space json with one line per clip (stable diffs)."""
    head = {k: v for k, v in sprite.items() if k != "clips"}
    lines = [f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}," for k, v in head.items()]
    clips = [f"    {json.dumps(k)}: {json.dumps(v)}" for k, v in sprite["clips"].items()]
    return "{\n" + "\n".join(lines) + '\n  "clips": {\n' + ",\n".join(clips) + "\n  }\n}\n"


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--recordings", metavar="DIR", help="volunteer recordings DIR/<clipId>.wav (CC0)")
    source.add_argument("--model", metavar="PATH", help="a Piper .onnx voice whose chain passed the audit")
    parser.add_argument("--voice", help="Piper voice name from VOICES, or the label stored in the sprite")
    parser.add_argument("--licence", choices=LICENCES, help="licence of an audited --model voice")
    parser.add_argument("--credit", help="attribution line (required for CC-BY-4.0)")
    parser.add_argument("--out", metavar="DIR", help=f"output directory (default {OUT_DIR.relative_to(ROOT)})")
    parser.add_argument("--lines", metavar="FILE", help="line export json instead of running bun")
    args = parser.parse_args(argv)
    if args.recordings and not args.voice:
        args.voice = RECORDING_LABEL
    if not args.voice:
        parser.error("--voice is required (a VOICES name, or a label for --model / --recordings)")
    if args.recordings and args.licence not in (None, "self-recorded-CC0"):
        parser.error("recordings are released under CC0: their licence is self-recorded-CC0")
    if args.model and not args.licence:
        parser.error("--model needs --licence: record the voice's licence audit first")
    if not args.recordings and not args.model and args.voice not in VOICES:
        parser.error(f"unknown voice {args.voice}; known: {', '.join(VOICES)}")
    if args.licence == "CC-BY-4.0" and not args.credit:
        parser.error("a CC-BY-4.0 voice needs --credit")
    return args


def main(argv=None):
    args = parse_args(argv)
    lines = read_lines(args.lines)
    out_dir = Path(args.out) if args.out else OUT_DIR

    with tempfile.TemporaryDirectory() as tmp:
        if args.recordings:
            takes = recording_takes(lines, args.recordings)
            source, licence = "recording", "self-recorded-CC0"
        else:
            model = args.model or download_voice(args.voice)
            takes = tts_takes(lines, model, tmp)
            source = "tts"
            licence = args.licence or VOICES[args.voice]["licence"]
            if licence not in LICENCES:
                fail(f"licence {licence} may not ship (allowed: {', '.join(LICENCES)})")

        parts, clips, cursor = [], {}, 0
        gap = np.zeros(int(RATE * GAP_S))
        for clip_id, line in lines.items():
            clip = post_process(takes[clip_id], clip_id)
            start_ms = round(cursor / RATE * 1000)
            duration_ms = round(len(clip) / RATE * 1000)
            clips[clip_id] = {"startMs": start_ms, "durationMs": duration_ms, "textSha1": line["textSha1"]}
            parts.extend([clip, gap])
            cursor += len(clip) + len(gap)
        audio = np.concatenate(parts)

        paths = encode(audio, tmp)
        sizes = {ext: path.stat().st_size for ext, path in paths.items()}
        over = [f"intro.{ext} {size} bytes" for ext, size in sizes.items() if size > VOICE_MAX_BYTES]
        if over:
            fail(f"over VOICE_MAX_BYTES ({VOICE_MAX_BYTES}): {', '.join(over)}; nothing written")

        sprite = {"voice": args.voice, "source": source, "licence": licence}
        if args.credit:
            sprite["credit"] = args.credit
        sprite["clips"] = clips
        out_dir.mkdir(parents=True, exist_ok=True)
        for ext, path in paths.items():
            shutil.copyfile(path, out_dir / f"intro.{ext}")
        (out_dir / "intro.json").write_text(sprite_json(sprite), encoding="utf-8")

    seconds = len(audio) / RATE
    print(
        f"wrote {len(clips)} clips, {seconds:.1f} s, webm {sizes['webm']} B, mp3 {sizes['mp3']} B -> {out_dir}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
