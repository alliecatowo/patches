import {
  assertFrankingProfileApproved,
  E2EE_APPROVED_FRANKING_PROFILES,
  E2eeContractError,
} from '@patches/domain';

/**
 * Runtime approval boundary for the E2EE franking profile.
 *
 * `packages/domain`'s `E2EE_APPROVED_FRANKING_PROFILES` is the sole production authority on
 * which profiles may ever be approved (ADR 0020 §14.8, ADR 0036 Amendment). This class adds
 * only a narrowing operator: an operator may set `E2EE_APPROVED_FRANKING_PROFILES` (env) to
 * approve a *subset* of the domain list — a kill switch — but `env.schema.ts`'s boot-time check
 * rejects any env value naming a profile the domain constant doesn't already approve, so an env
 * value can never widen the set (#253).
 */
export class E2eeRuntimeApprovalPolicy {
  readonly #envApprovedProfiles: ReadonlySet<string> | undefined;

  constructor(envApprovedProfiles: readonly string[] = []) {
    this.#envApprovedProfiles =
      envApprovedProfiles.length > 0 ? new Set(envApprovedProfiles) : undefined;
  }

  isProfileApproved(profile: string): boolean {
    return (
      E2EE_APPROVED_FRANKING_PROFILES.includes(profile) &&
      (this.#envApprovedProfiles === undefined || this.#envApprovedProfiles.has(profile))
    );
  }

  assertProfileApproved(profile: string): void {
    if (this.isProfileApproved(profile)) return;
    // Reuses the domain assertion's message when the domain constant itself doesn't approve the
    // profile; when the domain approves it but this node's env narrowing excludes it, that needs
    // its own message since `assertFrankingProfileApproved` would not throw.
    assertFrankingProfileApproved(profile);
    throw new E2eeContractError(
      `Franking profile "${profile}" is excluded by this node's E2EE_APPROVED_FRANKING_PROFILES override.`,
    );
  }
}

/** Nest injection token: interfaces do not survive TypeScript's runtime emit. */
export const E2EE_RUNTIME_APPROVAL_POLICY = Symbol('E2EE_RUNTIME_APPROVAL_POLICY');
