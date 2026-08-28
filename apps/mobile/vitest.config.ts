import { defineProject } from 'vitest/config';

// RN screen components (View/Text/FlatList/...) stay thin and untested here — Expo's own
// docs recommend Jest+jest-expo+React Native Testing Library for that, not Vitest
// (docs/research/expo-react-native.md §4), and mixing test runners in one monorepo needs
// its own decision if that coverage is ever added. Everything this project scopes for
// automated testing is plain TypeScript with no RN import (transport wiring, the
// SecureStore-backed credential store, session-restore logic, formatting helpers), so a
// plain `node` environment is enough — no jsdom/RN shim required.
export default defineProject({
  test: {
    name: 'mobile',
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    // #302: overridable so scripts/bounded.sh can cap worker pools under concurrent agent load.
    maxWorkers: process.env.VITEST_MAX_WORKERS ? Number(process.env.VITEST_MAX_WORKERS) : '50%',
  },
});
