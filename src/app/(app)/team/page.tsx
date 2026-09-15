import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listOrgMembers } from "@/lib/services/team";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Profile, OrgRole } from "@/lib/types/domain";

const ROLE_VARIANT: Record<OrgRole, string> = {
  admin: "border-purple-600/30 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  manager: "border-blue-600/30 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  salesperson: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export default async function TeamPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const members = await listOrgMembers(supabase, session);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">Everyone with access to {session.orgName}.</p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const profile = (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Profile;
              return (
                <TableRow key={m.id}>
                  <TableCell className="flex items-center gap-2 font-medium">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">{initials(profile.full_name || profile.email)}</AvatarFallback>
                    </Avatar>
                    {profile.full_name || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{profile.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ROLE_VARIANT[m.role as OrgRole]}>
                      {m.role}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
