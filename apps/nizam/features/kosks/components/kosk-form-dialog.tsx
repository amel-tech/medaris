"use client";

import { PlusIcon, XIcon } from "@medaris/icons";
import type { KoskResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@medaris/ui/components/dialog";
import { Input } from "@medaris/ui/components/input";
import { Label } from "@medaris/ui/components/label";
import { toast } from "@medaris/ui/components/sonner";
import { Switch } from "@medaris/ui/components/switch";
import { Textarea } from "@medaris/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type KeyboardEvent,
  type ReactElement,
  useState,
  useTransition,
} from "react";
import { createKosk, updateKosk } from "~/features/kosks/actions";
import { KoskCover } from "~/features/kosks/components/kosk-cover";
import {
  addTag,
  clampHue,
  KOSK_FORM_LIMITS,
  type KoskFormState,
  toKoskDto,
} from "~/features/kosks/kosk-form";

const initialState = (kosk?: KoskResponse): KoskFormState => ({
  name: kosk?.name ?? "",
  handle: kosk?.handle ?? "",
  description: kosk?.description ?? "",
  tags: kosk?.tags ?? [],
  coverHue: kosk?.coverHue ?? 215,
  // A new köşk is listed unless its manager unlists it (MDRS-122).
  isPrivate: kosk?.isPrivate ?? false,
});

/**
 * Create or edit a köşk (MDRS-108 adds tags and cover hue; its field and level
 * are not on the form, MDRS-252).
 * Who sees the edit trigger is decided by the caller — `koskAbilities(...).edit`
 * on the köşk page; "Yeni Köşk" is open to everyone signed in.
 */
export function KoskFormDialog({
  kosk,
  trigger,
}: {
  kosk?: KoskResponse;
  trigger?: ReactElement;
}) {
  const t = useTranslations("nizam");
  const router = useRouter();
  const isEdit = Boolean(kosk);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<KoskFormState>(() => initialState(kosk));
  const [tagDraft, setTagDraft] = useState("");

  const set = <K extends keyof KoskFormState>(
    key: K,
    value: KoskFormState[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const reset = () => {
    setForm(initialState(kosk));
    setTagDraft("");
  };

  /** The list with the typed tag added, or null after saying why it cannot be. */
  const withDraftTag = (): string[] | null => {
    const result = addTag(form.tags, tagDraft);
    if (result.ok) return result.tags;
    toast.error(
      t(`KoskForm.${result.error}`, {
        max: KOSK_FORM_LIMITS.tagsMax,
        length: KOSK_FORM_LIMITS.tagMax,
      })
    );
    return null;
  };

  const commitTag = () => {
    const tags = withDraftTag();
    if (!tags) return;
    set("tags", tags);
    setTagDraft("");
  };

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTag();
    } else if (e.key === "Backspace" && !tagDraft && form.tags.length > 0) {
      set("tags", form.tags.slice(0, -1));
    }
  };

  const submit = () => {
    if (form.name.trim().length < KOSK_FORM_LIMITS.nameMin) {
      toast.error(t("KoskForm.nameTooShort"));
      return;
    }
    // A tag still in the box when Save is pressed is kept, not dropped.
    const tags = withDraftTag();
    if (!tags) return;
    const state = { ...form, tags };
    startTransition(async () => {
      const res = kosk
        ? await updateKosk(kosk.id, toKoskDto(state, "edit"))
        : await createKosk(toKoskDto(state, "create"));
      if (res.success === false) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? t("KoskForm.updated") : t("KoskForm.created"));
      setOpen(false);
      // `setOpen` does not go through `onOpenChange`, so "Yeni Köşk" would
      // otherwise reopen with the köşk just created still filled in.
      if (!isEdit) reset();
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="lg" className="gap-2">
            <PlusIcon className="w-5 h-5" />
            {t("KosksPage.newKosk")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("KoskForm.editTitle") : t("KoskForm.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div>
            <Label htmlFor="kosk-name" className="mb-1.5">
              {t("KoskForm.name")}
              <span className="text-destructive"> *</span>
            </Label>
            <Input
              id="kosk-name"
              value={form.name}
              maxLength={KOSK_FORM_LIMITS.nameMax}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t("KoskForm.namePlaceholder")}
            />
          </div>

          <div>
            <Label htmlFor="kosk-handle" className="mb-1.5">
              {t("KoskForm.handle")}
            </Label>
            <Input
              id="kosk-handle"
              value={form.handle}
              maxLength={KOSK_FORM_LIMITS.handleMax}
              onChange={(e) => set("handle", e.target.value)}
              placeholder={t("KoskForm.handlePlaceholder")}
            />
          </div>

          <div>
            <Label htmlFor="kosk-description" className="mb-1.5">
              {t("KoskForm.description")}
            </Label>
            <Textarea
              id="kosk-description"
              rows={3}
              value={form.description}
              maxLength={KOSK_FORM_LIMITS.descriptionMax}
              onChange={(e) => set("description", e.target.value)}
              placeholder={t("KoskForm.descriptionPlaceholder")}
            />
          </div>

          <div>
            <Label htmlFor="kosk-tags" className="mb-1.5">
              {t("KoskForm.tags")}
            </Label>
            {form.tags.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <li
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t("KoskForm.removeTag", { tag })}
                      onClick={() =>
                        set(
                          "tags",
                          form.tags.filter((other) => other !== tag)
                        )
                      }
                    >
                      <XIcon className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Input
              id="kosk-tags"
              value={tagDraft}
              maxLength={KOSK_FORM_LIMITS.tagMax}
              disabled={form.tags.length >= KOSK_FORM_LIMITS.tagsMax}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={onTagKey}
              onBlur={() => {
                // Quietly: a refusal is reported on Enter or on Save, so
                // leaving the box towards Save does not report it twice.
                const result = addTag(form.tags, tagDraft);
                if (result.ok) {
                  set("tags", result.tags);
                  setTagDraft("");
                }
              }}
              placeholder={t("KoskForm.tagsPlaceholder")}
              aria-describedby="kosk-tags-help"
            />
            <p
              id="kosk-tags-help"
              className="mt-1 text-xs text-muted-foreground"
            >
              {t("KoskForm.tagsHelp", {
                max: KOSK_FORM_LIMITS.tagsMax,
                length: KOSK_FORM_LIMITS.tagMax,
              })}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="kosk-hue">{t("KoskForm.coverHue")}</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("KoskForm.coverHueValue", { hue: form.coverHue })}
              </span>
            </div>
            <KoskCover hue={form.coverHue} className="mb-2 h-10 rounded-md" />
            <input
              id="kosk-hue"
              type="range"
              min={0}
              max={KOSK_FORM_LIMITS.hueMax}
              step={1}
              value={form.coverHue}
              onChange={(e) =>
                set("coverHue", clampHue(Number(e.target.value)))
              }
              className="w-full accent-primary"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">{t("KoskForm.private")}</div>
              <div className="text-xs text-muted-foreground">
                {t("KoskForm.privateHint")}
              </div>
            </div>
            <Switch
              checked={form.isPrivate}
              onCheckedChange={(v) => set("isPrivate", v)}
              aria-label={t("KoskForm.private")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            {t("KoskForm.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending
              ? isEdit
                ? t("KoskForm.saving")
                : t("KoskForm.creating")
              : isEdit
                ? t("KoskForm.save")
                : t("KoskForm.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
