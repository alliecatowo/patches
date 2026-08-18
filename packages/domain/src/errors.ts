/**
 * Thrown by `parsePageStrict` on a document that fails validation. Transport-agnostic on
 * purpose — `packages/domain` has no gRPC/`AppError` dependency (spec §129: shared domain
 * code never imports server code); `apps/server`'s `PagesService` catches this and re-throws
 * `AppError.validation(error.message)`.
 */
export class PageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageValidationError';
  }
}

export function isPageValidationError(value: unknown): value is PageValidationError {
  return value instanceof PageValidationError;
}
