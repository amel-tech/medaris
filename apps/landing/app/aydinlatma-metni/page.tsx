import type { Metadata } from "next";
import Link from "next/link";
import {
  IS_DRAFT,
  LAST_UPDATED,
  SECTIONS,
  TITLE,
} from "../../content/aydinlatma-metni";

export const metadata: Metadata = {
  title: "Aydınlatma Metni | Medaris",
  description: TITLE,
};

/**
 * /aydinlatma-metni — public, static, no sign-in (MDRS-102). The text lives in
 * content/aydinlatma-metni.ts. Plain layout until MDRS-127 designs the page.
 */
export default function PrivacyNoticePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <nav className="mb-10">
        <Link className="text-sm text-primary hover:underline" href="/">
          Medaris ana sayfa
        </Link>
      </nav>
      <h1 className="mb-2 font-display text-3xl font-bold text-primary">
        {TITLE}
      </h1>
      <p className="mb-8 text-sm text-gray-500">
        Son güncelleme: {LAST_UPDATED}
      </p>
      {IS_DRAFT && (
        <p
          role="note"
          className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Bu metin taslaktır; veri sorumlusunun bilgileri ve son hukuki
          değerlendirme eklendiğinde güncellenecektir.
        </p>
      )}
      {SECTIONS.map((section) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-baslik`}
          className="mb-8"
        >
          <h2
            id={`${section.id}-baslik`}
            className="mb-3 text-xl font-semibold text-primary"
          >
            {section.heading}
          </h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="mb-3 leading-relaxed">
              {paragraph}
            </p>
          ))}
          {section.items && (
            <ul className="mb-3 list-disc space-y-1 ps-6 leading-relaxed">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {section.closing && (
            <p className="leading-relaxed">{section.closing}</p>
          )}
        </section>
      ))}
    </main>
  );
}
