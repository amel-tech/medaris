import { BadRequestException } from "@nestjs/common";
import { Request } from "express";
import { byBody, byParam, byQuery, ENTITIES } from "../../src";

const req = (overrides: Partial<Record<string, unknown>> = {}): Request =>
  ({
    params: {},
    query: {},
    body: {},
    ...overrides,
  }) as unknown as Request;

describe("authz resolvers", () => {
  describe("byParam", () => {
    it("reads :id by default", () => {
      const r = byParam(ENTITIES.COURSE);
      expect(r(req({ params: { id: "c-1" } }))).toEqual({
        entity: "course",
        id: "c-1",
      });
    });

    it("reads a custom param name", () => {
      const r = byParam(ENTITIES.COURSE, "courseId");
      expect(r(req({ params: { courseId: "c-1" } }))).toEqual({
        entity: "course",
        id: "c-1",
      });
    });

    it("returns empty id when the param is missing (guard rejects as config error)", () => {
      const r = byParam(ENTITIES.COURSE);
      expect(r(req({ params: { wrong: "c-1" } }))).toEqual({
        entity: "course",
        id: "",
      });
    });

    it("returns empty id when the param is an array (?id=a&id=b style)", () => {
      const r = byParam(ENTITIES.COURSE);
      expect(r(req({ params: { id: ["a", "b"] } }))).toEqual({
        entity: "course",
        id: "",
      });
    });
  });

  describe("byBody", () => {
    it("reads a body field", () => {
      const r = byBody(ENTITIES.KOSK, "koskId");
      expect(r(req({ body: { koskId: "k-1" } }))).toEqual({
        entity: "kosk",
        id: "k-1",
      });
    });

    it("answers 400, not a configuration error, when the field is missing or not a string", () => {
      // Guards run before pipes, so the DTO has not validated the body yet
      // and its shape is the client's choice — a malformed request, not a
      // wiring bug.
      const r = byBody(ENTITIES.KOSK, "koskId");
      expect(() => r(req({ body: undefined }))).toThrow(BadRequestException);
      expect(() => r(req({ body: { koskId: 42 } }))).toThrow(
        BadRequestException
      );
      expect(() => r(req({ body: { koskId: "" } }))).toThrow(
        /'koskId' must be a non-empty string/
      );
    });
  });

  describe("byQuery", () => {
    it("reads a query field", () => {
      const r = byQuery(ENTITIES.FLASHCARD_DECK, "deckId");
      expect(r(req({ query: { deckId: "d-1" } }))).toEqual({
        entity: "flashcard-deck",
        id: "d-1",
      });
    });

    it("answers 400 for a repeated query key (?deckId=a&deckId=b) or a missing one", () => {
      const r = byQuery(ENTITIES.FLASHCARD_DECK, "deckId");
      expect(() => r(req({ query: { deckId: ["a", "b"] } }))).toThrow(
        BadRequestException
      );
      expect(() => r(req({ query: {} }))).toThrow(BadRequestException);
    });
  });
});
