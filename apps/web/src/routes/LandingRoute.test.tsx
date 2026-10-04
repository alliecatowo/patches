import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequestInvite = vi.fn();
const mockStartDemo = vi.fn();
let demoBase: string | undefined = 'https://demo.example.test';

vi.mock('../api/client.js', () => ({
  api: { onboarding: { requestInvite: mockRequestInvite } },
}));

vi.mock('../demo/demo-mode.js', () => ({
  get DEMO_API_BASE() {
    return demoBase;
  },
}));

vi.mock('../demo/start-demo.js', () => {
  class DemoUnavailableError extends Error {}
  return { startDemo: mockStartDemo, DemoUnavailableError };
});

const { LandingRoute, TUI_INSTALL_COMMAND } = await import('./LandingRoute.js');
const { DemoUnavailableError } = await import('../demo/start-demo.js');

function renderLanding(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <LandingRoute />
    </MemoryRouter>,
  );
}

describe('LandingRoute', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    demoBase = 'https://demo.example.test';
    fetchMock.mockReset().mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    mockRequestInvite.mockReset();
    mockStartDemo.mockReset();
  });

  it('explains the product, shows the install command and a prominent demo button', () => {
    renderLanding();
    expect(
      screen.getByRole('heading', { level: 1, name: /a quiet social network/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeInTheDocument();
    expect(screen.getByText(/end-to-end encrypted/i, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(TUI_INSTALL_COMMAND)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('makes no API call on mount; it only pings the demo node health check, no-cors', () => {
    renderLanding();
    expect(mockRequestInvite).not.toHaveBeenCalled();
    expect(mockStartDemo).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://demo.example.test/healthz', {
      mode: 'no-cors',
      cache: 'no-store',
    });
  });

  it('hides the demo button and sends no ping in a build without a demo node', () => {
    demoBase = undefined;
    renderLanding();
    expect(screen.queryByRole('button', { name: /try the demo/i })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Request an invite' })).toBeInTheDocument();
  });

  it('starts the demo and shows progress, then the failure copy when it cannot start', async () => {
    mockStartDemo.mockRejectedValue(new DemoUnavailableError('The demo server is waking up.'));
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }));
    expect(mockStartDemo).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent('The demo server is waking up.');
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeEnabled();
  });

  it('copies the install command', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'Copy install command' }));
    expect(writeText).toHaveBeenCalledWith(TUI_INSTALL_COMMAND);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });
  });

  it('submits the invite request trimmed and then thanks the visitor', async () => {
    mockRequestInvite.mockResolvedValue({});
    renderLanding();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' me@example.test ' } });
    fireEvent.change(screen.getByLabelText(/what would you use it for/i), {
      target: { value: ' terminal person ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request an invite' }));
    await waitFor(() => {
      expect(mockRequestInvite).toHaveBeenCalledWith({
        contact: 'me@example.test',
        message: 'terminal person',
      });
    });
    expect(await screen.findByText(/your request is saved/i)).toBeInTheDocument();
  });

  it('explains a rate-limited invite request', async () => {
    mockRequestInvite.mockRejectedValue({ code: 8 });
    renderLanding();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request an invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many requests/i);
  });
});
