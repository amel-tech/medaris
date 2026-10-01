# 06 Ders sayfasi - girisli, kayitsiz (B5)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/06-ders-sayfasi-girisli-kayitsiz-b5/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Rota `/[locale]/courses/[courseId]` (mevcut). Girisli ama kaydi olmayan talebe: `Kayıt başvurusu yap`.

## 2. Gosterim
- Kirinti: `{Kosk} / {Ders}`; Arapca etiket (`الصرف`), baslik, aciklama (uzun metin), meta `Süleymaniye Medresesi·Nûruosmaniye Köşkü·12 hafta·12 celse·12 saat`, `Müderrisler: ...`
- `Derse kayıt` karti: `12 hafta · 13 Eylül – 29 Kasım 2026`, `Her pazar 21:00 · 60 dk`, `Kayıt onaya bağlı: başvurunu ders kadrosu değerlendirir.` + duruma gore eylem (asagida)
- `SIRADAKİ CELSE` karti: goreli zaman (`3 gün sonra`), celse adi, tarih, `Hafta 4 · 60 dk`; altta `Ders içerikleri, toplantı bağlantıları ve ders kayıtları kayıtlı talebelere açıktır. Derse kaydolduğunda görebilirsin.`
- Sekmeler `Müfredat` / `Ders kayıtları` (sayac) / `Müderrisler`; Müfredat: 12 haftalik akordeon (`HAFTA N`, `Sona erdi`, hafta adi, `1 celse · 60 dk`, kilitli satirlarda `, kilitli`); acik haftada celse satiri (`Canlı ders · 4 Eki Paz 21:00 · 60 dk`)
- `Örnek celse` (isPreview): `Bu celseyi kaydolmadan izleyebilir...`; video alani `Ders kaydı burada oynar`, `Herkese açık`, kayit basligi + `58 dk`, aciklama, `Celse akışı` (saat + adim), `Kaynaklar` (PDF)
- Saatler Europe/Istanbul; Zaman/saat: IANA `Europe/Istanbul` sabit gosterim (ekranda 'Saatler Istanbul saatiyle'); scheduledAt withTimezone: course.schema.ts:73
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya
- Kayit karti eylemi: `Kayıt başvurusu yap` + `Onaylandığında bildirim alırsın.`; kayit onaysiz ders ise (`requiresApproval=false`) metin/eylem `Kayıt ol` (mevcut `CoursePage.enroll`) - tuvalde bu varyant YOK, dogrulanamadi
- Kirinti tek kosk: `Nûruosmaniye Köşkü / Bina ve İzhar Şerhi`

## 3. Durumlar
- Yukleniyor: dugme `Kaydolunuyor...` (CoursePage.enrolling)
- Hata: toast; zaten kayitli -> idempotent mi dogrulanamadi (courseRepo.enroll davranisi okunmadi)
- Yetkisiz: oturumsuz -> 05
- Form yok

## 4. Etkilesimler
- `Kayıt başvurusu yap` -> POST enroll; basarida 07 penceresi + sayfa 08 durumuna gecer
- Diger: 05 ile ayni

## 5. API
- POST /courses/:id/enroll: course.controller.ts:153; requiresApproval ise PENDING, degilse ENROLLED: apps/tedrisat/src/course/course.service.ts:107-120 -> VAR (requiresApproval=true ise PENDING)
- GET /courses/:id: course.controller.ts:92 (CourseDetailResponse: weeks[].lessons[] icinde scheduledAt, meetingUrl, agenda, isPreview, duration, kaynak; apps/tedrisat/src/course/dto/course-response.dto.ts:8-45) -> VAR; `enrollment` null = kayitsiz
- Kayit onayi icin `Onaylandığında bildirim alırsın`: bildirim uretimi YOK (apps/tedrisat/src altinda notification modulu yok, dogrulanamadi -> `ls` ile bos); bkz. 36
- Sunucu tarafi kilit: kayitsiz/PENDING/erisimi kaldirilmis kullaniciya meetingUrl, agenda, kaynak ve ders-kaydi URL'leri DONMEMELI (bugun donuyor: meetingUrl maskelenmeden doner: apps/tedrisat/src/course/course.repository.ts:190 ve :359 (kayitsiz/PENDING kullaniciya da); celse kilidi sunucuda YOK)
- Ders kadrosu onayi: POST /courses/:id/enrollments/:userId/approve (course.controller.ts:196) VAR

## 6. Sinif
**B** - Kayit akisi hazir; maskeleme, celse zaman/durum alanlari ve bildirim icin degisen endpoint gerekir.

## 7. Mevcut durum
- Kismen: apps/tedris/features/courses/components/course-page.tsx (484 satir; kayit/PENDING/ilerleme: :62-64, :72) + syllabus.tsx + apps/tedris/app/[locale]/courses/[courseId]/page.tsx (enrollInCourse actions/index.ts:117; isPending :62)
- Eksik: tuvaldeki duzen, `SIRADAKİ CELSE`, 07 penceresi

## 8. Kabul kriterleri
1. Kayitsiz kullanici `Kayıt başvurusu yap` gorur
2. Tiklayinca enrollment PENDING olusur (requiresApproval) ve sayfa 08'e gecer
3. Kilitli celse icerigi ve toplanti baglantisi donmez
4. Ayni istek iki kez atilsa ikinci kayit olusmaz (dogrulanamadi - e2e ile olc)
5. Hata durumunda dugme tekrar aktif ve toast gorunur

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Kayit dugmesi: yukleniyor/hata durumlari
2. Durum -> eylem esleme tablosu

**Playwright e2e (gercek API):**
1. Seed: requiresApproval ders, kayitsiz kullanici -> `Kayıt başvurusu yap` tikla -> 07 penceresi -> `Tamam` -> sayfa `Onay bekliyor`
2. API: enrollments tablosunda PENDING satiri
3. Ikinci tiklama -> hata yok, tek kayit

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
