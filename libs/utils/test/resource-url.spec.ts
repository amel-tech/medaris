import { describe, expect, it } from "vitest";
import {
  RESOURCE_URL_MAX_LENGTH,
  resourceHref,
  resourceUrlProblem,
} from "../src/resource-url";

// MDRS-279: a resource's url is an href in tedris, so the editors take only
// what tedrisat's `@IsUrl({ protocols: ["http", "https"], require_protocol })`
// takes, and tedris links only an http(s) address.
describe("resourceUrlProblem", () => {
  it("takes an absolute http or https address", () => {
    expect(resourceUrlProblem("https://files.medaris.org/bina.pdf")).toBeNull();
    expect(resourceUrlProblem("http://emsile.test/")).toBeNull();
    expect(resourceUrlProblem("  https://192.168.1.10/kitap  ")).toBeNull();
  });

  it("refuses an empty one: a resource is a link", () => {
    expect(resourceUrlProblem("")).toBe("empty");
    expect(resourceUrlProblem("   ")).toBe("empty");
    expect(resourceUrlProblem(null)).toBe("empty");
  });

  it("refuses another scheme, a relative address and one with no scheme", () => {
    expect(resourceUrlProblem("javascript:alert(document.cookie)")).toBe(
      "not-http"
    );
    expect(resourceUrlProblem("JaVaScRiPt:alert(1)")).toBe("not-http");
    expect(resourceUrlProblem("data:text/html,<b>x</b>")).toBe("not-http");
    expect(resourceUrlProblem("ftp://files.medaris.org/bina.pdf")).toBe(
      "not-http"
    );
    expect(resourceUrlProblem("/bina.pdf")).toBe("not-http");
    expect(resourceUrlProblem("files.medaris.org/bina.pdf")).toBe("not-http");
  });

  it("refuses what validator.js would: no top-level domain, spaces, an underscore", () => {
    expect(resourceUrlProblem("https://localhost/bina.pdf")).toBe("invalid");
    expect(resourceUrlProblem("https://files.medaris.org/bi na.pdf")).toBe(
      "invalid"
    );
    expect(resourceUrlProblem("https://my_files.medaris.org/")).toBe("invalid");
    expect(resourceUrlProblem("https://")).toBe("invalid");
  });

  it("refuses an address longer than the column", () => {
    const long = `https://files.medaris.org/${"a".repeat(RESOURCE_URL_MAX_LENGTH)}`;
    expect(resourceUrlProblem(long)).toBe("too-long");
  });
});

describe("resourceHref", () => {
  it("links an http or https address as it is", () => {
    expect(resourceHref("https://files.medaris.org/bina.pdf")).toBe(
      "https://files.medaris.org/bina.pdf"
    );
    expect(resourceHref(" http://emsile.test/ ")).toBe("http://emsile.test/");
  });

  it("links nothing else", () => {
    expect(resourceHref("javascript:alert(1)")).toBeNull();
    expect(resourceHref(" javascript:alert(1)")).toBeNull();
    expect(resourceHref("data:text/html,x")).toBeNull();
    expect(resourceHref("/bina.pdf")).toBeNull();
    expect(resourceHref("files.medaris.org/bina.pdf")).toBeNull();
    expect(resourceHref("https://")).toBeNull();
    expect(resourceHref("")).toBeNull();
    expect(resourceHref(null)).toBeNull();
    expect(resourceHref(undefined)).toBeNull();
  });
});
