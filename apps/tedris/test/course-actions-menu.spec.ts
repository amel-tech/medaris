// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, key, render, settle } from "./dom";

/**
 * "Dersten ayrıl" (MDRS-105, designs tedris/12 and 20): the window asks
 * first, and once the leave is sent nothing closes it until the answer,
 * because closing would not stop the call. A "Vazgeç" that closed the window
 * while the seat was deleted let the talebe believe they had stayed.
 */

const mocks = vi.hoisted(() => ({
  leave: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/features/courses/actions", () => ({ leaveCourse: mocks.leave }));
vi.mock("@medaris/ui/components/sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

const words = resources.tr.tedris.CoursePage;

const mount = async () => {
  const { CourseActionsMenu } = await import(
    "~/features/courses/components/course-actions-menu"
  );
  await render(
    createElement(CourseActionsMenu, {
      courseId: "c1",
      courseTitle: "Emsile ve Bina",
      labels: {
        trigger: words.moreActions,
        leave: words.leaveCourse,
        title: words.leaveTitle,
        confirm: words.leaveConfirm,
        cancel: words.leaveCancel,
        body: "Emsile ve Bina dersinden ayrılacaksın.",
        bodyCards: words.leaveBodyCards,
        left: words.left,
        conflict: words.actionConflict,
        failed: words.actionFailed,
      },
    })
  );
};

const leaveWindow = () => document.querySelector('[role="alertdialog"]');
const inWindow = (text: string) =>
  [...(leaveWindow()?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === text
  ) as HTMLButtonElement;
const closeButton = () =>
  leaveWindow()?.querySelector(
    'button[aria-label="Kapat"]'
  ) as HTMLButtonElement;

/** Opens the "···" menu and chooses "Dersten ayrıl". */
const ask = async () => {
  await click(
    document.querySelector(
      `button[aria-label="${words.moreActions}"]`
    ) as HTMLElement
  );
  await settle(50);
  await click(
    [...document.querySelectorAll("[role=menuitem]")].find(
      (item) => item.textContent === words.leaveCourse
    ) as HTMLElement
  );
  await settle(50);
};

describe("Dersten ayrıl", () => {
  it("'Vazgeç' before the leave is sent closes the window and leaves nothing", async () => {
    await mount();
    await ask();
    expect(leaveWindow()).not.toBeNull();
    expect(inWindow(words.leaveCancel).disabled).toBe(false);
    await click(inWindow(words.leaveCancel));
    await settle(60);
    expect(leaveWindow()).toBeNull();
    expect(mocks.leave).not.toHaveBeenCalled();
  });

  it("once the leave is sent, Vazgeç, Kapat and Esc are off until the answer, which closes the window and says it", async () => {
    let answer: (value: unknown) => void = () => {};
    mocks.leave.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await mount();
    await ask();
    await click(inWindow(words.leaveConfirm));
    expect(mocks.leave).toHaveBeenCalledWith("c1");

    expect(inWindow(words.leaveCancel).disabled).toBe(true);
    expect(closeButton().disabled).toBe(true);
    await click(inWindow(words.leaveCancel));
    await click(closeButton());
    await key(document.activeElement ?? document.body, "Escape");
    await settle(60);
    expect(leaveWindow()).not.toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();

    await act(async () => answer({ success: true, data: {} }));
    await settle(60);
    expect(leaveWindow()).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith(words.left);
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
