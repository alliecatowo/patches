import { describe, expect, it } from 'vitest';

import { cellWidth } from './measure.js';
import {
  extractTags,
  layoutMarkup,
  lineText,
  looksLikeHtml,
  measureMarkupHeight,
  parseInline,
  parseMarkup,
  safeHref,
  type BlockNode,
  type InlineNode,
} from './markup.js';

describe('extractTags', () => {
  it('collects distinct #tags, lowercased, in first-appearance order', () => {
    expect(extractTags('loving #Patches and #patches, also #TUI')).toEqual(['patches', 'tui']);
  });

  it('never treats an all-digits run as a tag', () => {
    expect(extractTags('see you in #2026')).toEqual([]);
  });

  it('returns an empty list for text with no tags', () => {
    expect(extractTags('no tags here')).toEqual([]);
  });
});

function render(source: string, width = 40, plain = false): string[] {
  return layoutMarkup(parseMarkup(source), width, { plain }).map(lineText);
}

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
    const lines = render(['```', 'const x = **not bold**;', '```'].join('\n'));
    expect(lines).toEqual(['const x = **not bold**;']);
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
    const lines = render('<p>a &amp; b &lt;c&gt; &#100; &#27; &#x1b;</p>');
    expect(lines[0]).toContain('a & b <c> d');
    expect(lines.join('')).not.toContain('\u001B');
  });

  it('treats <br> and <p> as block breaks', () => {
    expect(render('<p>one</p><p>two</p>').filter((line) => line.trim() !== '')).toEqual([
      'one',
      'two',
    ]);
    expect(render('one<br>two').filter((line) => line.trim() !== '')).toEqual(['one', 'two']);
  });
});

describe('parseMarkup — hostile input', () => {
  it('strips raw escape sequences before anything else sees them', () => {
    const hostile = 'safe\u001B[2Jwiped \u001B]0;title \u001B[31mred';
    const lines = render(hostile);
    const joined = lines.join('\n');
    expect(joined).not.toContain('\u001B');
    expect(joined).not.toContain('');
    expect(joined).toContain('safe');
  });

  it('drops script and style contents entirely, not just their tags', () => {
    const lines = render('<p>before</p><script>alert("x")</script><style>b{}</style><p>after</p>');
    const joined = lines.join('\n');
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
    const lines = render('<b><i>unclosed <ul><li>item');
    expect(lines.join('\n')).toContain('item');
  });
});

describe('layoutMarkup', () => {
  it('never emits a line wider than the budget, including emoji and CJK', () => {
    const source = 'family 👨‍👩‍👧‍👦 emoji 🎉🎉🎉 and 日本語のテキストがここにあります plus a long tail';
    for (const width of [12, 20, 40, 72]) {
      for (const line of render(source, width)) {
        expect(cellWidth(line), `width ${String(width)}: ${line}`).toBeLessThanOrEqual(width);
      }
    }
  });

  it('breaks an over-long unbroken word instead of overflowing', () => {
    const url = `https://patches.example/${'x'.repeat(120)}`;
    for (const line of render(url, 30)) expect(cellWidth(line)).toBeLessThanOrEqual(30);
  });

  it('measures exactly the number of rows it renders', () => {
    for (const source of [MARKDOWN_SAMPLE, HTML_SAMPLE, 'short', '']) {
      for (const width of [20, 40, 80]) {
        const rendered = layoutMarkup(parseMarkup(source), width);
        expect(measureMarkupHeight(source, width)).toBe(Math.max(1, rendered.length));
      }
    }
  });

  it('prefixes list items and quotes so structure survives without colour', () => {
    const lines = render('- one\n- two');
    expect(lines[0]).toBe('• one');
    expect(render('1. one\n2. two')[0]).toBe('1. one');
    expect(render('> quoted')[0]).toBe('> quoted');
  });
});

describe('plain mode', () => {
  it('shows source markers instead of decoration, for markdown and HTML alike', () => {
    const fromMarkdown = render('**bold** *it* `code` [text](https://e.example)', 60, true).join(
      '\n',
    );
    expect(fromMarkdown).toContain('**bold**');
    expect(fromMarkdown).toContain('*it*');
    expect(fromMarkdown).toContain('`code`');
    expect(fromMarkdown).toContain('[text](https://e.example)');

    const fromHtml = render(
      '<b>bold</b> <em>it</em> <code>code</code> <a href="https://e.example">text</a>',
      60,
      true,
    ).join('\n');
    expect(fromHtml).toContain('**bold**');
    expect(fromHtml).toContain('*it*');
    expect(fromHtml).toContain('`code`');
    expect(fromHtml).toContain('[text](https://e.example)');
  });

  it('marks headings and list bullets with their source characters', () => {
    expect(render('# Title', 40, true)[0]).toBe('# Title');
    expect(render('- item', 40, true)[0]).toBe('- item');
  });

  it('carries no role other than text, so nothing can be styled', () => {
    const lines = layoutMarkup(parseMarkup(MARKDOWN_SAMPLE), 40, { plain: true });
    for (const line of lines) {
      for (const run of line.runs) expect(run.role).toBe('text');
    }
  });
});

describe('AST shape', () => {
  it('is serialisable data with no functions, so the web client can share it', () => {
    const blocks: BlockNode[] = parseMarkup(MARKDOWN_SAMPLE);
    expect(() => JSON.stringify(blocks)).not.toThrow();
    expect(JSON.parse(JSON.stringify(blocks))).toEqual(blocks);
  });
});
