"use client";

import type { ResourceResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  type CurriculumProblem,
  emptyResource,
  type ResourceDraft,
} from "../present";
import {
  courseResourceFilePath,
  courseResourceUploadPath,
} from "../resource-files";
import {
  RemoveFileDialog,
  ResourceFileLine,
  ResourceUploadDialog,
} from "./resource-file-parts";

/**
 * "Bağlı kaynaklar" on the curriculum (MDRS-279, design nizam "Müderris ve
 * kaynaklar"): the course's resources, each a name, an optional short line
 * and either the address it opens or, since MDRS-287, a file uploaded to
 * Medaris storage. Part of the curriculum form: nothing is written until its
 * "Kaydet", and "Vazgeç" puts the saved rows back. An upload is the
 * exception: tedrisat stores the file and its row at once ("Dosya yükle"),
 * and the form keeps the row as saved. A file row is renamed and removed
 * like a link; its file is replaced by removing it and uploading another.
 * The limits are tedrisat's: name 200, line 120, address 500.
 */
export function ResourcesEditor({
  courseId,
  courseTitle,
  resources,
  onChange,
  onUploaded,
  shown,
  locked = false,
}: {
  courseId: string;
  /** names the course in the upload dialog */
  courseTitle: string;
  resources: ResourceDraft[];
  onChange: (next: ResourceDraft[]) => void;
  /** a file tedrisat stored as the last resource, and the course's new version */
  onUploaded: (answer: {
    resource: ResourceResponse;
    courseVersion: number;
  }) => void;
  /** whether a problem of this row is to be shown (after a refused "Kaydet") */
  shown: (kind: CurriculumProblem, resourceIndex: number) => boolean;
  /**
   * the course was read content-locked: it carries no addresses, so the rows
   * are shown and kept as they are, never edited (MDRS-279)
   */
  locked?: boolean;
}) {
  const t = useTranslations("nizam.Curriculum");
  // The file row waiting for "Çıkar" in the confirmation (MDRS-287).
  const [removing, setRemoving] = useState<number | null>(null);
  const patch = (ri: number, change: Partial<ResourceDraft>) =>
    onChange(resources.map((r, i) => (i === ri ? { ...r, ...change } : r)));
  const remove = (ri: number) => onChange(resources.filter((_, i) => i !== ri));

  if (locked) {
    return (
      <section
        className="mds-card flex flex-col gap-4"
        aria-labelledby="c-resources"
        data-testid="resources"
      >
        <div className="flex flex-col gap-1">
          <h2 id="c-resources" className="mds-h2">
            {t("resourcesTitle")}
          </h2>
          <p className="mds-caption">{t("resourcesLocked")}</p>
        </div>
        {resources.length === 0 ? (
          <p className="mds-body-sm">{t("resourcesEmpty")}</p>
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

  const removingRow = removing === null ? undefined : resources[removing];

  return (
    <section
      className="mds-card flex flex-col gap-4"
      aria-labelledby="c-resources"
      data-testid="resources"
    >
      <div className="flex flex-col gap-1">
        <h2 id="c-resources" className="mds-h2">
          {t("resourcesTitle")}
        </h2>
        <p className="mds-caption">{t("resourcesIntro")}</p>
      </div>
      {resources.length === 0 ? (
        <p className="mds-body-sm">{t("resourcesEmpty")}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {resources.map((resource, ri) => (
            <li
              key={resource.id ?? `new-${ri}`}
              className="flex flex-col gap-3 py-4 border-be border-neutral-subtle last:border-be-0"
              data-testid={`resource-${ri}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="mds-label">
                  {t("resourceHeading", { n: ri + 1 })}
                </h3>
                <Button
                  variant="ghost"
                  size="small"
                  type="button"
                  iconLeft={<Icon name="trash" size="sm" />}
                  onClick={() => (resource.file ? setRemoving(ri) : remove(ri))}
                >
                  {t("removeResource")}
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label={t("resourceNameLabel")}
                  required
                  error={
                    shown("resourceName", ri)
                      ? t("errors.resourceName")
                      : undefined
                  }
                >
                  <Input
                    name={`resource-${ri}-name`}
                    value={resource.name}
                    maxLength={200}
                    dir="auto"
                    onChange={(e) => patch(ri, { name: e.target.value })}
                  />
                </Field>
                <Field
                  label={t("resourceMetaLabel")}
                  help={t("resourceMetaHelp")}
                >
                  <Input
                    name={`resource-${ri}-meta`}
                    value={resource.meta}
                    maxLength={120}
                    dir="auto"
                    onChange={(e) => patch(ri, { meta: e.target.value })}
                  />
                </Field>
              </div>
              {resource.file && resource.id ? (
                <ResourceFileLine
                  file={resource.file}
                  href={courseResourceFilePath(courseId, resource.id)}
                />
              ) : (
                <Field
                  label={t("resourceUrlLabel")}
                  required
                  help={t("resourceUrlHelp")}
                  error={
                    shown("resourceUrl", ri)
                      ? t("errors.resourceUrl")
                      : undefined
                  }
                >
                  <Input
                    mono
                    type="url"
                    name={`resource-${ri}-url`}
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
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="small"
          type="button"
          iconLeft={<Icon name="plus" size="sm" />}
          onClick={() => onChange([...resources, emptyResource()])}
        >
          {t("addResource")}
        </Button>
        <ResourceUploadDialog<ResourceResponse>
          path={courseResourceUploadPath(courseId)}
          eyebrow={courseTitle}
          onUploaded={onUploaded}
          testId="upload-course-file"
        />
      </div>
      <RemoveFileDialog
        name={removingRow?.name ?? ""}
        open={removingRow !== undefined}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing !== null) remove(removing);
          setRemoving(null);
        }}
      />
    </section>
  );
}
