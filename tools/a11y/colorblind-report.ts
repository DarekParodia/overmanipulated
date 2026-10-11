// Prints the colour-blind audit table (docs/accessibility.md): CIEDE2000 distance of every
// meaning-colour pair under normal vision, protanopia, deuteranopia and tritanopia.
//   bun tools/a11y/colorblind-report.ts
import {
  deficiencies,
  distance,
  MIN_DISTINGUISHABLE,
} from '../../apps/client/src/a11y/colorblind.ts';
import { meaningPairs } from '../../apps/client/src/a11y/meaning-pairs.ts';

const columns = ['normal', ...deficiencies] as const;
console.log(`| Pair | ${columns.join(' | ')} | Redundant channel |`);
console.log(`| --- | ${columns.map(() => '---:').join(' | ')} | --- |`);
for (const pair of meaningPairs) {
  const cells = columns.map((deficiency) => {
    const d = distance(pair.a, pair.b, deficiency);
    return d < MIN_DISTINGUISHABLE ? `**${d.toFixed(1)}**` : d.toFixed(1);
  });
  console.log(`| ${pair.id} | ${cells.join(' | ')} | ${pair.redundancy} |`);
}
console.log(`\nBold = below ΔE2000 ${MIN_DISTINGUISHABLE}: confusable by colour alone.`);
