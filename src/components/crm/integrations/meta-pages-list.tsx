"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  togglePageActiveAction,
  togglePageSubscriptionAction,
} from "@/app/(app)/settings/integrations/meta/actions";
import type { MetaPageRecord } from "@/lib/services/meta";

export function MetaPagesList({ pages }: { pages: MetaPageRecord[] }) {
  const [pending, startTransition] = useTransition();

  function handleSubscription(pageId: string, subscribe: boolean) {
    startTransition(async () => {
      const result = await togglePageSubscriptionAction(pageId, subscribe);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(subscribe ? "Page subscribed to lead events" : "Page unsubscribed");
    });
  }

  function handleActive(pageId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await togglePageActiveAction(pageId, isActive);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isActive ? "Ingestion resumed" : "Ingestion paused");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pages</CardTitle>
      </CardHeader>
      <CardContent>
        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Pages found on the connected account.
          </p>
        ) : (
          <ul className="divide-y">
            {pages.map((page) => (
              <li
                key={page.page_id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{page.page_name}</span>
                    {page.instagram_account_id && (
                      <Badge variant="outline" title="Instagram account linked">
                        Instagram
                      </Badge>
                    )}
                    {page.webhook_subscribed ? (
                      <Badge variant="secondary">Subscribed</Badge>
                    ) : (
                      <Badge variant="outline">Not subscribed</Badge>
                    )}
                    {!page.is_active && <Badge variant="destructive">Paused</Badge>}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{page.page_id}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => handleSubscription(page.page_id, !page.webhook_subscribed)}
                  >
                    {page.webhook_subscribed ? "Unsubscribe" : "Subscribe"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => handleActive(page.page_id, !page.is_active)}
                  >
                    {page.is_active ? "Pause" : "Resume"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Subscribing tells Meta to POST this Page&apos;s lead submissions to the CRM. Pausing keeps
          the subscription but stops the CRM creating leads from it.
        </p>
      </CardContent>
    </Card>
  );
}
