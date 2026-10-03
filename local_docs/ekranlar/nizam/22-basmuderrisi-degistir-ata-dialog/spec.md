# 22 — Başmüderrisi değiştir / ata (dialog)

Kaynak: `22-basmuderrisi-degistir-ata-dialog/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Medaris başnazımı bir medresenin başmüderrisini değiştirir (Süleymaniye) ya da atanmamış medreseye başmüderris atar (Zeyrek: 'Başmüderris ata'). Eski başmüderrisin verdiği rol/izinler için satır başına Devral/Düşür kararı verilir. Ekran 'Medreseler' (nizam/07) sayfasında açılan `Dialog`'dur.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/medreseler` sayfası + `Dialog` (satır eylemi 'Başmüderrisi değiştir' / 'Başmüderris ata')`
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Etiket 'SÜLEYMANİYE MEDRESESİ', başlık 'Başmüderrisi değiştir' (atanmamışsa 'Başmüderris ata').
- Mevcut başmüderris açıklaması; alan 'Yeni başmüderris*' (e-posta ile C12 seçici), 'Seçilen başmüderris' kartı, 'Görev bitişi (isteğe bağlı)'.
- Bölüm 'Mehmet Emin Işıkoğlu şu kişilere rol ve izin vermişti': her satırda avatar, ad, e-posta, rol·kapsam·süre·veriliş tarihi, izin özeti, ToggleGroup 'Devral'/'Düşür' (hiçbiri seçili gelmez, madde 15) ve 'Düzenle' düğmesi (izin verme Dialog'unu açar).
- Dipnotlar: 'Devralırsanız izin sürer ve veren olarak siz görünürsünüz; düşürürseniz izin hemen geri alınır.'; 'Her satır için seçim yapılmadan başmüderris değiştirilemez.'; düğmeler 'Vazgeç', 'Değiştir'.
- Not: _kurallar.md madde 15 — görevden alma penceresi 4 Ekim 2026'ya kadar açılmaz (sürüm kapısı); ekranda sürüm yazılmaz. Bugün 2 Ekim 2026.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Satır kararı yokken 'Değiştir' devre dışı (madde 14).
- Devredilecek satır yoksa karar bölümü gizlenir (tuvalde bu hâl yok — doğrulanamadı).
- Atama modunda (başmüderris yok) karar bölümü ve 'şu kişilere rol vermişti' yok; metin tuvalde yok — doğrulanamadı.
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: yalnız Medaris başnazımı/nazımı (yetki ayrımı tuvalde yok — doğrulanamadı).
- Doğrulama: yeni başmüderris zorunlu; kendisiyle aynı kişi seçilemez (kural tuvalde yok — doğrulanamadı).

## 4. Etkileşimler
- Seçici: e-posta ile hesap bul/seç.
- Devral/Düşür: satır başına tek seçim; 'Düzenle' o satırın izin verme Dialog'unu açar (iç içe mi aynı pencere mi belirsiz, madde 15).
- 'Değiştir': başmüderris değişir, eski rol ve izinleri düşer, seçilenler devralınır/düşürülür; denetim kaydına yazılır, dialog kapanır, Toast.
- 'Vazgeç': kapanır.

## 5. API
- `GET /users/lookup?email=` — YOK — yeni endpoint. Tam e-posta eşleşmesi döner `{id,name,email}`; her arama denetim kaydına yazılır. Kanıt: tedrisat/teskilat controller'larında kullanıcı arama yok (grep `@Controller` yalnız app, course, kosk, flashcard*). Kaynak belirsiz: kullanıcı dizini Keycloak'ta; yerel kullanıcı tablosu da yok — doğrulanamadı.
- `PUT /medreseler/:id/basmuderris` — YOK — yeni endpoint; gövde `{userId, endsAt?, delegations:[{grantId, decision:'TAKE_OVER'|'DROP'}]}`.
- `GET /medreseler/:id/delegations` — YOK — yeni endpoint (başmüderrisin verdiği izinler).
- Medrese kavramı backend'de yok: tedrisat resolver'ında `madrasah` provizyonel `PUBLIC` döner (apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts:36 yorum) ve şemada medrese tablosu yok.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Medrese, başmüderris, izin devri modelleri yeni yazılmalı; üçüncü parti yok. Büyük kapsam (yeni alan modeli) ve 4 Ekim 2026 sürüm kapısı nedeniyle sıralamada geç planlanmalı; sınıf B kalır.

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Süleymaniye satırından 'Başmüderrisi değiştir' dialog'u açılır; Zeyrek'te başlık 'Başmüderris ata'dır.
2. Her devredilen satır için Devral/Düşür seçilmeden 'Değiştir' devre dışıdır.
3. 'Değiştir' sonrası eski başmüderrisin rolü ve izinleri düşer; 'Devral' seçilenlerde veren olarak işlemi yapan kullanıcı görünür.
4. 'Düşür' seçilen izin anında geri alınır.
5. Tüm kararlar tek denetim kaydı işleminde yazılır.
6. Yeni başmüderris olmadan gönderilemez.

## 9. Test senaryoları
**Unit (Vitest)**
- Dialog form durumu: tüm satırlar seçilene kadar disabled.
- ToggleGroup `defaultValue=[]` ve `aria-label` metni.
- Atama/değiştirme başlık dallanması.

**Playwright e2e (gerçek API'ye karşı)**
- Başnazım → Medreseler → Süleymaniye → 'Başmüderrisi değiştir'.
- Yeni başmüderris e-postası → iki satır için Devral/Düşür → 'Değiştir'.
- Medreseler tablosunda yeni başmüderris görünür; düşürülen izin sahibinde yok.
- Zeyrek'te 'Başmüderris ata' akışı.
- Sürüm kapısı: 4 Ekim 2026 öncesi pencere açılmaz (bayrak ile).
