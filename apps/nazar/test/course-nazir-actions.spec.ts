import {
  CreateCourseNazirDtoToJSON,
  ResponseError,
  UpdateCourseNazirDtoToJSON,
} from "@medaris/services/tedrisat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the server actions of Ders nazırları (MDRS-270) do with the API's
 * answers: each is one call of tedrisat's course nazır routes, hands the
 * browser only the API's code on a refusal, and writes nothing without a
 * session. The API client and the session are stubs; the bodies are also put
 * through the generated serializers, which is what the client sends.
 */
const api = {
  courses: {
    createCourseNazir: vi.fn(),
    updateCourseNazir: vi.fn(),
    revokeCourseNazir: vi.fn(),
  },
};
let token: string | undefined;

vi.mock("~/lib/auth_options", () => ({ getAccessToken: async () => token }));
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

/** The JSON the generated client puts on the wire for the call's body. */
const wire = (serialize: (dto: never) => unknown, dto: unknown) =>
  JSON.parse(JSON.stringify(serialize(dto as never)));

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  token = "token";
  for (const fn of Object.values(api.courses)) fn.mockReset();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

const actions = () => import("~/features/course-nazirs/actions");

describe("Ders nazırı ata", () => {
  it("sends the person, the codes and the end, and hands back nothing", async () => {
    const { appointCourseNazir } = await actions();
    api.courses.createCourseNazir.mockResolvedValue({ items: [] });
    expect(
      await appointCourseNazir("c-1", {
        userId: "u-9",
        permissions: ["session.manage", "recording.manage"],
        endsAt: "2026-12-31T20:59:00.000Z",
      })
    ).toEqual({ success: true, data: null });
    expect(api.courses.createCourseNazir).toHaveBeenCalledExactlyOnceWith({
      id: "c-1",
      createCourseNazirDto: {
        userId: "u-9",
        permissions: ["session.manage", "recording.manage"],
        endsAt: new Date("2026-12-31T20:59:00.000Z"),
      },
    });
  });

  it("leaves the end out when there is none, which the API reads as no end", async () => {
    const { appointCourseNazir } = await actions();
    api.courses.createCourseNazir.mockResolvedValue({ items: [] });
    await appointCourseNazir("c-1", { userId: "u-9", permissions: [] });
    const [call] = api.courses.createCourseNazir.mock.calls[0] as [
      { createCourseNazirDto: unknown },
    ];
    expect(call.createCourseNazirDto).toEqual({
      userId: "u-9",
      permissions: [],
    });
    expect(wire(CreateCourseNazirDtoToJSON, call.createCourseNazirDto)).toEqual(
      { userId: "u-9", permissions: [] }
    );
  });

  it("hands back only the code of a refusal, never the message", async () => {
    const { appointCourseNazir } = await actions();
    api.courses.createCourseNazir.mockRejectedValue(
      refusal(409, {
        code: "COURSE_NAZIR_EXISTS",
        message: "User u-9 already holds a post in course c-1",
      })
    );
    expect(
      await appointCourseNazir("c-1", { userId: "u-9", permissions: [] })
    ).toEqual({ success: false, code: "COURSE_NAZIR_EXISTS" });
    expect(errors).toHaveBeenCalledOnce();
  });
});

describe("İzinleri düzenle", () => {
  it("sends the whole set and the end", async () => {
    const { changeCourseNazir } = await actions();
    api.courses.updateCourseNazir.mockResolvedValue({ items: [] });
    expect(
      await changeCourseNazir("c-1", "p-1", {
        permissions: ["recording.manage"],
        endsAt: "2026-12-31T20:59:59.000Z",
      })
    ).toEqual({ success: true, data: null });
    const [call] = api.courses.updateCourseNazir.mock.calls[0] as [
      { id: string; postId: string; updateCourseNazirDto: unknown },
    ];
    expect(call.id).toBe("c-1");
    expect(call.postId).toBe("p-1");
    expect(wire(UpdateCourseNazirDtoToJSON, call.updateCourseNazirDto)).toEqual(
      { permissions: ["recording.manage"], endsAt: "2026-12-31T20:59:59.000Z" }
    );
  });

  it("sends `endsAt: null` when the end is taken away, which the API requires spelled out", async () => {
    const { changeCourseNazir } = await actions();
    api.courses.updateCourseNazir.mockResolvedValue({ items: [] });
    expect(
      await changeCourseNazir("c-1", "p-1", { permissions: [], endsAt: null })
    ).toEqual({ success: true, data: null });
    const [call] = api.courses.updateCourseNazir.mock.calls[0] as [
      { updateCourseNazirDto: unknown },
    ];
    expect(wire(UpdateCourseNazirDtoToJSON, call.updateCourseNazirDto)).toEqual(
      { permissions: [], endsAt: null }
    );
  });

  it("needs its stand-in for null: the generated serializer cannot send a null end itself", () => {
    // When the generator learns to send null, this fails and NO_END can go.
    expect(() =>
      UpdateCourseNazirDtoToJSON({ permissions: [], endsAt: null })
    ).toThrow(TypeError);
  });

  it("hands back only the code of a refusal", async () => {
    const { changeCourseNazir } = await actions();
    api.courses.updateCourseNazir.mockRejectedValue(
      refusal(403, {
        code: "GRANT_EXCEEDS_GIVER",
        message: "You do not hold: course.edit",
        details: { codes: ["course.edit"] },
      })
    );
    expect(
      await changeCourseNazir("c-1", "p-1", {
        permissions: ["course.edit"],
        endsAt: null,
      })
    ).toEqual({ success: false, code: "GRANT_EXCEEDS_GIVER" });
  });
});

describe("Görevden al", () => {
  it("ends the post by its id", async () => {
    const { endCourseNazir } = await actions();
    api.courses.revokeCourseNazir.mockResolvedValue(undefined);
    expect(await endCourseNazir("c-1", "p-1")).toEqual({
      success: true,
      data: null,
    });
    expect(api.courses.revokeCourseNazir).toHaveBeenCalledExactlyOnceWith({
      id: "c-1",
      postId: "p-1",
    });
  });

  it("hands back only the code of a refusal", async () => {
    const { endCourseNazir } = await actions();
    api.courses.revokeCourseNazir.mockRejectedValue(
      refusal(409, {
        code: "DISMISS_SEAT_HANDED_ON",
        message: "u-1 handed seats on",
      })
    );
    expect(await endCourseNazir("c-1", "p-1")).toEqual({
      success: false,
      code: "DISMISS_SEAT_HANDED_ON",
    });
  });
});

describe("without a session", () => {
  it("writes nothing", async () => {
    token = undefined;
    const { appointCourseNazir, changeCourseNazir, endCourseNazir } =
      await actions();
    expect(
      await appointCourseNazir("c-1", { userId: "u-9", permissions: [] })
    ).toEqual({ success: false, code: "" });
    expect(
      await changeCourseNazir("c-1", "p-1", { permissions: [], endsAt: null })
    ).toEqual({ success: false, code: "" });
    expect(await endCourseNazir("c-1", "p-1")).toEqual({
      success: false,
      code: "",
    });
    for (const fn of Object.values(api.courses)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});
