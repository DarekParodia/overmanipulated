// Kept free of imports so vite.config.ts can read it without loading zod or the simulation.

/**
 * Vite writes this into every `nonce` attribute of the built `index.html` (`html.cspNonce` in
 * vite.config.ts); the server's HTML shell replaces every occurrence with a fresh per-request
 * nonce, which the shell's Content-Security-Policy then names.
 */
export const CSP_NONCE_PLACEHOLDER = '__REDAKCJA_CSP_NONCE__';
