import { describe, expect, it } from "vitest";
import { resourceProviderOf } from "~/features/courses/resource-provider";

// MDRS-286: staff upload a file to Google Drive and paste its link, and the
// list says it is on Drive. The host decides, as tedrisat's
// `detectRecordingLink` reads a Drive link; only an address the list links is
// read at all.

describe("resourceProviderOf", () => {
  it.each([
    "https://drive.google.com/file/d/1a2b3c/view?usp=sharing",
    "http://drive.google.com/drive/folders/xyz",
    "https://DRIVE.GOOGLE.COM/file/d/1a2b3c/view",
    "https://docs.google.com/document/d/1a2b3c/edit",
    "https://docs.google.com/presentation/d/1a2b3c/edit",
  ])("reads %s as Google Drive", (url) => {
    expect(resourceProviderOf(url)).toBe("google-drive");
  });

  it.each([
    "https://files.medaris.org/bina.pdf",
    "https://meet.google.com/abc-defg-hij",
    "https://google.com/drive",
    "https://notdrive.google.com/file/d/1a2b3c",
    "https://drive.google.com.example.org/file/d/1a2b3c",
    "https://example.org/?u=https://drive.google.com/file/d/1a2b3c",
  ])("names no provider for %s", (url) => {
    expect(resourceProviderOf(url)).toBeNull();
  });

  it("reads nothing that the list would not link", () => {
    for (const url of [
      undefined,
      null,
      "",
      "drive.google.com/file/d/1a2b3c",
      "javascript://drive.google.com/%0aalert(1)",
      "ftp://drive.google.com/file",
    ]) {
      expect(resourceProviderOf(url)).toBeNull();
    }
  });
});
