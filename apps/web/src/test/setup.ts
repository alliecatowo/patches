import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// `globals: false` (repo convention, see apps/tui/vitest.config.ts) means
// Testing Library's automatic afterEach-based cleanup never registers itself
// — without this, DOM from one test's render() leaks into the next test's
// `screen` queries.
afterEach(() => {
  cleanup();
});
