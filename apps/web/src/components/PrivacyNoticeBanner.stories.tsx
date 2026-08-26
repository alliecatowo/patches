import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { scenario, signedInAs } from '../../.storybook/decorators.js';
import { viewerActor } from '../../.storybook/fixtures.js';
import { setStoryPrivacyVersions } from '../../.storybook/mocks/apiClient.js';
import { PrivacyNoticeBanner } from './PrivacyNoticeBanner.js';

const meta = {
  title: 'Feedback/PrivacyNoticeBanner',
  component: PrivacyNoticeBanner,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof PrivacyNoticeBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Frames the banner with a stand-in page body so its zero-render states are legible. */
function Page({ note }: { note: ReactNode }) {
  return (
    <div>
      <PrivacyNoticeBanner />
      <div style={{ padding: '1rem', color: 'var(--fg-muted)' }}>{note}</div>
    </div>
  );
}

/** The node bumped its notice to v3; this actor last acknowledged v2 — nudge shown. */
export const NoticeChanged: Story = {
  decorators: [signedInAs(viewerActor), scenario(() => setStoryPrivacyVersions(3, 2))],
  render: () => (
    <Page note="A material privacy-notice change (spec §197.1) surfaces the review nudge above." />
  ),
};

/** Acknowledged = current: renders nothing, by design (never a gate on function). */
export const UpToDate: Story = {
  decorators: [signedInAs(viewerActor), scenario(() => setStoryPrivacyVersions(3, 3))],
  render: () => (
    <Page note="(no banner above — this actor already acknowledged the current notice)" />
  ),
};

/** Signed out: the banner never renders. */
export const SignedOut: Story = {
  decorators: [scenario(() => setStoryPrivacyVersions(3, 1))],
  render: () => <Page note="(signed out — no banner, no policy fetch)" />,
};
