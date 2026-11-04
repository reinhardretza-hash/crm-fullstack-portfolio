"use client";

import Link from "next/link";
import { useTransition } from "react";
import { logoutAction } from "@/modules/auth/actions";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon, LogoutIcon, SettingsIcon } from "@/components/ui/icons";
import { roleLabel } from "./role-label";
import type { UserRole } from "@/generated/prisma/client";

type UserMenuProps = {
  firstName: string;
  lastName: string;
  role: UserRole;
};

export function UserMenu({ firstName, lastName, role }: UserMenuProps) {
  const fullName = `${firstName} ${lastName}`;
  const [, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs font-medium text-white">
            {firstName.charAt(0)}
            {lastName.charAt(0)}
          </span>
          <span className="hidden flex-col sm:flex">
            <span className="text-sm font-medium text-black">{fullName}</span>
            <span className="text-xs text-muted">{roleLabel(role)}</span>
          </span>
          <ChevronDownIcon className="h-4 w-4 text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          {fullName}
          <Badge variant="gold" className="ml-2">
            {roleLabel(role)}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <SettingsIcon className="h-4 w-4" />
            Mein Konto
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/*
          Bewusst KEIN <form action={logoutAction}> hier: Ein DropdownMenuItem
          mit `asChild` um ein <form> herum schlug in echten Browser-Tests
          fehl - Radix schließt/unmountet das Menü im selben Event-Zyklus wie
          der Klick, wodurch der native Submit teils nie React's Server-
          Action-Handler erreichte (sichtbar als "javascript:" Navigation
          statt eines POST-Requests). Der direkte Aufruf der Server Action
          über onSelect + startTransition ist der von Next.js empfohlene Weg,
          eine Server Action außerhalb eines <form> auszulösen, und
          funktioniert unabhängig vom Menü-Schließverhalten.
        */}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            startTransition(() => {
              void logoutAction();
            });
          }}
        >
          <LogoutIcon className="h-4 w-4" />
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
