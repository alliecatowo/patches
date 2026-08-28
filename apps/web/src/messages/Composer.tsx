import { type JSX, type KeyboardEvent, useEffect, useRef, useState } from 'react';

import styles from './Composer.module.css';

export interface ComposerProps {
  readonly placeholder?: string;
  /** `undefined` when the last send is neither pending nor failed. `'sending'` disables the
   * form; `'failed'` shows a retry row and keeps the drafted text so nothing is lost. */
  readonly status?: 'sending' | 'failed' | undefined;
  readonly onSend: (body: string) => void;
  readonly onRetry?: () => void;
  readonly disabled?: boolean;
}

const MAX_ROWS = 8;

/**
 * #321: the sticky bottom composer — an auto-growing textarea (bounded so a long paste never
 * eats the whole viewport), Enter to send / Shift+Enter for a newline, and an explicit
 * sending/failed-with-retry state so a dropped send is never silently lost.
 */
export function Composer({
  placeholder = 'Write a message…',
  status,
  onSend,
  onRetry,
  disabled,
}: ComposerProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const [lastSent, setLastSent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sending = status === 'sending';
  const failed = status === 'failed';

  useEffect(() => {
    const el = textareaRef.current;
    if (el === null) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '20');
    const maxHeight = lineHeight * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [draft]);

  function submit(): void {
    const body = draft.trim();
    if (body === '' || sending || disabled === true) return;
    setLastSent(body);
    setDraft('');
    onSend(body);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div>
      {failed ? (
        <div className={styles['failedRow']} role="alert">
          <span>Message failed to send.</span>
          <button
            type="button"
            className={styles['retryBtn']}
            onClick={() => {
              setDraft(lastSent);
              onRetry?.();
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      <form
        className={styles['composer']}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textareaRef}
          aria-label="Message body"
          className={styles['input']}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder}
          disabled={disabled === true}
        />
        <button
          type="submit"
          className={styles['sendBtn']}
          disabled={sending || disabled === true || draft.trim() === ''}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
