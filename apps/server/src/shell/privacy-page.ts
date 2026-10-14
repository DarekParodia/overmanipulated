// The privacy page at /prywatnosc (S7-75): docs/privacy.pl.md parsed with the shared
// markdown-lite AST and rendered here as a small standalone HTML document. Every text node and
// attribute is escaped, so neither the document nor operator values from config.json can inject
// markup. The page loads no script and no external resource, so the base CSP holds for it.
import {
  type MdBlock,
  type MdInline,
  markdownTitle,
  type PublicAds,
  parseMarkdownLite,
} from '@redakcja/shared';
import type { ServerConfig } from '../config.ts';
import { escapeAttribute } from './render-shell.ts';

const escapeText = escapeAttribute;

/**
 * Which conditional blocks of the privacy note show, from the ads decision for the request host
 * (the same one the HTML shell and `/api/config` make):
 * - `ads` / `no-ads`: ads run on this address or not;
 * - `ads-limited`: limited ads (no ad cookies or local storage; the only mode for minors);
 * - `ads-minors`: requests carry an age tag (child or teen treatment);
 * - `ads-cookies`: non-personalised ads, which may use cookies (adult audiences only).
 */
export function privacyFlags(ads: PublicAds): Record<string, boolean> {
  return {
    ads: ads.enabled,
    'no-ads': !ads.enabled,
    'ads-limited': ads.enabled && ads.mode === 'limited',
    'ads-minors': ads.enabled && ads.ageTreatment !== 'unspecified',
    'ads-cookies': ads.enabled && ads.mode === 'nonPersonalized',
  };
}

/** Operator values from config.json the privacy note may name (`{{operator.name|…}}`). */
export function privacyVars(config: ServerConfig): Record<string, string | undefined> {
  const { operator, publicOrigin } = config.site;
  return {
    'operator.name': operator.name,
    'operator.contact': operator.contact,
    'operator.hosting': operator.hosting,
    'site.origin': publicOrigin,
  };
}

function inlineNodeHtml(node: MdInline): string {
  switch (node.type) {
    case 'text':
      return escapeText(node.text);
    case 'code':
      return `<code>${escapeText(node.text)}</code>`;
    case 'bold':
      return `<strong>${inlineHtml(node.children)}</strong>`;
    case 'link': {
      // Other sites open without our address as referrer and without a handle on this tab.
      const rel = node.href.startsWith('/') ? '' : ' rel="noopener noreferrer"';
      return `<a href="${escapeAttribute(node.href)}"${rel}>${inlineHtml(node.children)}</a>`;
    }
  }
}

function inlineHtml(children: readonly MdInline[]): string {
  return children.map(inlineNodeHtml).join('');
}

function cellsHtml(cells: readonly MdInline[][], tag: 'th' | 'td'): string {
  return `<tr>${cells.map((cell) => `<${tag}>${inlineHtml(cell)}</${tag}>`).join('')}</tr>`;
}

function blockHtml(block: MdBlock): string {
  switch (block.type) {
    case 'heading':
      return `<h${block.level}>${inlineHtml(block.children)}</h${block.level}>`;
    case 'paragraph':
      return `<p>${inlineHtml(block.children)}</p>`;
    case 'list':
      return `<ul>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</ul>`;
    case 'table': {
      const rows = block.rows.map((row) => cellsHtml(row, 'td')).join('');
      return `<div class="table"><table><thead>${cellsHtml(block.header, 'th')}</thead><tbody>${rows}</tbody></table></div>`;
    }
    case 'section':
      return `<div data-block="${escapeAttribute(block.name)}">${blocksHtml(block.children)}</div>`;
  }
}

/** HTML for markdown-lite blocks; conditional blocks become `<div data-block="name">`. */
export function blocksHtml(blocks: readonly MdBlock[]): string {
  return blocks.map(blockHtml).join('\n');
}

/** A readable column in the system's own colours; no colour literal, no external font. */
const PAGE_STYLE = [
  ':root{color-scheme:light dark}',
  'body{margin:0;padding:1rem;font:1.0625rem/1.5 system-ui,sans-serif;overflow-wrap:break-word}',
  'main{max-width:40rem;margin:0 auto}',
  'h1{line-height:1.2}',
  '.table{overflow-x:auto}',
  'table{border-collapse:collapse;min-width:100%}',
  'th,td{border:1px solid currentColor;padding:.4rem .5rem;text-align:left;vertical-align:top}',
].join('');

/** The whole /prywatnosc document. */
export function renderPrivacyPage(
  markdown: string,
  ctx: { vars: Record<string, string | undefined>; flags: Record<string, boolean> },
): string {
  const blocks = parseMarkdownLite(markdown, ctx);
  const title = markdownTitle(blocks) ?? '';
  return [
    '<!doctype html>',
    '<html lang="pl">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(title)}</title>`,
    `<style>${PAGE_STYLE}</style>`,
    '</head>',
    '<body>',
    `<main>\n${blocksHtml(blocks)}\n</main>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
