import { readTedrisWebUrl } from "../../src/config/tedris-web-url";

const read = (value?: string) =>
  readTedrisWebUrl({ TEDRIS_WEB_URL: value } as NodeJS.ProcessEnv);

describe("TEDRIS_WEB_URL (MDRS-117)", () => {
  it("is null when unset or blank, so the API still boots", () => {
    expect(read(undefined)).toBeNull();
    expect(read("")).toBeNull();
    expect(read("   ")).toBeNull();
  });

  it("reads an origin and drops a trailing slash", () => {
    expect(read("http://localhost:4000")).toBe("http://localhost:4000");
    expect(read("https://tedris.example/")).toBe("https://tedris.example");
    expect(read("https://example.org/tedris/")).toBe(
      "https://example.org/tedris"
    );
  });

  it("refuses a value that is not an absolute http(s) URL", () => {
    expect(() => read("tedris.example")).toThrow(/TEDRIS_WEB_URL/);
    expect(() => read("ftp://tedris.example")).toThrow(/http\(s\)/);
    expect(() => read("https://tedris.example/?a=1")).toThrow(/query/);
  });
});
