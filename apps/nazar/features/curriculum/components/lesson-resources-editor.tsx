"use client";

import type { LessonResourceFileUploadResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Input } from "@medaris/ui/mds/input";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FileLink } from "../../files/components/file-link";
import {
  FileUpload,
  type UploadControl,
} from "../../files/components/file-upload";
import { fileRoutes } from "../../files/files";
import {
  type CurriculumProblem,
  emptyLessonResource,
  type LessonResourceDraft,
  moveRow,
} from "../curriculum";
import { RemoveFileDialog } from "./remove-file-dialog";

/**
 * "Celsenin kaynakları" on a session of the curriculum (MDRS-286): the
 * session's own links, each a name, an optional short line and the address it
 * opens, as the course's "Bağlı kaynaklar" (`resources-editor.tsx`), whose
 * fields, limits and copy it reuses. They can be added, renamed, reordered
 * and removed. Part of the curriculum form: nothing is written until its
 * "Kaydet", and "Vazgeç" puts the saved rows back. Changing them is session
 * work: `course.edit` and `session.manage`, as the API decides. nizam's
 * curriculum has the same list (`apps/nizam/features/courses/components`).
 *
 * Since MDRS-287 a row may be a file: "Dosya yükle" stores it at once (it is
 * session work too, `session.manage`), and the row is renamed, moved and
 * removed like a link, with its file shown instead of an address. Taking a
 * file off asks first, as the save that follows deletes it. A session added
 * on this page has no id yet, so it takes files once the curriculum is saved.
 */
export function LessonResourcesEditor({
  prefix,
  lessonId,
  resources,
  onChange,
  shown,
  locked,
  disabled,
  editable,
  sessionsNote,
  upload,
  locale,
}: {
  /** the session's field names, `lesson-<week>-<session>` */
  prefix: string;
  /** the stored session's id; none for one added on this page */
  lessonId: string | undefined;
  resources: LessonResourceDraft[];
  onChange: (next: LessonResourceDraft[]) => void;
  /** whether a problem of this row is to be shown (after a refused "Kaydet") */
  shown: (kind: CurriculumProblem, resourceIndex: number) => boolean;
  /**
   * the course was read content-locked: it carries no addresses, so the rows
   * are shown and kept as they are, never edited
   */
  locked: boolean;
  /** the fields are off: saving, reading the course again, or not the caller's */
  disabled: boolean;
  /** the rows can be added, moved and removed */
  editable: boolean;
  /** say that changing the rows needs `session.manage` */
  sessionsNote: boolean;
  /** "Dosya yükle" (MDRS-287), offered with `editable`; its route is null for a new session */
  upload: UploadControl<LessonResourceFileUploadResponse>;
  locale: string;
}) {
  const t = useTranslations("nazar");
  const [removing, setRemoving] = useState<number | null>(null);
  const patch = (ri: number, change: Partial<LessonResourceDraft>) =>
    onChange(resources.map((r, i) => (i === ri ? { ...r, ...change } : r)));
  const remove = (ri: number) => onChange(resources.filter((_, i) => i !== ri));
  const asking = removing === null ? null : resources[removing];
  const name = (ri: number, field: "name" | "meta" | "url") =>
    `${prefix}-resource-${ri}-${field}`;

  return (
    <div
      className="border-bs border-neutral-subtle pbs-3"
      data-testid={`resources-${prefix}`}
    >
      <fieldset className="flex min-inline-0 flex-col gap-3 border-0 p-0">
        <legend className="mds-label pbe-1">
          {t("Curriculum.lessonResourcesTitle")}
        </legend>
        <p className="mds-caption">
          {t(
            locked
              ? "Curriculum.lessonResourcesLocked"
              : sessionsNote
                ? "Curriculum.lessonResourcesSessions"
                : "Curriculum.lessonResourcesIntro"
          )}
        </p>
        {resources.length === 0 ? (
          <p className="mds-body-sm">{t("Curriculum.lessonResourcesEmpty")}</p>
        ) : locked ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {resources.map((resource, ri) => (
              <li
                key={resource.id ?? ri}
                className="flex flex-col py-2 border-be border-neutral-subtle last:border-be-0"
                data-testid={`resource-${prefix}-${ri}`}
              >
                <span className="mds-label" dir="auto">
                  {resource.name}
                </span>
                {resource.meta ? (
                  <span className="mds-caption" dir="auto">
                    {resource.meta}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {resources.map((resource, ri) => (
              <li
                key={resource.id ?? `new-${ri}`}
                className="flex flex-col gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
                data-testid={`resource-${prefix}-${ri}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="mds-caption">
                      {t("Curriculum.resourceHeading", { n: ri + 1 })}
                    </span>
                    {resource.file ? (
                      <Badge variant="secondary">{t("Files.fileBadge")}</Badge>
                    ) : null}
                  </span>
                  {editable ? (
                    <span className="flex items-center gap-1">
                      <IconButton
                        size="small"
                        icon={<Icon name="chevronUp" size="sm" />}
                        label={t("Curriculum.moveResourceUp")}
                        disabled={disabled || ri === 0}
                        onClick={() => onChange(moveRow(resources, ri, ri - 1))}
                      />
                      <IconButton
                        size="small"
                        icon={<Icon name="chevronDown" size="sm" />}
                        label={t("Curriculum.moveResourceDown")}
                        disabled={disabled || ri === resources.length - 1}
                        onClick={() => onChange(moveRow(resources, ri, ri + 1))}
                      />
                      <Button
                        variant="ghost"
                        size="small"
                        type="button"
                        disabled={disabled}
                        iconLeft={<Icon name="trash" size="sm" />}
                        onClick={() =>
                          resource.file ? setRemoving(ri) : remove(ri)
                        }
                      >
                        {t("Curriculum.removeResource")}
                      </Button>
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label={t("Curriculum.resourceNameLabel")}
                    required
                    error={
                      shown("lessonResourceName", ri)
                        ? t("Curriculum.errors.resourceName")
                        : undefined
                    }
                  >
                    <Input
                      name={name(ri, "name")}
                      disabled={disabled}
                      value={resource.name}
                      maxLength={200}
                      dir="auto"
                      onChange={(e) => patch(ri, { name: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={t("Curriculum.resourceMetaLabel")}
                    help={t("Curriculum.resourceMetaHelp")}
                  >
                    <Input
                      name={name(ri, "meta")}
                      disabled={disabled}
                      value={resource.meta}
                      maxLength={120}
                      dir="auto"
                      onChange={(e) => patch(ri, { meta: e.target.value })}
                    />
                  </Field>
                </div>
                {resource.file ? (
                  <FileLink
                    file={resource.file}
                    href={
                      lessonId && resource.id
                        ? fileRoutes.lessonResource(lessonId, resource.id)
                        : null
                    }
                    locale={locale}
                  />
                ) : (
                  <Field
                    label={t("Curriculum.resourceUrlLabel")}
                    required
                    help={t("Curriculum.resourceUrlHelp")}
                    error={
                      shown("lessonResourceUrl", ri)
                        ? t("Curriculum.errors.resourceUrl")
                        : undefined
                    }
                  >
                    <Input
                      mono
                      type="url"
                      name={name(ri, "url")}
                      disabled={disabled}
                      value={resource.url}
                      maxLength={500}
                      placeholder="https://…"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => patch(ri, { url: e.target.value })}
                    />
                  </Field>
                )}
              </li>
            ))}
          </ol>
        )}
        {editable && !locked ? (
          <div className="flex flex-wrap items-start gap-2">
            <Button
              variant="outline"
              size="small"
              type="button"
              disabled={disabled}
              iconLeft={<Icon name="plus" size="sm" />}
              onClick={() => onChange([...resources, emptyLessonResource()])}
            >
              {t("Curriculum.addLink")}
            </Button>
            <FileUpload
              prefix={`${prefix}-resource`}
              control={upload}
              disabled={disabled}
              locale={locale}
            />
          </div>
        ) : null}
      </fieldset>
      {asking ? (
        <RemoveFileDialog
          name={asking.name.trim() || (asking.file?.name ?? "")}
          onConfirm={() => {
            if (removing !== null) remove(removing);
            setRemoving(null);
          }}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </div>
  );
}
