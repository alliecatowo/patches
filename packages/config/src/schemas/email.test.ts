import { describe, expect, it } from 'vitest';
import { emailEnvSchema } from './email.js';

describe('emailEnvSchema', () => {
  it('accepts console provider with no SMTP/Resend fields', () => {
    const result = emailEnvSchema.safeParse({ EMAIL_PROVIDER: 'console', EMAIL_FROM: 'a@b.com' });
    expect(result.success).toBe(true);
  });

  it('requires SMTP_HOST and SMTP_PORT when provider is smtp', () => {
    const result = emailEnvSchema.safeParse({ EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'a@b.com' });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    const paths = result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('SMTP_HOST');
    expect(paths).toContain('SMTP_PORT');
  });

  it('passes with SMTP_HOST and SMTP_PORT set for smtp provider', () => {
    const result = emailEnvSchema.safeParse({
      EMAIL_PROVIDER: 'smtp',
      EMAIL_FROM: 'a@b.com',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
    });
    expect(result.success).toBe(true);
  });

  it('requires RESEND_API_KEY when provider is resend', () => {
    const result = emailEnvSchema.safeParse({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'a@b.com' });
    expect(result.success).toBe(false);
  });
});
