import type { IRegisteredPartner } from "../../../src/integration/domain/partner-registry";
import { PartnerRegistry } from "../../../src/integration/partner-registry";
import type { PartnerRegistryRepository } from "../../../src/integration/partner-registry.repository";

/**
 * The partner registry's cache (partner enrollments): read on every
 * authenticated request, kept for a minute, emptied by every write in this
 * process. The repository is a stub that counts its reads.
 */
const PARTNER: IRegisteredPartner = {
  clientId: "ornek-uygulama",
  name: "Örnek Uygulama",
  enabled: true,
};

function repoOf(rows: () => IRegisteredPartner[] | Promise<never>) {
  const repo = {
    reads: 0,
    all: vi.fn(async () => {
      repo.reads += 1;
      return rows();
    }),
  };
  return repo;
}

const registryWith = (repo: ReturnType<typeof repoOf>) =>
  new PartnerRegistry(repo as unknown as PartnerRegistryRepository);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PartnerRegistry (partner enrollments)", () => {
  it("reads the database once a minute, not once a request", async () => {
    const repo = repoOf(() => [PARTNER]);
    const registry = registryWith(repo);

    expect((await registry.all()).get(PARTNER.clientId)).toEqual(PARTNER);
    await registry.find(PARTNER.clientId);
    await registry.isRefused(PARTNER.clientId);
    expect(repo.reads).toBe(1);

    vi.advanceTimersByTime(59_999);
    await registry.all();
    expect(repo.reads).toBe(1);
    vi.advanceTimersByTime(1);
    await registry.all();
    expect(repo.reads).toBe(2);
  });

  it("reads again at once after a write in this process", async () => {
    let rows = [PARTNER];
    const repo = repoOf(() => rows);
    const registry = registryWith(repo);

    expect(await registry.find(PARTNER.clientId)).toEqual(PARTNER);
    rows = [{ ...PARTNER, enabled: false }];
    registry.invalidate();
    expect(await registry.find(PARTNER.clientId)).toMatchObject({
      enabled: false,
    });
    expect(repo.reads).toBe(2);
  });

  it("asks the database once for requests that arrive together", async () => {
    const repo = repoOf(() => [PARTNER]);
    const registry = registryWith(repo);

    await Promise.all([registry.all(), registry.all(), registry.all()]);
    expect(repo.reads).toBe(1);
  });

  it("does not keep a read that started before a write", async () => {
    let release: (rows: IRegisteredPartner[]) => void = () => undefined;
    const repo = {
      reads: 0,
      all: vi.fn(() => {
        repo.reads += 1;
        return repo.reads === 1
          ? new Promise<IRegisteredPartner[]>((resolve) => {
              release = resolve;
            })
          : Promise.resolve([{ ...PARTNER, enabled: false }]);
      }),
    };
    const registry = new PartnerRegistry(
      repo as unknown as PartnerRegistryRepository
    );

    const before = registry.all();
    registry.invalidate();
    release([PARTNER]);
    await before;
    expect(await registry.find(PARTNER.clientId)).toMatchObject({
      enabled: false,
    });
  });

  it("refuses a registered client's token elsewhere, enabled or not, and nobody else's", async () => {
    const registry = registryWith(
      repoOf(() => [
        PARTNER,
        { clientId: "kapali-uygulama", name: "Kapalı", enabled: false },
      ])
    );

    expect(await registry.isRefused("ornek-uygulama")).toBe(true);
    expect(await registry.isRefused("kapali-uygulama")).toBe(true);
    expect(await registry.isRefused("tedris-web")).toBe(false);
  });

  it("answers from the copy it holds when a later read fails, and throws when it holds none", async () => {
    let fail = false;
    const repo = repoOf(() =>
      fail ? Promise.reject(new Error("connection lost")) : [PARTNER]
    );
    const registry = registryWith(repo);

    await registry.all();
    fail = true;
    vi.advanceTimersByTime(60_000);
    expect(await registry.isRefused(PARTNER.clientId)).toBe(true);

    registry.invalidate();
    await expect(registry.all()).rejects.toThrow("connection lost");
  });
});
