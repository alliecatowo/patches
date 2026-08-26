import type { JSX } from 'react';
import { Route, Routes } from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';

import { LazyRouteBoundary } from './LazyRouteBoundary.js';

const meta = {
  title: 'Patterns/LazyRouteBoundary',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** A child route that throws during render, so the boundary's errorElement takes over. */
function ThrowInRender({ message }: { message: string }): JSX.Element {
  throw new Error(message);
}

function withRouteThrowing(message: string): Decorator {
  return (Story) => (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ThrowInRender message={message} />} errorElement={<Story />} />
      </Routes>
    </MemoryRouter>
  );
}

/** The generic crash: the route slot is replaced, the shell around it stays alive. */
export const RenderCrash: Story = {
  decorators: [withRouteThrowing('fixture render crash — the route slot broke, not the app')],
};

/**
 * The common real-world trigger (stale client after a deploy): the chunk 404 gets its
 * own "Update available" copy and a full-reload button, not "try again".
 */
export const StaleChunk: Story = {
  decorators: [
    withRouteThrowing('Failed to fetch dynamically imported module: ./SomeRoute-abc123.js'),
  ],
};

/** Firefox/Safari phrasings of the same stale-chunk failure match too. */
export const StaleChunkSafariWording: Story = {
  decorators: [withRouteThrowing('Importing a module script failed.')],
};
