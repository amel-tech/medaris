"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";
type Field = "ad" | "eposta" | "konu" | "mesaj";

const topics = [
  { value: "genel", label: "Genel bir soru" },
  { value: "hesap", label: "Hesap ve giriş" },
  { value: "ders", label: "Dersler ve kayıt" },
  { value: "kvkk", label: "Kişisel veriler (KVKK)" },
  { value: "ders-vermek", label: "Medaris’te ders vermek" },
  { value: "diger", label: "Diğer" },
] as const;

// A domain with a dot: the canvas draws "omerfaruk.demirkaya@example" as the
// invalid case, which the browser's own type="email" check accepts.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const errors: Record<Field, string> = {
  ad: "Adınızı ve soyadınızı yazın.",
  eposta: "Geçerli bir e-posta adresi yazın.",
  konu: "Bir konu seçin.",
  mesaj: "Mesajınızı yazın.",
};

/**
 * The İletişim form in every state the canvas draws (Iletisim.dc.html, its
 * "durum" property): filled, a missing field, sending, sent, and an error.
 * It posts to /api/iletisim, which answers 503 until a delivery target for
 * these messages is decided (MDRS-151); the visitor then sees the error state
 * and keeps what they wrote.
 */
export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [invalid, setInvalid] = useState<Field[]>([]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const el = event.currentTarget;
    const data = new FormData(el);
    const value = (f: Field) => String(data.get(f) ?? "").trim();
    const missing = (["ad", "eposta", "konu", "mesaj"] as const).filter((f) =>
      f === "eposta" ? !EMAIL.test(value(f)) : !value(f)
    );
    setInvalid(missing);
    if (missing.length) {
      (el.elements.namedItem(missing[0]) as HTMLElement | null)?.focus();
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/iletisim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ad: value("ad"),
          eposta: value("eposta"),
          konu: value("konu"),
          mesaj: value("mesaj"),
        }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  const isInvalid = (f: Field) => invalid.includes(f);
  const errorFor = (f: Field) =>
    isInvalid(f) ? (
      <span className="mds-error" id={`i-${f}-e`}>
        {errors[f]}
      </span>
    ) : null;

  if (status === "sent") {
    return (
      <div className="mds-card flex flex-col gap-4">
        {/* biome-ignore lint/a11y/useSemanticElements: the system's Alert and Button contracts announce status with role="status" on their own elements (Alert.prompt.md, Button.prompt.md); <output> would change their markup */}
        <div className="mds-alert mds-alert--success" role="status">
          <span className="mds-alert__icon" aria-hidden="true" />
          <div>
            <p className="mds-alert__title">Mesajınız gönderildi</p>
            Cevap, formda yazdığınız e-posta adresine gönderilir.
          </div>
        </div>
        <div className="flex min-inline-0 flex-wrap items-center gap-3">
          <Link
            className="mds-btn mds-btn--regular mds-btn--secondary"
            href="/"
          >
            Ana sayfaya dönün
          </Link>
          <Link className="mds-btn mds-btn--link" href="/sss">
            Sık sorulan sorular
          </Link>
        </div>
      </div>
    );
  }

  const sending = status === "sending";
  return (
    <form
      className="mds-card flex max-inline-measure flex-col gap-5"
      method="post"
      noValidate
      aria-labelledby="form-baslik"
      onSubmit={onSubmit}
    >
      <div className="mds-card__header">
        <h2 className="mds-card__title" id="form-baslik">
          Bize yazın
        </h2>
      </div>
      {status === "error" && (
        <div className="mds-alert mds-alert--error" role="alert">
          <span className="mds-alert__icon" aria-hidden="true" />
          <div>
            <p className="mds-alert__title">Mesajınız gönderilemedi</p>
            Sunucuya ulaşılamadı. Yazdıklarınız duruyor; bağlantınızı denetleyip
            yeniden gönderin.
          </div>
        </div>
      )}
      <p className="mds-caption">* zorunlu alan</p>
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))]">
        <div className="mds-field">
          <label className="mds-label" htmlFor="i-ad">
            Ad soyad
            <span className="mds-required" aria-hidden="true">
              *
            </span>
          </label>
          <input
            className="mds-input"
            id="i-ad"
            name="ad"
            autoComplete="name"
            dir="auto"
            required
            aria-required="true"
            aria-invalid={isInvalid("ad") || undefined}
            aria-describedby={isInvalid("ad") ? "i-ad-e" : undefined}
          />
          {errorFor("ad")}
        </div>
        <div className="mds-field">
          <label className="mds-label" htmlFor="i-eposta">
            E-posta
            <span className="mds-required" aria-hidden="true">
              *
            </span>
          </label>
          <input
            className="mds-input"
            id="i-eposta"
            name="eposta"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            placeholder="adiniz@example.com"
            required
            aria-required="true"
            aria-invalid={isInvalid("eposta") || undefined}
            aria-describedby={isInvalid("eposta") ? "i-eposta-e" : "i-eposta-h"}
          />
          {isInvalid("eposta") ? (
            errorFor("eposta")
          ) : (
            <span className="mds-help" id="i-eposta-h">
              Cevap bu adrese gönderilir.
            </span>
          )}
        </div>
      </div>
      <div className="mds-field">
        <label className="mds-label" htmlFor="i-konu">
          Konu
          <span className="mds-required" aria-hidden="true">
            *
          </span>
        </label>
        <span className="mds-select">
          <select
            className="mds-input"
            id="i-konu"
            name="konu"
            required
            aria-required="true"
            defaultValue=""
            aria-invalid={isInvalid("konu") || undefined}
            aria-describedby={isInvalid("konu") ? "i-konu-e" : undefined}
          >
            <option value="" disabled hidden>
              Seçin
            </option>
            {topics.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </span>
        {errorFor("konu")}
      </div>
      <div className="mds-field">
        <label className="mds-label" htmlFor="i-mesaj">
          Mesaj
          <span className="mds-required" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          className="mds-input mds-textarea"
          id="i-mesaj"
          name="mesaj"
          rows={6}
          dir="auto"
          required
          aria-required="true"
          aria-invalid={isInvalid("mesaj") || undefined}
          aria-describedby={isInvalid("mesaj") ? "i-mesaj-e" : undefined}
        />
        {errorFor("mesaj")}
      </div>
      <p className="mds-caption">
        Formla gönderilen ad, e-posta adresi, konu ve mesaj yalnız cevap vermek
        için işlenir. Ayrıntılar{" "}
        <Link href="/aydinlatma-metni">Aydınlatma Metni</Link>’ndedir.
      </p>
      <div className="flex flex-wrap justify-end gap-2 pbs-2">
        <button
          className="mds-btn mds-btn--regular mds-btn--primary"
          type="submit"
          aria-disabled={sending || undefined}
          aria-busy={sending || undefined}
        >
          {sending && <span className="mds-btn__spinner" aria-hidden="true" />}
          Gönder
        </button>
        {/* biome-ignore lint/a11y/useSemanticElements: the system's Alert and Button contracts announce status with role="status" on their own elements (Alert.prompt.md, Button.prompt.md); <output> would change their markup */}
        <span className="mds-visually-hidden" role="status">
          {sending ? "Mesajınız gönderiliyor" : ""}
        </span>
      </div>
    </form>
  );
}
