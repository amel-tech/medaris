import { getTranslations } from "next-intl/server";

/**
 * `tedris.AccountPage` as a translator that takes a key built at run time.
 * The role names, the permission codes and the badge states come from the API,
 * so their keys cannot be literals; `test/account-messages.spec.ts` pins that
 * every one of them exists in all three languages.
 */
export interface AccountMessages {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
}

export async function getAccountMessages(): Promise<AccountMessages> {
  return (await getTranslations(
    "tedris.AccountPage"
  )) as unknown as AccountMessages;
}
