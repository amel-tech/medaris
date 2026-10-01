# 02 - Ana sayfa — köşk nazımı

Kaynak: local_docs/ekranlar/nizam/02-ana-sayfa-kosk-nazimi/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Tek köşkün nazımı için açılış panosu: önümüzdeki 7 günün celseleri, bekleyen başvurular, müderris özeti. Köşk değiştirici üst çubukta; telefon kopyası var (ekran-telefon).
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/` (rol = köşk nazımı); köşk bağlamı oturumda seçili köşk (`/kosks/[id]` yapısı apps/nizam/app/[locale]/kosks/[id]/page.tsx). Telefonda menü çekmecesi (_kurallar.md 18).
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Üst: "Köşk değiştir: Nûruosmaniye Köşkü" seçici (birden çok köşkte), rol etiketi "Köşk nazımı".
- Menü: GENEL (Ana sayfa, Bildirimler 3), KÖŞK (Dersler 7, Celseler "1 bağlantısı eksik", Talebeler, Başvurular 5 bekleyen, Ders talepleri 1 bekleyen, Ders kayıtları, Köşk desteleri, Yasaklamalar, Arşiv), YÖNETİM (İzinler, Köşk ayarları).
- Selam: "Selâmün aleyküm, {Ad} Hoca. Önümüzdeki yedi günde 4 celse var; birinin toplantı bağlantısı eksik." Buton "Ders aç".
- Uyarı: "Bir celsenin toplantı bağlantısı eksik" (ders adı, tarih; "bağlantı olmadan talebeler celseye katılamaz").
- Stat: Ders 7, Kayıtlı talebe 74, Yaklaşan celse 4, Bekleyen başvuru 5.
- Celseler kartı: sekmeler Yaklaşan 4 / Geçmiş 13 / İptal edilen 1; tablo Ders (hafta, müderris+imam, medrese), Zaman, Platform (Zoom/Google Meet/"—" + "Toplantı bağlantısı yok"), Talebe, Durum (Bağlantı eksik/Planlandı), İşlem ("Toplantı bağlantısı ekle" / "Celseyi gör" / "Düzenle"); telafi celsesi etiketi.
- Son başvurular tablosu: Talebe, Ders, zaman, "Onayla"/"Reddet".
- Müderrisler listesi: ad, ders sayısı, talebe sayısı (medrese adı varsa).

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Ders aç -> 32. Toplantı bağlantısı ekle / Düzenle -> celse düzenleme (kapsam dışı; doğrulanamadı). Celseyi gör -> celse detayı.
- Onayla -> başvuru onaylanır, satır listeden düşer, sayaç azalır (toast). Reddet -> gerekçe penceresi (_kurallar.md 17; ders başvurusunda gerekçe "isteğe bağlı").
- Sekmeler celse listesini süzer. Köşk değiştir -> bağlam değişir, sayfa yeniden yüklenir.
- Tümünü gör -> Celseler / Başvurular (31) ekranları.

## 5. API
- Başvuru onay/ret VAR: `POST courses/:id/enrollments/:userId/approve` (apps/tedrisat/src/course/course.controller.ts:196), `DELETE courses/:id/enrollments/:userId` (apps/tedrisat/src/course/course.controller.ts:211); bekleyen liste `GET kosks/:koskId/enrollments/pending` (apps/tedrisat/src/course/course.controller.ts:175). Ret gerekçesi alanı yok (DELETE gövdesiz) -> gerekçe için YOK, değişiklik gerekir.
- Köşk dersleri `GET kosks/:koskId/courses` (apps/tedrisat/src/course/course.controller.ts:50) (özet); celse (canlı ders) alanı course.schema.ts:70'te var ama celse listeleme/tarih aralığı uç noktası YOK.
- YOK — yeni endpoint: `GET /kosks/:koskId/dashboard` -> sayılar + `upcomingSessions[]` (7 gün) + `sessionCounts{upcoming,past,cancelled}`; `PATCH /courses/:id/sessions/:sessionId` (toplantı bağlantısı).
- Köşk nazımı rolü: bugün `ROLES.KOSK_MANAGER` yalnız köşk sahibi (`ownerId`, kosk.repository.ts:101) üzerinden çözülür; çoklu nazım ve nazım atama YOK.

## 6. Sınıf
**B** - Başvuru onay uç noktaları hazır, fakat pano/celse listesi ve ret gerekçesi yok; yeni endpoint ile kodlanır. Üçüncü parti gerektirmez.

## 7. Mevcut durum
Kısmi: köşk detay sayfası `apps/nizam/features/kosks/components/kosk-detail-page.tsx` ve bekleyen kayıt listesi `pending-requests.tsx` (Onayla/Reddet); canlı ders editörü `live-lesson-editor.tsx`. Pano, celse tablosu, Stat bileşenleri YOK.

## 8. Kabul kriterleri
1. Köşk nazımı girişte seçili köşkün panosunu görür; PLATFORM bölümü menüde yoktur.
2. Yaklaşan celse sayısı 7 günlük penceredeki celse sayısına eşittir; bağlantısı olmayan celse "Bağlantı eksik" rozetiyle işaretlenir ve üstte uyarı çıkar.
3. Onayla tıklanınca başvuru satırı kalkar ve "Bekleyen başvuru" sayısı 1 azalır.
4. Reddet gerekçe penceresi açar; gönderimden sonra başvuru kalkar.
5. Birden fazla köşkte yetkili kullanıcı Köşk değiştir ile bağlamı değiştirir.
6. Telefonda tablo kart listesine döner, menü çekmecedir.
7. Yetkisi olmayan köşkün id'si 404/403 ile 06 ekranına düşer.

## 9. Test senaryoları
**Unit (Vitest)**
- celse durum rozeti (bağlantı yok/planlandı/telafi).
- 7 gün penceresi gruplama fonksiyonu.
- Onayla/Reddet sonrası önbellek güncelleme (TanStack Query).
- Selam metni çoğul/tekil.

**Playwright e2e (gerçek API'ye karşı)**
1. Köşk nazımı hesabıyla giriş, panoyu aç; stat değerlerini API ile karşılaştır.
2. Bekleyen başvuruyu "Onayla" ile onayla; listeden düştüğünü ve ders kaydının ENROLLED olduğunu doğrula.
3. Başka başvuruyu "Reddet" ile reddet.
4. Bağlantısız celse için "Toplantı bağlantısı ekle" -> uyarı kalkar.
5. 390 px görünümde menü çekmecesini aç.
