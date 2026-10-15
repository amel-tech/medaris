import { resources } from "@medaris/i18n";
import type {
  GrantResponse,
  KoskDashboardResponse,
  KoskDashboardSessionResponse,
  NizamDashboardResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { KoskHome } from "~/features/dashboard/components/kosk-home";
import { MedarisHome } from "~/features/dashboard/components/medaris-home";

// The server actions reach for the session and the API, and the router needs
// a mounted app; none of them runs in a render.
vi.mock("~/features/dashboard/actions", () => ({ loadKoskSessions: vi.fn() }));
vi.mock("~/features/kosks/actions/courses", () => ({
  approveEnrollment: vi.fn(),
  rejectEnrollment: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: vi.fn(), dismiss: vi.fn() }),
}));

const IST = "Europe/Istanbul";
const NOW = "2026-10-03T07:00:00.000Z";

const render = (ui: React.ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale="tr"
      timeZone={IST}
      messages={
        { common: resources.tr.common, nizam: resources.tr.nizam } as never
      }
    >
      {ui}
    </NextIntlClientProvider>
  );

const chief: NizamDashboardResponse = {
  viewer: "CHIEF",
  greetingName: "Yusuf Ziya",
  can: { openKosk: true },
  pendingTotals: {
    koskApplications: 3,
    deckPublishRequests: 2,
    appeals: 0,
    permanentBanRequests: 0,
  },
  platformCounts: {
    kosk: 4,
    unlistedKosk: 1,
    madrasah: 2,
    inactiveMadrasah: 1,
    course: 10,
    inactiveCourse: 1,
    enrolledStudents: 241,
  },
  latestApplications: [
    {
      id: "a1",
      name: "Davutpaşa Köşkü",
      field: "AQEEDAH_KALAM",
      applicantName: "Ömer Nasuhi Bilmenoğlu",
      createdAt: new Date("2026-10-03T05:45:00Z"),
    },
  ],
  latestDeckRequests: [
    {
      id: "d1",
      title: "Mehmûz fiiller",
      ownerName: "Zeynep Betül Karahanlı",
      cardCount: 18,
      requestedAt: new Date("2026-09-29T18:10:00Z"),
    },
  ],
  inactiveScopes: [
    {
      type: "MADRASAH",
      id: "m1",
      name: "Zeyrek Medresesi",
      reason: "EXPIRED",
      since: new Date("2026-09-27T09:00:00Z"),
    },
    {
      type: "COURSE",
      id: "c1",
      name: "Kasîde-i Bürde şerhi",
      koskName: "Beyazıt Köşkü",
      reason: "REMOVED",
      since: new Date("2026-09-30T09:00:00Z"),
    },
  ],
  inactiveScopeCount: 2,
  latestBans: [
    {
      id: "b1",
      userName: "Kerem Ali Yazıcı",
      scope: "COURSE",
      courseTitle: "Emsile ve Bina",
      koskName: "Nûruosmaniye Köşkü",
      bannedByName: "Abdülhamit Karaosmanoğlu",
      reason: "Celselerde başka talebelere hakaret.",
      createdAt: new Date("2026-10-03T07:40:00Z"),
    },
  ],
};

describe("the başnazım's home page (nizam 01)", () => {
  const html = render(<MedarisHome data={chief} grants={null} nowIso={NOW} />);

  it("greets by name and adds the queues: 3 + 2 + 0 + 0 = 5", () => {
    expect(html).toContain("Selâmün aleyküm, Yusuf Ziya Bey.");
    expect(html).toContain("Karar bekleyen 5 talep var.");
  });

  it("warns about the two passive scopes by name (criterion 3)", () => {
    expect(html).toContain("İki kapsamın yöneticisi yok");
    expect(html).toContain("Zeyrek Medresesi, Kasîde-i Bürde şerhi pasif");
  });

  it("draws the four numbers with their notes and links", () => {
    expect(html).toContain("Biri listelenmeyen");
    expect(html).toContain("Köşklere git");
    expect(html).toContain("Medreselere git");
    expect(html).toContain(">241<");
    expect(html).toContain("Kayıtlı talebe");
  });

  it("draws the cards with the dates of the design and a button that goes to the right record", () => {
    expect(html).toContain("Davutpaşa Köşkü");
    expect(html).toContain("Akaid ve kelâm");
    expect(html).toContain("Bugün 08:45");
    expect(html).toContain("18 ezber kartı");
    expect(html).toContain("29 Eyl 21:10");
    expect(html).toContain("/tr/talepler/kosk-basvurulari?secili=a1");
    expect(html).toContain("/tr/talepler/deste-yayin-istekleri?secili=d1");
    expect(html).toContain("Başmüderris ata");
    expect(html).toContain("Hoca ata");
    expect(html).toContain("Ders yasağı: Emsile ve Bina");
    expect(html).toContain("koyan Abdülhamit Karaosmanoğlu");
    expect(html).toContain("Gerekçe: Celselerde başka talebelere hakaret.");
    expect(html).toContain("Yasaklamalar’a git");
  });

  it("offers Köşk aç, which opens the form on the Köşkler page", () => {
    expect(html).toContain("/tr/kosks?ac=1");
  });

  it("leaves out the alert and says so when nothing is passive (criterion 3)", () => {
    const none = render(
      <MedarisHome
        data={{ ...chief, inactiveScopes: [], inactiveScopeCount: 0 }}
        grants={null}
        nowIso={NOW}
      />
    );
    expect(none).not.toContain("yöneticisi yok");
    expect(none).toContain("Yöneticisiz kapsam yok.");
  });

  it("keeps a card when its list is empty and says why (criterion 5)", () => {
    const empty = render(
      <MedarisHome
        data={{
          ...chief,
          latestApplications: [],
          latestDeckRequests: [],
          latestBans: [],
        }}
        grants={null}
        nowIso={NOW}
      />
    );
    expect(empty).toContain("Köşk başvuruları");
    expect(empty).toContain("Bekleyen köşk başvurusu yok.");
    expect(empty).toContain("Bekleyen deste yayın isteği yok.");
    expect(empty).toContain("Açık yasak yok.");
  });
});

const grants: GrantResponse[] = [
  {
    id: "g1",
    scopeType: "platform",
    group: {
      id: "grp",
      name: "Köşk işleri",
      permissions: ["platform.kosk_create", "platform.kosk_edit"],
    },
    grantedAt: new Date("2026-09-14T09:00:00Z"),
    expiresAt: new Date("2026-12-31T20:59:59Z"),
    grantedBy: { id: "c", displayName: "Yusuf Ziya Ertuğrul" },
    grantedBySelf: false,
  },
  {
    id: "g2",
    scopeType: "platform",
    permission: "platform.deck_publish",
    grantedAt: new Date("2026-09-14T09:00:00Z"),
    grantedBy: { id: "c", displayName: "Yusuf Ziya Ertuğrul" },
    grantedBySelf: false,
  },
];

describe("a Medaris nazımı's home page (nizam 05)", () => {
  const nazim: NizamDashboardResponse = {
    ...chief,
    viewer: "MEDARIS_NAZIM",
    greetingName: "Hasan Basri",
    can: { openKosk: false },
    pendingTotals: {
      koskApplications: 3,
      deckPublishRequests: 2,
      permanentBanRequests: 2,
    },
    platformCounts: {
      kosk: 4,
      unlistedKosk: 1,
      madrasah: 2,
      inactiveMadrasah: 1,
    },
    inactiveScopes: undefined,
    inactiveScopeCount: undefined,
  };
  const html = render(
    <MedarisHome data={nazim} grants={grants} nowIso={NOW} />
  );

  it("sums the three queues it shows: 7 (criterion 2)", () => {
    expect(html).toContain("Selâmün aleyküm, Hasan Basri Bey.");
    expect(html).toContain("Karar bekleyen 7 talep var.");
  });

  it("draws neither the course numbers nor the passive scopes", () => {
    expect(html).not.toContain("Kayıtlı talebe");
    expect(html).not.toContain("Pasif kapsamlar");
    expect(html).toContain("Medrese");
  });

  it("draws neither Köşklere git nor Medreselere git: both pages are the başnazım's alone", () => {
    expect(html).not.toContain("Köşklere git");
    expect(html).not.toContain("Medreselere git");
  });

  it("hides Köşk aç without the permission (criterion 6)", () => {
    expect(html).not.toContain("/tr/kosks?ac=1");
    const allowed = render(
      <MedarisHome
        data={{ ...nazim, can: { openKosk: true } }}
        grants={grants}
        nowIso={NOW}
      />
    );
    expect(allowed).toContain("/tr/kosks?ac=1");
  });

  it("lists the grants with their count and end, 'süresiz' without one (criteria 3 and 4)", () => {
    expect(html).toContain("İzinleriniz");
    expect(html).toContain("Köşk işleri");
    expect(html).toContain("Hazır grup · 2 izin");
    expect(html).toContain("31 Aralık 2026 tarihine kadar");
    expect(html).toContain("Desteyi herkese yayımla");
    expect(html).toContain("süresiz");
    expect(html).toContain("Yusuf Ziya Ertuğrul");
  });

  it("says when the grants could not be read, without hiding the rest", () => {
    const failed = render(
      <MedarisHome data={nazim} grants={null} nowIso={NOW} />
    );
    expect(failed).toContain("İzinleriniz okunamadı");
    expect(failed).toContain("Köşk başvuruları");
  });
});

const kosk: KoskDashboardResponse = {
  koskId: "k1",
  koskName: "Nûruosmaniye Köşkü",
  greetingName: "Abdülhamit",
  counts: {
    courses: 7,
    students: 74,
    upcomingSessions: 4,
    pendingApplications: 5,
  },
  sessionCounts: { upcoming: 4, past: 13, cancelled: 1 },
  withoutAccessCount: 1,
  contentLocked: false,
  tab: "UPCOMING",
  sessions: [
    {
      id: "s1",
      courseId: "c1",
      courseTitle: "Emsile ve Bina",
      courseCoverHue: 220,
      weekNumber: 5,
      scheduledAt: new Date("2026-10-03T18:00:00Z"),
      durationMinutes: 60,
      inPerson: false,
      hasLiveStream: false,
      withoutAccess: true,
      isMakeup: false,
      studentCount: 28,
      cancelled: false,
      muderris: [{ name: "Abdülhamit Karaosmanoğlu", isImam: true }],
    },
    {
      id: "s2",
      courseId: "c2",
      courseTitle: "Bina ve İzhar Şerhi",
      courseCoverHue: 220,
      weekNumber: 4,
      scheduledAt: new Date("2026-10-04T18:00:00Z"),
      durationMinutes: 60,
      meetingUrl: "https://zoom.us/j/1",
      inPerson: false,
      hasLiveStream: false,
      withoutAccess: false,
      isMakeup: false,
      studentCount: 35,
      cancelled: false,
      madrasahName: "Süleymaniye Medresesi",
      muderris: [
        { name: "Mehmet Emin Işıkoğlu", isImam: true },
        { name: "Ayşe Nur Kılıçarslan", isImam: false },
      ],
    },
    {
      id: "s3",
      courseId: "c1",
      courseTitle: "Emsile ve Bina",
      courseCoverHue: 220,
      weekNumber: 5,
      scheduledAt: new Date("2026-10-07T18:00:00Z"),
      meetingUrl: "https://meet.google.com/abc",
      inPerson: false,
      hasLiveStream: false,
      withoutAccess: false,
      isMakeup: true,
      studentCount: 28,
      cancelled: false,
      muderris: [],
    },
  ],
  firstWithoutAccess: {
    id: "s1",
    courseId: "c1",
    courseTitle: "Emsile ve Bina",
    courseCoverHue: 220,
    weekNumber: 5,
    scheduledAt: new Date("2026-10-03T18:00:00Z"),
    inPerson: false,
    withoutAccess: true,
    isMakeup: false,
    studentCount: 28,
    cancelled: false,
    muderris: [],
  },
  latestApplications: [
    {
      userId: "u1",
      courseId: "c2",
      courseTitle: "Bina ve İzhar Şerhi",
      studentName: "Rümeysa Nur Karaca",
      requestedAt: new Date("2026-10-03T07:02:00Z"),
      canDecide: true,
      scopePassive: false,
    },
  ],
  muderris: [
    {
      userId: "m1",
      name: "Abdülhamit Karaosmanoğlu",
      courseCount: 3,
      studentCount: 63,
    },
    {
      userId: "m2",
      name: "Mehmet Emin Işıkoğlu",
      courseCount: 2,
      studentCount: 35,
      madrasahName: "Süleymaniye Medresesi",
    },
  ],
};

describe("a köşk nazımı's home page (nizam 02)", () => {
  const html = render(<KoskHome data={kosk} nowIso={NOW} />);

  it("greets with the week's celse and the one nobody can attend (MDRS-283)", () => {
    expect(html).toContain(
      "Selâmün aleyküm, Abdülhamit Hoca. Önümüzdeki yedi günde 4 celse var; birinin katılım yolu eksik."
    );
  });

  it("warns about the celse nobody can attend, by course and day", () => {
    expect(html).toContain("Bir celsenin katılım yolu eksik");
    expect(html).toContain("Emsile ve Bina, 3 Ekim Cumartesi 21:00.");
    expect(html).toContain(
      "Toplantı bağlantısı, canlı yayın ya da yüz yüze işareti yok"
    );
  });

  it("draws the four numbers (criterion 2)", () => {
    for (const label of [
      "Ders",
      "Kayıtlı talebe",
      "Yaklaşan celse",
      "Bekleyen başvuru",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(">74<");
  });

  it("draws the three tabs with their counts", () => {
    expect(html).toContain("Yaklaşan");
    expect(html).toContain("Geçmiş");
    expect(html).toContain("İptal edilen");
    expect(html).toContain(">13<");
  });

  it("draws each celse with its state, Katılım and button", () => {
    // a lone müderris is the imam and gets no mark; among two, the imam's
    // name is followed by the star, a button that explains it (2026-10-13)
    expect(html).toContain("Hafta 5 · Abdülhamit Karaosmanoğlu</span>");
    expect(html).toMatch(
      /Hafta 4 · Mehmet Emin Işıkoğlu <button[^>]*aria-label="Dersin imamı"[^>]*>[\s\S]*?<\/button> · Ayşe Nur Kılıçarslan · Süleymaniye Medresesi/
    );
    expect(html.match(/aria-label="Dersin imamı"/g)).toHaveLength(1);
    expect(html).not.toContain(", imam");
    expect(html).toContain("Hafta 5, telafi celsesi");
    expect(html).toContain("3 Eki Cmt 21:00");
    expect(html).toContain(">Katılım<");
    // the one nobody can attend says "Eksik" once, in Katılım; Durum says planned
    expect(html.split('data-testid="attendance-missing"')).toHaveLength(2);
    expect(html).not.toContain("Bağlantı eksik");
    expect(html).toContain("Toplantı bağlantısı ekle");
    expect(html).toContain("Zoom");
    expect(html).toContain("Google Meet");
    expect(html).toContain("Planlandı");
    expect(html).toContain("/tr/kosks/k1/courses/c1/sessions");
  });

  it("links no page that is not built: the köşk-wide Celseler, Talebeler and Ders kayıtları (MDRS-211)", () => {
    expect(html).not.toMatch(
      /\/kosks\/k1\/(celseler|talebeler|ders-kayitlari)/
    );
    // the applications card keeps its "Tümünü gör", to a page that exists
    expect(html).toContain('href="/tr/kosks/k1/basvurular"');
  });

  it("draws the newest application with Onayla and Reddet that name the talebe and the course", () => {
    expect(html).toContain("Rümeysa Nur Karaca");
    expect(html).toContain("Bugün 10:02");
    expect(html).toContain(
      'aria-label="Onayla: Rümeysa Nur Karaca, Bina ve İzhar Şerhi"'
    );
    expect(html).toContain(
      'aria-label="Reddet: Rümeysa Nur Karaca, Bina ve İzhar Şerhi"'
    );
  });

  it("lists the müderrisler with their courses and talebe", () => {
    expect(html).toContain("3 ders · 63 talebe");
    expect(html).toContain("Süleymaniye Medresesi · 2 ders · 35 talebe");
  });

  it("covers a celse that is only streamed or held in person: no alert, no Eksik (MDRS-283)", () => {
    const covered = render(
      <KoskHome
        data={{
          ...kosk,
          withoutAccessCount: 0,
          firstWithoutAccess: undefined,
          sessions: [
            {
              ...(kosk.sessions[0] as KoskDashboardSessionResponse),
              hasLiveStream: true,
              withoutAccess: false,
            },
            {
              ...(kosk.sessions[0] as KoskDashboardSessionResponse),
              id: "s4",
              inPerson: true,
              withoutAccess: false,
            },
          ],
        }}
        nowIso={NOW}
      />
    );
    expect(covered).not.toContain("katılım yolu eksik");
    expect(covered).not.toContain('data-testid="attendance-missing"');
    expect(covered).toContain("Yalnız yayın");
    expect(covered).toContain("Yüz yüze");
    expect(covered).not.toContain("Toplantı bağlantısı ekle");
  });

  it("says only what a page read without the köşk's content carries", () => {
    const locked = render(
      <KoskHome
        data={{
          ...kosk,
          contentLocked: true,
          latestApplications: [],
          sessions: kosk.sessions.map((s) => ({
            ...s,
            meetingUrl: undefined,
            hasLiveStream: undefined,
            inPerson: undefined,
            withoutAccess: undefined,
          })),
        }}
        nowIso={NOW}
      />
    );
    // No row carries how it is attended (MDRS-283 review): none claims
    // anything, while the alert above still names the count.
    expect(locked).not.toContain('data-testid="attendance-missing"');
    expect(locked).toContain("Katılım bilgisi gösterilmez");
    expect(locked).not.toContain("Zoom");
    expect(locked).toContain("katılım yolu eksik");
  });

  it("leaves out the alert when every celse can be attended, and names the open course button", () => {
    const fine = render(
      <KoskHome
        data={{ ...kosk, withoutAccessCount: 0, firstWithoutAccess: undefined }}
        nowIso={NOW}
      />
    );
    expect(fine).not.toContain("katılım yolu eksik");
    expect(fine).toContain("Önümüzdeki yedi günde 4 celse var.");
    expect(fine).toContain("/tr/kosks/k1/courses/new");
  });

  it("leaves out the applications card when the page is read without the köşk's management (contentLocked)", () => {
    const locked = render(
      <KoskHome
        data={{ ...kosk, contentLocked: true, latestApplications: [] }}
        nowIso={NOW}
      />
    );
    expect(locked).not.toContain('id="home-applications"');
    expect(locked).not.toContain('href="/tr/kosks/k1/basvurular"');
    expect(locked).not.toContain("Bekleyen başvuru yok.");
    expect(html).toContain('id="home-applications"');
  });

  it("says so when the week has no celse", () => {
    const quiet = render(
      <KoskHome
        data={{
          ...kosk,
          withoutAccessCount: 0,
          firstWithoutAccess: undefined,
          counts: { ...kosk.counts, upcomingSessions: 0 },
          sessions: [],
          latestApplications: [],
          muderris: [],
        }}
        nowIso={NOW}
      />
    );
    expect(quiet).toContain("Önümüzdeki yedi günde celse yok.");
    expect(quiet).toContain("Önümüzdeki yedi günde celse yok.");
    expect(quiet).toContain("Bekleyen başvuru yok.");
    expect(quiet).toContain("Bu köşkte hoca yok.");
  });
});
