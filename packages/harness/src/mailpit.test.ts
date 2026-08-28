import { connect } from 'node:net';
import { once } from 'node:events';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  assertMailpitOrigin,
  getMailpitMessage,
  latestMailpitMessage,
  listMailpitMessages,
} from './mailpit.js';
import { MAILPIT_HTTP_ORIGIN } from './lab.js';

const ORIGIN = 'http://127.0.0.1:8025';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response;
}

describe('assertMailpitOrigin', () => {
  it('accepts a loopback http origin and rejects everything else', () => {
    expect(() => assertMailpitOrigin(ORIGIN)).not.toThrow();
    expect(() => assertMailpitOrigin('http://example.com')).toThrow('loopback');
    expect(() => assertMailpitOrigin('https://127.0.0.1:8025')).toThrow('loopback');
    expect(() => assertMailpitOrigin('127.0.0.1:8025')).toThrow('loopback');
  });
});

describe('listMailpitMessages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists recent messages without a filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        messages: [
          {
            ID: 'abc123',
            From: { Name: '', Address: 'noreply@harness.local' },
            To: [{ Name: '', Address: 'alice@harness.local' }],
            Subject: 'Verify your email',
            Created: '2026-08-28T00:00:00Z',
            Snippet: 'Your code is 123456',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const messages = await listMailpitMessages(ORIGIN);
    expect(messages).toEqual([
      {
        id: 'abc123',
        from: { name: '', address: 'noreply@harness.local' },
        to: [{ name: '', address: 'alice@harness.local' }],
        subject: 'Verify your email',
        created: '2026-08-28T00:00:00Z',
        snippet: 'Your code is 123456',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(`${ORIGIN}/api/v1/messages?limit=20`);
  });

  it('filters by recipient address using Mailpit search syntax, not a client-side match', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ messages: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await listMailpitMessages(ORIGIN, { address: 'bob@harness.local', limit: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${ORIGIN}/api/v1/search?query=${encodeURIComponent('to:bob@harness.local')}&limit=5`,
    );
  });

  it('rejects a non-email address filter and an out-of-range limit', async () => {
    await expect(listMailpitMessages(ORIGIN, { address: 'not-an-email' })).rejects.toThrow(
      'email address',
    );
    await expect(listMailpitMessages(ORIGIN, { limit: 0 })).rejects.toThrow('limit');
    await expect(listMailpitMessages(ORIGIN, { limit: 101 })).rejects.toThrow('limit');
  });

  it('rejects a non-loopback origin before ever calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(listMailpitMessages('http://evil.example')).rejects.toThrow('loopback');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a non-ok response as an error instead of returning empty results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)));
    await expect(listMailpitMessages(ORIGIN)).rejects.toThrow('status 500');
  });
});

describe('latestMailpitMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns undefined when no message has arrived yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ messages: [] })));
    await expect(latestMailpitMessage(ORIGIN, 'nobody@harness.local')).resolves.toBeUndefined();
  });
});

describe('getMailpitMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches one message by id and returns bounded plain text only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ID: 'abc123',
        From: { Name: '', Address: 'noreply@harness.local' },
        To: [{ Name: '', Address: 'alice@harness.local' }],
        Subject: 'Verify your email',
        Created: '2026-08-28T00:00:00Z',
        Snippet: 'Your code is 123456',
        Text: 'Your code is 123456\r\n',
        HTML: '<p>Your code is 123456</p>',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const message = await getMailpitMessage(ORIGIN, 'abc123');
    expect(message.text).toBe('Your code is 123456\r\n');
    expect(message).not.toHaveProperty('html');
    expect(fetchMock).toHaveBeenCalledWith(`${ORIGIN}/api/v1/message/abc123`);
  });

  it('rejects a message id with an unexpected shape', async () => {
    await expect(getMailpitMessage(ORIGIN, '../etc/passwd')).rejects.toThrow('unexpected shape');
  });
});

/** Minimal SMTP client for the live test only — avoids adding a new production dependency
 * just to prove the retrieval side of this module against a real Mailpit instance. */
async function sendRawSmtpMessage(to: string, subject: string, body: string): Promise<void> {
  const socket = connect(1025, '127.0.0.1');
  await once(socket, 'connect');
  const responses: string[] = [];
  socket.on('data', (chunk: Buffer) => responses.push(chunk.toString('utf8')));
  async function command(line: string): Promise<void> {
    responses.length = 0;
    socket.write(`${line}\r\n`);
    for (let attempt = 0; attempt < 50 && responses.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  await once(socket, 'data');
  await command('HELO harness-test');
  await command('MAIL FROM:<noreply@harness.local>');
  await command(`RCPT TO:<${to}>`);
  await command('DATA');
  await command(
    `From: noreply@harness.local\r\nTo: ${to}\r\nSubject: ${subject}\r\n\r\n${body}\r\n.`,
  );
  await command('QUIT');
  socket.end();
}

describe('live Mailpit (mise run compose, mailpit service)', () => {
  const live = process.env['PATCHES_HARNESS_LIVE'] === '1';
  let reachable = false;

  beforeAll(async () => {
    if (!live) return;
    try {
      const response = await fetch(`${MAILPIT_HTTP_ORIGIN}/api/v1/info`);
      reachable = response.ok;
    } catch {
      reachable = false;
    }
  });

  it('lists and fetches a real message sent over SMTP', async (context) => {
    if (!live || !reachable) {
      context.skip();
      return;
    }
    const address = `harness-test-${String(Date.now())}@harness.local`;
    await sendRawSmtpMessage(address, 'harness live test', 'live body');
    let found: Awaited<ReturnType<typeof latestMailpitMessage>>;
    for (let attempt = 0; attempt < 50 && found === undefined; attempt += 1) {
      found = await latestMailpitMessage(MAILPIT_HTTP_ORIGIN, address);
      if (found === undefined) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(found?.subject).toBe('harness live test');
    if (found === undefined) throw new Error('unreachable');
    const full = await getMailpitMessage(MAILPIT_HTTP_ORIGIN, found.id);
    expect(full.text).toContain('live body');
  });
});
