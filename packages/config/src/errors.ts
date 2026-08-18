/** A single invalid-configuration finding. Never carries the offending value — only where it was and why. */
export interface ConfigIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Thrown by {@link loadEnv} when environment configuration fails schema validation.
 * Lists every invalid variable in one error (not just the first) so a misconfigured
 * deploy can be fixed in one pass. Deliberately never includes the received value —
 * only the variable name/path and a description of what was expected — so secrets
 * (JWT keys, API keys, password-shaped values) can never leak into logs via this error.
 */
export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const summary = issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n');
    super(`Invalid configuration:\n${summary}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}
