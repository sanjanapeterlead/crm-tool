"use client";

import { useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { retryWebhookEventAction } from "@/app/(app)/settings/integrations/meta/actions";
import type { MetaWebhookEvent, MetaWebhookEventStatus } from "@/lib/types/domain";

const STATUS_VARIANT: Record<MetaWebhookEventStatus, "default" | "secondary" | "outline" | "destructive"> = {
  processed: "secondary",
  duplicate: "outline",
  ignored: "outline",
  received: "outline",
  failed: "destructive",
};

export function MetaEventLog({ events }: { events: MetaWebhookEvent[] }) {
  const [pending, startTransition] = useTransition();

  function handleRetry(eventId: string) {
    startTransition(async () => {
      const result = await retryWebhookEventAction(eventId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Lead re-imported");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Webhook deliveries</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing received yet. Submit a test lead from Meta&apos;s Lead Ads Testing Tool to
            confirm the connection works end to end.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(event.received_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[event.status] ?? "outline"}>
                        {event.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {event.lead_id ? (
                        <Link href={`/leads/${event.lead_id}`} className="text-primary hover:underline">
                          View lead
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {event.leadgen_id ?? "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="text-xs text-muted-foreground">{event.error ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      {event.status === "failed" && (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={pending}
                          onClick={() => handleRetry(event.id)}
                        >
                          Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
