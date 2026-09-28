<#import "medaris-layout.ftl" as layout>
<@layout.emailLayout title=msg("emailVerificationTitle") buttonLabel=msg("emailVerificationButton") buttonHref=link>
<p style="margin:0 0 12px 0;font-size:15px;line-height:1.7;">${msg("emailVerificationIntro", realmName)}</p>
<p style="margin:0 0 12px 0;font-size:15px;line-height:1.7;">${msg("emailLinkExpiry", linkExpirationFormatter(linkExpiration))}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#4b5563;">${msg("emailVerificationIgnore")}</p>
</@layout.emailLayout>
