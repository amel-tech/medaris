import { resources } from "@medaris/i18n";
import type { PendingEnrollmentResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApplicationsTable } from "~/features/applications/components/applications-table";
import {
  type ApplicationRow,
  actionLabel,
  courseChoices,
  decisionErrorKey,
  filterApplications,
  type Messages,
  rowKey,
  sortByDate,
  toRow,
} from "~/features/applications/present";

const dict = resources.tr.nizam.ApplicationsPage as Record<string, unknown>;
const t: Messages = (key, values) =>
  Object.entries(values ?? {}).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    String(
      key
        .split(".")
        .reduce<unknown>(
          (n, part) => (n as Record<string, unknown>)?.[part],
          dict
        )
    )
  );

const row = (over: Partial<ApplicationRow>): ApplicationRow => ({
  userId: "u1",
  courseId: "c1",
  name: "Rümeysa Nur Karaca",
  email: "rumeysa.karaca@example.com",
  courseTitle: "Bina ve İzhar Şerhi",
  muderris: ["Mehmet Emin Işıkoğlu"],
  createdAt: "2026-10-02T07:02:00.000Z",
  ...over,
});

const rows = [
  row({}),
  row({
    userId: "u2",
    courseId: "c2",
    name: "Muhammed Said Özdemiroğlu",
    email: "said.ozdemiroglu@example.com",
    courseTitle: "Avâmil ve Tasrîf",
    createdAt: "2026-10-01T19:40:00.000Z",
  }),
  row({
    userId: "u3",
    courseId: "c1",
    name: "Ömer Faruk Demirkaya",
    email: "omerfaruk.demirkaya@example.com",
    createdAt: "2026-09-29T15:05:00.000Z",
  }),
];

describe("the course filter, the search and the count (nizam 31)", () => {
  it("keeps every row for 'all' and only the chosen course's otherwise", () => {
    expect(filterApplications(rows, "all", "")).toHaveLength(3);
    expect(filterApplications(rows, "c1", "").map((r) => r.userId)).toEqual([
      "u1",
      "u3",
    ]);
  });

  it("searches name and address the way Turkish is typed: no case, no diacritics", () => {
    expect(
      filterApplications(rows, "all", "OMER").map((r) => r.userId)
    ).toEqual(["u3"]);
    expect(
      filterApplications(rows, "all", "özdemir").map((r) => r.userId)
    ).toEqual(["u2"]);
    expect(
      filterApplications(rows, "all", "ozdemiroglu@example").map(
        (r) => r.userId
      )
    ).toEqual(["u2"]);
    expect(filterApplications(rows, "all", "yok böyle biri")).toEqual([]);
  });

  it("combines both, and the count is the list's own length", () => {
    const visible = filterApplications(rows, "c1", "faruk");
    expect(visible).toHaveLength(1);
    expect(t("count", { count: visible.length })).toBe("1 başvuru bekliyor");
  });

  it("offers the courses that have an application, once each, in first-seen order", () => {
    expect(courseChoices(rows)).toEqual([
      { id: "c1", title: "Bina ve İzhar Şerhi" },
      { id: "c2", title: "Avâmil ve Tasrîf" },
    ]);
  });

  it("sorts by the date, newest first or oldest first", () => {
    expect(sortByDate(rows, "descending").map((r) => r.userId)).toEqual([
      "u1",
      "u2",
      "u3",
    ]);
    expect(sortByDate(rows, "ascending").map((r) => r.userId)).toEqual([
      "u3",
      "u2",
      "u1",
    ]);
  });

  it("keys a row by course and talebe: one talebe may wait on two courses", () => {
    expect(rowKey(rows[0] as ApplicationRow)).not.toBe(
      rowKey(row({ courseId: "c9" }))
    );
  });
});

describe("a row's words", () => {
  it("names each button by the talebe and the course", () => {
    expect(actionLabel("approve", rows[0] as ApplicationRow, t)).toBe(
      "Onayla: Rümeysa Nur Karaca, Bina ve İzhar Şerhi"
    );
    expect(actionLabel("reject", rows[0] as ApplicationRow, t)).toBe(
      "Reddet: Rümeysa Nur Karaca, Bina ve İzhar Şerhi"
    );
  });

  it("falls back to a name when the account has none", () => {
    const pending = {
      userId: "u9",
      courseId: "c1",
      studentName: "  ",
      studentEmail: null,
      progress: 0,
      status: "PENDING",
      createdAt: new Date("2026-10-02T07:02:00Z"),
      updatedAt: new Date("2026-10-02T07:02:00Z"),
      courseTitle: "Bina",
    } as PendingEnrollmentResponse;
    expect(toRow(pending, [], "İsimsiz talebe").name).toBe("İsimsiz talebe");
  });

  it("tells a refusal from a decision someone else already made", () => {
    expect(decisionErrorKey({ code: "AUTHZ_FORBIDDEN" })).toBe(
      "errorForbidden"
    );
    expect(decisionErrorKey({ statusCode: 403 })).toBe("errorForbidden");
    expect(decisionErrorKey({ code: "ENROLLMENT_NOT_FOUND" })).toBe(
      "errorGone"
    );
    expect(decisionErrorKey({ code: "ENROLLMENT_STATE_CONFLICT" })).toBe(
      "errorGone"
    );
    expect(decisionErrorKey({ statusCode: 404 })).toBe("errorGone");
    expect(decisionErrorKey({ statusCode: 500 })).toBe("errorUnknown");
    expect(decisionErrorKey(undefined)).toBe("errorUnknown");
  });
});

const render = (props: Partial<Parameters<typeof ApplicationsTable>[0]>) =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale="tr"
      messages={{ nizam: resources.tr.nizam }}
      timeZone="Europe/Istanbul"
    >
      <ApplicationsTable
        variant="kosk"
        rows={rows}
        caption="Derslere onay bekleyen başvurular"
        empty="Bekleyen başvuru yok"
        busyKey={null}
        sort={{ key: "date", direction: "descending" }}
        onSortChange={() => undefined}
        onDecide={() => undefined}
        {...props}
      />
    </NextIntlClientProvider>
  );

describe("the table (nizam 31, 57)", () => {
  it("lists the talebe, course, date and the two buttons, each named for its row", () => {
    const html = render({});
    expect(html).toContain("Rümeysa Nur Karaca");
    expect(html).toContain("rumeysa.karaca@example.com");
    expect(html).toContain("Bina ve İzhar Şerhi");
    expect(html).toContain("Mehmet Emin Işıkoğlu");
    expect(html).toContain(
      'aria-label="Onayla: Rümeysa Nur Karaca, Bina ve İzhar Şerhi"'
    );
    expect(html).toContain(
      'aria-label="Reddet: Muhammed Said Özdemiroğlu, Avâmil ve Tasrîf"'
    );
    expect(html).toContain('aria-sort="descending"');
  });

  it("gives a course tab its own address column and no course column", () => {
    const html = render({ variant: "course" });
    expect(html).toContain(">E-posta<");
    expect(html).not.toContain(">Ders<");
  });

  it("disables only the acting row's buttons", () => {
    const html = render({ busyKey: rowKey(rows[1] as ApplicationRow) });
    const disabled = html.match(/<button[^>]*disabled=""[^>]*>/g) ?? [];
    expect(disabled).toHaveLength(2);
    for (const b of disabled) expect(b).toContain("Muhammed Said");
  });

  it("says so when there is nothing to decide", () => {
    expect(render({ rows: [] })).toContain("Bekleyen başvuru yok");
  });
});
