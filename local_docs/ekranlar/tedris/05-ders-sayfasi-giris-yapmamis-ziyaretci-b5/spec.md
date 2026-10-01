# 05 Ders sayfasi - giris yapmamis ziyaretci (B5)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/05-ders-sayfasi-giris-yapmamis-ziyaretci-b5/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Mevcut rota `/[locale]/courses/[courseId]` (apps/tedris/app/[locale]/courses/[courseId]/page.tsx, 18 satir) bugun girisli; ziyaretci icin acik olmali.

## 2. Gosterim
- Kirinti: `{Kosk} / {Ders}`; Arapca etiket (`الصرف`), baslik, aciklama (uzun metin), meta `Süleymaniye Medresesi·Nûruosmaniye Köşkü·12 hafta·12 celse·12 saat`, `Müderrisler: ...`
- `Derse kayıt` karti: `12 hafta · 13 Eylül – 29 Kasım 2026`, `Her pazar 21:00 · 60 dk`, `Kayıt onaya bağlı: başvurunu ders kadrosu değerlendirir.` + duruma gore eylem (asagida)
- `SIRADAKİ CELSE` karti: goreli zaman (`3 gün sonra`), celse adi, tarih, `Hafta 4 · 60 dk`; altta `Ders içerikleri, toplantı bağlantıları ve ders kayıtları kayıtlı talebelere açıktır. Derse kaydolduğunda görebilirsin.`
- Sekmeler `Müfredat` / `Ders kayıtları` (sayac) / `Müderrisler`; Müfredat: 12 haftalik akordeon (`HAFTA N`, `Sona erdi`, hafta adi, `1 celse · 60 dk`, kilitli satirlarda `, kilitli`); acik haftada celse satiri (`Canlı ders · 4 Eki Paz 21:00 · 60 dk`)
- `Örnek celse` (isPreview): `Bu celseyi kaydolmadan izleyebilir...`; video alani `Ders kaydı burada oynar`, `Herkese açık`, kayit basligi + `58 dk`, aciklama, `Celse akışı` (saat + adim), `Kaynaklar` (PDF)
- Saatler Europe/Istanbul; Zaman/saat: IANA `Europe/Istanbul` sabit gosterim (ekranda 'Saatler Istanbul saatiyle'); scheduledAt withTimezone: course.schema.ts:73
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya
- Kayit karti eylemi: `Başvurmak için giriş yap` (birincil), `Hesabın yok mu? Kayıt ol`; kilitli haftalarda `, kilitli`

## 3. Durumlar
- Yukleniyor: iskelet
- Hata/404 (taslak dahil): 38
- Yetkisiz: anonim 200 - ama toplanti baglantisi, kaynaklar ve kilitli celse icerigi DONMEZ
- Form yok

## 4. Etkilesimler
- `Başvurmak için giriş yap` -> Keycloak girisi, donuste ders sayfasi ve (urun karari, dogrulanamadi) otomatik kayit baslatmaz
- `Kayıt ol` -> Keycloak kayit
- Hafta akordeonu ac/kapat; `Örnek celse` oynat
- Sekme degistir (Müfredat/Ders kayıtları/Müderrisler)

## 5. API
- **YOK - yeni** acik `GET /public/courses/:id` (yalniz PUBLISHED; meetingUrl/kaynak/agenda yalniz isPreview olan celse icin). Kanit: apps/tedrisat/src/course/course.controller.ts:39 ve apps/tedrisat/src/kosk/kosk.controller.ts:37 (`@UseGuards(AuthGuard)` iki controller'in tamaminda; Bearer yoksa 401, libs/common/src/auth-guard/auth-guard.ts:11-25); mevcut GET /courses/:id guard'li ve meetingUrl'yi aciga cikariyor: meetingUrl maskelenmeden doner: apps/tedrisat/src/course/course.repository.ts:190 ve :359 (kayitsiz/PENDING kullaniciya da); celse kilidi sunucuda YOK
- GET /courses/:id: course.controller.ts:92 (CourseDetailResponse: weeks[].lessons[] icinde scheduledAt, meetingUrl, agenda, isPreview, duration, kaynak; apps/tedrisat/src/course/dto/course-response.dto.ts:8-45) -> VAR (hafta/celse/muderris/kaynak; `Örnek celse` icin isPreview bayragi VAR: course.schema.ts:76)
- Sunucu tarafi kilit: Sunucu tarafi kilit: kayitsiz/PENDING/erisimi kaldirilmis kullaniciya meetingUrl, agenda, kaynak ve ders-kaydi URL'leri DONMEMELI (bugun donuyor: meetingUrl maskelenmeden doner: apps/tedrisat/src/course/course.repository.ts:190 ve :359 (kayitsiz/PENDING kullaniciya da); celse kilidi sunucuda YOK) -> **degisen endpoint**
- Celse `Sona erdi`, sure (dk), hafta tarihi, `Her pazar 21:00` tekrar bilgisi: `duration` serbest metin (course.schema.ts:68), `durationMinutes`/`status`/`startsAt-endsAt` YOK -> alan ekle
- Ders kayitlari (`Ders kayıtları` sekmesi, sayac 1): kayit URL'i/alani YOK (celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex)); ekran 24 kapsami

## 6. Sinif
**B** - Anonim erisim ve icerik maskeleme icin yeni endpoint + alan eklemeleri; harici servis yok. (Ders kaydi video barindirma saglayicisi dogrulanamadi: YouTube/Google API gerekiyorsa o kisim C olur.)

## 7. Mevcut durum
- Kismen: apps/tedris/features/courses/components/course-page.tsx (484 satir; kayit/PENDING/ilerleme: :62-64, :72) + syllabus.tsx + apps/tedris/app/[locale]/courses/[courseId]/page.tsx (kayit, syllabus, kaynaklar)
- middleware: apps/tedris/middleware.ts:28-31: yalniz `/`, `/home`, `/api/auth/signin` herkese acik; digerleri withAuth ile giris ister -> girissiz ziyaretci rotalari bugun KILITLI
- Eksik: giris/kayit CTA'si, `SIRADAKİ CELSE` blogu, Ders kayitlari/Müderrisler sekmeleri, ornek celse

## 8. Kabul kriterleri
1. Oturumsuz kullanici ders sayfasini gorur, `Başvurmak için giriş yap` gorunur
2. Anonim yanitta isPreview=false celselerin meetingUrl ve kaynak alani yoktur
3. `Örnek celse` anonim izlenebilir
4. Kilitli haftalarda `, kilitli` etiketi
5. Taslak ders anonimde 404
6. Saatler Europe/Istanbul

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Hafta akordeonu: kilitli etiketi
2. Kayit karti: durum -> eylem eslemesi (anonim -> giris)
3. Maskeleme: API'den gelen meetingUrl null ise baglanti gostermez

**Playwright e2e (gercek API):**
1. Cerezsiz context -> `/tr/courses/{id}` gorunur, `Başvurmak için giriş yap`
2. API cevabinda kilitli celsede meetingUrl yok (response assert)
3. `giriş yap` -> Keycloak URL'i
4. `Örnek celse` ac -> kaynaklar gorunur

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
