"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { leadFormSchema, type LeadFormInput, leadSourceSchema } from "@/lib/validation/lead";
import type { Profile } from "@/lib/types/domain";

const UNASSIGNED = "__unassigned__";

export function LeadForm({
  members,
  defaultValues,
  onSubmit,
  submitLabel = "Save",
  showAssignment = true,
}: {
  members: Profile[];
  defaultValues?: Partial<LeadFormInput>;
  onSubmit: (input: LeadFormInput) => Promise<void>;
  submitLabel?: string;
  showAssignment?: boolean;
}) {
  const form = useForm<LeadFormInput>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      source: "Manual",
      assigned_to: "",
      ...defaultValues,
    },
  });

  const { register, handleSubmit, setValue, watch, formState } = form;
  const source = watch("source");
  const assignedTo = watch("assigned_to");

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (data) => {
        await onSubmit(data);
      })}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" {...register("first_name")} />
          {formState.errors.first_name && (
            <p className="text-xs text-destructive">{formState.errors.first_name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" {...register("last_name")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...register("phone")} placeholder="+1 555 0100" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} />
        </div>
      </div>
      {formState.errors.phone && (
        <p className="-mt-2 text-xs text-destructive">{formState.errors.phone.message}</p>
      )}
      <div className={showAssignment ? "grid grid-cols-2 gap-3" : ""}>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select value={source} onValueChange={(v) => setValue("source", v as LeadFormInput["source"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {leadSourceSchema.options.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showAssignment && (
          <div className="space-y-1.5">
            <Label>Assign to</Label>
            <Select
              value={assignedTo || UNASSIGNED}
              onValueChange={(v) => setValue("assigned_to", !v || v === UNASSIGNED ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned">
                  {(v: string) => {
                    if (v === UNASSIGNED) return "Unassigned";
                    const m = members.find((m) => m.id === v);
                    return m?.full_name || m?.email || "Unassigned";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
