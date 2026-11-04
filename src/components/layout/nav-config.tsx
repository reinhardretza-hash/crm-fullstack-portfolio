import {
  ActivitiesIcon,
  CalendarIcon,
  AuditIcon,
  CompaniesIcon,
  ContactsIcon,
  DashboardIcon,
  DealsIcon,
  FollowUpIcon,
  type IconProps,
  LeadsIcon,
  PipelineIcon,
  ReportsIcon,
  SettingsIcon,
  TagIcon,
  TasksIcon,
  UsersIcon,
} from "@/components/ui/icons";
import type { Permission } from "@/server/permissions";

export type NavItem = {
  label: string;
  icon: (props: IconProps) => React.JSX.Element;
  // Kein href => Route existiert noch nicht. Es darf niemals ein Link auf
  // eine nicht existierende Seite gerendert werden (siehe Vorgabe Punkt 2) -
  // solche Einträge werden bewusst als deaktiviert/"bald verfügbar"
  // dargestellt statt verlinkt.
  href?: string;
  // Nur für Einträge innerhalb der Administration-Sektion relevant: blendet
  // den Eintrag aus, wenn der Benutzer die Permission nicht hat (z. B.
  // "Benutzer" nur für USER_MANAGE). Rein kosmetisch - die eigentliche
  // Durchsetzung erfolgt serverseitig auf jeder Route selbst (siehe Vorgabe
  // Punkt 27: Sidebar-Sichtbarkeit ist kein Sicherheitsmechanismus).
  requiredPermission?: Permission;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
  // Nur für die Administration-Sektion relevant: wird vom Aufrufer anhand
  // der zentralen RBAC-Funktion canManageUsers() gesetzt, nicht hier.
  requiresAdministration?: boolean;
};

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ label: "Dashboard", icon: DashboardIcon, href: "/dashboard" }],
  },
  {
    title: "Vertrieb",
    items: [
      { label: "Pipeline", icon: PipelineIcon, href: "/pipeline" },
      { label: "Leads", icon: LeadsIcon, href: "/leads" },
      { label: "Deals", icon: DealsIcon, href: "/deals" },
      { label: "Angebote", icon: ReportsIcon, href: "/quotes" },
      { label: "Rechnungen", icon: ReportsIcon, href: "/invoices" },
      { label: "Follow-ups", icon: FollowUpIcon, href: "/follow-ups" },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "Kontakte", icon: ContactsIcon, href: "/contacts" },
      { label: "Unternehmen", icon: CompaniesIcon, href: "/companies" },
    ],
  },
  {
    title: "Organisation",
    items: [
      { label: "Aufgaben", icon: TasksIcon, href: "/tasks" },
      { label: "Kalender", icon: CalendarIcon, href: "/calendar" },
      { label: "E-Mails", icon: ActivitiesIcon, href: "/emails", requiredPermission: "EMAIL_SEND" },
      { label: "Aktivitäten", icon: ActivitiesIcon, href: "/activities" },
    ],
  },
  {
    title: "Auswertung",
    items: [{ label: "Reports", icon: ReportsIcon, href: "/reports" }],
  },
  {
    title: "Administration",
    requiresAdministration: true,
    items: [
      {
        label: "Benutzer",
        icon: UsersIcon,
        href: "/settings/users",
        requiredPermission: "USER_MANAGE",
      },
      {
        label: "Allgemein",
        icon: SettingsIcon,
        href: "/settings/general",
        requiredPermission: "SETTINGS_MANAGE",
      },
      {
        label: "Pipeline",
        icon: PipelineIcon,
        href: "/settings/pipeline",
        requiredPermission: "PIPELINE_MANAGE",
      },
      {
        label: "Lead Scoring",
        icon: LeadsIcon,
        href: "/settings/lead-scoring",
        requiredPermission: "LEAD_SCORING_MANAGE",
      },
      {
        label: "Erinnerungen",
        icon: SettingsIcon,
        href: "/settings/reminders",
        requiredPermission: "SETTINGS_MANAGE",
      },
      { label: "Tags", icon: TagIcon, href: "/settings/tags", requiredPermission: "TAG_MANAGE" },
      {
        label: "Audit Log",
        icon: AuditIcon,
        href: "/settings/audit",
        requiredPermission: "AUDIT_VIEW",
      },
    ],
  },
];

export function findNavItemByPathname(pathname: string): NavItem | undefined {
  for (const section of NAV_SECTIONS) {
    const match = section.items.find((item) => item.href && pathname.startsWith(item.href));
    if (match) return match;
  }
  return undefined;
}
