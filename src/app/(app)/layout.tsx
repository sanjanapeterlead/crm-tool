import { requireSession } from "@/lib/auth/session";
import { SidebarNav } from "@/components/crm/nav/sidebar-nav";
import { UserMenu } from "@/components/crm/nav/user-menu";
import { MobileNav } from "@/components/crm/nav/mobile-nav";
import { BrandMark } from "@/components/crm/layout/brand-mark";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <BrandMark orgName={session.orgName} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav role={session.role} />
        </div>
        <div className="border-t border-sidebar-border p-2">
          <UserMenu name={session.profile.full_name ?? ""} email={session.user.email} role={session.role} />
        </div>
      </aside>
      {/* min-w-0: a flex item defaults to min-width:auto, so wide content (the
          pipeline board) would otherwise stretch the whole page sideways
          instead of scrolling inside its own container. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNav orgName={session.orgName} role={session.role} />
            <BrandMark orgName={session.orgName} />
          </div>
          <UserMenu name={session.profile.full_name ?? ""} email={session.user.email} role={session.role} compact />
        </header>
        <main className="min-w-0 flex-1 bg-background p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
