import { render, screen } from '@testing-library/react';
import { ConversationSecurityMode } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { DmNotice, dmNoticeCopy, securityModeLabel } from './DmNotice.js';

describe('DmNotice', () => {
  it('says E2EE_V1 conversations are end-to-end encrypted and that this web view cannot decrypt them', () => {
    render(<DmNotice securityMode={ConversationSecurityMode.E2EE_V1} />);
    const text = screen.getByRole('note').textContent ?? '';
    expect(text).toContain('End-to-end encrypted.');
    // The web client has no crypto runtime (B-102/B-096): it must not pretend otherwise.
    expect(text).toMatch(/terminal client/);
    expect(text).toMatch(/no key material to decrypt/);
  });

  it('asserts neither claim when there is no conversation context, but still names E2EE accurately', () => {
    render(<DmNotice />);
    const text = screen.getByRole('note').textContent ?? '';
    expect(text).toBe(dmNoticeCopy(undefined));
    // B-095/B-096 (ADR 0030): the retired server-visible mode can no longer exist, so —
    // unlike before the migration — a generic notice may say "end-to-end encrypted" here
    // without overclaiming, because that is now true of every conversation there is.
    expect(text).toContain('end-to-end encrypted');
  });

  it.each([
    ConversationSecurityMode.UNSPECIFIED,
    // protobuf-es surfaces unknown enum numbers verbatim — same neutral treatment.
    99 as ConversationSecurityMode,
  ] as const)('treats %s like no conversation context', (mode) => {
    render(<DmNotice securityMode={mode} />);
    expect(screen.getByRole('note').textContent).toBe(dmNoticeCopy(undefined));
  });

  it('never uses "secure" or "private" to describe DMs in any mode (§194)', () => {
    const modes = [
      undefined,
      ConversationSecurityMode.E2EE_V1,
      ConversationSecurityMode.UNSPECIFIED,
    ];
    for (const mode of modes) {
      render(<DmNotice securityMode={mode} />);
    }
    for (const notice of screen.getAllByRole('note')) {
      const text = notice.textContent ?? '';
      expect(text).not.toMatch(/\bsecure\b/i);
      expect(text).not.toMatch(/\bprivate\b/i);
    }
  });
});

describe('securityModeLabel', () => {
  it('labels the modes the API exposes and nothing else', () => {
    expect(securityModeLabel(ConversationSecurityMode.E2EE_V1)).toBe('E2EE');
    expect(securityModeLabel(ConversationSecurityMode.UNSPECIFIED)).toBeUndefined();
    expect(securityModeLabel(undefined)).toBeUndefined();
  });
});
