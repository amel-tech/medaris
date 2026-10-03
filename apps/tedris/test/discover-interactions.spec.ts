// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDiscoverQuery } from "~/features/discover/discover-query";
import { cleanup, click, render, settle } from "./dom";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
  leave: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
  usePathname: () => "/tr/discover",
}));
vi.mock("~/features/courses/actions", () => ({
  followKosk: mocks.follow,
  unfollowKosk: mocks.unfollow,
  leaveCourse: mocks.leave,
}));
vi.mock("@medaris/ui/components/sonner", () => ({
  toast: { error: mocks.toastError },
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

const labels = {
  follow: "Takip et",
  following: "Takip ediliyor",
  failed: "Olmadı",
};

const mountFollow = async (following: boolean) => {
  const { FollowButton } = await import(
    "~/features/discover/components/follow-button"
  );
  await render(
    createElement(FollowButton, {
      koskId: "k1",
      koskName: "Fatih Köşkü",
      following,
      labels,
    })
  );
  return document.body.querySelector("button") as HTMLButtonElement;
};

describe("the follow button (design tedris/02, criterion 4)", () => {
  it("flips to 'Takip ediliyor' at once and follows, then refreshes the page", async () => {
    let finish: (v: { success: true; data: boolean }) => void = () => {};
    mocks.follow.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const button = await mountFollow(false);
    expect(button.textContent).toBe("Takip et");
    await click(button);
    expect(button.textContent).toContain("Takip ediliyor");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(mocks.follow).toHaveBeenCalledWith("k1");
    // one request while it is out: pressing again does not send a second
    await click(button);
    expect(mocks.follow).toHaveBeenCalledTimes(1);
    await act(async () => finish({ success: true, data: true }));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("unfollows from 'Takip ediliyor'", async () => {
    mocks.unfollow.mockResolvedValue({ success: true, data: true });
    const button = await mountFollow(true);
    await click(button);
    await settle();
    expect(mocks.unfollow).toHaveBeenCalledWith("k1");
    expect(mocks.follow).not.toHaveBeenCalled();
  });

  it("goes back and says so in a toast when the API refuses", async () => {
    mocks.follow.mockResolvedValue({ success: false, error: "403" });
    const button = await mountFollow(false);
    await click(button);
    await settle();
    expect(button.textContent).toBe("Takip et");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toastError).toHaveBeenCalledWith("Olmadı");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("names the köşk for assistive technology", async () => {
    const button = await mountFollow(false);
    expect(button.getAttribute("aria-label")).toBe("Takip et: Fatih Köşkü");
  });
});

const rowLabels = { withdraw: "Başvuruyu geri çek", failed: "Geri çekilemedi" };

const mountRow = async () => {
  const { ApplicationRow } = await import(
    "~/features/courses/components/application-row"
  );
  await render(
    createElement(
      "ul",
      null,
      createElement(ApplicationRow, {
        courseId: "c1",
        courseTitle: "İsâgûcî ile mantığa giriş",
        cover: createElement("span", { className: "cover" }),
        status: createElement("span", null, "Onay bekliyor"),
        labels: rowLabels,
        children: createElement("p", null, "İsâgûcî ile mantığa giriş"),
      })
    )
  );
  return document.body.querySelector("button") as HTMLButtonElement;
};

describe("withdrawing an application (design tedris/20, criterion 4)", () => {
  it("takes the row off the list at once and asks the API to delete the enrollment", async () => {
    mocks.leave.mockResolvedValue({ success: true, data: true });
    const button = await mountRow();
    expect(document.body.querySelectorAll("li")).toHaveLength(1);
    await click(button);
    expect(document.body.querySelectorAll("li")).toHaveLength(0);
    await settle();
    expect(mocks.leave).toHaveBeenCalledWith("c1");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("brings the row back, with a toast, when the API refuses", async () => {
    mocks.leave.mockResolvedValue({ success: false, error: "409" });
    const button = await mountRow();
    await click(button);
    await settle();
    expect(document.body.querySelectorAll("li")).toHaveLength(1);
    expect(mocks.toastError).toHaveBeenCalledWith("Geri çekilemedi");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("names the course on the button", async () => {
    const button = await mountRow();
    expect(button.getAttribute("aria-label")).toBe(
      "Başvuruyu geri çek: İsâgûcî ile mantığa giriş"
    );
  });
});

const filterLabels = {
  filters: "Filtreler",
  search: "Köşk ya da medrese ara",
  searchPlaceholder: "Köşk ya da medrese ara",
  level: "Seviye",
  allLevels: "Bütün seviyeler",
  madrasah: "Medrese",
  allMadrasahs: "Bütün medreseler",
  field: "Alan",
  allFields: "Tümü",
  levelNames: {
    BEGINNER: "Başlangıç",
    INTERMEDIATE: "Orta",
    ADVANCED: "İleri",
  },
};

const mountFilters = async (raw: Record<string, string> = {}) => {
  const { DiscoverFilters } = await import(
    "~/features/discover/components/discover-filters"
  );
  await render(
    createElement(DiscoverFilters, {
      query: parseDiscoverQuery(raw),
      fields: ["Arapça dil ilimleri", "Fıkıh", "Hadis"],
      madrasahs: [{ id: "m1", name: "Süleymaniye Medresesi" }],
      labels: filterLabels,
    })
  );
};

const chip = (name: string) =>
  [...document.body.querySelectorAll("button.mds-chip")].find(
    (b) => b.textContent === name
  ) as HTMLElement;

describe("Keşfet's filters write the address (design tedris/02, criterion 6)", () => {
  it("shows 'Tümü' pressed with no field, and the fields of the köşks as chips", async () => {
    await mountFilters();
    expect(chip("Tümü").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Fıkıh").getAttribute("aria-pressed")).toBe("false");
    expect(chip("Hadis")).toBeTruthy();
  });

  it("pushes the field when a chip is pressed, and starts again at page one", async () => {
    await mountFilters({ page: "3", level: "BEGINNER" });
    await click(chip("Fıkıh"));
    expect(mocks.push).toHaveBeenCalledWith(
      "/tr/discover?level=BEGINNER&field=F%C4%B1k%C4%B1h"
    );
  });

  it("drops the field when the pressed chip is pressed again", async () => {
    await mountFilters({ field: "Fıkıh" });
    expect(chip("Fıkıh").getAttribute("aria-pressed")).toBe("true");
    await click(chip("Fıkıh"));
    expect(mocks.push).toHaveBeenCalledWith("/tr/discover");
  });

  it("searches after a pause in typing, replacing rather than pushing", async () => {
    vi.useFakeTimers();
    try {
      await mountFilters({ level: "ADVANCED" });
      const input = document.body.querySelector(
        'input[type="search"]'
      ) as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      await act(async () => {
        setter?.call(input, " sarf ");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(mocks.replace).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(mocks.replace).toHaveBeenCalledWith(
        "/tr/discover?q=sarf&level=ADVANCED"
      );
      expect(mocks.push).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("searches at once on Enter", async () => {
    await mountFilters();
    const input = document.body.querySelector(
      'input[type="search"]'
    ) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    await act(async () => {
      setter?.call(input, "bina");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(mocks.replace).toHaveBeenCalledWith("/tr/discover?q=bina");
  });

  it("keeps the box in step with the address when the back button changes it", async () => {
    await mountFilters({ q: "nahiv" });
    const input = document.body.querySelector(
      'input[type="search"]'
    ) as HTMLInputElement;
    expect(input.value).toBe("nahiv");
  });
});
