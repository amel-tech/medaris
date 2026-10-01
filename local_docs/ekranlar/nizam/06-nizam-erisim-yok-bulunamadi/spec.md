# 06 - Nizam — erişim yok / bulunamadı

Kaynak: local_docs/ekranlar/nizam/06-nizam-erisim-yok-bulunamadi/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Nizam içinde izni olmayan bölüme (ya da var olmayan/görünmeyen kayda) gidildiğinde menüyü koruyarak gösterilen yetki-yok / bulunamadı ekranı. Güvenlik gereği "yok" ile "yetkisiz" aynı metinle verilir.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri ortak bileşen `apps/nizam/components/errors/no-access.tsx`; `not-found.tsx` ve 403 sınırlarında kullanılır (`apps/nizam/app/[locale]/not-found.tsx`; doğrulanamadı: dosya şu an yok).
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Menü ve AppBar korunur (Medaris nazımı kabuğu).
- Başlık "Bu bölüm için izniniz yok"; metin "Bu bölümün izni hesabınıza verilmemiş. İzinleri Medaris başnazımı verir; gerekirse {başnazım adı}'dan isteyin."
- "Giriş yaptığınız hesap: {e-posta}"; buton "Ana sayfaya dön".

## 3. Durumlar
- Yükleniyor: başnazım adı gelene dek ad yerine iskelet; sayfa engellenmez.
- Hata: ad alınamazsa genel cümle.
- Yetkisiz: ekranın kendisi.


## 4. Etkileşimler
- Ana sayfaya dön -> `/`.
- Başnazım adı metne yazılır; yoksa genel cümle ("Medaris başnazımından isteyin" - doğrulanamadı).

## 5. API
- 403/404 yanıtlarını istemci yakalar; mevcut guard `AuthGuard` yetkisizde 403 döner (örnek: apps/tedrisat/src/kosk/kosk.controller.ts:36-37).
- Başnazım adı için YOK — yeni endpoint: `GET /nizam/chief-nazim` -> `{ displayName }`. Rol/izin modeli backend'de yok: auth-matrix.ts yalnız SYSTEM_ADMIN realm rolünü ve kosk/course/madrasah varlık rollerini bilir (libs/common/src/authz/scopes.ts:77, auth-matrix.ts:102-139); 'Medaris başnazımı', 'Medaris nazımı', izin grubu, bitiş tarihi kavramları YOK (doğrulandı: apps/tedrisat/src/database/schema altında yalnız course, kosk, flashcard* tabloları).

## 6. Sınıf
**B** - İstemci ağırlıklı; ancak başnazım adı için küçük bir endpoint yazılır. Üçüncü parti yok.

## 7. Mevcut durum
YOK: hata sınırı bileşeni yok; kabuk bileşenleri mevcut (`app-layout.tsx`).

## 8. Kabul kriterleri
1. İzinsiz rota aynı kabukta ekranı gösterir, 403 durum kodu/sayfa başlığı korunur.
2. Var olmayan kayıt id'si aynı ekranı gösterir (kayıt varlığı sızdırılmaz).
3. E-posta oturum e-postasıdır; başnazım adı doğru yazılır.
4. Ana sayfaya dön `/` açar.

## 9. Test senaryoları
**Unit (Vitest)**
- 403 ve 404 -> aynı bileşen eşlemesi.
- başnazım adı yokken yedek metin.

**Playwright e2e (gerçek API'ye karşı)**
1. Medaris nazımı ile `/izin-gruplari` aç -> ekran.
2. Geçersiz UUID'li köşk rotası -> aynı ekran.
3. "Ana sayfaya dön" -> `/`.
