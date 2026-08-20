import { create } from '@bufbuild/protobuf';
import {
  GitHubLoginStatus,
  DeviceLinkStatus,
  PollGitHubLoginResponseSchema,
  PollDeviceLinkResponseSchema,
  SessionSchema,
  type PollGitHubLoginResponse,
  type PollDeviceLinkResponse,
  type Session,
} from '@patches/proto/es';
import { describe, expect, it, vi } from 'vitest';

import { classifyDeviceLink, classifyGitHubLogin, startDevicePoll } from './devicePoll.js';

const fakeSession: Session = create(SessionSchema, { accessToken: 'a', refreshToken: 'r' });

function githubResponse(status: GitHubLoginStatus, session?: Session): PollGitHubLoginResponse {
  return create(PollGitHubLoginResponseSchema, session ? { status, session } : { status });
}

function deviceLinkResponse(status: DeviceLinkStatus, session?: Session): PollDeviceLinkResponse {
  return create(PollDeviceLinkResponseSchema, session ? { status, session } : { status });
}

describe('classifyGitHubLogin', () => {
  it('keeps pending status pending at the same interval', () => {
    expect(classifyGitHubLogin(githubResponse(GitHubLoginStatus.PENDING), 5)).toEqual({
      kind: 'pending',
      nextIntervalSeconds: 5,
    });
  });

  it('backs off by 5s on SLOW_DOWN', () => {
    expect(classifyGitHubLogin(githubResponse(GitHubLoginStatus.SLOW_DOWN), 5)).toEqual({
      kind: 'pending',
      nextIntervalSeconds: 10,
    });
  });

  it('reports expired/denied as terminal', () => {
    expect(classifyGitHubLogin(githubResponse(GitHubLoginStatus.EXPIRED), 5)).toEqual({
      kind: 'terminal',
      reason: 'expired',
    });
    expect(classifyGitHubLogin(githubResponse(GitHubLoginStatus.DENIED), 5)).toEqual({
      kind: 'terminal',
      reason: 'denied',
    });
  });

  it('completes with the session once COMPLETE carries one', () => {
    expect(classifyGitHubLogin(githubResponse(GitHubLoginStatus.COMPLETE, fakeSession), 5)).toEqual(
      { kind: 'complete', session: fakeSession },
    );
  });
});

describe('classifyDeviceLink', () => {
  it('has no DENIED terminal case — only EXPIRED', () => {
    expect(classifyDeviceLink(deviceLinkResponse(DeviceLinkStatus.EXPIRED), 5)).toEqual({
      kind: 'terminal',
      reason: 'expired',
    });
  });

  it('completes with the session', () => {
    expect(
      classifyDeviceLink(deviceLinkResponse(DeviceLinkStatus.COMPLETE, fakeSession), 5),
    ).toEqual({ kind: 'complete', session: fakeSession });
  });
});

describe('startDevicePoll', () => {
  it('schedules the first poll after intervalSeconds and calls poll once', async () => {
    vi.useFakeTimers();
    const poll = vi.fn().mockResolvedValue(githubResponse(GitHubLoginStatus.PENDING));
    const onIntervalChange = vi.fn();
    startDevicePoll({
      link: { deviceCode: 'dc', userCode: 'UC', intervalSeconds: 5 },
      poll,
      classify: (r: PollGitHubLoginResponse) => classifyGitHubLogin(r, 5),
      onIntervalChange,
      onTerminal: vi.fn(),
      onComplete: vi.fn(),
    });

    expect(poll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(poll).toHaveBeenCalledWith('dc');
    expect(onIntervalChange).toHaveBeenCalledWith({
      deviceCode: 'dc',
      userCode: 'UC',
      intervalSeconds: 5,
    });
    vi.useRealTimers();
  });

  it('stops polling once cancelled', async () => {
    vi.useFakeTimers();
    const poll = vi.fn().mockResolvedValue(githubResponse(GitHubLoginStatus.PENDING));
    const handle = startDevicePoll({
      link: { deviceCode: 'dc', userCode: 'UC', intervalSeconds: 1 },
      poll,
      classify: (r: PollGitHubLoginResponse) => classifyGitHubLogin(r, 1),
      onIntervalChange: vi.fn(),
      onTerminal: vi.fn(),
      onComplete: vi.fn(),
    });
    handle.cancel();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('calls onComplete once COMPLETE is classified', async () => {
    vi.useFakeTimers();
    const poll = vi.fn().mockResolvedValue(githubResponse(GitHubLoginStatus.COMPLETE, fakeSession));
    const onComplete = vi.fn();
    startDevicePoll({
      link: { deviceCode: 'dc', userCode: 'UC', intervalSeconds: 1 },
      poll,
      classify: (r: PollGitHubLoginResponse) => classifyGitHubLogin(r, 1),
      onIntervalChange: vi.fn(),
      onTerminal: vi.fn(),
      onComplete,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onComplete).toHaveBeenCalledWith(fakeSession);
    vi.useRealTimers();
  });

  it('keeps polling at the same interval on a transient poll error', async () => {
    vi.useFakeTimers();
    const poll = vi
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce(githubResponse(GitHubLoginStatus.PENDING));
    startDevicePoll({
      link: { deviceCode: 'dc', userCode: 'UC', intervalSeconds: 1 },
      poll,
      classify: (r: PollGitHubLoginResponse) => classifyGitHubLogin(r, 1),
      onIntervalChange: vi.fn(),
      onTerminal: vi.fn(),
      onComplete: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
