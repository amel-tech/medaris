import { resources } from "@medaris/i18n";
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Helpers for specs that render the portal's pages without a server: a
 * `getTranslations` that reads the real Turkish catalogue, and a renderer that
 * first resolves the async server components `renderToStaticMarkup` cannot.
 */
const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (n, part) => (n as Record<string, unknown> | undefined)?.[part],
      node
    );

export const translatorFor = (
  namespace = "",
  locale: "tr" | "en" | "ar" = "tr"
) => {
  const base = namespace
    ? dig(resources[locale], namespace)
    : resources[locale];
  const path = (key: string) => (namespace ? `${namespace}.${key}` : key);
  const t = (key: string, values?: Record<string, unknown>) => {
    const text = dig(base, key);
    if (typeof text !== "string") {
      throw new Error(`no message ${locale}:${path(key)}`);
    }
    return Object.entries(values ?? {}).reduce(
      (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
      text
    );
  };
  t.has = (key: string) => typeof dig(base, key) === "string";
  return t;
};

const isAsync = (
  type: unknown
): type is (props: unknown) => Promise<ReactNode> =>
  typeof type === "function" && type.constructor.name === "AsyncFunction";

const isNodeLike = (value: unknown): boolean =>
  Array.isArray(value) || isValidElement(value);

/** Calls every async server component in the tree and leaves the rest to React. */
export async function expand(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(expand));
  if (!isValidElement(node)) return node;
  if (isAsync(node.type)) return expand(await node.type(node.props));
  const { children, ...rest } = node.props as Record<string, unknown>;
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    props[key] = isNodeLike(value) ? await expand(value as ReactNode) : value;
  }
  // Children go back as arguments, not as a prop, so that React sees a list it
  // has no reason to ask keys for, exactly as the JSX that made them did.
  if (children === undefined) return cloneElement(node as ReactElement, props);
  const expanded = await expand(children as ReactNode);
  return cloneElement(
    node as ReactElement,
    props,
    ...(Array.isArray(children) ? (expanded as ReactNode[]) : [expanded])
  );
}

export async function html(node: ReactNode): Promise<string> {
  return renderToStaticMarkup((await expand(node)) as ReactElement);
}

/** The text of a piece of markup: tags gone, whitespace folded. */
export const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
