<#import "medaris-layout.ftl" as layout>
<@layout.emailLayout title=msg("passwordResetTitle") buttonLabel=msg("passwordResetButton") buttonHref=link>
<p style="margin:0 0 12px 0;font-size:15px;line-height:1.7;">${msg("passwordResetIntro", realmName)}</p>
<p style="margin:0 0 12px 0;font-size:15px;line-height:1.7;">${msg("emailLinkExpiry", linkExpirationFormatter(linkExpiration))}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#4b5563;">${msg("passwordResetIgnore")}</p>
</@layout.emailLayout>
