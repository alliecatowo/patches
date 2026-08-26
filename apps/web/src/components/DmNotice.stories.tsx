import { ConversationSecurityMode } from '@patches/proto/es';
import { requiredConversationDisclosure } from '@patches/domain';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { securityModeLabel } from './DmNotice.js';

const meta = {
  title: 'Feedback/DmNotice',
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * `DmNotice` is one pure function — `securityModeLabel` maps the wire `security_mode`
 * (ADR 0020 §11: read from the wire, never assumed) onto the short row label. This story
 * pins both the mapping and the §183.1 disclosure copy every DM surface must carry: v0
 * DMs are **server-visible**, and the label says E2EE only when the wire does.
 */
export const ModeLabelsAndDisclosure: Story = {
  render: () => {
    const rows: ReadonlyArray<{ wire: string; label: string | undefined }> = [
      { wire: 'E2EE_V1', label: securityModeLabel(ConversationSecurityMode.E2EE_V1) },
      { wire: 'UNSPECIFIED', label: securityModeLabel(ConversationSecurityMode.UNSPECIFIED) },
      { wire: '(field absent)', label: securityModeLabel(undefined) },
    ];
    return (
      <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 640 }}>
        <div role="note" style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>
          {requiredConversationDisclosure('E2EE_V1')}
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>wire security_mode</th>
              <th style={{ textAlign: 'left' }}>row label</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.wire}>
                <td>
                  <code>{row.wire}</code>
                </td>
                <td>{row.label ?? <em>(no label)</em>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
};
