# 07 Basvuru onayi penceresi (B6)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/07-basvuru-onayi-penceresi-b6/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. 06'daki `Kayıt başvurusu yap` sonrasi acilan Dialog (rota degil; ders sayfasi uzerinde). `_kurallar.md` madde 11-13: bilgi/onay penceresi `Dialog`, odak `Tamam`'da.

## 2. Gosterim
- Etiket `BİNA VE İZHAR ŞERHİ`, baslik `Başvurun alındı`
- Govde: `Ders kadrosu başvurunu değerlendirecek. Onaylandığında bildirim alırsın; ders içerikleri, celselerin toplantı bağlantıları ve ders kayıtları o zaman sana açılır.`
- Not: `Onaylanana kadar başvurunu bu sayfadan geri çekebilirsin.`
- Dugme `Tamam`; arkada sayfa 08 durumunda (`Onay bekliyor`, `Başvuruyu geri çek`)

## 3. Durumlar
- Yukleniyor: dialog basari yaniti gelince acilir
- Hata: dialog ACILMAZ; toast
- Perdeyle kapanma: `_kurallar.md` madde 20 dogrulanmadi (disablePointerDismissal)
- Form yok

## 4. Etkilesimler
- `Tamam` -> kapanir, odak ders sayfasindaki `Başvuruyu geri çek` dugmesine doner (odak yeri tuvalde belirsiz: dogrulanamadi)
- Esc -> kapanir

## 5. API
- POST /courses/:id/enroll: course.controller.ts:153; requiresApproval ise PENDING, degilse ENROLLED: apps/tedrisat/src/course/course.service.ts:107-120 -> VAR (basvuruyu olusturan cagri 06'dadir)
- `Başvuruyu geri çek`: bkz. 08 - **YOK**

## 6. Sinif
**A** - Yeni endpoint istemiyor: yalniz POST enroll sonrasi acilan bilgi penceresi. (`geri cek` metni 08'de B.)

## 7. Mevcut durum
- Yok: dialog. apps/tedris/features/courses/components/course-page.tsx (484 satir; kayit/PENDING/ilerleme: :62-64, :72) + syllabus.tsx + apps/tedris/app/[locale]/courses/[courseId]/page.tsx kayit sonrasi toast gosteriyor (`CoursePage.enrolled`, tedris.json). libs/ui/src/components/dialog.tsx (shadcn; Base UI gecisi `_kurallar.md` madde 5)

## 8. Kabul kriterleri
1. Basarili basvuruda pencere acilir, baslik `Başvurun alındı`
2. `Tamam` pencereyi kapatir ve sayfa `Onay bekliyor` gosterir
3. API hatasinda pencere acilmaz
4. Klavye: odak pencere icinde tutulur, Esc kapatir
5. Pencere metni ders adini buyuk harfle etiket olarak gosterir

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Dialog: acilis/kapanis, odak, Esc
2. Etiket: ders adi uppercase (tr-TR yerel ayari: `İ` korunur)

**Playwright e2e (gercek API):**
1. 06 akisinda basvur -> pencere gorunur, `Tamam` -> kapanir
2. Pencere acikken Esc -> kapanir
3. Ag hatasi (API kapali) -> pencere acilmaz, toast

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
