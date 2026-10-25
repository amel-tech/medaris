# Medaris bulguları (ce47fce8, 25 Ekim 2026)

Graf koddan çıkarılırken bulunanlar. Her bulgunun bağlamı, ihlal yolu ve `dosya:satır` kanıtı alanın `REPORT.md`'sinde. 16 Ekim'deki ilk çıkarımın F01–F43 numaraları, hâlâ geçerli olanlarda parantez içinde.

25 Ekim'de ilk beş bulgunun düzeltmeleri merge edildi (#369–#373) ve graflara işlendi. Her düzeltmenin güvencesi kendi akışında bir `assertion`: düzeltmeden önceki davranışı yazan bir kopyada kırılıyor, yenisinde tutuyor. İşlerken dört yeni bulgu çıktı (aşağıda). Tablo açık bulguları sayıyor, düzelenler ayrı sütunda.

| Alan | Yüksek | Orta | Düşük | Düzelen | Rapor |
|---|---|---|---|---|---|
| nav | 0 | 9 | 8 | 1 | [nav/REPORT.md](nav/REPORT.md) |
| auth-account | 0 | 3 | 7 | 0 | [auth-account/REPORT.md](auth-account/REPORT.md) |
| learning | 1 | 3 | 6 | 1 | [learning/REPORT.md](learning/REPORT.md) |
| live-media | 0 | 2 | 5 | 0 | [live-media/REPORT.md](live-media/REPORT.md) (ayrıca F08, F11, F12, F27 sürüyor) |
| madrasah-staff | 0 | 5 | 11 | 3 | [madrasah-staff/REPORT.md](madrasah-staff/REPORT.md) (MS-1 kısmen düzeldi, kalanı ortada sayılı) |
| kosk-decks | 1 | 7 | 7 | 0 | [kosk-decks/REPORT.md](kosk-decks/REPORT.md) (ayrıca F06, F07, F10, F14, F23, F24, F25, F34 sürüyor) |
| platform-admin | 1 | 6 | 11 | 1 | [platform-admin/REPORT.md](platform-admin/REPORT.md) |

Aynı kök birkaç alanda ayrı numara aldı: F02 üç alanda, cinsiyet açığı beş alanda. Aşağıdaki listede tek satırda birleşik.

## Önce bunlar

1. **Düzeldi (#369): yasaklı başvuran tek "Onayla" ile kaydoluyordu (F02).** Onay ve yeniden kabul yasağa bakmıyordu (`course.service.ts:1621`). Artık onay, geri alınan koltuğun onayı ve yeniden açma 403 BAN_ACTIVE ile reddediliyor. LEARNING-1, MS-5, PLATFORM-ADMIN-2. Kalan: iki uygulamanın ret metni (MS-18, PLATFORM-ADMIN-19).
2. **Kısmen düzeldi (#372): nazar'ın medrese dışı ders talebi hiçbir yere ulaşmıyordu (F01).** Talep artık `course_requests`'e yazılıyor ve köşkün Ders talepleri'ne düşüyor. Kalan: nazar medresenin taleplerini listelemiyor, nizam metinleri ise "başmüderris gerekçeyi görür" diyor. MS-1.
3. **Düzeldi (#370): nizam ana sayfasındaki bütün bağlantılar `//` ile başlıyordu (#348 sonrası).** Tarayıcı bunları başka bir sunucu sanıyordu (`apps/nizam/features/dashboard/components/medaris-home.tsx:49`). NAV-1.
4. **Düzeldi (#371): medrese nazırı atamada hesap ve yasak denetimi yoktu (F03).** Artık hesabı olmayan kimlik ve medresede ya da derslerinden birinde yasaklı kişi reddediliyor. Köşk yasağı sorulmuyor (MS-17). MS-2.
5. **Düzeldi (#373): ders talebi kabulü dersin talep edene ait olduğunu denetlemiyordu (F05).** Artık bir ders tek talebi karşılıyor. nizam kabul edilmeyen talebi kalıcı bir uyarıyla söylüyor; "Ders açıldı" da yanında görünüyor. MS-4.
6. **Her Medaris nazımı gerekçeli yasak bildirimi alıyor (F09).** Yetkisi olmayanın bildirim bağlantısı "izniniz yok"a çıkıyor (`ban.repository.ts:448`). PLATFORM-ADMIN-3.
7. **Yasaklı talebe dersin ve köşkün destelerini okumaya ve çalışmaya devam ediyor (yeni).** `deckSharedWith` yasağa bakmıyor (`deck-sharing.ts:35`). KOSK-DECKS-1.
8. **Bunny token anahtarı yoksa kayıt bağlantısı imzasız ve süresiz (F08).** tedris çerçevelemiyor ama "Ders kaydını aç" bağlantısı olarak veriyor (`bunny-signature.ts:99`, `media-player.tsx:74`).
9. **Cinsiyet zorunlu değil, yüz yüze derslerde ayrım yok.** `user_profiles.gender` boş olabiliyor (`user-profile.schema.ts:33`), ayna yalnız token taşıyorsa yazılıyor (`user-sync.service.ts:75`), Tedris hiçbir adımda istemiyor. Kayıt, toplu ekleme, ortak uygulama yolu ve hoca atama cinsiyete ve `inPerson`'a bakmıyor. NAV-10, AUTH-1, LEARNING-5, MS-7, PLATFORM-ADMIN-11.
10. **Düzenle'den başlatılan yeni yükleme başarısız olursa eski video da siliniyor (yeni).** Celsede hiçbir kayıt kalmıyor (`recording.repository.ts:489-501, 653-683`). LIVE-MEDIA-1.
11. **Dev ve prod tek Bunny kütüphanesini paylaşıyor (yeni).** Yapıştırılan bağlantı yalnız kütüphane numarasıyla denetleniyor; bir ortam ötekinin videosunu değiştirip sildirebiliyor (`recording-link.ts:168`, `recording.repository.ts:1021`). LIVE-MEDIA-2.
12. **Kalıcı yasak talebi kimseye ulaşmıyor (F28).** Liste yok, bildirim yok, pano sayısı 0 sabit (`nizam-dashboard.service.ts:77`); nazar "Medaris yönetimine iletildi" diyor. PLATFORM-ADMIN-8.
13. **Başnazım kendini Medaris nazımı atayabiliyor; hesabı olmayan bir kimlik de atanabiliyor (yeni).** (`permission-admin.service.ts:118`). AUTH-2.
14. **Yasaklı hesap medrese dersine hoca yapılabiliyor (yeni).** Ders nazırında bu denetim var, burada yok (`madrasah-course.service.ts:220`). MS-3.
15. **Yayındaki ders destesi genel deste rotasından silinebiliyor (yeni).** Yalnız-taslak kuralı yalnız ders rotasında (`course-deck.service.ts:136`). KOSK-DECKS-4.

## Düzeltmeler işlenirken bulunanlar (25 Ekim)

- **MS-17 (orta, okumayla; test yazılmadı):** medrese nazırı atanırken köşk yasağı sorulmuyor (`ban.repository.ts:728`). Medrese dersini barındıran köşkün yasağı o derse girişi engelliyor (`ban.repository.ts:219`), ders nazırı ataması da onu sayıyor (`course-nazir.service.ts:223`).
- **MS-18 (düşük):** nazar'da yasaklı başvurana Onayla "Bir şeyler ters gitti" diyor (`pano.ts:253`).
- **MS-19 (düşük):** talepten açılan derste kabul başka bir nedenle başarısız olsa da nizam "talep artık beklemiyor" diyor (`course-create-form.tsx:166`).
- **PLATFORM-ADMIN-19 (düşük):** nizam'da aynı durumda "Bu başvuruya karar verme yetkiniz yok" yazıyor (`present.ts:183`): 403 yetki hatası sayılıyor.

Gerisi alan raporlarında: orta ve düşük bulgular, yanlış izin gösteren düğmeler, eskimiş yorumlar ve metinler, erişilebilirlik (ilk odak, `alertdialog`), çeviri hataları.

## 16 Ekim'deki bulgular

ce47fce8'de 43 bulgunun hiçbiri tam olarak düzelmemişti; F02, F03 ve F05 sonradan düzeldi, F01 kısmen (yukarıda). ce47fce8'de kısmen düzelmiş olanlar:
- F26: getSession açıklaması koda uydu; formHelp metinleri hâlâ "yalnız canlıyken" diyor.
- F33: reddedilen deste yeniden istenebiliyor; ret gerekçesi hâlâ görünmüyor.
- F36: sayfa artık salt okunur olduğunu söylüyor; `/mufredat/gizle` hâlâ izin sormuyor.
- F40: Nazar'da geçerli değil; Tedris'te sürüyor.

Eski "rol varsayılanı" riski (kosk-decks) çözülmüş. Bu bir hata değil.
