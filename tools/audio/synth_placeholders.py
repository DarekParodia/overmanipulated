#!/usr/bin/env python3
"""Synthesises the placeholder sound effects and packs them into one audio sprite.

All sounds are generated here from oscillators and filtered noise, so they are self-made and
free of licensing questions (agents/game-feel.md, design-rules.md). Replace with recorded or
designed sounds in stage 5; keep the sprite ids stable.

Usage: python3 tools/audio/synth_placeholders.py   (requires numpy and ffmpeg)
Outputs:
  apps/client/public/assets/audio/sfx.webm, sfx.mp3     the sprite
  apps/client/src/fx/audio/sfx-sprite.json              id -> [offset ms, duration ms, loop]
"""
import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

RATE = 44100
ROOT = Path(__file__).resolve().parents[2]
OUT_AUDIO = ROOT / "apps/client/public/assets/audio"
OUT_JSON = ROOT / "apps/client/src/fx/audio/sfx-sprite.json"
GAP_S = 0.12
rng = np.random.default_rng(1729)


def t(seconds):
    return np.arange(int(RATE * seconds)) / RATE


def env(length, attack, decay):
    """Exponential decay envelope with a linear attack, both in seconds."""
    n = int(RATE * length)
    x = np.arange(n) / RATE
    a = np.clip(x / max(attack, 1e-4), 0, 1)
    return a * np.exp(-x / decay)


def lowpass(signal, cutoff):
    alpha = 1 - np.exp(-2 * np.pi * cutoff / RATE)
    out = np.empty_like(signal)
    acc = 0.0
    for i, v in enumerate(signal):
        acc += alpha * (v - acc)
        out[i] = acc
    return out


def highpass(signal, cutoff):
    return signal - lowpass(signal, cutoff)


def noise(seconds):
    return rng.uniform(-1, 1, int(RATE * seconds))


def bell(freq, seconds, decay, partials=((1, 1.0), (2.76, 0.35), (5.4, 0.12))):
    x = t(seconds)
    s = sum(a * np.sin(2 * np.pi * freq * r * x) for r, a in partials)
    return s * env(seconds, 0.002, decay)


def normalize(signal, peak):
    m = np.max(np.abs(signal)) or 1
    return signal / m * peak


def click():
    """Typewriter key: sharp filtered noise transient plus a short wooden knock."""
    s = highpass(noise(0.06), 1800) * env(0.06, 0.0005, 0.008)
    s += 0.5 * np.sin(2 * np.pi * 420 * t(0.06)) * env(0.06, 0.0005, 0.012)
    return normalize(s, 0.7)


def hover():
    """Soft paper tick."""
    s = highpass(noise(0.04), 3000) * env(0.04, 0.001, 0.006)
    return normalize(s, 0.25)


def back():
    s = 0.6 * np.sin(2 * np.pi * 260 * t(0.08)) * env(0.08, 0.0005, 0.02)
    s += highpass(noise(0.08), 1200) * env(0.08, 0.0005, 0.006) * 0.5
    return normalize(s, 0.6)


def copy_ding():
    """Typewriter carriage bell."""
    return normalize(bell(2093, 0.7, 0.18), 0.5)


def join_chime():
    a = bell(659, 0.9, 0.25)
    b = np.concatenate([np.zeros(int(RATE * 0.11)), bell(988, 0.79, 0.3)])
    return normalize(a + b, 0.55)


def leave_chime():
    a = bell(784, 0.8, 0.22)
    b = np.concatenate([np.zeros(int(RATE * 0.12)), bell(523, 0.68, 0.28)])
    return normalize(a + b, 0.45)


def step(variant):
    """Soft shoe on wooden floor: low thump plus a little scuff."""
    freq = 95 if variant == 1 else 110
    s = np.sin(2 * np.pi * freq * t(0.11)) * env(0.11, 0.002, 0.025)
    s += 0.35 * lowpass(noise(0.11), 900) * env(0.11, 0.003, 0.03)
    return normalize(s, 0.45)


def desk_bell():
    """Reception desk bell — the newsroom's 'start'."""
    return normalize(bell(1318, 1.4, 0.45, ((1, 1.0), (2.4, 0.5), (4.1, 0.2), (6.3, 0.08))), 0.6)


def stamp_thud():
    """Rubber stamp on a desk: low body thump, wood knock, paper slap."""
    s = np.sin(2 * np.pi * 70 * t(0.3)) * env(0.3, 0.001, 0.06)
    s += 0.6 * np.sin(2 * np.pi * 180 * t(0.3)) * env(0.3, 0.001, 0.025)
    s += 0.5 * highpass(noise(0.3), 1500) * env(0.3, 0.0005, 0.01)
    return normalize(s, 0.9)


def roomtone():
    """Quiet newsroom bed: brown noise with slow swell. Seamless loop via crossfade."""
    seconds = 4.0
    n = int(RATE * seconds)
    fade = int(RATE * 0.5)
    raw = np.cumsum(noise(seconds + 0.5)) * 0.02
    raw = highpass(raw, 60)
    raw = lowpass(raw, 700)
    swell = 0.85 + 0.15 * np.sin(2 * np.pi * np.arange(len(raw)) / len(raw))
    raw = raw * swell
    body = raw[:n].copy()
    tail = raw[n:n + fade]
    ramp = np.linspace(0, 1, fade)
    body[:fade] = body[:fade] * ramp + tail * (1 - ramp)
    return normalize(body, 0.18)


SOUNDS = [
    ("click", click, False),
    ("hover", hover, False),
    ("back", back, False),
    ("copy", copy_ding, False),
    ("join", join_chime, False),
    ("leave", leave_chime, False),
    ("step1", lambda: step(1), False),
    ("step2", lambda: step(2), False),
    ("start", desk_bell, False),
    ("stamp", stamp_thud, False),
    ("roomtone", roomtone, True),
]


def main():
    OUT_AUDIO.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    parts = []
    sprite = {}
    cursor = 0.0
    for name, fn, loop in SOUNDS:
        s = fn().astype(np.float64)
        sprite[name] = [round(cursor * 1000), round(len(s) / RATE * 1000), loop]
        parts.append(s)
        gap = np.zeros(int(RATE * GAP_S))
        parts.append(gap)
        cursor += len(s) / RATE + GAP_S
    audio = np.concatenate(parts)
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "sfx.wav"
        with wave.open(str(wav_path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        for ext, args in (("webm", ["-c:a", "libopus", "-b:a", "48k"]), ("mp3", ["-c:a", "libmp3lame", "-b:a", "64k"])):
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), *args, str(OUT_AUDIO / f"sfx.{ext}")],
                check=True,
            )
    OUT_JSON.write_text(json.dumps(sprite, indent=2) + "\n")
    print(f"wrote {len(sprite)} sounds, {cursor:.1f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
