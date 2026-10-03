/**
 * The ledger behind `test/setup-no-network.ts` (MDRS-89).
 *
 * Its own module so that the guard's regression spec can drain it without
 * importing the setup file — importing a `setupFiles` entry from a spec would
 * re-run its side effects, including registering a second `afterEach`.
 *
 * A refusal is recorded as well as thrown because the callers most likely to
 * trip the guard are the ones that swallow errors: `KeycloakPublicKeyProvider`
 * catches its own failure in `onModuleInit` and logs it, which is how this
 * suite called the deployed realm for months with every test green.
 */

const refused: string[] = [];

/** Called by the guard immediately before it throws. */
export function recordRefusal(target: string): void {
  refused.push(target);
}

/**
 * Empties the ledger and returns what was in it.
 *
 * A test that provokes a refusal on purpose calls this to acknowledge it;
 * anything left at the end of a test is a refusal nobody noticed, which is what
 * the `afterEach` in the setup file fails on.
 */
export function consumeRefusals(): string[] {
  return refused.splice(0);
}
