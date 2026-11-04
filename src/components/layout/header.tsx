"use client";

import { usePathname } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { ChevronLeftIcon, MenuIcon } from "@/components/ui/icons";
import { findNavItemByPathname } from "./nav-config";
import { UserMenu } from "./user-menu";

type HeaderProps = {
  firstName: string;
  lastName: string;
  role: UserRole;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
};

export function Header({
  firstName,
  lastName,
  role,
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenMobileNav,
}: HeaderProps) {
  const pathname = usePathname();
  const currentPageLabel = findNavItemByPathname(pathname)?.label ?? "Dashboard";

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-black/10 bg-white px-4 lg:px-6">
      <button
        id="mobile-navigation-trigger"
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Navigation öffnen"
        className="rounded-md p-2 text-secondary hover:bg-black/5 lg:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={onToggleSidebar}
        aria-expanded={!isSidebarCollapsed}
        aria-label={isSidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
        className="hidden rounded-md p-2 text-secondary hover:bg-black/5 lg:flex"
      >
        <ChevronLeftIcon
          className={`h-5 w-5 transition-transform ${isSidebarCollapsed ? "rotate-180" : ""}`}
        />
      </button>

      <h1 className="text-sm font-medium text-black/80">{currentPageLabel}</h1>

      <div className="ml-auto">
        <UserMenu firstName={firstName} lastName={lastName} role={role} />
      </div>
    </header>
  );
}
