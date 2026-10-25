# platform-admin: rapor (ce47fce8)

**Sonradan işlenenler (main 4b1f9f78):** #369 (F02). Değişen öğelerin `source:` satırları 4b1f9f78'i gösteriyor, gerisi ce47fce8'i.

## Yazılanlar (`delurio page --strict` hepsi uyarısız; `delurio check graphs/platform-admin --strict` exit 0)

- `ban-roster`: nizam Talebeler'den yasakla/kaldır/onayla. 10 durum, 3654 yapılandırma, 6/6.
- `ban-notify` (ekransız): yeni yasakta kime ne yazılır. 5, 2160, 5/5.
- `ban-lists`: köşk ve Medaris Yasaklamalar'ı; kaldırma, genişletme. 11, 1458, 6/6.
- `medrese-bans`: nazar'da medrese yasakları, genişletme, kalıcı yasak talebi. 16, 32946, 6/6.
- `nizam-notifications`: Bildirimler. 10, 132, 3/3.
- `archive-restore`: Arşiv, geri al, kalıcı sil. 14, 2486, 6/6.
- `partner-apps`: Ortak uygulamalar kaydı. 13, 3612, 5/5.
- `partner-codes`: nazar Ders ayarları kodları ve ortağın PUT'u. 13, 11328, 6/6.
- `audit-log`: Denetim kaydı, dışa aktarma. 6, 90, 3/3.
- `platform-policies`: Platform ayarları. 8, 208, 4/4.
- `domain`: 10 varlık, 40 eylem, 11 politika, 8 değişmez.

## Okumamın en zayıf olduğu yerler

- Kişiler tek rol ve varsayılan izinle modellendi. Çok rollü kişiler ve tek tek izinler izlenmedi (`rolesConferring` her rolü ayrı tartar).
- Medaris nazımı türevlerinin izinleri (ban_scoped, kosk_edit, course_hide…) varsayım.
- Köşk nazımının nazar'ı açabildiği varsayıldı; kodlar yalnız nazar'da eşleniyor.
- Medrese dersleri arşiv modelinde yok. Gizli köşkte geri alınan destenin görünür olup olmadığını izlemedim.
- Bildirim bağlantısına tıklayınca "okundu" isteğinin gezinme sırasında tamamlandığını doğrulamadım. Dışa aktarma hata verince tarayıcının ne indirdiğini de doğrulamadım.

## Bulgular

1. **PLATFORM-ADMIN-1 (orta, F16)** Talebeler her yasaklı satıra "Yasağı kaldır" koyuyor; liste yanıtında `viewerMayLift` hiç yok (`present.ts:138`, `course.service.ts:1601`). Yol: muderris, courseByKosk → DONE, LIFT → 403.
2. **-2 (yüksek, F02; düzeldi: #369)** Başvurular'daki Onayla yasaklı başvuranı kaydediyordu (`course.service.ts:1621`). Toplu ekleme ve ortak uygulama yolu reddediyor. Yol: pending, courseByMuderris → DONE, APPROVE, DONE. #369'dan beri yasaklı başvuran 403 `BAN_ACTIVE` alıyor. Güvence `barred-never-seated` (onaydan sonra burada konan yasak sayılmaz). Korumayı kaldıran kopyada kırılıyor, yenisinde tutuyor. Ret metni -19'da.
3. **-3 (yüksek, F09)** Her Medaris nazımı gerekçeli yasak bildirimi alıyor (`ban.repository.ts:448`). Ban kodu olmayanın bildirim bağlantısı "izniniz yok"a çıkıyor. Yol: medarisOther → DONE, OPEN_LINK.
4. **-4 (orta, F18)** Medrese yolundan konan yasak hiçbir nazıma bildirilmiyor (`ban.service.ts:505, 551`). Yol: route=madrasah, COURSE, koskNazim.
5. **-5 (orta)** Köşk sayfasındaki "Köşkten de yasakla" tek tık ve onaysız çalışıyor. Ders yasağının gerekçesini kopyalıyor; denetime `ban.create` olarak yazılıyor (`bans-view.tsx:137`). Medaris sayfası yeni gerekçe istiyor.
6. **-6 (düşük)** Kaldıramama notu yalnız yasağı koyanın rolüne bakıyor. Kademesi yeten ama izni olmayana "üst kademe" diyor (`present.ts:51`, nazar `bans.ts:134`).
7. **-7 (düşük)** Medrese çapındaki yasak nizam listelerinde "Köşk", Talebeler'de "Bu ders" yazıyor (`present.ts:71`, `roster-table.tsx:164`).
8. **-8 (orta, F28)** Kalıcı yasak talebi kimseye ulaşmıyor: liste yok, bildirim yok, pano 0 sabit (`nizam-dashboard.service.ts:77`). Nazar ise "Medaris yönetimine iletildi" diyor.
9. **-9 (düşük)** nazar Talebeler her satıra Yasakla koyuyor; yalnız students_view tutana 403 dönüyor (`students-table.tsx:170`).
10. **-10 (düşük)** Deste geri alınırken köşkünün gizli olup olmadığı sorulmuyor (`archive.repository.ts:472`).
11. **-11 (orta, boşluk)** Cinsiyet zorunlu değil: ortak uygulama yolu cinsiyetsiz hesabı derse kaydediyor (`partner-enrollment.service.ts:309`). Kodda hiçbir kayıt yolu cinsiyet sormuyor, ayrım da yok.
12. **-12 (düşük)** Denetim kaydı sayfası "[KVKK saklama süresi]" yer tutucusunu gösteriyor (`audit-view.tsx:336`). Saklama ya da silme yok; `details` kişisel veri ve yasak gerekçesi taşıyor.
13. **-13 (orta)** "Kayıt her zaman onaylı" açıkken ortak uygulama kayıtları yine doğrudan kaydoluyor (`bulk-enrollment.service.ts:189`). Yol: approval=on, via=partner.
14. **-14 (düşük)** Köşk nazımı medrese çapındaki yasağı kaldıramıyor (`ban-authority.ts:135`); API açıklaması ve yorum "kaldırır" diyor (`madrasah-ban.controller.ts:107`, `ban-tier.ts:14`).
15. **-15 (düşük, F29)** Kaldırma kimseye bildirilmiyor. "Yeniden başvurabilir" notu başka bir yasak sürerken de çıkıyor.
16. **-16 (düşük)** Başnazıma hiç yasak bildirimi yazılmıyor; Bildirimler sayfası hep boş (`ban.repository.ts:432`).
17. **-17 (düşük, a11y)** Ortak uygulama diyalogları odağı ilk alana değil Kapat'a veriyor (`partners-view.tsx:402, 491`).
18. **-18 (düşük)** Yalnız `platform.kosk_edit` tutan Medaris nazımı her köşkün arşivini okuyor, hiçbir şeyi geri alamıyor (`hide-codes.ts:12`).
19. **-19 (düşük, yeni)** nizam'da yasaklı başvurana basılan Onayla "Bu başvuruya karar verme yetkiniz yok." diyor. `BAN_ACTIVE` bir 403 olduğu için `decisionErrorKey` onu yetki hatası sayıyor (`present.ts:183`). Karar veren kişinin yetkisi var, engel başvuranın yasağı.

## Eski bulgular

F02 düzeldi (#369). F09, F16, F18, F28, F29 sürüyor. F17 de sürüyor ama biçimi değişti: ban_scoped Medaris nazımı Talebeler'i hiç açamıyor (`course.controller.ts:561`), yalnız var olan yasağı genişletebiliyor. F43: `archive-types.ts:8` yorumu hâlâ yanlış; arşivden köşkü yalnız başnazım geri alıyor.

## delurio-graph/0'ın anlatamadıkları

Koşula bağlı `disabled`. `set` ile bir değişkenden ötekine kopya. Dış makineye `by`. İki aktörlü akış. Sıra karşılaştırması (kademe üyelik listesiyle yazıldı). "Okuyucusu olmayan kayıt". Table, Checkbox ve Switch bileşenleri. Yazan GET'ler (`exportAuditLog`, `lookupUser`) changes denetimine girmiyor. İmkânsız başlangıçlar `always` ile normalleştirildi.

## Kapsam

ban, madrasah-ban, notification, archive, audit, platform-policy, partner-admin, partner-codes ve partner-enrollment (PUT) denetleyicileri ile ilgili nizam ve nazar sayfaları. Pano, kurs arşivi ve köşk, ders, medrese için kendi geri-al yolları yalnız domain'de. medaris-nazimlari, izin-gruplari, pasif-kapsamlar başka alanların.
