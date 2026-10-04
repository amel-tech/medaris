import { hiddenBySave } from "../../../src/course/domain/syllabus-drops";

const shown = {
  weekIds: ["w1", "w2"],
  lessonIds: ["l1", "l2", "l3"],
};

describe("hiddenBySave", () => {
  it("hides nothing when every week and session is carried", () => {
    expect(
      hiddenBySave(shown, [
        { id: "w1", lessons: [{ id: "l1" }, { id: "l2" }] },
        { id: "w2", lessons: [{ id: "l3" }, {}] },
      ])
    ).toEqual({ weeks: 0, sessions: 0 });
  });

  it("counts a week and the sessions of it that the payload leaves out", () => {
    expect(
      hiddenBySave(shown, [{ id: "w1", lessons: [{ id: "l1" }] }])
    ).toEqual({ weeks: 1, sessions: 2 });
  });

  it("keeps a session that moves to another week", () => {
    expect(
      hiddenBySave(shown, [
        { id: "w1", lessons: [] },
        { id: "w2", lessons: [{ id: "l1" }, { id: "l2" }, { id: "l3" }] },
      ])
    ).toEqual({ weeks: 0, sessions: 0 });
  });

  it("hides everything when the payload carries no weeks", () => {
    expect(hiddenBySave(shown, [])).toEqual({ weeks: 2, sessions: 3 });
  });

  it("does not count weeks or sessions the payload adds", () => {
    expect(
      hiddenBySave(shown, [
        { id: "w1", lessons: [{ id: "l1" }, { id: "l2" }, { id: "l3" }] },
        { id: "w2" },
        { lessons: [{}] },
      ])
    ).toEqual({ weeks: 0, sessions: 0 });
  });
});
