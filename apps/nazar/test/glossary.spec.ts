import { describe, expect, it } from "vitest";
import {
  newTermDraft,
  TERM_EXAMPLE_MAX,
  TERM_MAX,
  termBody,
  termDraftOf,
  termProblems,
} from "~/features/glossary/glossary";

describe("termProblems", () => {
  it("requires only the term", () => {
    expect(termProblems(newTermDraft())).toEqual({ term: "required" });
    expect(termProblems({ ...newTermDraft(), term: "  " })).toEqual({
      term: "required",
    });
    expect(termProblems({ ...newTermDraft(), term: "Sarf" })).toEqual({});
  });

  it("holds each text to the API's length, counted after trimming", () => {
    expect(
      termProblems({
        ...newTermDraft(),
        term: "x".repeat(TERM_MAX + 1),
        example: "x".repeat(TERM_EXAMPLE_MAX + 1),
      })
    ).toEqual({ term: "length", example: "length" });
    expect(
      termProblems({ ...newTermDraft(), term: ` ${"x".repeat(TERM_MAX)} ` })
    ).toEqual({});
  });
});

describe("termBody and termDraftOf", () => {
  it("trims, and sends an empty text as null", () => {
    expect(
      termBody({
        term: " Mâzî ",
        arabic: " الْمَاضِي ",
        lexicalMeaning: "  ",
        technicalMeaning: "Geçmiş zamanı bildiren fiil.",
        example: "",
      })
    ).toEqual({
      term: "Mâzî",
      arabic: "الْمَاضِي",
      lexicalMeaning: null,
      technicalMeaning: "Geçmiş zamanı bildiren fiil.",
      example: null,
    });
  });

  it("opens a term for editing with its empty texts as empty fields", () => {
    expect(
      termDraftOf({
        id: "1",
        term: "Sarf",
        arabic: null,
        lexicalMeaning: "Çevirmek.",
        technicalMeaning: null,
        example: null,
      })
    ).toEqual({
      term: "Sarf",
      arabic: "",
      lexicalMeaning: "Çevirmek.",
      technicalMeaning: "",
      example: "",
    });
  });
});
