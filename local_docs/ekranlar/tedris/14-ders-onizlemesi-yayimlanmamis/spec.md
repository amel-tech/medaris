# 14 Ders onizlemesi - yayimlanmamis

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/14-ders-onizlemesi-yayimlanmamis/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Rota `/[locale]/courses/[courseId]` (veya `?preview=1`; dogrulanamadi). Taslak (DRAFT) ders yalniz yoneticiye acilir.

## 2. Gosterim
- Ust serit `Önizleme: Ders henüz yayında değil; bu önizlemeyi yalnızca yöneticiler görür.`
- Kirinti, rozet `Taslak`, baslik, aciklama, meta, muderrisler
- `Önizleme` karti: `Ders yayımlandığında` + `Talebeler burada “Kayıt başvurusu yap” düğmesini ve ilk celsenin zamanını görür. Önizlemede başvuru yapılmaz.` + `İLK CELSE 12 Ekim Pazartesi 21:00`
- `Düzenlemeye dön: Kâfiye’ye giriş, Nazir’de Müfredat` (Nazir uygulamasina link)
- Müfredat (hepsi kilitli), `Ders kayıtları`, `Müderrisler` sekmeleri

## 3. Durumlar
- Yukleniyor/hata: standart
- Yetkisiz: yonetici olmayan icin 404 (varlik sizdirilmaz: course.service.ts:51-58)
- Form yok; kayit dugmesi YOK

## 4. Etkilesimler
- `Düzenlemeye dön` -> Nazir'deki ders duzenleme sayfasi (apps/nazir icinde karsilik gelen rota dogrulanamadi)
- Hafta akordeonu ve sekmeler salt-okunur

## 5. API
- GET /courses/:id: course.controller.ts:92 (CourseDetailResponse: weeks[].lessons[] icinde scheduledAt, meetingUrl, agenda, isPreview, duration, kaynak; apps/tedrisat/src/course/dto/course-response.dto.ts:8-45) -> DRAFT'i kosk sahibine dondurur: apps/tedrisat/src/course/course.service.ts:51-58
- UYARI: ekran `yoneticiler` diyor; backend yalniz KOSK SAHIBINE (isOwner) izin veriyor, baska yonetici/nazir rolu icin kontrol YOK (dogrulanamadi: apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts okunmadi)
- `İLK CELSE`: scheduledAt'tan istemcide turetilir (weeks[].lessons[])
- Nazir rotasi: apps/nazir app dizini taranmadi -> dogrulanamadi

## 6. Sinif
**A** - Taslak detayini sahip icin donduren endpoint hazir; sayfa yalniz frontend (serit, rozet, kayit dugmesi gizleme). Yonetici != sahip farki dogrulanamadi.

## 7. Mevcut durum
- Kismen: ayni apps/tedris/features/courses/components/course-page.tsx (484 satir; kayit/PENDING/ilerleme: :62-64, :72) + syllabus.tsx + apps/tedris/app/[locale]/courses/[courseId]/page.tsx taslagi sahip icin gosterir ama `Önizleme` seridi/`Taslak` rozeti/`Düzenlemeye dön` yok

## 8. Kabul kriterleri
1. Sahip, taslak dersi `Önizleme` seridi ve `Taslak` rozetiyle gorur
2. `Kayıt başvurusu yap` dugmesi yoktur
3. `İLK CELSE` en erken scheduledAt'i gosterir
4. Sahip olmayan kullanici 404 gorur
5. `Düzenlemeye dön` Nazir'e gider (hedef dogrulanamadi)

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Taslak -> serit ve kayit dugmesi gizleme
2. Ilk celse hesabi

**Playwright e2e (gercek API):**
1. Seed DRAFT ders (sahip tokeni) -> `/tr/courses/{id}` serit gorunur
2. Baska kullanici -> 404
3. Sahip `Düzenlemeye dön` -> Nazir URL'i

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
