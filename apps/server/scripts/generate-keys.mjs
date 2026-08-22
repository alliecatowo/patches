#!/usr/bin/env node
/**
 * Generates the Ed25519 signing keypair used for access-token JWTs (ADR 0010) plus the
 * independent auth-code delivery key (ADR 0026), then prints ready-to-paste `.env` lines.
 * Run with `pnpm keys:generate`.
 *
 * Keys are printed base64-encoded because PEM is multi-line and `.env` files, Fly secrets and
 * CI secret stores each mangle multi-line values differently — see
 * `packages/config/src/schemas/auth.ts`.
 *
 * Nothing is written to disk: the private key is only ever on stdout, so it lands wherever the
 * operator puts it and nowhere else.
 */
import { randomBytes } from 'node:crypto';

import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

// `extractable: true` is required to export the private key afterwards (jose defaults to false).
const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
  crv: 'Ed25519',
  extractable: true,
});

const toEnv = (pem) => Buffer.from(pem, 'utf8').toString('base64');
const authCodeDeliveryKeyId = 'dev-1';
const authCodeDeliveryKeys = JSON.stringify({
  [authCodeDeliveryKeyId]: randomBytes(32).toString('base64'),
});

process.stdout.write(
  [
    '# Ed25519 signing keypair for Patches access tokens (ADR 0010).',
    '# Paste into .env (development) or set as secrets (production). Never commit the private key.',
    `JWT_PRIVATE_KEY=${toEnv(await exportPKCS8(privateKey))}`,
    `JWT_PUBLIC_KEY=${toEnv(await exportSPKI(publicKey))}`,
    '',
    '# Dedicated local auth-code outbox envelope key (ADR 0026); share it with server + worker.',
    `AUTH_CODE_DELIVERY_ACTIVE_KEY_ID=${authCodeDeliveryKeyId}`,
    `AUTH_CODE_DELIVERY_KEYS=${authCodeDeliveryKeys}`,
    '',
  ].join('\n'),
);
