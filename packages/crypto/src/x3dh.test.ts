import { describe, expect, it } from 'vitest';

import { AuthenticationError, PreKeyError } from './errors.js';
import { signPreKeyBundle, verifyPreKeyBundle } from './identity.js';
import { keyAgreementKeyPairFromPrivate } from './primitives.js';
import {
  bundleFixture,
  establishedFixture,
  fixtureBytes,
  userFixture,
  FIXTURE_NOW,
} from './testing/fixtures.js';
import { initiateX3dh, respondX3dh } from './x3dh.js';

const NOW = FIXTURE_NOW;

describe('X3DH over verified identity material', () => {
  it('derives identical secrets on both sides', () => {
    const fixture = establishedFixture(7);
    expect(fixture.responded.secrets).toEqual(fixture.initiated.secrets);
    expect(fixture.initiated.usedOneTimePreKey).toBe(true);
    expect(fixture.responded.consumedOneTimePreKeyId).toBe(91);
  });

  it('rejects device private keys that do not match the certified public keys', () => {
    const alice = userFixture('alice', 1);
    const bob = userFixture('bob', 11);
    const bobPrekeys = bundleFixture(bob, 21);
    expect(() =>
      initiateX3dh({
        initiatorKeys: bob.keys,
        initiatorDevice: alice.device,
        initiatorRoster: alice.roster,
        responderBundle: bobPrekeys.bundle,
        responderRoster: bob.roster,
        nowMs: NOW,
      }),
    ).toThrow(AuthenticationError);
  });

  it('rejects an initiator device that is not an active entry of its own roster', () => {
    const alice = userFixture('alice', 1);
    const bob = userFixture('bob', 11);
    const bobPrekeys = bundleFixture(bob, 21);
    expect(() =>
      initiateX3dh({
        initiatorKeys: alice.keys,
        initiatorDevice: alice.device,
        initiatorRoster: bob.roster,
        responderBundle: bobPrekeys.bundle,
        responderRoster: bob.roster,
        nowMs: NOW,
      }),
    ).toThrow(AuthenticationError);
  });

  it('rejects a bundle verified against a different roster snapshot than the one supplied', () => {
    const alice = userFixture('alice', 1);
    const bob = userFixture('bob', 11);
    const bobPrekeys = bundleFixture(bob, 21);
    expect(() =>
      initiateX3dh({
        initiatorKeys: alice.keys,
        initiatorDevice: alice.device,
        initiatorRoster: alice.roster,
        responderBundle: bobPrekeys.bundle,
        responderRoster: alice.roster,
        nowMs: NOW,
      }),
    ).toThrow(AuthenticationError);
  });

  it('re-checks every validity window against the caller nowMs, not the verifier time', () => {
    const alice = userFixture('alice', 1);
    const bob = userFixture('bob', 11);
    const bobPrekeys = bundleFixture(bob, 21);
    // The bundle expires at 20_000; a `Verified*` value proves its signature, never that it is
    // still current, so setup at a later `nowMs` must fail.
    expect(() =>
      initiateX3dh({
        initiatorKeys: alice.keys,
        initiatorDevice: alice.device,
        initiatorRoster: alice.roster,
        responderBundle: bobPrekeys.bundle,
        responderRoster: bob.roster,
        nowMs: 30_000,
      }),
    ).toThrow(AuthenticationError);
  });

  it('responderBundleNowMs backdates only the responder bundle window, never the initiator checks', () => {
    const fixture = establishedFixture(5);
    const respond = (nowMs: number, responderBundleNowMs?: number) =>
      respondX3dh({
        responderKeys: fixture.bob.keys,
        responderBundle: fixture.bobPrekeys.bundle,
        responderRoster: fixture.bob.roster,
        initiatorRoster: fixture.alice.roster,
        signedPreKey: fixture.bobPrekeys.signedPreKey,
        oneTimePreKey: fixture.bobPrekeys.oneTimePreKey,
        handshake: fixture.initiated.handshake,
        nowMs,
        ...(responderBundleNowMs === undefined ? {} : { responderBundleNowMs }),
      });
    // Bundle expired at 20_000: a plain late response fails ...
    expect(() => respond(30_000)).toThrow(AuthenticationError);
    // ... but a retained (rotated-out) bundle judged at the moment it was current succeeds.
    expect(respond(30_000, FIXTURE_NOW).secrets).toEqual(fixture.responded.secrets);
    // The initiator certificate expires at 1_000_000; backdating the responder bundle must not
    // resurrect an initiator whose certificate has since lapsed.
    expect(() => respond(2_000_000, FIXTURE_NOW)).toThrow(AuthenticationError);
  });

  it('binds prekey ids as u64, above the old u32 ceiling', () => {
    const bob = userFixture('bob', 11);
    const alice = userFixture('alice', 1);
    const signedPreKey = {
      id: 2 ** 33 + 5,
      keyPair: keyAgreementKeyPairFromPrivate(fixtureBytes(31)),
    };
    const signed = signPreKeyBundle(bob.keys.signing.privateKey, {
      actorId: bob.device.actorId,
      deviceId: bob.device.deviceId,
      certificateDigest: bob.device.certificateDigest,
      signedPrekeyId: signedPreKey.id,
      signedPrekeyPublicKey: signedPreKey.keyPair.publicKey,
      createdAtMs: 1,
      expiresAtMs: 20_000,
    });
    const bundle = verifyPreKeyBundle({
      bundleBytes: signed.bundleBytes,
      deviceSignature: signed.deviceSignature,
      certificateBytes: bob.device.certificateBytes,
      certificateRootSignature: bob.device.rootSignature,
      roster: bob.roster,
      nowMs: NOW,
    });
    const initiated = initiateX3dh({
      initiatorKeys: alice.keys,
      initiatorDevice: alice.device,
      initiatorRoster: alice.roster,
      responderBundle: bundle,
      responderRoster: bob.roster,
      nowMs: NOW,
      ephemeralKey: keyAgreementKeyPairFromPrivate(fixtureBytes(32)),
    });
    expect(initiated.handshake.signedPreKeyId).toBe(signedPreKey.id);
    expect(initiated.usedOneTimePreKey).toBe(false);
    const responded = respondX3dh({
      responderKeys: bob.keys,
      responderBundle: bundle,
      responderRoster: bob.roster,
      initiatorRoster: alice.roster,
      signedPreKey,
      handshake: initiated.handshake,
      nowMs: NOW,
    });
    expect(responded.secrets).toEqual(initiated.secrets);
  });

  it('rejects a handshake whose transcript was tampered with after signing', () => {
    const fixture = establishedFixture(7);
    const respond =
      (handshakeOverrides: Record<string, unknown>): (() => unknown) =>
      () =>
        respondX3dh({
          responderKeys: fixture.bob.keys,
          responderBundle: fixture.bobPrekeys.bundle,
          responderRoster: fixture.bob.roster,
          initiatorRoster: fixture.alice.roster,
          signedPreKey: fixture.bobPrekeys.signedPreKey,
          oneTimePreKey: fixture.bobPrekeys.oneTimePreKey,
          handshake: { ...fixture.initiated.handshake, ...handshakeOverrides },
          nowMs: NOW,
        });

    expect(respond({ ephemeralPublicKey: fixtureBytes(99) })).toThrow(AuthenticationError);
    expect(respond({ initiatorRosterDigest: fixtureBytes(99) })).toThrow(AuthenticationError);
    expect(respond({ initiator: fixture.bobPrekeys.bundle.device })).toThrow(AuthenticationError);
    expect(respond({ signedPreKeyId: 72 })).toThrow(AuthenticationError);
  });

  it('rejects a one-time prekey that is absent, mismatched, or already consumed', () => {
    const fixture = establishedFixture(7);
    expect(() =>
      respondX3dh({
        responderKeys: fixture.bob.keys,
        responderBundle: fixture.bobPrekeys.bundle,
        responderRoster: fixture.bob.roster,
        initiatorRoster: fixture.alice.roster,
        signedPreKey: fixture.bobPrekeys.signedPreKey,
        handshake: fixture.initiated.handshake,
        nowMs: NOW,
      }),
    ).toThrow(PreKeyError);
  });
});
