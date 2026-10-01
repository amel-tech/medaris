# 09 - Köşkler (C3)

Kaynak: local_docs/ekranlar/nizam/09-koskler-c3/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Platformdaki tüm köşklerin listesi: süzgeçler (seviye, alan, görünürlük), durum sayıları, gizlenen köşkü geri alma ve köşk açma.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: mevcut `/kosks` (`apps/nizam/app/[locale]/kosks/page.tsx`) -> yönetim görünümüne genişletilir. İzin: köşk işleri / başnazım.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık "Köşkler", açıklama; "Köşk başvuruları, 3 bekleyen" bağlantısı + "Köşk aç".
- Sekme/süzgeç: Arşiv bağlantısı; Tümü 5, Etkin 4, Pasif 0, Gizli 1; Seviye (Başlangıç/Orta/İleri), Alan (Arapça dil ilimleri, Belâgat, Fıkıh, Hadis, Kur'an ilimleri), Görünürlük (Listelenen/Listelenmeyen).
- Tablo: Köşk (ad, @kısa ad, "Listelenmeyen" rozeti), Köşk nazımları ("... ve ...", kendisi ise "Siz"), Alan, Ders (taslak/gizli/pasif dahil), Durum (Etkin/Gizli + tarih), İşlem ("Geri al").
- Dipnot: ders sayısı, listelenmeyen ve gizli köşk tanımları.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Köşk aç -> 10. Köşk başvuruları -> 15. Geri al -> köşk etkin olur.
- Süzgeçler URL parametresi olarak liste sorgusunu değiştirir.
- Satır adı -> 20 (köşk Medaris yönetimi görünümü).

## 5. API
- Mevcut: `GET /kosks?page&limit` (apps/tedrisat/src/kosk/kosk.controller.ts:49; limit en çok 50) ve `GET /kosks/:id` (apps/tedrisat/src/kosk/kosk.controller.ts:66) — yalnız çağıranın görebildiği köşkler; durum/alan/seviye süzgeci, nazım listesi, gizli/pasif durum YOK. Alan `field`, `level` kosk.schema.ts:23-24'te var; durum ve gizleme kolonu YOK; `isPrivate` ile "Listelenmeyen" eşleşmesi doğrulanamadı.
- YOK — yeni/değişen: `GET /admin/kosks?status=&level=&field=&listed=&page=` -> nazım adları ve ders sayısıyla; `POST /kosks/:id/restore`; kosks tablosuna `status` (active/inactive/hidden), `hiddenAt` kolonu (migration).

## 6. Sınıf
**B** - Mevcut liste endpoint'i genişletilir; durum modeli ve admin süzgeçleri yazılır; üçüncü parti yok.

## 7. Mevcut durum
Kısmi: `apps/nizam/features/kosks/components/kosks-page.tsx` kart ızgarası ve `kosk-form-dialog.tsx`; tablo, süzgeç, durum sayıları, geri al YOK.

## 8. Kabul kriterleri
1. Durum sayıları API toplamıyla uyuşur.
2. Her süzgeç tek başına ve birleşik çalışır; sayfa yenilenince URL'den geri yüklenir.
3. Gizli köşk satırında "Geri al" vardır, etkin satırında yoktur.
4. Kullanıcı kendisi nazımsa "Siz" yazar.
5. Boş sonuç "Sonuç yok" EmptyState'i gösterir (metin tuvalde yok, doğrulanamadı).
6. Sayfalama 12/50 sınırını aşmaz.

## 9. Test senaryoları
**Unit (Vitest)**
- süzgeç -> sorgu dizgisi.
- nazım adlarını "A ve B" birleştirme.
- durum rozeti.

**Playwright e2e (gerçek API'ye karşı)**
1. Başnazım ile `/kosks`; sayıları API ile eşle.
2. Seviye=Başlangıç süz -> satırlar azalır.
3. Gizli köşkü "Geri al" -> Etkin.
4. Köşk nazımı hesabı yalnız kendi köşklerini görür.
