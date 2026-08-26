import type { Meta, StoryObj } from '@storybook/react-vite';

import { THEME_CATALOG } from './lib/theme.js';

const meta = {
  title: 'Welcome',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Start here: what this catalog covers, the viewport matrix every story must survive, and how to add the next story.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const groups: ReadonlyArray<{ name: string; blurb: string; items: string[] }> = [
  {
    name: 'Design System',
    blurb: 'Atoms and composite cards — props-driven, context-free where possible.',
    items: [
      'PostCard',
      'Nameplate',
      'RichBody',
      'ActorList',
      'FollowButton',
      'PageBlocks',
      'PinnedPosts',
      'MediaUploadPreview',
      'MediaLightbox',
      'ThumbNavFab',
    ],
  },
  {
    name: 'Routes',
    blurb: 'Full screens with TanStack Query running against the scenario mock client.',
    items: [
      'Home',
      'Compose',
      'Thread',
      'Profile',
      'Page',
      'Messages (DM list — metadata-only fixtures)',
      'Message Thread',
      'Settings/Appearance',
    ],
  },
  {
    name: 'Patterns',
    blurb: 'Cross-cutting flows and composites.',
    items: [
      'Login: GitHub / Device Link / OIDC',
      'Guestbook',
      'Edit Wall Dialog',
      'LazyRouteBoundary (error states)',
    ],
  },
  {
    name: 'Feedback',
    blurb: 'Moderation, disclosure, and reporting surfaces.',
    items: [
      'IssueReporter',
      'ReportPostControl',
      'PrivacyNoticeBanner',
      'DmNotice (server-visible DM disclosure)',
    ],
  },
];

const viewports = [
  ['Mobile PWA', '375×667', 'portrait-primary, matches the installed PWA'],
  ['Tablet', '768×1024', 'iPad portrait'],
  ['Desktop', '1280×800', 'sidebar layout threshold'],
];

export const CatalogGuide: Story = {
  render: () => (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: '2rem', marginBottom: 0 }}>patches/web Storybook</h1>
      <p style={{ color: 'var(--fg-muted)', marginTop: '0.25rem' }}>
        The component workbench for the web client (H-029). Everything here runs against the
        deterministic mock in <code>.storybook/mocks/apiClient.ts</code> — stories can never reach
        the network, and an un-mocked RPC fails loudly.
      </p>

      <h2>Sidebar groups</h2>
      {groups.map((group) => (
        <section key={group.name}>
          <h3 style={{ marginBottom: 0 }}>
            {group.name}{' '}
            <span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: '0.85rem' }}>
              — {group.blurb}
            </span>
          </h3>
          <ul style={{ margin: '0.25rem 0 1rem', paddingLeft: '1.25rem' }}>
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}

      <h2>The viewport matrix</h2>
      <p>
        Every story is expected to make sense in all three toolbar presets — they resize the story
        iframe only (no touch or <code>display-mode</code> emulation; that stays in the Playwright
        E2E suite):
      </p>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Preset</th>
            <th style={{ textAlign: 'left' }}>Size</th>
            <th style={{ textAlign: 'left' }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {viewports.map(([name, size, note]) => (
            <tr key={name}>
              <td>
                <strong>{name}</strong>
              </td>
              <td>
                <code>{size}</code>
              </td>
              <td>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Themes</h2>
      <p>
        The theme toolbar applies the app&apos;s own mechanism (<code>src/lib/theme.ts</code> —{' '}
        <code>data-theme</code> + the token set in <code>index.css</code>). Check any story across:
      </p>
      <p>
        {THEME_CATALOG.map((theme) => (
          <code key={theme.id} style={{ marginRight: '0.5rem' }}>
            {theme.id}
          </code>
        ))}
      </p>

      <h2>Adding a story</h2>
      <ol style={{ paddingLeft: '1.25rem' }}>
        <li>
          Create <code>Component.stories.tsx</code> next to the component; CSF 3 with{' '}
          <code>satisfies Meta</code> and a <code>title</code> in one of the four groups.
        </li>
        <li>
          Wrap stateful setup in <code>scenario()</code> from <code>.storybook/decorators.tsx</code>{' '}
          (resets mock + session + drafts between stories); sign in with{' '}
          <code>signedInAs(viewerActor)</code>.
        </li>
        <li>
          Extend <code>.storybook/fixtures.ts</code> / the mock&apos;s <code>setStory*</code>{' '}
          setters for any RPC the component fires — never mock inside the story, never fetch.
        </li>
        <li>
          Fixtures stay obviously synthetic: no real handles, no tokens, and never DM bodies (v0 DMs
          are server-visible — conversation metadata only, spec §183.1).
        </li>
        <li>
          Add a <code>play</code> function when interaction demonstrates behavior cheaply (imports
          from <code>storybook/test</code>); the CI smoke runs them all.
        </li>
      </ol>

      <h2>What is deliberately not here</h2>
      <p>
        Visual regression (Lost Pixel / <code>toMatchScreenshot</code>) is a later phase; the Vitest
        addon smoke is the testing story today. Ink/TUI stories are out of scope — the TUI has its
        own golden-screen harness.
      </p>
    </div>
  ),
};
