import { Icon } from "@medaris/ui/mds/icon";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import {
  celse,
  closing,
  ezber,
  gozat,
  hero,
  isPlaceholder,
  operator,
  operatorFields,
  sampleCourse,
  structure,
} from "~/content/karsilama";
import { exploreHref, registerHref, signInHref } from "~/lib/tedris";
import "./karsilama.css";

const cardGrid =
  "grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))]";

function SampleCourse() {
  return (
    <aside
      className="mds-card giris-in giris-in--card flex flex-col gap-4"
      aria-labelledby="ornek-ders-baslik"
    >
      <div className="mds-card__header items-center">
        <span className="mds-eyebrow">{sampleCourse.eyebrow}</span>
        <span className="mds-badge mds-badge--outline">
          {sampleCourse.badge}
        </span>
      </div>
      <div className="flex min-inline-0 flex-col gap-1">
        <h2 className="mds-h4" id="ornek-ders-baslik">
          {sampleCourse.title}
        </h2>
        <p className="mds-caption">{sampleCourse.caption}</p>
      </div>
      {sampleCourse.weeks.map((week) => (
        <div key={week.title} className="flex min-inline-0 flex-col gap-1">
          <h3 className="mds-eyebrow">{week.title}</h3>
          <ol className="mds-lesson-list">
            {week.sessions.map((session) => (
              <li
                key={session.title}
                className="mds-lesson-row mds-lesson-row--live is-locked"
              >
                <span
                  className="mds-lesson-row__medallion"
                  aria-hidden="true"
                />
                <div className="mds-lesson-row__main">
                  <span className="mds-lesson-row__title">{session.title}</span>
                  <p className="mds-lesson-row__meta">
                    <span>
                      {sampleCourse.lessonType}
                      <span className="mds-sep" aria-hidden="true">
                        ·
                      </span>
                    </span>
                    <span>{session.when}</span>
                  </p>
                </div>
                <span
                  className="mds-lesson-row__lock"
                  role="img"
                  aria-label={sampleCourse.lockedLabel}
                />
                <span className="mds-lesson-row__duration">
                  {session.minutes}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <p className="mds-caption">{sampleCourse.note}</p>
    </aside>
  );
}

function SampleCard({ side }: { side: "front" | "back" }) {
  const { sample } = ezber;
  const back = side === "back";
  return (
    <article
      className="mds-card flex flex-col gap-4"
      aria-label={back ? sample.backLabel : sample.frontLabel}
    >
      <div className="mds-card__header items-center">
        <span className="mds-caption">{sample.card}</span>
        <span className="mds-badge mds-badge--outline">{sample.badge}</span>
      </div>
      <p
        className={`mds-arabic-text text-center${back ? "" : " py-4"}`}
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
      ) : null}
      <p className="mds-caption">{sample.deck}</p>
    </article>
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
      <SiteHeader title="Medaris" home />
      <main className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
        <section
          className="grid gap-6 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] max-md:grid-cols-1 items-center py-6"
          aria-labelledby="giris-baslik"
        >
          <div className="flex min-inline-0 flex-col gap-5">
            <p className="mds-eyebrow giris-in giris-in--eyebrow">
              {hero.eyebrow}
            </p>
            <h1
              className="mds-display giris-in giris-in--title"
              id="giris-baslik"
            >
              {hero.title}
            </h1>
            <p className="mds-reading giris-in giris-in--intro">{hero.intro}</p>
            <div className="flex min-inline-0 flex-wrap items-center gap-3 giris-in giris-in--actions">
              <a
                className="mds-btn mds-btn--large mds-btn--primary"
                href={registerHref}
              >
                {hero.register}
              </a>
              <a
                className="mds-btn mds-btn--large mds-btn--outline"
                href={signInHref}
              >
                {hero.signIn}
              </a>
              <a className="mds-btn mds-btn--link" href={exploreHref}>
                {hero.explore}
              </a>
            </div>
            <p className="mds-caption giris-in giris-in--actions">
              {hero.note}
            </p>
          </div>
          <SampleCourse />
        </section>

        <section
          className="flex min-inline-0 flex-col gap-5"
          aria-labelledby="yapi-baslik"
        >
          <div className="flex min-inline-0 flex-col gap-2">
            <h2 className="mds-h2" id="yapi-baslik">
              {structure.title}
            </h2>
            <p className="mds-body max-inline-measure">{structure.intro}</p>
          </div>
          <ol className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] list-none m-0 p-0">
            {structure.steps.map((step, i) => (
              <li key={step.title} className="mds-card flex flex-col gap-3">
                <div className="flex min-inline-0 flex-wrap items-center gap-2">
                  <Icon name={step.icon} />
                  <span className="mds-eyebrow">{i + 1}</span>
                </div>
                <h3 className="mds-h4">{step.title}</h3>
                <p className="mds-body-sm">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="flex min-inline-0 flex-col gap-5"
          aria-labelledby="celse-baslik"
        >
          <div className="flex min-inline-0 flex-col gap-2">
            <h2 className="mds-h2" id="celse-baslik">
              {celse.title}
            </h2>
            <p className="mds-body max-inline-measure">{celse.intro}</p>
          </div>
          <div className={cardGrid}>
            {celse.cards.map((card) => (
              <div key={card.title} className="mds-card flex flex-col gap-3">
                <Icon name={card.icon} />
                <h3 className="mds-h4">{card.title}</h3>
                <p className="mds-body-sm">{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="grid gap-6 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] max-md:grid-cols-1 items-center"
          aria-labelledby="ezber-baslik"
        >
          <div className="flex min-inline-0 flex-col gap-4">
            <h2 className="mds-h2" id="ezber-baslik">
              {ezber.title}
            </h2>
            <p className="mds-reading">{ezber.text}</p>
            <ul className="flex flex-col list-none m-0 p-0">
              {ezber.points.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
                >
                  <Icon name="check" size="sm" className="mbs-1 shrink-0" />
                  <span className="mds-body">{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-4 items-start">
            <SampleCard side="front" />
            <SampleCard side="back" />
          </div>
        </section>

        <section
          className="flex min-inline-0 flex-col gap-5"
          aria-labelledby="gozat-baslik"
        >
          <div className="flex min-inline-0 flex-col gap-2">
            <h2 className="mds-h2" id="gozat-baslik">
              {gozat.title}
            </h2>
            <p className="mds-body max-inline-measure">{gozat.intro}</p>
          </div>
          <div className={cardGrid}>
            {gozat.cards.map((card) => (
              <div key={card.title} className="mds-card flex flex-col gap-3">
                <Icon name={card.icon} />
                <h3 className="mds-h4">{card.title}</h3>
                <p className="mds-body-sm">{card.body}</p>
              </div>
            ))}
          </div>
          <div className="flex min-inline-0 flex-wrap items-center gap-3">
            <a className="mds-btn mds-btn--outline" href={exploreHref}>
              {gozat.explore}
            </a>
          </div>
        </section>

        {operatorReady && (
          <section
            className="flex min-inline-0 flex-col gap-5"
            aria-labelledby="kim-baslik"
          >
            <h2 className="mds-h2" id="kim-baslik">
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
          </section>
        )}

        <section
          className="mds-card flex flex-wrap items-center justify-between gap-5 p-6"
          aria-labelledby="kapanis-baslik"
        >
          <div className="flex min-inline-0 flex-col gap-2">
            <h2 className="mds-h2" id="kapanis-baslik">
              {closing.title}
            </h2>
            <p className="mds-body">{closing.text}</p>
            <p className="mds-caption">
              {closing.consentLead}{" "}
              <Link className="mds-btn mds-btn--link" href="/aydinlatma-metni">
                {closing.consentLink}
              </Link>
              {closing.consentTail}
            </p>
          </div>
          <div className="flex min-inline-0 flex-wrap items-center gap-3">
            <a
              className="mds-btn mds-btn--large mds-btn--primary"
              href={registerHref}
            >
              {closing.register}
            </a>
            <a
              className="mds-btn mds-btn--large mds-btn--ghost"
              href={signInHref}
            >
              {closing.signIn}
            </a>
            <Link className="mds-btn mds-btn--link" href="/sss">
              {closing.faq}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
