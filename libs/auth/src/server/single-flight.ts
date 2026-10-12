/**
 * One call per key at a time within this process, and for a short while after
 * it settled, the same answer again.
 *
 * Why the second half: with refresh-token rotation (RFC 9700 §4.14.2, and
 * likely QAuth's default) a refresh token works once. A browser that sends
 * three requests at once carries the same old token in all three; the first
 * refreshes, and the other two must get that same new session rather than
 * present the spent token and have the whole session revoked. A request that
 * arrives just after the first one finished, before the browser has stored the
 * new cookie, is in the same position, which is what `graceMs` covers.
 *
 * Within one process only: two replicas can still each refresh once. The
 * server-side session store of Phase 2 moves this to a lock in the store.
 */
export interface SingleFlight<T> {
  run(key: string, call: () => Promise<T>): Promise<T>;
}

/**
 * Every single-flight's table, held weakly, so `forgetAllFlights` (exported
 * by `@medaris/auth/testing`) can empty them between specs. An app builds
 * its auth once per module, so a spec that signs in with the same access
 * token twice within the grace would otherwise get the first spec's answer.
 */
const everyTable = new Set<WeakRef<Map<string, unknown>>>();

/** Forgets every call in flight or settled, in every single-flight of this process. */
export function forgetAllFlights(): void {
  for (const ref of everyTable) {
    const table = ref.deref();
    if (table) table.clear();
    else everyTable.delete(ref);
  }
}

export function createSingleFlight<T>(
  graceMs: number,
  now: () => number,
  /** Whether a settled answer may be handed out again; failures are not, by default. */
  reusable: (value: T) => boolean = () => true
): SingleFlight<T> {
  const flights = new Map<string, { result: Promise<T>; settledAt?: number }>();
  everyTable.add(new WeakRef(flights));
  // Only this flight's own entry: after `forgetAllFlights` a newer one may hold the key.
  const drop = (key: string, flight: unknown) => {
    if (flights.get(key) === flight) flights.delete(key);
  };

  const sweep = (at: number) => {
    for (const [key, flight] of flights) {
      if (flight.settledAt !== undefined && at - flight.settledAt >= graceMs) {
        flights.delete(key);
      }
    }
  };

  return {
    run(key, call) {
      const at = now();
      sweep(at);
      const known = flights.get(key);
      if (known) return known.result;

      const flight: { result: Promise<T>; settledAt?: number } = {
        result: Promise.resolve().then(call),
      };
      flights.set(key, flight);
      flight.result.then(
        (value) => {
          if (reusable(value) && graceMs > 0) flight.settledAt = now();
          else drop(key, flight);
        },
        () => drop(key, flight)
      );
      return flight.result;
    },
  };
}
