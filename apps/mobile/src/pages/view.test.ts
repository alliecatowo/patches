import { describe, expect, it } from 'vitest';

import type { RenderablePageBlock } from '@patches/domain';

import { guestbookEntryBody, subPageTabLabel, toBlockView, toBlockViews } from './view.js';

describe('toBlockView', () => {
  it('maps Text and Markdown to sanitized multiline bodies', () => {
    expect(toBlockView({ type: 'Text', body: 'a\n\u001B[2Jb' })).toEqual({
      kind: 'body',
      text: 'a\nb',
    });
    expect(toBlockView({ type: 'Markdown', body: '**hi**' })).toEqual({
      kind: 'body',
      text: '**hi**',
    });
  });

  it('maps AsciiArt to a monospace body', () => {
    expect(toBlockView({ type: 'AsciiArt', art: '^_^' })).toEqual({ kind: 'ascii', art: '^_^' });
  });

  it('maps Hero with an optional subtitle', () => {
    expect(toBlockView({ type: 'Hero', title: 'Hi' })).toEqual({
      kind: 'hero',
      title: 'Hi',
      subtitle: null,
    });
    expect(toBlockView({ type: 'Hero', title: 'Hi', subtitle: 'there' })).toEqual({
      kind: 'hero',
      title: 'Hi',
      subtitle: 'there',
    });
  });

  it('maps NowPlaying', () => {
    expect(toBlockView({ type: 'NowPlaying', text: 'song' })).toEqual({
      kind: 'nowPlaying',
      text: 'song',
    });
  });

  it('maps Spacer sizes to pixel heights', () => {
    expect(toBlockView({ type: 'Spacer', size: 'sm' })).toEqual({ kind: 'spacer', height: 16 });
    expect(toBlockView({ type: 'Spacer' })).toEqual({ kind: 'spacer', height: 32 });
    expect(toBlockView({ type: 'Spacer', size: 'lg' })).toEqual({ kind: 'spacer', height: 48 });
  });

  it('maps Image with sanitized alt', () => {
    expect(
      toBlockView({
        type: 'Image',
        mediaId: '01919c90-5e94-7d38-a3c2-8e69e12b700f',
        alt: 'a\u0000b',
      }),
    ).toEqual({
      kind: 'image',
      mediaId: '01919c90-5e94-7d38-a3c2-8e69e12b700f',
      alt: 'ab',
    });
  });

  it('maps Links entries, re-validating each href http(s)-only', () => {
    const view = toBlockView({
      type: 'Links',
      links: [
        { label: 'Site', href: 'https://patches.example' },
        { label: 'Bad', href: 'javascript:alert(1)' },
        { label: '', href: 'http://bare-href.example' },
      ],
    });
    expect(view).toEqual({
      kind: 'links',
      entries: [
        { label: 'Site', href: 'https://patches.example', rawHref: 'https://patches.example' },
        { label: 'Bad', href: null, rawHref: 'javascript:alert(1)' },
        { label: '', href: 'http://bare-href.example', rawHref: 'http://bare-href.example' },
      ],
    });
  });

  it('maps Posts and Guestbook with their default limits', () => {
    expect(toBlockView({ type: 'Posts' })).toEqual({ kind: 'posts', limit: 5 });
    expect(toBlockView({ type: 'Posts', limit: 10 })).toEqual({ kind: 'posts', limit: 10 });
    expect(toBlockView({ type: 'Guestbook' })).toEqual({ kind: 'guestbook', limit: 20 });
    expect(toBlockView({ type: 'Guestbook', limit: 3 })).toEqual({ kind: 'guestbook', limit: 3 });
  });

  it('splits TopEight refs into local handles and remote refs', () => {
    const view = toBlockView({ type: 'TopEight', actors: ['@mrb', '@cadence@node.example', '@'] });
    expect(view).toEqual({
      kind: 'topEight',
      entries: [
        { ref: '@mrb', localHandle: 'mrb' },
        { ref: '@cadence@node.example', localHandle: null },
        { ref: '@', localHandle: null },
      ],
    });
  });

  it('maps unsupported v1 block types and Unknown blocks to visible placeholders', () => {
    expect(
      toBlockView({ type: 'Gallery', mediaIds: ['01919c90-5e94-7d38-a3c2-8e69e12b700f'] }),
    ).toMatchObject({ kind: 'placeholder' });
    expect(toBlockView({ type: 'Friends' })).toMatchObject({ kind: 'placeholder' });
    expect(toBlockView({ type: 'Badges' })).toMatchObject({ kind: 'placeholder' });
    expect(toBlockView({ type: 'Unknown', originalType: 'Hologram' })).toEqual({
      kind: 'placeholder',
      label: '[unsupported block: Hologram]',
    });
  });

  it('toBlockViews keeps block order', () => {
    const blocks: RenderablePageBlock[] = [
      { type: 'Spacer', size: 'sm' },
      { type: 'Text', body: 'x' },
    ];
    expect(toBlockViews(blocks).map((view) => view.kind)).toEqual(['spacer', 'body']);
  });
});

describe('subPageTabLabel', () => {
  it('uses the title when present, else the slug', () => {
    expect(subPageTabLabel({ slug: 'index', title: 'Home', blocks: [] })).toBe('Home');
    expect(subPageTabLabel({ slug: 'about', title: '', blocks: [] })).toBe('about');
  });
});

describe('guestbookEntryBody', () => {
  it('sanitizes RPC-sourced bodies for render', () => {
    expect(guestbookEntryBody('hi\u0000there\u001B[2J!')).toBe('hithere!');
    expect(guestbookEntryBody('line1\nline2')).toBe('line1\nline2');
  });
});
