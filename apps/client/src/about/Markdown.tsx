// Renders markdown-lite blocks (packages/shared/src/markdown-lite.ts) with React (S7-103): every
// string is a text node, so nothing in a fetched document can inject markup; there is no
// dangerouslySetInnerHTML anywhere. Headings start one level below the dialog's own title.
// Links to other sites open in a new tab (`noopener noreferrer`); same-site paths stay in it.
import { inlineText, type MdBlock, type MdInline } from '@redakcja/shared';
import type { ReactNode } from 'react';
import { typeset } from '../strings/typography.ts';
import styles from './About.module.css';

function Inline({ children }: { children: readonly MdInline[] }): ReactNode {
  return children.map((node, index) => inline(node, `${node.type}-${index}`));
}

function inline(node: MdInline, key: string): ReactNode {
  switch (node.type) {
    case 'text':
      return typeset(node.text);
    case 'code':
      return (
        <code key={key} className={styles.code}>
          {node.text}
        </code>
      );
    case 'bold':
      return (
        <strong key={key}>
          <Inline>{node.children}</Inline>
        </strong>
      );
    case 'link': {
      const external = node.href.startsWith('https://');
      return (
        <a
          key={key}
          className={styles.link}
          href={node.href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          <Inline>{node.children}</Inline>
        </a>
      );
    }
  }
}

function Block({ block }: { block: MdBlock }): ReactNode {
  switch (block.type) {
    case 'heading': {
      // The dialog title is the h2: a document's # is an h3, ## and ### an h4.
      const Heading = block.level === 1 ? 'h3' : 'h4';
      return (
        <Heading className={styles.mdHeading}>
          <Inline>{block.children}</Inline>
        </Heading>
      );
    }
    case 'paragraph':
      return (
        <p className={styles.mdParagraph}>
          <Inline>{block.children}</Inline>
        </p>
      );
    case 'list':
      return (
        <ul className={styles.mdList}>
          {block.items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a static document; items never move.
            <li key={index}>
              <Inline>{item}</Inline>
            </li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.stack}`}>
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns never move.
                  <th key={index} scope="col">
                    <Inline>{cell}</Inline>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows never move.
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: columns never move.
                    <td key={index} data-label={inlineText(block.header[index] ?? [])}>
                      <Inline>{cell}</Inline>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'section':
      return <Markdown blocks={block.children} />;
  }
}

export function Markdown({ blocks }: { blocks: readonly MdBlock[] }) {
  return blocks.map((block, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a static document; blocks never move.
    <Block key={index} block={block} />
  ));
}
