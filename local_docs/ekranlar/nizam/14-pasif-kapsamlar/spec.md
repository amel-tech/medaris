# 14 - Pasif kapsamlar

Kaynak: local_docs/ekranlar/nizam/14-pasif-kapsamlar/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Son yöneticisi görevden alınan ya da görev süresi dolan köşk, medrese ve dersleri listeler; yönetici atama ve içeriği görme (denetime yazılır).
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/pasif-kapsamlar`; izin "Pasif kapsamları yönet" ya da başnazım.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık, açıklama; uyarı "Pasif kapsamın içeriği kapalıdır" (kayıtlı talebeler dahil kimse göremez; her açış denetime yazılır; celseler takvimden düşer).
- "Yöneticisi olmayan kapsamlar · 2 kapsam"; süzgeç Kapsam türü (Tümü, Köşk, Medrese, Ders).
- Tablo: Kapsam (ad, tür, ders ise köşk), Neden ("Başmüderrisin görev süresi doldu"/"Son müderris görevden alındı"), Ne zamandır (tarih + "4 gündür"), Son yönetici (ad + rol), İşlemler ("Başmüderris ata"/"Müderris ata", "İçeriği gör").

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Ata -> 22 benzeri atama diyaloğu (medrese: başmüderris; ders: müderris, imam seçimi); başarıda kapsam etkinleşir, satır düşer.
- İçeriği gör -> kapsam içeriği (köşk/medrese/ders sayfası) ve denetim satırı ("İçerik okuma").

## 5. API
- YOK — yeni endpoint: `GET /nizam/inactive-scopes?type=` ; `POST /nizam/inactive-scopes/:type/:id/assign` ; `POST .../view` (denetime yazar). Kavram: köşk/medrese/ders `status=inactive`; kursun mevcut `status` alanı yalnız DRAFT/yayın durumları (course.schema.ts:41; enum değerleri doğrulanamadı). Denetim kaydı için backend'de tablo/servis YOK (apps/tedrisat/src altında audit karşılığı bulunamadı).

## 6. Sınıf
**B** - Üçüncü parti yok; durum modeli, atama ve denetim yazılır. Süre dolumu için zamanlanmış iş gerekir (cron; sunucu yapılandırması sahibinde).

## 7. Mevcut durum
YOK.

## 8. Kabul kriterleri
1. Liste yalnız yöneticisiz kapsamları gösterir; sayı başlıkla uyuşur.
2. Tür süzgeci çalışır.
3. Atama sonrası kapsam listeden düşer ve etkin olur.
4. İçeriği gör her seferinde bir denetim satırı yazar.
5. Yetkisiz kullanıcı 06 görür.

## 9. Test senaryoları
**Unit (Vitest)**
- "N gündür" hesabı.
- tür süzgeci.
- neden metni eşlemesi.

**Playwright e2e (gerçek API'ye karşı)**
1. Pasif medrese için başmüderris ata -> satır kalkar, 07'de Etkin.
2. "İçeriği gör" tıkla; 17'de "İçerik okuma" satırı.
3. Süzgeç=Ders -> yalnız ders.
