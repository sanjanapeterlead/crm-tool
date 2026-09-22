import { describe, expect, it } from "vitest";
import { parseLeadCsv } from "@/lib/domain/csv-import";

describe("parseLeadCsv", () => {
  it("parses a well-formed file with aliased headers", () => {
    const csv = "First Name,Last Name,Phone,Email,Source\nRohan,Mehta,9876543210,rohan@example.com,Referral\n";
    const { rows, errors } = parseLeadCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { rowNumber: 2, firstName: "Rohan", lastName: "Mehta", phone: "9876543210", email: "rohan@example.com", source: "Referral", tags: [], priority: null, value: null },
    ]);
  });

  it("splits a single 'name' column when there's no first/last split", () => {
    const csv = "name,phone\nKaran Singh Rathore,9000000001\n";
    const { rows } = parseLeadCsv(csv);
    expect(rows[0].firstName).toBe("Karan");
    expect(rows[0].lastName).toBe("Singh Rathore");
  });

  it("handles quoted fields with embedded commas, quotes and newlines", () => {
    const csv = 'first_name,phone,tags\n"Priya, the ""VIP"" lead",9000000002,"hot, follow-up"\n';
    const { rows } = parseLeadCsv(csv);
    expect(rows[0].firstName).toBe('Priya, the "VIP" lead');
    expect(rows[0].tags).toEqual(["hot", "follow-up"]);
  });

  it("requires a name column", () => {
    const csv = "phone,email\n9000000003,a@example.com\n";
    const { rows, errors } = parseLeadCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0].message).toMatch(/name column/);
  });

  it("requires a phone or email column", () => {
    const csv = "first_name\nAsha\n";
    const { rows, errors } = parseLeadCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0].message).toMatch(/phone or email/);
  });

  it("skips a row missing both a name and any contact info, with a per-row error", () => {
    const csv = "first_name,phone\nVikram,9000000004\n,\nAnanya,9000000005\n";
    const { rows, errors } = parseLeadCsv(csv);
    expect(rows.map((r) => r.firstName)).toEqual(["Vikram", "Ananya"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].rowNumber).toBe(3);
  });

  it("ignores blank lines", () => {
    const csv = "first_name,phone\nVikram,9000000004\n\n\nAnanya,9000000005\n";
    const { rows, errors } = parseLeadCsv(csv);
    expect(rows).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it("parses a numeric deal value and drops a non-numeric one", () => {
    const csv = "first_name,phone,value\nRohan,9000000006,45000\nMeera,9000000007,not-a-number\n";
    const { rows } = parseLeadCsv(csv);
    expect(rows[0].value).toBe(45000);
    expect(rows[1].value).toBeNull();
  });

  it("reports an empty file", () => {
    const { rows, errors } = parseLeadCsv("");
    expect(rows).toEqual([]);
    expect(errors[0].message).toMatch(/empty/);
  });

  it("truncates beyond maxRows and reports it", () => {
    const lines = ["first_name,phone"];
    for (let i = 0; i < 5; i++) lines.push(`Lead${i},900000000${i}`);
    const csv = lines.join("\n") + "\n";
    const { rows, errors } = parseLeadCsv(csv, { maxRows: 3 });
    expect(rows).toHaveLength(3);
    expect(errors[errors.length - 1].message).toMatch(/first 3 rows/);
  });

  it("strips a UTF-8 BOM", () => {
    const csv = "﻿first_name,phone\nRohan,9000000008\n";
    const { rows, errors } = parseLeadCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0].firstName).toBe("Rohan");
  });

  it("auto-detects a tab-separated file (a sheet pasted as text) and ignores unmapped columns", () => {
    const tsv = [
      ["biggest_bottleneck", "full_name", "work_email", "phone_number", "STATUS", "NOTES"].join("\t"),
      ["not_booking_enough_calls", "Sunny jain", "sunny@example.com", "p:+919899346024", "CREATED", "Called thrice, no pick"].join("\t"),
    ].join("\n");
    const { rows, errors } = parseLeadCsv(tsv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        rowNumber: 2,
        firstName: "Sunny",
        lastName: "jain",
        phone: "+919899346024", // the "p:" prefix an export tool put on it is stripped
        email: "sunny@example.com",
        source: null,
        tags: [],
        priority: null,
        value: null,
      },
    ]);
  });

  it("matches 'work_email' and doesn't choke on a trailing 'p:' with nothing after it", () => {
    const csv = "full_name,work_email,phone_number\nAsha Rao,asha@example.com,p:\n";
    const { rows } = parseLeadCsv(csv);
    expect(rows[0].email).toBe("asha@example.com");
    expect(rows[0].phone).toBeNull();
  });
});
