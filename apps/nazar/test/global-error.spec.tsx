import { resources } from "@medaris/i18n";
import { Button } from "@medaris/ui/mds/button";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * nazar's `error.tsx` does not cover the root layout of its own segment, and
 * there was no `global-error.tsx`: a layout that threw drew Next's bare
 * English screen. It now draws its own Turkish document, retrying through
 * Next's `retry`.
 */

const words = resources.tr.common.globalError;
const failure = () =>
  Object.assign(new Error("connect ECONNREFUSED 10.0.0.7:3000"), {
    digest: "d1",
  });

/** The kit's Button in an element tree, through `children` and `action`. */
const buttonIn = (
  node: ReactNode
): ReactElement<{ children: ReactNode; onClick: () => void }> | undefined => {
  if (Array.isArray(node)) return node.map(buttonIn).find(Boolean);
  if (!isValidElement(node)) return undefined;
  if (node.type === Button)
    return node as ReactElement<{ children: ReactNode; onClick: () => void }>;
  const { children, action } = node.props as {
    children?: ReactNode;
    action?: ReactNode;
  };
  return buttonIn(action) ?? buttonIn(children);
};

describe("global-error: the root layout threw", () => {
  it("draws its own light Turkish document, in the platform's words", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    const html = renderToStaticMarkup(
      <GlobalError error={failure()} retry={() => undefined} />
    );
    expect(html).toMatch(/^<html lang="tr" dir="ltr"[^>]* data-theme="light"/);
    expect(html).toContain(`>${words.title}</h1>`);
    expect(html).toContain(words.text);
    expect(html).toContain(`>${words.retry}</button>`);
    expect(html).toContain("medaris-theme");
  });

  it("never shows the error", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    const html = renderToStaticMarkup(
      <GlobalError error={failure()} retry={() => undefined} />
    );
    expect(html).not.toContain("ECONNREFUSED");
  });

  it("'Yeniden dene' calls Next's retry, which asks for the layout again", async () => {
    const retry = vi.fn();
    const { default: GlobalError } = await import("../app/global-error");
    // It draws its own <html>, which a test cannot mount inside a <div>: the
    // button is found in what it returns and pressed there.
    const action = buttonIn(GlobalError({ error: failure(), retry }));
    expect(action?.props.children).toBe(words.retry);
    action?.props.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
