"use client";

import type {
  GroupUserResponse,
  MedarisNazimResponse,
  PermissionCatalogResponse,
  PermissionGroupResponse,
  PermissionGroupScope,
  UsersPolicy,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState } from "react";
import { createGroup, deleteGroup, updateGroup } from "../actions";
import {
  catalogFor,
  formatDay,
  GROUP_NAME_MAX,
  groupNameError,
  keepAllowed,
  type Messages,
  needsUsersQuestion,
  permissionErrorKey,
  toggleExtra,
} from "../present";
import { PermissionBoxes } from "./permission-boxes";
import { UsersPolicyDialog } from "./users-policy-dialog";

interface Props {
  /** null: a new group */
  group: PermissionGroupResponse | null;
  groups: PermissionGroupResponse[];
  catalog: PermissionCatalogResponse;
  /** the people who hold the group; null when that read failed */
  users: GroupUserResponse[] | null;
  nazims: MedarisNazimResponse[];
  onEditUser: (nazim: MedarisNazimResponse) => void;
}

const SCOPES: PermissionGroupScope[] = ["PLATFORM", "ALL_COURSES", "COURSE"];

/**
 * The form of nizam/13: the group's name, its scope, its permissions and who
 * holds it. The scope filters the catalog (a scope change drops what the new
 * one cannot hold); an existing group keeps its scope. Saving a change of
 * permissions or deleting the group asks what becomes of the people who hold
 * it (`UsersPolicyDialog`), and only while somebody does.
 */
export function GroupForm({
  group,
  groups,
  catalog,
  users,
  nazims,
  onEditUser,
}: Props) {
  const tm = useTranslations("nizam.GroupsPage");
  const t = tm as unknown as Messages;
  const tp = useTranslations("nizam.PermissionsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();

  const [name, setName] = useState(group?.name ?? "");
  const [scope, setScope] = useState<PermissionGroupScope>(
    group?.scope ?? "PLATFORM"
  );
  const [codes, setCodes] = useState<string[]>(group?.permissions ?? []);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState<"save" | "delete" | null>(null);

  const sections = useMemo(() => catalogFor(scope, catalog), [scope, catalog]);
  const nameProblem = groupNameError(name, groups, group?.id ?? null);
  const userCount = group?.userCount ?? 0;

  const reset = () => {
    setName(group?.name ?? "");
    setScope(group?.scope ?? "PLATFORM");
    setCodes(group?.permissions ?? []);
    setTouched(false);
  };

  const fail = (title: string, errorBody: unknown) =>
    toast.error(title, {
      description: tp(permissionErrorKey(errorBody) as never),
      duration: Number.POSITIVE_INFINITY,
    });

  const save = async (policy: UsersPolicy | undefined) => {
    setSaving(true);
    if (group) {
      const result = await updateGroup(group.id, {
        name: name.trim(),
        permissions: codes,
        usersPolicy: policy,
      });
      setSaving(false);
      if (!result.success) return fail(t("saveFailed"), result.errorBody);
      toast.success(t("saved"), { description: t("savedBody", { name }) });
      setAsking(null);
      router.refresh();
      return;
    }
    const result = await createGroup({
      name: name.trim(),
      scope,
      permissions: codes,
    });
    setSaving(false);
    if (!result.success) return fail(t("saveFailed"), result.errorBody);
    toast.success(t("created"), {
      description: t("createdBody", { name: result.data.name }),
    });
    router.push(`/${locale}/izin-gruplari?grup=${result.data.id}`);
    router.refresh();
  };

  const remove = async (policy: UsersPolicy | undefined) => {
    if (!group) return;
    setSaving(true);
    const result = await deleteGroup(group.id, policy);
    setSaving(false);
    if (!result.success) return fail(t("deleteFailed"), result.errorBody);
    toast.success(t("deleted"), {
      description: t("deletedBody", { name: group.name }),
    });
    setAsking(null);
    router.push(`/${locale}/izin-gruplari`);
    router.refresh();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (nameProblem !== null) return;
    if (codes.length === 0) return;
    if (
      group &&
      needsUsersQuestion(userCount, {
        before: group.permissions,
        after: codes,
      })
    ) {
      setAsking("save");
      return;
    }
    void save(undefined);
  };

  const scopeOptions = SCOPES.map((value) => ({
    value,
    label: t(`scope.${value}.label`),
    description: t(`scope.${value}.help`),
    // A course is picked from a köşk's course list, which no page offers for the whole platform yet.
    disabled: group ? value !== group.scope : value === "COURSE",
  }));

  const errorText = (kind: typeof nameProblem) =>
    kind === "nameRequired"
      ? t("errors.nameRequired")
      : kind === "nameTooLong"
        ? t("errors.nameTooLong", { max: GROUP_NAME_MAX })
        : kind === "nameTaken"
          ? t("errors.nameTaken")
          : undefined;

  return (
    <form
      className="mds-card flex flex-col gap-6 p-card"
      noValidate
      onSubmit={submit}
      data-testid="group-form"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="mds-h2">{group ? group.name : t("newTitle")}</h2>
        <Badge variant="secondary" icon={<Icon name="key" size="sm" />}>
          {t(`scope.${scope}.chip`)}
        </Badge>
      </header>
      <p className="mds-caption">{t("requiredNote")}</p>

      <Field
        label={t("nameLabel")}
        required
        help={t("nameHelp")}
        error={touched || name.length > 0 ? errorText(nameProblem) : undefined}
      >
        <Input
          name="name"
          value={name}
          required
          maxLength={GROUP_NAME_MAX + 20}
          disabled={saving}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <RadioGroup
          legend={t("scopeLabel")}
          value={scope}
          onChange={(value) => {
            const next = value as PermissionGroupScope;
            setScope(next);
            setCodes((c) => keepAllowed(c, next, catalog));
          }}
          bordered
          disabled={saving}
          options={scopeOptions}
          className="md:grid md:grid-cols-3 md:[&>.mds-label]:col-span-3"
        />
        <p className="mds-caption">{t("scopeHelp")}</p>
        {group && group.scope === "COURSE" && group.courseTitle ? (
          <p className="mds-caption">
            {t("courseOf", { course: group.courseTitle })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="mds-h3">{t("permissionsHeading")}</h3>
        <PermissionBoxes
          sections={sections}
          checked={new Set(codes)}
          onToggle={(code, on) => setCodes((c) => toggleExtra(c, code, on))}
          disabled={saving}
        />
        {touched && codes.length === 0 ? (
          <p className="mds-error" role="alert">
            {t("errors.noPermission")}
          </p>
        ) : null}
      </div>

      {group ? (
        <section
          aria-labelledby="group-users-heading"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 id="group-users-heading" className="mds-h3">
              {t("usersHeading")}
            </h3>
            <span className="mds-caption" data-testid="users-count">
              {t("usersCount", { count: userCount })}
            </span>
          </div>
          {users === null ? (
            <Alert tone="error" title={t("usersFailedTitle")}>
              <p>{t("usersFailed")}</p>
            </Alert>
          ) : users.length === 0 ? (
            <p className="mds-caption">{t("usersNone")}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="group-users">
              {users.map((user) => {
                const nazim = nazims.find((n) => n.user.id === user.userId);
                const display = user.name ?? user.email ?? t("unknownPerson");
                return (
                  <li
                    key={user.userId}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <Avatar name={display} decorative />
                    <span className="flex min-w-0 grow flex-col">
                      <bdi className="font-semibold">{display}</bdi>
                      <span className="mds-caption">
                        {user.expiresAt
                          ? t("userLineEnds", {
                              date: formatDay(user.expiresAt, locale, timeZone),
                            })
                          : t("userLineNever")}
                      </span>
                    </span>
                    {nazim ? (
                      <Button
                        variant="ghost"
                        size="small"
                        aria-label={t("editUserLabel", { name: display })}
                        onClick={() => onEditUser(nazim)}
                      >
                        {t("editUser")}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <Alert tone="neutral">
            <p>{t("usersNote")}</p>
          </Alert>
        </section>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3">
        {group ? (
          <Button
            variant="ghost"
            disabled={saving}
            aria-label={t("deleteLabel", { name: group.name })}
            onClick={() => setAsking("delete")}
          >
            {t("delete")}
          </Button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <Button variant="ghost" disabled={saving} onClick={reset}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("save")}
          </Button>
        </span>
      </footer>

      {group ? (
        <UsersPolicyDialog
          open={asking !== null}
          onOpenChange={(open) => {
            if (!open) setAsking(null);
          }}
          mode={asking ?? "save"}
          groupName={group.name}
          userCount={userCount}
          busy={saving}
          onConfirm={(policy) =>
            asking === "delete" ? void remove(policy) : void save(policy)
          }
        />
      ) : null}
    </form>
  );
}
