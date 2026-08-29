import { useSyncExternalStore } from 'react';

import { listAccounts, subscribeAccounts, type SavedAccountSummary } from '../api/accounts.js';

/**
 * The locally saved accounts for the current node (secret-free summaries), re-rendering on
 * any change. Used by the account menu's switch/remove affordance (#345). The active
 * session is not in this list — see `useSession` for that.
 */
export function useAccounts(): SavedAccountSummary[] {
  return useSyncExternalStore(subscribeAccounts, listAccounts, listAccounts);
}
