import { randomUUID } from 'node:crypto';

/**
 * A random handle-shaped string: lowercase ASCII letters/digits/underscore, well within the
 * 3–30 character limit from the handle rules (`INITIAL_VISION.md` §22). Not guaranteed
 * globally unique, only random-enough to avoid collisions within a test run.
 */
export function randomHandle(prefix = 'user'): string {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${safePrefix}_${suffix}`;
}

/** A random, obviously-fake email address for fixtures. Never resolves to a real inbox. */
export function randomEmail(domain = 'example.test'): string {
  const local = randomUUID().replace(/-/g, '').slice(0, 12);
  return `${local}@${domain}`;
}
