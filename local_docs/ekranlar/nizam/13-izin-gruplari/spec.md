# 13 - İzin grupları

Kaynak: local_docs/ekranlar/nizam/13-izin-gruplari/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Sık birlikte verilen izinleri gruplamak: grup listesi, oluşturma/düzenleme, kullananlar, silerken kullanan kişilerin izinlerinin akıbeti.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/izin-gruplari`; yalnız başnazım.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık, açıklama, buton "Grup oluştur". Sol liste: Köşk işleri (Platform · 4 izin · 1 kişi kullanıyor), Denetim (2), Yayın ve bağlantılar (2), Ders denetimi (Her ders · 3 izin · 2 kişi).
- Form: Grup adı*, Kapsam (Platform / Her ders / Bir ders; kapsam gruba girecek izinleri belirler), izin onay kutuları (12'deki katalog, Platform kapsamında 5 bölüm).
- "Kullananlar" listesi (kişi, "Medaris nazımı · bitiş ...", "İzinlerini düzenle"). Not: kaydederken/silerken kullananların izinleri için seçim (AlertDialog+RadioGroup, varsayılan yok; _kurallar.md 16). Düğmeler: Grubu sil, Vazgeç, Kaydet.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Grup oluştur / seç -> form. Kapsam değişince izin kataloğu süzülür.
- Kaydet -> grup güncellenir; kullanan varsa önce izin akıbeti sorusu (grup 'n kişi kullanıyor').
- Grubu sil -> aynı soru, onay seçime dek disabled.
- İzinlerini düzenle -> 12.

## 5. API
- YOK — yeni endpoint: `GET/POST /nizam/permission-groups`, `PUT/DELETE /nizam/permission-groups/:id` (gövde: `usersPolicy:'keep'|'revoke'`), `GET /nizam/permission-groups/:id/users`. Rol/izin modeli backend'de yok: auth-matrix.ts yalnız SYSTEM_ADMIN realm rolünü ve kosk/course/madrasah varlık rollerini bilir (libs/common/src/authz/scopes.ts:77, auth-matrix.ts:102-139); 'Medaris başnazımı', 'Medaris nazımı', izin grubu, bitiş tarihi kavramları YOK (doğrulandı: apps/tedrisat/src/database/schema altında yalnız course, kosk, flashcard* tabloları).
- "Bir ders" kapsamı ders seçimi gerektirir; ders listesi: `GET kosks/:koskId/courses` (apps/tedrisat/src/course/course.controller.ts:50) yalnız köşk bazlı — platform geneli arama YOK (doğrulanamadı).

## 6. Sınıf
**B** - Üçüncü parti yok; grup modeli ve uç noktalar yazılır.

## 7. Mevcut durum
YOK.

## 8. Kabul kriterleri
1. Grup listesi kapsam ve izin sayısını, kullanan kişi sayısını doğru gösterir.
2. Kapsam seçimi uygun olmayan izinleri gizler/kilitler.
3. Kullanan olan grubu silerken seçim yapılmadan onay düğmesi disabled.
4. Grup adı boş/yinelenen olamaz.
5. Her değişiklik denetim kaydına yazılır.

## 9. Test senaryoları
**Unit (Vitest)**
- kapsam -> izin kataloğu süzgeci.
- kullanan sayısı -> soru gösterimi.
- form doğrulama.

**Playwright e2e (gerçek API'ye karşı)**
1. Grup oluştur, listede gör.
2. Kullanan grubu sil: seçim yap, onayla; kullanıcının izinleri seçime göre değişir.
3. Yinelenen ad -> hata.
4. Denetim kaydında satır.
