// Generates config/config.schema.json (editor completion and checks for config.json) from the
// server's zod schema. Run `bun run config:schema` after changing apps/server/src/config.ts;
// config-schema.test.ts fails while the committed file is stale.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serverConfigJsonSchema } from '../../apps/server/src/config.ts';

export const CONFIG_SCHEMA_PATH = fileURLToPath(
  new URL('../../config/config.schema.json', import.meta.url),
);

/** The committed JSON Schema: the server's input-side schema plus a title. */
export function configJsonSchema(): Record<string, unknown> {
  return {
    ...serverConfigJsonSchema(),
    title: 'Redakcja na Ostatnią Chwilę: server config.json',
  };
}

if (import.meta.main) {
  writeFileSync(CONFIG_SCHEMA_PATH, `${JSON.stringify(configJsonSchema(), null, 2)}\n`);
  // Same layout as `bun run format` would give, so lint stays green after regenerating.
  const format = Bun.spawnSync(['bun', 'x', 'biome', 'format', '--write', CONFIG_SCHEMA_PATH]);
  if (format.exitCode !== 0) {
    console.error(format.stderr.toString());
    process.exit(1);
  }
  console.log(`wrote ${CONFIG_SCHEMA_PATH}`);
}
