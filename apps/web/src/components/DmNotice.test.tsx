import { ConversationSecurityMode } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { securityModeLabel } from './DmNotice.js';

describe('securityModeLabel', () => {
  it('labels the modes the API exposes and nothing else', () => {
    expect(securityModeLabel(ConversationSecurityMode.E2EE_V1)).toBe('E2EE');
    expect(securityModeLabel(ConversationSecurityMode.UNSPECIFIED)).toBeUndefined();
    expect(securityModeLabel(undefined)).toBeUndefined();
  });
});
