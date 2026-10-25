# auth-account: rapor (origin/main ce47fce8)

## Akışlar ve domain

`delurio check graphs/auth-account --strict`: 12 graf, 0 hata. Her akış tr ve en için `page --strict` geçiyor.

| Akış | Durum, yapılandırma, güvence |
|---|---|
| kc-sign-in | 15 / 1014 / 6 |
| kc-register | 11 / 2330 / 5 |
| kc-reset-password | 11 / 256 / 5 |
| portal-sign-in (proxy, giriş sayfası, başlatma, callback) | 16 / 13945 / 6 |
| portal-landing (her portalın `/` kararı, ekransız) | 15 / 294 / 4 |
| portal-session (yenileme, userinfo, back-channel; ekransız) | 7 / 2808 / 4 |
| portal-sign-out | 6 / 111 / 3 |
| account-edit (Tedris Hesap, cinsiyet aynası) | 14 / 2760 / 4 |
| platform-policy | 6 / 248 / 4 |
| inactive-scope-assign | 7 / 890 / 6 |
| direct-grant (Medaris nazımı atama, izin, görevden alma) | 13 / 28014 / 5 |
| e2e-password-grant (eski direct-grant) | 4 / 33 / 3 |

`domain/domain.yaml` (`medaris.auth-account`): 11 varlık, 41 eylem (Keycloak, libs/auth, tedrisat, teskilat), 10 değişmez.

## Okumamın en zayıf olduğu yerler

- **Keycloak'ın kendi mantığı repoda yok.** Kaynak olarak realm ayarını ya da gerçek Keycloak'a karşı koşan e2e'yi gösterdim (`keycloak-provision.e2e.spec.ts:665, :691`, `keycloak-smtp.e2e.spec.ts:371, :389`). Şunlar okunmadı, varsayıldı:
  - zorunlu adımların sırası;
  - kilitli hesabın hangi iletiyi gördüğü;
  - şifre kaydından sonra ne geldiği;
  - UPDATE_PROFILE'da e-postanın düzenlenip düzenlenemediği;
  - Vazgeç'in de kod döndürdüğü (yalnız README'de yazıyor).
- **Üretim yapılandırması bilinmiyor.**
  - Üretimde oturum deposu (`WEB__AUTH_STORE_URL`) açık mı? Store ve cookie kipini ikisini birden modelledim.
  - #317'nin dört adımı yapıldı mı? Bu, AUTH-1'in üretimde ne kadar sık görüldüğünü belirler.
- **Bütçeleri sadeleştirdim.** Sayaçlar "var / bitti" oldu. Sekme başına üç bütçe tek değişkene indi. Çok sekme tek sekme olarak çizildi.
- **Bir davranışı koşmadan okudum.** Base UI, initialFocus verilmeyen diyalogda ilk sekmelenebilir öğeye, yani kapat düğmesine odaklanır. Bunu belgeden okudum, çalıştırmadım.

## Bulgular

- **AUTH-1 [orta]: Cinsiyet boş kalabiliyor.**
  - `user_profiles.gender` kısıtsız, boş olabilen bir metin (`user-profile.schema.ts:33`).
  - Ayna yalnız token taşıyorsa yazılıyor (`user-sync.service.ts:75`).
  - Hesap bu durumda "Belirtilmemiş" ve "Ekle" gösteriyor (`account-settings.tsx:40, :64`).
  - Gizli herkese açık profil, iddiası olmayan tokenla istenen cinsiyeti yazdırıyor (`user-profile.service.ts:66`).
  - `setup-realm.sh:491` test kullanıcıları cinsiyetsiz.
  - Yol: tokenGender=none, mirror=none → DONE → accountPage.
- **AUTH-2 [orta]: Başnazım kendini Medaris nazımı atayabiliyor; API hesabı olmayan bir UUID'yi de atıyor.**
  - Ne öz-atama denetimi ne hesap denetimi var (`permission-admin.service.ts:118`). Ders nazırı tarafında bu denetim var (`course-nazir.service.ts:219`).
  - Kendini görevden alırsa, bugüne dek verdiği her satır sorulur, çünkü liste yalnız `grantedBy` ile süzülüyor (`permission-admin.repository.ts:243`).
  - Yol: caller=chief, target=self → DONE, APPOINT, PICK, SAVE, DONE.
- **AUTH-3 [orta]: Adın iki kaynağı var.**
  - Hesap adı yalnız tedrisat'a yazıyor (`user.service.ts:87`) ve bu ad token'ınkini eziyor (`:170`).
  - Keycloak'taki ad değişmiyor. Nazar bu adı gösteriyor (`shell/reads.ts:53`), ortak uygulama `full-name` kapsamıyla alıyor.
  - "Değiştir" ile açılan Keycloak formunda ad değiştirilirse bu Hesap'a dönmüyor.
- **AUTH-4 [düşük]: SELF_GRANT_REFUSED eşlenmemiş.** Pasif kapsam diyaloğu "Bir şeyler ters gitti" diyor (`inactive-scopes/present.ts:76`).
- **AUTH-5 [düşük]: Çıkış bazen Keycloak oturumunu açık bırakıyor.** Keycloak'a ulaşılamazsa ya da portal oturumu zaten bittiyse çıkış yalnız portalda kalıyor; sonraki "Giriş yap" sessiz geçiyor (`routes.ts:377`). Yol: idpUp=false → CONFIRM, FAIL.local → landed.
- **AUTH-6 [düşük]: Başarısız reauth turu `reauth=1`'i düşürüyor.**
  - Hata yönlendirmesi bu parametreyi taşımıyor (`routes.ts:126`).
  - Giriş sayfası reddedilmiş oturumla sayfaya geri dönüyor (`sign-in.ts:312`). Bütçe SignInLimit ile bitiriyor.
  - Yol: hasSession, apiRefuses, returned=failed → TURN, DONE, RETURNED, FAIL.failed → rendering.
- **AUTH-7 [düşük]: Tedris başlığındaki giriş Ana sayfaya dönüyor.** Başlıktaki "Giriş yap" `callbackUrl` olarak "/" veriyor (`keycloak/login.tsx:17`). README ise sayfaya döndüğünü söylüyor (`libs/auth/README.md:217`).
- **AUTH-8 [düşük]: README eskimiş.** #348'den önceki dil parçalı giriş sayfası (`README.md:92-97`) ve next-intl ara katmanı (`:145`) hâlâ anlatılıyor.
- **AUTH-9 [düşük]: Diyalog erişilebilirliği.**
  - Atama ve izin diyaloglarında ilk odak kapat düğmesinde (`dialog.tsx:97`), oysa `dialog.tsx:29` ilk alanı istiyor.
  - Görevden alma onayı `alertdialog` değil (`dismiss-dialog.tsx:149`).
  - Nazar'ın Vazgeç'i çıkış sürerken de etkin (`sign-out-confirm.tsx:39`).
- **AUTH-10 [düşük]: Görevden almada iki açmaz.**
  - 500'den fazla satır devretmiş biri görevden alınamıyor (`permission-admin.dto.ts:388`).
  - "Verdikleri" 404 dönünce sonsuza dek "yeniden deneyin" deniyor (`dismiss-dialog.tsx:82`).

## Eski bulgular

| Bulgu | Durum | Kanıt |
|---|---|---|
| F04 | sürüyor | `self-grant.guard.ts:67`; servis yorumu `inactive-scope.service.ts:248`. Yol: caller=chief, pick=self → … → DONE. |
| F21 | sürüyor | `inactive-scope.repository.ts:217` ile `platform-access.service.ts:55` |
| F22 | sürüyor | `user-directory.service.ts:34` ile `user.service.ts:104` |
| F37 | sürüyor | Repoda TERMS ayarı yok; kabul edilen tek şey `privacyNoticeRead` |
| F38 | sürüyor | `(home)/page.tsx:48, :96`. Yol: nizamRole=none, rolesRead=false → nizamWelcome. |
| F39 | sürüyor | `LoginUpdatePassword.tsx:97, :104`; form varsayılanı 10 |
| F40 | kısmen | Tedris'te sürüyor; yorumla gerekçelendirilmiş (`ErrorPage.tsx:12`). Nazar'da taban adres zaten girişe götürüyor. |
| F41 | sürüyor | Etkisi yok; kodda kabul edilmiş (`teskilat config.ts:33`) |

## delurio-graph/0'ın anlatamadıkları

- **Sayaç ve zaman pencereleri yok.** Bütçeler, 60 sn'lik yenileme ve dakikalık denetim bu yüzden havoc ile anlatıldı.
- **Koşullu etki yok.** Cinsiyet kopyası korumalı alternatiflerle yazıldı.
- **`invoke: {flow}` yalnızca bir ad.** Alt akışın sonuçları olaylara bağlanmıyor.
- **Form bileşeni yok.** Checkbox, radio, switch ve select, rol verilmiş Text, ListItem ya da TextField olarak çizildi.
- **"Doğrulama geçene dek kapalı düğme" için iki düğüm gerekti.**
- **Örnekler parametre adına göre global.** Keycloak'ın `{0}`'ı `{email}`, `{min}` gibi adlarla değiştirildi; metin aynen korundu.
- **Toast'lar status ya da alert olarak çizildi.**
- **Domain hiç denetlenmiyor.**
- **Keycloak rotalarının repoda kodu yok.**
- **Çok sekme paralel durum ister.**

## Kapsam

**Kapsananlar**
- Tema sayfaları: login, register, verify-email, info, update-profile, reset, update-password, page-expired, error, logout-confirm.
- libs/auth'un beş rotası, proxy, renewal ve istemci giriş/çıkış.
- Üç portalın proxy ve giriş/çıkış sayfaları.
- Tedris Hesap; nizam'ın platform ayarları, pasif kapsamlar ve Medaris nazımları sayfaları.
- tedrisat: me, users, platform-policy, inactive-scope, permission-admin.

**Yalnız domainde kalanlar**
- profile (gizli), izin grupları, chief-nazim, teskilat.

**Dışarıda bırakılanlar**
- LoginOauthGrant: ortak uygulama girişinin parçası.
- Terms.tsx: hiçbir yerden açılmıyor.
- Nazar ve Nizam'daki Hesap sayfaları: yalnız saat dilimi ve dil var; bunlar nav ajanının işi.
- Görevler bölümü.
- Realm araçları (provision, backfill).
- E-posta teması.
- Medrese, köşk ve ders yollarındaki öz-atama koruması: diğer alanların işi.
