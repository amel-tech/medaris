import { describe, expect, it } from "vitest";
import {
  accountsOf,
  canRemove,
  isImam,
  MAX_MUDERRIS,
  type Member,
  type Team,
  teamChanged,
  teamOf,
  teamProblem,
  teamReducer,
  teamRequest,
} from "~/features/courses/team";

/**
 * The müderris list of nazir 08 and 17 as rules: the imam is the lone account,
 * else the one chosen; the last account of a course that exists cannot leave;
 * only the accounts are sent.
 */
const member = (userId: string | null, name = userId ?? "Konuk"): Member => ({
  userId,
  name,
  email: userId ? `${userId}@example.com` : null,
  isImam: false,
});
const A = member("a-1", "Mehmet Emin Işıkoğlu");
const B = member("b-2", "Abdülhamit Karaosmanoğlu");
const C = member("c-3", "Ayşe Nur Kılıçarslan");
const GUEST = { ...member(null, "Konuk Müderris"), isImam: true };

const empty: Team = { members: [], imam: null };
const add = (team: Team, who: Member) =>
  teamReducer(team, { type: "add", member: who });

describe("the list a course starts from", () => {
  it("takes the imam among the accounts the API flags", () => {
    const team = teamOf([A, { ...B, isImam: true }, C]);
    expect(team.imam).toBe("b-2");
    expect(team.members.map((m) => m.name)).toEqual([A.name, B.name, C.name]);
  });

  it("makes a lone account the imam, even when the API flags a müderris with no account", () => {
    expect(teamOf([GUEST, A]).imam).toBe("a-1");
  });

  it("leaves the imam to be chosen when it is a müderris with no account and several accounts are listed", () => {
    const team = teamOf([GUEST, A, B]);
    expect(team.imam).toBeNull();
    expect(teamProblem(team)).toBe("imam");
  });

  it("starts empty with no müderris", () => {
    expect(teamOf([])).toEqual(empty);
    expect(teamProblem(teamOf([]))).toBe("none");
  });
});

describe("adding a müderris", () => {
  it("makes the first one the imam and keeps them when others join (criterion: a lone müderris is the imam)", () => {
    const one = add(empty, A);
    expect(one.imam).toBe("a-1");
    expect(teamProblem(one)).toBeNull();
    const two = add(one, B);
    expect(two.imam).toBe("a-1");
    expect(accountsOf(two)).toEqual(["a-1", "b-2"]);
  });

  it("lists nobody twice, whatever the case of the id", () => {
    const one = add(empty, A);
    expect(add(one, { ...A, userId: "A-1" })).toBe(one);
  });

  it("stops at the most the API takes", () => {
    let team = empty;
    for (let n = 0; n < MAX_MUDERRIS + 3; n += 1) {
      team = add(team, member(`u-${n}`));
    }
    expect(team.members).toHaveLength(MAX_MUDERRIS);
  });

  it("does not add a person without an account", () => {
    expect(add(empty, GUEST)).toBe(empty);
  });
});

describe("taking a müderris off", () => {
  const three = [A, B, C].reduce(add, empty);

  it("leaves the imam as chosen while they are listed", () => {
    const chosen = teamReducer(three, { type: "imam", userId: "b-2" });
    const left = teamReducer(chosen, { type: "remove", userId: "c-3" });
    expect(left.imam).toBe("b-2");
  });

  it("asks for a new imam when the imam leaves and several remain", () => {
    const left = teamReducer(three, { type: "remove", userId: "a-1" });
    expect(left.imam).toBeNull();
    expect(teamProblem(left)).toBe("imam");
  });

  it("makes the one who is left the imam", () => {
    const left = [
      { type: "remove", userId: "a-1" },
      { type: "remove", userId: "b-2" },
    ].reduce((team, action) => teamReducer(team, action as never), three);
    expect(left.imam).toBe("c-3");
    expect(teamProblem(left)).toBeNull();
  });

  it("keeps the last account on a course that exists, and lets a new one empty its list (criterion 1 of nazir 17)", () => {
    const one = add(empty, A);
    expect(canRemove(one, true)).toBe(false);
    expect(canRemove(three, true)).toBe(true);
    expect(canRemove(one, false)).toBe(true);
    expect(
      teamProblem(teamReducer(one, { type: "remove", userId: "a-1" }))
    ).toBe("none");
  });
});

describe("choosing the imam", () => {
  it("takes a listed account and ignores anyone else", () => {
    const two = [A, B].reduce(add, empty);
    expect(teamReducer(two, { type: "imam", userId: "b-2" }).imam).toBe("b-2");
    expect(teamReducer(two, { type: "imam", userId: "x-9" })).toBe(two);
  });

  it("marks a müderris with no account as the imam only while none is chosen", () => {
    const start = teamOf([GUEST, A, B]);
    expect(isImam(start, GUEST)).toBe(true);
    const chosen = teamReducer(start, { type: "imam", userId: "a-1" });
    expect(isImam(chosen, GUEST)).toBe(false);
    expect(isImam(chosen, A)).toBe(true);
    expect(isImam(chosen, B)).toBe(false);
  });
});

describe("what is sent", () => {
  it("is the accounts in the order shown and the imam, never a müderris with no account", () => {
    const team = teamReducer([GUEST, A, B].reduce(add, empty), {
      type: "imam",
      userId: "b-2",
    });
    expect(teamRequest(teamOf([GUEST, A]))).toEqual({
      muderrisUserIds: ["a-1"],
      imamUserId: "a-1",
    });
    expect(teamRequest(team)).toEqual({
      muderrisUserIds: ["a-1", "b-2"],
      imamUserId: "b-2",
    });
  });

  it("leaves the imam out while none is chosen", () => {
    expect(teamRequest(teamOf([A, B]))).toEqual({
      muderrisUserIds: ["a-1", "b-2"],
    });
  });

  it("is changed by another list, another order or another imam, and by nothing else", () => {
    const start = teamOf([{ ...A, isImam: true }, B]);
    expect(teamChanged(start, start)).toBe(false);
    expect(teamChanged(start, add(start, C))).toBe(true);
    expect(
      teamChanged(start, teamReducer(start, { type: "remove", userId: "b-2" }))
    ).toBe(true);
    expect(
      teamChanged(start, teamReducer(start, { type: "imam", userId: "b-2" }))
    ).toBe(true);
    expect(
      teamChanged(start, { ...start, members: [...start.members].reverse() })
    ).toBe(true);
  });
});
