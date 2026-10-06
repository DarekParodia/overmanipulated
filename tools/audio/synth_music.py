#!/usr/bin/env python3
"""Synthesises the v1 music loops: a menu track and the two level layers (calm / pressure).

Everything is generated here from oscillators and filtered noise (no downloaded samples), so the
music is self-made and free of licensing questions (agents/game-feel.md). All three loops share
tempo, key and length so the level layers play in sync and the client can cross-fade them.

Style: light newsroom noir-jazz. D minor, 104 BPM, 16 bars of 4/4.
  menu      Rhodes-like electric piano, soft upright bass on 1 and 3, brushed snare swish
  calm      walking bass, muted piano comping, swung ride cymbal, soft kick
  pressure  typewriter clatter in 16ths with a carriage bell, tight backbeat snare, closed hi-hat
            8ths, octave bass pulse, staccato stabs; played on top of `calm`

Loops are rendered circularly (note tails past the loop end wrap to the start), so loop points
are seamless.

Usage: python3 tools/audio/synth_music.py   (requires numpy and ffmpeg)
Outputs: apps/client/public/assets/audio/music/{menu,calm,pressure}.{webm,mp3}
Prints peak / RMS / crest / energy per frequency band per track as a sanity check (a listen-check stand-in).
"""
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

RATE = 44100
BPM = 104
BARS = 16
BEAT = 60 / BPM
LOOP_S = BARS * 4 * BEAT
LOOP_N = int(round(LOOP_S * RATE))
SWING = 0.62  # position of the off-beat 8th inside a beat (0.5 = straight)
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/client/public/assets/audio/music"
rng = np.random.default_rng(2604)

# Two 8-bar halves: i - IV7 - bVII - V7alt / i - bVI7 - ii-half-dim - V7 (D minor).
# Each chord: (bass root midi, voicing midi notes).
CHORDS = [
    (38, [53, 57, 60, 64]),  # Dm9    D2 | F A C E
    (43, [53, 59, 64, 69]),  # G13    G2 | F B E A
    (36, [52, 55, 59, 62]),  # Cmaj9  C2 | E G B D
    (45, [55, 58, 61, 65]),  # A7alt  A2 | G Bb C# F
    (38, [53, 57, 60, 64]),  # Dm9
    (46, [56, 60, 62, 67]),  # Bb13   Bb2| Ab C D G
    (40, [55, 58, 62, 64]),  # Em7b5  E2 | G Bb D (E)
    (45, [55, 61, 64, 67]),  # A7     A2 | G C# E G
]


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def bar_chord(bar):
    return CHORDS[bar % len(CHORDS)]


def beat_time(bar, beat):
    return (bar * 4 + beat) * BEAT


def swung(bar, eighth):
    """Start time of the given 8th note (0-7) in a bar, with swing."""
    beat, off = divmod(eighth, 2)
    return beat_time(bar, beat + (SWING if off else 0))


def place(track, sound, start_s, gain=1.0):
    """Mixes `sound` into the circular `track` starting at `start_s` (wraps past the end)."""
    start = int(round(start_s * RATE)) % LOOP_N
    n = len(sound)
    end = start + n
    if end <= LOOP_N:
        track[start:end] += gain * sound
    else:
        first = LOOP_N - start
        track[start:] += gain * sound[:first]
        rest = sound[first:]
        while len(rest):
            chunk = rest[:LOOP_N]
            track[: len(chunk)] += gain * chunk
            rest = rest[LOOP_N:]


def tt(seconds):
    return np.arange(int(RATE * seconds)) / RATE


def env(seconds, attack, decay, release=0.01):
    x = tt(seconds)
    a = np.clip(x / max(attack, 1e-4), 0, 1)
    e = a * np.exp(-x / decay)
    r = int(RATE * release)
    if r and len(e) > r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def band(signal, low=0.0, high=None):
    """Zero-phase band filter via FFT with soft (one-octave) skirts."""
    spec = np.fft.rfft(signal)
    f = np.fft.rfftfreq(len(signal), 1 / RATE)
    mask = np.ones_like(f)
    if low > 0:
        mask *= np.clip(np.log2(np.maximum(f, 1e-3) / low) + 1, 0, 1)
    if high is not None:
        mask *= np.clip(1 - np.log2(np.maximum(f, 1e-3) / high), 0, 1)
    return np.fft.irfft(spec * mask, len(signal))


def noise(seconds):
    return rng.uniform(-1, 1, int(RATE * seconds))


# --- Instruments ---------------------------------------------------------------------------


def rhodes(midi, seconds, vel=1.0):
    """Electric-piano tone: sine with a bell-ish 2nd partial and a soft tine attack."""
    f = midi_hz(midi)
    x = tt(seconds)
    s = np.sin(2 * np.pi * f * x + 0.6 * np.sin(2 * np.pi * f * x) * np.exp(-x / 0.25))
    s += 0.25 * np.sin(2 * np.pi * 2 * f * x) * np.exp(-x / 0.4)
    s += 0.08 * np.sin(2 * np.pi * 7 * f * x) * np.exp(-x / 0.03)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * x)
    return vel * s * trem * env(seconds, 0.004, seconds * 0.55, 0.08)


def piano_stab(midi, seconds, vel=1.0):
    """Muted, short piano comp note."""
    f = midi_hz(midi)
    x = tt(seconds)
    s = np.sin(2 * np.pi * f * x) + 0.4 * np.sin(2 * np.pi * 2 * f * x) + 0.15 * np.sin(2 * np.pi * 3 * f * x)
    return vel * s * env(seconds, 0.003, 0.12, 0.03)


def upright(midi, seconds, vel=1.0):
    """Upright bass pluck: low sine with a soft saturated attack."""
    f = midi_hz(midi)
    x = tt(seconds)
    s = np.sin(2 * np.pi * f * x) + 0.3 * np.sin(2 * np.pi * 2 * f * x) * np.exp(-x / 0.08)
    s = np.tanh(1.6 * s) / np.tanh(1.6)
    thump = band(noise(seconds), 80, 500) * np.exp(-x / 0.012) * 0.4
    return vel * (s * env(seconds, 0.006, 0.35, 0.04) + thump)


def kick(vel=1.0):
    x = tt(0.3)
    freq = 48 + 70 * np.exp(-x / 0.03)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    return vel * np.sin(phase) * env(0.3, 0.001, 0.12)


def ride(vel=1.0):
    """Ride cymbal: metallic partials plus high noise, long-ish decay."""
    x = tt(0.9)
    metal = sum(np.sin(2 * np.pi * f * x) for f in (3170, 4410, 5590, 6810, 8230)) / 5
    hiss = band(noise(0.9), 6000, 14000)
    return vel * (0.5 * metal + 0.6 * hiss) * env(0.9, 0.001, 0.28, 0.05)


def hihat(vel=1.0):
    return vel * band(noise(0.07), 7000, 15000) * env(0.07, 0.0005, 0.015)


def snare(vel=1.0):
    x = tt(0.25)
    body = np.sin(2 * np.pi * 190 * x) * np.exp(-x / 0.04)
    rattle = band(noise(0.25), 1500, 9000) * np.exp(-x / 0.07)
    return vel * (0.6 * body + rattle) * env(0.25, 0.001, 0.2)


def brush(vel=1.0):
    """Brushed snare swish: slow-attack band-passed noise."""
    s = band(noise(0.35), 2000, 8000)
    return vel * s * env(0.35, 0.06, 0.12, 0.05)


def typewriter(vel=1.0):
    """Typewriter key: sharp click with a short wooden knock."""
    x = tt(0.06)
    click = band(noise(0.06), 2500, 12000) * np.exp(-x / 0.006)
    knock = np.sin(2 * np.pi * 380 * x) * np.exp(-x / 0.01)
    return vel * (click + 0.5 * knock)


def carriage_bell(vel=1.0):
    x = tt(0.8)
    s = sum(a * np.sin(2 * np.pi * 2093 * r * x) for r, a in ((1, 1.0), (2.76, 0.3), (5.4, 0.1)))
    return vel * s * env(0.8, 0.001, 0.22)


# --- Tracks --------------------------------------------------------------------------------


def menu_track():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        # Rhodes: chord on 1 (rolled), a lighter re-strike on the "and" of 2.
        for i, m in enumerate(voicing):
            place(track, rhodes(m, BEAT * 3.2, 0.5), beat_time(bar, 0) + i * 0.018)
            place(track, rhodes(m, BEAT * 1.6, 0.28), swung(bar, 3) + i * 0.012)
        # Soft bass on 1 and 3 (root, then fifth).
        place(track, upright(root, BEAT * 1.8, 0.75), beat_time(bar, 0))
        place(track, upright(root + 7, BEAT * 1.8, 0.6), beat_time(bar, 2))
        # Brushes: swish on 2 and 4, light tap on the swung offbeats.
        for beat in (1, 3):
            place(track, brush(0.3), beat_time(bar, beat) - 0.04)
        for eighth in (1, 3, 5, 7):
            place(track, hihat(0.08), swung(bar, eighth))
    return track


def walking_line(bar):
    """Four quarter notes: root, chord tone, approach, chromatic lead into the next root."""
    root, _ = bar_chord(bar)
    nxt, _ = bar_chord(bar + 1)
    third = root + (3 if bar % 8 in (0, 4, 6) else 4)
    fifth = root + 7
    lead = nxt + (1 if nxt <= root else -1)
    return [root, third if bar % 2 else fifth, fifth if bar % 2 else third, lead]


def calm_track():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        _, voicing = bar_chord(bar)
        for beat, m in enumerate(walking_line(bar)):
            place(track, upright(m, BEAT * 0.95, 0.5), beat_time(bar, beat))
        # Piano comping: short stabs on the "and" of 1 and on 3 (or 4 every other bar).
        hits = (1, 4) if bar % 2 == 0 else (1, 6)
        for eighth in hits:
            for m in voicing:
                place(track, piano_stab(m, 0.35, 0.3), swung(bar, eighth))
        # Ride: ding, ding-ga-ding pattern.
        for eighth in (0, 2, 3, 4, 6, 7):
            place(track, ride(0.32 if eighth % 2 == 0 else 0.2), swung(bar, eighth))
        # Feathered kick on every beat, hi-hat foot on 2 and 4.
        for beat in range(4):
            place(track, kick(0.14), beat_time(bar, beat))
        for beat in (1, 3):
            place(track, hihat(0.25), beat_time(bar, beat))
    return track


def pressure_track():
    track = np.zeros(LOOP_N)
    sixteenth = BEAT / 4
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        # Typewriter: 16ths with accents and a few gaps; carriage bell at the end of 4-bar lines.
        for i in range(16):
            if i in (7, 15) and bar % 2:
                continue
            accent = 0.5 if i % 4 == 0 else 0.3 if i % 2 == 0 else 0.22
            jitter = rng.uniform(-0.004, 0.004)
            place(track, typewriter(accent), beat_time(bar, 0) + i * sixteenth + jitter)
        if bar % 4 == 3:
            place(track, carriage_bell(0.28), beat_time(bar, 3) + 2 * sixteenth)
        # Tight backbeat snare and closed hats on straight 8ths.
        for beat in (1, 3):
            place(track, snare(0.5), beat_time(bar, beat))
        for eighth in range(8):
            place(track, hihat(0.3 if eighth % 2 else 0.18), beat_time(bar, eighth / 2))
        # Kick: driving 1, "and" of 2, 3.
        for beat in (0, 1.5, 2):
            place(track, kick(0.28), beat_time(bar, beat))
        # Octave bass pulse on 8ths.
        for eighth in range(8):
            m = root + (12 if eighth % 2 else 0)
            place(track, upright(m, BEAT * 0.45, 0.25), beat_time(bar, eighth / 2))
        # Staccato stabs on the "and" of 4 (anticipation).
        for m in voicing:
            place(track, piano_stab(m + 12, 0.2, 0.13), beat_time(bar, 3.5))
    return track


# --- Output --------------------------------------------------------------------------------


def soft_limit(signal, peak):
    """Normalises to `peak` through a gentle tanh so transients do not dominate."""
    s = signal / (np.max(np.abs(signal)) or 1)
    s = np.tanh(1.5 * s) / np.tanh(1.5)
    return s * peak


BANDS = ((0, 250), (250, 2000), (2000, 8000), (8000, RATE / 2 + 1))
BAND_LABELS = ("low", "mid", "high", "air")


def report(name, signal):
    peak = float(np.max(np.abs(signal)))
    rms = float(np.sqrt(np.mean(signal**2)))
    power = np.abs(np.fft.rfft(signal)) ** 2
    f = np.fft.rfftfreq(len(signal), 1 / RATE)
    total = np.sum(power) or 1
    bands = [np.sum(power[(f >= lo) & (f < hi)]) / total * 100 for lo, hi in BANDS]
    seam = float(abs(signal[0] - signal[-1]))
    shares = " ".join(f"{label} {share:4.1f}%" for label, share in zip(BAND_LABELS, bands))
    print(
        f"{name:9s} peak {20 * np.log10(peak):6.1f} dBFS  rms {20 * np.log10(rms):6.1f} dBFS  "
        f"crest {20 * np.log10(peak / rms):4.1f} dB  energy {shares}  seam step {seam:.4f}",
        file=sys.stderr,
    )
    assert peak <= 1.0 and rms > 0.02, f"{name}: level out of range"
    assert seam < 0.05, f"{name}: loop seam discontinuity"


def encode(name, signal):
    pcm = (np.clip(signal, -1, 1) * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / f"{name}.wav"
        with wave.open(str(wav_path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        for ext, args in (
            ("webm", ["-c:a", "libopus", "-b:a", "28k", "-application", "audio"]),
            ("mp3", ["-c:a", "libmp3lame", "-b:a", "40k", "-ar", "44100"]),
        ):
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), *args, str(OUT / f"{name}.{ext}")],
                check=True,
            )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tracks = {
        "menu": soft_limit(menu_track(), 0.7),
        "calm": soft_limit(calm_track(), 0.55),
        "pressure": soft_limit(pressure_track(), 0.45),
    }
    print(f"{BPM} BPM, {BARS} bars, loop {LOOP_S:.3f} s ({LOOP_N} samples)", file=sys.stderr)
    for name, signal in tracks.items():
        report(name, signal)
        encode(name, signal)
    report("calm+pres", np.clip(tracks["calm"] + tracks["pressure"], -1, 1))
    total = sum(p.stat().st_size for p in OUT.iterdir())
    print(f"total {total / 1024:.0f} KiB in {OUT.relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
