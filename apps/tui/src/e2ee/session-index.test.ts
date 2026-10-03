import { describe, expect, it } from 'vitest';

import {
  addEntry,
  confirmEntry,
  decodeSessionIndex,
  emptyPeer,
  encodeSessionIndex,
  handshakeIdOf,
  incomingWins,
  MAX_SEEN_HANDSHAKES,
  MAX_SESSIONS_PER_PEER,
  receiveOrder,
  sessionKeyFor,
  type PeerSessions,
  type SessionEntry,
} from './session-index.js';

const BASE = 'conv\u0000actor-b\u0000device-b';

function entry(seed: number, over: Partial<SessionEntry> = {}): SessionEntry {
  const handshakeId = handshakeIdOf(new Uint8Array([seed]));
  return {
    handshakeId,
    role: 'responder',
    confirmed: true,
    setupPrefix: new Uint8Array(0),
    key: sessionKeyFor(BASE, handshakeId),
    ...over,
  };
}

describe('incomingWins (glare tie-break)', () => {
  const self = { actorId: 'actor-b', deviceId: 'device-b' };
  const unconfirmed = entry(1, { role: 'initiator', confirmed: false });

  it('keeps our unconfirmed initiator session when we sort lower', () => {
    expect(
      incomingWins({
        primary: unconfirmed,
        self: { actorId: 'actor-a', deviceId: 'device-a' },
        peer: { actorId: 'actor-b', deviceId: 'device-b' },
      }),
    ).toBe(false);
  });

  it('adopts the peer handshake when the peer sorts lower', () => {
    expect(
      incomingWins({
        primary: unconfirmed,
        self,
        peer: { actorId: 'actor-a', deviceId: 'device-a' },
      }),
    ).toBe(true);
  });

  it('compares UTF-8 bytes, not UTF-16 units', () => {
    // U+FF5E sorts above U+1F600 in UTF-16 code units but below it in UTF-8 bytes.
    const high = { actorId: '\u{1F600}', deviceId: 'd' };
    const low = { actorId: '～', deviceId: 'd' };
    expect(incomingWins({ primary: unconfirmed, self: high, peer: low })).toBe(true);
    expect(incomingWins({ primary: unconfirmed, self: low, peer: high })).toBe(false);
  });

  it('lets a restarted peer win against a confirmed, responder or absent primary', () => {
    const peer = { actorId: 'actor-z', deviceId: 'device-z' };
    expect(incomingWins({ primary: undefined, self, peer })).toBe(true);
    expect(incomingWins({ primary: entry(2), self, peer })).toBe(true);
    expect(
      incomingWins({ primary: entry(3, { role: 'initiator', confirmed: true }), self, peer }),
    ).toBe(true);
  });
});

describe('peer record transitions', () => {
  it('caps sessions, never evicting the sender or an unanswered initiator', () => {
    let peer: PeerSessions = emptyPeer(BASE);
    const unanswered = entry(0, {
      role: 'initiator',
      confirmed: false,
      setupPrefix: new Uint8Array([1]),
    });
    peer = addEntry(peer, unanswered, true).peer;
    const evicted: string[] = [];
    for (let seed = 1; seed <= MAX_SESSIONS_PER_PEER + 2; seed += 1) {
      const added = addEntry(peer, entry(seed), seed === MAX_SESSIONS_PER_PEER + 2);
      peer = added.peer;
      evicted.push(...added.evictedKeys);
    }
    expect(peer.entries.length).toBeLessThanOrEqual(MAX_SESSIONS_PER_PEER);
    expect(peer.entries.some((candidate) => candidate.key === unanswered.key)).toBe(true);
    expect(peer.entries.some((candidate) => candidate.key === peer.primaryKey)).toBe(true);
    expect(evicted).not.toContain(unanswered.key);
  });

  it('remembers evicted handshakes as seen, up to a bound', () => {
    let peer: PeerSessions = emptyPeer(BASE);
    for (let seed = 0; seed < MAX_SEEN_HANDSHAKES + 10; seed += 1) {
      peer = addEntry(peer, entry(seed % 250 === seed ? seed : seed), true).peer;
    }
    expect(peer.seen.length).toBe(MAX_SEEN_HANDSHAKES);
  });

  it('confirming an initiator drops its setup block', () => {
    const pending = entry(5, {
      role: 'initiator',
      confirmed: false,
      setupPrefix: new Uint8Array([9]),
    });
    const peer = confirmEntry(addEntry(emptyPeer(BASE), pending, true).peer, pending.key);
    expect(peer.entries[0]?.confirmed).toBe(true);
    expect(peer.entries[0]?.setupPrefix.length).toBe(0);
  });

  it('receives on the sender first, then newest first', () => {
    let peer: PeerSessions = emptyPeer(BASE);
    const [a, b, c] = [entry(1), entry(2), entry(3)];
    peer = addEntry(peer, a, true).peer;
    peer = addEntry(peer, b, false).peer;
    peer = addEntry(peer, c, false).peer;
    expect(receiveOrder(peer).map((candidate) => candidate.key)).toEqual([a.key, c.key, b.key]);
  });
});

describe('index encoding', () => {
  it('round-trips and rejects truncation', () => {
    const pending = entry(7, {
      role: 'initiator',
      confirmed: false,
      setupPrefix: new Uint8Array([4, 5]),
    });
    const peer = addEntry(addEntry(emptyPeer(BASE), entry(6), true).peer, pending, false).peer;
    const bytes = encodeSessionIndex(new Map([[BASE, peer]]));
    const decoded = decodeSessionIndex(bytes).get(BASE);
    expect(decoded?.primaryKey).toBe(peer.primaryKey);
    expect(decoded?.entries.map((candidate) => candidate.key)).toEqual(
      peer.entries.map((candidate) => candidate.key),
    );
    expect(decoded?.entries[1]?.setupPrefix).toEqual(new Uint8Array([4, 5]));
    expect(decoded?.seen.length).toBe(peer.seen.length);
    expect(() => decodeSessionIndex(bytes.subarray(0, bytes.length - 1))).toThrow();
  });
});
