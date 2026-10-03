# 21 — Köşk nazımı ekle (dialog)

Kaynak: `21-kosk-nazimi-ekle-dialog/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Medaris başnazımı/nazımı, bir köşke e-postayla bulunan kayıtlı hesabı köşk nazımı olarak ekler. Ekran 'Köşk nazımları' sayfasının (nizam/25'in başnazım görünümü) üzerinde açılan Dialog'dur (_kurallar.md madde 11/12: formlu pencere = `Dialog`).

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/nazimlar` sayfası + `Dialog` (rota değişmez, düğme 'Köşk nazımı ekle')`
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Üst etiket 'NÛRUOSMANİYE KÖŞKÜ', başlık 'Köşk nazımı ekle', açıklama 'Eklediğiniz kişi hemen … köşk nazımı olur.', '* zorunlu alan'.
- Alan 'Köşk nazımı*': e-postayla kullanıcı seçici (C12, tam eşleşme); yardım 'Kayıtlı hesabın e-posta adresini eksiksiz yazın; her arama denetim kaydına yazılır.'
- 'Seçilen köşk nazımları' listesi: avatar, ad, e-posta, canlı bölge 'X seçildi'.
- Alan 'Görev bitişi (isteğe bağlı)' tarih; yardım 'Boş bırakırsanız görev siz çıkarana dek sürer. Süre dolunca başka köşk nazımı yoksa köşk pasifleşir.'
- Dipnot 'Köşk nazımının yapabildikleri … bölümünde listelenir.'; düğmeler 'Vazgeç', 'Ekle'.
- i18n: libs/i18n/src/locales/tr/nizam.json'da bu ekran için anahtar YOK (yalnız Decks/Kosks/NewCoursePage); yeni anahtarlar `KoskNazimlari.*` olarak eklenmeli.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Başlangıç: 'Ekle' devre dışı (seçili kişi yok).
- Arama: eşleşme yok → 'Bu e-postayla kayıtlı hesap bulunamadı.' (metin tuvalde yok — doğrulanamadı, uydurulmadı).
- Kişi zaten köşk nazımı → hata; metin tuvalde yok (doğrulanamadı).
- Gönderiliyor: 'Ekle' spinner, alanlar kilitli.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: yalnız başnazım/nazım; köşk nazımının kendisi Köşk nazımları sayfasında ekleme düğmesi görmez (nizam/25: 'Medaris yönetimi atar').
- Doğrulama: köşk nazımı seçimi zorunlu; bitiş tarihi geçmişte olamaz (kural tuvalde yazmıyor — doğrulanamadı).

## 4. Etkileşimler
- E-posta yazılınca eşleşen hesap önerilir; seçilince 'Seçilen köşk nazımları'na eklenir (çoklu seçim mümkün görünüyor: başlık çoğul).
- 'Ekle': nazım(lar) köşke bağlanır, dialog kapanır, listede satır görünür, Toast ile bildirim; işlem denetim kaydına yazılır.
- 'Vazgeç'/Esc/kapat: kapanır; perdeyle kapanmaz (madde 20), odak ilk alanda (madde 13).

## 5. API
- `GET /users/lookup?email=` — YOK — yeni endpoint. Tam e-posta eşleşmesi döner `{id,name,email}`; her arama denetim kaydına yazılır. Kanıt: tedrisat/teskilat controller'larında kullanıcı arama yok (grep `@Controller` yalnız app, course, kosk, flashcard*). Kaynak belirsiz: kullanıcı dizini Keycloak'ta; yerel kullanıcı tablosu da yok — doğrulanamadı.
- `POST /kosks/:id/nazimlar` — YOK — yeni endpoint; gövde `{userId, endsAt?}`, yanıt `KoskNazimResponse`. Mevcut en yakın: `PATCH /kosks/:id` yalnız köşk alanlarını günceller, sahip değiştirmez (apps/tedrisat/src/kosk/kosk.controller.ts:95; UpdateKoskDto'da ownerId yok — kosk/dto/update-kosk.dto.ts:4).
- Denetim kaydı yazımı — YOK (audit tablosu/endpoint yok).

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Üyelik tablosu, kullanıcı arama ve denetim yazımı yeni yazılarak kodlanabilir; üçüncü parti zorunluluğu yoktur. Tek risk: kullanıcı dizini Keycloak'ta ise e-posta araması Keycloak Admin API gerektirir (doğrulanamadı); yerel kullanıcı tablosuyla çözülürse B kalır.

## 7. Mevcut durum
Yok. Dialog bileşeni libs/ui'de var (libs/ui/src/components/dialog.tsx) ama Base UI'ye geçiş henüz yapılmadı (_kurallar.md C tablosu).

## 8. Kabul kriterleri
1. Başnazım 'Köşk nazımı ekle'ye basınca dialog açılır, ilk alana odaklanır.
2. Tam e-postayla bulunan hesap seçildiğinde listede gösterilir ve 'Ekle' etkinleşir.
3. 'Ekle' başarılı olunca nazım köşk nazımları listesinde görünür ve denetim kaydına bir satır yazılır.
4. Bitiş tarihi boşsa görev 'Süresiz' görünür; doluysa tarih gösterilir.
5. Aynı kişi ikinci kez eklenemez ve hata gösterilir.
6. Başnazım/nazım olmayan çağrı 403 döner.

## 9. Test senaryoları
**Unit (Vitest)**
- Seçici bileşeni: e-posta eşleşmesi → seçilen kişi durumu, canlı bölge metni.
- Form: seçim yokken 'Ekle' disabled; geçmiş tarih reddedilir.
- Server action `addKoskNazimi`: hata → Toast dalı.

**Playwright e2e (gerçek API'ye karşı)**
- Başnazım olarak giriş → Köşkler → Nûruosmaniye → Köşk nazımları → 'Köşk nazımı ekle'.
- Geçerli e-posta yaz → hesap seçilir → bitiş tarihi boş → 'Ekle'.
- Listede yeni satır + Toast; sayfa yenilenince kalıcı.
- Olmayan e-posta → eşleşme yok durumu.
- Yetkisiz kullanıcıyla aynı endpoint → 403.
