// Markdown-lite (S7-75): a small, pure parser for the few documents the game serves itself (the
// privacy page at /prywatnosc; later the credits). It returns an AST, never HTML: the server
// renders it with escaping and the client with React, so no input can inject markup either way.
// Only this subset is interpreted; everything else stays literal text:
// - `#`, `##`, `###` headings;
// - paragraphs (blank-line separated, soft line breaks joined with a space);
// - `- ` lists (an indented line continues the item above);
// - pipe tables with a `| --- |` row under the header;
// - `**bold**`, `` `code` ``, `[text](url)` links (url `https://…` or a same-site `/path` only;
//   any other link keeps its text and loses the link);
// - conditional blocks: a line `<!-- name -->` opens and `<!-- /name -->` closes one; the block
//   is kept only when `flags[name]` is true (an unknown name is dropped); blocks may nest;
// - variables `{{key|fallback}}`: `vars[key]` when set and not blank, else the fallback text
//   (which lives in the document, so no Polish sits in code). Values are plain text.
// Any other whole-line HTML comment is an authoring note and is dropped.

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold'; children: MdInline[] }
  | { type: 'link'; href: string; children: MdInline[] };

export type MdBlock =
  | { type: 'heading'; level: 1 | 2 | 3; children: MdInline[] }
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'list'; items: MdInline[][] }
  | { type: 'table'; header: MdInline[][]; rows: MdInline[][][] }
  /** A conditional block that was kept; `name` is its flag (e.g. `ads`). */
  | { type: 'section'; name: string; children: MdBlock[] };

export type MarkdownLiteContext = {
  vars?: Readonly<Record<string, string | undefined>>;
  flags?: Readonly<Record<string, boolean>>;
};

/** `https://…` or a same-site path; never `//host`, `/\host`, whitespace or another scheme. */
const SAFE_HREF = /^(?:https:\/\/[^\s\\]+|\/(?![/\\])[^\s\\]*)$/;
const HEADING = /^(#{1,3})\s+(.+)$/;
const LIST_ITEM = /^-\s+(.*)$/;
const BLOCK_MARKER = /^<!--\s*(\/?)([a-z][a-z0-9-]*)\s*-->$/;
const COMMENT_LINE = /^<!--.*-->$/;
const TABLE_RULE = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?$/;
/** Inline tokens, earliest match wins: variable, code, bold, link. */
const INLINE =
  /\{\{([A-Za-z][\w.]*)(?:\|([^}]*))?\}\}|`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Whether `href` may become a link. */
export function isSafeHref(href: string): boolean {
  return SAFE_HREF.test(href);
}

function pushText(out: MdInline[], text: string): void {
  if (text === '') return;
  const last = out.at(-1);
  if (last?.type === 'text') {
    last.text += text;
  } else {
    out.push({ type: 'text', text });
  }
}

function variable(ctx: MarkdownLiteContext, key: string, fallback: string | undefined): string {
  const value = ctx.vars?.[key];
  return value !== undefined && value.trim() !== '' ? value : (fallback ?? '');
}

/** Inline content of one line (or one table cell). */
export function parseInline(source: string, ctx: MarkdownLiteContext = {}): MdInline[] {
  const out: MdInline[] = [];
  let at = 0;
  for (const match of source.matchAll(INLINE)) {
    pushText(out, source.slice(at, match.index));
    at = match.index + match[0].length;
    const [, key, fallback, code, bold, linkText, href] = match;
    if (key !== undefined) {
      pushText(out, variable(ctx, key, fallback));
    } else if (code !== undefined) {
      out.push({ type: 'code', text: code });
    } else if (bold !== undefined) {
      out.push({ type: 'bold', children: parseInline(bold, ctx) });
    } else if (linkText !== undefined && href !== undefined) {
      const children = parseInline(linkText, ctx);
      if (isSafeHref(href)) {
        out.push({ type: 'link', href, children });
      } else {
        for (const child of children) {
          if (child.type === 'text') pushText(out, child.text);
          else out.push(child);
        }
      }
    }
  }
  pushText(out, source.slice(at));
  return out;
}

/** Splits a table row on `|`, leaving pipes inside `{{…}}` and `` `…` `` alone. */
export function splitTableRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let inCode = false;
  let inVar = false;
  for (let i = 0; i < body.length; i += 1) {
    const char = body.charAt(i);
    if (!inCode && body.startsWith('{{', i)) inVar = true;
    if (inVar && body.startsWith('}}', i)) inVar = false;
    if (char === '`' && !inVar) inCode = !inCode;
    if (char === '|' && !inCode && !inVar) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

type Frame = { name: string | null; blocks: MdBlock[] };

/** Parses a markdown-lite document into blocks, with conditional blocks already resolved. */
export function parseMarkdownLite(source: string, ctx: MarkdownLiteContext = {}): MdBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const root: Frame = { name: null, blocks: [] };
  const stack: Frame[] = [root];
  const current = () => stack.at(-1) ?? root;
  const inline = (text: string) => parseInline(text, ctx);

  let paragraph: string[] = [];
  let list: string[] = [];
  let table: string[] = [];

  const flush = () => {
    const blocks = current().blocks;
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', children: inline(paragraph.join(' ')) });
    }
    if (list.length > 0) {
      blocks.push({ type: 'list', items: list.map(inline) });
    }
    if (table.length > 0) {
      const [head = '', rule = '', ...rest] = table;
      if (TABLE_RULE.test(rule)) {
        blocks.push({
          type: 'table',
          header: splitTableRow(head).map(inline),
          rows: rest.map((row) => splitTableRow(row).map(inline)),
        });
      } else {
        // Not a table after all: the lines read as one paragraph.
        blocks.push({ type: 'paragraph', children: inline(table.join(' ')) });
      }
    }
    paragraph = [];
    list = [];
    table = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    const marker = BLOCK_MARKER.exec(line);
    if (marker) {
      flush();
      const [, closing, name = ''] = marker;
      if (closing === '') {
        stack.push({ name, blocks: [] });
      } else if (stack.length > 1 && current().name === name) {
        closeFrame(stack, ctx);
      }
      continue;
    }
    if (COMMENT_LINE.test(line)) {
      continue;
    }
    if (line === '') {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = (heading[1] ?? '#').length;
      current().blocks.push({
        type: 'heading',
        level: level === 1 ? 1 : level === 2 ? 2 : 3,
        children: inline(heading[2] ?? ''),
      });
      continue;
    }
    if (line.startsWith('|')) {
      if (table.length === 0) flush();
      table.push(line);
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      if (list.length === 0) flush();
      list.push(item[1] ?? '');
      continue;
    }
    if (list.length > 0 && raw !== line && /^\s/.test(raw)) {
      // An indented line continues the list item above it.
      list[list.length - 1] = `${list.at(-1) ?? ''} ${line}`;
      continue;
    }
    if (paragraph.length === 0) flush();
    paragraph.push(line);
  }
  flush();
  // An unclosed block ends with the document.
  while (stack.length > 1) {
    closeFrame(stack, ctx);
  }
  return root.blocks;
}

function closeFrame(stack: Frame[], ctx: MarkdownLiteContext): void {
  const frame = stack.pop();
  const parent = stack.at(-1);
  if (!frame || !parent || frame.name === null) return;
  if (ctx.flags?.[frame.name] === true) {
    parent.blocks.push({ type: 'section', name: frame.name, children: frame.blocks });
  }
}

/** The plain text of inline content (for titles and accessible names). */
export function inlineText(children: readonly MdInline[]): string {
  return children
    .map((child) =>
      child.type === 'text' || child.type === 'code' ? child.text : inlineText(child.children),
    )
    .join('');
}

/** The document title: the text of the first level-1 heading, or null without one. */
export function markdownTitle(blocks: readonly MdBlock[]): string | null {
  for (const block of blocks) {
    if (block.type === 'heading' && block.level === 1) return inlineText(block.children);
    if (block.type === 'section') {
      const title = markdownTitle(block.children);
      if (title !== null) return title;
    }
  }
  return null;
}
