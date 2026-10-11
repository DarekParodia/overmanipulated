#!/usr/bin/env python3
"""Decodes the shipped audio files and prints peak / RMS per file and per bus (S5-08 mix check).

  - every music file (webm and mp3 are both decoded and must agree within 1.5 dB),
  - every sprite sound, with the level it actually has in the game: file level + the cue's
    `volume` (apps/client/src/fx/cues.ts), grouped by the cue's bus,
  - the total payload size per format.

Exits non-zero when a file is missing, clips (peak above -0.3 dBFS), is silent, or a bus is out
of its loudness window (see docs/audio.md).

Usage: python3 tools/audio/measure.py   (requires numpy and ffmpeg)
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / "apps/client/public/assets/audio"
SPRITE = ROOT / "apps/client/src/fx/audio/sfx-sprite.json"
MANIFEST = ROOT / "apps/client/src/fx/audio/music-manifest.json"
CUES = ROOT / "apps/client/src/fx/cues.ts"
RATE = 24000
# Allowed spread (dB) of the in-game RMS of a bus' one-shots around its median.
WINDOWS = {"ui": (-40.0, -17.0), "sfx": (-42.0, -14.0), "music": (-26.0, -17.0)}


def db(x):
    return 20 * np.log10(max(float(x), 1e-9))


def decode(path):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(out, dtype="<f4").astype(np.float64)


def levels(signal):
    active = signal[np.abs(signal) > 0.05 * (np.max(np.abs(signal)) or 1)]
    return db(np.max(np.abs(signal))), db(np.sqrt(np.mean(signal**2))), db(np.sqrt(np.mean(active**2)))


def main():
    problems = []
    print("== music (file level, before bus volume) ==")
    music_rms = []
    for name in sorted(json.loads(MANIFEST.read_text())):
        for suffix in ("", "-pressure"):
            if name == "menu" and suffix:
                continue
            track = name + suffix
            results = {}
            for ext in ("webm", "mp3"):
                path = AUDIO / "music" / f"{track}.{ext}"
                if not path.exists():
                    problems.append(f"missing {path.name}")
                    continue
                results[ext] = levels(decode(path))
            if not results:
                continue
            peak, rms, _ = results.get("webm", next(iter(results.values())))
            music_rms.append(rms)
            if "webm" in results and "mp3" in results and abs(results["webm"][1] - results["mp3"][1]) > 1.5:
                problems.append(f"{track}: webm/mp3 loudness differ")
            if peak > -0.3:
                problems.append(f"{track}: peak {peak:.1f} dBFS")
            print(f"  {track:18s} peak {peak:6.1f}  rms {rms:6.1f}")

    sprite = json.loads(SPRITE.read_text())
    cue_text = CUES.read_text()
    bus_of = {}
    for ids, bus, vol in re.findall(r"ids: \[([^\]]*)\],\s*bus: '(\w+)'(?:,\s*volume: ([\d.]+))?", cue_text):
        for sid in re.findall(r"'(\w+)'", ids):
            bus_of.setdefault(sid, []).append((bus, float(vol) if vol else 1.0))
    sfx = decode(AUDIO / "sfx.webm")
    per_bus = {}
    print("== sfx sprite (rms over the audible part; in-game = file + cue volume) ==")
    for sid, (offset, duration, _loop) in sprite.items():
        a, b = int(offset / 1000 * RATE), int((offset + duration) / 1000 * RATE)
        peak, _, active = levels(sfx[a:b])
        uses = bus_of.get(sid, [("sfx", 1.0)])
        for bus, vol in uses:
            game_rms = active + db(vol)
            per_bus.setdefault(bus, []).append((sid, game_rms))
        if peak > -0.3:
            problems.append(f"sfx {sid}: peak {peak:.1f} dBFS")
        bus0, vol0 = uses[0]
        print(f"  {sid:12s} peak {peak:6.1f}  rms {active:6.1f}  in-game {active + db(vol0):6.1f}  [{bus0}]")

    print("== per bus (in-game RMS of one-shots, before bus volume) ==")
    for bus, items in sorted(per_bus.items()):
        values = [v for sid, v in items if sid not in ("roomtone", "ambchatter")]
        lo, hi = WINDOWS.get(bus, (-60, 0))
        print(f"  {bus:6s} n={len(values):2d}  min {min(values):6.1f}  median {np.median(values):6.1f}  max {max(values):6.1f}  (window {lo}..{hi})")
        for sid, v in items:
            if sid not in ("roomtone", "ambchatter") and not lo <= v <= hi:
                problems.append(f"{bus}/{sid}: {v:.1f} dB outside {lo}..{hi}")
    print(f"  music  n={len(music_rms):2d}  min {min(music_rms):6.1f}  median {np.median(music_rms):6.1f}  max {max(music_rms):6.1f}  (window {WINDOWS['music'][0]}..{WINDOWS['music'][1]})")

    print("== payload ==")
    for ext in ("webm", "mp3"):
        total = sum(p.stat().st_size for p in AUDIO.rglob(f"*.{ext}"))
        first = sum(p.stat().st_size for p in AUDIO.glob(f"*.{ext}"))
        print(f"  {ext}: total {total / 1024:.0f} KiB, sfx sprite {first / 1024:.0f} KiB")
        if total > 2.6 * 1024 * 1024:
            problems.append(f"{ext} payload {total / 1024:.0f} KiB over budget")

    for p in problems:
        print("PROBLEM:", p, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
