# 08 Ders sayfasi - basvuru bekliyor

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/08-ders-sayfasi-basvuru-bekliyor/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Rota `/[locale]/courses/[courseId]`; enrollment.status=PENDING gorunumu.

## 2. Gosterim
- Kirinti: `{Kosk} / {Ders}`; Arapca etiket (`الصرف`), baslik, aciklama (uzun metin), meta `Süleymaniye Medresesi·Nûruosmaniye Köşkü·12 hafta·12 celse·12 saat`, `Müderrisler: ...`
- `Derse kayıt` karti: `12 hafta · 13 Eylül – 29 Kasım 2026`, `Her pazar 21:00 · 60 dk`, `Kayıt onaya bağlı: başvurunu ders kadrosu değerlendirir.` + duruma gore eylem (asagida)
- `SIRADAKİ CELSE` karti: goreli zaman (`3 gün sonra`), celse adi, tarih, `Hafta 4 · 60 dk`; altta `Ders içerikleri, toplantı bağlantıları ve ders kayıtları kayıtlı talebelere açıktır. Derse kaydolduğunda görebilirsin.`
- Sekmeler `Müfredat` / `Ders kayıtları` (sayac) / `Müderrisler`; Müfredat: 12 haftalik akordeon (`HAFTA N`, `Sona erdi`, hafta adi, `1 celse · 60 dk`, kilitli satirlarda `, kilitli`); acik haftada celse satiri (`Canlı ders · 4 Eki Paz 21:00 · 60 dk`)
- `Örnek celse` (isPreview): `Bu celseyi kaydolmadan izleyebilir...`; video alani `Ders kaydı burada oynar`, `Herkese açık`, kayit basligi + `58 dk`, aciklama, `Celse akışı` (saat + adim), `Kaynaklar` (PDF)
- Saatler Europe/Istanbul; Zaman/saat: IANA `Europe/Istanbul` sabit gosterim (ekranda 'Saatler Istanbul saatiyle'); scheduledAt withTimezone: course.schema.ts:73
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya
- Kayit karti: rozet `Onay bekliyor`, `Başvurun bugün 10:02’de ders kadrosuna iletildi. Onaylandığında bildirim alırsın.`, `12 hafta · ...`, `Her pazar 21:00 · 60 dk`, `Başvuruyu geri çek`
- Basvuru zamani: EnrollmentResponse.createdAt (course-response.dto.ts:76) kullanilir

## 3. Durumlar
- Yukleniyor: geri cek dugmesi spinner
- Hata: toast, durum degismez
- Onay gelince sayfa yenilenince 12 gorunumune gecer
- Form yok; geri cekme icin onay penceresi: tuvalde YOK (dogrulanamadi)

## 4. Etkilesimler
- `Başvuruyu geri çek` -> basvuru silinir, sayfa 06 gorunumune doner
- Diger etkilesimler 05 ile ayni

## 5. API
- GET /courses/:id: course.controller.ts:92 (CourseDetailResponse: weeks[].lessons[] icinde scheduledAt, meetingUrl, agenda, isPreview, duration, kaynak; apps/tedrisat/src/course/dto/course-response.dto.ts:8-45) -> VAR; `enrollment.status=PENDING`, `createdAt` var
- `Başvuruyu geri çek`: **YOK - yeni** `DELETE /courses/:id/enroll` (kendi PENDING kaydini siler). Mevcut DELETE /courses/:id/enrollments/:userId yalniz kosk sahibi ve yalniz PENDING icin: course.controller.ts:211, course.service.ts:148-160 (`assertCourseOwner`) -> talebe kullanamaz
- Sunucu tarafi kilit: kayitsiz/PENDING/erisimi kaldirilmis kullaniciya meetingUrl, agenda, kaynak ve ders-kaydi URL'leri DONMEMELI (bugun donuyor: meetingUrl maskelenmeden doner: apps/tedrisat/src/course/course.repository.ts:190 ve :359 (kayitsiz/PENDING kullaniciya da); celse kilidi sunucuda YOK)

## 6. Sinif
**B** - Basvuru durumu okunabiliyor ama basvuruyu geri cekme endpoint'i yok; yeni endpoint (kucuk).

## 7. Mevcut durum
- Kismen: apps/tedris/features/courses/components/course-page.tsx (484 satir; kayit/PENDING/ilerleme: :62-64, :72) + syllabus.tsx + apps/tedris/app/[locale]/courses/[courseId]/page.tsx (`isPending` :62; `CoursePage` icinde `pendingApproval`: tedris.json:47)
- Eksik: geri cek, basvuru saati, tuval duzeni

## 8. Kabul kriterleri
1. PENDING kullanici `Onay bekliyor` rozetini ve basvuru saatini gorur
2. Toplanti baglantisi/kaynak/ders kaydi donmez
3. `Başvuruyu geri çek` tiklaninca enrollment silinir ve sayfa `Kayıt başvurusu yap` durumuna doner
4. Baska kullanicinin basvurusu geri cekilemez (403/404)
5. Onaylandiktan sonra geri cekme 404 doner

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Durum esleme PENDING -> eylem
2. Saat bicimi `bugün 10:02`

**Playwright e2e (gercek API):**
1. Seed PENDING -> sayfa `Onay bekliyor`
2. Geri cek -> DB'de satir yok, sayfa kayitsiz gorunumu
3. Kosk sahibi onaylar (API) -> sayfa yenile -> kayitli gorunum
4. Baska kullanici tokeniyla DELETE -> 404/403

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
