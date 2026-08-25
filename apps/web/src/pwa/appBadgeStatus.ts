import { useSyncExternalStore } from 'react';

export type AppBadgeOperation = 'idle' | 'applied' | 'cleared' | 'failed';

export interface AppBadgeStatus {
  readonly capability: 'available' | 'unsupported';
  readonly operation: AppBadgeOperation;
}

let operation: AppBadgeOperation = 'idle';
const listeners = new Set<() => void>();

function hasAppBadgeCapability(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.setAppBadge === 'function' &&
    typeof navigator.clearAppBadge === 'function'
  );
}

let snapshot: AppBadgeStatus = {
  capability: hasAppBadgeCapability() ? 'available' : 'unsupported',
  operation,
};

export function getAppBadgeStatus(): AppBadgeStatus {
  const capability = hasAppBadgeCapability() ? 'available' : 'unsupported';
  if (snapshot.capability !== capability || snapshot.operation !== operation) {
    snapshot = { capability, operation };
  }
  return snapshot;
}

export function reportAppBadgeOperation(nextOperation: AppBadgeOperation): void {
  if (operation === nextOperation) return;
  operation = nextOperation;
  snapshot = {
    capability: hasAppBadgeCapability() ? 'available' : 'unsupported',
    operation,
  };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppBadgeStatus(): AppBadgeStatus {
  return useSyncExternalStore(subscribe, getAppBadgeStatus, getAppBadgeStatus);
}
