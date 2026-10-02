import { AppShell, Sidebar } from "@medaris/ui/mds/app-shell";
import { Logo } from "@medaris/ui/mds/logo";
import type { ReactNode } from "react";
import { getMessages } from "~/lib/i18n/messages";
import { labelNav, type MenuCounts, navFor } from "../nav";
import { type Person, panoHref, type Scope } from "../scope";
import { scopeOption } from "../scope-option";
import { PortalAppBar, PortalNav } from "./portal-menu";
import { ScopeMemory } from "./scope-memory";
import { ScopePicker } from "./scope-picker";
import { UserRow } from "./user-row";

export interface PortalFrameProps {
  person: Person;
  /** every role held, strongest first; none for a person with no portal */
  roles: string[];
  scopes: Scope[];
  /** the scope the menu is for; null before there is one (nazir 02) */
  current: Scope | null;
  counts?: MenuCounts;
  /** leave the scope behind for `/` to reopen: only the scoped pages do */
  remember?: boolean;
  children: ReactNode;
}

/**
 * The shell of every page of the portal (nazir 03, 21, 22): the sidebar with
 * the scope picker, the menu of the scope's kind and the signed-in person, and
 * below 768 the bar with the same menu in its sheet. Without a scope (nazir 02)
 * only the brand and the person are left.
 */
export async function PortalFrame({
  person,
  roles,
  scopes,
  current,
  counts = {},
  remember = false,
  children,
}: PortalFrameProps) {
  const t = await getMessages();
  const shell = (key: string) => t(`Shell.${key}`);

  const footer = (
    <UserRow
      person={person}
      roles={(roles.length > 0 ? roles : ["STUDENT"]).map((role) =>
        t(`Roles.${role}`)
      )}
      href={current ? "/hesap" : undefined}
      hint={shell("accountHint")}
    />
  );

  const words = {
    role: (role: string) => t(`Roles.${role}`),
    imam: shell("imam"),
  };
  const sections = current
    ? labelNav(
        navFor(current, { panoHref: panoHref(scopes, current), counts }),
        { nav: (key) => t(`Nav.${key}`), shell }
      )
    : [];
  const picker = current ? (
    <ScopePicker
      current={scopeOption(current, words)}
      options={scopes.map((scope) => scopeOption(scope, words))}
      labels={{
        change: t("Shell.scopeChange", { name: current.name }),
        menu: shell("scopeMenu"),
        medrese: shell("scopeMedrese"),
        courses: shell("scopeCourses"),
        note: shell("scopeNote"),
      }}
    />
  ) : undefined;
  const unread = counts.unread ?? 0;

  return (
    <AppShell
      density="compact"
      sidebar={
        <Sidebar
          brand={<Logo app="nazir" wordmark />}
          scope={picker}
          footer={footer}
          navLabel={shell("navLabel")}
        >
          {current ? <PortalNav sections={sections} /> : null}
        </Sidebar>
      }
      appBar={
        <PortalAppBar
          sections={sections}
          scope={picker}
          footer={footer}
          bellLabel={
            current
              ? unread > 0
                ? t("Shell.bellUnread", { count: unread })
                : shell("bell")
              : undefined
          }
          outside={[{ path: "/hesap", title: t("Account.pageTitle") }]}
          appName={shell("appName")}
          labels={{
            menu: shell("menu"),
            nav: shell("navLabel"),
            close: shell("close"),
          }}
        />
      }
    >
      {remember && current ? (
        <ScopeMemory kind={current.kind} id={current.id} />
      ) : null}
      {children}
    </AppShell>
  );
}
