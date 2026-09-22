"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/crm/nav/sidebar-nav";
import { BrandMark } from "@/components/crm/layout/brand-mark";
import type { OrgRole } from "@/lib/domain/permissions";

export function MobileNav({ orgName, role }: { orgName: string; role: OrgRole }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" />}>
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 bg-sidebar p-0 text-sidebar-foreground">
        <SheetHeader className="border-b">
          <SheetTitle>
            <BrandMark orgName={orgName} />
          </SheetTitle>
        </SheetHeader>
        <div onClick={() => setOpen(false)}>
          <SidebarNav role={role} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
