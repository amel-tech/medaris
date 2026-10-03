# 19 Celse sayfasi - erisimin yok (B8)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/19-celse-sayfasi-erisimin-yok-b8/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Rota 15 ile ayni. Kayitsiz/ erisimsiz kullanici icin kilitli celse gorunumu.

## 2. Gosterim
- Kirinti, `HAFTA 4`, celse adi, `CANLI DERS`, `3 gün sonra`, `4 Ekim Pazar 21:00 · 60 dk`
- `Ders içerikleri, toplantı bağlantıları ve ders kayıtları kayıtlı talebelere açıktır. Derse kaydolduğunda görebilirsin.` + `Kayıt başvurusu yap`
- Ders karti (`الصرف`, ad, muderrisler, `Nûruosmaniye Köşkü · 12 hafta`), `Müfredat` (hepsi kilitli)
- Celse akisi, toplanti baglantisi, kaynaklar GIZLI
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya

## 3. Durumlar
- Yukleniyor/hata: standart
- Yetkisiz: bu ekran yetki durumunun kendisi (403 degil 200 + kilitli govde)
- Anonim: giris yap CTA'si (05'in dili)

## 4. Etkilesimler
- `Kayıt başvurusu yap` -> 06/07 akisi
- Müfredat akordeonu (kilitli satirlar acilmaz)

## 5. API
- Celse GET: **YOK** (bkz. 15). Bu durumda yanit yalniz `{title,startsAt,duration,courseSummary}` donmeli, agenda/meetingUrl/kaynak/kayit DONMEMELI. Sunucu tarafi kilit: kayitsiz/PENDING/erisimi kaldirilmis kullaniciya meetingUrl, agenda, kaynak ve ders-kaydi URL'leri DONMEMELI (bugun donuyor: meetingUrl maskelenmeden doner: apps/tedrisat/src/course/course.repository.ts:190 ve :359 (kayitsiz/PENDING kullaniciya da); celse kilidi sunucuda YOK)
- Kayit: POST /courses/:id/enroll: course.controller.ts:153; requiresApproval ise PENDING, degilse ENROLLED: apps/tedrisat/src/course/course.service.ts:107-120

## 6. Sinif
**B** - Maskeleme sunucuda zorunlu ve bugun yok; yeni celse endpoint'i ve erisim kurali.

## 7. Mevcut durum
- Yok: kilitli celse gorunumu. apps/tedris/features/courses/components/lesson-page.tsx (364 satir) + live-status-badge.tsx + apps/tedris/app/[locale]/courses/[courseId]/lessons/[lessonId]/page.tsx tum kullaniciya tam icerik gosterir (dogrulanamadi: erisim kontrolu icin dosyada `enrollment` kullanimi yok)

## 8. Kabul kriterleri
1. Kayitsiz kullanici celse sayfasinda agenda, kaynak ve baglantiyi gormez (API yaniti dahil)
2. `Kayıt başvurusu yap` gorunur ve calisir
3. Kilit mesaji tuvaldeki metindir
4. Erisim kaldirilmis (13) kullanici da ayni kilidi gorur

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Kilitli gorunum: gizli alanlar render edilmez

**Playwright e2e (gercek API):**
1. Kayitsiz kullanici -> sayfa kilitli
2. Network yaniti `meetingUrl` icermez (assert)
3. `Kayıt başvurusu yap` -> 07

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
