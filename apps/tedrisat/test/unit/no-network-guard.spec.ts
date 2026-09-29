import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { consumeRefusals } from "../helpers/network-refusals";

/**
 * The guard in `test/setup-no-network.ts` guards itself (MDRS-89).
 *
 * MDRS-89 proved the guard worked with a throwaway spec and then deleted it,
 * which left the one rule the whole issue rests on with no test. The failure
 * that would go unnoticed is not a loud one: somebody adds a "temporary" host
 * to `LOOPBACK_HOSTNAMES`, or loosens the hostname pattern, and the suite goes
 * back to calling the network with every other test still green.
 *
 * Each assertion below is one clause of the rule, so a change that breaks one
 * names which.
 */
describe("the no-network guard", () => {
  it("refuses a host that is not loopback", async () => {
    await expect(fetch("https://auth.medaris.app/")).rejects.toThrow(/MDRS-89/);

    // Acknowledging the refusal is half the assertion: the ledger is what
    // fails a caller that swallowed the throw, so a refusal that never
    // reached it would leave that half of the guard untested. Draining it
    // here also keeps the setup file's `afterEach` from failing this test for
    // the refusal it provoked on purpose.
    expect(consumeRefusals()).toEqual(["https://auth.medaris.app/"]);
  });

  it("lets loopback through", async () => {
    // Port 1 refuses the connection; what matters is that the refusal comes
    // from the network stack rather than from the guard.
    await expect(fetch("http://127.0.0.1:1/")).rejects.not.toThrow(/MDRS-89/);
  });

  describe("a loopback redirect", () => {
    let server: Server;
    let origin: string;

    beforeAll(async () => {
      server = createServer((_request, response) => {
        response.writeHead(302, { location: "https://auth.medaris.app/" });
        response.end();
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
      });

      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    /**
     * The hole this closes: the first hop passes the hostname check, and
     * `fetch` would follow the second one inside itself without re-entering
     * the guard — so the request leaves the machine with nothing having looked
     * at where it went.
     */
    it("is refused when the caller did not ask to handle it", async () => {
      await expect(fetch(origin)).rejects.toThrow(/MDRS-89/);

      expect(consumeRefusals()).toEqual([
        `${origin} → https://auth.medaris.app/`,
      ]);
    });

    it("is handed back when the caller asks for redirect: manual", async () => {
      const response = await fetch(origin, { redirect: "manual" });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://auth.medaris.app/"
      );
    });
  });
});
