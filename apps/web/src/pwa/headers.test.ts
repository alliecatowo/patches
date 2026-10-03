import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/** Header block for the `/*` rule of Cloudflare Pages' `_headers` file, as a map. */
function globalHeaders(): Map<string, string> {
  const lines = read('../../public/_headers').split('\n');
  const start = lines.findIndex((line) => line.trim() === '/*');
  const headers = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith(' ')) break;
    const [name, ...rest] = line.trim().split(':');
    headers.set(name!.toLowerCase(), rest.join(':').trim());
  }
  return headers;
}

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((tokens) => tokens[0] !== '')
      .map(([name, ...values]) => [name!, values]),
  );
}

describe('_headers security policy', () => {
  const headers = globalHeaders();
  const csp = directives(headers.get('content-security-policy') ?? '');

  it('sets the baseline security headers', () => {
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.has('permissions-policy')).toBe(true);
  });

  it('locks down framing, base, objects and scripts', () => {
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'none'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('script-src')).toEqual(["'self'"]);
    expect(csp.get('default-src')).toEqual(["'self'"]);
  });

  it('still allows what the app needs: the API origin, R2 uploads/downloads, blob previews', () => {
    const connect = csp.get('connect-src') ?? [];
    expect(connect).toContain("'self'");
    expect(connect).toContain('https://*.fly.dev'); // API (patches-social.fly.dev) + previews
    expect(connect).toContain('https://*.r2.cloudflarestorage.com'); // presigned PUT
    const img = csp.get('img-src') ?? [];
    expect(img).toEqual(expect.arrayContaining(["'self'", 'blob:', 'data:', 'https:']));
    expect(csp.get('worker-src')).toEqual(["'self'"]); // service worker
    expect(csp.get('manifest-src')).toEqual(["'self'"]);
  });

  it('never allows unsafe-eval or inline scripts', () => {
    const scriptish = [csp.get('script-src'), csp.get('default-src')].flat().join(' ');
    expect(scriptish).not.toContain('unsafe-eval');
    expect(scriptish).not.toContain('unsafe-inline');
  });
});

describe('index.html', () => {
  it("has no inline script (script-src is 'self' only, no hashes)", () => {
    const html = read('../../index.html');
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(
      ([, attrs]) => !/\bsrc=/.test(attrs ?? ''),
    );
    expect(inline).toHaveLength(0);
    expect(html).not.toMatch(/\son[a-z]+=/i); // no inline event handlers
  });

  it('loads the theme bootstrap from a same-origin file that exists', () => {
    expect(read('../../index.html')).toContain('src="/theme-init.js"');
    expect(read('../../public/theme-init.js')).toContain('patches.web.theme.v1');
  });
});
