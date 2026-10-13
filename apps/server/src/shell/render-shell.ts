// Renders the HTML shell (S7-70) from the built client `index.html`: every nonce placeholder Vite
// wrote (`html.cspNonce`) becomes this request's nonce, and the head gains the AdSense
// verification meta tag (when wanted) and the public config as embedded JSON, so the client's
// first render already knows the feature flags, the MOTD and the ads block. Pure.
import {
  CSP_NONCE_PLACEHOLDER,
  PUBLIC_CONFIG_ELEMENT_ID,
  type PublicConfig,
} from '@redakcja/shared';
import { CSP_NONCE_BYTES } from '../limits.ts';

const HEAD_END = '</head>';

/** A fresh nonce: base64 of {@link CSP_NONCE_BYTES} random bytes. `fill` is for tests. */
export function createNonce(
  fill: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  return Buffer.from(fill(new Uint8Array(CSP_NONCE_BYTES))).toString('base64');
}

/**
 * JSON safe inside `<script type="application/json">`: `<` is escaped, so operator text such as
 * a MOTD with `</script>` or `<!--` can never close or comment out the element; U+2028 and
 * U+2029 are escaped too (valid in JSON, line breaks to older JavaScript parsers). The result is
 * still plain JSON: `JSON.parse` gives back the same value.
 */
export function jsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const ATTRIBUTE_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
};

/** Text safe inside a quoted HTML attribute value. */
export function escapeAttribute(value: string): string {
  return value.replace(/[&"<>']/g, (ch) => ATTRIBUTE_ESCAPES[ch] ?? ch);
}

export type ShellInput = {
  nonce: string;
  publicConfig: PublicConfig;
  /** AdSense publisher id for the verification meta tag; null leaves the tag out. */
  adsAccount: string | null;
};

/**
 * The page for one request. Placeholders are replaced before anything is inserted, so operator
 * text that happens to contain the placeholder is never turned into the nonce.
 */
export function renderShell(template: string, input: ShellInput): string {
  const html = template.replaceAll(CSP_NONCE_PLACEHOLDER, input.nonce);
  const head: string[] = [];
  if (input.adsAccount !== null) {
    head.push(
      `<meta name="google-adsense-account" content="${escapeAttribute(input.adsAccount)}">`,
    );
  }
  head.push(
    `<script id="${PUBLIC_CONFIG_ELEMENT_ID}" type="application/json">${jsonForHtml(input.publicConfig)}</script>`,
  );
  const at = html.indexOf(HEAD_END);
  if (at < 0) {
    throw new Error('HTML shell template has no </head>');
  }
  return `${html.slice(0, at)}${head.join('\n')}\n${html.slice(at)}`;
}
