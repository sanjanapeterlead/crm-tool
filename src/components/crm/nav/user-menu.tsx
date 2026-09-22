"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/crm/layout/person-avatar";
import { AccentPicker } from "@/components/crm/theme/accent-picker";
import { logout } from "@/app/login/actions";

export function UserMenu({
  name,
  email,
  role,
  compact = false,
}: {
  name: string;
  email: string;
  role: string;
  /** Avatar-only trigger, for the mobile header where there's no room for the name. */
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      {compact ? (
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="Account menu" />}
        >
          <PersonAvatar name={name || email} className="size-8" />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger render={<Button variant="ghost" className="h-10 w-full justify-start gap-2 px-2" />}>
          <PersonAvatar name={name || email} className="size-7" />
          <div className="flex min-w-0 flex-col items-start text-left">
            <span className="w-full truncate text-sm font-medium">{name || email}</span>
            <span className="text-xs text-muted-foreground capitalize">{role}</span>
          </div>
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align={compact ? "end" : "start"} className="w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
              <UserIcon className="size-3.5" />
              {email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AccentPicker />
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem nativeButton render={<button type="submit" className="w-full" />}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
