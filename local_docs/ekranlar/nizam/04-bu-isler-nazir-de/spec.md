# 04 - Bu işler Nazır'da

Kaynak: local_docs/ekranlar/nizam/04-bu-isler-nazir-de/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Yalnız medrese/ders görevi olan (başmüderris, müderris) kullanıcıya Nizam'da iş olmadığını söyler ve görevlerini listeleyip Nazır'a yönlendirir.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `apps/nizam/app/[locale]/nazir-yonlendirme/page.tsx`; Nazır uygulaması `apps/nazir` (nazir-web).
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- AppBar kullanıcı: "Mehmet Emin Işıkoğlu · Medrese başmüderrisi · Müderris".
- Başlık "Medrese ve ders işleriniz Nazır'da"; açıklama metni.
- "Görevleriniz" listesi: medrese (Süleymaniye Medresesi · Medrese başmüderrisi), ders satırları (ders adı, "Müderris · {köşk} · {n} talebe", "Dersin imamı" rozeti, "Taslak" durumu).
- Buton "Nazır'a git".

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Nazır'a git -> `apps/nazir` kök adresi (ortam değişkeni; doğrulanamadı).
- Görev satırları salt okunur.

## 5. API
- YOK — yeni endpoint: `GET /me/assignments` -> `{ madrasahs:[{id,name,role}], courses:[{id,title,koskName,role,isImam,studentCount,status}] }`.
- Ders tarafı kısmen çözülebilir: `GET courses/enrolled` (apps/tedrisat/src/course/course.controller.ts:79) talebe kaydını döner, müderris listesi değil; müderris ilişkisi `courseMuderris` tablosunda var (apps/tedrisat/src/database/schema/course.schema.ts, migration 0012) ama sorgulayan endpoint doğrulanamadı. Medrese başmüderrisi: model YOK. Rol/izin modeli backend'de yok: auth-matrix.ts yalnız SYSTEM_ADMIN realm rolünü ve kosk/course/madrasah varlık rollerini bilir (libs/common/src/authz/scopes.ts:77, auth-matrix.ts:102-139); 'Medaris başnazımı', 'Medaris nazımı', izin grubu, bitiş tarihi kavramları YOK (doğrulandı: apps/tedrisat/src/database/schema altında yalnız course, kosk, flashcard* tabloları).

## 6. Sınıf
**B** - Üçüncü parti yok; görev listesi endpoint'i ve medrese modeli yazılmalı.

## 7. Mevcut durum
YOK. Nazır uygulaması `apps/nazir` ayrı; bu yönlendirme sayfası yazılmadı.

## 8. Kabul kriterleri
1. Yalnız medrese/ders görevi olan kullanıcı `/` açınca bu ekrana düşer.
2. Her ders satırı köşk, talebe sayısı ve imam/müderris etiketini gösterir.
3. Taslak ders talebe sayısı yerine "Taslak" yazar.
4. "Nazır'a git" Nazır köküne gider.
5. Görevi olmayan kullanıcı 03'ü görür, bu ekranı değil.

## 9. Test senaryoları
**Unit (Vitest)**
- görev türü -> etiket eşlemesi.
- talebe sayısı/taslak ayrımı.

**Playwright e2e (gerçek API'ye karşı)**
1. Müderris hesabıyla giriş -> bu ekran, görev listesi API ile aynı.
2. "Nazır'a git" tıkla -> URL Nazır'a değişir.
3. Köşk nazımı hesabıyla -> bu ekran değil 02 açılır.
