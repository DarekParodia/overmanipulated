// Colour-blindness simulation (S5-05). Pure maths over the design tokens: simulates protanopia,
// deuteranopia and tritanopia, measures how far apart two colours stay (CIEDE2000) and lists the
// pairs of meaning colours the game relies on. colorblind.test.ts fails when a pair collapses
// without a non-colour signal; `bun run tools/a11y/colorblind-report.ts` prints the table that
// docs/accessibility.md quotes.

export type Rgb = readonly [number, number, number];
export type Deficiency = 'protanopia' | 'deuteranopia' | 'tritanopia';
export const deficiencies: readonly Deficiency[] = ['protanopia', 'deuteranopia', 'tritanopia'];

/**
 * Machado, Oliveira & Fernandes (2009), severity 1.0, applied to linear RGB. Rows are the
 * simulated R, G, B as weights of the original linear R, G, B.
 */
const MACHADO: Record<Deficiency, readonly [Rgb, Rgb, Rgb]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export function parseHex(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (linear: number): number => {
  const c = Math.min(1, Math.max(0, linear));
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
};

/** The colour as someone with the given deficiency sees it. */
export function simulate(rgb: Rgb, deficiency: Deficiency | 'normal'): Rgb {
  if (deficiency === 'normal') {
    return rgb;
  }
  const lin = rgb.map(toLinear) as unknown as Rgb;
  const [r, g, b] = MACHADO[deficiency].map((row) =>
    fromLinear(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]),
  ) as unknown as Rgb;
  return [r, g, b];
}

type Lab = readonly [number, number, number];

export function toLab(rgb: Rgb): Lab {
  const [r, g, b] = rgb.map(toLinear) as unknown as Rgb;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** CIEDE2000 colour difference (Sharma, Wu & Dalal reference formulation). */
export function deltaE2000(a: Lab, b: Lab): number {
  const [l1, a1, b1] = a;
  const [l2, a2, b2] = b;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (y: number, x: number) => {
    if (x === 0 && y === 0) return 0;
    const h = (Math.atan2(y, x) * 180) / Math.PI;
    return h >= 0 ? h : h + 360;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp / 2));
  const lBarP = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBarP = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) {
      hBarP = (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2;
    } else {
      hBarP = (h1p + h2p) / 2;
    }
  }
  const t =
    1 -
    0.17 * Math.cos(rad(hBarP - 30)) +
    0.24 * Math.cos(rad(2 * hBarP)) +
    0.32 * Math.cos(rad(3 * hBarP + 6)) -
    0.2 * Math.cos(rad(4 * hBarP - 63));
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(rad(2 * dTheta)) * rc;
  return Math.sqrt(
    (dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh),
  );
}

/** How far apart two hex colours look to someone with the deficiency (0 = identical). */
export function distance(hexA: string, hexB: string, deficiency: Deficiency | 'normal'): number {
  return deltaE2000(
    toLab(simulate(parseHex(hexA), deficiency)),
    toLab(simulate(parseHex(hexB), deficiency)),
  );
}

/** Below this ΔE2000 two flat colours are easily confused at a glance. */
export const MIN_DISTINGUISHABLE = 15;

/** WCAG relative luminance contrast ratio of two hex colours. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = parseHex(hex).map(toLinear) as unknown as Rgb;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(hexA), lum(hexB)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
