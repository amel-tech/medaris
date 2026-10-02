import { ResponseError } from "@medaris/services/tedrisat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the two screens' reads and server actions do with the API's answers:
 * a page read tells a refusal from a failure, and an action hands the browser
 * the data or only the API's code. The API client and the session are stubs.
 */
const api = {
  madrasahs: {
    getMadrasahSettings: vi.fn(),
    updateMadrasahSettings: vi.fn(),
    addMadrasahNazir: vi.fn(),
    getMadrasahNazirGrants: vi.fn(),
    removeMadrasahNazir: vi.fn(),
  },
  users: { lookupUser: vi.fn() },
};
let token: string | undefined;

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("~/lib/auth_options", () => ({ getAccessToken: async () => token }));
vi.mock("~/lib/tedrisat-api", () => ({ tedrisatApi: async () => api }));
vi.mock("@medaris/services/tedrisat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@medaris/services/tedrisat")>()),
  createServerTedrisatAPIs: async () => api,
}));

const refusal = (code: number, body?: unknown) =>
  new ResponseError(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status: code,
      headers: { "Content-Type": "application/json" },
    }),
    `HTTP ${code}`
  );

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  token = "token";
  for (const group of Object.values(api)) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

describe("a page's read", () => {
  const read = async () =>
    (await import("~/lib/tedrisat-read")).readOnce("the settings", (client) =>
      client.madrasahs.getMadrasahSettings({ id: "m-1" })
    );

  it("hands over the data", async () => {
    api.madrasahs.getMadrasahSettings.mockResolvedValue({ name: "A" });
    expect(await read()).toEqual({ status: "ok", data: { name: "A" } });
  });

  it("tells a refusal from a failure, and logs only the failure", async () => {
    api.madrasahs.getMadrasahSettings.mockRejectedValue(refusal(403));
    expect(await read()).toEqual({ status: "forbidden" });
    expect(errors).not.toHaveBeenCalled();

    api.madrasahs.getMadrasahSettings.mockRejectedValue(refusal(503));
    expect(await read()).toEqual({ status: "failed" });
    api.madrasahs.getMadrasahSettings.mockRejectedValue(new Error("boom"));
    expect(await read()).toEqual({ status: "failed" });
    expect(errors).toHaveBeenCalledTimes(2);
  });

  it("is the portal's 404 for a medrese that is not there", async () => {
    api.madrasahs.getMadrasahSettings.mockRejectedValue(refusal(404));
    await expect(read()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("Kaydet", () => {
  const save = async (patch: object) =>
    (await import("~/features/settings/actions")).saveSettings("m-1", patch);

  it("sends the patch and hands back the state the API now holds, dated as text", async () => {
    api.madrasahs.updateMadrasahSettings.mockResolvedValue({
      name: "Fatih Medresesi",
      description: null,
      policies: {
        closedCourseRequired: false,
        alwaysApproval: true,
        noPublicRecordings: false,
      },
      updatedAt: new Date("2026-10-02T10:00:00Z"),
      updatedBy: { id: "u", name: "Mehmet Emin Işıkoğlu", email: null },
    });
    const result = await save({ name: "Fatih Medresesi" });
    expect(api.madrasahs.updateMadrasahSettings).toHaveBeenCalledWith({
      id: "m-1",
      updateMadrasahSettingsDto: { name: "Fatih Medresesi" },
    });
    expect(result).toEqual({
      success: true,
      data: {
        form: {
          name: "Fatih Medresesi",
          description: "",
          policies: {
            closedCourseRequired: false,
            alwaysApproval: true,
            noPublicRecordings: false,
          },
        },
        updatedAt: "2026-10-02T10:00:00.000Z",
        updatedBy: "Mehmet Emin Işıkoğlu",
      },
    });
  });

  it("hands back only the API's code when it refuses, never its message", async () => {
    api.madrasahs.updateMadrasahSettings.mockRejectedValue(
      refusal(400, {
        code: "VALIDATION_ERROR",
        message: "Validation error for properties: name",
        errors: [{ property: "name" }],
      })
    );
    expect(await save({ name: "x" })).toEqual({
      success: false,
      code: "VALIDATION_ERROR",
    });
    api.madrasahs.updateMadrasahSettings.mockRejectedValue(refusal(500));
    expect(await save({ name: "x" })).toEqual({ success: false, code: "" });
  });

  it("writes nothing without a session", async () => {
    token = undefined;
    expect(await save({ name: "x" })).toEqual({ success: false, code: "" });
    expect(api.madrasahs.updateMadrasahSettings).not.toHaveBeenCalled();
  });
});

describe("the nazır actions", () => {
  const actions = () => import("~/features/nazirs/actions");

  it("looks an address up and tells found, none and unavailable apart", async () => {
    const { lookupPerson } = await actions();
    api.users.lookupUser.mockResolvedValue([
      { id: "u-9", givenName: "Abdullah Talha", familyName: "Erzurumluoğlu" },
    ]);
    expect(await lookupPerson(" a@example.com ")).toEqual({
      kind: "found",
      person: { id: "u-9", name: "Abdullah Talha Erzurumluoğlu", email: null },
    });
    expect(api.users.lookupUser).toHaveBeenCalledWith({
      email: "a@example.com",
    });

    api.users.lookupUser.mockResolvedValue([]);
    expect(await lookupPerson("b@example.com")).toEqual({ kind: "none" });
    api.users.lookupUser.mockRejectedValue(refusal(503));
    expect(await lookupPerson("c@example.com")).toEqual({
      kind: "unavailable",
    });
  });

  it("appoints by the id the search found", async () => {
    const { appointNazir } = await actions();
    api.madrasahs.addMadrasahNazir.mockResolvedValue({});
    expect(await appointNazir("m-1", "u-9")).toEqual({
      success: true,
      data: null,
    });
    expect(api.madrasahs.addMadrasahNazir).toHaveBeenCalledWith({
      id: "m-1",
      userId: "u-9",
    });
  });

  it("dismisses with the decisions as the API's body, and hands back the code of a refusal", async () => {
    const { dismissNazir } = await actions();
    api.madrasahs.removeMadrasahNazir.mockResolvedValue(undefined);
    const decisions = [{ userId: "u-3", action: "TAKE_OVER" as const }];
    expect(await dismissNazir("m-1", "u-1", decisions)).toEqual({
      success: true,
      data: null,
    });
    expect(api.madrasahs.removeMadrasahNazir).toHaveBeenCalledWith({
      id: "m-1",
      userId: "u-1",
      dismissMadrasahNazirDto: { decisions },
    });

    api.madrasahs.removeMadrasahNazir.mockRejectedValue(
      refusal(400, { code: "DISMISS_DECISIONS_INCOMPLETE", message: "x" })
    );
    expect(await dismissNazir("m-1", "u-1", [])).toEqual({
      success: false,
      code: "DISMISS_DECISIONS_INCOMPLETE",
    });
  });

  it("reads what the nazır gave", async () => {
    const { getNazirGrants } = await actions();
    api.madrasahs.getMadrasahNazirGrants.mockResolvedValue([]);
    expect(await getNazirGrants("m-1", "u-1")).toEqual({
      success: true,
      data: [],
    });
    api.madrasahs.getMadrasahNazirGrants.mockRejectedValue(
      refusal(404, { code: "MADRASAH_NAZIR_NOT_FOUND", message: "x" })
    );
    expect(await getNazirGrants("m-1", "u-1")).toEqual({
      success: false,
      code: "MADRASAH_NAZIR_NOT_FOUND",
    });
  });
});
