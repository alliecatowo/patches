import { describe, expect, it } from 'vitest';
import { randomEmail, randomHandle } from './random.js';

describe('randomHandle', () => {
  it('is lowercase, ASCII, letters/digits/underscore only, within 3-30 chars', () => {
    const handle = randomHandle();
    expect(handle).toMatch(/^[a-z0-9_]{3,30}$/);
  });

  it('sanitizes an uppercase/invalid prefix', () => {
    const handle = randomHandle('Alice!!');
    expect(handle).toMatch(/^[a-z0-9_]+$/);
    expect(handle.startsWith('alice_')).toBe(true);
  });

  it('generates distinct values across calls', () => {
    expect(randomHandle()).not.toBe(randomHandle());
  });
});

describe('randomEmail', () => {
  it('looks like an email at the given (or default) domain', () => {
    expect(randomEmail()).toMatch(/^[a-z0-9]+@example\.test$/);
    expect(randomEmail('mail.local')).toMatch(/^[a-z0-9]+@mail\.local$/);
  });

  it('generates distinct values across calls', () => {
    expect(randomEmail()).not.toBe(randomEmail());
  });
});
