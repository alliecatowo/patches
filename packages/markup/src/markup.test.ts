import { describe, expect, it } from 'vitest';

import {
  looksLikeHtml,
  parseInline,
  parseMarkup,
  safeHref,
  type BlockNode,
  type InlineNode,
} from './markup.js';

/** Every inline node of a paragraph block, across its hard-broken lines. */
function paragraphInlines(block: BlockNode | undefined): InlineNode[] {
  if (block?.kind !== 'paragraph') throw new Error('expected a paragraph');
  return block.lines.flat();
}

const MARKDOWN_SAMPLE = [
  '# Release notes',
  '',
  'Shipped **bold** and *italic* text, plus `code` and a',
  '[link](https://patches.example/post/1).',
  '',
  '- first item',
  '- second item with @alice and #terminal',
  '',
  '1. ordered one',
  '2. ordered two',
  '',
  '> quoted line',
].join('\n');

const HTML_SAMPLE = [
  '<p>Shipped <b>bold</b> and <em>italic</em> text, plus <code>code</code> and a',
  '<a href="https://patches.example/post/1">link</a>.</p>',
  '<ul><li>first item</li><li>second item with @alice and #terminal</li></ul>',
  '<ol><li>ordered one</li><li>ordered two</li></ol>',
  '<blockquote>quoted line</blockquote>',
].join('\n');

describe('parseMarkup — markdown', () => {
  it('parses headings, emphasis, code, links, lists and quotes into one AST', () => {
    const blocks = parseMarkup(MARKDOWN_SAMPLE);
    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'quote',
    ]);

    const heading = blocks[0];
    expect(heading).toMatchObject({ kind: 'heading', level: 1 });

    const inlines = paragraphInlines(blocks[1]);
    const roles = inlines.map((node) => node.role);
    expect(roles).toContain('strong');
    expect(roles).toContain('emphasis');
    expect(roles).toContain('code');
    const link = inlines.find((node) => node.role === 'link');
    expect(link).toMatchObject({ text: 'link', href: 'https://patches.example/post/1' });

    const bullets = blocks[2];
    if (bullets?.kind !== 'list') throw new Error('expected a list');
    expect(bullets.ordered).toBe(false);
    expect(bullets.items).toHaveLength(2);

    const ordered = blocks[3];
    expect(ordered).toMatchObject({ kind: 'list', ordered: true });
  });

  it('keeps mentions and tags as their own roles inside list items', () => {
    const blocks = parseMarkup('- hello @alice about #terminal');
    const list = blocks[0];
    if (list?.kind !== 'list') throw new Error('expected a list');
    const item = paragraphInlines(list.items[0]?.[0]);
    expect(item.filter((node) => node.role === 'mention')).toHaveLength(1);
    expect(item.filter((node) => node.role === 'tag')).toHaveLength(1);
  });

  it('never treats an all-digit hash as a tag', () => {
    expect(parseInline('in #2026 and #patches').filter((node) => node.role === 'tag')).toEqual([
      { role: 'tag', text: '#patches' },
    ]);
  });

  it('renders fenced code verbatim, with no inline markup applied inside it', () => {
    const blocks = parseMarkup(['```', 'const x = **not bold**;', '```'].join('\n'));
    expect(blocks).toEqual([{ kind: 'code', lines: ['const x = **not bold**;'] }]);
  });
});

describe('parseMarkup — HTML subset', () => {
  it('produces the same block shape as the equivalent markdown', () => {
    expect(looksLikeHtml(HTML_SAMPLE)).toBe(true);
    const html = parseMarkup(HTML_SAMPLE).map((block) => block.kind);
    expect(html).toEqual(['paragraph', 'list', 'list', 'quote']);
  });

  it('maps every allowed tag onto an inline role and drops the rest to text', () => {
    const blocks = parseMarkup(
      '<p>a <b>bee</b> <i>sea</i> <code>dee</code> <span class="x">ee</span> <marquee>eff</marquee></p>',
    );
    const inlines = paragraphInlines(blocks[0]);
    const byRole = inlines.map((node) => [node.role, node.text.trim()]);
    expect(byRole).toContainEqual(['strong', 'bee']);
    expect(byRole).toContainEqual(['emphasis', 'sea']);
    expect(byRole).toContainEqual(['code', 'dee']);
    // Unsupported tags keep their text but contribute no role of their own.
    const flattened = inlines.map((node) => node.text).join('');
    expect(flattened).toContain('ee');
    expect(flattened).toContain('eff');
    expect(flattened).not.toContain('marquee');
    expect(flattened).not.toContain('<');
  });

  it('decodes entities without letting a numeric reference reintroduce an escape', () => {
    const blocks = parseMarkup('<p>a &amp; b &lt;c&gt; &#100; &#27; &#x1b;</p>');
    const text = paragraphInlines(blocks[0])
      .map((node) => node.text)
      .join('');
    expect(text).toContain('a & b <c> d');
    expect(text).not.toContain('');
  });

  it('treats <br> and <p> as block breaks', () => {
    expect(parseMarkup('<p>one</p><p>two</p>').map((b) => b.kind)).toEqual([
      'paragraph',
      'paragraph',
    ]);
    const brBlocks = parseMarkup('one<br>two');
    expect(brBlocks).toHaveLength(1);
    if (brBlocks[0]?.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(brBlocks[0].lines).toHaveLength(2);
  });
});

describe('parseMarkup — hostile input', () => {
  it('strips raw escape sequences before anything else sees them', () => {
    const hostile = 'safe[2Jwiped ]0;title [31mred';
    const text = paragraphInlines(parseMarkup(hostile)[0])
      .map((node) => node.text)
      .join('');
    expect(text).not.toContain('');
    expect(text).toContain('safe');
  });

  it('drops script and style contents entirely, not just their tags', () => {
    const blocks = parseMarkup(
      '<p>before</p><script>alert("x")</script><style>b{}</style><p>after</p>',
    );
    const joined = JSON.stringify(blocks);
    expect(joined).toContain('before');
    expect(joined).toContain('after');
    expect(joined).not.toContain('alert');
    expect(joined).not.toContain('script');
    expect(joined).not.toContain('b{}');
  });

  it('refuses to make a link out of a scheme that can execute', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html;base64,AAA')).toBeUndefined();
    expect(safeHref('https://patches.example/ok')).toBe('https://patches.example/ok');

    const html = paragraphInlines(parseMarkup('<a href="javascript:alert(1)">click</a>')[0]);
    expect(html.every((node) => node.role !== 'link')).toBe(true);
    expect(html.map((node) => node.text).join('')).toContain('click');

    const markdown = paragraphInlines(parseMarkup('[click](javascript:alert(1))')[0]);
    expect(markdown.every((node) => node.role !== 'link')).toBe(true);
  });

  it('survives unbalanced and deeply nested tags without throwing', () => {
    expect(() => parseMarkup('<b><i>unclosed <ul><li>item')).not.toThrow();
    expect(() => parseMarkup('</b></ul></li>stray closes')).not.toThrow();
    const blocks = parseMarkup('<b><i>unclosed <ul><li>item');
    expect(JSON.stringify(blocks)).toContain('item');
  });
});

describe('AST shape', () => {
  it('is serialisable data with no functions, so every client can share it', () => {
    const blocks: BlockNode[] = parseMarkup(MARKDOWN_SAMPLE);
    expect(() => JSON.stringify(blocks)).not.toThrow();
    expect(JSON.parse(JSON.stringify(blocks))).toEqual(blocks);
  });

  it('returns an empty array for empty/whitespace-only input', () => {
    expect(parseMarkup('')).toEqual([]);
    expect(parseMarkup('   \n  ')).toEqual([]);
  });
});
