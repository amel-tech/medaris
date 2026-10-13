import type {
  ProfileFieldKind,
  ProfileFieldOption,
  ProfileFieldSpec,
  ProfileFieldValue,
} from "@medaris/ui/giris";
import type { Attribute } from "keycloakify/login/KcContext";
import type { ReactNode } from "react";
import { Html } from "./components/Html";
import {
  linkedOptionLabel,
  optionLinkUrl,
} from "./components/linkedOptionLabel";
import type { I18n } from "./i18n";
import type { KcContext } from "./KcContext";

/**
 * Keycloak's user profile, read into the provider-free field specs of
 * `@medaris/ui/giris` (canvas rule 44). The registration and profile pages
 * draw whatever the realm's profile declares (`config/keycloak/user-profile.json`),
 * in its order, so an attribute added there needs no page change.
 *
 * Input types, as Keycloak names them in the attribute's `inputType`
 * annotation, map to the design system's controls:
 *
 *   text, html5-* (email, tel, url, number, date, time…)  → Input
 *   textarea                                              → Textarea
 *   select (and an `options` validator with no type)      → Select
 *   select-radiobuttons                                   → RadioGroup
 *   multiselect-checkboxes, multiselect                   → boxes; one option is a lone box
 *   hidden                                                → a hidden input
 *
 * `multiselect` becomes boxes because the system has no multiple select;
 * every option stays on screen. A multivalued text attribute (Keycloak's
 * "add another value") is drawn as one field.
 */

type MessagesPerField = KcContext["messagesPerField"];

const AUTOCOMPLETE: Record<string, string> = {
  firstName: "given-name",
  lastName: "family-name",
  username: "username",
  email: "email",
};

/** Fields whose content is Latin script and left to right, on an Arabic page too. */
const LATIN_TYPES = new Set(["email", "url", "tel"]);
const LATIN_NAMES = new Set(["username", "email"]);

// Keycloak checks the address itself; this only catches what is plainly not one.
const EMAIL = /^[^\s@]+@[^\s@]+$/;

const PASSWORD_NAMES = new Set(["password", "password-confirm"]);

/** The options of a choice, from the validator the attribute names or its `options` validator. */
function optionValues(attribute: Attribute): string[] {
  const validators = attribute.validators as Record<
    string,
    { options?: string[] } | undefined
  >;
  const from = attribute.annotations.inputOptionsFromValidation;
  return (
    (from !== undefined ? validators[from]?.options : undefined) ??
    attribute.validators.options?.options ??
    []
  );
}

function optionLabel(i18n: I18n, attribute: Attribute, option: string) {
  const { inputOptionLabels, inputOptionLabelsI18nPrefix } =
    attribute.annotations;
  if (inputOptionLabels !== undefined) {
    return i18n.advancedMsgStr(inputOptionLabels[option] ?? option);
  }
  if (inputOptionLabelsI18nPrefix !== undefined) {
    return i18n.advancedMsgStr(`${inputOptionLabelsI18nPrefix}.${option}`);
  }
  return option;
}

function kindOf(attribute: Attribute, optionCount: number): ProfileFieldKind {
  const inputType =
    attribute.annotations.inputType ??
    (attribute.validators.options !== undefined ? "select" : "text");
  switch (inputType) {
    case "hidden":
      return "hidden";
    case "textarea":
      return "textarea";
    case "select":
      return "select";
    case "select-radiobuttons":
      return "radio";
    case "multiselect":
    case "multiselect-checkboxes":
      return optionCount === 1 ? "checkbox" : "checkboxes";
    default:
      return "text";
  }
}

const toNumber = (value: string | number | undefined) =>
  value === undefined || value === "" ? undefined : Number(value);

/**
 * The client-side half of the attribute's validators: `length`, `email` and
 * `pattern`, with Keycloak's own messages. Everything else (`options`, the
 * prohibited-characters validators, uniqueness) is the server's; its answer
 * arrives as the field's error.
 */
function checkOf(
  attribute: Attribute,
  i18n: I18n,
  type: string
): ProfileFieldSpec["check"] {
  const { length, pattern } = attribute.validators;
  const isEmail = attribute.validators.email !== undefined || type === "email";
  if (length === undefined && pattern === undefined && !isEmail) {
    return undefined;
  }
  const { msg, advancedMsg } = i18n;
  const min = toNumber(length?.min);
  const max = toNumber(length?.max);
  let expression: RegExp | undefined;
  try {
    expression =
      pattern?.pattern !== undefined ? new RegExp(pattern.pattern) : undefined;
  } catch {
    // a Java-only expression; the server still checks it
    expression = undefined;
  }
  // keycloakify fills a message's placeholders from its lowest one: the
  // theme's length messages start at {1} (no field name), so the first
  // argument is {1}, and "too long" has only {2}.
  return (value: ProfileFieldValue) => {
    const text = Array.isArray(value) ? (value[0] ?? "") : value;
    if (min !== undefined && text.length < min) {
      return max !== undefined
        ? msg("error-invalid-length", String(min), String(max))
        : msg("error-invalid-length-too-short", String(min));
    }
    if (max !== undefined && text.length > max) {
      return min !== undefined
        ? msg("error-invalid-length", String(min), String(max))
        : msg("error-invalid-length-too-long", String(max));
    }
    if (isEmail && !EMAIL.test(text)) {
      return msg("error-invalid-email");
    }
    if (expression !== undefined && !expression.test(text)) {
      const message = pattern?.["error-message"];
      return message !== undefined
        ? advancedMsg(message)
        : msg("error-pattern-no-match");
    }
    return undefined;
  };
}

export interface ProfileFieldOptions {
  i18n: I18n;
  /** the page's language: Keycloak's `locale` attribute posts it */
  languageTag?: string;
  /** Keycloak's answer to the last submission; the profile page reads it elsewhere */
  messagesPerField?: MessagesPerField;
  /** a help line the page puts under a field the profile gives none ("emailVerifyHelp" under the e-mail) */
  help?: Partial<Record<string, ReactNode>>;
}

/** One attribute of Keycloak's user profile as a field spec. */
export function profileFieldSpec(
  attribute: Attribute,
  { i18n, languageTag, messagesPerField, help }: ProfileFieldOptions
): ProfileFieldSpec {
  const { msg, msgStr, advancedMsg, advancedMsgStr } = i18n;
  const { annotations } = attribute;
  const name = attribute.name;

  const values = optionValues(attribute);
  const kind = kindOf(attribute, values.length);
  const htmlType = annotations.inputType?.startsWith("html5-")
    ? annotations.inputType.slice("html5-".length)
    : undefined;
  const type = PASSWORD_NAMES.has(name)
    ? "password"
    : (htmlType ?? (name === "email" ? "email" : "text"));

  const noteId = `${name}-new-tab`;
  const lone = kind === "checkbox";
  const linked = lone && optionLinkUrl(attribute) !== undefined;
  const options: ProfileFieldOption[] = values.map((value) => ({
    value,
    label: optionLabel(i18n, attribute, value),
  }));

  const label: ReactNode =
    lone && values[0] !== undefined
      ? linkedOptionLabel(i18n, attribute, values[0], noteId)
      : advancedMsg(attribute.displayName ?? name);

  const helpText =
    annotations.inputHelperTextAfter ?? annotations.inputHelperTextBefore;

  const defaultValue: ProfileFieldValue =
    name === "locale" && languageTag
      ? languageTag
      : kind === "checkbox" || kind === "checkboxes"
        ? (attribute.values ??
          (attribute.value !== undefined ? [attribute.value] : []))
        : (attribute.value ?? attribute.values?.[0] ?? "");

  return {
    name,
    // Keycloak 26.2+ puts `locale` into the profile it serves; it is the
    // page's language, posted so a new account keeps it, and never shown.
    kind: name === "locale" ? "hidden" : kind,
    label,
    required: attribute.required,
    readOnly: attribute.readOnly,
    help:
      helpText !== undefined
        ? advancedMsg(helpText)
        : (help?.[name] ??
          (attribute.readOnly ? msg("readOnlyHelp") : undefined)),
    error: messagesPerField?.existsError(name) ? (
      <Html html={messagesPerField.get(name)} />
    ) : undefined,
    options,
    defaultValue,
    type,
    autoComplete:
      attribute.autocomplete ??
      (PASSWORD_NAMES.has(name) ? "new-password" : AUTOCOMPLETE[name]),
    latin:
      LATIN_NAMES.has(name) ||
      PASSWORD_NAMES.has(name) ||
      LATIN_TYPES.has(type),
    placeholder:
      annotations.inputTypePlaceholder !== undefined
        ? advancedMsgStr(annotations.inputTypePlaceholder)
        : kind === "select"
          ? msgStr("selectAnOption")
          : undefined,
    minLength: toNumber(annotations.inputTypeMinlength),
    maxLength: toNumber(annotations.inputTypeMaxlength),
    pattern: annotations.inputTypePattern,
    min: annotations.inputTypeMin,
    max: annotations.inputTypeMax,
    step: annotations.inputTypeStep,
    rows: toNumber(annotations.inputTypeRows),
    labelNote: linked
      ? { id: noteId, text: msg("privacyNoticeNewTab") }
      : undefined,
    group:
      attribute.group !== undefined
        ? {
            name: attribute.group.name,
            header: attribute.group.displayHeader
              ? advancedMsg(attribute.group.displayHeader)
              : attribute.group.name,
            description: attribute.group.displayDescription
              ? advancedMsg(attribute.group.displayDescription)
              : undefined,
          }
        : undefined,
    requiredError: lone
      ? linked
        ? msg("privacyNoticeRequired")
        : msg("requiredCheckbox")
      : undefined,
    check:
      kind === "text" || kind === "textarea"
        ? checkOf(attribute, i18n, type)
        : undefined,
  };
}

/** Every attribute, in the order Keycloak serves them: the realm's profile order. */
export const profileFieldSpecs = (
  attributes: Attribute[],
  options: ProfileFieldOptions
) => attributes.map((attribute) => profileFieldSpec(attribute, options));
