<#-- Shared layout for this theme's HTML e-mails (MDRS-100). Deliberately not
     called template.ftl: Keycloak resolves an import in the child theme first,
     so the base e-mails this theme does not override (execute actions, SMTP
     test, update e-mail, …) would get this macro and fail on its required
     parameters. They keep base's template.ftl. Placeholder until the A8
     design (MDRS-127): brand bar, one card, one button, a plain-text fallback
     for the link. Inline styles only, because most mail clients drop <style>.
     `emailDirection` / `emailLanguage` are per-locale messages, so an Arabic
     e-mail is right-to-left without the template knowing which locale it is.
     The link itself is always wrapped left-to-right. -->
<#macro emailLayout title buttonLabel buttonHref>
<!DOCTYPE html>
<html lang="${msg("emailLanguage")}" dir="${msg("emailDirection")}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body dir="${msg("emailDirection")}" style="margin:0;padding:0;background-color:#f1f5f9;font-family:'IBM Plex Sans','IBM Plex Sans Arabic',Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;">
<tr>
<td style="background-color:#0c4a6e;border-radius:12px 12px 0 0;padding:20px 32px;color:#ffffff;font-family:'Cairo',Arial,sans-serif;font-size:20px;font-weight:700;">${realmName}</td>
</tr>
<tr>
<td style="padding:32px;">
<h1 style="margin:0 0 16px 0;font-family:'Cairo',Arial,sans-serif;font-size:22px;line-height:1.4;color:#111827;">${title}</h1>
<#nested>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
<tr>
<td style="background-color:#0c4a6e;border-radius:8px;">
<a href="${buttonHref}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:600;text-decoration:none;">${buttonLabel}</a>
</td>
</tr>
</table>
<p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#4b5563;">${msg("emailLinkFallback")}</p>
<p dir="ltr" style="margin:0;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${buttonHref}" style="color:#0c4a6e;">${buttonHref}</a></p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
</#macro>
