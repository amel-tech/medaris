// biome-ignore-all lint/a11y/noRedundantRoles: the stacked table (mds-table--stack) restates every table role on purpose; below 768 it is display: block, which can drop the native semantics (design-system/medaris-unified/components/Table.prompt.md)
// biome-ignore-all lint/a11y/useSemanticElements: same reason; the roles sit on the semantic elements already
import { setRequestLocale } from "next-intl/server";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { legal } from "~/content/legal";

export const metadata = { title: "Çerezler · Medaris" };

// Çerezler: canvas "Medaris Ekranları", Cerezler.dc.html. MDRS-151.
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader title="Çerezler" />
      <main className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-inline-0 flex-col gap-2 max-inline-measure">
            <h1 className="mds-h1">Çerezler</h1>
            <p className="mds-body">
              Çerez, bir siteyi açtığınızda tarayıcınıza yerleştirilen küçük bir
              metin dosyasıdır. Medaris yalnızca siteyi çalıştırmak ve güvenliği
              sağlamak için gereken çerezleri kullanır.
            </p>
            <p className="mds-caption">
              Son güncelleme: <time dateTime="2026-10-01">1 Ekim 2026</time>
            </p>
          </div>
        </div>

        <div className="flex min-inline-0 flex-col gap-10">
          <div
            className="mds-alert mds-alert--neutral max-inline-measure"
            role="note"
          >
            <span className="mds-alert__icon" aria-hidden="true"></span>
            <div>
              Analitik ya da reklam çerezi kullanılmaz; bu yüzden Medaris’te
              çerez onay bildirimi gösterilmez.
            </div>
          </div>

          <section
            className="flex min-inline-0 flex-col gap-3"
            aria-labelledby="c1"
          >
            <h2 className="mds-h3" id="c1">
              Kullanılan çerezler
            </h2>
            <p className="mds-body max-inline-measure">
              Medaris’in yerleştirdiği çerezlerin hepsi zorunludur.
            </p>
            <div className="mds-table-wrap">
              <table
                className="mds-table mds-table--stack"
                role="table"
                aria-labelledby="cerez-tablo"
              >
                <caption
                  className="mds-table__caption mds-visually-hidden"
                  id="cerez-tablo"
                >
                  Medaris’in kullandığı çerezler
                </caption>
                <colgroup>
                  <col className="[--mds-col-w:14%]" />
                  <col />
                  <col className="[--mds-col-w:18%]" />
                  <col className="[--mds-col-w:20%]" />
                  <col className="[--mds-col-w:10%]" />
                </colgroup>
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col" role="columnheader">
                      Çerez
                    </th>
                    <th scope="col" role="columnheader">
                      Ne için kullanılır
                    </th>
                    <th scope="col" role="columnheader">
                      Kim yerleştirir
                    </th>
                    <th scope="col" role="columnheader">
                      Süre
                    </th>
                    <th scope="col" role="columnheader">
                      Tür
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  <tr role="row">
                    <th scope="row" role="rowheader">
                      Giriş çerezi
                    </th>
                    <td role="cell" data-label="Ne için kullanılır">
                      Giriş yaptığınızı hatırlar; hesabınıza ait sayfaların ve
                      ders içeriklerinin açılmasını sağlar.
                    </td>
                    <td role="cell" data-label="Kim yerleştirir">
                      Medaris kimlik sunucusu ve uygulamalar
                    </td>
                    <td role="cell" data-label="Süre">
                      {legal.sessionCookieLifetime}
                    </td>
                    <td role="cell" data-label="Tür">
                      Zorunlu
                    </td>
                  </tr>
                  <tr role="row">
                    <th scope="row" role="rowheader">
                      Cihaz çerezi
                    </th>
                    <td role="cell" data-label="Ne için kullanılır">
                      Her ziyaretçiye rastgele üretilmiş bir cihaz tanımlayıcısı
                      verir. Erişimi kaldırılan bir kişinin aynı cihazdan başka
                      bir hesapla dönmesini önlemek için kullanılır; tarayıcı
                      parmak izi alınmaz.
                    </td>
                    <td role="cell" data-label="Kim yerleştirir">
                      Medaris
                    </td>
                    <td role="cell" data-label="Süre">
                      {legal.deviceCookieLifetime}
                    </td>
                    <td role="cell" data-label="Tür">
                      Zorunlu
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mds-caption">
              Çerez adları ve süreleri kesinleştiğinde bu tablo
              güncellenecektir.
            </p>
          </section>

          <section className="mds-reading" aria-labelledby="c2">
            <h2 className="mds-h3" id="c2">
              Çerezleri yönetme
            </h2>
            <p>
              Çerezleri tarayıcınızın ayarlarından silebilir ya da
              engelleyebilirsiniz. Zorunlu çerezler engellenirse giriş yapılamaz
              ve Medaris’in bazı sayfaları çalışmaz.
            </p>
          </section>

          <section className="mds-reading" aria-labelledby="c3">
            <h2 className="mds-h3" id="c3">
              Medaris dışındaki hizmetler
            </h2>
            <p>
              Celse sayfasına gömülen canlı yayın ve ders kayıtları, yayını ya
              da kaydı barındıran hizmetin sunucusundan yüklenir. Celseye
              katılmak için kullanılan toplantı platformları (örneğin Google
              Meet, Zoom ya da Jitsi Meet) de Medaris’ten ayrı hizmetlerdir. Bu
              hizmetler kendi çerezlerini yerleştirebilir; onlar için ilgili
              hizmetin kendi metinleri geçerlidir.
            </p>
          </section>

          <section className="mds-reading" aria-labelledby="c4">
            <h2 className="mds-h3" id="c4">
              Daha fazla bilgi
            </h2>
            <p>
              Cihaz tanımlayıcısının amacı, saklama süresi ve hukuki dayanağı{" "}
              <a href="/aydinlatma-metni">Aydınlatma Metni</a>’nde, erişimin
              kaldırılması ve cihaz kısıtlaması{" "}
              <a href="/kullanim-sartlari">Kullanım şartları</a>’nda yazılıdır.
              Sorularınız için <a href="/iletisim">İletişim</a> sayfasından
              yazabilirsiniz.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter current="/cerezler" />
    </>
  );
}
