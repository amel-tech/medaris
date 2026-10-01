import Link from "next/link";

export const footerLinks = [
  { href: "/aydinlatma-metni", label: "Aydınlatma Metni" },
  { href: "/sss", label: "Sık sorulan sorular" },
  { href: "/iletisim", label: "İletişim" },
  { href: "/kullanim-sartlari", label: "Kullanım şartları" },
  { href: "/cerezler", label: "Çerezler" },
] as const;

export type FooterHref = (typeof footerLinks)[number]["href"];

/** The landing pages' footer, as the canvas draws it on every landing screen. */
export function SiteFooter({ current }: { current?: FooterHref }) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 py-8 px-gutter border-bs border-neutral-subtle text-caption text-neutral-muted">
      <span>© 2026 Medaris</span>
      <nav aria-label="Alt bilgi" className="flex flex-wrap gap-4">
        {footerLinks.map(({ href, label }) => (
          <Link
            key={href}
            className="mds-btn mds-btn--link"
            href={href}
            aria-current={href === current ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
