import { resources } from "@medaris/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { landingFor } from "~/features/assignments/landing";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) =>
    [...namespace.split("."), ...key.split(".")].reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr
    ),
}));

const render = async (
  props: Partial<{
    email: string | null;
    tedrisUrl: string | null;
    failed: boolean;
  }> = {}
) => {
  const { NoRolePage } = await import(
    "~/features/assignments/components/no-role-page"
  );
  return renderToStaticMarkup(
    await NoRolePage({
      email: "zeynep.karahanli@example.com",
      tedrisUrl: "http://localhost:4000",
      failed: false,
      retryHref: "/tr/yetki-yok",
      ...props,
    })
  );
};

describe("Yönetim yetkiniz yok (nizam 03)", () => {
  it("says what the screen says: the heading, the sentence, the account", async () => {
    const html = await render();
    expect(html).toContain(">Yönetim yetkiniz yok</h1>");
    expect(html).toContain(
      "Nizam, Medaris’i ve köşkleri yönetenlerin uygulamasıdır. Bu hesaba bir yönetim görevi verilmemiş."
    );
    expect(html).toContain("Giriş yaptığınız hesap:");
    expect(html).toContain("zeynep.karahanli@example.com");
  });

  it("sends 'Tedris'e dön' to Tedris's root", async () => {
    const html = await render();
    expect(html).toMatch(
      /<a[^>]*href="http:\/\/localhost:4000"[^>]*>Tedris’e dön<\/a>/
    );
  });

  it("leaves the button out when Tedris's address is not configured, and the account out when there is no e-mail", async () => {
    const html = await render({ tedrisUrl: null, email: null });
    expect(html).not.toContain("Tedris’e dön");
    expect(html).not.toContain("Giriş yaptığınız hesap");
  });

  it("does not claim the account has no role when the roles could not be read", async () => {
    const html = await render({ failed: true });
    expect(html).not.toContain("Yönetim yetkiniz yok");
    expect(html).toContain("Görevleriniz okunamadı");
    expect(html).toMatch(/<a[^>]*href="\/tr\/yetki-yok"[^>]*>Tekrar dene<\/a>/);
    expect(html).toContain('role="alert"');
  });
});

describe("who is sent here", () => {
  it("is the account with no role at all, not the medrese's or the course's people", () => {
    expect(landingFor({ systemAdmin: false, assignments: [] })).toBe("none");
    expect(
      landingFor({ systemAdmin: false, assignments: [{ role: "MUDERRIS" }] })
    ).toBe("nazir");
    expect(landingFor({ systemAdmin: true, assignments: [] })).toBe("nizam");
  });
});
