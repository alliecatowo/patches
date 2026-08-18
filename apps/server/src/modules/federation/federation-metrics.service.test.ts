import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service.js';
import { FederationMetricsService } from './federation-metrics.service.js';

function fakeConfig(federationEnabled = false): AppConfigService {
  return { federationEnabled } as AppConfigService;
}

describe('FederationMetricsService', () => {
  it('starts empty', () => {
    expect(new FederationMetricsService(fakeConfig()).snapshot()).toEqual({});
  });

  it('increments an unlabeled counter', () => {
    const metrics = new FederationMetricsService(fakeConfig());
    metrics.increment('inbox_received');
    metrics.increment('inbox_received');
    expect(metrics.snapshot()).toEqual({ inbox_received: 2 });
  });

  it('keys distinct labels as distinct counters, order-independently', () => {
    const metrics = new FederationMetricsService(fakeConfig());
    metrics.increment('inbox_handled', { type: 'Follow', domain: 'a.test' });
    metrics.increment('inbox_handled', { domain: 'a.test', type: 'Follow' });
    metrics.increment('inbox_handled', { type: 'Create', domain: 'a.test' });
    expect(metrics.snapshot()).toEqual({
      'inbox_handled{domain=a.test,type=Follow}': 2,
      'inbox_handled{domain=a.test,type=Create}': 1,
    });
  });

  it('drops undefined label values from the key rather than stringifying them', () => {
    const metrics = new FederationMetricsService(fakeConfig());
    metrics.increment('inbox_handled', { type: 'Follow', domain: undefined });
    expect(metrics.snapshot()).toEqual({ 'inbox_handled{type=Follow}': 1 });
  });

  describe('the periodic structured log', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('never starts when federation is disabled on this node', () => {
      vi.useFakeTimers();
      const metrics = new FederationMetricsService(fakeConfig(false));
      const logSpy = vi.spyOn(metrics['logger'], 'log');
      metrics.onModuleInit();
      vi.advanceTimersByTime(120_000);
      expect(logSpy).not.toHaveBeenCalled();
      metrics.onModuleDestroy();
    });

    it('logs a federation_metrics event every 60s when federation is enabled', () => {
      vi.useFakeTimers();
      const metrics = new FederationMetricsService(fakeConfig(true));
      const logSpy = vi.spyOn(metrics['logger'], 'log');
      metrics.increment('inbox_received');
      metrics.onModuleInit();
      vi.advanceTimersByTime(60_000);
      expect(logSpy).toHaveBeenCalledTimes(1);
      const [line] = logSpy.mock.calls[0] as [string];
      expect(JSON.parse(line)).toEqual({ event: 'federation_metrics', inbox_received: 1 });
      metrics.onModuleDestroy();
    });
  });
});
