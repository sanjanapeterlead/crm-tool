"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { renderBody } from "@/lib/domain/whatsapp";
import { sendWhatsAppTemplateAction, sendWhatsAppTextAction } from "@/app/(app)/actions";
import type { WhatsAppTemplateRow } from "@/lib/services/whatsapp";

type Mode = "reply" | "template";

/**
 * Send a WhatsApp message from the lead page. Inside the 24-hour window the
 * customer opened by messaging us, free text is allowed; outside it WhatsApp
 * only permits an approved template — so the composer offers exactly what the
 * rules allow instead of letting a doomed send fail at the provider.
 */
export function SendWhatsAppDialog({
  leadId,
  leadFirstName,
  templates,
  windowOpen,
  optedOut,
  demo,
  trigger,
}: {
  leadId: string;
  leadFirstName: string;
  templates: WhatsAppTemplateRow[];
  /** The customer messaged us in the last 24 hours. */
  windowOpen: boolean;
  optedOut: boolean;
  /** A mock is standing in for WhatsApp: nothing will actually be delivered. */
  demo: boolean;
  trigger: React.ReactElement;
}) {
  const approved = useMemo(() => templates.filter((t) => t.status === "APPROVED"), [templates]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(windowOpen ? "reply" : "template");
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState<string>(approved[0]?.id ?? "");
  const [values, setValues] = useState<string[]>(() => buildInitialValues(approved[0], leadFirstName));
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const template = approved.find((t) => t.id === templateId) ?? null;
  const preview = template ? renderBody(template.body_text, values) : "";
  const templateLabel = (v: string) => approved.find((t) => t.id === v)?.name ?? "Select a template";
  const missingValue = values.some((v) => v.trim() === "");

  function buildInitialValues(t: WhatsAppTemplateRow | undefined, firstName: string): string[] {
    if (!t) return [];
    return Array.from({ length: t.variable_count }, (_, i) => (i === 0 ? firstName : ""));
  }

  function handleTemplateChange(id: string | null) {
    if (!id) return;
    setTemplateId(id);
    setValues(buildInitialValues(approved.find((t) => t.id === id), leadFirstName));
  }

  async function handleSend() {
    setPending(true);
    const result =
      mode === "reply"
        ? await sendWhatsAppTextAction(leadId, text)
        : template
          ? await sendWhatsAppTemplateAction(leadId, template.id, values)
          : null;
    setPending(false);
    if (!result) return;

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data?.status === "failed") {
      // The message was NOT delivered; it's also on the timeline as a failure.
      toast.error(result.data.error);
      router.refresh();
      return;
    }
    toast.success(demo ? "Message recorded (demo mode — not delivered)" : "WhatsApp message sent");
    setText("");
    setOpen(false);
    router.refresh();
  }

  const canSend =
    !pending && !optedOut && (mode === "reply" ? text.trim().length > 0 && windowOpen : Boolean(template) && !missingValue);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send WhatsApp message</DialogTitle>
          <DialogDescription>
            {demo
              ? "Demo mode: messages are recorded but not actually delivered."
              : "Sent from your organization's shared WhatsApp Business number."}
          </DialogDescription>
        </DialogHeader>

        {optedOut ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            This contact opted out of WhatsApp messages, so nothing can be sent.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex w-fit gap-1 rounded-lg bg-muted p-[3px]" role="tablist" aria-label="Message type">
              {(["reply", "template"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                    mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m === "reply" ? "Reply" : "Template"}
                </button>
              ))}
            </div>

            {mode === "reply" ? (
              windowOpen ? (
                <div className="space-y-1.5">
                  <Label htmlFor="wa-text">Message</Label>
                  <Textarea
                    id="wa-text"
                    rows={4}
                    maxLength={4096}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type your reply…"
                  />
                </div>
              ) : (
                <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  The 24-hour reply window is closed. WhatsApp only allows an approved template until the customer
                  messages you again.
                </p>
              )
            ) : approved.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No approved templates yet. An admin can sync and approve templates under Settings → WhatsApp.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-template">Template</Label>
                  <Select value={templateId} onValueChange={handleTemplateChange}>
                    <SelectTrigger id="wa-template">
                      <SelectValue placeholder="Select a template">{templateLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {approved.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {template && template.variable_count > 0 && (
                  <div className="space-y-3">
                    {values.map((value, i) => (
                      <div key={i} className="space-y-1.5">
                        <Label htmlFor={`wa-var-${i}`}>{`Variable {{${i + 1}}}`}</Label>
                        <Input
                          id={`wa-var-${i}`}
                          value={value}
                          onChange={(e) => {
                            const next = [...values];
                            next[i] = e.target.value;
                            setValues(next);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {template && (
                  <div className="space-y-1.5">
                    <Label>Preview</Label>
                    <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{preview}</p>
                  </div>
                )}
              </>
            )}

            <Button onClick={handleSend} disabled={!canSend} className="w-full">
              {pending ? "Sending…" : "Send"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
