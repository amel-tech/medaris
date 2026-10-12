import ar from "./ar/common.json";
import en from "./en/common.json";
import tr from "./tr/common.json";

/**
 * The shared `common` namespace alone, per locale, for what renders without
 * next-intl's provider: an app's `global-error`, which replaces every layout.
 * `resources` there would put every app's catalogue, in every language, into
 * a client bundle.
 */
export const commonMessages = { tr, en, ar } as const;
