import type { PatchesApi } from '@patches/client';
import { describe, expect, it } from 'vitest';

import {
  capturePeerSecuritySnapshot,
  comparePeerSecurity,
  type PeerSecurityBaseline,
} from './peer-security.js';

const baseline: PeerSecurityBaseline = {
  actorId: 'peer',
  rootGeneration: 3,
  rootPublicKeyHex: 'aabb',
  rosterSequence: '7',
  rosterDigestHex: 'ccdd',
};

// Minimal typed fake: only the two RPCs the capture helper touches need to exist.
interface RootResponse {
  identityRoot?: { generation: number; publicKey?: Uint8Array };
  identityChangedSinceAcknowledged: boolean;
}
interface RosterResponse {
  roster?: { sequence: bigint; digest?: Uint8Array };
}
function fakeApi(root: RootResponse, roster: RosterResponse): PatchesApi {
  return {
    e2ee: {
      getIdentityRoot: (): Promise<RootResponse> => Promise.resolve(root),
      getDeviceRoster: (): Promise<RosterResponse> => Promise.resolve(roster),
    },
  } as unknown as PatchesApi;
}

describe('comparePeerSecurity (A-072)', () => {
  it('is ok when nothing moved since baseline', () => {
    expect(comparePeerSecurity(baseline, baseline, false)).toEqual({ status: 'ok' });
  });

  it('flags identityChanged when the root public key changed', () => {
    expect(comparePeerSecurity(baseline, { ...baseline, rootPublicKeyHex: 'ff00' }, false)).toEqual(
      { status: 'identityChanged' },
    );
  });

  it('flags identityChanged when the root generation moved', () => {
    expect(comparePeerSecurity(baseline, { ...baseline, rootGeneration: 4 }, false)).toEqual({
      status: 'identityChanged',
    });
  });

  it('flags identityChanged when the node says the identity changed since last acknowledgement', () => {
    expect(comparePeerSecurity(baseline, baseline, true)).toEqual({ status: 'identityChanged' });
  });

  it('flags identityChanged when the peer actor id differs (a different peer)', () => {
    expect(comparePeerSecurity(baseline, { ...baseline, actorId: 'someone-else' }, false)).toEqual({
      status: 'identityChanged',
    });
  });

  it('flags rosterChanged when the roster sequence moved (a device gained)', () => {
    expect(comparePeerSecurity(baseline, { ...baseline, rosterSequence: '8' }, false)).toEqual({
      status: 'rosterChanged',
    });
  });

  it('flags rosterChanged when the roster digest changed', () => {
    expect(comparePeerSecurity(baseline, { ...baseline, rosterDigestHex: '9988' }, false)).toEqual({
      status: 'rosterChanged',
    });
  });

  it('prefers identityChanged over rosterChanged when both moved', () => {
    expect(
      comparePeerSecurity(baseline, { ...baseline, rootGeneration: 9, rosterSequence: '8' }, false),
    ).toEqual({ status: 'identityChanged' });
  });
});

describe('capturePeerSecuritySnapshot (A-072)', () => {
  it('reads the served root and roster and the acknowledged flag', async () => {
    const api = fakeApi(
      {
        identityRoot: { generation: 3, publicKey: new Uint8Array([0xaa, 0xbb]) },
        identityChangedSinceAcknowledged: true,
      },
      { roster: { sequence: 7n, digest: new Uint8Array([0xcc, 0xdd]) } },
    );

    const snapshot = await capturePeerSecuritySnapshot(api, 'peer');

    expect(snapshot.identityChangedSinceAcknowledged).toBe(true);
    expect(snapshot.baseline).toEqual(baseline);
  });

  it('defaults an absent root/roster to empty instead of throwing', async () => {
    const api = fakeApi({ identityChangedSinceAcknowledged: false }, {});

    const snapshot = await capturePeerSecuritySnapshot(api, 'peer');

    expect(snapshot.identityChangedSinceAcknowledged).toBe(false);
    expect(snapshot.baseline.rootPublicKeyHex).toBe('');
    expect(snapshot.baseline.rosterDigestHex).toBe('');
  });
});
