import { Text } from 'ink';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown instead of the subtree when it throws while rendering. */
  message?: string;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Keeps the shell alive when one screen throws during render (for example hostile
 * server-supplied data). Remount with a new `key` to retry.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Deliberately silent: no console output in the render path (it would corrupt the
    // alternate screen); the fallback below tells the user what happened.
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <Text color="red">
          {this.props.message ?? 'This screen could not be displayed. Press Esc to go back.'}
        </Text>
      );
    }
    return this.props.children;
  }
}
