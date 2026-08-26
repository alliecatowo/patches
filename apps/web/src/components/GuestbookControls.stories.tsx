import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { scenario, signedInAs } from '../../.storybook/decorators.js';
import { friendActor, viewerActor } from '../../.storybook/fixtures.js';
import { GuestbookEntryActions, GuestbookSignForm } from './GuestbookControls.js';

const meta = {
  title: 'Patterns/Guestbook',
  component: GuestbookSignForm,
  args: {
    handle: 'allie',
    slug: 'home',
  },
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof GuestbookSignForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignFormSignedIn: Story = {
  decorators: [signedInAs(viewerActor)],
};

export const SignFormSignedOut: Story = {
  decorators: [scenario()],
  render: (args) => (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <GuestbookSignForm {...args} />
      <span style={{ color: 'var(--fg-muted)' }}>(the form renders nothing when signed out)</span>
    </div>
  ),
};

/** Type + Sign: the mock resolves, the entry posts, the textarea clears. */
export const SignAnEntry: Story = {
  decorators: [signedInAs(viewerActor)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = await canvas.findByLabelText('Guestbook entry');
    await userEvent.type(textarea, 'a synthetic signature from the storybook fixture');
    const sign = canvas.getByRole('button', { name: 'Sign' });
    expect(sign).toBeEnabled();
    await userEvent.click(sign);
    await expect(await canvas.findByLabelText('Guestbook entry')).toHaveValue('');
  },
};

/** The page owner sees "remove" on every entry (the server enforces it; this is the UI). */
export const EntryActionsAsOwner: Story = {
  decorators: [signedInAs(viewerActor)],
  render: () => (
    <GuestbookEntryActions
      entryId="gb-1"
      authorActorId={friendActor.id}
      ownerActorId={viewerActor.id}
    />
  ),
};

/** A non-owner signed-in viewer sees only "report" on other people's entries. */
export const EntryActionsAsVisitor: Story = {
  decorators: [signedInAs(viewerActor)],
  render: () => (
    <GuestbookEntryActions
      entryId="gb-1"
      authorActorId={friendActor.id}
      ownerActorId="actor-someone-else"
    />
  ),
};

/** Your own entry as a non-owner: nothing to report to yourself, nothing to remove. */
export const EntryActionsOnOwnEntry: Story = {
  decorators: [signedInAs(viewerActor)],
  render: () => (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <GuestbookEntryActions
        entryId="gb-1"
        authorActorId={viewerActor.id}
        ownerActorId="actor-someone-else"
      />
      <span style={{ color: 'var(--fg-muted)' }}>(own entry as visitor renders nothing)</span>
    </div>
  ),
};

/** The report sub-form: reason + optional details + submit → fixed acknowledgment. */
export const ReportAnEntry: Story = {
  decorators: [signedInAs(viewerActor)],
  render: () => (
    <GuestbookEntryActions
      entryId="gb-1"
      authorActorId={friendActor.id}
      ownerActorId="actor-someone-else"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'report' }));
    const form = await canvas.findByRole('form', { name: 'Report guestbook entry' });
    await userEvent.selectOptions(within(form).getByLabelText('Report reason'), 'Spam');
    await userEvent.click(within(form).getByRole('button', { name: 'Submit report' }));
    expect(await canvas.findByText('Report sent.')).toBeInTheDocument();
  },
};
