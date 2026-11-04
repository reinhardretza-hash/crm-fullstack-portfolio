import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="4" width="15" height="13" rx="2" />
      <path d="M6 2v4M14 2v4M2.5 8h15M6 11h2M12 11h2M6 14h2" />
    </Icon>
  );
}

// Schlanke, handgezeichnete Strich-Icons (kein Icon-Paket) - monochrom über
// `currentColor`, damit sie Text-/Akzentfarben (Weiß, Gold) automatisch
// übernehmen. Bewusst nur die Icons, die App Shell und Dashboard tatsächlich
// brauchen.
function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1" />
    </Icon>
  );
}

export function PipelineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 5h15M2.5 10h11M2.5 15h7" />
    </Icon>
  );
}

export function LeadsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M3.5 17c0-3 3-5 6.5-5s6.5 2 6.5 5" />
    </Icon>
  );
}

export function DealsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 10 10 2.5 17.5 10 10 17.5Z" />
      <path d="M10 6.5v7" />
    </Icon>
  );
}

export function ContactsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="6" r="3" />
      <path d="M4 17c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    </Icon>
  );
}

export function CompaniesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="6" height="10" />
      <rect x="11" y="3" width="6" height="14" />
      <path d="M5.5 10h1M5.5 12.5h1M13.5 6h1M13.5 9h1M13.5 12h1" />
    </Icon>
  );
}

export function TasksIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="14" height="14" rx="1.5" />
      <path d="M6.5 10l2 2 4.5-4.5" />
    </Icon>
  );
}

export function FollowUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="11" r="6.5" />
      <path d="M10 8v3l2 1.5" />
      <path d="M7.5 2.5h5" />
    </Icon>
  );
}

export function ActivitiesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3 2" />
    </Icon>
  );
}

export function ReportsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 17V9M10 17V3M16 17v-5" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="6.5" r="2.75" />
      <path d="M2.5 17c0-2.8 2.2-4.75 5-4.75s5 1.95 5 4.75" />
      <path d="M13 8a2.5 2.5 0 1 0 0-5" />
      <path d="M13.5 12.5c1.9.4 3 1.9 3 4.5" />
    </Icon>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3.5h5.5a2 2 0 0 1 2 2V11a2 2 0 0 1-.6 1.4l-6 6a2 2 0 0 1-2.8 0l-5-5a2 2 0 0 1 0-2.8l6-6A2 2 0 0 1 9 3.5Z" />
      <circle cx="12" cy="7" r="1.1" />
    </Icon>
  );
}

export function AuditIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
      <path d="M7 6.5h6M7 10h6M7 13.5h3.5" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="2.75" />
      <path d="M10 3.5v2M10 14.5v2M3.5 10h2M14.5 10h2M5.5 5.5l1.4 1.4M13.1 13.1l1.4 1.4M5.5 14.5l1.4-1.4M13.1 6.9l1.4-1.4" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.5 4 6.5 10l6 6" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7.5 10 13l5.5-5.5" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </Icon>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h3" />
      <path d="M13 13.5 17 10l-4-3.5M17 10H7.5" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.25" />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
    </Icon>
  );
}
