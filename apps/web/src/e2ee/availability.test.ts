/**
 * Honesty guard for the web messaging surface (B-132, spec §183.1). These assertions are
 * about *copy*, which is exactly the part no compiler checks: the disabled-state sentence
 * must not sell a retry that cannot succeed, must not describe this surface as working,
 * and must stay a single shared constant rather than drifting per call site.
 */
import { describe, expect, it } from 'vitest';

import {
  WEB_E2EE_SESSION_UNAVAILABLE_COPY,
  webE2eeSessionSetupAvailable,
} from './availability.js';
import { WEB_E2EE_COPY } from './web-e2ee.js';

describe('web E2EE availability copy', () => {
  it('reports session setup as unavailable while B-124 is open', () => {
    // This flips only alongside real bundle-claiming — see availability.ts.
    expect(webE2eeSessionSetupAvailable()).toBe(false);
  });

  it('never implies a retry would help', () => {
    expect(WEB_E2EE_SESSION_UNAVAILABLE_COPY).not.toMatch(/try again|retry it|temporarily/i);
    expect(WEB_E2EE_SESSION_UNAVAILABLE_COPY).toMatch(/retrying will not/i);
  });

  it('states plainly that messaging does not work here yet', () => {
    expect(WEB_E2EE_SESSION_UNAVAILABLE_COPY).toMatch(/does not work in the web client yet/i);
    expect(WEB_E2EE_SESSION_UNAVAILABLE_COPY).toMatch(/nothing can be sent or read here/i);
  });

  it('is the one constant every unavailable surface shares', () => {
    expect(WEB_E2EE_COPY.createUnavailable).toBe(WEB_E2EE_SESSION_UNAVAILABLE_COPY);
    expect(WEB_E2EE_COPY.sessionUnavailable).toBe(WEB_E2EE_SESSION_UNAVAILABLE_COPY);
  });
});
