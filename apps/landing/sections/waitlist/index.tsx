import { getLocale, getTranslations } from "next-intl/server";
import { landingEntryHref } from "~/lib/tedris-entry";
import { waitlistSectionId } from "./data";

/**
 * The closing call to action. It was an e-mail waitlist form with no handler;
 * since MDRS-101 it leads to tedris registration and sign-in instead. The
 * section id stays, so existing `#stay-updated` links still land here.
 */
export async function WaitlistSection() {
  const t = await getTranslations("landing.waitlist");
  const locale = await getLocale();

  return (
    <section
      className="py-24 bg-primary relative overflow-hidden pattern-rosette-navy"
      id={waitlistSectionId}
    >
      <div className="max-w-4xl mx-auto px-4 relative z-10 text-center">
        <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-6">
          {t("title")}
        </h2>
        <p className="text-gray-300 text-lg mb-12 max-w-2xl mx-auto font-light leading-relaxed">
          {t("description")}
        </p>
        <div className="flex flex-col items-center gap-6">
          <a
            className="bg-secondary hover:bg-secondary/90 text-white px-10 py-4 rounded-full font-bold shadow-xl transition-all hover:-translate-y-0.5"
            href={landingEntryHref("register", locale)}
          >
            {t("register")}
          </a>
          <p className="text-white/70 text-sm">
            {t("haveAccount")}{" "}
            <a
              className="font-semibold text-white underline underline-offset-4"
              href={landingEntryHref("signin", locale)}
            >
              {t("signIn")}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
