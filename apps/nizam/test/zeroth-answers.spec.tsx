// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  ZerothAnswerCountsResponse,
  ZerothQuestionExamsResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZerothAnswersView } from "~/features/zeroth-answers/components/zeroth-answers-view";
import {
  parseZerothFilters,
  placeOptions,
  zerothApiQuery,
  zerothFiltersToQuery,
} from "~/features/zeroth-answers/present";
import { cleanup, click, render } from "./dom";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/sifirinci-soru-cevaplari",
}));

const wrap = (ui: ReactElement) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nizam: resources.tr.nizam } as never}
  >
    {ui}
  </NextIntlClientProvider>
);

const K1 = "11111111-1111-4111-8111-111111111111";
const K2 = "22222222-2222-4222-8222-222222222222";
const M1 = "33333333-3333-4333-8333-333333333333";
const C1 = "44444444-4444-4444-8444-444444444444";
const C2 = "55555555-5555-4555-8555-555555555555";
const KEY = "0123456789abcdef0123456789abcdef";

const list: ZerothAnswerCountsResponse = {
  everyKosk: true,
  courses: [
    {
      courseId: C1,
      courseTitle: "Fıkıh Usulü I",
      koskId: K1,
      koskName: "Örnek Köşkü",
      madrasahId: M1,
      madrasahName: "Örnek Medresesi",
    },
    {
      courseId: C2,
      courseTitle: "Akaid",
      koskId: K2,
      koskName: "Başka Köşk",
      madrasahId: null,
      madrasahName: null,
    },
  ],
  questions: [
    {
      questionKey: KEY,
      question: "Bu hadisi ne zaman öğrendiniz?",
      exams: 12,
      answered: 238,
      options: [
        { text: "Bu derste", count: 97 },
        { text: "Daha önce", count: 139 },
        { text: "Hiç duymadım", count: 2 },
      ],
    },
  ],
};

const filters = { from: "2026-08-24", to: "2026-11-22" };

afterEach(async () => {
  await cleanup();
  push.mockReset();
});

describe("the filters of Sıfırıncı soru cevapları (MDRS-299)", () => {
  it("open on the last 90 days in Turkey and drop what they do not know", () => {
    const now = new Date("2026-11-22T22:30:00Z"); // already the 23rd in Istanbul
    expect(parseZerothFilters({ kosk: "nope", question: "x" }, now)).toEqual({
      from: "2026-08-25",
      to: "2026-11-23",
    });
    expect(
      parseZerothFilters(
        { from: "2026-10-01", to: "2026-10-31", kosk: K1, question: KEY },
        now
      )
    ).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      kosk: K1,
      question: KEY,
    });
  });

  it("send the two days from the start of the first to the end of the last, and a köşk page's köşk", () => {
    expect(zerothApiQuery({ ...filters, kosk: K2, course: C1 }, K1)).toEqual({
      from: new Date("2026-08-24T00:00:00+03:00"),
      to: new Date("2026-11-22T23:59:59.999+03:00"),
      koskId: K1,
      courseId: C1,
    });
    expect(zerothFiltersToQuery({ ...filters, madrasah: M1 })).toBe(
      `from=2026-08-24&to=2026-11-22&madrasah=${M1}`
    );
  });

  it("narrow the medrese and the course to the köşk chosen", () => {
    const places = placeOptions(list.courses, { kosk: K2 });
    expect(places.kosks.map((k) => k.label)).toEqual([
      "Başka Köşk",
      "Örnek Köşkü",
    ]);
    expect(places.madrasahs).toEqual([]);
    expect(places.courses).toEqual([{ value: C2, label: "Akaid" }]);
  });
});

describe("the page", () => {
  it("says every count as it is, small ones included, with its percentage", async () => {
    const root = await render(
      wrap(
        <ZerothAnswersView
          kosk={null}
          filters={filters}
          list={list}
          detail={null}
        />
      )
    );
    const text = root.textContent ?? "";
    expect(text).toContain("12 sınavda soruldu");
    expect(text).toContain("238 talebe cevapladı");
    expect(text).toContain("Bu derste: 97 talebe (%41)");
    expect(text).toContain("Daha önce: 139 talebe (%58)");
    expect(text).toContain("Hiç duymadım: 2 talebe (%1)");
    expect(text).not.toContain("5'ten az");
    expect(text).not.toContain("gizlendi");
    const hadith = root.querySelector("[lang=ar]") as HTMLElement;
    expect(hadith.getAttribute("dir")).toBe("rtl");
    expect(text).toContain("Bütün köşkler");
  });

  it("keeps a köşk nazımı's page on their köşk, and Uygula moves to the address without it", async () => {
    const root = await render(
      wrap(
        <ZerothAnswersView
          kosk={{ id: K1, name: "Örnek Köşkü" }}
          filters={filters}
          list={{ ...list, everyKosk: false }}
          detail={null}
        />
      )
    );
    expect(root.textContent).not.toContain("Bütün köşkler");
    const apply = [...root.querySelectorAll("button")].find(
      (b) => b.textContent === "Uygula"
    ) as HTMLButtonElement;
    await click(apply);
    expect(push).toHaveBeenCalledWith(
      "/sifirinci-soru-cevaplari?from=2026-08-24&to=2026-11-22"
    );
  });

  it("opens a question's exams by its key, and shows each exam's row as it is", async () => {
    const root = await render(
      wrap(
        <ZerothAnswersView
          kosk={null}
          filters={filters}
          list={list}
          detail={null}
        />
      )
    );
    const open = [...root.querySelectorAll("button")].find(
      (b) => b.textContent === "Sınavlar"
    ) as HTMLButtonElement;
    expect(open.getAttribute("aria-label")).toBe(
      "Bu hadisi ne zaman öğrendiniz? sorusunu soran sınavlar"
    );
    await click(open);
    expect(push).toHaveBeenCalledWith(
      `/sifirinci-soru-cevaplari?from=2026-08-24&to=2026-11-22&question=${KEY}`
    );
    await cleanup();

    const detail: ZerothQuestionExamsResponse = {
      questionKey: KEY,
      question: "Bu hadisi ne zaman öğrendiniz?",
      answered: 23,
      options: [
        { text: "Bu derste", count: 13 },
        { text: "Daha önce", count: 10 },
      ],
      exams: [
        {
          examId: "e1",
          courseTitle: "Akaid",
          koskName: "Başka Köşk",
          startsAt: new Date("2026-11-20T17:00:00Z"),
          answered: 15,
          options: [7, 8],
        },
        {
          examId: "e2",
          courseTitle: "Fıkıh Usulü I",
          koskName: "Örnek Köşkü",
          startsAt: new Date("2026-11-16T17:00:00Z"),
          answered: 8,
          options: [6, 2],
        },
      ],
    };
    const page = await render(
      wrap(
        <ZerothAnswersView
          kosk={null}
          filters={{ ...filters, question: KEY }}
          list={list}
          detail={detail}
        />
      )
    );
    const rows = [...page.querySelectorAll("tbody tr")].map(
      (r) => r.textContent
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("Fıkıh Usulü I");
    expect(rows[1]).toContain("Daha önce: 2 talebe (%25)");
    expect(page.textContent).toContain("Bu derste: 13 talebe (%57)");
    const back = [...page.querySelectorAll("button")].find(
      (b) => b.textContent === "Sorulara dön"
    ) as HTMLButtonElement;
    await click(back);
    expect(push).toHaveBeenLastCalledWith(
      "/sifirinci-soru-cevaplari?from=2026-08-24&to=2026-11-22"
    );
  });

  it("says when no exam of the span asks the question any more", async () => {
    const root = await render(
      wrap(
        <ZerothAnswersView
          kosk={null}
          filters={{ ...filters, question: KEY }}
          list={list}
          detail="gone"
        />
      )
    );
    expect(root.querySelector("output")?.textContent).toBe(
      "Bu soruyu bu aralıkta soran sınav artık yok; liste olduğu gibi kaldı."
    );
  });

  it("does not send a span whose start is after its end, and says so under the end", async () => {
    const root = await render(
      wrap(
        <ZerothAnswersView
          kosk={null}
          filters={{ from: "2026-11-22", to: "2026-11-01" }}
          list={list}
          detail={null}
        />
      )
    );
    const apply = [...root.querySelectorAll("button")].find(
      (b) => b.textContent === "Uygula"
    ) as HTMLButtonElement;
    await click(apply);
    expect(push).not.toHaveBeenCalled();
    expect(root.textContent).toContain("Başlangıç, bitişten sonra olamaz.");
  });

  it("says a question's exams could not be read, with a retry, instead of showing the list", async () => {
    const root = await render(
      wrap(
        <ZerothAnswersView
          kosk={null}
          filters={{ ...filters, question: KEY }}
          list={list}
          detail={null}
        />
      )
    );
    const text = root.textContent ?? "";
    expect(text).toContain("Bu sorunun sınavları okunamadı");
    expect(text).not.toContain("12 sınavda soruldu");
    const retry = [...root.querySelectorAll("button")].find(
      (b) => b.textContent === "Yeniden dene"
    );
    expect(retry).toBeTruthy();
  });
});
