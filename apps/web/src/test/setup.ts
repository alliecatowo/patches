import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library's default 1s `waitFor`/`findBy*` budget flakes on the shared CI runner
// under load (ThreadRoute's upload-settle assertion failed there while passing locally in
// <100ms). A longer ceiling never slows a passing test — it only stops load from
// masquerading as a product failure.
configure({ asyncUtilTimeout: 5000 });

// `globals: false` (repo convention, see apps/tui/vitest.config.ts) means
// Testing Library's automatic afterEach-based cleanup never registers itself
// — without this, DOM from one test's render() leaks into the next test's
// `screen` queries.
afterEach(() => {
  cleanup();
});
