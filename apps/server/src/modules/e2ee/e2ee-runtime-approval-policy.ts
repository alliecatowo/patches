import { assertFrankingProfileApproved, E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';

/**
 * Runtime approval boundary for the E2EE franking profile.
 *
 * The domain-level approval list remains the source of truth for production. ADR 0027 permits
 * one tightly-scoped exception solely for an explicitly configured owner-authorized disposable
 * node. Runtime NODE_ENV is deliberately not the trust classification, so the exception is
 * represented by this injected policy instead of a mutable global or a direct `process.env`
 * check in the fanout path.
 */
export class E2eeRuntimeApprovalPolicy {
  readonly #unreviewedDevelopmentMode: boolean;

  readonly #approvedProfiles: ReadonlySet<string>;

  constructor(unreviewedDevelopmentMode: boolean, approvedProfiles: readonly string[] = []) {
    this.#approvedProfiles = new Set(approvedProfiles);
    this.#unreviewedDevelopmentMode = unreviewedDevelopmentMode;
  }

  get isUnreviewedDevelopmentMode(): boolean {
    return this.#unreviewedDevelopmentMode;
  }

  isProfileApproved(profile: string): boolean {
    return this.#approvedProfiles.has(profile);
  }

  assertProfileApproved(profile: string): void {
    if (this.isProfileApproved(profile)) return;
    if (this.#unreviewedDevelopmentMode && profile === E2EE_FRANKING_PROFILE_V1) return;
    assertFrankingProfileApproved(profile);
  }
}

/** Nest injection token: interfaces do not survive TypeScript's runtime emit. */
export const E2EE_RUNTIME_APPROVAL_POLICY = Symbol('E2EE_RUNTIME_APPROVAL_POLICY');
