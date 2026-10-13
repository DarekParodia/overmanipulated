// Default file locations, resolved from this module so the working directory does not matter.
// The repository layout and the Docker image (WORKDIR /app) agree, so the same defaults hold in
// both; env vars (CONFIG_PATH, SHELL_HTML_PATH, PRIVACY_MD_PATH) override them.
import { fileURLToPath } from 'node:url';

/** Operator config; absent means defaults (see config.ts). */
export const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL('../../../config/config.json', import.meta.url),
);
/** Built client page the server renders the HTML shell from (S7-70). */
export const DEFAULT_SHELL_HTML_PATH = fileURLToPath(
  new URL('../../client/dist/index.html', import.meta.url),
);
/** Privacy note rendered at /prywatnosc (S7-75). */
export const DEFAULT_PRIVACY_MD_PATH = fileURLToPath(
  new URL('../../../docs/privacy.pl.md', import.meta.url),
);
