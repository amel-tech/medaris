# 19 - Platform ayarları

Kaynak: local_docs/ekranlar/nizam/19-platform-ayarlari/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Platform genelindeki politikaları (kayıt her zaman onaylı, ders kayıtları herkese açılamaz) açıp kapatma ve alt kapsamlardaki politikaları görme.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/ayarlar`; izin "Platform politikalarını değiştir".
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık, açıklama (bir politika bir izni kapatır; alt kapsam yeniden açamaz).
- "Politikalar": anahtar "Kayıt her zaman onaylı" (açıklama + "Kendi kapsamında uygulayan: Süleymaniye Medresesi"), anahtar "Ders kayıtları herkese açılamaz" (açıklama + "Üsküdar Köşkü"); not "Her değişiklik anında geçerli olur ve denetim kaydına yazılır".
- "Politikalar nasıl birleşir" 5 adımlı açıklama (rol varsayılanı, platform, köşk, medrese, ders) ve uyarı "Üst kademenin verdiği izin alttaki politikayı aşar".
- "Köşk ve medrese politikaları" tablosu: Kapsam, Politika, Açan, Tarih.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Anahtar -> anında PUT; denetim satırı; toast; hata olursa geri döner.
- Tablo salt okunur.

## 5. API
- YOK — yeni endpoint: `GET /nizam/platform-policies`, `PUT /nizam/platform-policies/:key` `{enabled}`, `GET /nizam/scoped-policies`. Politika modeli YOK. Kayıt onayı davranışı mevcutta: ders kaydı `POST courses/:id/enroll` (apps/tedrisat/src/course/course.controller.ts:153) ve onay akışı apps/tedrisat/src/course/course.controller.ts:196; platform politikasının bunları daraltması yeni mantık. Denetim kaydı için backend'de tablo/servis YOK (apps/tedrisat/src altında audit karşılığı bulunamadı).

## 6. Sınıf
**B** - Üçüncü parti yok; politika tablosu ve kayıt/ders kaydı akışlarına entegrasyon yazılır.

## 7. Mevcut durum
YOK.

## 8. Kabul kriterleri
1. Anahtar değişimi anında kaydedilir ve denetim satırı yazar.
2. "Kayıt her zaman onaylı" açıkken `POST courses/:id/enroll` her zaman beklemeye (pending) düşer.
3. Politika kapalıyken alt kapsam açamaz (köşk/medrese/ders ayarı reddedilir).
4. Alt kapsam tablosu API ile aynı.
5. İzin yoksa 06.

## 9. Test senaryoları
**Unit (Vitest)**
- anahtar optimistik güncelleme ve geri alma.
- tablo render.

**Playwright e2e (gerçek API'ye karşı)**
1. Politikayı aç; yeni bir derse kayıt -> bekleyen.
2. Politikayı kapat; kayıt serbest.
3. Denetim kaydında "Politika değişikliği".
