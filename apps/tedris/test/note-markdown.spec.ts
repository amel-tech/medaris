import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteMarkdown } from "~/features/courses/note-markdown";

const html = (source: string) =>
  renderToStaticMarkup(createElement(NoteMarkdown, { source }));

/**
 * A note is stored as typed and drawn as React elements (MDRS-150): raw HTML
 * must come out as text, and a link must be a web link.
 */
describe("a note's Markdown", () => {
  it("draws emphasis, code, headings, lists and quotes", () => {
    const out = html(
      [
        "# Başlık",
        "Fâil **merfû'dur**, mef'ûl *mansûbdur* ve `kitab`.",
        "",
        "- bir",
        "- iki",
        "",
        "1. ilk",
        "2. ikinci",
        "",
        "> alıntı",
      ].join("\n")
    );
    expect(out).toContain("Başlık");
    expect(out).toContain("<strong>merfû&#x27;dur</strong>");
    expect(out).toContain("<em>mansûbdur</em>");
    expect(out).toContain("<code>kitab</code>");
    expect(out).toContain("<ul");
    expect(out).toContain("<li>bir</li>");
    expect(out).toContain("<ol");
    expect(out).toContain("<li>ikinci</li>");
    expect(out).toContain("<blockquote");
  });

  it("keeps a fenced block as code, unformatted", () => {
    const out = html("```\n**not bold**\n```");
    expect(out).toContain("<pre");
    expect(out).toContain("**not bold**");
    expect(out).not.toContain("<strong>");
  });

  it("breaks lines inside a paragraph", () => {
    expect(html("bir\niki")).toContain("bir<br/>iki");
  });

  it("never turns raw HTML into elements", () => {
    const out = html(
      '<script>alert(1)</script>\n<img src=x onerror="alert(1)">\n<b>kalın</b>'
    );
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<b>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&lt;img");
  });

  it("draws only web links, opened safely in a new tab", () => {
    const out = html(
      "[ders](https://example.com/a?b=1) ve [http](http://x.test)"
    );
    expect(out).toContain('href="https://example.com/a?b=1"');
    expect(out).toContain('href="http://x.test/"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it.each([
    "[x](javascript:alert(1))",
    "[x](data:text/html;base64,AAAA)",
    "[x](vbscript:msgbox(1))",
    "[x](//evil.test)",
    "[x](not a url)",
  ])("leaves %s as text, never a link", (source) => {
    const out = html(source);
    expect(out).not.toContain("<a ");
    expect(out).not.toContain("href=");
  });

  it("draws nothing for an empty note", () => {
    expect(html("")).not.toContain("<p");
    expect(html("  \n \n")).not.toContain("<p");
  });

  it("sets each block's direction from its own text, for Arabic and Turkish together", () => {
    expect(html("قرأ يقرأ")).toContain('dir="auto"');
  });
});
