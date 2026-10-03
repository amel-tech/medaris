# 12 Ders sayfasi - kayitli talebe (B5)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/12-ders-sayfasi-kayitli-talebe-b5/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Rota `/[locale]/courses/[courseId]`; enrollment.status=ENROLLED.

## 2. Gosterim
- Baslik, aciklama, meta `Nûruosmaniye Köşkü · 8 hafta · 16 celse · 14 saat`; muderris (AK, `İmam`); rozet `Devam ediyor`
- `SIRADAKİ CELSE`: `Öbür gün`, celse adi, `3 Ekim Cumartesi 21:00 · 60 dk`, `Toplantı bağlantısı henüz eklenmedi.`, `Derse devam et`, `Takvime ekle`
- `Ders ilerlemen %40` + `İlerlemeni sen girersin; dersi tamamladığını ders kadrosu onaylar.` + `İlerlemeni güncelle`
- Sekmeler `Müfredat` / `Ders kayıtları (5)` / `Ders destesi` / `Müderrisler`; hafta akordeonu: `Sona erdi`/`Devam ediyor`/`10 Ekim tarihinde açılır`, celse satirlari (`Sıradaki`, `İptal edildi`, telafi)
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya

## 3. Durumlar
- Yukleniyor: iskelet
- Bos: ders destesi yok
- Hata: toast
- Yetkisiz: kayit yoksa 06; erisim kaldirildiysa 13
- Form: ilerleme 0-100 tamsayi (sunucu dogrulamasi: update-progress.dto.ts)

## 4. Etkilesimler
- `Derse devam et` -> sonraki/son izlenen celse sayfasi (15/16)
- `Takvime ekle` -> 22
- `İlerlemeni güncelle` -> ilerleme Dialog/Slider'i, PUT progress
- Celse satiri -> celse sayfasi; `Ders destesi` sekmesi -> deste
- `Ders kayıtları` -> 24

## 5. API
- GET /courses/:id: course.controller.ts:92 (CourseDetailResponse: weeks[].lessons[] icinde scheduledAt, meetingUrl, agenda, isPreview, duration, kaynak; apps/tedrisat/src/course/dto/course-response.dto.ts:8-45) -> VAR (enrollment.progress)
- PUT /courses/:id/progress: course.controller.ts:225 (UpdateProgressDto: progress 0-100, istege bagli status; apps/tedrisat/src/course/dto/update-progress.dto.ts); PENDING/kayitsiz icin 404: course.service.ts:163-175 -> VAR
- UYARI: `dersi tamamladığını kadro onaylar` kurali ile cakisiyor: UpdateProgressDto `status` alani talebeye COMPLETED yazdirabiliyor (update-progress.dto.ts) ve progress>=100 otomatik COMPLETED (course.service.ts:177-180) -> kadro onayi icin **YOK - yeni** `POST /courses/:id/enrollments/:userId/complete`; talebe status gonderemez
- Celse iptali/telafi, hafta `açılır` tarihi, sonraki celse: celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex)
- Ders destesi: kurs-deste iliskisi YOK (flashcard schema'da course/lesson alani dogrulanamadi)

## 6. Sinif
**B** - Detay ve ilerleme hazir; celse durumu (iptal/telafi), tamamlama onayi ve ders destesi icin yeni/degisen endpoint gerekir.

## 7. Mevcut durum
- Kismen: apps/tedris/features/courses/components/course-page.tsx (484 satir; kayit/PENDING/ilerleme: :62-64, :72) + syllabus.tsx + apps/tedris/app/[locale]/courses/[courseId]/page.tsx (ilerleme cubugu :188-200; updateCourseProgress action actions/index.ts:127-139)
- Eksik: SIRADAKİ CELSE, ders destesi, iptal rozetleri

## 8. Kabul kriterleri
1. Kayitli kullanici ilerleme yuzdesini gorur ve 0-100 arasi guncelleyebilir
2. Talebe 100 girse bile COMPLETED yalniz kadro onayiyla (karar sonrasi: dogrulanamadi)
3. `SIRADAKİ CELSE` gelecekteki en yakin iptal edilmemis celsedir
4. Iptal celse `İptal edildi` rozeti ile listelenir
5. Henuz acilmamis haftalar `{tarih} tarihinde açılır` gosterir ve icerigi kilitlidir

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Siradaki celse hesabi (iptal/gecmis atlanir)
2. Ilerleme formu: 0-100 sinir degerleri

**Playwright e2e (gercek API):**
1. Seed ENROLLED -> sayfa; ilerlemeyi 55 yap -> yenile -> %55
2. 101 gonder -> hata
3. `Takvime ekle` -> menu
4. Celse satirina tikla -> celse sayfasi

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
