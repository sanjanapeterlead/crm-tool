import { formatShortDateTime } from "@/lib/format";
import { AlertCircle, Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WhatsAppMessageRow } from "@/lib/services/conversations";

const STATUS_LABEL: Record<WhatsAppMessageRow["status"], string> = {
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  received: "Received",
};

function StatusMark({ status }: { status: WhatsAppMessageRow["status"] }) {
  if (status === "failed") return <AlertCircle className="size-3.5 text-destructive" aria-hidden />;
  if (status === "read") return <CheckCheck className="size-3.5 text-sky-600" aria-hidden />;
  if (status === "delivered") return <CheckCheck className="size-3.5" aria-hidden />;
  if (status === "sent") return <Check className="size-3.5" aria-hidden />;
  return null;
}

/** The lead's WhatsApp conversation, oldest first, customer on the left and us on the right. */
export function WhatsAppMessagesList({ messages, timezone }: { messages: WhatsAppMessageRow[]; timezone: string }) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No WhatsApp messages yet. Use &ldquo;Send WhatsApp&rdquo; to start the conversation.
      </p>
    );
  }

  const ordered = [...messages].reverse();

  return (
    <ul className="space-y-3" aria-label="WhatsApp conversation">
      {ordered.map((m) => {
        const inbound = m.direction === "inbound";
        return (
          <li key={m.id} className={cn("flex", inbound ? "justify-start" : "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] space-y-1 rounded-lg border px-3 py-2",
                inbound ? "bg-muted/50" : "bg-primary/5",
                m.status === "failed" && "border-destructive/50"
              )}
            >
              {m.template_name && <p className="text-xs font-medium text-muted-foreground">Template: {m.template_name}</p>}
              <p className="whitespace-pre-wrap text-sm">{m.rendered_body}</p>
              {m.error && (
                <p className="text-xs text-destructive" role="alert">
                  Not delivered: {m.error}
                </p>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <StatusMark status={m.status} />
                <span>{STATUS_LABEL[m.status]}</span>
                <span>· {formatShortDateTime(m.created_at, timezone)}</span>
                {!inbound && m.sender && <span>· {m.sender.full_name || m.sender.email}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
