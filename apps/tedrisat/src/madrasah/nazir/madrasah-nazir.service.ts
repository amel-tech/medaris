import { Injectable } from "@nestjs/common";
import type {
  DismissAction,
  NazimPersonResponse,
} from "../../assignment/admin/dto/permission-admin.dto";
import { earliestEnd } from "../../assignment/admin/grant-plan";
import {
  AssignmentRepository,
  type IPersonName,
} from "../../assignment/assignment.repository";
import { UserDirectoryService } from "../../assignment/user-directory.service";
import { MadrasahNotFoundError } from "../errors/madrasah-not-found.error";
import { NazirNotFoundError } from "../errors/nazir-not-found.error";
import type {
  MadrasahNazirGivenResponse,
  MadrasahNazirGroupResponse,
  MadrasahNazirResponse,
} from "./dto/madrasah-nazir.dto";
import {
  type INazirRole,
  MadrasahNazirRepository,
} from "./madrasah-nazir.repository";

function personOf(
  id: string,
  people: Map<string, IPersonName>
): NazimPersonResponse {
  const person = people.get(id);
  const name = [person?.givenName, person?.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return { id, name: name || null, email: person?.email ?? null };
}

/**
 * The medrese's nazırs (nazir/05 and nazir/15): the MEDRESE_NAZIR appointments
 * and what hangs on them in the medrese. Reached through
 * `MadrasahNazirController`, whose `@Authz` scopes decide who may call it —
 * the medrese's başmüderris and SYSTEM_ADMIN; nothing here re-checks the
 * caller. A nazır holds nothing until someone gives it (nazir/06).
 */
@Injectable()
export class MadrasahNazirService {
  constructor(
    private readonly repo: MadrasahNazirRepository,
    private readonly assignments: AssignmentRepository,
    private readonly directory: UserDirectoryService
  ) {}

  async list(madrasahId: string): Promise<MadrasahNazirResponse[]> {
    return this.present(madrasahId, await this.repo.heldRoles(madrasahId));
  }

  /** Idempotent: appointing a nazır again answers the same row. */
  async appoint(
    madrasahId: string,
    userId: string,
    actorId: string
  ): Promise<MadrasahNazirResponse> {
    const id = userId.toLowerCase();
    if (!(await this.repo.appoint(madrasahId, id, actorId))) {
      throw new MadrasahNotFoundError(madrasahId);
    }
    const [nazir] = await this.present(
      madrasahId,
      await this.repo.heldRoles(madrasahId, id)
    );
    return nazir;
  }

  async given(
    madrasahId: string,
    nazirId: string
  ): Promise<MadrasahNazirGivenResponse[]> {
    const id = nazirId.toLowerCase();
    if ((await this.repo.heldRoles(madrasahId, id)).length === 0) {
      throw new NazirNotFoundError(madrasahId, id);
    }
    const rows = await this.repo.heldGivenBy(madrasahId, id);
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const [names, groups, people] = await Promise.all([
      this.assignments.findScopeNames(
        rows.map((r) => ({ type: r.scopeType, id: r.scopeId }))
      ),
      this.assignments.findGroups(
        rows.flatMap((r) => (r.groupId ? [r.groupId] : []))
      ),
      this.directory.resolvePeople(userIds),
    ]);
    return userIds.map((userId) => {
      const mine = rows.filter((r) => r.userId === userId);
      return {
        user: personOf(userId, people),
        roles: mine.flatMap((r) =>
          r.role
            ? [
                {
                  role: r.role,
                  scopeType: r.scopeType,
                  scopeName:
                    names.get(`${r.scopeType}:${r.scopeId ?? ""}`)?.name ??
                    null,
                  grantedAt: r.createdAt,
                  expiresAt: r.expiresAt,
                },
              ]
            : []
        ),
        groups: mine.flatMap((r) => {
          const group = r.groupId ? groups.get(r.groupId) : undefined;
          return group ? [group] : [];
        }),
        permissions: mine.flatMap((r) => (r.permission ? [r.permission] : [])),
      };
    });
  }

  async dismiss(
    madrasahId: string,
    nazirId: string,
    actorId: string,
    decisions: ReadonlyArray<{ userId: string; action: DismissAction }>
  ): Promise<void> {
    await this.repo.dismiss(
      madrasahId,
      nazirId.toLowerCase(),
      actorId,
      decisions
    );
  }

  private async present(
    madrasahId: string,
    roles: INazirRole[]
  ): Promise<MadrasahNazirResponse[]> {
    if (roles.length === 0) return [];
    const userIds = roles.map((r) => r.userId);
    const grants = await this.repo.heldGrants(madrasahId, userIds);
    const [groups, people] = await Promise.all([
      this.assignments.findGroups(
        grants.flatMap((g) => (g.groupId ? [g.groupId] : []))
      ),
      this.directory.resolvePeople([
        ...userIds,
        ...roles.map((r) => r.grantedBy),
        ...grants.map((g) => g.grantedBy),
      ]),
    ]);
    return roles.map((role) => {
      const mine = grants.filter((g) => g.userId === role.userId);
      const heldGroups: MadrasahNazirGroupResponse[] = mine.flatMap((g) => {
        const group = g.groupId ? groups.get(g.groupId) : undefined;
        return group ? [group] : [];
      });
      const [first] = mine;
      return {
        user: personOf(role.userId, people),
        appointedBy: personOf(role.grantedBy, people),
        appointedAt: role.createdAt,
        assignmentExpiresAt: role.expiresAt,
        expiresAt: earliestEnd([
          role.expiresAt,
          ...mine.map((g) => g.expiresAt),
        ]),
        groups: heldGroups,
        permissions: mine.flatMap((g) =>
          g.permission ? [{ code: g.permission, grantedAt: g.createdAt }] : []
        ),
        grantedBy: first ? personOf(first.grantedBy, people) : null,
        grantedAt: first?.createdAt ?? null,
      };
    });
  }
}
