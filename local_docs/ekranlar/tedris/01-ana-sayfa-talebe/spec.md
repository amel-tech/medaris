# 01 Ana sayfa (talebe)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/01-ana-sayfa-talebe/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Giris yapmis talebenin acilis ekrani. Mevcut rota: `/[locale]` -> apps/tedris/app/[locale]/page.tsx (yalniz `HomePage.greeting` metni, 11 satir) ve `/[locale]/home` -> apps/tedris/app/[locale]/home/page.tsx (6 satir). Oneri: gercek ekran `/[locale]/home`; giris yapmis kullanici `/`'ten `/home`'a yonlendirilir (yonlendirme kurali dogrulanamadi).

## 2. Gosterim
- Selamlama: `Selâmün aleyküm, {ad}` (ad = oturum `given_name`/`name`; apps/tedrisat course.controller.ts:158-162 ayni claim'leri kullaniyor) + alt satir `Sıradaki celsen {goreli gun}, {gun} {saat}'te.`
- Sıradaki celse karti: ders adi (link -> ders sayfasi), `Hafta N`, kosk adi; rozet `CANLI DERS`, goreli zaman rozeti (`Öbür gün`), `Takvime ekle` dugmesi, celse basligi, tarih-saat, sure (dk); toplanti baglantisi yoksa `Toplantı bağlantısı henüz eklenmedi.`; baslik yaninda `Celse sayfası` linki
- Sonraki celseler listesi (3 satir): baslik, `Canlı ders · {ders} · Hafta N · {tarih}`, sure; `Programım` linki
- Kaldığın yerden devam et: 3 ders karti (Arapca kapak etiketi `الصرف`, ders adi, muderrisler, `İlerlemen %N` ilerleme cubugu, alt satir kosk/medrese + `Sonraki celse ...`); `Derslerim` linki
- Bugün çalışılacak desteler: ad, `Senin desten · N kart tekrar bekliyor` / `Köşk destesi · N yeni kart`, `Çalış` dugmesi; `Desteler` linki
- Takip ettiğin köşklerden: ders adi, kosk, muderris; `Keşfet` linki
- Ust cubuk: Medaris logosu, Ana sayfa, Kesfet, Derslerim, Programim, Desteler, zil, avatar menusu (Hesabim). Telefon (390 px) menu cekmecesi `_kurallar.md` madde 18
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya

## 3. Durumlar
- Yukleniyor: sunucu bileseni + Suspense; her bolum icin iskelet (Skeleton)
- Bos: kayitli ders yoksa `Sıradaki celse`/`Kaldığın yerden` yerine Keşfet'e yonlendiren EmptyState (metin tuvalde YOK, dogrulanamadi); deste yoksa `Desteler` bolumu gizlenir veya bos metin (tuvalde yok)
- Hata: bolum bazli Alert + yeniden dene; bir bolumun hatasi digerlerini dusurmez
- Yetkisiz: oturum yoksa middleware `/home`'u acik birakiyor (apps/tedris/middleware.ts:28) -> girissiz durumda bu ekran degil giris/ziyaretci gorunumu gosterilmeli (tuvalde karsiligi yok, dogrulanamadi)
- Form dogrulamasi yok

## 4. Etkilesimler
- Ders adi / `Celse sayfası` -> ders ve celse sayfalari (15/16)
- `Takvime ekle` -> 22'deki menu
- `Programım` -> 21; `Derslerim` -> 20; `Keşfet` -> 02
- `Çalış` -> deste calisma ekrani (apps/tedris/app/[locale]/decks/study/[id])
- Kosk ders linki -> 06/12 ders sayfasi

## 5. API
- Kullanici adi: oturumdan (next-auth); API gerekmez
- Kayitli dersler + ilerleme: GET /courses/enrolled: course.controller.ts:79; PENDING kayitlar HARIC: apps/tedrisat/src/course/course.repository.ts:98 -> VAR, ama celse tarihi icermiyor (EnrolledCourseResponse'ta lessons yok: course-response.dto.ts:120-127)
- Siradaki celse + sonraki celseler (kullanicinin tum derslerinden, zamana gore): **YOK - yeni endpoint** `GET /sessions/upcoming?limit=4` -> `{id, courseId, courseTitle, koskName, weekNumber, title, scheduledAt, durationMinutes, status, meetingUrl|null}[]`. Kanit: celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex)
- Dersin `sonraki celse` alani (devam et kartlari): **YOK** -> `EnrolledCourseResponse.nextSession` olarak genisletilmeli
- Tekrar bekleyen kart sayisi: **YOK** - apps/tedrisat/src/flashcard ve schema/flashcard*.ts icinde `due|nextReview|dueAt` eslesmesi bulunamadi (grep bos) -> `GET /flashcard/decks?include=dueCount` veya yeni `GET /flashcard/decks/due`
- Kosk destesi / `yeni kart` sayisi: kosk-deste iliskisi YOK (flashcard-deck.schema.ts'te kosk alani dogrulanamadi)
- Takip edilen koskler: `isFollowing` KoskResponse'ta var ama takip edilen kosklerin ders listesi icin filtre YOK: GET /kosks: apps/tedrisat/src/kosk/kosk.controller.ts:49 (page, limit; filtre parametresi yok) -> **YOK - yeni** `GET /kosks/followed/courses`

## 6. Sinif
**B** - Tek basina frontend yetmez: celse toplu listesi, ders basina sonraki celse ve tekrar bekleyen kart sayisi icin yeni/degisen endpoint gerekir. Ucuncu parti yok.

## 7. Mevcut durum
- Yalniz selamlama yer tutucusu: apps/tedris/app/[locale]/page.tsx, apps/tedris/app/[locale]/home/page.tsx
- Yeniden kullanilabilir: features/courses/components/continue-card.tsx (ilerleme karti), apps/tedris/features/courses/components/cover.tsx (kapak/HueAvatar), live-status-badge.tsx, actions/index.ts `getMyCourses` (:83)
- Deste calisma: apps/tedris/features/flashcards/components/decks-page.tsx, study-page.tsx

## 8. Kabul kriterleri
1. Giris yapmis kullanici `/home`'da ekrandaki 6 bolumu gorur; bolum basliklari tuvaldeki metinle birebir
2. Selamlamadaki ad oturumdaki ada esittir; goreli gun (`bugun`, `yarin`, `öbür gün`, gun adi) Europe/Istanbul'a gore hesaplanir
3. Sıradaki celse = kullanicinin kayitli (ENROLLED) derslerindeki en yakin gelecek, iptal edilmemis celse
4. PENDING kayitli derslerin celseleri hicbir bolumde gorunmez
5. Toplanti baglantisi yoksa tuvaldeki bilgi kutusu gorunur; varsa baglanti burada gosterilmez (celse sayfasina yonlendirir) - dogrulanamadi, urun karari
6. `Kaldığın yerden devam et` yalniz ilerlemesi < 100 olan dersleri listeler (mevcut davranis: learning/page.tsx filtre)
7. Bir bolum API hatasi verirse diger bolumler gorunur kalir
8. Telefon 390 px'te tek sutun, yatay kayma yok

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Goreli gun fonksiyonu: bugun/yarin/öbür gün/gun adi (Europe/Istanbul, DST disi)
2. Selamlama bileseni: ad yoksa `Selâmün aleyküm` yalniz
3. Bolum bileseni: bos liste -> EmptyState; hata -> Alert

**Playwright e2e (gercek API):**
1. Seed: 3 kayitli ders, yakin tarihli celseler -> `/tr/home` acilir, `Sıradaki celse` kartindaki baslik ilk celsenin basligi
2. `Takvime ekle` tikla -> 22 menusu acilir
3. `Programım` linki -> `/schedule` (onerilen rota) yuklenir
4. Kayitsiz kullanici (0 ders) -> EmptyState
5. API 500 simulasyonu (route intercept yerine test sunucusunu durdur) -> bolum Alert gosterir

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
