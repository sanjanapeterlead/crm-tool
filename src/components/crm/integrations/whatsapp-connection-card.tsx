"use client";

import { useTransition } from "react";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { disconnectWhatsAppAction } from "@/app/(app)/settings/integrations/whatsapp/actions";
import type { WhatsAppConnection } from "@/lib/services/whatsapp";

export function WhatsAppConnectionCard({ connection }: { connection: WhatsAppConnection | null }) {
  const [pending, startTransition] = useTransition();

  function handleDisconnect() {
    startTransition(async () => {
      const result = await disconnectWhatsAppAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("WhatsApp disconnected");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {connection ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                Connected as {connection.meta_user_name ?? connection.meta_user_id}
              </p>
              {connection.display_phone_number ? (
                <p className="text-muted-foreground">
                  Sending from {connection.display_phone_number} ({connection.verified_name})
                </p>
              ) : (
                <p className="text-amber-600 dark:text-amber-500">
                  No sending number selected yet.
                </p>
              )}
              <p className="text-muted-foreground">
                Since {format(new Date(connection.connected_at), "MMM d, yyyy")}
                {connection.token_expires_at && (
                  <> · token expires {format(new Date(connection.token_expires_at), "MMM d, yyyy")}</>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<a href="/api/integrations/whatsapp/connect" />}
              >
                Reconnect
              </Button>
              <Button variant="outline" onClick={handleDisconnect} disabled={pending}>
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect the same Facebook account used for Meta Ads (or a different one) to send
              template messages from your WhatsApp Business number.
            </p>
            <Button nativeButton={false} render={<a href="/api/integrations/whatsapp/connect" />}>
              Connect WhatsApp <ExternalLink className="size-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
