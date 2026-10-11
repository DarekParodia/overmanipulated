// Writes a Brotli copy (`file.br`) next to every compressible build file, so Caddy's
// `file_server { precompress br }` serves them without compressing on each request.
// Usage: bun tools/deploy/precompress.ts <dist-dir>
// Already compressed formats (woff2, audio, png, webm, ...) are skipped.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.svg', '.json', '.webmanifest', '.md']);
/** Smaller files are not worth a second copy. */
const MIN_BYTES = 512;

export function precompress(dir: string): { files: number; savedBytes: number } {
  let files = 0;
  let savedBytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = precompress(path);
      files += nested.files;
      savedBytes += nested.savedBytes;
      continue;
    }
    if (!COMPRESSIBLE.has(extname(entry.name)) || statSync(path).size < MIN_BYTES) {
      continue;
    }
    const source = readFileSync(path);
    const packed = brotliCompressSync(source, {
      params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
    });
    if (packed.length < source.length) {
      writeFileSync(`${path}.br`, packed);
      files += 1;
      savedBytes += source.length - packed.length;
    }
  }
  return { files, savedBytes };
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: bun tools/deploy/precompress.ts <dist-dir>');
    process.exit(2);
  }
  const { files, savedBytes } = precompress(dir);
  console.log(`precompress: ${files} files, ${(savedBytes / 1024).toFixed(0)} KiB saved`);
}
