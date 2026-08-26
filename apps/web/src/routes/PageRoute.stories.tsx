import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { scenario } from '../../.storybook/decorators.js';
import {
  makeActor,
  makePost,
  pageDocumentBytes,
  pageDocumentFixture,
} from '../../.storybook/fixtures.js';
import {
  setStoryActor,
  setStoryPageDocument,
  setStoryPosts,
} from '../../.storybook/mocks/apiClient.js';
import { PageRoute } from './PageRoute.js';

const meta = {
  title: 'Routes/Page',
  component: PageRoute,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/page/@allie']}>
        <Routes>
          <Route path="/page/:handle/:slug?" element={<Story />} />
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof PageRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default page: sub-page tabs, pinned strip, themed blocks. */
export const FullPage: Story = {
  decorators: [
    scenario(() => {
      setStoryPageDocument(pageDocumentFixture());
      setStoryActor(makeActor({ id: 'actor-1', handle: 'allie', pinnedPostIds: ['pin-1'] }));
      setStoryPosts([
        makePost({ id: 'pin-1', body: 'A **pinned** fixture post above the blocks.' }),
      ]);
    }),
  ],
};

/** Direct hit on the second sub-page (`/page/@allie/about`). */
export const SecondSubPage: Story = {
  decorators: [
    scenario(() => {
      setStoryPageDocument(pageDocumentFixture(), 'about');
    }),
  ],
};

/** A theme-carrying document: accent/background/border become `--page-*` cosmetics. */
export const ThemedPage: Story = {
  decorators: [
    scenario(() => {
      setStoryPageDocument(
        pageDocumentBytes({
          version: 1,
          theme: { accent: '#0ea5a4', background: '#f0fdfa', border: 'dashed' },
          pages: [
            {
              slug: 'home',
              title: 'Themed fixture',
              blocks: [
                { type: 'Hero', title: 'themed fixture page', subtitle: 'teal on mint' },
                { type: 'Text', body: 'Cosmetics only — never a gate on function (§184.3).' },
              ],
            },
          ],
        }),
      );
    }),
  ],
};
