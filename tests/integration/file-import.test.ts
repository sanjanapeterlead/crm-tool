import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { importLeadsFromCsv } from "@/lib/services/file-import";
import { admin, seedOrgId, sessionFor, SEED_USERS, uniquePhone } from "./support";

let orgId: string;
let orgAdmin: Awaited<ReturnType<typeof sessionFor>>;
let manager: Awaited<ReturnType<typeof sessionFor>>;

beforeAll(async () => {
  orgId = await seedOrgId();
  orgAdmin = await sessionFor(SEED_USERS.admin);
  manager = await sessionFor(SEED_USERS.manager);
});

/** A name that can't collide with seed data or another test run. */
function uniqueName(label: string): string {
  return `${label}${randomUUID().slice(0, 8)}`;
}

function actorFor(session: Awaited<ReturnType<typeof sessionFor>>["session"]) {
  return { orgId: session.orgId, userId: session.user.id, role: session.role };
}

async function findLeadByFirstName(firstName: string) {
  const { data } = await admin.from("leads").select("id, source, priority, value").eq("org_id", orgId).eq("first_name", firstName).maybeSingle();
  return data as { id: string; source: string; priority: string; value: number | null } | null;
}

describe("importLeadsFromCsv", () => {
  it("only an admin may run it", async () => {
    const csv = `first_name,phone\n${uniqueName("Blocked")},${uniquePhone()}\n`;
    await expect(
      importLeadsFromCsv({ db: manager.db, admin }, actorFor(manager.session), csv, "test.csv")
    ).rejects.toThrow(/only an admin/i);
  });

  it("creates a lead per valid row, matches a known source case-insensitively, and records a summary", async () => {
    const name1 = uniqueName("Asha");
    const name2 = uniqueName("Vikram");
    const csv =
      ["first_name,last_name,phone,source,priority,value", `${name1},Rao,${uniquePhone()},referral,high,50000`, `${name2},,${uniquePhone()},Some Trade Show,,`].join(
        "\n"
      ) + "\n";

    const summary = await importLeadsFromCsv({ db: orgAdmin.db, admin }, actorFor(orgAdmin.session), csv, "leads.csv");

    expect(summary.totalRows).toBe(2);
    expect(summary.created).toBe(2);
    expect(summary.errors).toEqual([]);

    const lead1 = await findLeadByFirstName(name1);
    expect(lead1?.source).toBe("Referral"); // matched case-insensitively against LEAD_SOURCES
    expect(lead1?.priority).toBe("high");
    expect(lead1?.value).toBe(50000);

    const lead2 = await findLeadByFirstName(name2);
    expect(lead2?.source).toBe("Other"); // unrecognized source text falls back to Other + sourceDetail
  });

  it("merges a row whose phone already has an open opportunity, instead of creating a second one", async () => {
    const phone = uniquePhone();
    const name = uniqueName("Dupe");
    const first = await importLeadsFromCsv(
      { db: orgAdmin.db, admin },
      actorFor(orgAdmin.session),
      `first_name,phone\n${name},${phone}\n`,
      "first.csv"
    );
    expect(first.created).toBe(1);

    const second = await importLeadsFromCsv(
      { db: orgAdmin.db, admin },
      actorFor(orgAdmin.session),
      `first_name,phone\n${name},${phone}\n`,
      "second.csv"
    );
    expect(second.created).toBe(0);
    expect(second.merged).toBe(1);
  });

  it("skips a structurally bad row without failing the rest of the file", async () => {
    const csv = ["first_name,phone", ",", `${uniqueName("Ok")},${uniquePhone()}`].join("\n") + "\n";

    const summary = await importLeadsFromCsv({ db: orgAdmin.db, admin }, actorFor(orgAdmin.session), csv, "mixed.csv");

    expect(summary.totalRows).toBe(1);
    expect(summary.created).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].message).toMatch(/missing/i);
  });

  it("rejects a file with no name or contact column before writing anything", async () => {
    await expect(
      importLeadsFromCsv({ db: orgAdmin.db, admin }, actorFor(orgAdmin.session), "foo,bar\n1,2\n", "bad.csv")
    ).rejects.toThrow(/name column/i);
  });

  it("records integration health for the org after a successful import", async () => {
    const csv = `first_name,phone\n${uniqueName("Healthy")},${uniquePhone()}\n`;
    await importLeadsFromCsv({ db: orgAdmin.db, admin }, actorFor(orgAdmin.session), csv, "health.csv");

    const { data } = await admin.from("integration_health").select("status").eq("org_id", orgId).eq("provider", "file_upload").single();
    expect(data?.status).toBe("connected");
  });
});
