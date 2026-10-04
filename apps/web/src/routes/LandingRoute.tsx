import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { DEMO_API_BASE } from '../demo/demo-mode.js';
import { DemoUnavailableError, startDemo } from '../demo/start-demo.js';
import styles from './LandingRoute.module.css';

/** The terminal client, from the newest GitHub release (npm 12 needs `--allow-remote=all`
 * for a remote tarball). A registry package and Homebrew are planned. */
export const TUI_INSTALL_COMMAND =
  'npm install --global --allow-remote=all https://github.com/alliecatowo/patches/releases/download/v0.1.0-alpha.7/patches-social-0.1.0-alpha.7.tgz';

const REPO_URL = 'https://github.com/alliecatowo/patches';

/**
 * The page a signed-out first-time visitor lands on (`/`). It makes no API call on mount, so it
 * paints from the static bundle on the CDN edge even while the Fly machines behind it are
 * asleep; the only network traffic is a fire-and-forget request that wakes the demo node so
 * "Try the demo" is usually quick. Every screenshot on it was taken from a demo sandbox.
 */
export function LandingRoute(): JSX.Element {
  useWakeDemoNode();
  return (
    <div className={styles['page']}>
      <header className={styles['top']}>
        <span className={styles['wordmark']}>patches</span>
        <nav aria-label="Site">
          <a href="#install">Install</a>
          <a href="#invite">Invite</a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Source
          </a>
          <Link to="/login">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className={styles['hero']} aria-labelledby="hero-title">
          <p className={styles['kicker']}>open source · chronological · encrypted DMs</p>
          <h1 id="hero-title">A quiet social network you can finish.</h1>
          <p className={styles['lede']}>
            Patches shows posts in the order they happened: no ranking, no scores, no ads. Direct
            messages are end-to-end encrypted. The first-class client is a terminal app, and the
            browser version does the same things.
          </p>
          <DemoCallToAction />
        </section>

        <section className={styles['shots']} aria-label="Screenshots from the demo">
          <figure className={styles['patch']}>
            <img
              src="/landing/home.webp"
              width="1536"
              height="655"
              alt="The Patches home timeline in the browser: a chronological list of posts from three people, with a sidebar of Home, Search, Notifications and Messages."
              loading="eager"
              decoding="async"
            />
            <figcaption>web · home timeline, oldest at the bottom</figcaption>
          </figure>
          <figure className={styles['patch']}>
            <img
              src="/landing/dm.webp"
              width="1536"
              height="655"
              alt="An encrypted direct message thread in Patches with a banner that says this node cannot read the messages but can see who you message and when."
              loading="lazy"
              decoding="async"
            />
            <figcaption>web · an end-to-end encrypted thread</figcaption>
          </figure>
        </section>

        <section className={styles['principles']} aria-labelledby="principles-title">
          <h2 id="principles-title">What it is, plainly</h2>
          <dl>
            <div className={styles['principle']}>
              <dt>In the order it happened</dt>
              <dd>
                Home, profiles, tags and communities are strictly chronological. A like never moves
                a post, and there is no ranking function anywhere in the code.
              </dd>
            </div>
            <div className={styles['principle']}>
              <dt>Encrypted, with the caveat</dt>
              <dd>
                Direct messages are sealed on your device with a Double Ratchet. The server only
                routes ciphertext, but it can still see who you message and when. The app says so
                next to every conversation.
              </dd>
            </div>
            <div className={styles['principle']}>
              <dt>A terminal app first</dt>
              <dd>
                The full-screen client covers threads, profile pages and messages, and shows images
                in terminals that support them. The web app is for when you are not at a shell.
              </dd>
            </div>
            <div className={styles['principle']}>
              <dt>Yours to run</dt>
              <dd>
                MIT licensed. A node is one server and a Postgres database, and you can read every
                line of it.
              </dd>
            </div>
          </dl>
        </section>

        <section id="install" className={styles['install']} aria-labelledby="install-title">
          <h2 id="install-title">Install the terminal client</h2>
          <p>
            Needs Node 24. This is an alpha release; a registry package and Homebrew formula are
            planned.
          </p>
          <InstallCommand />
          <figure className={styles['patch']}>
            <img
              src="/landing/tui.webp"
              width="1200"
              height="700"
              alt="The Patches terminal client showing a home timeline in a dark terminal theme."
              loading="lazy"
              decoding="async"
            />
            <figcaption>terminal · the same timeline</figcaption>
          </figure>
        </section>

        <section id="invite" className={styles['invite']} aria-labelledby="invite-title">
          <h2 id="invite-title">Want a real account?</h2>
          <p>
            Accounts on this server are invite-only for now. Leave an email and, if you like, a line
            about what you would use it for. A person reads these; nothing is sent automatically.
          </p>
          <InviteRequestForm />
        </section>
      </main>

      <footer className={styles['foot']}>
        <small>
          patches is open source ·{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            source
          </a>{' '}
          ·{' '}
          <a href="https://patches-site.pages.dev" target="_blank" rel="noopener noreferrer">
            docs
          </a>{' '}
          ·{' '}
          <a
            href={`${REPO_URL}/blob/main/docs/product/privacy.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            privacy
          </a>
        </small>
      </footer>
    </div>
  );
}

/** Fire-and-forget: wakes the scale-to-zero demo node while the visitor reads. Never blocks or
 * reports; a failure just means the first click waits a little longer. */
function useWakeDemoNode(): void {
  useEffect(() => {
    if (DEMO_API_BASE === undefined) return;
    void fetch(`${DEMO_API_BASE}/healthz`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {
      // Intentionally ignored (see above).
    });
  }, []);
}

function DemoCallToAction(): JSX.Element {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  function begin(): void {
    setStarting(true);
    setError(undefined);
    startDemo().catch((caught: unknown) => {
      setStarting(false);
      setError(
        caught instanceof DemoUnavailableError
          ? caught.message
          : 'The demo could not start. Try again in a moment.',
      );
    });
  }

  return (
    <div className={styles['cta']}>
      {DEMO_API_BASE === undefined ? null : (
        <>
          <button
            type="button"
            className={styles['demoButton']}
            onClick={begin}
            disabled={starting}
            aria-describedby="demo-note"
          >
            {starting ? 'Starting your sandbox…' : 'Try the demo'}
          </button>
          <p id="demo-note" className={styles['note']} role="status">
            {starting
              ? 'Waking the demo server and filling the sandbox. This can take up to half a minute.'
              : 'A throwaway account with fake friends, posts and encrypted messages. No sign-up; it is deleted after an hour.'}
          </p>
          {error === undefined ? null : (
            <p className={styles['error']} role="alert">
              {error}
            </p>
          )}
        </>
      )}
      <a className={styles['secondary']} href="#invite">
        Request an invite
      </a>
    </div>
  );
}

function InstallCommand(): JSX.Element {
  const [copied, setCopied] = useState(false);

  function copy(): void {
    navigator.clipboard.writeText(TUI_INSTALL_COMMAND).then(
      () => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      },
      () => {
        // Clipboard blocked: the command is selectable text, so nothing else to do.
      },
    );
  }

  return (
    <div className={styles['command']}>
      <pre>
        <code>
          <span className={styles['prompt']}>$ </span>
          {TUI_INSTALL_COMMAND}
        </code>
      </pre>
      <pre>
        <code>
          <span className={styles['prompt']}>$ </span>patches
        </code>
      </pre>
      <button type="button" className={styles['copy']} onClick={copy}>
        {copied ? 'Copied' : 'Copy install command'}
      </button>
    </div>
  );
}

type InviteState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'sent' }
  | { readonly kind: 'error'; readonly message: string };

function InviteRequestForm(): JSX.Element {
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<InviteState>({ kind: 'idle' });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setState({ kind: 'sending' });
    api.onboarding.requestInvite({ contact: contact.trim(), message: message.trim() }).then(
      () => {
        setState({ kind: 'sent' });
      },
      (caught: unknown) => {
        const code = (caught as { code?: number } | null)?.code;
        setState({
          kind: 'error',
          message:
            code === 8
              ? 'Too many requests from your connection. Try again later.'
              : code === 3
                ? 'That does not look like an email address.'
                : 'The request did not go through. Try again in a moment.',
        });
      },
    );
  }

  if (state.kind === 'sent') {
    return (
      <p className={styles['thanks']} role="status">
        Thanks. Your request is saved. If there is room, an invite will arrive by email.
      </p>
    );
  }

  return (
    <form className={styles['form']} onSubmit={submit}>
      <label htmlFor="invite-contact">Email</label>
      <input
        id="invite-contact"
        type="email"
        required
        autoComplete="email"
        maxLength={254}
        value={contact}
        onChange={(event) => {
          setContact(event.target.value);
        }}
      />
      <label htmlFor="invite-message">
        What would you use it for? <span className={styles['optional']}>(optional)</span>
      </label>
      <textarea
        id="invite-message"
        rows={3}
        maxLength={500}
        value={message}
        onChange={(event) => {
          setMessage(event.target.value);
        }}
      />
      <button type="submit" className={styles['submit']} disabled={state.kind === 'sending'}>
        {state.kind === 'sending' ? 'Sending…' : 'Request an invite'}
      </button>
      {state.kind === 'error' ? (
        <p className={styles['error']} role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
