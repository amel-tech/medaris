# 17 - Denetim kaydı

Kaynak: local_docs/ekranlar/nizam/17-denetim-kaydi/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Kimin neyi okuduğu/değiştirdiğinin salt okunur kaydı: süzgeçler, sayfalama ve dışa aktarma. Yalnız başnazım ve izni olan Medaris nazımları okur.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/denetim-kaydi`; izin "Denetim kaydını oku".
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık, açıklama; buton "Dışa aktar"; bilgi kutusu "Köşk nazımları, medrese ve ders kadroları bu kaydı göremez" (KVKK, talebi karşılayacak kadarı verilir).
- Süzgeçler: Kişi (arama), Ne yaptı (Tümü, İçerik okuma, Özel deste okuma, Kişisel veri okuma, Kullanıcı arama, İzin verme ve geri alma, Rol değişikliği, Politika değişikliği, Yasak ve yasak kaldırma, Gizleme ve geri alma, Barındırma hakkı, Devral ya da düşür, İtiraz ve kararı, Kalıcı yasak talebi ve kararı, Kalıcı silme, Dışa aktarma), Kapsam (Bütün kapsamlar, Platform, köşkler, medreseler), Tarih (Son 24 saat, 7 gün, 30 gün, aralık).
- Tablo: Kayıt (#no, zaman), Kim (kısa ad, ad, rol), Ne yaptı (tür + ayrıntı), Kapsam (ad + tür). Altta saklama süresi notu ("[KVKK saklama süresi]" yer tutucu — değer BİLİNMİYOR, uydurulmaz) ve "Daha eskileri göster".

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Süzgeç değişince liste yeniden sorgulanır (URL). Daha eskileri göster -> imleçli sonraki sayfa.
- Dışa aktar -> CSV; dışa aktarma da denetim satırı yazar (tür "Dışa aktarma").
- Satırlar salt okunur.

## 5. API
- YOK — yeni endpoint: `GET /nizam/audit-log?actor=&type=&scope=&from=&to=&cursor=` ; `GET /nizam/audit-log/export` . Yazma tarafı: tüm yeni modüller bir `AuditService.record()` çağırır; hiçbir yerde silinemez/güncellenemez. Denetim kaydı için backend'de tablo/servis YOK (apps/tedrisat/src altında audit karşılığı bulunamadı).
- Saklama süresi (KVKK) değeri: tuvalde yer tutucu; doğrulanamadı — sahibinden alınacak.

## 6. Sınıf
**B** - Üçüncü parti yok; denetim tablosu, yazan servis ve okuma uçları yazılır. Saklama süresi kararı (hukuk) açık madde.

## 7. Mevcut durum
YOK.

## 8. Kabul kriterleri
1. Kayıtlar yeniden eskiye sıralı, imleç sayfalamalı gelir.
2. Süzgeçler birleşik çalışır ve URL'den yüklenir.
3. Köşk nazımı/başmüderris bu ekrana ve uca erişemez (403).
4. Dışa aktarma süzgeçli sonucu CSV verir ve kendisi de kayıt yazar.
5. Kayıt değiştirilemez; API'de PUT/DELETE yoktur.
6. Saklama süresi metni değer onaylanana dek yer tutucudur.

## 9. Test senaryoları
**Unit (Vitest)**
- süzgeç -> sorgu.
- tür etiketi eşlemesi.
- zaman biçimleme (Bugün/Dün).
- CSV üretimi.

**Playwright e2e (gerçek API'ye karşı)**
1. Bir yasak işlemi yap; Nizam'da satır görünür.
2. Tür=Kullanıcı arama süz -> yalnız aramalar.
3. Dışa aktar -> dosya iner, satır sayısı eşit.
4. Köşk nazımı API çağrısı 403.
