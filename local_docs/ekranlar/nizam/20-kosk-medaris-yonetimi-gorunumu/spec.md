# 20 - Köşk — Medaris yönetimi görünümü

Kaynak: local_docs/ekranlar/nizam/20-kosk-medaris-yonetimi-gorunumu/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Medaris yönetiminin tek köşke bakışı: özet, bilgiler, köşk nazımları, barındırma hakları, dersler ve gizle/pasife al eylemleri (ders işleri köşk nazımının).
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: mevcut `/kosks/[id]` (`apps/nizam/app/[locale]/kosks/[id]/page.tsx`, bileşen `kosk-detail-page.tsx`) yönetim kipiyle genişletilir; breadcrumb Köşkler / {ad}.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık (ad), alt satır (alan · seviye · @kısa ad); "Köşk sayfasını gör (yeni sekmede)"; bilgi "Bu, Medaris yönetimi görünümüdür...".
- Köşkün özeti: Ders 7 (3 yayında·2 taslak·2 gizli), Kayıtlı talebe 74 (gizli dersler hariç), Köşk nazımı 1, Barındırma hakkı olan medrese 1.
- Köşk bilgileri: Ad, Kısa ad, Alan ve seviye, Açıklama, Durum, Görünürlük, Açılış (tarih·kim), Köşk destesi, Köşk politikası; "Köşk ayarlarını aç".
- Yönetim eylemleri: Listelerden gizle ("Köşkü gizle"), Pasife al ("Köşkü pasife al"), Kalıcı silme ("Arşiv'e git"; yalnız başnazım).
- Köşk nazımları tablosu + "Köşk nazımı ekle"; uyarı "Son köşk nazımı ardılsız çıkarılamaz"; Çıkar -> devral/düşür.
- Medreseler ve barındırma hakları ("Barındırma hakları" bağlantısı): tablo Medrese, Veren, Tarih, Açık ders, "Barındırma hakkını geri al".
- Dersler: Tümü 7, Yayında 3, Taslak 2, Gizli 2, "Arşiv"; tablo Ders (hafta/medrese/gizlendi tarihi), Müderrisler (imam), Talebe, Durum.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Köşk sayfasını gör -> yeni sekmede Tedris köşk sayfası.
- Köşkü gizle -> onay (AlertDialog "Gizle": ghost Vazgeç + primary Gizle; _kurallar.md 11, 13) -> köşk gizli, Arşiv'e düşer.
- Köşkü pasife al -> Dialog; nazımlar görevden alınır.
- Köşk nazımı ekle -> 21; Çıkar -> 22 benzeri devral/düşür penceresi; son nazım ardılsız çıkarılamaz.
- Barındırma hakkını geri al -> 27.
- Arşiv'e git -> 28.

## 5. API
- Mevcut: `GET /kosks/:id` (apps/tedrisat/src/kosk/kosk.controller.ts:66) özet+rating+ders sayısı için kısmen; `PATCH /kosks/:id` (apps/tedrisat/src/kosk/kosk.controller.ts:95) bilgi düzenleme; `DELETE /kosks/:id` (apps/tedrisat/src/kosk/kosk.controller.ts:111) kalıcı silme (gizle adımı yok); `GET kosks/:koskId/courses` (apps/tedrisat/src/course/course.controller.ts:50) dersler; repository sayıları (ders, talebe, müderris) kosk.repository.ts:30-46.
- Eksik/YOK — yeni: `POST /kosks/:id/hide`, `POST /kosks/:id/deactivate`, `GET/POST/DELETE /kosks/:id/managers` (devral/düşür gövdeli), `GET /kosks/:id/hosting-rights`, politika alanı, durum kolonları. Model YOK: kosk_managers, hosting_rights, kosk status (apps/tedrisat/src/database/schema altında karşılığı yok; mevcut tablolar: kosks, kosk_followers, courses, enrollments, course_muderris, flashcard*).

## 6. Sınıf
**B** - Mevcut kosk uçları temel olarak kullanılır, yönetim eylemleri ve nazım/barındırma modelleri yeni yazılır. Üçüncü parti yok.

## 7. Mevcut durum
Kısmi: `apps/nizam/features/kosks/components/kosk-detail-page.tsx` (150 satır, ders listesi) ve `app/[locale]/kosks/[id]/page.tsx`; özet/bilgi/eylem/nazım/barındırma bölümleri YOK.

## 8. Kabul kriterleri
1. Özet sayıları (yayında/taslak/gizli) ders listesi sayımıyla tutarlı; talebe sayısı gizli dersleri hariç tutar.
2. Köşkü gizle onayından sonra köşk 09'da Gizli ve Arşiv'de görünür.
3. Son nazım ardılsız çıkarılamaz; ardıl seçmeden Çıkar disabled.
4. Çıkar penceresinde her rol/izin için Devral/Düşür seçilmeden onay açılmaz.
5. Kalıcı silme bu sayfada yoktur; yalnız Arşiv'e git.
6. Barındırma hakkını geri al satırı ve açık ders sayısı doğru.
7. Tüm eylemler denetim kaydına yazılır.

## 9. Test senaryoları
**Unit (Vitest)**
- özet sayı hesapları.
- ders durum rozetleri/süzgeçleri.
- son nazım çıkarma kuralı.
- eylem onay akışları.

**Playwright e2e (gerçek API'ye karşı)**
1. Başnazım ile bir köşk aç; bölümler dolu.
2. Köşkü gizle -> 09/28'de görünür.
3. Son nazımı çıkarmaya çalış -> engellenir.
4. Barındırma hakkını geri al -> tablo güncellenir.
5. Denetim kaydında gizleme ve nazım satırları.
