"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloseIcon, LockIcon } from "@/components/ui/icons";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { Permission } from "@/server/permissions";
import { NAV_SECTIONS, type NavItem, type NavSection } from "./nav-config";

type SidebarNavProps = {
  sections: NavSection[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
};

function NavLink({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const isImplemented = Boolean(item.href);

  const content = (
    <span
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        collapsed && "justify-center px-2",
        isImplemented
          ? active
            ? "bg-white/10 font-medium text-white"
            : "text-white/70 hover:bg-white/5 hover:text-white"
          : "cursor-not-allowed text-white/30",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && !isImplemented && <LockIcon className="h-3.5 w-3.5 shrink-0 text-white/25" />}
    </span>
  );

  if (!isImplemented) {
    // Bewusst `aria-disabled` statt `disabled`: Ein natives `disabled`-
    // Attribut nimmt den Button aus der Tab-Reihenfolge und unterdrückt
    // Hover-/Fokus-Events, wodurch weder der Tooltip noch Tastaturnutzer ihn
    // erreichen könnten. So bleibt er fokussierbar und der Tooltip nutzbar,
    // aber ohne onClick-Handler passiert beim Aktivieren nichts.
    const disabledButton = (
      <button
        type="button"
        aria-disabled="true"
        aria-label={`${item.label} - noch nicht verfügbar`}
        className="w-full text-left"
      >
        {content}
      </button>
    );

    return <Tooltip content={`${item.label} – bald verfügbar`}>{disabledButton}</Tooltip>;
  }

  const link = (
    <Link href={item.href!} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      {content}
    </Link>
  );

  return collapsed ? <Tooltip content={item.label}>{link}</Tooltip> : link;
}

function SidebarNav({ sections, pathname, collapsed, onNavigate }: SidebarNavProps) {
  return (
    <nav aria-label="Hauptnavigation" className="flex flex-col gap-5">
      {sections.map((section, index) => (
        <div key={section.title ?? index} className="flex flex-col gap-1">
          {section.title && !collapsed && (
            <p className="px-3 text-xs font-medium tracking-wide text-sidebar-muted uppercase">
              {section.title}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.label}>
                <NavLink
                  item={item}
                  collapsed={collapsed}
                  active={Boolean(item.href && pathname.startsWith(item.href))}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

type SidebarProps = {
  canManageAdministration: boolean;
  permissions: Permission[];
  isCollapsed: boolean;
  isMobileNavOpen: boolean;
  onCloseMobileNav: () => void;
};

export function Sidebar({
  canManageAdministration,
  permissions,
  isCollapsed,
  isMobileNavOpen,
  onCloseMobileNav,
}: SidebarProps) {
  const pathname = usePathname();
  const sections = NAV_SECTIONS.filter(
    (section) => !section.requiresAdministration || canManageAdministration,
  ).map((section) => ({
    ...section,
    // Innerhalb der Administration-Sektion wird zusätzlich pro Eintrag
    // gefiltert (z. B. "Benutzer" nur mit USER_MANAGE) - rein kosmetisch,
    // die eigentliche Durchsetzung bleibt serverseitig auf jeder Route.
    items: section.items.filter(
      (item) => !item.requiredPermission || permissions.includes(item.requiredPermission),
    ),
  }));

  return (
    <TooltipProvider>
      {/* Desktop */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col bg-black py-4 transition-[width] duration-150 lg:flex",
          isCollapsed ? "w-[68px] px-2" : "w-64 px-3",
        )}
      >
        <div className={cn("mb-6 flex items-center px-1", isCollapsed && "justify-center")}>
          <span className="text-sm font-semibold tracking-[0.15em] text-[var(--gold)] uppercase">
            {isCollapsed ? "RD" : "RDEvolution"}
          </span>
        </div>
        <SidebarNav sections={sections} pathname={pathname} collapsed={isCollapsed} />
      </aside>

      {/* Mobile Drawer */}
      <Dialog.Root open={isMobileNavOpen} onOpenChange={(open) => !open && onCloseMobileNav()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <Dialog.Content
            // h-dvh statt nur inset-y-0: auf mobilen Browsern ist die Höhe 100vh inkl.
            // eingeblendeter Adressleiste größer als der sichtbare Bereich, untere
            // Einträge würden abgeschnitten. Header fix, Navigation scrollt.
            className="fixed top-0 bottom-auto left-0 z-50 flex h-dvh max-h-dvh w-72 max-w-[85vw] flex-col overflow-hidden bg-black px-3 pt-4 lg:hidden"
            aria-label="Navigation"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById("mobile-navigation-trigger")?.focus();
            }}
          >
            <div className="mb-6 flex shrink-0 items-center justify-between px-1">
              <Dialog.Title asChild>
                <span className="text-sm font-semibold tracking-[0.15em] text-[var(--gold)] uppercase">
                  RDEvolution
                </span>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Navigation schließen"
                  className="rounded-md p-1.5 text-white/60 hover:bg-white/5 hover:text-white"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
            <div
              data-testid="mobile-nav-scroll"
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <SidebarNav
                sections={sections}
                pathname={pathname}
                collapsed={false}
                onNavigate={onCloseMobileNav}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </TooltipProvider>
  );
}
