"use client";

import { MagnifyingGlassIcon, PlusIcon, XIcon } from "@medaris/icons";
import type { UserSummaryResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/components/badge";
import { Button } from "@medaris/ui/components/button";
import { Input } from "@medaris/ui/components/input";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { findUserByEmail } from "~/features/kosks/actions/courses";
import {
  courseTeamErrorKey,
  userDisplayName,
} from "~/features/kosks/course-team";

/**
 * One müderris row of the course editor. `userId` is the account the row
 * links (MDRS-105) — the link is what makes that person MUDERRIS on the
 * course. A row without one was typed in by name before accounts could be
 * picked; it is still shown and saved, and grants nobody anything.
 */
export type MuderrisDraft = {
  id?: string;
  userId?: string | null;
  name: string;
  title: string;
  /** Only known for a row picked in this session; nothing stores it. */
  email?: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The müderris list, chosen from accounts (MDRS-105). New rows come only
 * from the e-mail lookup (`GET /users?email=`, MDRS-104), so every new
 * müderris is a real account. With `canAssign` false — a müderris editing
 * the course — the list is shown read-only, because tedrisat refuses a save
 * that changes it from anyone but the köşk manager.
 */
export const MuderrisPicker = ({
  value,
  onChange,
  canAssign,
}: {
  value: MuderrisDraft[];
  onChange: (next: MuderrisDraft[]) => void;
  canAssign: boolean;
}) => {
  const t = useTranslations("nizam");
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<UserSummaryResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  const listed = (userId: string) =>
    value.some((m) => m.userId?.toLowerCase() === userId.toLowerCase());

  const search = () => {
    const address = email.trim();
    setFound(null);
    if (!EMAIL.test(address)) {
      setMessage(t("CourseTeam.invalidEmail"));
      return;
    }
    setMessage(null);
    startSearch(async () => {
      const res = await findUserByEmail(address);
      if (res.success === false) {
        const key = courseTeamErrorKey(res.errorBody);
        setMessage(key ? t(key) : res.error);
        return;
      }
      const [user] = res.data;
      if (!user) {
        setMessage(t("CourseTeam.notFound"));
        return;
      }
      if (listed(user.id)) {
        setMessage(t("CourseTeam.alreadyListed"));
        return;
      }
      setFound(user);
    });
  };

  const add = (user: UserSummaryResponse) => {
    onChange([
      ...value,
      {
        userId: user.id,
        name: userDisplayName(user),
        title: "",
        email: user.email ?? null,
      },
    ]);
    setFound(null);
    setEmail("");
    setMessage(null);
  };

  return (
    <div className="flex flex-col gap-2">
      {value.map((m, i) => (
        <div
          key={m.id ?? m.userId ?? `row-${i}`}
          className="flex items-center gap-2 rounded-lg border px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            {m.userId || !canAssign ? (
              <div className="truncate text-sm font-medium">{m.name}</div>
            ) : (
              <Input
                aria-label={t("NewCoursePage.muderrisNamePlaceholder")}
                placeholder={t("NewCoursePage.muderrisNamePlaceholder")}
                value={m.name}
                onChange={(e) =>
                  onChange(
                    value.map((row, idx) =>
                      idx === i ? { ...row, name: e.target.value } : row
                    )
                  )
                }
              />
            )}
            {m.email && (
              <div className="truncate text-xs text-muted-foreground">
                {m.email}
              </div>
            )}
            {!m.userId && (
              <div className="text-xs text-muted-foreground">
                {t("CourseTeam.nameOnlyHint")}
              </div>
            )}
          </div>
          <Badge variant={m.userId ? "secondary" : "outline"}>
            {m.userId
              ? t("CourseTeam.linkedAccount")
              : t("CourseTeam.nameOnly")}
          </Badge>
          {canAssign && (
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="grid size-9 shrink-0 place-items-center rounded-lg border text-muted-foreground"
              aria-label={t("NewCoursePage.remove")}
            >
              <XIcon size={16} />
            </button>
          )}
        </div>
      ))}

      {canAssign ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-xs font-medium">
            {t("CourseTeam.searchLabel")}
          </label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              type="email"
              inputMode="email"
              autoComplete="off"
              aria-describedby={helpId}
              aria-invalid={message ? true : undefined}
              placeholder={t("CourseTeam.searchPlaceholder")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFound(null);
                setMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={search}
              disabled={searching || !email.trim()}
              className="gap-1.5"
            >
              <MagnifyingGlassIcon size={14} />
              {searching ? t("CourseTeam.searching") : t("CourseTeam.search")}
            </Button>
          </div>
          <p
            id={helpId}
            role={message ? "alert" : undefined}
            className={
              message
                ? "text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {message ?? t("CourseTeam.searchHelp")}
          </p>
          {found && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {userDisplayName(found)}
                </div>
                {found.email && (
                  <div className="truncate text-xs text-muted-foreground">
                    {found.email}
                  </div>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => add(found)}
                className="gap-1.5"
              >
                <PlusIcon size={14} />
                {t("CourseTeam.add")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("CourseTeam.managerOnly")}
        </p>
      )}
    </div>
  );
};
