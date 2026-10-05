import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  footerLinks,
  repositoryHref,
  SiteFooter,
} from "../components/site-footer";

const html = renderToStaticMarkup(createElement(SiteFooter));

describe("site footer", () => {
  it("links to the public repository as an outside link", () => {
    expect(repositoryHref).toBe("https://github.com/amel-tech/medaris");
    expect(html).toContain(`href="${repositoryHref}"`);
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("keeps the repository out of the page links, which are all inside the site", () => {
    expect(footerLinks.every(({ href }) => href.startsWith("/"))).toBe(true);
  });
});
