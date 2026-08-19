import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * An unsent compose draft (spec §80). Only non-sensitive text — an access/refresh
 * token never belongs here, and there is nothing else to persist yet (no media
 * attachment picker in this slice).
 */
export interface ComposeDraft {
  body: string;
  /**
   * The idempotency key for this draft's eventual `CreatePost` (spec §45). Fixed
   * for the lifetime of the draft so a retry after a failed send reuses the same
   * key rather than risking a duplicate post; a fresh id is drawn only once the
   * draft is discarded or successfully posted.
   */
  clientRequestId: string;
  /** Set only for a reply draft (`r` from a post row/thread screen) — `Post.id` of
   * the post being replied to (spec §51's `in_reply_to_id`). Absent for a root post. */
  inReplyToId?: string;
  /** The reply target's `@handle`, purely for the "replying to @handle" header —
   * never sent to the server. */
  replyingToHandle?: string;
  /** Set for a quote-post draft (`Q` on a post). The quoted post is rendered as
   * context by compose and sent as `quoted_post_id`; its body is never copied into
   * the draft, so edits/deletes continue to follow the server's pointer semantics. */
  quotedPostId?: string;
  /** Display-only quote target label. */
  quotingHandle?: string;
  /** Optional click-to-reveal label authored with this post. */
  contentWarning?: string;
  /** Already-uploaded, `READY` attachments in display order (spec §27–28: up to 4 per
   * post) — `fileName` is display-only (never sent), `mediaId` is what `CreatePost`'s
   * `media_ids` carries. Surviving a crash here means a completed upload is never
   * silently lost even if the post itself never got sent (spec §80). */
  attachments?: { mediaId: string; fileName: string }[];
}

/**
 * Where compose drafts survive a crash (spec §80: "MVP SHOULD persist unsent
 * compose drafts locally"). Deliberately separate from `CredentialStore`'s
 * `XDG_CONFIG_HOME` — a draft is disposable local state, not configuration.
 */
export interface DraftStore {
  load(): Promise<ComposeDraft | undefined>;
  save(draft: ComposeDraft): Promise<void>;
  clear(): Promise<void>;
}

function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg !== undefined && xdg.trim() !== '' ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'patches');
}

export function draftFilePath(): string {
  return join(dataDir(), 'compose-draft.json');
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isAttachmentList(
  value: unknown,
): value is { mediaId: string; fileName: string }[] | undefined {
  if (value === undefined) return true;
  return (
    Array.isArray(value) &&
    value.every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { mediaId?: unknown }).mediaId === 'string' &&
        typeof (entry as { fileName?: unknown }).fileName === 'string',
    )
  );
}

function isComposeDraft(value: unknown): value is ComposeDraft {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ComposeDraft>;
  return (
    typeof candidate.body === 'string' &&
    typeof candidate.clientRequestId === 'string' &&
    isOptionalString(candidate.inReplyToId) &&
    isOptionalString(candidate.replyingToHandle) &&
    isOptionalString(candidate.quotedPostId) &&
    isOptionalString(candidate.quotingHandle) &&
    isOptionalString(candidate.contentWarning) &&
    isAttachmentList(candidate.attachments)
  );
}

/** The real backend: one JSON file under the XDG data dir. */
export class FileDraftStore implements DraftStore {
  private readonly path: string;

  constructor(path: string = draftFilePath()) {
    this.path = path;
  }

  async load(): Promise<ComposeDraft | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return undefined;
      throw error;
    }
    const parsed: unknown = JSON.parse(raw);
    return isComposeDraft(parsed) ? parsed : undefined;
  }

  async save(draft: ComposeDraft): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}

/** Tests, and anywhere a draft should live only for the process lifetime. */
export class MemoryDraftStore implements DraftStore {
  private draft: ComposeDraft | undefined;

  load(): Promise<ComposeDraft | undefined> {
    return Promise.resolve(this.draft);
  }

  save(draft: ComposeDraft): Promise<void> {
    this.draft = draft;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.draft = undefined;
    return Promise.resolve();
  }
}
