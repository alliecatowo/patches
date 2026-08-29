# SSH signature verification with `node:crypto` — Reference

Verified 2026-08-18 against the IETF RFCs at rfc-editor.org (RFC 4251, RFC 4253, RFC 5656,
RFC 8332, RFC 8410, RFC 8709) and the Node.js official docs at nodejs.org/api/crypto.html
(current stable, Node 22/24). Implementation this note documents (paths verified 2026-08-27): the OpenSSH signature/key-blob
parsing and verification lives in `apps/server/src/modules/auth/ssh/{openssh.ts,der.ts}`; the
generic SSH wire-format reader and challenge-blob encoding moved to
`packages/domain/src/ssh/{wire.ts,challenge-blob.ts}` (`SshReader`/`SshWireError` and the
challenge-blob helpers are shared with other consumers, not server-only).

## 1. Decision

Patches verifies OpenSSH-format public-key signatures (produced by the user's own `ssh-agent`
signing a server-chosen challenge, spec §166) with **no third-party SSH library** — pure
`node:crypto`, plus about a hundred lines of hand-rolled SSH wire-format parsing.

Rejected: pulling in an `ssh2`-family package. Those packages exist to speak the SSH
_transport and connection_ protocols (channels, PTYs, exec, sftp); the actual surface Patches
needs — parse an OpenSSH public key blob, parse a signature blob, verify a signature against
arbitrary data — is a small, stable, well-specified corner of RFC 4251/4253/5656/8332/8709
that `node:crypto`'s primitives already cover once the wire framing is decoded. A general SSH
client/server library is a much larger dependency and attack surface for a feature that never
opens an actual SSH connection (spec §166: private keys and the SSH transport itself never
touch the server).

## 2. Wire format facts (RFC-verified)

| Fact                                                                                                                                                                                                                                                                                                                              | Source                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| SSH `string` = big-endian `uint32` length prefix + that many bytes; `mpint` is the same framing holding a two's-complement big-endian integer (a leading `0x00` byte is required if the value's high bit would otherwise read as a sign bit on a positive number)                                                                 | RFC 4251 §5                           |
| A public key blob is `string format-identifier; byte[n] key-data`; a signature blob is `string format-identifier; byte[n] signature-data`, each field's exact encoding fixed per algorithm                                                                                                                                        | RFC 4253 §6.6 "Public Key Algorithms" |
| `ssh-ed25519` key blob = `string "ssh-ed25519"; string key` (`key` is the raw 32-octet public key, RFC 8032 §5.1.5 — no ASN.1); signature blob = `string "ssh-ed25519"; string signature` (raw 64-octet signature, RFC 8032 §5.1.6 — no ASN.1)                                                                                    | RFC 8709 §4, §6                       |
| `ssh-rsa` key blob = `string "ssh-rsa"; mpint e; mpint n` (**exponent before modulus** — the reverse of PKCS#1's `RSAPublicKey ::= SEQUENCE { modulus, publicExponent }`)                                                                                                                                                         | RFC 4253 §6.6                         |
| `rsa-sha2-256`/`rsa-sha2-512` reuse the plain `ssh-rsa` key format and sign with SHA-256/SHA-512 respectively instead of SHA-1; §5.2 recommends (not mandates) disabling plain SHA-1 `ssh-rsa` once the SHA-2 variants are widely supported                                                                                       | RFC 8332 §3, §5.2                     |
| `ecdsa-sha2-nistp256/384/521` key blob = `string curve-identifier; string Q`, `Q` an EC point (SEC1 §2.3.3, uncompressed form starts with `0x04`); **signature blob is `mpint r; mpint s` — not ASN.1 DER**                                                                                                                       | RFC 5656 §3.1, §3.1.2                 |
| An Ed25519 `SubjectPublicKeyInfo` has a fixed structure (`SEQUENCE { AlgorithmIdentifier { id-Ed25519 }, BIT STRING subjectPublicKey }`) with the `AlgorithmIdentifier` parameters field **absent** — so a 12-byte constant DER prefix followed by the raw 32-byte key is the complete, correct SPKI encoding, nothing to compute | RFC 8410 §3, §4                       |

The RFC 5656 fact above is the one the implementation most depends on: because SSH's own
ECDSA signature encoding is raw `r`/`s` and not DER, `verifySshSignature` has to convert
before handing the signature to `node:crypto` (§3 below).

## 3. `node:crypto` facts

| Fact                                                                                                                                                                                                                                                             | Source                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `crypto.createPublicKey({ key, format, type })`: `type` is `'pkcs1' \| 'spki'` for a public key; `format: 'der'` expects binary input (`Buffer`/`TypedArray`/etc.), not PEM text                                                                                 | nodejs.org/api/crypto.html, `crypto.createPublicKey()`           |
| `crypto.verify(algorithm, data, key, signature)`: _"If `algorithm` is `null` or `undefined`, then the algorithm is dependent upon the key type... `algorithm` is required to be `null` or `undefined` for Ed25519..."_ — normative, not inferred from an example | nodejs.org/api/crypto.html, `crypto.verify()`                    |
| For DSA/ECDSA, the `dsaEncoding` option (default `'der'`) controls whether `sign`/`verify` expect a DER `SEQUENCE(INTEGER r, INTEGER s)` or raw IEEE-P1363 `r \|\| s`; default is DER                                                                            | nodejs.org/api/crypto.html, `sign.sign()`'s `dsaEncoding` option |

`rsa-sha2-256`/`rsa-sha2-512` map directly onto `crypto.verify('sha256'/'sha512', data, rsaKey,
signature)` against a `type: 'pkcs1'` key built from the reordered `(n, e)` DER sequence.
`ssh-ed25519` maps onto `crypto.verify(null, data, ed25519Key, signature)` against a `type:
'spki'` key built from the RFC 8410 prefix + raw point. ECDSA maps onto `crypto.verify('sha256'
| 'sha384' | 'sha512', data, ecKey, derSignature)` — `derSignature` built by hand from the raw
`mpint r; mpint s` per RFC 5656, since `node:crypto`'s DER default matches what the code
constructs rather than what SSH sent on the wire.

**A simplification worth revisiting, not yet made:** `crypto.verify` also accepts
`{ dsaEncoding: 'ieee-p1363' }` on the key object, which would let the raw SSH `r`/`s` pair
(zero-padded to the curve's field width) be handed to `crypto.verify` directly, without the
hand-rolled `ecdsaSignatureToDer` step. This was not verified in enough depth to land as part
of this note (need to confirm exact `ieee-p1363` framing — fixed-width `r || s`, not
length-prefixed) and is left as a documented option for a future cleanup, not a correctness
issue with the current DER-based approach.

## 4. What the current code deliberately does _not_ rely on

- **SHA-1 `ssh-rsa` is rejected outright** (`SIGNATURE_ALGORITHMS` in `openssh.ts` has no
  `ssh-rsa` entry — only `rsa-sha2-256`/`rsa-sha2-512`). RFC 8332 §5.2's disable recommendation
  is treated as a hard requirement here, matching spec §166.
- **RSA moduli under 2048 bits are rejected** (`MIN_RSA_MODULUS_BITS`, checked against the
  `mpint`'s significant-bit count once sign-padding is stripped). Neither RFC 4253 nor RFC 8332
  impose a minimum key size — this is Patches' own policy floor, not a wire-format requirement.
- **The declared key algorithm text is cross-checked against the algorithm named inside the
  base64 blob** (`parseOpenSshPublicKey`) — RFC 4253 does not require these to agree since they
  are independent fields in an OpenSSH key _line_ (a text convention, not itself part of the
  binary wire protocol), so trusting the label without checking the blob would let a client
  mislabel a key.
