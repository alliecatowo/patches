/**
 * What the web E2EE runtime can actually do right now, plus the fixed copy shown when it
 * cannot (B-132). One named constant, one predicate — never an inline literal repeated
 * per call site, so there is exactly one sentence to change when the blocker clears.
 *
 * A message can only move once a *session* exists with each recipient device, and both
 * ways of getting one are unavailable from this client today:
 *   - initiating needs `ClaimPrekeyBundles` material in the crypto-native encoding X3DH
 *     verifies, which the node does not serve (B-124; see `transports.ts`);
 *   - responding to an inbound setup needs that peer's roster in the same encoding,
 *     which this client equally cannot derive — a peer's root signature would have to be
 *     minted with the peer's root private key.
 *
 * So the composer is disabled and says so plainly, instead of offering a control that
 * fails every single time behind retry-flavoured copy. Flip `SESSION_SETUP_AVAILABLE` in
 * the same change that lands B-124's unified encoders, not before — and only alongside a
 * test that actually establishes a session.
 */

/** Deliberately not exported: callers read it through the predicate, so no call site can
 * narrow it to a literal `false` and get its honest branch dead-code-eliminated. */
const SESSION_SETUP_AVAILABLE = false;

export function webE2eeSessionSetupAvailable(): boolean {
  return SESSION_SETUP_AVAILABLE;
}

/**
 * Fixed copy for the disabled state. States only what is verifiably true — it does not
 * describe this surface as encrypted, secure, or private (spec §183.1), and it does not
 * suggest a retry that cannot succeed.
 */
export const WEB_E2EE_SESSION_UNAVAILABLE_COPY =
  'Messaging does not work in the web client yet. This browser cannot set up a messaging ' +
  'session with another device, so nothing can be sent or read here, and retrying will not ' +
  'change that. Use the terminal client until support ships.';
