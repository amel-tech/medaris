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
