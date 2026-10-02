import type { Attribute } from "keycloakify/login/KcContext";
import type { ReactNode } from "react";
import type { I18n } from "../i18n";

/**
 * The label of the "Aydınlatma Metni’ni okudum." box (MDRS-102): the
 * attribute's `linkUrl` and `linkLabel` annotations, set in
 * `config/keycloak/user-profile.json`, and an option label whose message has
 * `{0}` where the link goes — "{0}’ni okudum." with "Aydınlatma Metni". The
 * link opens in a new tab so the half-filled form stays where it is
 * (canvas medaris/03), and it is described by a note that says so.
 *
 * Without an http(s) `linkUrl` the link text is still put in place of `{0}`,
 * as plain text, so the label never shows the placeholder. Without a
 * `linkLabel` the label is the option's plain text.
 */
export function privacyNoticeLabel(
  i18n: I18n,
  attribute: Attribute,
  option: string,
  newTabNoteId: string
): ReactNode {
  const { advancedMsgStr } = i18n;
  const { linkUrl, linkLabel } = attribute.annotations as Record<
    string,
    unknown
  >;
  const label = advancedMsgStr(
    attribute.annotations.inputOptionLabels?.[option] ?? option
  );

  if (typeof linkLabel !== "string") {
    return label;
  }

  const [before = "", after = ""] = label.split("{0}");
  const text = advancedMsgStr(linkLabel);

  if (typeof linkUrl !== "string" || !/^https?:\/\//.test(linkUrl)) {
    return `${before}${text}${after}`;
  }

  return (
    <>
      {before}
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={newTabNoteId}
      >
        {text}
      </a>
      {after}
    </>
  );
}
