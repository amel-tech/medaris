import { quranFontHref } from "@medaris/tokens/medaris-fonts";
import { Icon } from "@medaris/ui/mds/icon";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import {
  closing,
  ezber,
  folio,
  halka,
  hero,
  howItWorks,
  isPlaceholder,
  medrese,
  operator,
  operatorFields,
  promises,
  sampleCourse,
  talebe,
} from "~/content/karsilama";
import { exploreHref, registerHref, signInHref } from "~/lib/tedris";
import "./karsilama.css";

const container = "mx-auto inline-full max-inline-content px-gutter";

function Folio() {
  return (
    <figure
      className="mds-folio karsilama-folio giris-in giris-in--card m-0"
      aria-label={folio.label}
    >
      <p className="mds-sure-band">
        <span lang="ar" dir="rtl">
          {folio.sure}
        </span>
      </p>
      <div className="mds-folio__matn">
        <p className="mds-quran m-0" lang="ar" dir="rtl">
          {folio.ayah}
        </p>
        <p className="mds-folio__meal">{folio.meal}</p>
      </div>
      <div className="mds-folio__rule" aria-hidden="true">
        <span />
      </div>
      <figcaption className="mds-source text-center">{folio.source}</figcaption>
    </figure>
  );
}

function SampleCourse() {
  return (
    <figure
      className="mds-card karsilama-mock m-0 flex flex-col gap-0 overflow-hidden p-0"
      aria-label={sampleCourse.label}
    >
      <div className="mds-cover mds-cover--bordo karsilama-mock__cover">
        <span className="mds-cover__label" lang="ar" dir="rtl">
          {sampleCourse.cover}
        </span>
      </div>
      <div className="flex min-inline-0 flex-col gap-4 p-6">
        <div className="flex min-inline-0 items-start justify-between gap-3">
          <div className="flex min-inline-0 flex-col gap-1">
            <span className="mds-eyebrow">{sampleCourse.science}</span>
            <span className="mds-h3">{sampleCourse.title}</span>
          </div>
          <span className="mds-badge mds-badge--outline">
            {sampleCourse.badge}
          </span>
        </div>
        <ol className="mds-lesson-list">
          {sampleCourse.weeks.map((week) => (
            <li
              key={week.title}
              className={`mds-lesson-row mds-lesson-row--live${
                week.state === "done"
                  ? " is-done"
                  : week.state === "locked"
                    ? " is-locked"
                    : ""
              }`}
            >
              <span className="mds-lesson-row__medallion" aria-hidden="true" />
              <div className="mds-lesson-row__main">
                <span
                  className="mds-lesson-row__title"
                  aria-current={week.state === "live" ? "step" : undefined}
                >
                  {week.title}
                </span>
                <p className="mds-lesson-row__meta">
                  <span>
                    {sampleCourse.lessonType}
                    <span className="mds-sep" aria-hidden="true">
                      ·
                    </span>
                  </span>
                  <span>{week.when}</span>
                </p>
              </div>
              {week.state === "live" ? (
                <span className="mds-badge mds-badge--live">
                  <span className="mds-badge__dot" aria-hidden="true" />
                  {sampleCourse.live}
                </span>
              ) : null}
              {week.state === "locked" ? (
                <span
                  className="mds-lesson-row__lock"
                  role="img"
                  aria-label={sampleCourse.lockedLabel}
                />
              ) : null}
            </li>
          ))}
        </ol>
        <span className="mds-btn mds-btn--primary mds-btn--full karsilama-mock__join">
          <Icon name="video" size="sm" />
          {sampleCourse.join}
        </span>
        <figcaption className="mds-caption">{sampleCourse.note}</figcaption>
      </div>
    </figure>
  );
}

function SampleCard({ side }: { side: "front" | "back" }) {
  const { sample } = ezber;
  const back = side === "back";
  return (
    <article
      className={`mds-card karsilama-card karsilama-card--${side} flex flex-col gap-4`}
      aria-label={back ? sample.backLabel : sample.frontLabel}
    >
      <div className="mds-card__header items-center">
        <span className="mds-caption">{sample.card}</span>
        <span className="mds-badge mds-badge--outline">{sample.badge}</span>
      </div>
      <p
        className={`mds-arabic-text text-center${back ? "" : " py-6"}`}
        lang="ar"
        dir="rtl"
      >
        {sample.arabic}
      </p>
      {back ? (
        <>
          <hr className="mds-separator" />
          <p className="mds-reading">{sample.meaning}</p>
          <p className="mds-source">{sample.source}</p>
          <p className="mds-caption">
            {sample.question} {sample.ratings.join(" · ")}
          </p>
        </>
      ) : (
        <p className="mds-caption">{sample.deck}</p>
      )}
    </article>
  );
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="karsilama-points">
      {items.map((item) => (
        <li key={item}>
          <Icon name="check" size="sm" className="karsilama-points__mark" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const operatorReady = !operatorFields.some(isPlaceholder);

  return (
    <>
      {/* The Qur'an face, only on the page that shows Qur'anic text (readme, "Fonts"). */}
      <link rel="stylesheet" href={quranFontHref} precedence="default" />
      <SiteHeader title="Medaris" home />
      <main className="flex inline-full flex-col">
        <section className="karsilama-hero" aria-labelledby="giris-baslik">
          <div className={`${container} karsilama-hero__grid`}>
            <div className="flex min-inline-0 flex-col gap-6">
              <p className="mds-eyebrow giris-in giris-in--eyebrow">
                {hero.eyebrow}
              </p>
              <h1
                className="karsilama-display giris-in giris-in--title"
                id="giris-baslik"
              >
                {hero.title}
                <span className="karsilama-display__soft">
                  {hero.titleSoft}
                </span>
              </h1>
              <p className="karsilama-lead giris-in giris-in--intro">
                {hero.intro}
              </p>
              <div className="flex min-inline-0 flex-wrap items-center gap-3 giris-in giris-in--actions">
                <a
                  className="mds-btn mds-btn--large mds-btn--primary"
                  href={registerHref}
                >
                  {hero.register}
                </a>
                <a
                  className="mds-btn mds-btn--large mds-btn--outline"
                  href="#medreseler"
                >
                  {hero.forMadrasahs}
                </a>
                <a className="mds-btn mds-btn--link" href={exploreHref}>
                  {hero.explore}
                </a>
              </div>
              <p className="mds-caption giris-in giris-in--actions">
                {hero.note}
              </p>
            </div>
            <Folio />
          </div>
        </section>

        <section
          className="karsilama-section karsilama-section--rule"
          aria-label={hero.eyebrow}
        >
          <ul className={`${container} karsilama-promises`}>
            {promises.map((promise) => (
              <li key={promise.title}>
                <h2 className="karsilama-promises__title">{promise.title}</h2>
                <p className="mds-body">{promise.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="karsilama-section karsilama-section--flush"
          aria-label="Talebe ve medrese"
        >
          <div className={`${container} karsilama-doors`}>
            <article
              className="karsilama-door"
              id="talebeler"
              aria-labelledby="talebe-baslik"
            >
              <p className="mds-eyebrow">{talebe.eyebrow}</p>
              <h2 className="karsilama-h2" id="talebe-baslik">
                {talebe.title}
              </h2>
              <Points items={talebe.points} />
              <div className="mt-auto flex min-inline-0 flex-wrap items-center gap-3">
                <a
                  className="mds-btn mds-btn--large mds-btn--primary"
                  href={registerHref}
                >
                  {talebe.register}
                </a>
                <a className="mds-btn mds-btn--link" href={exploreHref}>
                  {talebe.explore}
                </a>
              </div>
            </article>
            <article
              className="karsilama-door karsilama-door--ink"
              id="medreseler"
              data-theme="dark"
              aria-labelledby="medrese-baslik"
            >
              <p className="mds-eyebrow">{medrese.eyebrow}</p>
              <h2 className="karsilama-h2" id="medrese-baslik">
                {medrese.title}
              </h2>
              <Points items={medrese.points} />
              <div className="mt-auto flex min-inline-0 flex-col items-start gap-3">
                <Link
                  className="mds-btn mds-btn--large mds-btn--primary"
                  href="/iletisim"
                >
                  {medrese.contact}
                </Link>
                <p className="mds-caption">{medrese.note}</p>
              </div>
            </article>
          </div>
        </section>

        <section
          className="karsilama-section karsilama-section--rule"
          aria-labelledby="nasil-baslik"
        >
          <div className={`${container} karsilama-how`}>
            <div className="flex min-inline-0 flex-col gap-10">
              <div className="flex min-inline-0 flex-col gap-4">
                <p className="mds-eyebrow">{howItWorks.eyebrow}</p>
                <h2 className="karsilama-h2" id="nasil-baslik">
                  {howItWorks.title}
                </h2>
              </div>
              <ol className="karsilama-steps">
                {howItWorks.steps.map((step, i) => (
                  <li key={step.title}>
                    <span className="karsilama-steps__num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="flex min-inline-0 flex-col gap-2">
                      <h3 className="mds-h3">{step.title}</h3>
                      <p className="mds-body karsilama-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <SampleCourse />
          </div>
        </section>

        <section
          className="karsilama-band"
          data-theme="dark"
          aria-labelledby="halka-baslik"
        >
          <div className={`${container} karsilama-band__inner`}>
            <h2 className="karsilama-quote" id="halka-baslik">
              {halka.quote}
            </h2>
            <p className="karsilama-lead">{halka.text}</p>
          </div>
        </section>

        <section className="karsilama-section" aria-labelledby="ezber-baslik">
          <div className={`${container} karsilama-ezber`}>
            <div className="flex min-inline-0 flex-col gap-6">
              <p className="mds-eyebrow">{ezber.eyebrow}</p>
              <h2 className="karsilama-h2" id="ezber-baslik">
                {ezber.title}
              </h2>
              <p className="karsilama-lead">{ezber.text}</p>
              <Points items={ezber.points} />
            </div>
            <div className="karsilama-cards">
              <SampleCard side="front" />
              <SampleCard side="back" />
            </div>
          </div>
        </section>

        {operatorReady && (
          <section
            className="karsilama-section karsilama-section--rule"
            aria-labelledby="kim-baslik"
          >
            <div className={`${container} flex flex-col gap-6`}>
              <h2 className="karsilama-h2" id="kim-baslik">
                {operator.title}
              </h2>
              <div className="grid items-start gap-6 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] max-md:grid-cols-1">
                <div className="mds-card flex flex-col gap-3">
                  <p className="mds-eyebrow">{operator.institutionLabel}</p>
                  <p className="mds-reading">{operator.institution}</p>
                </div>
                <div className="mds-card flex flex-col gap-3">
                  <p className="mds-eyebrow">{operator.testimonialLabel}</p>
                  <p className="mds-reading">{operator.testimonial}</p>
                  <p className="mds-caption">{operator.testimonialBy}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        <section
          className="karsilama-section karsilama-section--rule"
          aria-labelledby="kapanis-baslik"
        >
          <div className={`${container} karsilama-closing`}>
            <h2 className="karsilama-display" id="kapanis-baslik">
              {closing.title}
            </h2>
            <p className="karsilama-lead">{closing.text}</p>
            <div className="flex min-inline-0 flex-wrap items-center justify-center gap-3">
              <a
                className="mds-btn mds-btn--large mds-btn--primary"
                href={registerHref}
              >
                {closing.register}
              </a>
              <Link
                className="mds-btn mds-btn--large mds-btn--outline"
                href="/iletisim"
              >
                {closing.contact}
              </Link>
              <a
                className="mds-btn mds-btn--large mds-btn--ghost"
                href={signInHref}
              >
                {closing.signIn}
              </a>
            </div>
            <p className="mds-caption">
              {closing.consentLead}{" "}
              <Link className="mds-btn mds-btn--link" href="/aydinlatma-metni">
                {closing.consentLink}
              </Link>
              {closing.consentTail}{" "}
              <Link className="mds-btn mds-btn--link" href="/sss">
                {closing.faq}
              </Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
