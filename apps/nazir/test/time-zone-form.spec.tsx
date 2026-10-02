// @vitest-environment happy-dom
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeZoneForm } from "~/features/account/components/time-zone-form";
import { cleanup, click, render, settle } from "./dom";

const refresh = vi.fn();
const save = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("~/features/account/actions", () => ({
  updateTimeZone: (zone: string) => save(zone),
}));

const labels = {
  zone: "Saat dilimi",
  help: "Celse saatleri bu saat diliminde gösterilir. Seçtiğiniz an kaydedilir.",
  other: "Diğer…",
  otherZones: "Diğer saat dilimleri",
  saved: "Saat diliminiz kaydedildi.",
  failedTitle: "Saat dilimi kaydedilemedi",
  failed:
    "Seçiminiz kaydedilemedi; önceki saat diliminiz geçerli. Yeniden deneyin.",
};

const mount = (current = "Europe/Istanbul") =>
  render(
    <ToastProvider>
      <TimeZoneForm current={current} labels={labels} />
      <Toaster />
    </ToastProvider>
  );

const triggers = () =>
  [...document.querySelectorAll("button.mds-input")] as HTMLElement[];

/** Opens the select at `index` and picks the option whose text is `label`. */
const choose = async (index: number, label: string) => {
  await click(triggers()[index] as Element);
  await settle(50);
  const option = [...document.querySelectorAll(".mds-option")].find(
    (o) => o.textContent?.trim() === label
  );
  expect(option, label).toBeDefined();
  await click(option as Element);
  await settle(80);
};

beforeEach(() => {
  refresh.mockReset();
  save.mockReset();
  save.mockResolvedValue({ success: true });
});
afterEach(cleanup);

describe("the time zone select (nazir 20)", () => {
  it("shows the saved zone, the help line and no save button", async () => {
    await mount();
    expect(triggers()).toHaveLength(1);
    expect(triggers()[0]?.textContent).toContain("İstanbul");
    expect(document.body.textContent).toContain(labels.help);
    expect(document.querySelector("button[type=submit]")).toBeNull();
    expect(document.body.textContent).not.toContain("Kaydet");
  });

  it("is labelled 'Saat dilimi'", async () => {
    await mount();
    const trigger = triggers()[0] as HTMLElement;
    const label = document.querySelector("label.mds-label");
    expect(label?.textContent).toBe("Saat dilimi");
    expect(trigger.getAttribute("role")).toBe("combobox");
  });

  it("offers the eight course zones and 'Diğer…'", async () => {
    await mount();
    await click(triggers()[0] as Element);
    await settle(50);
    expect(
      [...document.querySelectorAll(".mds-option")].map((o) => o.textContent)
    ).toEqual([
      "İstanbul",
      "Berlin",
      "Amsterdam",
      "Brüksel",
      "Paris",
      "Viyana",
      "Londra",
      "New York",
      "Diğer…",
    ]);
  });

  it("saves the moment a zone is chosen, says so, and refreshes the page's dates", async () => {
    await mount();
    await choose(0, "New York");
    expect(save).toHaveBeenCalledExactlyOnceWith("America/New_York");
    expect(triggers()[0]?.textContent).toContain("New York");
    expect(document.querySelector(".mds-toast")?.textContent).toContain(
      "Saat diliminiz kaydedildi."
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("puts the previous zone back and says so in an error toast when the save fails", async () => {
    save.mockResolvedValue({ success: false });
    await mount();
    await choose(0, "Berlin");
    expect(save).toHaveBeenCalledExactlyOnceWith("Europe/Berlin");
    expect(triggers()[0]?.textContent).toContain("İstanbul");
    const toast = document.querySelector(".mds-toast--error");
    expect(toast?.textContent).toContain("Saat dilimi kaydedilemedi");
    expect(toast?.textContent).toContain("önceki saat diliminiz geçerli");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not save the zone that is already chosen", async () => {
    await mount();
    await choose(0, "İstanbul");
    expect(save).not.toHaveBeenCalled();
  });

  it("opens the full list for 'Diğer…' without saving, and saves what is picked from it", async () => {
    await mount();
    await choose(0, "Diğer…");
    expect(save).not.toHaveBeenCalled();
    expect(triggers()).toHaveLength(2);
    expect(document.querySelectorAll("label.mds-label")[1]?.textContent).toBe(
      "Diğer saat dilimleri"
    );

    await choose(1, "Asia / Tokyo");
    expect(save).toHaveBeenCalledExactlyOnceWith("Asia/Tokyo");
    expect(triggers()[1]?.textContent).toContain("Asia / Tokyo");
  });

  it("starts with the full list open for a saved zone the first list does not have", async () => {
    await mount("Asia/Tokyo");
    expect(triggers()).toHaveLength(2);
    expect(triggers()[0]?.textContent).toContain("Diğer…");
    expect(triggers()[1]?.textContent).toContain("Asia / Tokyo");
  });

  it("goes back to the saved zone when a failed save came from the full list", async () => {
    await mount("Asia/Tokyo");
    save.mockResolvedValue({ success: false });
    await choose(1, "Africa / Cairo");
    expect(triggers()[1]?.textContent).toContain("Asia / Tokyo");
  });

  it("picking a course zone after the full list closes the second select", async () => {
    await mount("Asia/Tokyo");
    await choose(0, "Paris");
    expect(save).toHaveBeenCalledExactlyOnceWith("Europe/Paris");
    expect(triggers()).toHaveLength(1);
    expect(triggers()[0]?.textContent).toContain("Paris");
  });
});
