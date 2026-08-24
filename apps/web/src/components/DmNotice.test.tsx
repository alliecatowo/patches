import { render, screen } from '@testing-library/react';
import { ConversationSecurityMode } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { DmNotice, dmNoticeCopy, securityModeLabel } from './DmNotice.js';

describe('DmNotice', () => {
  it('keeps the mandated §183.1 disclosure for LEGACY_SERVER_VISIBLE conversations', () => {
    render(<DmNotice securityMode={ConversationSecurityMode.LEGACY_SERVER_VISIBLE} />);
    expect(
      screen.getByText("Not end-to-end encrypted — this node's operators can read these messages."),
    ).toBeInTheDocument();
  });

  it('says E2EE_V1 conversations are end-to-end encrypted and that this web view cannot decrypt them', () => {
    render(<DmNotice securityMode={ConversationSecurityMode.E2EE_V1} />);
    const text = screen.getByRole('note').textContent ?? '';
    expect(text).toContain('End-to-end encrypted.');
    // The web client has no crypto runtime (B-102): it must not pretend otherwise.
    expect(text).toMatch(/terminal client/);
    expect(text).toMatch(/can't decrypt/);
  });

  it('asserts neither claim when there is no conversation context', () => {
    render(<DmNotice />);
    const text = screen.getByRole('note').textContent ?? '';
    expect(text).toBe(dmNoticeCopy(undefined));
    expect(text).not.toContain('Not end-to-end encrypted —');
    expect(text).not.toContain('End-to-end encrypted.');
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
      ConversationSecurityMode.LEGACY_SERVER_VISIBLE,
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
    expect(securityModeLabel(ConversationSecurityMode.LEGACY_SERVER_VISIBLE)).toBe(
      'Server-visible',
    );
    expect(securityModeLabel(ConversationSecurityMode.UNSPECIFIED)).toBeUndefined();
    expect(securityModeLabel(undefined)).toBeUndefined();
  });
});
