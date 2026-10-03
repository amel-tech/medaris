import type { Metadata } from "next";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import {
  IS_DRAFT,
  LAST_UPDATED,
  SECTIONS,
  TITLE,
} from "../../content/aydinlatma-metni";

export const metadata: Metadata = {
  title: "Aydınlatma Metni · Medaris",
  description: TITLE,
};

/**
 * /aydinlatma-metni — public, static, no sign-in (MDRS-102). The text lives in
 * content/aydinlatma-metni.ts; the page wears the landing chrome and type of
 * the unified design system (MDRS-151).
 */
export default function PrivacyNoticePage() {
  return (
    <>
      <SiteHeader title="Aydınlatma Metni" />
      <main className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
        <div className="flex min-inline-0 flex-col gap-2 max-inline-measure">
          <h1 className="mds-h1">{TITLE}</h1>
          <p className="mds-caption">Son güncelleme: {LAST_UPDATED}</p>
        </div>
        {IS_DRAFT && (
          <p role="note" className="mds-card mds-body max-inline-measure">
            Bu metin taslaktır; veri sorumlusunun bilgileri ve son hukuki
            değerlendirme eklendiğinde güncellenecektir.
          </p>
        )}
        <div className="flex max-inline-measure flex-col gap-8">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-baslik`}
              className="flex flex-col gap-3"
            >
              <h2 id={`${section.id}-baslik`} className="mds-h2">
                {section.heading}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mds-body">
                  {paragraph}
                </p>
              ))}
              {section.items && (
                <ul className="mds-body list-disc ps-6">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {section.closing && <p className="mds-body">{section.closing}</p>}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter current="/aydinlatma-metni" />
    </>
  );
}
