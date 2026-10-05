"use client";

import type { UsersPolicy } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Messages } from "~/lib/i18n/messages";
import { createGroup, loadCatalog, removeGroup, updateGroup } from "../actions";
import { nazirErrorKey, permissionLabel } from "../nazirs";
import {
  type Catalog,
  draftOfGroup,
  emptyGroup,
  GROUP_NAME_MAX,
  type GroupDraft,
  type GroupOutcome,
  type GroupPatch,
  type GroupScope,
  type GroupView,
  groupBody,
  groupPatch,
  groupProblems,
  groupValid,
  needsUsersAnswer,
  scopeAllows,
  toggleCode,
  withScope,
} from "../permissions";
import { PermissionSection } from "./permission-section";

/** What the dialog is open for: a new group, or an existing one; null while it is shut. */
export type GroupTarget =
  | { mode: "create" }
  | { mode: "edit"; group: GroupView };

/** The question about the people who hold the group, and what it is asked for. */
type Ask =
  | { kind: "edit"; patch: GroupPatch; count: number }
  | { kind: "delete"; count: number };

const SCOPES: readonly GroupScope[] = ["MADRASAH", "COURSE"];

/**
 * "İzin grubu tanımla / düzenle" (nazir 16): a Dialog with a Form. The name and
 * the scope are there at once; the dictionary is read as the dialog opens and
 * the permissions are bars until it is. "Ders" lets only course permissions in
 * (the medrese's are off, and unticked when the scope changes to it), "Medrese"
 * lets all of them in; a permission the caller may not give is off.
 *
 * Changing the permissions of a group people hold, or deleting it, is asked
 * about first (_kurallar 16): an AlertDialog "Bu grubu {n} kişi kullanıyor"
 * with no answer chosen, and its button off until one is. The count comes from
 * the list the dialog was opened from and, if it moved meanwhile, from the
 * API's refusal. A rename never asks. The scrim does not close the dialog.
 */
export function GroupDialog({
  madrasahId,
  madrasahName,
  target,
  onClose,
  onDone,
}: {
  madrasahId: string;
  madrasahName: string;
  target: GroupTarget | null;
  onClose: () => void;
  /** called once the group is saved or deleted, for the page to read the groups again */
  onDone: () => void;
}) {
  const t = useTranslations("nazir");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [catalog, setCatalog] = useState<Catalog | "failed" | null>(null);
  const [draft, setDraft] = useState<GroupDraft>(emptyGroup);
  const [attempted, setAttempted] = useState(false);
  const [taken, setTaken] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [policy, setPolicy] = useState<UsersPolicy | null>(null);
  const nameRef = useRef<HTMLElement | null>(null);
  const asked = useRef(0);

  const group = target?.mode === "edit" ? target.group : null;
  const open = target !== null;

  const load = useCallback(async () => {
    const ask = ++asked.current;
    setCatalog(null);
    const result = await loadCatalog(madrasahId);
    if (ask === asked.current)
      setCatalog(result.success ? result.data : "failed");
  }, [madrasahId]);

  useEffect(() => {
    setAttempted(false);
    setTaken(false);
    setAsk(null);
    setPolicy(null);
    setDraft(group ? draftOfGroup(group) : emptyGroup());
    if (open) void load();
    else setCatalog(null);
  }, [open, group, load]);

  const known =
    typeof catalog === "object" && catalog !== null ? catalog : null;
  const givable = new Set(known?.givable ?? []);
  const problems = groupProblems(draft);
  const nameError =
    attempted && problems.name
      ? t(`Groups.nameProblems.${problems.name}`, { max: GROUP_NAME_MAX })
      : taken
        ? t("Problems.groupNameTaken")
        : undefined;

  const done = (title: string, body: string) => {
    notify({ tone: "success", title, description: body });
    setAsk(null);
    onClose();
    onDone();
  };

  /** A refusal that is not the question: said in a toast, with the list read again where it moved. */
  const refused = (
    outcome: Extract<GroupOutcome, { success: false }>,
    title: string
  ) => {
    if (outcome.code === "PERMISSION_GROUP_NAME_TAKEN") {
      setAsk(null);
      setTaken(true);
      return;
    }
    notify({
      tone: "error",
      title,
      description: words(nazirErrorKey(outcome.code)),
    });
    if (outcome.code === "PERMISSION_GROUP_NOT_FOUND") {
      setAsk(null);
      onClose();
      onDone();
    }
  };

  const save = (patch: GroupPatch, usersPolicy?: UsersPolicy) => {
    if (!group) return;
    startTransition(async () => {
      const result = await updateGroup(
        madrasahId,
        group.id,
        patch,
        usersPolicy
      );
      if (result.success) {
        done(
          t("Groups.saved"),
          t("Groups.savedBody", { name: patch.name ?? group.name })
        );
      } else if (result.code === "USERS_POLICY_REQUIRED") {
        setPolicy(null);
        setAsk({
          kind: "edit",
          patch,
          count: result.userCount ?? group.userCount,
        });
      } else {
        refused(result, t("Groups.failedTitle"));
      }
    });
  };

  const remove = (usersPolicy?: UsersPolicy) => {
    if (!group) return;
    startTransition(async () => {
      const result = await removeGroup(madrasahId, group.id, usersPolicy);
      if (result.success) {
        done(
          t("Groups.deleted"),
          t("Groups.deletedBody", { name: group.name })
        );
      } else if (result.code === "USERS_POLICY_REQUIRED") {
        setPolicy(null);
        setAsk({ kind: "delete", count: result.userCount ?? group.userCount });
      } else {
        refused(result, t("Groups.deleteFailedTitle"));
      }
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!known || pending) return;
    setAttempted(true);
    setTaken(false);
    if (!groupValid(draft)) return;
    if (!group) {
      startTransition(async () => {
        const result = await createGroup(madrasahId, groupBody(draft, known));
        if (result.success) {
          done(
            t("Groups.saved"),
            t("Groups.savedBody", { name: draft.name.trim() })
          );
        } else {
          refused(result, t("Groups.failedTitle"));
        }
      });
      return;
    }
    const patch = groupPatch(group, draft, known);
    if (!patch) {
      onClose();
      return;
    }
    if (needsUsersAnswer(group, patch)) {
      setPolicy(null);
      setAsk({ kind: "edit", patch, count: group.userCount });
      return;
    }
    save(patch);
  };

  const confirm = () => {
    if (!ask) return;
    const answer = ask.count > 0 ? (policy ?? undefined) : undefined;
    if (ask.count > 0 && !answer) return;
    if (ask.kind === "edit") save(ask.patch, answer);
    else remove(answer);
  };

  const label = (code: string) => permissionLabel(code, words);
  const used = group?.userCount ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={madrasahName}
      title={group ? t("Groups.editTitle") : t("Groups.createTitle")}
      closeLabel={t("Shell.close")}
      initialFocus={nameRef}
      headerActions={
        group ? (
          <Button
            variant="ghost"
            size="small"
            iconLeft={<Icon name="trash" size="sm" />}
            disabled={pending}
            onClick={() => {
              setPolicy(null);
              setAsk({ kind: "delete", count: group.userCount });
            }}
          >
            {t("Groups.delete")}
          </Button>
        ) : undefined
      }
      footerMeta={t(`Groups.meta.${draft.scope}`, {
        count: draft.permissions.length,
      })}
      footer={
        <>
          <DialogClose>{t("Groups.cancel")}</DialogClose>
          <Button type="submit" loading={pending} disabled={!known}>
            {t("Groups.save")}
          </Button>
        </>
      }
    >
      <p className="mds-caption">* {t("Groups.required")}</p>
      <Field
        label={t("Groups.name")}
        required
        help={t("Groups.nameHelp")}
        error={nameError}
      >
        <Input
          {...({ ref: nameRef } as object)}
          name="name"
          autoComplete="off"
          value={draft.name}
          onChange={(event) => {
            setTaken(false);
            setDraft({ ...draft, name: event.target.value });
          }}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <RadioGroup
          legend={t("Groups.scope")}
          name="scope"
          bordered
          value={draft.scope}
          onChange={(value) =>
            setDraft(
              known
                ? withScope(draft, value as GroupScope, known)
                : { ...draft, scope: value as GroupScope }
            )
          }
          options={SCOPES.map((scope) => ({
            value: scope,
            label: t(`Groups.scopes.${scope}.label`),
            description: t(`Groups.scopes.${scope}.help`),
          }))}
        />
        <p className="mds-help">{t("Groups.scopeHelp")}</p>
      </div>

      <div className="flex flex-col gap-section">
        <div className="flex flex-col gap-1">
          <p className="mds-label">
            {t("Groups.permissions")}
            <span className="mds-required" aria-hidden="true">
              *
            </span>
          </p>
          {attempted && problems.permissions ? (
            <p className="mds-error" role="alert">
              {t("Groups.permissionsProblem")}
            </p>
          ) : (
            <p className="mds-help">
              {t("Groups.permissionsHelp", { count: draft.permissions.length })}
            </p>
          )}
        </div>
        {catalog === null ? (
          <output className="flex flex-col gap-3" aria-busy="true">
            <span className="mds-visually-hidden">
              {t("Shell.loadingLabel")}
            </span>
            <Skeleton height="8rem" />
            <Skeleton height="8rem" />
          </output>
        ) : known === null ? (
          <Alert tone="error" title={t("Groups.catalogFailedTitle")}>
            <p>{t("Groups.catalogFailed")}</p>
            <Button variant="outline" size="small" onClick={() => void load()}>
              {t("Shell.retry")}
            </Button>
          </Alert>
        ) : (
          <>
            {(
              [
                ["madrasah", known.madrasah, "Editor.madrasahSection"],
                ["course", known.course, "Editor.courseSection"],
              ] as const
            ).map(([section, codes, title], index) => (
              <div key={section} className="contents">
                {index > 0 ? <hr className="mds-separator" /> : null}
                <PermissionSection
                  title={t(title)}
                  codes={codes}
                  labelOf={label}
                  ticked={(code) => draft.permissions.includes(code)}
                  disabled={(code) =>
                    !givable.has(code) || !scopeAllows(draft.scope, known, code)
                  }
                  onToggle={(code, on) => setDraft(toggleCode(draft, code, on))}
                />
              </div>
            ))}
            <p className="mds-caption">
              {used > 0
                ? t("Groups.usedNote", { count: used })
                : t("Groups.unusedNote")}
            </p>
          </>
        )}
      </div>

      <AlertDialog
        open={ask !== null}
        onOpenChange={(next) => {
          if (!next && !pending) setAsk(null);
        }}
        eyebrow={group?.name}
        title={
          ask && ask.count > 0
            ? t("Groups.users.title", { count: ask.count })
            : t("Groups.deleteTitle")
        }
        confirmLabel={
          ask?.kind === "edit"
            ? t("Groups.users.confirmEdit")
            : t("Groups.users.confirmDelete")
        }
        cancelLabel={t("Groups.users.cancel")}
        closeLabel={t("Shell.close")}
        confirmDisabled={Boolean(ask && ask.count > 0 && !policy)}
        confirmLoading={pending}
        onConfirm={confirm}
      >
        {ask && ask.count > 0 ? (
          <>
            <p>
              {t(
                ask.kind === "edit"
                  ? "Groups.users.editIntro"
                  : "Groups.users.deleteIntro",
                { name: group?.name ?? "" }
              )}
            </p>
            <RadioGroup
              legend={t("Groups.users.legend")}
              name="usersPolicy"
              bordered
              value={policy}
              onChange={(value) => setPolicy(value as UsersPolicy)}
              options={[
                {
                  value: "keep",
                  label: t("Groups.users.keep"),
                  description: t("Groups.users.keepHelp"),
                },
                {
                  value: "revoke",
                  label: t("Groups.users.revoke"),
                  description: t("Groups.users.revokeHelp"),
                },
              ]}
            />
          </>
        ) : (
          <p>{t("Groups.deleteBody", { name: group?.name ?? "" })}</p>
        )}
      </AlertDialog>
    </Dialog>
  );
}
