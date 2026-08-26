import type { RenderablePageBlock } from '@patches/domain';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { scenario, signedInAs } from '../../.storybook/decorators.js';
import { pageDocumentBytes, photoDataUri, viewerActor } from '../../.storybook/fixtures.js';
import { registerStorybookMedia } from '../../.storybook/mocks/apiClient.js';
import { decodePageDocument } from '../lib/page.js';
import { PageBlocks } from './PageBlocks.js';

registerStorybookMedia('gallery-a', photoDataUri('a', '#6b46c1'));
registerStorybookMedia('gallery-b', photoDataUri('b', '#2f855a'));
registerStorybookMedia('gallery-c', photoDataUri('c', '#2b6cb0'));
registerStorybookMedia('gallery-d', photoDataUri('d', '#b7791f'));

const meta = {
  title: 'Design System/PageBlocks',
  component: PageBlocks,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof PageBlocks>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every inert block type: text/markup/hero/art/links/images/spacers, plus one
 * unsupported type degrading to the visible placeholder (§171 "never fail the page"). */
const staticBlocks: RenderablePageBlock[] = [
  { type: 'Hero', title: 'fixture page', subtitle: 'chronological or nothing' },
  { type: 'Text', body: 'A plain Text block with a hard\nline break in the middle.' },
  { type: 'Markdown', body: 'Markdown block with **strong** and *emphasis*.' },
  { type: 'NowPlaying', text: 'fixture track — 00:00/03:33' },
  {
    type: 'AsciiArt',
    art: '  ___  \n |___| \n |___| ',
  },
  {
    type: 'Links',
    links: [
      { label: 'safe fixture link', href: 'https://example.com/fixture' },
      { label: 'inert javascript: link', href: 'javascript:alert(1)' },
    ],
  },
  {
    type: 'Gallery',
    caption: 'four synthetic tiles',
    mediaIds: ['gallery-a', 'gallery-b', 'gallery-c', 'gallery-d'],
  },
  { type: 'Spacer', size: 'md' },
  { type: 'Badges' } as RenderablePageBlock,
];

export const StaticBlocks: Story = {
  args: { blocks: staticBlocks },
};

/** No render context: the live blocks fall back to their visible placeholders. */
export const LiveBlocksWithoutContext: Story = {
  args: {
    blocks: [
      { type: 'Posts', limit: 5 },
      { type: 'TopEight', actors: ['@fixture-friend'] },
      { type: 'Guestbook', limit: 20 },
      { type: 'Friends', limit: 8 },
    ],
  },
};

/** Live blocks with a context: Posts/TopEight/Guestbook/Friends all fetch from the
 * scenario mock (the same fixtures PageRoute/ProfileRoute stories use). */
export const LiveBlocksWithContext: Story = {
  args: {
    blocks: [
      { type: 'Text', body: 'Live blocks below resolve against the Storybook mock client.' },
      { type: 'Posts', limit: 5 },
      {
        type: 'TopEight',
        actors: ['@fixture-friend', '@fixture-missing', '@nomad@other.example'],
      },
      { type: 'Guestbook', limit: 20 },
      { type: 'Friends', limit: 8 },
    ],
    context: { handle: 'allie', slug: 'home', ownerActorId: 'actor-1' },
  },
  decorators: [signedInAs(viewerActor)],
};

/** The document-decode path end to end: raw JSON bytes → PatchesPageView → blocks —
 * exactly what PageRoute hands this component off the wire. */
export const FromDocumentBytes: Story = {
  args: { blocks: [] },
  decorators: [
    scenario(),
    (Story) => {
      const view = decodePageDocument(
        pageDocumentBytes({
          version: 1,
          pages: [{ slug: 'home', title: 'Home', blocks: staticBlocks }],
        }),
      );
      return <Story args={{ blocks: view?.pages[0]?.blocks ?? [] }} />;
    },
  ],
};
