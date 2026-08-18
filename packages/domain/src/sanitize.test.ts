import { describe, expect, it } from 'vitest';

import { containsUnsafeBytes, sanitizeText, utf8ByteLength } from './sanitize.js';

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

describe('sanitizeText', () => {
  it('strips CSI sequences (e.g. SGR color codes)', () => {
    expect(sanitizeText(`hello${ESC}[31mworld${ESC}[0m`)).toBe('helloworld');
  });

  it('strips OSC sequences terminated by BEL', () => {
    expect(sanitizeText(`a${ESC}]0;evil title${BEL}b`)).toBe('ab');
  });

  it('strips OSC sequences terminated by ST', () => {
    expect(sanitizeText(`a${ESC}]8;;https://evil.example${ESC}\\b`)).toBe('ab');
  });

  it('strips DCS sequences', () => {
    expect(sanitizeText(`a${ESC}Pq#0;2;0;0;0${ESC}\\b`)).toBe('ab');
  });

  it('strips a lone full-reset escape', () => {
    expect(sanitizeText(`a${ESC}cb`)).toBe('ab');
  });

  it('strips raw C0 control bytes other than tab/newline', () => {
    const raw = 'a' + String.fromCharCode(0x00) + String.fromCharCode(0x07) + 'b';
    expect(sanitizeText(raw)).toBe('ab');
  });

  it('strips DEL and C1 control bytes', () => {
    const raw = 'a' + String.fromCharCode(0x7f) + String.fromCharCode(0x9b) + 'b';
    expect(sanitizeText(raw)).toBe('ab');
  });

  it('strips zero-width and bidi override characters', () => {
    const raw =
      'a' +
      String.fromCodePoint(0x200b) + // ZWSP
      String.fromCodePoint(0x202e) + // RLO
      String.fromCodePoint(0x2066) + // LRI
      String.fromCodePoint(0xfeff) + // BOM
      'b';
    expect(sanitizeText(raw)).toBe('ab');
  });

  it('converts tabs to a single space', () => {
    expect(sanitizeText('a\tb')).toBe('a b');
  });

  it('preserves newlines when multiline is true', () => {
    expect(sanitizeText('a\nb', { multiline: true })).toBe('a\nb');
  });

  it('collapses newlines to spaces when multiline is false (default)', () => {
    expect(sanitizeText('a\nb')).toBe('a b');
  });

  it('normalizes CRLF and lone CR to LF before further processing', () => {
    expect(sanitizeText('a\r\nb\rc', { multiline: true })).toBe('a\nb\nc');
  });

  it('is a no-op on already-clean plain text', () => {
    expect(sanitizeText('hello, world! 123')).toBe('hello, world! 123');
  });

  it('leaves normal unicode (emoji, accents) untouched', () => {
    expect(sanitizeText('héllo 🎉')).toBe('héllo 🎉');
  });
});

describe('containsUnsafeBytes', () => {
  it('is false for a clean URL', () => {
    expect(containsUnsafeBytes('https://example.com/path?q=1')).toBe(false);
  });

  it('is true when a control byte is present', () => {
    expect(containsUnsafeBytes(`https://example.com/${ESC}[31m`)).toBe(true);
  });

  it('is true for a bidi override character', () => {
    expect(containsUnsafeBytes(`https://example.com/${String.fromCodePoint(0x202e)}`)).toBe(true);
  });

  it('does not leak state across repeated calls (global regex lastIndex)', () => {
    expect(containsUnsafeBytes(`bad${ESC}[0m`)).toBe(true);
    expect(containsUnsafeBytes('clean')).toBe(false);
    expect(containsUnsafeBytes('also clean')).toBe(false);
  });
});

describe('utf8ByteLength', () => {
  it('counts ASCII 1:1', () => {
    expect(utf8ByteLength('hello')).toBe(5);
  });

  it('counts multi-byte UTF-8 correctly', () => {
    expect(utf8ByteLength('héllo')).toBe(6);
    expect(utf8ByteLength('🎉')).toBe(4);
  });
});
