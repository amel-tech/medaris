import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

/**
 * A translator typed by what it takes, not by the app's whole catalogue.
 *
 * `tedris` is at the edge of TS2589 (MDRS-164, MDRS-165): every key added to
 * the catalogue the checker unions makes some distant `t(...)` call fail with
 * "Type instantiation is excessively deep". The Hesap, Herkese açık profil and
 * Köşk açma başvurusu texts (MDRS-166, namespace `tedrisAccount`) are therefore
 * not registered in `next-i18n.d.ts` and are read through these two helpers.
 * What the types no longer catch, `test/account-messages-parity.spec.ts` does:
 * every key exists in tr, en and ar, and every key the code asks for exists.
 */
export type LooseTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

export type AccountNamespace =
  | "AccountProfile"
  | "PublicProfile"
  | "KoskApplication";

export const useAccountTranslations = (
  namespace: AccountNamespace
): LooseTranslator =>
  useTranslations(`tedrisAccount.${namespace}` as never) as never;

export const getAccountTranslations = async (
  namespace: AccountNamespace
): Promise<LooseTranslator> =>
  (await getTranslations(`tedrisAccount.${namespace}` as never)) as never;
