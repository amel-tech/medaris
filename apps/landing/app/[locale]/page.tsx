import { Icon } from "@medaris/ui/mds/icon";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import {
  dersler,
  ezberPoints,
  heroCovers,
  isPlaceholder,
  koskler,
  operator,
  steps,
} from "~/content/karsilama";
import { exploreHref, registerHref, signInHref } from "~/lib/tedris";

// Karşılama (A1): canvas "Medaris Ekranları", Karsilama.dc.html and its phone
// copy KarsilamaTelefon.dc.html (the same markup at 390). MDRS-151.
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const operatorReady = !Object.values(operator).some(isPlaceholder);

  return (
    <>
      <SiteHeader title="Medaris" home />
      <main className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
        <section
          className="grid gap-6 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] max-md:grid-cols-1 items-center py-6"
          aria-labelledby="kahraman-baslik"
        >
          <div className="flex min-inline-0 flex-col gap-5">
            <p className="mds-eyebrow">Çevrim içi medrese</p>
            <h1 className="mds-display" id="kahraman-baslik">
              Medrese ilimlerini müderrisle, haftalık canlı celselerde okuyun.
            </h1>
            <p className="mds-reading">
              Medaris’te dersler köşklerde açılır ve haftalara bölünür. Her
              hafta müderrisle bir ya da birkaç canlı celse yapılır; okunanlar
              ezber kartlarıyla tekrar edilir.
            </p>
            <div className="flex min-inline-0 flex-wrap items-center gap-3">
              <a
                className="mds-btn mds-btn--large mds-btn--primary"
                href={registerHref}
              >
                Kayıt ol
              </a>
              <a
                className="mds-btn mds-btn--large mds-btn--outline"
                href={signInHref}
              >
                Giriş yap
              </a>
            </div>
            <p className="mds-caption">
              Derslerin tanıtımı ve müfredatı herkese açıktır. Ders içerikleri,
              toplantı bağlantıları ve ders kayıtları kayıtlı talebelere
              açıktır; herkese açık olarak işaretlenen ders kayıtlarını herkes
              izleyebilir.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 items-end">
            {heroCovers.map((cover) => (
              <div
                key={cover.title}
                className="flex min-inline-0 flex-col gap-2"
              >
                <div
                  className={`mds-cover mds-cover--lg mds-cover--${cover.cloth} ${cover.height}`}
                  aria-hidden="true"
                >
                  <p
                    className="mds-eyebrow mds-cover__label"
                    lang="ar"
                    dir="rtl"
                  >
                    {cover.label}
                  </p>
                </div>
                <p className="mds-caption" dir="auto">
                  {cover.title}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="flex min-inline-0 flex-col gap-5"
          aria-labelledby="nasil-baslik"
        >
          <div className="flex min-inline-0 flex-col gap-2">
            <h2 className="mds-h2" id="nasil-baslik">
              Nasıl işler
            </h2>
            <p className="mds-body max-inline-measure">
              Medaris bir medresenin düzenini izler: kurum, meclis, kitap, hafta
              ve buluşma.
            </p>
          </div>
          <ol className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] list-none m-0 p-0">
            {steps.map((step, i) => (
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
          aria-labelledby="koskler-baslik"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="mds-h2" id="koskler-baslik">
              Köşkler
            </h2>
            <a className="mds-btn mds-btn--link" href={exploreHref}>
              Bütün köşkler
            </a>
          </div>
          <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]">
            {koskler.map((kosk) => (
              <div
                key={kosk.name}
                className="mds-card mds-card--interactive flex flex-col gap-3"
              >
                <div className="flex min-inline-0 flex-nowrap items-center gap-3">
                  <span
                    className="mds-avatar mds-avatar--entity"
                    aria-hidden="true"
                  >
                    {kosk.initials}
                  </span>
                  <h3 className="mds-card__title" dir="auto">
                    <a className="mds-card__link" href={exploreHref}>
                      {kosk.name}
                    </a>
                  </h3>
                </div>
                <div className="flex min-inline-0 flex-wrap items-center gap-3">
                  <span className="mds-badge mds-badge--secondary">
                    {kosk.field}
                  </span>
                </div>
                <p className="mds-body-sm grow" dir="auto">
                  {kosk.body}
                </p>
                <p className="mds-caption">
                  {kosk.level}
                  <span className="mds-sep" aria-hidden="true">
                    ·
                  </span>
                  {kosk.courses} ders
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="flex min-inline-0 flex-col gap-5"
          aria-labelledby="dersler-baslik"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="mds-h2" id="dersler-baslik">
              Öne çıkan dersler
            </h2>
            <a className="mds-btn mds-btn--link" href={exploreHref}>
              Bütün dersler
            </a>
          </div>
          <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]">
            {dersler.map((ders) => (
              <div
                key={ders.title}
                className="mds-card mds-card--interactive flex flex-col"
              >
                <div className="mds-card__media">
                  <div
                    className={`mds-cover mds-cover--${ders.cloth} mds-cover--sm`}
                  >
                    <p
                      className="mds-eyebrow mds-cover__label"
                      lang="ar"
                      dir="rtl"
                    >
                      {ders.label}
                    </p>
                  </div>
                </div>
                <div className="mds-card__header">
                  <h3 className="mds-card__title" dir="auto">
                    <a className="mds-card__link" href={exploreHref}>
                      {ders.title}
                    </a>
                  </h3>
                </div>
                <p className="mds-card__body grow" dir="auto">
                  Müderris{" "}
                  {ders.medrese ? (
                    <>
                      <span className="whitespace-nowrap">
                        <bdi>{ders.muderris}</bdi>, imam
                      </span>
                      <span className="mds-sep" aria-hidden="true">
                        ·
                      </span>{" "}
                      <bdi>{ders.medrese}</bdi>
                    </>
                  ) : (
                    <>
                      <bdi>{ders.muderris}</bdi>, imam
                    </>
                  )}
                </p>
                <div className="mds-card__footer">
                  <span>
                    <bdi>{ders.kosk}</bdi>
                    <span className="mds-sep" aria-hidden="true">
                      ·
                    </span>
                  </span>
                  <span>
                    Sonraki celse{" "}
                    <time dateTime={ders.next.iso}>{ders.next.text}</time>
                  </span>
                </div>
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
              Ezber kartları
            </h2>
            <p className="mds-reading">
              Her haftanın kelimeleri, sîgaları ve metinleri destelerde
              toplanır. Kartlar, ne kadar zorlandığınıza göre yeniden karşınıza
              çıkar.
            </p>
            <ul className="flex flex-col list-none m-0 p-0">
              {ezberPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-center gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
                >
                  <Icon name="check" size="sm" />
                  <span className="mds-body">{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-4 items-start">
            <article
              className="mds-card flex flex-col gap-4"
              aria-label="Ezber kartı, ön yüz"
            >
              <div className="mds-card__header items-center">
                <span className="mds-caption">Kart 1</span>
                <span className="mds-badge mds-badge--outline">
                  Herkese açık
                </span>
              </div>
              <p
                className="mds-arabic-text text-center py-4"
                lang="ar"
                dir="rtl"
              >
                إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ
              </p>
              <p className="mds-caption" dir="auto">
                Kırk hadis destesi
              </p>
            </article>
            <article
              className="mds-card flex flex-col gap-4"
              aria-label="Ezber kartı, arka yüz"
            >
              <div className="mds-card__header items-center">
                <span className="mds-caption">Kart 1</span>
                <span className="mds-badge mds-badge--outline">
                  Herkese açık
                </span>
              </div>
              <p className="mds-arabic-text text-center" lang="ar" dir="rtl">
                إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ
              </p>
              <hr className="mds-separator" />
              <p className="mds-reading" dir="auto">
                Ameller ancak niyetlere göredir.
              </p>
              <p className="mds-source">Buhârî, Müslim</p>
              <p className="mds-caption" dir="auto">
                Kırk hadis destesi
              </p>
            </article>
          </div>
        </section>

        {operatorReady && (
          <section
            className="flex min-inline-0 flex-col gap-5"
            aria-labelledby="kim-baslik"
          >
            <h2 className="mds-h2" id="kim-baslik">
              Medaris’i kim yürütüyor
            </h2>
            <div className="grid items-start gap-6 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] max-md:grid-cols-1">
              <div className="mds-card flex flex-col gap-3">
                <p className="mds-eyebrow">Kurum</p>
                <p className="mds-reading">{operator.institution}</p>
              </div>
              <div className="mds-card flex flex-col gap-3">
                <p className="mds-eyebrow">Görüş</p>
                <p className="mds-reading">{operator.testimonial}</p>
                <p className="mds-caption">{operator.testimonialBy}</p>
              </div>
            </div>
          </section>
        )}

        <section
          className="mds-card flex flex-wrap items-center justify-between gap-5 p-6"
          aria-labelledby="son-baslik"
        >
          <div className="flex min-inline-0 flex-col gap-2">
            <h2 className="mds-h2" id="son-baslik">
              Derslere katılmak için hesap açın
            </h2>
            <p className="mds-body">
              Hesap açtıktan sonra derslere kaydolabilir, onay isteyen derslere
              başvurabilirsiniz.
            </p>
          </div>
          <div className="flex min-inline-0 flex-wrap items-center gap-3">
            <a
              className="mds-btn mds-btn--large mds-btn--outline"
              href={registerHref}
            >
              Kayıt ol
            </a>
            <Link className="mds-btn mds-btn--link" href="/sss">
              Sık sorulan sorular
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
