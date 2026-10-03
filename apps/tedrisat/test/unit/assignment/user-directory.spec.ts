import { UserDirectoryService } from "../../../src/assignment/user-directory.service";

const holder = { id: "u1", givenName: "Ada", familyName: "Admin", email: null };

function build(keycloak: Record<string, unknown>) {
  return new UserDirectoryService(keycloak as never, {} as never, {} as never);
}

describe("UserDirectoryService.chiefNazimName (MDRS-169)", () => {
  it("names the first holder of the role and caches the answer", async () => {
    const findByRealmRole = vi.fn(async () => [holder]);
    const service = build({ isConfigured: () => true, findByRealmRole });
    expect(await service.chiefNazimName()).toBe("Ada Admin");
    expect(await service.chiefNazimName()).toBe("Ada Admin");
    expect(findByRealmRole).toHaveBeenCalledTimes(1);
  });

  it("answers null when nobody holds the role", async () => {
    const service = build({
      isConfigured: () => true,
      findByRealmRole: async () => [],
    });
    expect(await service.chiefNazimName()).toBeNull();
  });

  it("answers null, not an error, when the directory is down or not configured", async () => {
    const down = build({
      isConfigured: () => true,
      findByRealmRole: async () => {
        throw new Error("down");
      },
    });
    expect(await down.chiefNazimName()).toBeNull();
    const off = build({ isConfigured: () => false });
    expect(await off.chiefNazimName()).toBeNull();
  });
});

describe("UserDirectoryService.resolvePeople (MDRS-184)", () => {
  const signedIn = { givenName: "Ada", familyName: "Admin", email: "a@x.test" };
  const stranger = { id: "u2", givenName: "Bo", familyName: null, email: null };

  function peopleOf(keycloak: Record<string, unknown>) {
    const findPeople = vi.fn(async () => new Map([["u1", signedIn]]));
    const service = new UserDirectoryService(
      keycloak as never,
      { findPeople } as never,
      {} as never
    );
    return { service, findPeople };
  }

  it("takes the users table first and asks the realm only for the rest", async () => {
    const findById = vi.fn(async () => stranger);
    const { service } = peopleOf({ isConfigured: () => true, findById });
    const people = await service.resolvePeople(["u1", "u2", "u2"]);
    expect(people.get("u1")).toBe(signedIn);
    expect(people.get("u2")).toBe(stranger);
    expect(findById).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith("u2");
  });

  it("leaves a person out, not fails, when the realm does not answer or is not configured", async () => {
    const down = peopleOf({
      isConfigured: () => true,
      findById: async () => {
        throw new Error("down");
      },
    });
    expect([
      ...(await down.service.resolvePeople(["u1", "u2"])).keys(),
    ]).toEqual(["u1"]);
    const findById = vi.fn();
    const off = peopleOf({ isConfigured: () => false, findById });
    expect((await off.service.resolvePeople(["u1", "u2"])).has("u2")).toBe(
      false
    );
    expect(findById).not.toHaveBeenCalled();
  });
});
