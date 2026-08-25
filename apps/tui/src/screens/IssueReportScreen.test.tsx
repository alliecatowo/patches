import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import {
  resetDiagnosticsReporterForTests,
  getDiagnosticsReporter,
} from '../diagnostics/reporter.js';
import { DEFAULT_REPORT_URL } from '../diagnostics/report-endpoint.js';
import { IssueReportScreen } from './IssueReportScreen.js';

function lastFrameText(frame: string | undefined): string {
  // Assertions are over characters; strip OSC/CSI sequences the same way `test/ansi.ts`
  // does. (Block-scoped disable: escape bytes are the thing being stripped here.)
  /* eslint-disable no-control-regex -- matching ANSI control bytes is the point. */
  return (frame ?? '')
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
  /* eslint-enable no-control-regex */
}

interface Harness {
  lastFrame: () => string;
  stdin: { write: (input: string) => void };
  unmount: () => void;
}

function renderScreen(overrides: Partial<Parameters<typeof IssueReportScreen>[0]> = {}): Harness {
  const instance = render(
    <IssueReportScreen
      env={{}}
      nodeDomain="patches.example:7600"
      isActive
      onCancel={() => undefined}
      {...overrides}
    />,
  );
  return {
    lastFrame: () => lastFrameText(instance.lastFrame()),
    stdin: instance.stdin,
    unmount: instance.unmount,
  };
}

/** One keystroke, then a beat: two writes in one stdin chunk reach Ink as a single
 * coalesced keypress (the same fast-typing hazard App's own input layer works around). */
async function press(screen: Harness, input: string): Promise<void> {
  screen.stdin.write(input);
  await new Promise((resolve) => setTimeout(resolve, 25));
}

describe('IssueReportScreen', () => {
  it('describes what is attached and keeps the handle opt-in off by default', () => {
    const { lastFrame } = renderScreen({ sessionHandle: 'allie' });
    const frame = lastFrame();
    expect(frame).toContain('Report an issue');
    expect(frame).toContain('[ ] include my @handle');
    expect(frame).not.toContain('@allie —');
    expect(frame).toContain('never included');
  });

  // §194-safe copy check: the description invites bugs, jank *and* ideas — reporting
  // is not reserved for hard failures.
  it('invites bugs, jank and ideas in its description prompt', () => {
    const { lastFrame } = renderScreen();
    expect(lastFrame()).toMatch(/a bug, something janky, or an idea/i);
  });

  it('files a report with zero input and shows the issue number', async () => {
    resetDiagnosticsReporterForTests();
    getDiagnosticsReporter().recordRpcFailure('listHomeFeed', 14, 'UNAVAILABLE');
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ number: 7, url: 'https://github.com/alliecatowo/patches/issues/7' }),
        {
          status: 201,
        },
      ),
    );
    const onNotify = vi.fn();
    const screen = renderScreen({ env: {}, onNotify });
    // Patch global fetch for this test — submitIssueReport defaults to it.
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      screen.stdin.write('\x13'); // Ctrl+S with an empty description
      await vi.waitFor(() => expect(screen.lastFrame()).toContain('#7'));
      expect(fetchImpl).toHaveBeenCalledWith(
        DEFAULT_REPORT_URL,
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as { body: string }).body) as {
        description: string;
        website?: string;
        bundle: { app: string; sessionHandle: string };
      };
      expect(body.description).toBe('');
      expect(body.website).toBeUndefined();
      expect(body.bundle.app).toBe('tui');
      expect(body.bundle.sessionHandle).toBe('');
      expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('#7'), 'success');
    } finally {
      globalThis.fetch = original;
      screen.unmount();
    }
  });

  it('attaches the handle only after opting in via the toggle', async () => {
    resetDiagnosticsReporterForTests();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ number: 8, url: 'u' }), { status: 201 }));
    const screen = renderScreen({ env: {}, sessionHandle: 'allie' });
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      await press(screen, '\t'); // focus the handle row
      await press(screen, ' '); // opt in
      await vi.waitFor(() => expect(screen.lastFrame()).toContain('[x] include my @handle'));
      await press(screen, '\x13'); // Ctrl+S
      await vi.waitFor(() => expect(screen.lastFrame()).toContain('#8'));
      const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as { body: string }).body) as {
        bundle: { sessionHandle: string };
      };
      expect(body.bundle.sessionHandle).toBe('@allie');
    } finally {
      globalThis.fetch = original;
      screen.unmount();
    }
  });

  it('falls back to local-file guidance and the issues URL when the endpoint is down', async () => {
    resetDiagnosticsReporterForTests();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('getaddrinfo EAI_AGAIN'));
    const onNotify = vi.fn();
    const screen = renderScreen({ env: {}, onNotify });
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      screen.stdin.write('\x13');
      // The real submit path writes the bundle JSON to the OS tmpdir and renders where
      // it went plus the manual-attach URL.
      await vi.waitFor(() => expect(screen.lastFrame()).toMatch(/Could not send|Bundle saved/));
      expect(screen.lastFrame()).toContain('github.com/alliecatowo/patches/issues');
      expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('saved locally'), 'error');
    } finally {
      globalThis.fetch = original;
      screen.unmount();
    }
  });
});
