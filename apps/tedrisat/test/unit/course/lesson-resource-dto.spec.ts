import { MedarisValidationPipe } from "@medaris/common";
import { UpdateLessonDto } from "../../../src/course/dto/update-lesson.dto";

/**
 * MDRS-286 — a celse's resource is stored trimmed: a name of spaces only is
 * refused, a line of spaces only is none. Run through the pipe the lesson
 * routes use, so the transform is the one the controller gets.
 */
describe("a celse's resource as the API takes it (MDRS-286)", () => {
  const DRIVE = "https://drive.google.com/file/d/1a2b3c/view";
  const pipe = new MedarisValidationPipe({ transform: true });
  const take = (resources: object[]) =>
    pipe.transform(
      { version: 1, resources },
      { type: "body", metatype: UpdateLessonDto }
    ) as Promise<UpdateLessonDto>;

  it("trims the name and the line, and stores a line of spaces as none", async () => {
    const dto = await take([
      { name: "  Emsile şerhi ", meta: " PDF · 12 sayfa  ", url: DRIVE },
      { name: "Bina", meta: "   ", url: DRIVE },
    ]);
    expect(dto.resources?.map(({ name, meta }) => [name, meta])).toEqual([
      ["Emsile şerhi", "PDF · 12 sayfa"],
      ["Bina", null],
    ]);
  });

  it.each([
    "",
    "   ",
    "\t\n",
  ])("refuses the name %j with a 400 naming the field", async (name) => {
    await expect(take([{ name, url: DRIVE }])).rejects.toMatchObject({
      context: {
        errors: [
          {
            property: "resources.0.name",
            constraints: {
              minLength: "name must be longer than or equal to 1 characters",
            },
          },
        ],
      },
    });
  });
});
