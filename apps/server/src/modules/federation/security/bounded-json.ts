import { MAX_JSON_DEPTH } from '../federation.constants.js';

export class BoundedJsonError extends Error {}

/**
 * `JSON.parse` plus a depth cap (P8-006, §109's "cap JSON depth/size" — size is already
 * bounded by `safeFetch`'s/the inbox body-size cap upstream of this call; this only adds the
 * depth half). A remote peer nesting objects/arrays deeply enough to blow the stack on a
 * naive recursive walk is bounded input size (the byte cap already applied) that this
 * function's own recursion depth never exceeds either, since it can only recurse as deep as
 * `maxDepth`.
 */
export function parseBoundedJson(text: string, maxDepth: number = MAX_JSON_DEPTH): unknown {
  const value: unknown = JSON.parse(text);
  assertDepth(value, maxDepth, 0);
  return value;
}

function assertDepth(value: unknown, maxDepth: number, depth: number): void {
  if (depth > maxDepth) {
    throw new BoundedJsonError(`JSON exceeds the maximum nesting depth of ${String(maxDepth)}.`);
  }
  if (Array.isArray(value)) {
    for (const item of value) assertDepth(item, maxDepth, depth + 1);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertDepth(item, maxDepth, depth + 1);
  }
}
