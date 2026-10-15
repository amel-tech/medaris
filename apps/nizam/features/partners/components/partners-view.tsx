"use client";

import type {
  PartnerAdminListResponse,
  PartnerAdminResponse,
  PartnerKoskResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Switch } from "@medaris/ui/mds/switch";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { redirectIfUnauthenticated } from "~/lib/unauthenticated";
import { createPartner, setPartnerKosks, updatePartner } from "../actions";
import {
  CLIENT_ID_MAX,
  clientIdProblem,
  failureKey,
  NAME_MAX,
  nameProblem,
  sameKosks,
} from "../present";

type Partner = PartnerAdminResponse;

interface Props {
  /** null when the first read failed */
  initial: PartnerAdminListResponse | null;
}

const byName = (a: Partner, b: Partner) =>
  a.name.localeCompare(b.name, "tr") || a.clientId.localeCompare(b.clientId);

/**
 * "Ortak uygulamalar" (partner enrollments): the partner applications whose
 * registrations become course enrollments, for the başnazım (and a Medaris
 * nazımı given `platform.partner_manage`). Each row has its name, its client
 * id, the köşks it works with and whether it is enabled; a partner is added
 * with its client id and name, renamed, switched off and on, and given its
 * köşks in a multi-select. Every change is one call, in force at once and
 * written to the audit log by tedrisat; the switch moves the moment it is
 * pressed and moves back, with a toast, if the server refuses.
 */
export function PartnersView({ initial }: Props) {
  const router = useRouter();
  const t = useTranslations("nizam.PartnersPage");
  const [items, setItems] = useState<Partner[]>(initial?.items ?? []);
  // The rows whose switch is on its way to tedrisat; several may be at once.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<Partner | null>(null);
  const [choosing, setChoosing] = useState<Partner | null>(null);
  // `initial` is a fresh server read after router.refresh() ("Tekrar dene"):
  // the state seeded from the first render must follow it.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial?.items ?? []);
  }

  const put = (row: Partner) =>
    setItems((rows) =>
      [...rows.filter((p) => p.clientId !== row.clientId), row].sort(byName)
    );

  const marking = (clientId: string, on: boolean) =>
    setBusy((held) => {
      const next = new Set(held);
      if (on) next.add(clientId);
      else next.delete(clientId);
      return next;
    });

  const toggle = async (partner: Partner, enabled: boolean) => {
    put({ ...partner, enabled });
    marking(partner.clientId, true);
    const result = await updatePartner(partner.clientId, { enabled });
    marking(partner.clientId, false);
    if (redirectIfUnauthenticated(result)) return;
    if (!result.success) {
      // Only this row's switch goes back: another row switched meanwhile
      // keeps its own change.
      setItems((rows) =>
        rows.map((p) =>
          p.clientId === partner.clientId
            ? { ...p, enabled: partner.enabled }
            : p
        )
      );
      toast.error(t("saveFailed"), {
        description: t(failureKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    put(result.data);
    toast.success(t(enabled ? "turnedOn" : "turnedOff"), {
      description: t(enabled ? "turnedOnBody" : "turnedOffBody", {
        name: result.data.name,
      }),
    });
  };

  const columns: TableColumn<Partner>[] = [
    {
      key: "name",
      header: t("columns.name"),
      rowHeader: true,
      render: (p) => <bdi>{p.name}</bdi>,
    },
    {
      key: "clientId",
      header: t("columns.clientId"),
      render: (p) => (
        <bdi dir="ltr" className="break-all font-mono">
          {p.clientId}
        </bdi>
      ),
    },
    {
      key: "kosks",
      header: t("columns.kosks"),
      render: (p) =>
        p.kosks.length === 0 ? (
          <span className="mds-caption">{t("noKosks")}</span>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {p.kosks.map((k) => (
              <li key={k.id}>
                <bdi>{k.name}</bdi>
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: "enabled",
      header: t("columns.enabled"),
      render: (p) => (
        <Switch
          label={
            <>
              {t(p.enabled ? "on" : "off")}
              <span className="mds-visually-hidden"> {p.name}</span>
            </>
          }
          checked={p.enabled}
          disabled={busy.has(p.clientId)}
          onCheckedChange={(next) => void toggle(p, next)}
        />
      ),
    },
    {
      key: "actions",
      header: t("columns.actions"),
      render: (p) => (
        <span className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="small"
            iconLeft={<Icon name="kosk" size="sm" />}
            onClick={() => setChoosing(p)}
          >
            {t("chooseKosks")}
            <span className="mds-visually-hidden"> {p.name}</span>
          </Button>
          <Button
            variant="ghost"
            size="small"
            iconLeft={<Icon name="edit" size="sm" />}
            onClick={() => setRenaming(p)}
          >
            {t("rename")}
            <span className="mds-visually-hidden"> {p.name}</span>
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="partners"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="max-w-[48rem]">{t("intro")}</p>
      </header>

      {initial === null ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button
            variant="outline"
            size="small"
            onClick={() => router.refresh()}
          >
            {t("retry")}
          </Button>
        </Alert>
      ) : (
        <>
          <AddPartnerForm onAdded={put} />
          <section
            className="flex flex-col gap-4"
            aria-labelledby="partners-list-title"
          >
            <h2 id="partners-list-title" className="mds-h2">
              {t("listHeading")}
            </h2>
            <Table
              caption={t("listHeading")}
              columns={columns}
              rows={items}
              rowKey={(p) => p.clientId}
              responsive="stack"
              empty={<EmptyState>{t("empty")}</EmptyState>}
            />
          </section>
          <RenameDialog
            key={`rename-${renaming?.clientId ?? ""}`}
            partner={renaming}
            onClose={() => setRenaming(null)}
            onDone={put}
          />
          <KosksDialog
            key={`kosks-${choosing?.clientId ?? ""}`}
            partner={choosing}
            options={initial.kosks}
            onClose={() => setChoosing(null)}
            onDone={put}
          />
        </>
      )}
    </div>
  );
}

/** "Ortak uygulama ekle": the client id and the name, checked before they are sent. */
function AddPartnerForm({ onAdded }: { onAdded: (row: Partner) => void }) {
  const t = useTranslations("nizam.PartnersPage");
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<{ clientId?: string; name?: string }>(
    {}
  );
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const id = clientId.trim();
    const idProblem = clientIdProblem(id);
    const naming = nameProblem(name);
    if (idProblem || naming) {
      setErrors({
        clientId: idProblem ? t(`errors.clientId.${idProblem}`) : undefined,
        name: naming ? t(`errors.name.${naming}`) : undefined,
      });
      return;
    }
    setPending(true);
    const result = await createPartner(id, name.trim());
    setPending(false);
    if (redirectIfUnauthenticated(result)) return;
    if (!result.success) {
      const key = failureKey(result.errorBody);
      if (key === "errors.exists" || key === "errors.frontEnd") {
        setErrors({ clientId: t(key as never) });
      } else {
        toast.error(t("saveFailed"), {
          description: t(key as never),
          duration: Number.POSITIVE_INFINITY,
        });
      }
      return;
    }
    setClientId("");
    setName("");
    setErrors({});
    onAdded(result.data);
    toast.success(t("added"), {
      description: t("addedBody", { name: result.data.name }),
    });
  };

  return (
    <section
      className="mds-card flex flex-col gap-4 p-card"
      aria-labelledby="partners-add-title"
      data-testid="partners-add"
    >
      <div className="flex flex-col gap-1">
        <h2 id="partners-add-title" className="mds-h3">
          {t("addHeading")}
        </h2>
        <p className="mds-body-sm">{t("addIntro")}</p>
      </div>
      <form
        className="grid items-start gap-4 md:grid-cols-2"
        onSubmit={submit}
        noValidate
      >
        <Field
          label={t("clientIdLabel")}
          help={t("clientIdHelp")}
          error={errors.clientId}
          required
        >
          <Input
            name="clientId"
            value={clientId}
            maxLength={CLIENT_ID_MAX}
            mono
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
            onChange={(event) => {
              setClientId(event.target.value);
              if (errors.clientId)
                setErrors({ ...errors, clientId: undefined });
            }}
          />
        </Field>
        <Field
          label={t("nameLabel")}
          help={t("nameHelp")}
          error={errors.name}
          required
        >
          <Input
            name="name"
            value={name}
            maxLength={NAME_MAX}
            autoComplete="off"
            disabled={pending}
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name) setErrors({ ...errors, name: undefined });
            }}
          />
        </Field>
        <div>
          <Button type="submit" loading={pending}>
            {t("add")}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** "Adını değiştir": the name the course settings and the audit log show. */
function RenameDialog({
  partner,
  onClose,
  onDone,
}: {
  partner: Partner | null;
  onClose: () => void;
  onDone: (row: Partner) => void;
}) {
  const t = useTranslations("nizam.PartnersPage");
  const [name, setName] = useState(partner?.name ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!partner || pending) return;
    const problem = nameProblem(name);
    if (problem) {
      setError(t(`errors.name.${problem}`));
      return;
    }
    setPending(true);
    const result = await updatePartner(partner.clientId, { name: name.trim() });
    setPending(false);
    if (redirectIfUnauthenticated(result)) return;
    if (!result.success) {
      setError(t(failureKey(result.errorBody) as never));
      return;
    }
    onDone(result.data);
    onClose();
    toast.success(t("renamed"), {
      description: t("renamedBody", { name: result.data.name }),
    });
  };

  return (
    <Dialog
      open={partner !== null}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
      form
      onSubmit={submit}
      eyebrow={partner ? <bdi>{partner.name}</bdi> : null}
      title={t("renameTitle")}
      closeLabel={t("close")}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={pending}>
            {t("save")}
          </Button>
        </>
      }
    >
      <Field label={t("nameLabel")} help={t("nameHelp")} error={error} required>
        <Input
          name="name"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="off"
          disabled={pending}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(undefined);
          }}
        />
      </Field>
    </Dialog>
  );
}

/**
 * "Köşkleri seç": every köşk as a box; the ticked ones are the partner's köşks
 * once saved. Unticking one stops the partner's codes there; what it already
 * enrolled stays.
 */
function KosksDialog({
  partner,
  options,
  onClose,
  onDone,
}: {
  partner: Partner | null;
  options: PartnerKoskResponse[];
  onClose: () => void;
  onDone: (row: Partner) => void;
}) {
  const t = useTranslations("nizam.PartnersPage");
  const held = partner?.kosks.map((k) => k.id) ?? [];
  const [chosen, setChosen] = useState<string[]>(held);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const flip = (id: string, on: boolean) =>
    setChosen((ids) =>
      on ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id)
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!partner || pending) return;
    if (sameKosks(held, chosen)) {
      onClose();
      return;
    }
    setPending(true);
    const result = await setPartnerKosks(partner.clientId, chosen);
    setPending(false);
    if (redirectIfUnauthenticated(result)) return;
    if (!result.success) {
      setError(t(failureKey(result.errorBody) as never));
      return;
    }
    onDone(result.data);
    onClose();
    toast.success(t("kosksSaved"), {
      description: t("kosksSavedBody", {
        name: result.data.name,
        count: result.data.kosks.length,
      }),
    });
  };

  return (
    <Dialog
      open={partner !== null}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={partner ? <bdi>{partner.name}</bdi> : null}
      title={t("kosksTitle")}
      closeLabel={t("close")}
      footerMeta={t("kosksCount", { count: chosen.length })}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={pending}>
            {t("save")}
          </Button>
        </>
      }
    >
      <p className="mds-body-sm">{t("kosksIntro")}</p>
      {error ? (
        <Alert tone="error" title={t("saveFailed")}>
          {error}
        </Alert>
      ) : null}
      {options.length === 0 ? (
        <EmptyState>{t("noKoskOptions")}</EmptyState>
      ) : (
        <fieldset
          className="m-0 flex flex-col gap-2 border-0 p-0"
          data-testid="partner-kosks"
        >
          <legend className="mds-visually-hidden">{t("kosksTitle")}</legend>
          {options.map((kosk) => (
            <Checkbox
              key={kosk.id}
              label={<bdi>{kosk.name}</bdi>}
              checked={chosen.includes(kosk.id)}
              disabled={pending}
              onCheckedChange={(on) => flip(kosk.id, on === true)}
            />
          ))}
        </fieldset>
      )}
    </Dialog>
  );
}
