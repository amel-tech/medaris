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
    getMadrasahPermissions: vi.fn(),
    getMadrasahPermissionGroups: vi.fn(),
    getMadrasahNazirPermissions: vi.fn(),
    getMadrasahCourses: vi.fn(),
    setMadrasahNazirPermissions: vi.fn(),
    createMadrasahPermissionGroup: vi.fn(),
    updateMadrasahPermissionGroup: vi.fn(),
    deleteMadrasahPermissionGroup: vi.fn(),
    hideMadrasah: vi.fn(),
    openMadrasahCourse: vi.fn(),
    setMadrasahCourseMuderris: vi.fn(),
    hideMadrasahCourse: vi.fn(),
  },
  archive: { restoreArchiveItem: vi.fn() },
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

describe("the permission actions (nazir 06)", () => {
  const actions = () => import("~/features/nazirs/actions");
  const catalog = {
    madrasah: ["madrasah.course_open"],
    course: ["course.edit"],
    givable: ["madrasah.course_open", "course.edit"],
  };

  it("reads the dictionary, the groups, what the nazır holds and the courses together, the end as text", async () => {
    const { loadEditor } = await actions();
    api.madrasahs.getMadrasahPermissions.mockResolvedValue(catalog);
    api.madrasahs.getMadrasahPermissionGroups.mockResolvedValue([
      {
        id: "g-1",
        name: "Ders açma ve kadro",
        scope: "MADRASAH",
        permissions: ["madrasah.course_open"],
        userCount: 1,
      },
    ]);
    api.madrasahs.getMadrasahNazirPermissions.mockResolvedValue({
      groupId: "g-1",
      permissions: ["course.edit"],
      courseIds: null,
      expiresAt: new Date("2026-12-31T20:59:59Z"),
    });
    api.madrasahs.getMadrasahCourses.mockResolvedValue([
      { id: "c-1", title: "Bina ve İzhar Şerhi", status: "PUBLISHED" },
    ]);
    expect(await loadEditor("m-1", "u-1")).toEqual({
      success: true,
      data: {
        catalog,
        groups: [
          {
            id: "g-1",
            name: "Ders açma ve kadro",
            scope: "MADRASAH",
            permissions: ["madrasah.course_open"],
            userCount: 1,
          },
        ],
        held: {
          groupId: "g-1",
          permissions: ["course.edit"],
          courseIds: null,
          expiresAt: "2026-12-31T20:59:59.000Z",
        },
        courses: [{ id: "c-1", title: "Bina ve İzhar Şerhi" }],
      },
    });
    expect(api.madrasahs.getMadrasahNazirPermissions).toHaveBeenCalledWith({
      id: "m-1",
      userId: "u-1",
    });
  });

  it("fails as a whole when one of the four reads fails, and says the nazır is gone when the API does", async () => {
    const { loadEditor } = await actions();
    api.madrasahs.getMadrasahPermissions.mockResolvedValue(catalog);
    api.madrasahs.getMadrasahPermissionGroups.mockResolvedValue([]);
    api.madrasahs.getMadrasahCourses.mockResolvedValue([]);
    api.madrasahs.getMadrasahNazirPermissions.mockRejectedValue(
      refusal(404, { code: "MADRASAH_NAZIR_NOT_FOUND", message: "x" })
    );
    expect(await loadEditor("m-1", "u-1")).toEqual({
      success: false,
      code: "MADRASAH_NAZIR_NOT_FOUND",
    });
  });

  it("sends the request as the PUT's body, the end as a date", async () => {
    const { saveNazirPermissions } = await actions();
    api.madrasahs.setMadrasahNazirPermissions.mockResolvedValue({});
    expect(
      await saveNazirPermissions("m-1", "u-1", {
        groupId: "g-1",
        permissions: ["course.edit"],
        courseIds: ["c-1"],
        expiresAt: "2026-12-31T20:59:00.000Z",
      })
    ).toEqual({ success: true, data: null });
    expect(api.madrasahs.setMadrasahNazirPermissions).toHaveBeenCalledWith({
      id: "m-1",
      userId: "u-1",
      setMadrasahNazirPermissionsDto: {
        groupId: "g-1",
        permissions: ["course.edit"],
        courseIds: ["c-1"],
        expiresAt: new Date("2026-12-31T20:59:00.000Z"),
      },
    });

    await saveNazirPermissions("m-1", "u-1", {
      groupId: null,
      permissions: [],
      courseIds: null,
      expiresAt: null,
    });
    expect(
      api.madrasahs.setMadrasahNazirPermissions.mock.calls[1]?.[0]
        .setMadrasahNazirPermissionsDto
    ).toEqual({
      groupId: null,
      permissions: [],
      courseIds: null,
      expiresAt: null,
    });
  });

  it("hands back the code of a refused grant (criterion 2: the server refuses what the caller may not give)", async () => {
    const { saveNazirPermissions } = await actions();
    api.madrasahs.setMadrasahNazirPermissions.mockRejectedValue(
      refusal(403, { code: "PERMISSION_NOT_GIVABLE", message: "x" })
    );
    expect(
      await saveNazirPermissions("m-1", "u-1", {
        groupId: null,
        permissions: ["course.edit"],
        courseIds: null,
        expiresAt: null,
      })
    ).toEqual({ success: false, code: "PERMISSION_NOT_GIVABLE" });
  });
});

describe("the group actions (nazir 16)", () => {
  const actions = () => import("~/features/nazirs/actions");

  it("defines a group with the dialog's body", async () => {
    const { createGroup } = await actions();
    api.madrasahs.createMadrasahPermissionGroup.mockResolvedValue({});
    const body = {
      name: "Ders açma",
      scope: "MADRASAH" as const,
      permissions: ["madrasah.course_open"],
    };
    expect(await createGroup("m-1", body)).toEqual({ success: true });
    expect(api.madrasahs.createMadrasahPermissionGroup).toHaveBeenCalledWith({
      id: "m-1",
      createMadrasahPermissionGroupDto: body,
    });
    api.madrasahs.createMadrasahPermissionGroup.mockRejectedValue(
      refusal(409, { code: "PERMISSION_GROUP_NAME_TAKEN", message: "x" })
    );
    expect(await createGroup("m-1", body)).toEqual({
      success: false,
      code: "PERMISSION_GROUP_NAME_TAKEN",
      userCount: undefined,
    });
  });

  it("changes a group by the patch and the answer about its people, and carries the count of a refusal for want of one", async () => {
    const { updateGroup } = await actions();
    api.madrasahs.updateMadrasahPermissionGroup.mockResolvedValue({});
    expect(
      await updateGroup("m-1", "g-1", { permissions: ["course.edit"] }, "keep")
    ).toEqual({ success: true });
    expect(api.madrasahs.updateMadrasahPermissionGroup).toHaveBeenCalledWith({
      id: "m-1",
      groupId: "g-1",
      updateMadrasahPermissionGroupDto: {
        permissions: ["course.edit"],
        usersPolicy: "keep",
      },
    });

    api.madrasahs.updateMadrasahPermissionGroup.mockRejectedValue(
      refusal(400, {
        type: "APP_ERROR",
        code: "USERS_POLICY_REQUIRED",
        message: "2 people use this group",
        context: { userCount: 2 },
      })
    );
    expect(
      await updateGroup("m-1", "g-1", { permissions: ["course.edit"] })
    ).toEqual({ success: false, code: "USERS_POLICY_REQUIRED", userCount: 2 });
  });

  it("deletes with an empty body for a group nobody holds, and with the answer for one that is held", async () => {
    const { removeGroup } = await actions();
    api.madrasahs.deleteMadrasahPermissionGroup.mockResolvedValue(undefined);
    expect(await removeGroup("m-1", "g-1")).toEqual({ success: true });
    expect(
      api.madrasahs.deleteMadrasahPermissionGroup.mock.calls[0]?.[0]
        .deletePermissionGroupDto
    ).toEqual({});
    await removeGroup("m-1", "g-1", "revoke");
    expect(
      api.madrasahs.deleteMadrasahPermissionGroup.mock.calls[1]?.[0]
        .deletePermissionGroupDto
    ).toEqual({ usersPolicy: "revoke" });
  });
});

describe("the archive actions (nazir 12)", () => {
  const actions = () => import("~/features/archive/actions");

  it("brings an item back by its type and id, and hands back its title", async () => {
    const { restoreItem } = await actions();
    api.archive.restoreArchiveItem.mockResolvedValue({
      type: "course",
      id: "c-1",
      title: "Bina ve İzhar Şerhi",
    });
    expect(await restoreItem("course", "c-1")).toEqual({
      success: true,
      data: { title: "Bina ve İzhar Şerhi" },
    });
    expect(api.archive.restoreArchiveItem).toHaveBeenCalledWith({
      type: "course",
      id: "c-1",
    });
    api.archive.restoreArchiveItem.mockRejectedValue(
      refusal(403, { code: "ARCHIVE_FORBIDDEN", message: "x" })
    );
    expect(await restoreItem("session", "s-1")).toEqual({
      success: false,
      code: "ARCHIVE_FORBIDDEN",
    });
  });

  it("hides the medrese, and hands back the code of a refusal", async () => {
    const { hideMedrese } = await actions();
    api.madrasahs.hideMadrasah.mockResolvedValue({ status: "HIDDEN" });
    expect(await hideMedrese("m-1")).toEqual({ success: true, data: null });
    expect(api.madrasahs.hideMadrasah).toHaveBeenCalledWith({ id: "m-1" });
    api.madrasahs.hideMadrasah.mockRejectedValue(
      refusal(409, { code: "MADRASAH_ALREADY_HIDDEN", message: "x" })
    );
    expect(await hideMedrese("m-1")).toEqual({
      success: false,
      code: "MADRASAH_ALREADY_HIDDEN",
    });
  });
});

describe("the course actions (nazir 08, 17, 18)", () => {
  const actions = () => import("~/features/courses/actions");

  it("opens a course with the form's body, and hands back only its id and title", async () => {
    const { openCourse } = await actions();
    api.madrasahs.openMadrasahCourse.mockResolvedValue({
      id: "c-9",
      title: "Maksûd şerhi",
      status: "DRAFT",
      muderris: [{ name: "Mehmet Emin Işıkoğlu" }],
    });
    const body = {
      koskId: "k-1",
      title: "Maksûd şerhi",
      muderrisUserIds: ["u-1"],
      imamUserId: "u-1",
      closedCourse: false,
      requiresApproval: true,
    };
    expect(await openCourse("m-1", body)).toEqual({
      success: true,
      data: { id: "c-9", title: "Maksûd şerhi" },
    });
    expect(api.madrasahs.openMadrasahCourse).toHaveBeenCalledWith({
      id: "m-1",
      openMadrasahCourseDto: body,
    });
  });

  it("hands back the code of a refused opening, never the API's message", async () => {
    const { openCourse } = await actions();
    api.madrasahs.openMadrasahCourse.mockRejectedValue(
      refusal(403, { code: "HOSTING_RIGHT_REQUIRED", message: "x" })
    );
    const body = { koskId: "k-1", title: "Ders", muderrisUserIds: ["u-1"] };
    expect(await openCourse("m-1", body)).toEqual({
      success: false,
      code: "HOSTING_RIGHT_REQUIRED",
    });
    api.madrasahs.openMadrasahCourse.mockRejectedValue(
      refusal(404, { code: "MUDERRIS_UNKNOWN_USER", message: "x" })
    );
    expect(await openCourse("m-1", body)).toEqual({
      success: false,
      code: "MUDERRIS_UNKNOWN_USER",
    });
    api.madrasahs.openMadrasahCourse.mockRejectedValue(refusal(500));
    expect(await openCourse("m-1", body)).toEqual({
      success: false,
      code: "",
    });
  });

  it("replaces the müderrisler with the whole list as the PUT's body", async () => {
    const { replaceMuderris } = await actions();
    api.madrasahs.setMadrasahCourseMuderris.mockResolvedValue({ id: "c-1" });
    const request = { muderrisUserIds: ["u-1"], imamUserId: "u-1" };
    expect(await replaceMuderris("m-1", "c-1", request)).toEqual({
      success: true,
      data: null,
    });
    expect(api.madrasahs.setMadrasahCourseMuderris).toHaveBeenCalledWith({
      id: "m-1",
      courseId: "c-1",
      setMadrasahCourseMuderrisDto: request,
    });
    api.madrasahs.setMadrasahCourseMuderris.mockRejectedValue(
      refusal(400, { code: "COURSE_IMAM_REQUIRED", message: "x" })
    );
    expect(await replaceMuderris("m-1", "c-1", request)).toEqual({
      success: false,
      code: "COURSE_IMAM_REQUIRED",
    });
  });

  it("hides a course, and hands back the code of a refusal ('zaten gizli' is the API's 409)", async () => {
    const { hideCourse } = await actions();
    api.madrasahs.hideMadrasahCourse.mockResolvedValue(undefined);
    expect(await hideCourse("m-1", "c-1")).toEqual({
      success: true,
      data: null,
    });
    expect(api.madrasahs.hideMadrasahCourse).toHaveBeenCalledWith({
      id: "m-1",
      courseId: "c-1",
    });
    api.madrasahs.hideMadrasahCourse.mockRejectedValue(
      refusal(409, { code: "MADRASAH_COURSE_ALREADY_HIDDEN", message: "x" })
    );
    expect(await hideCourse("m-1", "c-1")).toEqual({
      success: false,
      code: "MADRASAH_COURSE_ALREADY_HIDDEN",
    });
    api.madrasahs.hideMadrasahCourse.mockRejectedValue(
      refusal(403, { code: "AUTHZ_FORBIDDEN", message: "x" })
    );
    expect(await hideCourse("m-1", "c-1")).toEqual({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
  });

  it("writes nothing without a session", async () => {
    token = undefined;
    const { hideCourse } = await actions();
    expect(await hideCourse("m-1", "c-1")).toEqual({
      success: false,
      code: "",
    });
    expect(api.madrasahs.hideMadrasahCourse).not.toHaveBeenCalled();
  });
});
