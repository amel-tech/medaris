import { MadrasahLogoIcon } from "@medaris/icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@medaris/ui/components/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
import KeycloakLogin from "~/components/keycloak/login";
import { NavMain } from "~/components/layout/nav-main";
import { NavUser } from "~/components/layout/nav-user";
import LocaleSwitcher from "../i18n/locale-switcher";
import { routes } from "./nav-routes";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { data } = useSession();

  const navMain = useMemo(() => {
    return routes.navMain.map((route) => ({
      ...route,
      isActive: pathname.startsWith(route.url),
      items: route.items?.map((subRoute) => ({
        ...subRoute,
        isActive: pathname === subRoute.url,
      })),
    }));
  }, [pathname]);

  const user = useMemo(() => {
    return {
      name: data?.user?.name || "",
      email: data?.user?.email || "",
      avatar: data?.user?.picture || "",
    };
  }, [data]);

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/home">
                <div>
                  <MadrasahLogoIcon size={36} />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Nizam</span>
                  <span className="truncate text-xs">Online Madrasah</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        {data?.user && <NavUser user={user} />}
        {!data?.user && <KeycloakLogin />}
        <LocaleSwitcher />
      </SidebarFooter>
    </Sidebar>
  );
}
