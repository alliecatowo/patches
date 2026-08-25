/**
 * patches-issues-ingest — accepts redacted diagnostics bundles from beta clients and
 * files them as GitHub issues on the product repo. Holds the only GitHub token; clients
 * never hold write credentials.
 *
 * Contract: POST / { description?, appTui?: boolean, bundle: {...} } → 201 { number, url }.
 * Redaction is the CLIENT's job (§194); this worker enforces size + shape + origin only.
 */
const ALLOWED_ORIGIN_SUFFIXES = [
  'patches-web.pages.dev',
  'patches-social.fly.dev',
  'fly.dev', // any patches PR-preview machine (*.pr-<n>.fly.dev) — suffix match
];
const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];
const LABELS = ['beta-reporter'];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '3600',
  };
}

function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_SUFFIXES.some(
    (suffix) => origin === `https://${suffix}` || origin.endsWith(`.${suffix}`),
  );
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

function truncate(value, max) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length <= max
    ? text
    : `${text.slice(0, max)}\n…[truncated ${text.length - max} bytes]`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') ?? '';
    const cors = originAllowed(origin) ? corsHeaders(origin) : {};

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json(405, { error: 'POST only' }, cors);
    }
    if (origin && !originAllowed(origin)) {
      return json(403, { error: 'Origin not allowed' }, cors);
    }

    const raw = await request.arrayBuffer();
    if (raw.byteLength > Number(env.MAX_BODY_BYTES)) {
      return json(413, { error: 'Bundle too large' }, cors);
    }

    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return json(400, { error: 'Invalid JSON' }, cors);
    }

    const { description = '', bundle } = payload;
    if (typeof bundle !== 'object' || bundle === null) {
      return json(400, { error: 'bundle is required' }, cors);
    }
    // Honeypot: bots fill this, humans never see it.
    if (typeof payload.website === 'string' && payload.website.length > 0) {
      return json(201, { ok: true }, cors);
    }

    const reportedAt = new Date().toISOString();
    const title =
      (typeof payload.title === 'string' && payload.title.trim().slice(0, 120)) ||
      `Beta report: ${bundle.app ?? 'unknown'} ${bundle.version ?? ''} on ${bundle.nodeDomain ?? 'unknown node'}`.trim();

    const body = [
      typeof description === 'string' ? truncate(description, 4000) : '',
      '\n---\n',
      `*Filed by the in-product beta reporter at ${reportedAt}. Description is optional and user-written; everything below the line is the automatic diagnostics bundle.*`,
      '\n<details><summary>Diagnostics bundle (redacted client-side)</summary>\n\n```json\n',
      truncate(bundle, 60000),
      '\n```\n</details>',
    ].join('\n');

    let github;
    try {
      github = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.ISSUES_GITHUB_TOKEN}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'patches-issues-ingest',
        },
        body: JSON.stringify({ title, body, labels: LABELS }),
      });
    } catch {
      return json(502, { error: 'GitHub unreachable' }, cors);
    }
    if (!github.ok) {
      const detail = await github.text();
      return json(
        github.status === 401 || github.status === 403 ? 500 : 502,
        {
          error: 'GitHub rejected the issue',
          detail: truncate(detail, 500),
        },
        cors,
      );
    }
    const created = await github.json();
    return json(201, { number: created.number, url: created.html_url }, cors);
  },
};
