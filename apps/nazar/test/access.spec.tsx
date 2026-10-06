import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildScopes } from "~/features/shell/scope";
import { assignment, course, medrese } from "./fixtures";
import { html, textOf, translatorFor } from "./server-render";

/**
 * The access gate: nazir 02 and the decisions that lead to it (`/`,
 * `/erisim-yok`, the layouts). The reads are stubbed; what is under test is
 * what each page does with their answers.
 */
type Portal =
  | {
      status: "ok";
      person: { name: string; email: string | null };
      assignments: unknown[];
      scopes: ReturnType<typeof buildScopes>;
      roles: string[];
    }
  | { status: "unavailable" };

type AdminScope =
  | { status: "ok"; scope: ReturnType<typeof buildScopes>[number] }
  | { status: "none" }
  | { status: "failed" };

const state = {
  portal: { status: "unavailable" } as Portal,
  cookie: undefined as string | undefined,
  tedris: "http://localhost:4000" as string | undefined,
  counts: {} as Record<string, number>,
  admin: { status: "none" } as AdminScope,
  adminOutside: "none" as "ok" | "none" | "failed",
  viewer: null as unknown,
  course: { status: "failed" } as
    | { status: "ok"; data: unknown }
    | { status: "forbidden" }
    | { status: "failed" },
};
const adminAsked = vi.fn();
const courseRead = vi.fn();
const REDIRECT = "NEXT_REDIRECT";
const NOT_FOUND = "NEXT_NOT_FOUND";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (to: string) => {
    throw new Error(`${REDIRECT}:${to}`);
  },
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "nazar-scope" && state.cookie
        ? { value: state.cookie }
        : undefined,
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => translatorFor(namespace),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { idToken: "id-token" } }),
}));
vi.mock("~/env", () => ({
  env: {
    get TEDRIS_URL() {
      return state.tedris;
    },
  },
}));
vi.mock("~/features/shell/reads", () => ({
  getPortal: async () => state.portal,
  getMenuCounts: async () => state.counts,
}));
vi.mock("~/features/shell/admin-scope", () => ({
  adminCourseScope: async (courseId: string) => {
    adminAsked(courseId);
    return state.admin;
  },
  adminOutsideScopes: async () => state.adminOutside,
}));
// What the real `adminCourseScope` reads, for its own describe below.
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => state.viewer,
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string, call: (api: unknown) => Promise<unknown>) => {
    courseRead(what);
    await call({ courses: { getCourseById: async () => {} } });
    return state.course;
  },
}));

const ok = (
  assignments: ReturnType<typeof assignment>[],
  over: Partial<Portal> = {}
) =>
  ({
    status: "ok",
    person: { name: "Elif Nur Taşdelen", email: "elif.tasdelen@example.com" },
    assignments,
    scopes: buildScopes(assignments),
    roles: [],
    ...over,
  }) as Portal;

const outcome = async (run: () => unknown): Promise<string> => {
  try {
    const result = await run();
    return `rendered:${textOf(await html(result as never))}`;
  } catch (error) {
    return (error as Error).message;
  }
};

beforeEach(() => {
  state.portal = { status: "unavailable" };
  state.cookie = undefined;
  state.tedris = "http://localhost:4000";
  state.counts = {};
  state.admin = { status: "none" };
  state.adminOutside = "none";
  state.viewer = null;
  state.course = { status: "failed" };
  adminAsked.mockReset();
  courseRead.mockReset();
});

/** A course the başnazım opened by its address, as `adminCourseScope` answers it. */
const adminCourse = {
  kind: "ders" as const,
  id: "c-9",
  name: "Şerh-i Akaid",
  role: "SYSTEM_ADMIN",
  isImam: false,
  koskName: null,
};

describe("/ (landing)", () => {
  const home = async () => (await import("../app/page")).default();

  it("sends a person with no scope to the no-access page", async () => {
    state.portal = ok([]);
    expect(await outcome(home)).toBe(`${REDIRECT}:/erisim-yok`);
  });

  it("sends a person with a scope to the remembered one while they hold it", async () => {
    state.portal = ok([
      medrese(),
      assignment({ scopeId: "c-1", course: course() }),
    ]);
    state.cookie = "ders%3Ac-1";
    expect(await outcome(home)).toBe(`${REDIRECT}:/ders/c-1`);
  });

  it("falls back to the first medrese when the memory is gone", async () => {
    state.portal = ok([
      assignment({ scopeId: "c-1", course: course() }),
      medrese(),
    ]);
    state.cookie = "ders%3Anot-mine";
    expect(await outcome(home)).toBe(`${REDIRECT}:/medrese/m-1`);
  });

  it("is a retry state, not a redirect, when the roles could not be read", async () => {
    const result = await outcome(home);
    expect(result).toMatch(/^rendered:/);
    expect(result).toContain("Görevleriniz okunamadı");
    expect(result).toContain("Yeniden dene");
    expect(result).not.toContain("erişiminiz yok");
  });
});

describe("/erisim-yok (nazir 02)", () => {
  const page = async () => (await import("../app/erisim-yok/page")).default();

  it("shows the screen to a signed-in person with no medrese and no course", async () => {
    state.portal = ok([]);
    const result = await outcome(page);
    expect(result).toContain("Bu portala erişiminiz yok");
    expect(result).toContain(
      "Nazar, medrese ve ders görevlilerinin portalıdır. Hesabınızda bir medrese ya da ders görevi yok; görev aldığınızda bu portal açılır."
    );
    expect(result).toContain(
      "Giriş yaptığınız hesap: elif.tasdelen@example.com"
    );
    expect(result).toContain("Talebe");
  });

  it("shows the e-mail the session carries, in a mono, left-to-right run", async () => {
    state.portal = ok([]);
    const { default: Page } = await import("../app/erisim-yok/page");
    const markup = await html(await Page());
    expect(markup).toContain(
      '<code class="mds-mono" dir="ltr">elif.tasdelen@example.com</code>'
    );
  });

  it("sends a person who has a scope on to the portal", async () => {
    state.portal = ok([medrese()]);
    expect(await outcome(page)).toBe(`${REDIRECT}:/`);
  });

  it("sends a person who only teaches a course on as well", async () => {
    state.portal = ok([assignment({ scopeId: "c-1", course: course() })]);
    expect(await outcome(page)).toBe(`${REDIRECT}:/`);
  });

  it("names the tab after the verdict only when there is one", async () => {
    const { generateMetadata } = await import("../app/erisim-yok/page");
    state.portal = ok([]);
    expect(await generateMetadata()).toEqual({
      title: "Bu portala erişiminiz yok",
    });
    state.portal = { status: "unavailable" };
    expect(await generateMetadata()).toEqual({
      title: "Görevleriniz okunamadı",
    });
  });

  it("is the retry state, never this verdict, when the read failed (criterion 5)", async () => {
    const result = await outcome(page);
    expect(result).toContain("Görevleriniz okunamadı");
    expect(result).toContain("Yeniden dene");
    expect(result).not.toContain("Bu portala erişiminiz yok");
    expect(result).not.toContain("Tedris’e dön");
  });

  it("links 'Tedris’e dön' to the address in the environment", async () => {
    state.portal = ok([]);
    const { default: Page } = await import("../app/erisim-yok/page");
    const markup = await html(await Page());
    expect(markup).toMatch(
      /<a class="mds-btn[^"]*" href="http:\/\/localhost:4000">Tedris’e dön<\/a>/
    );
  });

  it("leaves the link out when the address is not set", async () => {
    state.portal = ok([]);
    for (const unset of [undefined, ""]) {
      state.tedris = unset;
      expect(await outcome(page)).not.toContain("Tedris’e dön");
    }
  });

  it("offers 'Çıkış yap', so a person signed in with the wrong account is not stuck (MDRS-248)", async () => {
    state.portal = ok([]);
    const { default: Page } = await import("../app/erisim-yok/page");
    for (const tedris of [undefined, "http://localhost:4000"]) {
      state.tedris = tedris;
      const markup = await html(await Page());
      expect(markup).toMatch(
        /<button[^>]*>[\s\S]*?Çıkış yap[\s\S]*?<\/button>/
      );
    }
  });

  it("has no menu, no picker and no way to the account page (criterion 1)", async () => {
    state.portal = ok([]);
    const { default: Page } = await import("../app/erisim-yok/page");
    const markup = await html(await Page());
    const aside = /<aside[\s\S]*?<\/aside>/.exec(markup)?.[0] ?? "";
    expect(aside).not.toContain("<nav");
    expect(aside).not.toContain('href="/hesap"');
    expect(aside).not.toContain("Kapsam");
    expect(markup).toContain('<h1 class="mds-h1"');
  });
});

describe("the layouts", () => {
  const layout = async (
    scope: { kind: "medrese" | "ders"; id: string } | null
  ) => {
    const { PortalLayout } = await import(
      "~/features/shell/components/portal-layout"
    );
    return PortalLayout({ scope, children: <p>sayfa</p> });
  };

  it("answers 404 for a scope that is not the caller's, so ids are not revealed", async () => {
    state.portal = ok([medrese()]);
    expect(
      await outcome(() => layout({ kind: "medrese", id: "baskasi" }))
    ).toBe(NOT_FOUND);
    // the right id under the wrong kind is the same answer
    expect(await outcome(() => layout({ kind: "ders", id: "m-1" }))).toBe(
      NOT_FOUND
    );
  });

  it("sends a person with no scope at all to the no-access page rather than a 404", async () => {
    state.portal = ok([]);
    expect(await outcome(() => layout({ kind: "medrese", id: "m-1" }))).toBe(
      `${REDIRECT}:/erisim-yok`
    );
    expect(await outcome(() => layout(null))).toBe(`${REDIRECT}:/erisim-yok`);
  });

  it("shows the page of one's own scope inside the shell", async () => {
    state.portal = ok([medrese()]);
    const result = await outcome(() => layout({ kind: "medrese", id: "m-1" }));
    expect(result).toContain("sayfa");
    expect(result).toContain("Medrese ayarları");
  });

  it("gives a page outside any scope the menu of the remembered scope", async () => {
    state.portal = ok([
      medrese(),
      assignment({
        scopeId: "c-1",
        scopeName: "Bina ve İzhar Şerhi",
        course: course(),
      }),
    ]);
    state.cookie = "ders%3Ac-1";
    const result = await outcome(() => layout(null));
    expect(result).toContain("Ders ayarları");
    expect(result).not.toContain("Medrese ayarları");
  });

  it("is the retry state when the roles could not be read", async () => {
    const result = await outcome(() => layout({ kind: "medrese", id: "m-1" }));
    expect(result).toContain("Görevleriniz okunamadı");
    expect(result).not.toContain("sayfa");
  });

  it("remembers the scope only on a scoped page", async () => {
    state.portal = ok([medrese()]);
    const { PortalLayout } = await import(
      "~/features/shell/components/portal-layout"
    );
    // ScopeMemory draws nothing; what a layout decides is whether it is asked for.
    const scoped = (await PortalLayout({
      scope: { kind: "medrese", id: "m-1" },
      children: null,
    })) as { props: { remember: boolean } };
    const global = (await PortalLayout({ scope: null, children: null })) as {
      props: { remember: boolean };
    };
    expect(scoped.props.remember).toBe(true);
    expect(global.props.remember).toBe(false);
  });

  it("opens a course to the başnazım by its address, named after the course, with 'Medaris başnazımı' on the user row", async () => {
    state.portal = ok([]);
    state.admin = { status: "ok", scope: adminCourse };
    const result = await outcome(() => layout({ kind: "ders", id: "c-9" }));
    expect(adminAsked).toHaveBeenCalledExactlyOnceWith("c-9");
    expect(result).toMatch(/^rendered:/);
    expect(result).toContain("sayfa");
    expect(result).toContain("Şerh-i Akaid");
    expect(result).toContain("Medaris başnazımı");
    // the course's own menu, with the pages MDRS-270 builds
    expect(result).toContain("Ders nazırları");
    expect(result).toContain("Ders ayarları");
  });

  it("opens it beside the scopes the başnazım holds himself, under the roles he holds", async () => {
    state.portal = ok([medrese()], { roles: ["MEDRESE_BASMUDERRIS"] });
    state.admin = { status: "ok", scope: adminCourse };
    const { PortalLayout } = await import(
      "~/features/shell/components/portal-layout"
    );
    const opened = (await PortalLayout({
      scope: { kind: "ders", id: "c-9" },
      children: null,
    })) as { props: { scopes: Array<{ id: string }>; roles: string[] } };
    expect(opened.props.scopes.map((scope) => scope.id)).toEqual([
      "m-1",
      "c-9",
    ]);
    expect(opened.props.roles).toEqual(["MEDRESE_BASMUDERRIS"]);
  });

  it("does not remember the başnazım's course for '/'", async () => {
    state.portal = ok([]);
    state.admin = { status: "ok", scope: adminCourse };
    const { PortalLayout } = await import(
      "~/features/shell/components/portal-layout"
    );
    const opened = (await PortalLayout({
      scope: { kind: "ders", id: "c-9" },
      children: null,
    })) as { props: { remember: boolean; current: { id: string } } };
    expect(opened.props.current.id).toBe("c-9");
    expect(opened.props.remember).toBe(false);
  });

  it("is the retry state when the başnazım's course could not be read", async () => {
    state.portal = ok([]);
    state.admin = { status: "failed" };
    const result = await outcome(() => layout({ kind: "ders", id: "c-9" }));
    expect(result).toContain("Görevleriniz okunamadı");
    expect(result).not.toContain("sayfa");
  });

  it("opens /hesap and /bildirimler to the başnazım who holds no seat, in the frame without a scope", async () => {
    // the frame of a course he opened by its address links to both
    state.portal = ok([]);
    state.adminOutside = "ok";
    const result = await outcome(() => layout(null));
    expect(result).toMatch(/^rendered:/);
    expect(result).toContain("sayfa");
    expect(result).toContain("Medaris başnazımı");
    expect(result).not.toContain("Ders ayarları");
  });

  it("is the retry state there, not the no-access page, when /me could not be read", async () => {
    state.portal = ok([]);
    state.adminOutside = "failed";
    const result = await outcome(() => layout(null));
    expect(result).toContain("Görevleriniz okunamadı");
    expect(result).not.toContain("sayfa");
  });

  it("never opens a medrese that way, nor asks for one's own scope", async () => {
    state.portal = ok([medrese()]);
    state.admin = { status: "ok", scope: adminCourse };
    expect(
      await outcome(() => layout({ kind: "medrese", id: "baskasi" }))
    ).toBe(NOT_FOUND);
    await outcome(() => layout({ kind: "medrese", id: "m-1" }));
    expect(adminAsked).not.toHaveBeenCalled();
  });
});

describe("the başnazım's course scope", () => {
  /** A course id as the API has it; the address may write it in capitals. */
  const COURSE = "0e1c7a52-3f4b-4d1e-9a6c-2b8f5d7e9a10";
  const scopeOf = async (courseId: string) => {
    const { adminCourseScope } = await vi.importActual<
      typeof import("~/features/shell/admin-scope")
    >("~/features/shell/admin-scope");
    return adminCourseScope(courseId);
  };

  it("is nothing, and reads no course, for anyone /me does not call the başnazım", async () => {
    state.viewer = { id: "u-1", roles: { systemAdmin: false } };
    state.course = {
      status: "ok",
      data: { id: COURSE, title: "Şerh-i Akaid" },
    };
    expect(await scopeOf(COURSE)).toEqual({ status: "none" });
    expect(courseRead).not.toHaveBeenCalled();
  });

  it("is the retry state, never a verdict, when /me could not be read", async () => {
    state.viewer = null;
    state.course = {
      status: "ok",
      data: { id: COURSE, title: "Şerh-i Akaid" },
    };
    expect(await scopeOf(COURSE)).toEqual({ status: "failed" });
    expect(courseRead).not.toHaveBeenCalled();
  });

  it("is the portal's 404 for an address that names no course id, as for anyone", async () => {
    state.viewer = { id: "u-0", roles: { systemAdmin: true } };
    await expect(scopeOf("1234-abcd")).rejects.toThrow(NOT_FOUND);
    expect(courseRead).not.toHaveBeenCalled();
  });

  it("tells the pages outside any scope whether /me calls the caller the başnazım", async () => {
    const { adminOutsideScopes } = await vi.importActual<
      typeof import("~/features/shell/admin-scope")
    >("~/features/shell/admin-scope");
    for (const [viewer, answer] of [
      [{ id: "u-0", roles: { systemAdmin: true } }, "ok"],
      [{ id: "u-1", roles: { systemAdmin: false } }, "none"],
      [null, "failed"],
    ] as const) {
      state.viewer = viewer;
      expect(await adminOutsideScopes(), answer).toBe(answer);
    }
  });

  it("is the course, by its own id and title, for the başnazım", async () => {
    state.viewer = { id: "u-0", roles: { systemAdmin: true } };
    state.course = {
      status: "ok",
      data: { id: COURSE, title: "Şerh-i Akaid" },
    };
    expect(await scopeOf(COURSE.toUpperCase())).toEqual({
      status: "ok",
      scope: { ...adminCourse, id: COURSE },
    });
    expect(courseRead).toHaveBeenCalledExactlyOnceWith("the course");
  });

  it("is the retry state, never a scope, when the course read failed or was refused", async () => {
    state.viewer = { id: "u-0", roles: { systemAdmin: true } };
    for (const course of [
      { status: "failed" },
      { status: "forbidden" },
    ] as const) {
      state.course = course;
      expect(await scopeOf(COURSE)).toEqual({ status: "failed" });
    }
  });
});
