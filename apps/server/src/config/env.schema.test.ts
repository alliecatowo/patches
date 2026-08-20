import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigError } from '@patches/config';
import { afterEach, describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

/**
 * Minimal valid keys for the production checks below. Real values come from
 * `pnpm keys:generate`; these are only ever parsed for their PEM label, never used to sign.
 */
const JWT_KEYS = {
  JWT_PRIVATE_KEY: Buffer.from(
    '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIA==\n-----END PRIVATE KEY-----\n',
  ).toString('base64'),
  JWT_PUBLIC_KEY: Buffer.from(
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA\n-----END PUBLIC KEY-----\n',
  ).toString('base64'),
};

describe('validateEnv', () => {
  it('applies development defaults when nothing is set', () => {
    const env = validateEnv({});

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'log',
      GRPC_HOST: '127.0.0.1',
      GRPC_PORT: 50_051,
      INSTANCE_NAME: 'patches-dev',
      PUBLIC_ORIGIN: 'http://localhost:3000',
      INVITE_ONLY: true,
      GRPC_REFLECTION: false,
    });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('coerces GRPC_PORT from its string environment form', () => {
    expect(validateEnv({ GRPC_PORT: '50052' }).GRPC_PORT).toBe(50_052);
  });

  it('parses GRPC_REFLECTION as a boolean-ish env value (B-006, dev-only default off)', () => {
    expect(validateEnv({ GRPC_REFLECTION: 'true' }).GRPC_REFLECTION).toBe(true);
    expect(validateEnv({ GRPC_REFLECTION: '1' }).GRPC_REFLECTION).toBe(true);
    expect(validateEnv({}).GRPC_REFLECTION).toBe(false);
  });

  it('refuses to boot on an out-of-range port', () => {
    expect(() => validateEnv({ GRPC_PORT: '70000' })).toThrow(ConfigError);
  });

  it('refuses to boot on a non-numeric port', () => {
    expect(() => validateEnv({ GRPC_PORT: 'not-a-port' })).toThrow(ConfigError);
  });

  it('refuses to boot on an unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(ConfigError);
  });

  it('refuses to boot on a malformed PUBLIC_ORIGIN', () => {
    expect(() => validateEnv({ PUBLIC_ORIGIN: 'localhost:3000' })).toThrow(ConfigError);
  });

  it('refuses to boot on a PUBLIC_ORIGIN with a non-http(s) scheme', () => {
    expect(() => validateEnv({ PUBLIC_ORIGIN: 'ftp://patches.example' })).toThrow(ConfigError);
  });

  it('accepts an explicit https PUBLIC_ORIGIN', () => {
    expect(validateEnv({ PUBLIC_ORIGIN: 'https://patches.example' }).PUBLIC_ORIGIN).toBe(
      'https://patches.example',
    );
  });

  it('leaves DATABASE_URL optional outside production', () => {
    expect(validateEnv({ NODE_ENV: 'development' }).DATABASE_URL).toBeUndefined();
    expect(validateEnv({ NODE_ENV: 'test' }).DATABASE_URL).toBeUndefined();
  });

  it('requires DATABASE_URL in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(ConfigError);
  });

  it('accepts a valid DATABASE_URL in production', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://patches:patches@127.0.0.1:5432/patches',
      ...JWT_KEYS,
    });
    expect(env.DATABASE_URL).toBe('postgres://patches:patches@127.0.0.1:5432/patches');
  });

  it('requires the JWT signing keys in production', () => {
    try {
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://patches:patches@127.0.0.1:5432/patches',
      });
      expect.unreachable('expected validateEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const paths = (error as ConfigError).issues.map((issue) => issue.path);
      expect(paths).toContain('JWT_PRIVATE_KEY');
      expect(paths).toContain('JWT_PUBLIC_KEY');
    }
  });

  it('rejects a JWT key that is not base64-encoded PEM', () => {
    expect(() => validateEnv({ JWT_PRIVATE_KEY: 'not base64 pem' })).toThrow(ConfigError);
    // Right shape, wrong PEM label: a public key pasted into the private key variable.
    expect(() => validateEnv({ JWT_PRIVATE_KEY: JWT_KEYS.JWT_PUBLIC_KEY })).toThrow(ConfigError);
  });

  it('defaults the auth knobs to their documented values', () => {
    const env = validateEnv({});
    expect(env).toMatchObject({
      ACCESS_TOKEN_TTL: 900,
      REFRESH_TOKEN_TTL: 2_592_000,
      NODE_DOMAIN: 'localhost',
      ARGON2_MEMORY_KIB: 19_456,
      ARGON2_TIME_COST: 2,
      ARGON2_PARALLELISM: 1,
    });
  });

  it('defaults Amendment B social capabilities and parses operator overrides', () => {
    expect(validateEnv({})).toMatchObject({
      DM_ENABLED: true,
      DM_RETENTION_DAYS: 0,
      MAX_POST_CHARS: 5000,
      CAN_CREATE_COMMUNITY: false,
      LIKE_GLYPH_ALLOW_LIST: [],
    });
    expect(
      validateEnv({
        DM_ENABLED: 'false',
        DM_RETENTION_DAYS: '30',
        MAX_POST_CHARS: '7500',
        CAN_CREATE_COMMUNITY: 'true',
        LIKE_GLYPH_ALLOW_LIST: '♥, ★',
      }),
    ).toMatchObject({
      DM_ENABLED: false,
      DM_RETENTION_DAYS: 30,
      MAX_POST_CHARS: 7500,
      CAN_CREATE_COMMUNITY: true,
      LIKE_GLYPH_ALLOW_LIST: ['♥', '★'],
    });
  });

  it('rejects a post limit above the node ceiling', () => {
    expect(() => validateEnv({ MAX_POST_CHARS: '10001' })).toThrow(ConfigError);
  });

  it('defaults REQUIRE_PRIVACY_ACK to false and parses an operator override (P14 follow-up)', () => {
    expect(validateEnv({})).toMatchObject({ REQUIRE_PRIVACY_ACK: false });
    expect(validateEnv({ REQUIRE_PRIVACY_ACK: 'true' })).toMatchObject({
      REQUIRE_PRIVACY_ACK: true,
    });
  });

  it('defaults PUBLIC_READ to true and parses an operator override to close reads', () => {
    expect(validateEnv({})).toMatchObject({ PUBLIC_READ: true });
    expect(validateEnv({ PUBLIC_READ: 'false' })).toMatchObject({ PUBLIC_READ: false });
    expect(validateEnv({ PUBLIC_READ: '0' })).toMatchObject({ PUBLIC_READ: false });
  });

  it('defaults PASSWORD_AUTH to optional and accepts off/required overrides (P15-002)', () => {
    expect(validateEnv({})).toMatchObject({ PASSWORD_AUTH: 'optional' });
    expect(validateEnv({ PASSWORD_AUTH: 'off' })).toMatchObject({ PASSWORD_AUTH: 'off' });
    expect(validateEnv({ PASSWORD_AUTH: 'required' })).toMatchObject({
      PASSWORD_AUTH: 'required',
    });
    expect(() => validateEnv({ PASSWORD_AUTH: 'nope' })).toThrow(ConfigError);
  });

  it('rejects a malformed DATABASE_URL even when optional', () => {
    expect(() => validateEnv({ DATABASE_URL: 'not-a-url' })).toThrow(ConfigError);
  });

  it('names every offending variable in the failure message', () => {
    try {
      validateEnv({ NODE_ENV: 'staging', GRPC_PORT: '0' });
      expect.unreachable('expected validateEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const paths = (error as ConfigError).issues.map((issue) => issue.path);
      expect(paths).toContain('NODE_ENV');
      expect(paths).toContain('GRPC_PORT');
    }
  });

  it('ignores unrelated environment variables', () => {
    expect(() => validateEnv({ PATH: '/usr/bin', HOME: '/home/somebody' })).not.toThrow();
  });

  describe('operator transparency (A-052, spec §197.1, §197.6)', () => {
    let tempDir: string | undefined;

    afterEach(() => {
      if (tempDir !== undefined) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined;
      }
    });

    it('defaults the privacy notice summary, terms URL, appeal instructions, and operator identity to empty', () => {
      expect(validateEnv({})).toMatchObject({
        PRIVACY_NOTICE_SUMMARY: '',
        TERMS_URL: '',
        APPEAL_INSTRUCTIONS: '',
        OPERATOR_CONTACT: '',
      });
    });

    it('publishes an operator-supplied summary, terms URL, appeal instructions, and operator identity', () => {
      const env = validateEnv({
        PRIVACY_NOTICE_SUMMARY: 'We store your posts and DMs.',
        TERMS_URL: 'https://patches.example/terms',
        APPEAL_INSTRUCTIONS: 'Email appeals@patches.example.',
        OPERATOR_CONTACT: 'Operated by Jane Doe.',
      });
      expect(env.PRIVACY_NOTICE_SUMMARY).toBe('We store your posts and DMs.');
      expect(env.TERMS_URL).toBe('https://patches.example/terms');
      expect(env.APPEAL_INSTRUCTIONS).toBe('Email appeals@patches.example.');
      expect(env.OPERATOR_CONTACT).toBe('Operated by Jane Doe.');
    });

    it('rejects a non-URL TERMS_URL', () => {
      expect(() => validateEnv({ TERMS_URL: 'not a url' })).toThrow(ConfigError);
    });

    it('reads PRIVACY_NOTICE_FILE at validation time and uses it as the summary', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'patches-privacy-notice-'));
      const filePath = join(tempDir, 'privacy-notice.txt');
      writeFileSync(filePath, '  We store your posts and DMs; DMs are readable by us.  \n');

      const env = validateEnv({ PRIVACY_NOTICE_FILE: filePath });
      expect(env.PRIVACY_NOTICE_SUMMARY).toBe(
        'We store your posts and DMs; DMs are readable by us.',
      );
    });

    it('prefers PRIVACY_NOTICE_FILE over PRIVACY_NOTICE_SUMMARY when both are set', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'patches-privacy-notice-'));
      const filePath = join(tempDir, 'privacy-notice.txt');
      writeFileSync(filePath, 'from the file');

      const env = validateEnv({
        PRIVACY_NOTICE_FILE: filePath,
        PRIVACY_NOTICE_SUMMARY: 'from the env var',
      });
      expect(env.PRIVACY_NOTICE_SUMMARY).toBe('from the file');
    });

    it('refuses to boot when PRIVACY_NOTICE_FILE cannot be read', () => {
      try {
        validateEnv({ PRIVACY_NOTICE_FILE: '/nonexistent/patches-privacy-notice.txt' });
        expect.unreachable('expected validateEnv to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const paths = (error as ConfigError).issues.map((issue) => issue.path);
        expect(paths).toContain('PRIVACY_NOTICE_FILE');
      }
    });
  });

  describe('OIDC_PROVIDERS (P15-006)', () => {
    const validProvider = {
      id: 'gitlab',
      displayName: 'GitLab',
      deviceAuthorizationUrl: 'https://gitlab.example/oauth/authorize_device',
      tokenUrl: 'https://gitlab.example/oauth/token',
      userinfoUrl: 'https://gitlab.example/oauth/userinfo',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    };

    it('defaults to an empty array — no OIDC provider configured', () => {
      expect(validateEnv({}).OIDC_PROVIDERS).toEqual([]);
    });

    it('accepts a well-formed provider array', () => {
      const env = validateEnv({ OIDC_PROVIDERS: JSON.stringify([validProvider]) });
      expect(env.OIDC_PROVIDERS).toEqual([validProvider]);
    });

    it('refuses to boot on invalid JSON', () => {
      expect(() => validateEnv({ OIDC_PROVIDERS: '{not json' })).toThrow(ConfigError);
    });

    it('refuses a provider missing a required field', () => {
      const { clientSecret: _clientSecret, ...withoutSecret } = validProvider;
      expect(() => validateEnv({ OIDC_PROVIDERS: JSON.stringify([withoutSecret]) })).toThrow(
        ConfigError,
      );
    });

    it('refuses a non-URL device authorization/token/userinfo URL (never trusts an unvalidated third-party endpoint)', () => {
      expect(() =>
        validateEnv({
          OIDC_PROVIDERS: JSON.stringify([
            { ...validProvider, deviceAuthorizationUrl: 'not a url' },
          ]),
        }),
      ).toThrow(ConfigError);
      expect(() =>
        validateEnv({
          OIDC_PROVIDERS: JSON.stringify([{ ...validProvider, tokenUrl: 'not a url' }]),
        }),
      ).toThrow(ConfigError);
      expect(() =>
        validateEnv({
          OIDC_PROVIDERS: JSON.stringify([{ ...validProvider, userinfoUrl: 'not a url' }]),
        }),
      ).toThrow(ConfigError);
    });

    it('refuses an id with characters outside lowercase ASCII/digits/underscore/hyphen', () => {
      expect(() =>
        validateEnv({
          OIDC_PROVIDERS: JSON.stringify([{ ...validProvider, id: 'GitLab!' }]),
        }),
      ).toThrow(ConfigError);
    });

    it('refuses two providers with the same id', () => {
      expect(() =>
        validateEnv({
          OIDC_PROVIDERS: JSON.stringify([
            validProvider,
            { ...validProvider, displayName: 'GitLab (mirror)' },
          ]),
        }),
      ).toThrow(ConfigError);
    });

    it('accepts multiple providers with distinct ids', () => {
      const codeberg = {
        ...validProvider,
        id: 'codeberg',
        displayName: 'Codeberg',
        deviceAuthorizationUrl: 'https://codeberg.example/login/oauth/device',
      };
      const env = validateEnv({
        OIDC_PROVIDERS: JSON.stringify([validProvider, codeberg]),
      });
      expect(env.OIDC_PROVIDERS.map((p) => p.id)).toEqual(['gitlab', 'codeberg']);
    });
  });
});
