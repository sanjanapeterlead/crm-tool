import { formatDateTime } from "@/lib/format";
import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractCustomAnswers } from "@/lib/integrations/meta/mapping";
import type { MetaLeadAttribution } from "@/lib/types/domain";

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

/** Which ad produced this lead — the link between spend and outcome. */
export function LeadAttributionCard({ attribution, timezone }: { attribution: MetaLeadAttribution; timezone: string }) {
  const isInstagram = attribution.platform?.toLowerCase() === "ig";
  const customAnswers = extractCustomAnswers(attribution.field_data ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="size-4" />
          Ad Attribution
          {attribution.is_organic && <Badge variant="outline">Organic</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-1.5">
          <Row label="Campaign" value={attribution.campaign_name} />
          <Row label="Ad set" value={attribution.adset_name} />
          <Row label="Ad" value={attribution.ad_name} />
          <Row label="Form" value={attribution.form_name} />
          <Row
            label="Platform"
            value={isInstagram ? "Instagram" : attribution.platform ? "Facebook" : null}
          />
          <Row
            label="Submitted"
            value={
              attribution.meta_created_time
                ? formatDateTime(attribution.meta_created_time, timezone)
                : null
            }
          />
        </dl>

        {customAnswers.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Form answers</p>
            <dl className="space-y-1.5">
              {customAnswers.map((answer) => (
                <Row
                  key={answer.name}
                  label={answer.name.replace(/_/g, " ")}
                  value={answer.values?.join(", ") || null}
                />
              ))}
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
