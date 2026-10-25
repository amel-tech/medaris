# Medaris bulguları (ce47fce8, 25 Ekim 2026)

Graf koddan çıkarılırken bulunanlar. Her bulgunun bağlamı, ihlal yolu ve `dosya:satır` kanıtı alanın `REPORT.md`'sinde. 16 Ekim'deki ilk çıkarımın F01–F43 numaraları, hâlâ geçerli olanlarda parantez içinde.

| Alan | Yüksek | Orta | Düşük | Rapor |
|---|---|---|---|---|
| nav | 1 | 9 | 8 | [nav/REPORT.md](nav/REPORT.md) |
| auth-account | 0 | 3 | 7 | [auth-account/REPORT.md](auth-account/REPORT.md) |
| learning | 2 | 3 | 6 | [learning/REPORT.md](learning/REPORT.md) |
| live-media | 0 | 2 | 5 | [live-media/REPORT.md](live-media/REPORT.md) (ayrıca F08, F11, F12, F27 sürüyor) |
| madrasah-staff | 3 | 4 | 9 | [madrasah-staff/REPORT.md](madrasah-staff/REPORT.md) |
| kosk-decks | 1 | 7 | 7 | [kosk-decks/REPORT.md](kosk-decks/REPORT.md) (ayrıca F06, F07, F10, F14, F23, F24, F25, F34 sürüyor) |
| platform-admin | 2 | 6 | 10 | [platform-admin/REPORT.md](platform-admin/REPORT.md) |

Aynı kök birkaç alanda ayrı numara aldı: F02 üç alanda, cinsiyet açığı beş alanda. Aşağıdaki listede tek satırda birleşik.

## Önce bunlar

1. **Yasaklı başvuran tek "Onayla" ile kaydoluyor (F02).** Onay ve yeniden kabul yasağa bakmıyor (`course.service.ts:1621`); toplu ekleme ve ortak uygulama yolu bakıyor. LEARNING-1, MS-5, PLATFORM-ADMIN-2.
2. **nazar'ın medrese dışı ders talebi hiçbir yere ulaşmıyor (F01).** nazar `offsite_course_requests`'e yazıyor (`madrasah-course.repository.ts:404`), nizam `course_requests`'i okuyor (`course-request.repository.ts:119`); talep hep beklemede, metinler ise "başmüderris gerekçeyi görür" diyor. MS-1.
3. **nizam ana sayfasındaki bütün bağlantılar `//` ile başlıyor (yeni, #348 sonrası).** Tarayıcı bunları başka bir sunucu sanıyor (`apps/nizam/features/dashboard/components/medaris-home.tsx:49`); test yalnız `toContain` ile baktığı için geçiyor. NAV-1.
4. **Medrese nazırı atamada hesap ve yasak denetimi yok (F03).** Atanan kişi medrese derslerinde yasaktan da korunuyor (`madrasah-nazir.repository.ts:195`, `ban-tier.ts:80`). MS-2.
5. **Ders talebi kabulü dersin talep edene ait olduğunu denetlemiyor (F05).** nizam kabul cevabını okumadan "Ders açıldı" diyor (`course-request.service.ts:141`, `course-create-form.tsx:160`). MS-4.
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

Gerisi alan raporlarında: orta ve düşük bulgular, yanlış izin gösteren düğmeler, eskimiş yorumlar ve metinler, erişilebilirlik (ilk odak, `alertdialog`), çeviri hataları.

## 16 Ekim'deki bulgular

43 bulgunun hiçbiri tam olarak düzelmemiş. Kısmen düzelenler:
- F26: getSession açıklaması koda uydu; formHelp metinleri hâlâ "yalnız canlıyken" diyor.
- F33: reddedilen deste yeniden istenebiliyor; ret gerekçesi hâlâ görünmüyor.
- F36: sayfa artık salt okunur olduğunu söylüyor; `/mufredat/gizle` hâlâ izin sormuyor.
- F40: Nazar'da geçerli değil; Tedris'te sürüyor.

Eski "rol varsayılanı" riski (kosk-decks) çözülmüş. Bu bir hata değil.
