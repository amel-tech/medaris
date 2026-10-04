// biome-ignore-all lint/a11y/noRedundantRoles: the stacked table (mds-table--stack) restates every table role on purpose; below 768 it is display: block, which can drop the native semantics (design-system/medaris-unified/components/Table.prompt.md)
// biome-ignore-all lint/a11y/useSemanticElements: same reason; the roles sit on the semantic elements already
import { setRequestLocale } from "next-intl/server";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { cookieGroups } from "~/content/cerezler";

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
              metin dosyasıdır. Medaris, giriş ve güvenlik için gereken
              çerezleri ve sayfaları sizin için doğru göstermeye yarayan birkaç
              tercih çerezini kullanır.
            </p>
            <p className="mds-caption">
              Son güncelleme: <time dateTime="2026-10-04">4 Ekim 2026</time>
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
              Analitik, ölçüm ya da reklam çerezi kullanılmaz; ziyaretiniz başka
              bir siteye ya da reklam ağına bildirilmez.
            </div>
          </div>

          {cookieGroups.map((group) => (
            <section
              key={group.id}
              className="flex min-inline-0 flex-col gap-3"
              aria-labelledby={`c-${group.id}`}
            >
              <h2 className="mds-h3" id={`c-${group.id}`}>
                {group.title}
              </h2>
              <p className="mds-body max-inline-measure">{group.intro}</p>
              <div className="mds-table-wrap">
                <table
                  className="mds-table mds-table--stack"
                  role="table"
                  aria-labelledby={`c-${group.id}`}
                >
                  <colgroup>
                    <col className="[--mds-col-w:24%]" />
                    <col />
                    <col className="[--mds-col-w:16%]" />
                    <col className="[--mds-col-w:20%]" />
                  </colgroup>
                  <thead role="rowgroup">
                    <tr role="row">
                      <th scope="col" role="columnheader">
                        Ad
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
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {group.rows.map((row) => (
                      <tr key={row.names} role="row">
                        <th scope="row" role="rowheader">
                          <code className="mds-mono break-words">
                            {row.names}
                          </code>
                        </th>
                        <td role="cell" data-label="Ne için kullanılır">
                          {row.purpose}
                        </td>
                        <td role="cell" data-label="Kim yerleştirir">
                          {row.setBy}
                        </td>
                        <td role="cell" data-label="Süre">
                          {row.lifetime}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <p className="mds-caption max-inline-measure">
            Güvenli bağlantıda giriş çerezlerinin adı{" "}
            <code className="mds-mono">__Secure-</code> ya da{" "}
            <code className="mds-mono">__Host-</code> ile başlar; bu ek,
            tarayıcının çerezi yalnız şifreli bağlantıda göndermesini sağlar.
          </p>
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
              Celse sayfasındaki canlı yayın YouTube’un çerezsiz oynatıcısıyla
              (youtube-nocookie.com) açılır; yayının altındaki canlı sohbet ise
              youtube.com’dan yüklenir ve YouTube’un çerezlerini kullanır.
              Google Drive’daki ders kayıtları Google’ın oynatıcısıyla,
              Bunny’deki kayıtlar Bunny’nin oynatıcı sayfasında açılır. Celseye
              katılmak için kullanılan toplantı platformları (örneğin Google
              Meet, Zoom ya da Jitsi Meet) da Medaris’ten ayrı hizmetlerdir. Bu
              hizmetler kendi çerezlerini yerleştirebilir; onlar için ilgili
              hizmetin kendi metinleri geçerlidir.
            </p>
          </section>

          <section className="mds-reading" aria-labelledby="c4">
            <h2 className="mds-h3" id="c4">
              Daha fazla bilgi
            </h2>
            <p>
              Kişisel verilerinizin nasıl işlendiği{" "}
              <a href="/aydinlatma-metni">Aydınlatma Metni</a>’nde, erişimin
              kaldırılması <a href="/kullanim-sartlari">Kullanım şartları</a>
              ’nda yazılıdır. Sorularınız için <a href="/iletisim">İletişim</a>{" "}
              sayfasından yazabilirsiniz.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter current="/cerezler" />
    </>
  );
}
