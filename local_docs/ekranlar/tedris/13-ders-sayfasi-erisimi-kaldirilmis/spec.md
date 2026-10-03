# 13 Ders sayfasi - erisimi kaldirilmis

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/13-ders-sayfasi-erisimi-kaldirilmis/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Rota `/[locale]/courses/[courseId]`; kosk/ders kadrosu tarafindan erisimi kaldirilan eski kayit.

## 2. Gosterim
- Ders tanitimi: baslik, aciklama, `Nûruosmaniye Köşkü · 10 hafta · 10 celse · 10 saat`, muderris
- Rozet `Bu derse erişimin kaldırıldı.` + `Celselere, toplantı bağlantılarına, yalnız kayıtlılara açık ders kayıtlarına ve ders destesine artık erişemezsin; dersin celseleri takviminden de düştü. Tanıtımı, müfredatın başlıklarını ve herkese açık ders kayıtlarını görmeye devam edersin.`
- `Derslerime dön` dugmesi
- Müfredat (kilitli) ve `Ders kayıtları (1)` (yalniz herkese acik) sekmeleri

## 3. Durumlar
- Yukleniyor/hata: 12 ile ayni
- Yetkisiz: bu ekranin kendisi yetki durumudur
- Form yok

## 4. Etkilesimler
- `Derslerime dön` -> 20
- Sekmeler: Müfredat (kilitli satirlar), Ders kayitlari (yalniz public)

## 5. API
- EnrollmentStatus yalniz PENDING/ENROLLED/COMPLETED: apps/tedrisat/src/course/domain/enrollment-status.enum.ts -> `erisim kaldirildi` durumu **YOK**; **yeni** `REVOKED` (veya `revokedAt`) + `DELETE/POST` kadro endpoint'i ve GET /courses/:id yanitinda `enrollment.status=REVOKED`
- Mevcut `DELETE /courses/:id/enrollments/:userId` yalniz PENDING siler: course.service.ts:148-160 -> aktif kaydi kaldirmak icin kasitli bir `unenroll` akisi YOK (kodda yorum bunu ayrica anar: course.service.ts:154-155)
- Takvimden dusme: bkz. 23 (feed REVOKED/PENDING'i disarida birakir)
- Sunucu tarafi kilit: kayitsiz/PENDING/erisimi kaldirilmis kullaniciya meetingUrl, agenda, kaynak ve ders-kaydi URL'leri DONMEMELI (bugun donuyor: meetingUrl maskelenmeden doner: apps/tedrisat/src/course/course.repository.ts:190 ve :359 (kayitsiz/PENDING kullaniciya da); celse kilidi sunucuda YOK)

## 6. Sinif
**B** - Erisim kaldirma durumu hicbir yerde modellenmemis: enum/migration + endpoint. Ucuncu parti yok.

## 7. Mevcut durum
- Yok. apps/tedris/features/courses/components/course-page.tsx (484 satir; kayit/PENDING/ilerleme: :62-64, :72) + syllabus.tsx + apps/tedris/app/[locale]/courses/[courseId]/page.tsx bu durumu bilmiyor

## 8. Kabul kriterleri
1. REVOKED kullanici bu rozeti ve `Derslerime dön`u gorur
2. Toplanti baglantisi, kaynak, ders destesi ve kayitlara-ozel ders kaydi donmez
3. `isPreview`/herkese acik kayitlar gorunur
4. Celseler `GET /sessions/upcoming` ve takvim feed'inden cikar
5. REVOKED kullanici `Kayıt başvurusu yap` gormez (yeniden basvuru kurali: dogrulanamadi)

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Durum -> gorunum esleme REVOKED

**Playwright e2e (gercek API):**
1. Seed REVOKED -> sayfada rozet
2. API yanitinda meetingUrl yok
3. `Derslerime dön` -> 20
4. Takvim feed'inde ders celseleri yok (23 testi ile ortak)

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
