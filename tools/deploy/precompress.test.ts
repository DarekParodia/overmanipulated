import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { precompress } from './precompress.ts';

let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('precompress', () => {
  it('writes .br files for compressible build output only', () => {
    dir = mkdtempSync(join(tmpdir(), 'precompress-'));
    mkdirSync(join(dir, 'assets'));
    const js = 'export const x = "redakcja";\n'.repeat(100);
    writeFileSync(join(dir, 'assets', 'app-abcd1234.js'), js);
    writeFileSync(join(dir, 'assets', 'font.woff2'), 'x'.repeat(2000));
    writeFileSync(join(dir, 'tiny.html'), '<p>hi</p>');

    const result = precompress(dir);

    expect(result.files).toBe(1);
    const packed = readFileSync(join(dir, 'assets', 'app-abcd1234.js.br'));
    expect(brotliDecompressSync(packed).toString()).toBe(js);
    expect(existsSync(join(dir, 'assets', 'font.woff2.br'))).toBe(false);
    expect(existsSync(join(dir, 'tiny.html.br'))).toBe(false);
  });
});
