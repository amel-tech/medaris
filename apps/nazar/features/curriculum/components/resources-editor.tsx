"use client";

import type { CourseResourceFileUploadResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
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
  emptyResource,
  type ResourceDraft,
} from "../curriculum";
import { RemoveFileDialog } from "./remove-file-dialog";

/**
 * "Bağlı kaynaklar" on the curriculum (MDRS-279, design nizam "Müderris ve
 * kaynaklar"): the course's resources, each a name, an optional short line
 * and either the address it opens or, since MDRS-287, a file in Medaris
 * storage. Part of the curriculum form: nothing is written until its
 * "Kaydet", and "Vazgeç" puts the saved rows back. The limits are
 * tedrisat's: name 200, line 120, address 500. nizam's curriculum has the
 * same section (`apps/nizam/features/courses/components`). Changing the rows
 * is `course.edit`, like the course's other details.
 *
 * "Dosya yükle" is the exception to "nothing is written until Kaydet": the
 * upload stores its row at once, and the editor adds it to the list as
 * stored (`upload`). A file row is renamed and removed like a link but shows
 * its file (a download link, its type and size) instead of an address, and
 * taking it off the list asks first: the save that follows deletes the file.
 */
export function ResourcesEditor({
  courseId,
  resources,
  onChange,
  shown,
  locked = false,
  disabled,
  editable,
  upload,
  locale,
}: {
  courseId: string;
  resources: ResourceDraft[];
  onChange: (next: ResourceDraft[]) => void;
  /** whether a problem of this row is to be shown (after a refused "Kaydet") */
  shown: (kind: CurriculumProblem, resourceIndex: number) => boolean;
  /**
   * the course was read content-locked: it carries no addresses, so the rows
   * are shown and kept as they are, never edited (MDRS-279)
   */
  locked?: boolean;
  /** the form is locked: saving, reading the course again, or read-only */
  disabled: boolean;
  /** `course.edit`: the rows can be added and removed */
  editable: boolean;
  /** "Dosya yükle" (MDRS-287); offered with `editable` */
  upload: UploadControl<CourseResourceFileUploadResponse>;
  locale: string;
}) {
  const t = useTranslations("nazar");
  const [removing, setRemoving] = useState<number | null>(null);
  const patch = (ri: number, change: Partial<ResourceDraft>) =>
    onChange(resources.map((r, i) => (i === ri ? { ...r, ...change } : r)));
  const remove = (ri: number) => onChange(resources.filter((_, i) => i !== ri));
  const asking = removing === null ? null : resources[removing];

  if (locked) {
    return (
      <section
        className="mds-card flex flex-col gap-4"
        aria-labelledby="c-resources"
        data-testid="resources"
      >
        <div className="flex flex-col gap-1">
          <h2 id="c-resources" className="mds-h2">
            {t("Curriculum.resourcesTitle")}
          </h2>
          <p className="mds-caption">{t("Curriculum.resourcesLocked")}</p>
        </div>
        {resources.length === 0 ? (
          <p className="mds-body-sm">{t("Curriculum.resourcesEmpty")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {resources.map((resource, ri) => (
              <li
                key={resource.id ?? ri}
                className="flex flex-col py-3 border-be border-neutral-subtle last:border-be-0"
                data-testid={`resource-${ri}`}
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
        )}
      </section>
    );
  }

  return (
    <section
      className="mds-card flex flex-col gap-4"
      aria-labelledby="c-resources"
      data-testid="resources"
    >
      <div className="flex flex-col gap-1">
        <h2 id="c-resources" className="mds-h2">
          {t("Curriculum.resourcesTitle")}
        </h2>
        <p className="mds-caption">{t("Curriculum.resourcesIntro")}</p>
      </div>
      {resources.length === 0 ? (
        <p className="mds-body-sm">{t("Curriculum.resourcesEmpty")}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {resources.map((resource, ri) => (
            <li
              key={resource.id ?? `new-${ri}`}
              className="flex flex-col gap-3 py-4 border-be border-neutral-subtle last:border-be-0"
              data-testid={`resource-${ri}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <h3 className="mds-label">
                    {t("Curriculum.resourceHeading", { n: ri + 1 })}
                  </h3>
                  {resource.file ? (
                    <Badge variant="secondary">{t("Files.fileBadge")}</Badge>
                  ) : null}
                </span>
                {editable ? (
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
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label={t("Curriculum.resourceNameLabel")}
                  required
                  error={
                    shown("resourceName", ri)
                      ? t("Curriculum.errors.resourceName")
                      : undefined
                  }
                >
                  <Input
                    name={`resource-${ri}-name`}
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
                    name={`resource-${ri}-meta`}
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
                    resource.id
                      ? fileRoutes.courseResource(courseId, resource.id)
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
                    shown("resourceUrl", ri)
                      ? t("Curriculum.errors.resourceUrl")
                      : undefined
                  }
                >
                  <Input
                    mono
                    type="url"
                    name={`resource-${ri}-url`}
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
      {editable ? (
        <div className="flex flex-wrap items-start gap-2">
          <Button
            variant="outline"
            size="small"
            type="button"
            disabled={disabled}
            iconLeft={<Icon name="plus" size="sm" />}
            onClick={() => onChange([...resources, emptyResource()])}
          >
            {t("Curriculum.addLink")}
          </Button>
          <FileUpload
            prefix="resource"
            control={upload}
            disabled={disabled}
            locale={locale}
          />
        </div>
      ) : null}
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
    </section>
  );
}
