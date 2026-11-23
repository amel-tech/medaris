import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { SaveZerothQuestionDto } from "../../../src/online-exam/dto/zeroth-question.dto";

const check = async (body: object) => {
  const dto = plainToInstance(SaveZerothQuestionDto, body);
  return { dto, failed: (await validate(dto)).map((e) => e.property) };
};

describe("a medrese's zeroth question, as it is sent (MDRS-299)", () => {
  it("trims the question and its options", async () => {
    const { dto, failed } = await check({
      text: "  Bu hadisi biliyor musun?  ",
      options: [" Evet ", "Hayır  "],
    });
    expect(failed).toEqual([]);
    expect(dto.text).toBe("Bu hadisi biliyor musun?");
    expect(dto.options).toEqual(["Evet", "Hayır"]);
  });

  it("asks for a question and two to ten options, each different and none blank", async () => {
    const options = ["Evet", "Hayır"];
    expect((await check({ text: "   ", options })).failed).toEqual(["text"]);
    expect((await check({ text: "Soru", options: ["Evet"] })).failed).toEqual([
      "options",
    ]);
    const eleven = Array.from({ length: 11 }, (_, i) => `Şık ${i + 1}`);
    expect((await check({ text: "Soru", options: eleven })).failed).toEqual([
      "options",
    ]);
    expect(
      (await check({ text: "Soru", options: ["Evet", " Evet"] })).failed
    ).toEqual(["options"]);
    expect(
      (await check({ text: "Soru", options: ["Evet", "  "] })).failed
    ).toEqual(["options"]);
    expect((await check({ text: "x".repeat(1001), options })).failed).toEqual([
      "text",
    ]);
  });
});
