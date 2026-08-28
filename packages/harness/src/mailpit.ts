/**
 * Read-only retrieval against a local Mailpit instance (`infra/compose/docker-compose.yml`'s
 * `mailpit` service, started by `mise run compose`), for verification-code/email flows only.
 * Mailpit's REST API (`GET /api/v1/messages`, `GET /api/v1/message/{ID}`) was confirmed live
 * against a running instance on 2026-08-28 — see `docs/research/infra-and-security-libs.md`
 * §3 for the exact response shapes this module depends on.
 *
 * Same discipline as `log-redaction.ts`: loopback-only target, bounded output, allowlisted
 * fields. Mailpit only ever carries transactional email (auth codes) in this system — never
 * DM bodies — but retrieval still bounds and allowlists defensively rather than trusting that.
 */

const MAILPIT_ORIGIN = /^http:\/\/127\.0\.0\.1:\d{1,5}$/u;
const MAILPIT_ID = /^[A-Za-z0-9]{1,64}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const MAX_TEXT = 4_000;
const MAX_LIMIT = 100;

export interface MailpitAddress {
  readonly name: string;
  readonly address: string;
}

export interface MailpitMessageSummary {
  readonly id: string;
  readonly from: MailpitAddress;
  readonly to: readonly MailpitAddress[];
  readonly subject: string;
  readonly created: string;
  readonly snippet: string;
}

export interface MailpitMessage extends MailpitMessageSummary {
  readonly text: string;
}

export function assertMailpitOrigin(origin: string): void {
  if (!MAILPIT_ORIGIN.test(origin))
    throw new Error('Mailpit target must be a loopback http origin (http://127.0.0.1:<port>)');
}

function boundedText(value: string): string {
  return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
}

function toAddress(value: unknown): MailpitAddress {
  if (typeof value !== 'object' || value === null) return { name: '', address: '' };
  const source = value as Record<string, unknown>;
  return {
    name: typeof source['Name'] === 'string' ? boundedText(source['Name']) : '',
    address: typeof source['Address'] === 'string' ? boundedText(source['Address']) : '',
  };
}

function toAddressList(value: unknown): readonly MailpitAddress[] {
  return Array.isArray(value) ? value.map(toAddress) : [];
}

function toSummary(value: unknown): MailpitMessageSummary {
  if (typeof value !== 'object' || value === null) throw new Error('malformed Mailpit message');
  const source = value as Record<string, unknown>;
  if (typeof source['ID'] !== 'string') throw new Error('malformed Mailpit message: missing ID');
  return {
    id: source['ID'],
    from: toAddress(source['From']),
    to: toAddressList(source['To']),
    subject: typeof source['Subject'] === 'string' ? boundedText(source['Subject']) : '',
    created: typeof source['Created'] === 'string' ? source['Created'] : '',
    snippet: typeof source['Snippet'] === 'string' ? boundedText(source['Snippet']) : '',
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Mailpit request failed with status ${String(response.status)}`);
  return response.json();
}

/**
 * Lists messages, most-recent first, optionally filtered to a single recipient address —
 * Mailpit's own search syntax (`to:<address>`), never a client-side substring match that
 * could silently include the wrong recipient's codes.
 */
export async function listMailpitMessages(
  origin: string,
  options: { address?: string; limit?: number } = {},
): Promise<readonly MailpitMessageSummary[]> {
  assertMailpitOrigin(origin);
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new Error(`Mailpit list limit must be 1-${String(MAX_LIMIT)}`);
  if (options.address !== undefined && !EMAIL.test(options.address))
    throw new Error('Mailpit address filter must be a plain email address');
  const url =
    options.address === undefined
      ? `${origin}/api/v1/messages?limit=${String(limit)}`
      : `${origin}/api/v1/search?query=${encodeURIComponent(`to:${options.address}`)}&limit=${String(limit)}`;
  const body = (await fetchJson(url)) as { messages?: unknown };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.slice(0, limit).map(toSummary);
}

/** The newest message to `address`, or `undefined` if none has arrived yet. */
export async function latestMailpitMessage(
  origin: string,
  address: string,
): Promise<MailpitMessageSummary | undefined> {
  const messages = await listMailpitMessages(origin, { address, limit: 1 });
  return messages[0];
}

/** Full message body (bounded plain text only — HTML is never returned). */
export async function getMailpitMessage(origin: string, id: string): Promise<MailpitMessage> {
  assertMailpitOrigin(origin);
  if (!MAILPIT_ID.test(id)) throw new Error('Mailpit message ID has an unexpected shape');
  const body = await fetchJson(`${origin}/api/v1/message/${encodeURIComponent(id)}`);
  const summary = toSummary(body);
  const source = body as Record<string, unknown>;
  return {
    ...summary,
    text: typeof source['Text'] === 'string' ? boundedText(source['Text']) : '',
  };
}
