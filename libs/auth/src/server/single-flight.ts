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

export function createSingleFlight<T>(
  graceMs: number,
  now: () => number,
  /** Whether a settled answer may be handed out again; failures are not, by default. */
  reusable: (value: T) => boolean = () => true
): SingleFlight<T> {
  const flights = new Map<string, { result: Promise<T>; settledAt?: number }>();

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
          else flights.delete(key);
        },
        () => flights.delete(key)
      );
      return flight.result;
    },
  };
}
