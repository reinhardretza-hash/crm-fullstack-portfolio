"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { UserRole } from "@/generated/prisma/client";
import type { Permission } from "@/server/permissions";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { useSidebarCollapsed } from "./use-sidebar-collapsed";

type AppShellClientProps = {
  firstName: string;
  lastName: string;
  role: UserRole;
  canManageAdministration: boolean;
  permissions: Permission[];
  children: ReactNode;
};

export function AppShellClient({
  firstName,
  lastName,
  role,
  canManageAdministration,
  permissions,
  children,
}: AppShellClientProps) {
  const [isCollapsed, toggleCollapsed] = useSidebarCollapsed();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar
        canManageAdministration={canManageAdministration}
        permissions={permissions}
        isCollapsed={isCollapsed}
        isMobileNavOpen={isMobileNavOpen}
        onCloseMobileNav={() => setIsMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          firstName={firstName}
          lastName={lastName}
          role={role}
          isSidebarCollapsed={isCollapsed}
          onToggleSidebar={toggleCollapsed}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
        />
        <main className="crm-content flex-1 overflow-x-hidden p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
