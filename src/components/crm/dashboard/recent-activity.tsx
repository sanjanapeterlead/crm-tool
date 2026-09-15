import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Activity, Lead, Profile } from "@/lib/types/domain";

type ActivityRow = Activity & {
  lead: Pick<Lead, "id" | "first_name" | "last_name">;
  actor: Profile | null;
};

export function RecentActivity({ activities }: { activities: ActivityRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          activities.map((a) => (
            <div key={a.id} className="text-sm">
              <Link href={`/leads/${a.lead.id}`} className="font-medium hover:underline">
                {a.lead.first_name} {a.lead.last_name}
              </Link>
              <span className="text-muted-foreground"> — {a.title}</span>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                {a.actor?.full_name ? ` · ${a.actor.full_name}` : ""}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
