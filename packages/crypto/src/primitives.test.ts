import { describe, expect, it } from 'vitest';

import { fromHex, toHex } from './codec.js';
import {
  keyAgreement,
  keyAgreementKeyPairFromPrivate,
  sign,
  signingKeyPairFromPrivate,
  verifyStrict,
} from './primitives.js';

describe('official primitive vectors', () => {
  it('matches RFC 7748 section 6.1 X25519 vectors', () => {
    const alice = keyAgreementKeyPairFromPrivate(
      fromHex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a'),
    );
    const bob = keyAgreementKeyPairFromPrivate(
      fromHex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb'),
    );

    expect(toHex(alice.publicKey)).toBe(
      '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
    );
    expect(toHex(bob.publicKey)).toBe(
      'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f',
    );
    expect(toHex(keyAgreement(alice.privateKey, bob.publicKey))).toBe(
      '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742',
    );
    expect(keyAgreement(bob.privateKey, alice.publicKey)).toEqual(
      keyAgreement(alice.privateKey, bob.publicKey),
    );
  });

  it('matches RFC 8032 section 7.1 Ed25519 test vector 1', () => {
    const key = signingKeyPairFromPrivate(
      fromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'),
    );
    const message = new Uint8Array();
    const signature = sign(key.privateKey, message);

    expect(toHex(key.publicKey)).toBe(
      'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
    );
    expect(toHex(signature)).toBe(
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
        '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
    );
    expect(verifyStrict(key.publicKey, message, signature)).toBe(true);
  });

  it('rejects partially parsed hexadecimal input', () => {
    expect(() => fromHex('0g')).toThrow('Hex input is malformed.');
  });
});
