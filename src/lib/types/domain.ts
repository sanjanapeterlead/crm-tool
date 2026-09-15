// Hand-authored domain types layered on top of the generated database types.
// Keep these aligned with supabase/migrations/0001_init_schema.sql.

export type OrgRole = "admin" | "manager" | "salesperson";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  profile?: Profile;
}

export interface LeadStatus {
  id: string;
  org_id: string;
  key: string;
  label: string;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
  is_default: boolean;
}

export interface Lead {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  status_id: string;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadWithRelations extends Lead {
  status: LeadStatus;
  assignee: Profile | null;
  next_followup?: Followup | null;
  last_activity?: Activity | null;
}

export interface Note {
  id: string;
  org_id: string;
  lead_id: string;
  author_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  author?: Profile | null;
}

export type MeetingStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export interface Meeting {
  id: string;
  org_id: string;
  lead_id: string;
  salesperson_id: string | null;
  scheduled_start: string;
  scheduled_end: string | null;
  meeting_type: string;
  external_booking_url: string | null;
  meeting_url: string | null;
  status: MeetingStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type FollowupStatus = "pending" | "completed" | "cancelled";

export interface Followup {
  id: string;
  org_id: string;
  lead_id: string;
  assigned_to: string | null;
  due_date: string;
  due_time: string | null;
  description: string;
  status: FollowupStatus;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lead?: Pick<Lead, "id" | "first_name" | "last_name">;
  assignee?: Profile | null;
}

export const ACTIVITY_TYPES = [
  "lead_created",
  "lead_updated",
  "lead_assigned",
  "status_changed",
  "note_created",
  "meeting_scheduled",
  "meeting_completed",
  "meeting_cancelled",
  "followup_created",
  "followup_completed",
  "followup_cancelled",
  "followup_rescheduled",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface Activity {
  id: string;
  org_id: string;
  lead_id: string;
  actor_id: string | null;
  activity_type: ActivityType | string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: Profile | null;
}

export const LEAD_SOURCES = [
  "Facebook Ad",
  "Instagram",
  "Referral",
  "Website",
  "Manual",
  "Other",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];
