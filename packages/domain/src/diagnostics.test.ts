import { describe, expect, it } from 'vitest';

import {
  buildDiagnosticsBundle,
  diagnosticsBundleSchema,
  diagnosticsEventSchema,
  redactDiagnosticsText,
  serializeDiagnosticsBundle,
  toIsoTimestamp,
  DIAGNOSTICS_BREADCRUMB_DETAIL_MAX_CHARS,
  DIAGNOSTICS_BUNDLE_SCHEMA_VERSION,
  DIAGNOSTICS_FRAME_TAIL_MAX_CHARS as DIAGNOSTICS_FRAME_TAIL_MAX,
  MAX_DIAGNOSTICS_BREADCRUMBS,
  MAX_DIAGNOSTICS_EVENTS,
  MAX_DIAGNOSTICS_BUNDLE_BYTES,
} from './diagnostics.js';

const PNG_DATA_URL = `data:image/png;base64,${'iVBORw0KGgoAAAANSUhEUg'.repeat(4)}`;

function baseInput() {
  return {
    app: 'tui',
    version: '0.1.0+abc1234',
    buildSha: 'abc1234',
    nodeDomain: 'patches.example:7600',
    sessionHandle: '',
    capabilities: { e2eeAdvertised: true, vaultEnrolled: false },
    breadcrumbs: [{ at: '2026-08-23T00:00:00.000Z', kind: 'nav', detail: 'home' }],
    events: [
      { at: '2026-08-23T00:00:01.000Z', message: 'rpc listHomeFeed failed: UNAVAILABLE(14)' },
    ],
  } as const;
}

describe('redactDiagnosticsText', () => {
  it.each([
    ['Bearer abc.def.g', 'Bearer [REDACTED]'],
    // The assignment rule takes the whole rest of the line, so a credential can never
    // leave a half-redacted tail behind.
    [
      'authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4',
      'authorization: [REDACTED]',
    ],
    ['api_key=sk-1234567890abcdef1234', 'api_key=[REDACTED]'],
    ['"password": "hunter2"', '"password": [REDACTED]'],
    ['refresh_token: abc123', 'refresh_token: [REDACTED]'],
    ['ghp_0123456789abcdefghijklmnopqrstuvw', '[REDACTED]'],
    ['AKIAIOSFODNN7EXAMPLE', '[REDACTED]'],
    ['sha 358a5d92e2a58dbe3b8c1d1f7b6c9c1e2d3f4a5b', 'sha [REDACTED]'],
  ])('strips secret shapes from %j', (input, expected) => {
    expect(redactDiagnosticsText(input)).toBe(expected);
  });

  it('redacts a JWT outright when it appears bare', () => {
    const out = redactDiagnosticsText(
      'token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    );
    expect(out).toBe('token [REDACTED_JWT]');
  });

  it('drops PEM private-key blocks entirely', () => {
    const pem = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/yGWyIfX+fF5g',
      '-----END RSA PRIVATE KEY-----',
      'trailing context stays',
    ].join('\n');
    expect(redactDiagnosticsText(pem)).toBe('[REDACTED]\ntrailing context stays');
  });

  it('scrubs ANSI escapes, control bytes and bidi trickery (hostile input)', () => {
    const hostile = '\u001B]0;pwned\u0007 \u001B[31mred\u001B[0m \u0007 x\u200Ey\u202Ezw\u001B';
    const out = redactDiagnosticsText(hostile);
    /* eslint-disable no-control-regex -- asserting the *absence* of control bytes is the
       point of this pattern, same justification as sanitize.ts's own patterns. */
    expect(out).not.toMatch(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E]/);
    /* eslint-enable no-control-regex */
    expect(out).toContain('red');
    expect(out).toContain('xyzw');
  });

  it('keeps newlines but strips carriage returns and tabs', () => {
    expect(redactDiagnosticsText('line one\r\nline two\tend')).toBe('line one\nline two end');
  });

  it('never lets a crafted control byte split a secret keyword past the scrub', () => {
    // Sanitization runs first, so a BEL planted inside "token" cannot hide the assignment.
    const hostile = 'to\u0007ken: supersecretvalue';
    expect(redactDiagnosticsText(hostile)).toBe('token: [REDACTED]');
  });
});

describe('buildDiagnosticsBundle', () => {
  it('builds a valid bundle with the current schema version', () => {
    const bundle = buildDiagnosticsBundle({ ...baseInput(), app: 'tui' });
    expect(bundle.schemaVersion).toBe(DIAGNOSTICS_BUNDLE_SCHEMA_VERSION);
    expect(bundle.app).toBe('tui');
    expect(bundle.sessionHandle).toBe('');
    expect(diagnosticsBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it('normalizes Date timestamps to ISO strings and invalid dates to the epoch', () => {
    const bundle = buildDiagnosticsBundle({
      ...baseInput(),
      breadcrumbs: [{ at: new Date(0), kind: 'nav', detail: 'home' }],
      events: [{ at: 'not-a-date', message: 'rpc ping failed: UNKNOWN(2)' }],
    });
    expect(bundle.breadcrumbs[0]?.at).toBe('1970-01-01T00:00:00.000Z');
    expect(bundle.events[0]?.at).toBe('1970-01-01T00:00:00.000Z');
  });

  it('attaches sessionHandle only when opted in', () => {
    const optedOut = buildDiagnosticsBundle(baseInput());
    expect(optedOut.sessionHandle).toBe('');
    const optedIn = buildDiagnosticsBundle({ ...baseInput(), sessionHandle: '@allie' });
    expect(optedIn.sessionHandle).toBe('@allie');
  });

  it('filters non-boolean capability values', () => {
    const bundle = buildDiagnosticsBundle({
      ...baseInput(),
      capabilities: { e2eeAdvertised: true, sneaky: 'yes' as unknown as boolean },
    });
    expect(bundle.capabilities).toEqual({ e2eeAdvertised: true });
  });

  it('keeps the newest breadcrumbs/events beyond the caps', () => {
    const breadcrumbs = Array.from({ length: MAX_DIAGNOSTICS_BREADCRUMBS + 25 }, (_, i) => ({
      at: '2026-08-23T00:00:00.000Z',
      kind: 'nav',
      detail: String(i),
    }));
    const events = Array.from({ length: MAX_DIAGNOSTICS_EVENTS + 10 }, (_, i) => ({
      at: '2026-08-23T00:00:00.000Z',
      message: `event ${String(i)}`,
    }));
    const bundle = buildDiagnosticsBundle({ ...baseInput(), breadcrumbs, events });
    expect(bundle.breadcrumbs).toHaveLength(MAX_DIAGNOSTICS_BREADCRUMBS);
    expect(bundle.breadcrumbs.at(-1)?.detail).toBe(String(MAX_DIAGNOSTICS_BREADCRUMBS + 24));
    expect(bundle.events).toHaveLength(MAX_DIAGNOSTICS_EVENTS);
    expect(bundle.events.at(-1)?.message).toBe(`event ${String(MAX_DIAGNOSTICS_EVENTS + 9)}`);
  });

  it('clamps oversized breadcrumb details and event messages after redaction', () => {
    const bundle = buildDiagnosticsBundle({
      ...baseInput(),
      breadcrumbs: [
        // Over the cap: clamped to exactly 200 chars, secret tail redacted before the clamp.
        {
          at: '2026-08-23T00:00:00.000Z',
          kind: 'nav',
          detail: `${'x'.repeat(500)} token: abcdef`,
        },
        // Under the cap: survives whole, with the secret scrubbed.
        { at: '2026-08-23T00:00:00.000Z', kind: 'nav', detail: 'opened page api_key=abcd1234' },
      ],
      events: [{ at: '2026-08-23T00:00:00.000Z', message: 'y'.repeat(1000) }],
    });
    expect(bundle.breadcrumbs[0]?.detail.length).toBe(DIAGNOSTICS_BREADCRUMB_DETAIL_MAX_CHARS);
    expect(bundle.breadcrumbs[1]?.detail).toBe('opened page api_key=[REDACTED]');
    expect(JSON.stringify(bundle)).not.toContain('abcdef');
    expect(bundle.events[0]?.message.length).toBeLessThanOrEqual(300);
  });

  it('accepts a size-guarded PNG screenshot data URL and drops anything else', () => {
    const good = buildDiagnosticsBundle({ ...baseInput(), screenshotDataUrl: PNG_DATA_URL });
    expect(good.screenshotDataUrl).toBe(PNG_DATA_URL);
    const badPrefix = buildDiagnosticsBundle({
      ...baseInput(),
      screenshotDataUrl: 'data:text/html;base64,PHNjcmlwdD4=',
    });
    expect(badPrefix.screenshotDataUrl).toBeUndefined();
    const tooBig = buildDiagnosticsBundle({
      ...baseInput(),
      screenshotDataUrl: `data:image/png;base64,${'A'.repeat(300_000)}`,
    });
    expect(tooBig.screenshotDataUrl).toBeUndefined();
  });

  it('caps the serialized bundle by shedding oldest events first, newest kept', () => {
    const screenshot = `data:image/png;base64,${'A'.repeat(200_000 - 23)}`;
    const bundle = buildDiagnosticsBundle({
      ...baseInput(),
      capabilities: { e2eeAdvertised: true },
      breadcrumbs: Array.from({ length: MAX_DIAGNOSTICS_BREADCRUMBS }, (_, i) => ({
        at: '2026-08-23T00:00:00.000Z',
        kind: 'nav',
        detail: `${String(i).padStart(3, '0')} ${'x'.repeat(196)}`,
      })),
      events: Array.from({ length: MAX_DIAGNOSTICS_EVENTS }, (_, i) => ({
        at: '2026-08-23T00:00:00.000Z',
        message: `${String(i).padStart(3, '0')} ${'z'.repeat(296)}`,
      })),
      frame: 'f'.repeat(DIAGNOSTICS_FRAME_TAIL_MAX),
      screenshotDataUrl: screenshot,
      notes: 'n'.repeat(2_000),
    });
    const serialized = serializeDiagnosticsBundle(bundle);
    expect(serialized.length).toBeLessThanOrEqual(MAX_DIAGNOSTICS_BUNDLE_BYTES);
    // The fattest field (the screenshot) survives — the oldest *events* pay first, and
    // the newest ones of those are what remain.
    expect(bundle.screenshotDataUrl).toBe(screenshot);
    expect(bundle.events.length).toBeLessThan(MAX_DIAGNOSTICS_EVENTS);
    expect(
      bundle.events.at(-1)?.message.startsWith(String(MAX_DIAGNOSTICS_EVENTS - 1).padStart(3, '0')),
    ).toBe(true);
  });

  it('keeps only the frame tail when the render is enormous', () => {
    const bundle = buildDiagnosticsBundle({
      ...baseInput(),
      // 'z' rather than a hex letter — a million f's *is* key-material-shaped input, and
      // the redactor is right to collapse it.
      frame: 'z'.repeat(1_000_000),
    });
    expect(bundle.frame?.length).toBe(DIAGNOSTICS_FRAME_TAIL_MAX);
    expect(diagnosticsBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it('§194: the strict event schema has no field a message body could hide in', () => {
    const verdict = diagnosticsEventSchema.safeParse({
      at: '2026-08-23T00:00:00.000Z',
      message: 'rpc sendMessage failed: INTERNAL(13)',
      body: 'plaintext that must never travel',
    });
    expect(verdict.success).toBe(false);
  });

  it('redacts secrets embedded in breadcrumb details, events, notes and frame', () => {
    const bundle = buildDiagnosticsBundle({
      ...baseInput(),
      breadcrumbs: [
        { at: '2026-08-23T00:00:00.000Z', kind: 'nav', detail: 'opened page api_key=abcd1234' },
      ],
      events: [
        {
          at: '2026-08-23T00:00:00.000Z',
          message: 'rpc login failed: UNAUTHENTICATED(16) creds password:hunter2',
        },
      ],
      frame: 'compose editor — Authorization: Bearer xyz',
      notes: 'crash after pasting ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(JSON.stringify(bundle)).not.toContain('hunter2');
    expect(JSON.stringify(bundle)).not.toContain('abcd1234');
    expect(JSON.stringify(bundle)).not.toContain('Bearer xyz');
    expect(JSON.stringify(bundle)).not.toContain('ghp_aaa');
  });

  it('serializes deterministically for POSTing and for the manual fallback file', () => {
    const bundle = buildDiagnosticsBundle(baseInput());
    expect(serializeDiagnosticsBundle(bundle)).toBe(JSON.stringify(bundle, null, 2));
  });
});

describe('toIsoTimestamp', () => {
  it.each([
    [new Date('2026-08-23T12:00:00Z'), '2026-08-23T12:00:00.000Z'],
    ['2026-08-23T12:00:00Z', '2026-08-23T12:00:00.000Z'],
    ['garbage', '1970-01-01T00:00:00.000Z'],
  ] as const)('%# → %#', (input, expected) => {
    expect(toIsoTimestamp(input)).toBe(expected);
  });
});
