import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/session";
import type { OrgRole } from "@/lib/domain/permissions";
import { createOrganizationWithAdmin } from "@/lib/services/organizations";
import type { CaptureActor, CaptureInput } from "@/lib/services/capture";

/**
 * Helpers for tests that talk to the real local Supabase stack. They need
 * `npm run db:start` + `npm run db:reset` first (seed org: summit-sales-group).
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!URL || !ANON || !SERVICE) {
  throw new Error("Integration tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see .env.example).");
}

export const PASSWORD = "password123";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** The service-role client: bypasses RLS. Test setup and assertions only. */
export const admin: SupabaseClient = createClient(URL, SERVICE, noSession);

/** A client signed in as a real user, so every query runs under that user's RLS. */
export async function signIn(email: string, password = PASSWORD): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}`);
  return client;
}

export function anonClient(): SupabaseClient {
  return createClient(URL, ANON, noSession);
}

export async function seedOrgId(): Promise<string> {
  const { data, error } = await admin.from("organizations").select("id").eq("slug", "summit-sales-group").single();
  if (error || !data) throw new Error("Seed organization not found — run `npm run db:reset`.");
  return data.id as string;
}

export async function userIdOf(email: string): Promise<string> {
  const { data, error } = await admin.from("profiles").select("id").eq("email", email).single();
  if (error || !data) throw new Error(`No profile for ${email}`);
  return data.id as string;
}

export const SEED_USERS = {
  admin: "admin@summitsales.test",
  manager: "manager@summitsales.test",
  jordan: "jordan@summitsales.test",
  priya: "priya@summitsales.test",
  marcus: "marcus@summitsales.test",
} as const;

/** A SessionContext for a seeded user, plus the client that acts as them. */
export async function sessionFor(email: string, orgId?: string) {
  const db = await signIn(email);
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("no user");

  const { data: membership } = await admin
    .from("organization_members")
    .select("org_id, role, profile:user_id(id, email, full_name, avatar_url), organization:org_id(name, timezone)")
    .eq("user_id", user.id)
    .single();
  if (!membership) throw new Error(`${email} has no membership`);

  const profile = Array.isArray(membership.profile) ? membership.profile[0] : membership.profile;
  const organization = Array.isArray(membership.organization) ? membership.organization[0] : membership.organization;

  const session: SessionContext = {
    user: { id: user.id, email },
    profile: profile as SessionContext["profile"],
    orgId: (orgId ?? membership.org_id) as string,
    orgName: (organization as { name: string }).name,
    timezone: (organization as { timezone?: string }).timezone ?? "Asia/Kolkata",
    role: membership.role as OrgRole,
  };
  return { db, session };
}

export function actorOf(session: SessionContext): CaptureActor {
  return { orgId: session.orgId, userId: session.user.id, role: session.role };
}

export const SYSTEM = (orgId: string): CaptureActor => ({ orgId, userId: null, role: null });

/** A fresh, valid Indian mobile number, so tests never collide on the dedupe key. */
export function uniquePhone(): string {
  const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  return `+9198${digits}`;
}

/** A fresh valid number that ends in `suffix` (the mock WhatsApp adapter treats …0000 / …9999 specially). */
export function uniquePhoneEndingIn(suffix: string): string {
  const head = String(Math.floor(Math.random() * 10 ** (8 - suffix.length))).padStart(8 - suffix.length, "0");
  return `+9198${head}${suffix}`;
}

export function uniqueEmail(prefix = "lead"): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@example.com`;
}

export function manualInput(overrides: Partial<CaptureInput> = {}): CaptureInput {
  return {
    firstName: "Test",
    lastName: "Lead",
    phone: uniquePhone(),
    source: "Manual",
    timeline: { type: "lead_created", title: "Lead created" },
    ...overrides,
  };
}

/** A second organization with its own admin, for cross-tenant assertions. */
export async function createRivalOrg() {
  const email = `rival.${randomUUID().slice(0, 8)}@example.com`;
  const { orgId, userId } = await createOrganizationWithAdmin(admin, {
    orgName: `Rival Co ${randomUUID().slice(0, 6)}`,
    email,
    password: PASSWORD,
  });

  return {
    orgId,
    adminId: userId,
    adminEmail: email,
    async cleanup() {
      await admin.from("organizations").delete().eq("id", orgId);
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

export async function countRows(table: string, filter: Record<string, string>): Promise<number> {
  let query = admin.from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filter)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}
