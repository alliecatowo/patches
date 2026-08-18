import { z } from 'zod';

export const emailEnvShape = {
  EMAIL_PROVIDER: z.enum(['console', 'smtp', 'resend']).default('console'),
  EMAIL_FROM: z.string().min(1),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  RESEND_API_KEY: z.string().optional(),
};

const emailEnvObjectSchema = z.object(emailEnvShape);

/**
 * `EMAIL_FROM` is always required (every provider needs a From address); the fields the
 * chosen provider actually needs are enforced by provider, so a `console`-only local setup
 * never has to fill in SMTP or Resend settings it doesn't use.
 */
export const emailEnvSchema = emailEnvObjectSchema.superRefine((value, ctx) => {
  if (value.EMAIL_PROVIDER === 'smtp') {
    if (!value.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_PROVIDER=smtp',
      });
    }
    if (!value.SMTP_PORT) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_PORT'],
        message: 'SMTP_PORT is required when EMAIL_PROVIDER=smtp',
      });
    }
  }
  if (value.EMAIL_PROVIDER === 'resend' && !value.RESEND_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['RESEND_API_KEY'],
      message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
    });
  }
});

export type EmailEnv = z.infer<typeof emailEnvObjectSchema>;
