import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/kosks/:id` without Next (MDRS-137): the page's own wiring of `koskEntry`
 * and `needsHostingRead`, the one thing that lets a Medaris nazımı reach
 * Barındırma hakları. `redirect` and `forbidden` throw as they do in Next, so
 * what the page chose is what the call rejects with.
 */
const KOSK = "a0000000-0000-4000-8000-000000000001";
const OTHER_KOSK = "a0000000-0000-4000-8000-000000000002";

const calls = vi.hoisted(() => ({
  me: vi.fn(),
  rights: vi.fn(),
  held: vi.fn(),
  overview: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  forbidden: () => {
    throw new Error("forbidden");
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => undefined,
}));
vi.mock("~/features/kosks/actions", () => ({
  getMe: calls.me,
  getKoskById: async () => ({ id: KOSK }),
}));
vi.mock("~/features/hosting/reads", () => ({ getHostingRights: calls.rights }));
vi.mock("~/features/assignments/reads", () => ({
  getMyPermissionCodes: calls.held,
}));
vi.mock("~/features/kosks/admin-reads", () => ({
  getKoskNazims: async () => [],
}));
vi.mock("~/features/kosks/overview-reads", () => ({
  getKoskOverview: calls.overview,
  getKoskCourseRoster: async () => null,
}));
vi.mock("~/features/kosks/components/kosk-manage-page", () => ({
  KoskManagePage: () => null,
}));
vi.mock("~/features/kosks/components/load-failed", () => ({
  LoadFailed: () => null,
}));

const meOf = (over: { systemAdmin?: boolean; manages?: string[] } = {}) => ({
  id: "u1",
  roles: {
    systemAdmin: over.systemAdmin ?? false,
    manages: (over.manages ?? []).map((id) => ({ id })),
  },
});

const open = async () => {
  const { default: Page } = await import("../app/[locale]/kosks/[id]/page");
  return Page({ params: Promise.resolve({ locale: "tr", id: KOSK }) });
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.overview.mockResolvedValue({});
  calls.held.mockResolvedValue(new Set<string>());
});

describe("the köşk page's entry", () => {
  it("sends a Medaris nazımı whom the API lets read the rights to Barındırma hakları", async () => {
    calls.me.mockResolvedValue(meOf());
    calls.rights.mockResolvedValue([]);
    await expect(open()).rejects.toThrow(
      `redirect:/tr/kosks/${KOSK}/ayarlar/barindirma`
    );
    expect(calls.rights).toHaveBeenCalledWith(KOSK);
  });

  it.each([
    "forbidden",
    "not-found",
    null,
  ] as const)("shows the forbidden screen when the hosting read says %s", async (answer) => {
    calls.me.mockResolvedValue(meOf({ manages: [OTHER_KOSK] }));
    calls.rights.mockResolvedValue(answer);
    await expect(open()).rejects.toThrow("forbidden");
  });

  it("sends this köşk's nazımı to Dersler without asking for the rights", async () => {
    calls.me.mockResolvedValue(meOf({ manages: [KOSK] }));
    await expect(open()).rejects.toThrow(`redirect:/tr/kosks/${KOSK}/dersler`);
    expect(calls.rights).not.toHaveBeenCalled();
  });

  it("shows a Medaris nazımı holding platform.kosk_edit the management view, where a köşk is hidden and brought back (MDRS-143)", async () => {
    calls.me.mockResolvedValue(meOf());
    calls.rights.mockResolvedValue("forbidden");
    calls.held.mockResolvedValue(new Set(["platform.kosk_edit"]));
    await expect(open()).resolves.toBeTruthy();
  });

  it("does not open it to a Medaris nazımı who holds only another köşk permission", async () => {
    calls.me.mockResolvedValue(meOf());
    calls.rights.mockResolvedValue("forbidden");
    calls.held.mockResolvedValue(new Set(["platform.hosting_grant"]));
    await expect(open()).rejects.toThrow("forbidden");
  });

  it("shows the başnazım the management view, reading the rights once for it", async () => {
    calls.me.mockResolvedValue(meOf({ systemAdmin: true }));
    calls.rights.mockResolvedValue([]);
    await expect(open()).resolves.toBeTruthy();
    expect(calls.rights).toHaveBeenCalledTimes(1);
  });
});
