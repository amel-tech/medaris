import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { ContactForm } from "~/components/contact-form";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { legal } from "~/content/legal";

export const metadata = { title: "İletişim · Medaris" };

// İletişim: canvas "Medaris Ekranları", Iletisim.dc.html. MDRS-151.
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader title="İletişim" />
      <main className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-inline-0 flex-col gap-2">
            <h1 className="mds-h1">İletişim</h1>
            <p className="mds-body">
              Sorularınızı, önerilerinizi ve kişisel verilerle ilgili
              taleplerinizi bize yazın.
            </p>
          </div>
        </div>

        <div className="grid items-start gap-6 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] max-md:grid-cols-1">
          <ContactForm />

          <div className="flex min-inline-0 flex-col gap-stack">
            <div className="mds-card flex flex-col gap-4">
              <div className="mds-card__header">
                <h2 className="mds-card__title">İletişim bilgileri</h2>
              </div>
              <dl className="grid gap-y-3 gap-x-6 items-baseline grid-cols-[max-content_minmax(0,1fr)]">
                <dt className="mds-label">E-posta</dt>
                <dd className="mds-body">
                  <a href={`mailto:${legal.supportEmail}`}>
                    {legal.supportEmail}
                  </a>
                </dd>
              </dl>
              <p className="mds-body-sm">
                Kişisel verilerinize ilişkin hak başvurularının nasıl yapılacağı{" "}
                <Link href="/aydinlatma-metni">Aydınlatma Metni</Link>’nde
                yazılıdır.
              </p>
            </div>
            <div className="mds-card flex flex-col gap-3">
              <div className="mds-card__header">
                <h2 className="mds-card__title">Önce bakmak isterseniz</h2>
              </div>
              <p className="mds-body-sm">
                Kayıt, başvuru onayı, celselere katılım ve ders kayıtları sık
                sorulan sorularda anlatılır.
              </p>
              <Link className="mds-btn mds-btn--link self-start" href="/sss">
                Sık sorulan sorular
              </Link>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter current="/iletisim" />
    </>
  );
}
