// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { PlatformPolicyResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PoliciesView } from "~/features/platform-admin/components/policies-view";
import { cleanup, click, render, settle } from "./dom";

/**
 * Platform ayarları (nizam 19) with both switches pressed before either
 * answer is back. Each switch is off until its own answer, and a refusal puts
 * back that switch alone: the other one's move, already stored, stays on the
 * screen. The server action is held open by hand.
 */

const setPlatformPolicy = vi.hoisted(() => vi.fn());
vi.mock("~/features/platform-admin/actions", () => ({ setPlatformPolicy }));
vi.mock("@medaris/ui/components/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** A server action answer the test releases when it chooses. */
const deferred = <T,>() => {
  let settleIt: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settleIt = resolve;
  });
  return { promise, settle: settleIt };
};

const APPROVAL = "ALWAYS_REQUIRE_APPROVAL";
const RECORDINGS = "RECORDINGS_NEVER_PUBLIC";
const policy = (key: string, enabled: boolean): PlatformPolicyResponse =>
  ({
    key,
    enabled,
    changedBy: null,
    changedAt: null,
    ownScopes: [],
  }) as unknown as PlatformPolicyResponse;

const switchOf = (key: string) =>
  document.querySelector(
    `[data-testid="policy-${key}"] [role="switch"]`
  ) as HTMLElement;
const label = (key: string) =>
  document.querySelector(
    `[data-testid="policy-${key}"] label.mds-choice`
  ) as HTMLElement;
const isOn = (key: string) => switchOf(key).getAttribute("aria-checked");
const isOff = (key: string) =>
  switchOf(key).hasAttribute("data-disabled") ||
  switchOf(key).getAttribute("aria-disabled") === "true";

beforeEach(() => setPlatformPolicy.mockReset());
afterEach(cleanup);

describe("Platform ayarları: two switches on their way at once", () => {
  it("keeps both off until their own answers, and a refusal puts back only its own switch", async () => {
    const approval = deferred<unknown>();
    const recordings = deferred<unknown>();
    setPlatformPolicy.mockImplementation((key: string) =>
      key === APPROVAL ? approval.promise : recordings.promise
    );
    await render(
      <NextIntlClientProvider
        locale="tr"
        timeZone="Europe/Istanbul"
        messages={{ nizam: resources.tr.nizam } as never}
      >
        <PoliciesView
          initial={{
            policies: {
              items: [policy(APPROVAL, false), policy(RECORDINGS, false)],
            },
            scoped: { items: [] },
          }}
        />
      </NextIntlClientProvider>
    );

    await click(label(APPROVAL));
    await click(label(RECORDINGS));
    expect(setPlatformPolicy).toHaveBeenCalledTimes(2);
    expect([isOn(APPROVAL), isOn(RECORDINGS)]).toEqual(["true", "true"]);
    expect([isOff(APPROVAL), isOff(RECORDINGS)]).toEqual([true, true]);

    // The recordings switch is stored; its answer still has the other one as it was.
    recordings.settle({
      success: true,
      data: { items: [policy(APPROVAL, false), policy(RECORDINGS, true)] },
    });
    await settle();
    expect(isOff(APPROVAL)).toBe(true);
    expect(isOff(RECORDINGS)).toBe(false);
    expect([isOn(APPROVAL), isOn(RECORDINGS)]).toEqual(["true", "true"]);

    approval.settle({ success: false, errorBody: { code: "X" } });
    await settle();
    expect([isOn(APPROVAL), isOn(RECORDINGS)]).toEqual(["false", "true"]);
    expect(isOff(APPROVAL)).toBe(false);
  });
});
