import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Build identity shown in the footer and on `window.__PATCHES_WEB__` — `<package version>+<short sha>`. */
function buildVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  let sha = process.env['CF_PAGES_COMMIT_SHA'] ?? process.env['GITHUB_SHA'] ?? '';
  if (sha === '') {
    try {
      sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch {
      // not a git checkout (e.g. packed build) — version alone is still meaningful
      sha = '';
    }
  }
  return sha === '' ? pkg.version : `${pkg.version}+${sha.trim().slice(0, 7)}`;
}

// Dev-only proxy so the browser can talk to the live Patches node without CORS
// being configured for a web origin yet (WEB_ORIGINS server env, not set for
// this client). `VITE_PATCHES_API_BASE` overrides the base URL the app itself
// requests against (defaults to `/api`, the proxied path) — see `src/api/client.ts`.
const PATCHES_UPSTREAM = process.env['PATCHES_DEV_UPSTREAM'] ?? 'https://patches-social.fly.dev';

export default defineConfig(() => {
  // Deploy-safety note (postmortem 2026-08-24): production builds MUST set
  // VITE_PATCHES_API_BASE — the deploy tasks and CI do. A base-less production bundle
  // would post to same-origin /api on static hosting and ship bricked (405s). The
  // runtime renders a loud misconfiguration screen for that case rather than failing
  // every local build here.
  return {
    define: {
      __PATCHES_WEB_VERSION__: JSON.stringify(buildVersion()),
      __PATCHES_WEB_BUILT_AT__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
      react(),
      // B-156: service worker via vite-plugin-pwa. `injectManifest` (not
      // `generateSW`) because the B-153 navigation policy — network-first with a
      // cached-shell fallback on network failure AND `!response.ok` — cannot be
      // expressed with stock Workbox runtime strategies; `src/pwa/sw.ts` owns it.
      // `injectRegister: false` keeps registration in `src/pwa/serviceWorkerRegistration.ts`
      // (update detection + one-shot `controllerchange` reload, B-153). `manifest: false`
      // keeps `public/manifest.webmanifest` the single source of truth. Dev serves no
      // worker at all (default `devOptions.enabled: false`).
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src/pwa',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: false,
        manifest: false,
        injectManifest: {
          // Precache everything the old hand-rolled worker precached (shell, icons,
          // web manifest) plus hashed assets; workbox-build additionally ignores the
          // emitted sw.js itself.
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
          // Default 2 MiB would silently skip a chunky bundle; hashed assets are
          // immutable so caching them is cheap and safe.
          maximumFileSizeToCacheInBytes: 5_000_000,
        },
      }),
      // B-168: bundle report, opt-in only (`ANALYZE=1 pnpm --filter @patches/web build`,
      // or `pnpm --filter @patches/web run bundle:analyze`) — never runs during a plain
      // `build`/`web:deploy`, so it can't slow or change the production artifact. See
      // `scripts/check-bundle-budget.mjs` for the CI-enforced size gate and
      // `docs/operations/web.md` for how to read the report and raise a budget.
      ...(process.env['ANALYZE'] === '1'
        ? [
            visualizer({
              // rollup-plugin-visualizer resolves `filename` from the project root, not
              // from `build.outDir` — spell out `dist-analyze/` explicitly.
              filename: 'dist-analyze/bundle-report.html',
              template: 'treemap',
              gzipSize: true,
              brotliSize: false,
            }),
          ]
        : []),
    ],
    server: {
      proxy: {
        '/api': {
          target: PATCHES_UPSTREAM,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      // ANALYZE builds land in a separate directory (not `dist`) so the report and its
      // rebuilt chunks can never end up in the artifact `wrangler pages deploy` publishes.
      outDir: process.env['ANALYZE'] === '1' ? 'dist-analyze' : 'dist',
      sourcemap: true,
    },
  };
});
