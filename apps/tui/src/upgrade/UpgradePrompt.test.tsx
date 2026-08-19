import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { UpgradePrompt } from './UpgradePrompt.js';
import type { UpgradeInfo } from './check.js';
import type { InstallResult } from './install.js';

const upgrade: UpgradeInfo = {
  latestTag: 'v0.1.0-alpha.3',
  latestVersion: '0.1.0-alpha.3',
  assetUrl: 'https://example.test/patches-social-0.1.0-alpha.3.tgz',
};

describe('UpgradePrompt', () => {
  it('shows the current -> new version prompt', () => {
    const { lastFrame } = render(
      <UpgradePrompt
        currentVersion="0.1.0-alpha.2"
        upgrade={upgrade}
        install={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain('0.1.0-alpha.2 → 0.1.0-alpha.3');
    expect(lastFrame()).toContain('[y/n]');
  });

  it('n declines and calls onDone without installing', () => {
    const install = vi.fn();
    const onDone = vi.fn();
    const { stdin } = render(
      <UpgradePrompt
        currentVersion="0.1.0-alpha.2"
        upgrade={upgrade}
        install={install}
        onDone={onDone}
      />,
    );
    stdin.write('n');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
  });

  it('Escape and Enter also decline', async () => {
    // A lone ESC byte is ambiguous with the start of a CSI sequence (arrow keys, etc.), so
    // Ink's keypress parser holds it briefly before deciding it really is "escape" -- the
    // callback doesn't fire synchronously the way a plain character key's does.
    const onDoneEscape = vi.fn();
    render(
      <UpgradePrompt
        currentVersion="0.1.0-alpha.2"
        upgrade={upgrade}
        install={vi.fn()}
        onDone={onDoneEscape}
      />,
    ).stdin.write('\x1B');
    await vi.waitFor(() => expect(onDoneEscape).toHaveBeenCalledTimes(1));

    const onDoneEnter = vi.fn();
    render(
      <UpgradePrompt
        currentVersion="0.1.0-alpha.2"
        upgrade={upgrade}
        install={vi.fn()}
        onDone={onDoneEnter}
      />,
    ).stdin.write('\r');
    expect(onDoneEnter).toHaveBeenCalledTimes(1);
  });

  it('y installs, shows the spinner and streamed output, then a stay-put success message', async () => {
    let resolveInstall: (result: InstallResult) => void = () => {};
    const install = vi.fn(
      (_upgrade: UpgradeInfo, onOutput: (line: string) => void) =>
        new Promise<InstallResult>((resolve) => {
          onOutput('added 1 package');
          resolveInstall = resolve;
        }),
    );
    const onDone = vi.fn();
    const { lastFrame, stdin } = render(
      <UpgradePrompt
        currentVersion="0.1.0-alpha.2"
        upgrade={upgrade}
        install={install}
        onDone={onDone}
      />,
    );

    stdin.write('y');
    await vi.waitFor(() => expect(lastFrame()).toContain('Upgrading'));
    expect(lastFrame()).toContain('added 1 package');

    resolveInstall({ ok: true, message: 'Upgrade installed.' });
    await vi.waitFor(() => expect(lastFrame()).toContain('Upgraded to 0.1.0-alpha.3'));
    expect(lastFrame()).toContain('Press Ctrl+C to exit');
    // Success must never call onDone — the whole point is that it stays on screen.
    stdin.write('q');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('a second y while installing does not start a second install', () => {
    const install = vi.fn(() => new Promise<InstallResult>(() => {}));
    const { stdin } = render(
      <UpgradePrompt
        currentVersion="0.1.0-alpha.2"
        upgrade={upgrade}
        install={install}
        onDone={vi.fn()}
      />,
    );
    stdin.write('y');
    stdin.write('y');
    stdin.write('y');
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('on failure shows the error and manual command, then any key continues via onDone', async () => {
    const install = vi.fn((): Promise<InstallResult> =>
      Promise.resolve({
        ok: false,
        message: 'npm error 404 Not Found',
        manualCommand: 'npm install --global --allow-remote=all https://example.test/x.tgz',
      }),
    );
    const onDone = vi.fn();
    const { lastFrame, stdin } = render(
      <UpgradePrompt
        currentVersion="0.1.0-alpha.2"
        upgrade={upgrade}
        install={install}
        onDone={onDone}
      />,
    );

    stdin.write('y');
    await vi.waitFor(() => expect(lastFrame()).toContain('Upgrade failed'));
    expect(lastFrame()).toContain('npm error 404 Not Found');
    expect(lastFrame()).toContain('Try it by hand');
    expect(lastFrame()).toContain('npm install --global --allow-remote=all');

    expect(onDone).not.toHaveBeenCalled();
    stdin.write('x');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('plain mode drops the spinner but keeps the same words', async () => {
    const install = vi.fn(() => new Promise<InstallResult>(() => {}));
    const { lastFrame, stdin } = render(
      <UpgradePrompt
        currentVersion="0.1.0-alpha.2"
        upgrade={upgrade}
        install={install}
        onDone={vi.fn()}
        plain
      />,
    );
    stdin.write('y');
    await vi.waitFor(() => expect(lastFrame()).toContain('Upgrading'));
    expect(lastFrame()?.trim()).toBe('Upgrading…');
  });
});
