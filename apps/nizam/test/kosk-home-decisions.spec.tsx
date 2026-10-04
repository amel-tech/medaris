// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  KoskDashboardApplicationResponse,
  KoskDashboardResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KoskHome } from "~/features/dashboard/components/kosk-home";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The köşk home's application rows against what tedrisat refuses (MDRS-135
 * follow-up): a row whose course is in a passive scope offers neither Onayla
 * nor Reddet and says why, and a refusal that still comes back is worded in
 * Turkish as the Başvurular page words it, not with the server's English.
 */

const actions = vi.hoisted(() => ({
  approveEnrollment: vi.fn(),
  rejectEnrollment: vi.fn(),
}));
vi.mock("~/features/kosks/actions/courses", () => actions);
vi.mock("~/features/dashboard/actions", () => ({ loadKoskSessions: vi.fn() }));
const toaster = vi.hoisted(() => ({ notify: vi.fn(), dismiss: vi.fn() }));
vi.mock("@medaris/ui/mds/toast", () => ({ useToaster: () => toaster }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const tr = resources.tr.nizam.Dashboard.applications;
const SERVER_ENGLISH =
  "Caller is not authorized for the requested scope on this resource";

const application = (
  courseId: string,
  extra: Partial<KoskDashboardApplicationResponse> = {}
): KoskDashboardApplicationResponse => ({
  userId: `u-${courseId}`,
  courseId,
  courseTitle: `Ders ${courseId}`,
  studentName: `Talebe ${courseId}`,
  requestedAt: new Date("2026-10-03T07:02:00Z"),
  canDecide: true,
  scopePassive: false,
  ...extra,
});

const home = (
  latestApplications: KoskDashboardApplicationResponse[]
): KoskDashboardResponse =>
  ({
    koskId: "k1",
    koskName: "Nûruosmaniye Köşkü",
    greetingName: "Abdülhamit",
    counts: {
      courses: 3,
      students: 10,
      upcomingSessions: 0,
      pendingApplications: latestApplications.length,
    },
    sessionCounts: { upcoming: 0, past: 0, cancelled: 0 },
    missingLinkCount: 0,
    tab: "UPCOMING",
    sessions: [],
    latestApplications,
    muderris: [],
  }) as KoskDashboardResponse;

let root: Root;
let host: HTMLElement;

const mount = async (applications: KoskDashboardApplicationResponse[]) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <NextIntlClientProvider
        locale="tr"
        timeZone="Europe/Istanbul"
        messages={{ nizam: resources.tr.nizam } as never}
      >
        <KoskHome data={home(applications)} nowIso="2026-10-03T08:00:00Z" />
      </NextIntlClientProvider>
    );
  });
};

const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const approveOf = (course: string) =>
  button(`Onayla: Talebe ${course}, Ders ${course}`);
const rejectOf = (course: string) =>
  button(`Reddet: Talebe ${course}, Ders ${course}`);

const click = async (el: HTMLElement | null) => {
  if (!el) throw new Error("no such button");
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

beforeEach(() => {
  actions.approveEnrollment.mockReset();
  actions.rejectEnrollment.mockReset();
  toaster.notify.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("a row of the köşk home's applications", () => {
  it("keeps Onayla and Reddet for a course the viewer may decide", async () => {
    await mount([application("open")]);
    expect(approveOf("open")).not.toBeNull();
    expect(rejectOf("open")).not.toBeNull();
    expect(host.textContent).not.toContain(tr.passiveScope);
  });

  it("shows the reason in place of both buttons when the course's scope is passive", async () => {
    await mount([
      application("open"),
      application("passive", { canDecide: false, scopePassive: true }),
    ]);
    expect(approveOf("passive")).toBeNull();
    expect(rejectOf("passive")).toBeNull();
    expect(host.textContent).toContain(tr.passiveScope);
    // only the passive row lost its buttons
    expect(approveOf("open")).not.toBeNull();
    expect(rejectOf("open")).not.toBeNull();
  });

  it("says plainly that the viewer may not decide when the reason is not a passive scope", async () => {
    await mount([application("closed", { canDecide: false })]);
    expect(approveOf("closed")).toBeNull();
    expect(rejectOf("closed")).toBeNull();
    expect(host.textContent).toContain(tr.errorForbidden);
    expect(host.textContent).not.toContain(tr.passiveScope);
  });
});

describe("a refusal that still comes back", () => {
  const refused = {
    success: false,
    error: SERVER_ENGLISH,
    errorBody: {
      statusCode: 403,
      code: "AUTHZ_FORBIDDEN",
      message: SERVER_ENGLISH,
    },
  };

  it("is worded in Turkish on Onayla, never with the server's English", async () => {
    actions.approveEnrollment.mockResolvedValue(refused);
    await mount([application("open")]);
    await click(approveOf("open"));
    expect(toaster.notify).toHaveBeenCalledTimes(1);
    expect(toaster.notify).toHaveBeenCalledWith({
      tone: "error",
      title: tr.actionFailed,
      description: tr.errorForbidden,
    });
    // refused: the row stays, the talebe is still waiting
    expect(approveOf("open")).not.toBeNull();
  });

  it("is worded in Turkish on Reddet too", async () => {
    actions.rejectEnrollment.mockResolvedValue(refused);
    await mount([application("open")]);
    await click(rejectOf("open"));
    const form = document.querySelector("form");
    if (!form) throw new Error("the dialog did not open");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(toaster.notify).toHaveBeenCalledWith({
      tone: "error",
      title: tr.actionFailed,
      description: tr.errorForbidden,
    });
  });

  it("keeps the Reddet dialog and the row open on a refusal, so the reason is not lost", async () => {
    actions.rejectEnrollment.mockResolvedValue(refused);
    await mount([application("open")]);
    await click(rejectOf("open"));
    const form = document.querySelector("form");
    if (!form) throw new Error("the dialog did not open");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(document.querySelector("form")).not.toBeNull();
    expect(approveOf("open")).not.toBeNull();
    expect(rejectOf("open")).not.toBeNull();
  });

  it("drops the row of an application someone else already decided", async () => {
    actions.approveEnrollment.mockResolvedValue({
      success: false,
      error: "Enrollment not found",
      errorBody: { statusCode: 404, code: "ENROLLMENT_NOT_FOUND" },
    });
    await mount([application("gone"), application("open")]);
    await click(approveOf("gone"));
    expect(toaster.notify).toHaveBeenCalledWith({
      tone: "error",
      title: tr.actionFailed,
      description: tr.errorGone,
    });
    expect(approveOf("gone")).toBeNull();
    expect(approveOf("open")).not.toBeNull();
  });

  it("closes the Reddet dialog with the row of an application someone else already decided", async () => {
    actions.rejectEnrollment.mockResolvedValue({
      success: false,
      error: "Enrollment not found",
      errorBody: { statusCode: 404, code: "ENROLLMENT_NOT_FOUND" },
    });
    await mount([application("gone")]);
    await click(rejectOf("gone"));
    const form = document.querySelector("form");
    if (!form) throw new Error("the dialog did not open");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(approveOf("gone")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
  });

  it("falls back to the unknown sentence for anything else", async () => {
    actions.approveEnrollment.mockResolvedValue({
      success: false,
      error: "boom",
    });
    await mount([application("open")]);
    await click(approveOf("open"));
    expect(toaster.notify).toHaveBeenCalledWith({
      tone: "error",
      title: tr.actionFailed,
      description: tr.errorUnknown,
    });
  });
});
