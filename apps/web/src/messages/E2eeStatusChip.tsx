import { requiredConversationDisclosure } from '@patches/domain';
import type { JSX } from 'react';

import { ShieldIcon } from '../components/icons/Icons.js';
import { StatusChip, type StatusTone } from '../components/ui/index.js';
import type { useE2ee } from '../e2ee/use-e2ee.js';
import { WEB_E2EE_COPY } from '../e2ee/web-e2ee.js';

/**
 * The standing device state as a slim header strip (#336 review 1). It states a condition and
 * offers no action, so it must not be a card floating above the layout; anything that needs a
 * decision renders as an inline `Panel` in the thread pane instead.
 *
 * The chip's label is an abbreviation; the `title` carries the full §183.1 disclosure verbatim
 * so the short form can never become the only thing this client claims about encryption.
 */
export function E2eeStatusChip({
  status,
}: {
  readonly status: ReturnType<typeof useE2ee>;
}): JSX.Element | null {
  if (status.kind === 'signed-out' || status.kind === 'loading') return null;

  const chip: { tone: StatusTone; label: string; title: string } =
    status.kind === 'fault'
      ? { tone: 'danger', label: 'Messaging unavailable', title: status.copy }
      : status.kind === 'not-enrolled' || status.kind === 'refused'
        ? {
            tone: 'warning',
            label: 'Not a messaging device',
            title: `${requiredConversationDisclosure('E2EE_V1')} ${WEB_E2EE_COPY.notEnrolled}`,
          }
        : status.kind === 'enrolling'
          ? { tone: 'neutral', label: 'Enrolling this browser…', title: 'Enrolling…' }
          : {
              tone: 'positive',
              label: 'End-to-end encrypted',
              title: `${requiredConversationDisclosure('E2EE_V1')} This browser holds its own device keys.`,
            };

  return (
    <StatusChip tone={chip.tone} icon={<ShieldIcon size={13} />} title={chip.title}>
      {chip.label}
    </StatusChip>
  );
}
