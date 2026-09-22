"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOST_REASONS } from "@/lib/domain/opportunity";

const OTHER = "Other";

/**
 * Why was this lead lost? A short list plus "Other" with free text, so the
 * owner can later answer "why do we lose leads" without reading every note.
 * `value` is the final reason string the server receives.
 */
export function LostReasonField({
  value,
  onChange,
}: {
  value: string;
  onChange: (reason: string) => void;
}) {
  const isPreset = (LOST_REASONS as readonly string[]).includes(value) && value !== OTHER;
  const selected = value === "" ? "" : isPreset ? value : OTHER;

  return (
    <div className="space-y-2">
      <Label>Reason for losing this lead</Label>
      <Select
        value={selected}
        onValueChange={(v) => {
          if (!v) return;
          onChange(v === OTHER ? " " : v);
        }}
      >
        <SelectTrigger className="w-full" aria-label="Reason for losing this lead">
          <SelectValue placeholder="Select a reason" />
        </SelectTrigger>
        <SelectContent>
          {LOST_REASONS.map((reason) => (
            <SelectItem key={reason} value={reason}>
              {reason}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected === OTHER && (
        <Input
          autoFocus
          placeholder="Tell us more"
          maxLength={200}
          value={value.trim() === "" ? "" : value}
          onChange={(e) => onChange(e.target.value || " ")}
          aria-label="Other reason"
        />
      )}
    </div>
  );
}
