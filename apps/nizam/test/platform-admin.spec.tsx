import { resources } from "@medaris/i18n";
import type {
  AuditPageResponse,
  CourseRequestListResponse,
  KoskApplicationListResponse,
  PlatformPolicyListResponse,
  ScopedPolicyListResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplicationsView } from "~/features/platform-admin/components/applications-view";
import { AuditView } from "~/features/platform-admin/components/audit-view";
import { CourseRequestsView } from "~/features/platform-admin/components/course-requests-view";
import { PoliciesView } from "~/features/platform-admin/components/policies-view";
import {
  type AuditFilters,
  auditApiQuery,
  auditDetail,
  auditExportHref,
  auditFiltersToQuery,
  auditTime,
  errorCode,
  failureKey,
  fieldLabel,
  isBlank,
  isSettled,
  newCourseHref,
  openFormFromApplication,
  parseAuditFilters,
  phoneOrNull,
  recordNumber,
  shortName,
  withPolicy,
} from "~/features/platform-admin/present";

// The server actions reach for the session and the API; none runs in a render.
vi.mock("~/features/platform-admin/actions", () => ({
  loadKoskApplications: vi.fn(),
  loadKoskApplication: vi.fn(),
  approveKoskApplication: vi.fn(),
  rejectKoskApplication: vi.fn(),
  loadAuditPage: vi.fn(),
  setPlatformPolicy: vi.fn(),
  loadCourseRequests: vi.fn(),
  acceptCourseRequest: vi.fn(),
  rejectCourseRequest: vi.fn(),
}));
vi.mock("~/features/kosks/admin-actions", () => ({ openKosk: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tr/denetim-kaydi",
}));

const render = (ui: React.ReactElement, locale: "tr" | "en" | "ar" = "tr") =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources[locale].nizam } as never}
    >
      {ui}
    </NextIntlClientProvider>
  );

const OPTS = { locale: "tr", timeZone: "Europe/Istanbul" };

describe("answers", () => {
  it("knows the codes tedrisat answers with, and which ones mean the row is settled", () => {
    expect(errorCode({ code: "X" })).toBe("X");
    expect(errorCode("nope")).toBeNull();
    expect(failureKey({ code: "KOSK_APPLICATION_DECIDED" })).toBe(
      "errors.answered"
    );
    expect(failureKey({ code: "PLATFORM_POLICY_LOCKED" })).toBe(
      "errors.locked"
    );
    expect(failureKey({ code: "COURSE_REQUEST_FORBIDDEN" })).toBe(
      "errors.forbidden"
    );
    expect(failureKey(undefined)).toBe("errors.generic");
    expect(failureKey({ code: "NOPE" })).toBe("errors.generic");
    expect(isSettled({ code: "COURSE_REQUEST_NOT_PENDING" })).toBe(true);
    expect(isSettled({ code: "KOSK_APPLICATION_NOT_FOUND" })).toBe(true);
    expect(isSettled({ code: "AUTHZ_FORBIDDEN" })).toBe(false);
    expect(isBlank("  \n")).toBe(true);
  });
});

describe("köşk applications (nizam 15)", () => {
  it("says 'Verilmedi' for a missing phone, and only then", () => {
    expect(phoneOrNull(null)).toBeNull();
    expect(phoneOrNull("  ")).toBeNull();
    expect(phoneOrNull("+90 532 000 00 00")).toBe("+90 532 000 00 00");
  });

  it("spells a field code, and fills the form from the application without its field", () => {
    expect(fieldLabel("USUL_AL_FIQH")).toBe("Fıkıh usûlü");
    expect(fieldLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(
      openFormFromApplication({
        name: "Davutpaşa Köşkü",
        summary: "Fıkıh dersleri.",
      })
    ).toEqual({
      name: "Davutpaşa Köşkü",
      description: "Fıkıh dersleri.",
    });
  });

  const list: KoskApplicationListResponse = {
    pendingCount: 3,
    decidedCount: 2,
    items: [
      {
        id: "a1",
        name: "Davutpaşa Köşkü",
        field: "FIQH",
        applicantName: "Hatice Yıldırım",
        status: "PENDING",
        createdAt: new Date("2026-09-29T18:10:00Z"),
        decidedAt: null,
      },
    ],
  };

  it("shows both tab counts and the waiting list, with no contact detail before one is chosen", () => {
    const html = render(<ApplicationsView initial={list} />);
    expect(html).toContain("Köşk başvuruları");
    expect(html).toContain("Bekleyen");
    expect(html).toContain("Karara bağlanan");
    expect(html).toContain("Davutpaşa Köşkü");
    expect(html).toContain("Fıkıh · ");
    expect(html).toContain("Hatice Yıldırım");
    expect(html).toContain("29 Eyl 21:10");
    expect(html).not.toContain("@");
  });

  it("shows an empty state, and a retry when the first read failed", () => {
    expect(
      render(
        <ApplicationsView
          initial={{ ...list, items: [], pendingCount: 0, decidedCount: 0 }}
        />
      )
    ).toContain("Karar bekleyen köşk başvurusu yok.");
    const failed = render(<ApplicationsView initial={null} />);
    expect(failed).toContain("Başvurular okunamadı");
    expect(failed).toContain("Tekrar dene");
  });
});

describe("the audit log (nizam 17)", () => {
  it("turns the URL into filters, dropping what is unknown", () => {
    expect(
      parseAuditFilters({
        actor: " ayşe ",
        type: "BAN",
        scope: "KOSK",
        range: "custom",
        from: "2026-09-01",
        to: "not-a-day",
      })
    ).toEqual({
      actor: "ayşe",
      type: "BAN",
      scope: "KOSK",
      range: "custom",
      from: "2026-09-01",
    });
    expect(
      parseAuditFilters({
        type: "NOPE",
        scope: "SPACE",
        range: "1y",
        from: "2026-09-01",
      })
    ).toEqual({
      actor: undefined,
      type: undefined,
      scope: undefined,
      range: undefined,
    });
    expect(parseAuditFilters({ type: ["EXPORT", "BAN"] }).type).toBe("EXPORT");
    // A refused self-grant is its own kind on the audit page (MDRS-135).
    expect(parseAuditFilters({ type: "SELF_GRANT_REFUSED" }).type).toBe(
      "SELF_GRANT_REFUSED"
    );
  });

  it("writes filters back in a stable order without empty keys", () => {
    const filters: AuditFilters = {
      type: "BAN",
      actor: "ayşe",
      range: "7d",
    };
    expect(auditFiltersToQuery(filters)).toBe(
      "actor=ay%C5%9Fe&type=BAN&range=7d"
    );
    expect(auditFiltersToQuery({})).toBe("");
    expect(auditExportHref({})).toBe("/api/audit-log/export");
    expect(auditExportHref({ type: "EXPORT" })).toBe(
      "/api/audit-log/export?type=EXPORT"
    );
  });

  it("asks the API for a window: presets reach back from now, a picked range is a Turkish day", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    expect(auditApiQuery({ range: "24h" }, now).from).toEqual(
      new Date("2026-10-02T12:00:00Z")
    );
    expect(auditApiQuery({ range: "7d" }, now).from).toEqual(
      new Date("2026-09-26T12:00:00Z")
    );
    expect(auditApiQuery({ range: "30d" }, now).from).toEqual(
      new Date("2026-09-03T12:00:00Z")
    );
    expect(
      auditApiQuery(
        { range: "custom", from: "2026-09-01", to: "2026-09-02" },
        now
      )
    ).toEqual({
      from: new Date("2026-08-31T21:00:00Z"),
      to: new Date("2026-09-02T20:59:59.999Z"),
    });
    expect(
      auditApiQuery({ type: "BAN", scope: "KOSK", actor: "x" }, now)
    ).toEqual({
      type: "BAN",
      scope: "KOSK",
      actor: "x",
    });
    expect(auditApiQuery({}, now)).toEqual({});
  });

  it("calls a day 'Bugün' or 'Dün' and otherwise gives the date", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    expect(auditTime("2026-10-03T06:10:00Z", now, OPTS)).toMatchObject({
      day: "today",
      time: "09:10",
    });
    expect(auditTime("2026-10-02T06:03:00Z", now, OPTS)).toMatchObject({
      day: "yesterday",
      time: "09:03",
    });
    expect(auditTime("2026-09-29T18:10:00Z", now, OPTS)).toEqual({
      day: null,
      date: "29 Eyl",
      time: "21:10",
    });
  });

  it("numbers a record, names its detail and shortens a person", () => {
    expect(recordNumber(12)).toBe("#12");
    expect(auditDetail({ name: "Fatih Köşkü" })).toBe("Fatih Köşkü");
    expect(auditDetail({ title: "Emsile", name: " " })).toBe("Emsile");
    expect(auditDetail({ n: 3 })).toBeNull();
    expect(auditDetail({ reason: "x".repeat(200) })?.length).toBe(90);
    expect(shortName("Ayşe Nur Kılıçarslan")).toBe("AK");
    expect(shortName("Hasan")).toBe("HA");
    expect(shortName(null)).toBe("?");
  });

  const page: AuditPageResponse = {
    nextCursor: "next",
    items: [
      {
        id: "r1",
        number: 12,
        createdAt: new Date("2026-09-29T18:10:00Z"),
        actor: { id: "u1", name: "Ayşe Nur Kılıçarslan", role: "KOSK_NAZIM" },
        type: "BAN",
        action: "ban.create",
        details: { name: "Talebe Bir" },
        scope: { kind: "KOSK", id: "k1", name: "Nûruosmaniye Köşkü" },
      },
    ],
  };

  it("draws the table, the export, the filters and the retention placeholder", () => {
    const html = render(<AuditView filters={{ type: "BAN" }} initial={page} />);
    expect(html).toContain("Denetim kaydı");
    expect(html).toContain("#12");
    expect(html).toContain("Ayşe Nur Kılıçarslan");
    expect(html).toContain("Köşk nâzımı");
    expect(html).toContain("Yasak ve yasak kaldırma");
    expect(html).toContain("Talebe Bir");
    expect(html).toContain("Nûruosmaniye Köşkü");
    expect(html).toContain('href="/api/audit-log/export?type=BAN"');
    expect(html).toContain("Daha eskileri göster");
    expect(html).toContain("[KVKK saklama süresi]");
    expect(html).toContain("bu kaydı göremez");
  });

  it("names the başnazım by that role, not by a köşk role", () => {
    const first = page.items[0];
    if (!first) throw new Error("fixture");
    const html = render(
      <AuditView
        filters={{}}
        initial={{
          ...page,
          items: [
            {
              ...first,
              actor: { ...first.actor, role: "SYSTEM_ADMIN" },
            },
          ],
        }}
      />
    );
    expect(html).toContain("Medaris başnazımı");
  });

  it("hides 'Daha eskileri göster' at the end, and says so when nothing matches", () => {
    const end = render(
      <AuditView filters={{}} initial={{ ...page, nextCursor: null }} />
    );
    expect(end).not.toContain("Daha eskileri göster");
    expect(
      render(
        <AuditView filters={{}} initial={{ items: [], nextCursor: null }} />
      )
    ).toContain("Bu süzgeçlere uyan kayıt yok.");
    const failed = render(<AuditView filters={{}} initial={null} />);
    expect(failed).toContain("Kayıt okunamadı");
  });
});

describe("platform settings (nizam 19)", () => {
  it("moves one switch and leaves the other", () => {
    const items = [
      { key: "A", enabled: false },
      { key: "B", enabled: true },
    ];
    expect(withPolicy(items, "A", true)).toEqual([
      { key: "A", enabled: true },
      { key: "B", enabled: true },
    ]);
    expect(items[0]?.enabled).toBe(false);
  });

  const settings: {
    policies: PlatformPolicyListResponse;
    scoped: ScopedPolicyListResponse;
  } = {
    policies: {
      items: [
        {
          key: "ALWAYS_REQUIRE_APPROVAL",
          enabled: true,
          changedBy: { id: "u1", name: "Baş Nazım" },
          changedAt: new Date("2026-09-29T18:10:00Z"),
          ownScopes: ["Süleymaniye Medresesi"],
        },
        {
          key: "RECORDINGS_NEVER_PUBLIC",
          enabled: false,
          changedBy: null,
          changedAt: null,
          ownScopes: [],
        },
      ],
    },
    scoped: {
      items: [
        {
          scope: { kind: "KOSK", id: "k1", name: "Üsküdar Köşkü" },
          key: "RECORDINGS_NEVER_PUBLIC",
          openedBy: { id: "u2", name: "Ali Nazım" },
          openedAt: new Date("2026-09-30T08:00:00Z"),
        },
      ],
    },
  };

  it("draws both switches, who applies one on their own, the five steps and the table", () => {
    const html = render(<PoliciesView initial={settings} />);
    expect(html).toContain("Kayıt her zaman onaylı");
    expect(html).toContain("Ders kayıtları herkese açılamaz");
    expect(html).toContain("Kendi kapsamında uygulayan: Süleymaniye Medresesi");
    expect(html).toContain("Her değişiklik anında geçerli olur");
    expect(html).toContain("Politikalar nasıl birleşir");
    expect(html).toContain(
      "Üst kademenin verdiği izin, alttaki politikayı aşar"
    );
    expect(html).toContain("Rolün varsayılanı ve aldığı izinler");
    expect(html).toContain("Ders politikası");
    expect(html).toContain("Dersin kendi ayarları; son daraltma.");
    expect(html).toContain(
      "Örneğin sizin bir Medaris nazımına verdiğiniz izin"
    );
    expect(html).toContain("Üsküdar Köşkü");
    expect(html).toContain("Ali Nazım");
    expect(html).toContain("30 Eyl 11:00");
    // the first switch is on, the second off
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(1);
  });

  it("says so when no köşk applies a policy, and shows a retry when the read failed", () => {
    expect(
      render(<PoliciesView initial={{ ...settings, scoped: { items: [] } }} />)
    ).toContain("Kendi politikasını uygulayan köşk ya da medrese yok.");
    expect(render(<PoliciesView initial={null} />)).toContain(
      "Ayarlar okunamadı"
    );
  });
});

describe("course requests (nizam 39)", () => {
  it("opens the course form with the request named in the query", () => {
    expect(newCourseHref("k1", "q1")).toBe("/kosks/k1/courses/new?talep=q1");
  });

  const list: CourseRequestListResponse = {
    pendingCount: 1,
    decidedCount: 4,
    items: [
      {
        id: "q1",
        title: "Usûl-i Fıkıh Okumaları",
        reason: "Medresemizde yer yok.",
        status: "PENDING",
        kosk: { id: "k1", name: "Nûruosmaniye Köşkü" },
        madrasah: { id: "m1", name: "Süleymaniye Medresesi" },
        requestedBy: { id: "u1", name: "Ömer Başmüderris" },
        createdAt: new Date("2026-09-29T18:10:00Z"),
        decidedAt: null,
        rejectReason: null,
        courseId: null,
      },
    ],
  };

  it("lists the request with its medrese and sender and counts both tabs", () => {
    const html = render(<CourseRequestsView koskId="k1" initial={list} />);
    expect(html).toContain("Ders talepleri");
    expect(html).toContain("Usûl-i Fıkıh Okumaları");
    expect(html).toContain("Süleymaniye Medresesi");
    expect(html).toContain("Ömer Başmüderris");
    expect(html).toContain("MEDRESE DIŞI DERS TALEBİ");
    expect(html).toContain("Medresemizde yer yok.");
    expect(html).toContain("Kabul et");
    expect(html).toContain("Reddet");
    expect(html).toContain("Karara bağlanan");
  });

  it("is empty and failed as the design says", () => {
    expect(
      render(
        <CourseRequestsView
          koskId="k1"
          initial={{ ...list, items: [], pendingCount: 0 }}
        />
      )
    ).toContain("Karar bekleyen ders talebi yok.");
    expect(render(<CourseRequestsView koskId="k1" initial={null} />)).toContain(
      "Talepler okunamadı"
    );
  });
});

describe("the messages", () => {
  const keysOf = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value).flatMap(([k, v]) =>
          keysOf(v, prefix ? `${prefix}.${k}` : k)
        )
      : [prefix];

  it.each([
    "KoskApplicationsPage",
    "AuditPage",
    "PlatformSettingsPage",
    "CourseRequestsPage",
    "DeckReject",
  ] as const)("%s carries the same keys in Turkish, English and Arabic", (ns) => {
    const tr = keysOf(resources.tr.nizam[ns]).sort();
    expect(keysOf(resources.en.nizam[ns]).sort()).toEqual(tr);
    expect(keysOf(resources.ar.nizam[ns]).sort()).toEqual(tr);
  });
});
