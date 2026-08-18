/** DI token for the active `EmailProvider` (`docs/research/infra-and-security-libs.md` §3). */
export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Adapter over whatever actually sends the email. `console` (dev, no network), `smtp`
 * (Mailpit locally), and `resend` (production) are selected by `EMAIL_PROVIDER` — see
 * `email.module.ts`.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
