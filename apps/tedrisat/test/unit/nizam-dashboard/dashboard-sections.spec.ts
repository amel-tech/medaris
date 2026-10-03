import { sectionsFor } from "../../../src/nizam-dashboard/dashboard-sections";

describe("sectionsFor (MDRS-182, nizam/01 and 05)", () => {
  it("shows the başnazım every section, the course numbers included", () => {
    expect(sectionsFor(true, new Set())).toEqual({
      openKosk: true,
      applications: true,
      deckRequests: true,
      appeals: true,
      permanentBans: true,
      bans: true,
      inactiveScopes: true,
      courseNumbers: true,
    });
  });

  it("shows a Medaris nazımı with no permission nothing", () => {
    expect(sectionsFor(false, new Set())).toEqual({
      openKosk: false,
      applications: false,
      deckRequests: false,
      appeals: false,
      permanentBans: false,
      bans: false,
      inactiveScopes: false,
      courseNumbers: false,
    });
  });

  it("opens each section with the permission that names it", () => {
    const held = new Set([
      "platform.kosk_create",
      "platform.kosk_application_decide",
      "platform.ban_account",
    ]);
    expect(sectionsFor(false, held)).toMatchObject({
      openKosk: false,
      applications: true,
      deckRequests: false,
      permanentBans: true,
      bans: true,
      inactiveScopes: false,
      courseNumbers: false,
    });
  });

  it("never offers Köşk aç to a nazım: opening a köşk is the başnazım's alone", () => {
    expect(sectionsFor(false, new Set(["platform.kosk_create"])).openKosk).toBe(
      false
    );
  });

  it("opens the bans card with either ban permission", () => {
    expect(sectionsFor(false, new Set(["platform.ban_scoped"])).bans).toBe(
      true
    );
    expect(sectionsFor(false, new Set(["platform.ban_account"])).bans).toBe(
      true
    );
    expect(sectionsFor(false, new Set(["platform.audit_read"])).bans).toBe(
      false
    );
  });

  it("never gives a nazım the course numbers, whatever they hold", () => {
    const everything = new Set([
      "platform.kosk_create",
      "platform.deck_publish",
      "platform.inactive_scopes_manage",
    ]);
    expect(sectionsFor(false, everything).courseNumbers).toBe(false);
  });
});
