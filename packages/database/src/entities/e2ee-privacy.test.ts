import { describe, expect, it } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';

import { E2eeDeviceIdentity } from './e2ee-device-identity.entity.js';
import { E2eeDeviceRoster } from './e2ee-device-roster.entity.js';
import { E2eeIdentityRoot } from './e2ee-identity-root.entity.js';
import { E2eeLogicalMessage } from './e2ee-logical-message.entity.js';
import { E2eeMailboxEnvelope } from './e2ee-mailbox-envelope.entity.js';
import { E2eeOneTimePrekey } from './e2ee-one-time-prekey.entity.js';
import { E2eeReportEvidenceItem } from './e2ee-report-evidence-item.entity.js';
import { E2eeReportEvidence } from './e2ee-report-evidence.entity.js';
import { E2eeSignedPrekey } from './e2ee-signed-prekey.entity.js';

const e2eeEntities = new Set<unknown>([
  E2eeIdentityRoot,
  E2eeDeviceIdentity,
  E2eeDeviceRoster,
  E2eeSignedPrekey,
  E2eeOneTimePrekey,
  E2eeLogicalMessage,
  E2eeMailboxEnvelope,
  E2eeReportEvidence,
  E2eeReportEvidenceItem,
]);

describe('E2EE persistence privacy boundary', () => {
  it('has no ordinary plaintext, private-key, message-key, ratchet-state, or recovery-key column', () => {
    const columns = getMetadataArgsStorage().columns.filter((column) =>
      e2eeEntities.has(column.target),
    );
    const allowedDisclosure = 'E2eeReportEvidenceItem.disclosedPlaintext';
    for (const column of columns) {
      const entity =
        typeof column.target === 'function' ? column.target.name : String(column.target);
      const qualified = `${entity}.${column.propertyName}`;
      if (qualified === allowedDisclosure) continue;
      expect(qualified).not.toMatch(
        /plaintext|privateKey|messageKey|ratchetState|recoveryKey|recoverySecret/i,
      );
    }
  });
});
