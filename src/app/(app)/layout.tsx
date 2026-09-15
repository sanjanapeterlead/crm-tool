import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { SidebarNav } from "@/components/crm/nav/sidebar-nav";
import { UserMenu } from "@/components/crm/nav/user-menu";
import { MobileNav } from "@/components/crm/nav/mobile-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/20 md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/" className="font-semibold tracking-tight">
            {session.orgName}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="border-t p-2">
          <UserMenu name={session.profile.full_name ?? ""} email={session.user.email} role={session.role} />
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4 md:hidden">
          <div className="flex items-center gap-2">
            <MobileNav orgName={session.orgName} />
            <Link href="/" className="font-semibold tracking-tight">
              {session.orgName}
            </Link>
          </div>
          <UserMenu name={session.profile.full_name ?? ""} email={session.user.email} role={session.role} />
        </header>
        <main className="flex-1 bg-background p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
