/**
 * Pure CSV parsing for bulk lead import. No I/O — takes the file's text,
 * returns structured rows plus per-row problems the caller can show.
 *
 * RFC4180-ish: quoted fields may contain the delimiter, newlines and doubled
 * quotes (`""`). The delimiter itself is sniffed from the header line (comma,
 * tab or semicolon) so a sheet copy-pasted as tab-separated text works without
 * the uploader having to convert it. Column names are matched
 * case-insensitively and ignoring spaces/underscores/dashes, so "First Name",
 * "first_name" and "FirstName" are all the same column — unrecognized columns
 * (survey answers, CRM-internal status fields, an export tool's own columns)
 * are simply ignored.
 */

export interface ParsedLeadRow {
  /** 1-based; the header is row 1, so the first data row is 2 (matches what a spreadsheet shows). */
  rowNumber: number;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  /** Raw text from a "source" column, if there was one — not yet matched against LEAD_SOURCES. */
  source: string | null;
  tags: string[];
  /** Raw text from a "priority" column, lowercased — not yet validated against the enum. */
  priority: string | null;
  value: number | null;
}

export interface CsvRowError {
  rowNumber: number;
  message: string;
}

export interface CsvParseResult {
  rows: ParsedLeadRow[];
  errors: CsvRowError[];
}

type Field = "firstName" | "lastName" | "name" | "phone" | "email" | "source" | "tags" | "priority" | "value";

const COLUMN_ALIASES: Record<string, Field> = {
  firstname: "firstName",
  first: "firstName",
  name: "name",
  fullname: "name",
  lastname: "lastName",
  last: "lastName",
  surname: "lastName",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  mobilenumber: "phone",
  contactnumber: "phone",
  email: "email",
  emailaddress: "email",
  emailid: "email",
  workemail: "email",
  personalemail: "email",
  contactemail: "email",
  source: "source",
  leadsource: "source",
  tags: "tags",
  priority: "priority",
  value: "value",
  dealvalue: "value",
  expectedvalue: "value",
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const CANDIDATE_DELIMITERS = ["\t", ",", ";"] as const;

/** Whichever of tab / comma / semicolon appears most in the header line wins; comma if none do. */
function detectDelimiter(text: string): string {
  const newlineAt = text.search(/\r\n|\r|\n/);
  const headerLine = newlineAt === -1 ? text : text.slice(0, newlineAt);
  let best: string = ",";
  let bestCount = 0;
  for (const d of CANDIDATE_DELIMITERS) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Splits CSV text into rows of raw string cells. Handles quoted fields, embedded newlines, CRLF, and a BOM. */
function tokenize(rawText: string, delimiter: string): string[][] {
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyContent = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAnyContent = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      sawAnyContent = true;
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
    if (c.trim()) sawAnyContent = true;
  }
  if (field.length > 0 || row.length > 0) row.push(field);
  if (row.length > 0 && !(row.length === 1 && row[0] === "")) rows.push(row);

  return sawAnyContent ? rows : [];
}

/** Strips a leading "p:" some export tools (Meta/Messenger lead forms) put on phone numbers. */
function cleanPhone(raw: string): string {
  return raw.replace(/^\s*p\s*:\s*/i, "").trim();
}

const MAX_ROWS_DEFAULT = 2000;

export function parseLeadCsv(text: string, opts: { maxRows?: number } = {}): CsvParseResult {
  const maxRows = opts.maxRows ?? MAX_ROWS_DEFAULT;
  const table = tokenize(text, detectDelimiter(text));

  if (table.length === 0) {
    return { rows: [], errors: [{ rowNumber: 1, message: "The file is empty." }] };
  }

  const columnOf = new Map<Field, number>();
  table[0].forEach((header, i) => {
    const field = COLUMN_ALIASES[normalizeHeader(header)];
    if (field && !columnOf.has(field)) columnOf.set(field, i);
  });

  const hasName = columnOf.has("firstName") || columnOf.has("name");
  const hasContact = columnOf.has("phone") || columnOf.has("email");
  if (!hasName) {
    return { rows: [], errors: [{ rowNumber: 1, message: 'No name column found. Include a "first_name" or "name" column.' }] };
  }
  if (!hasContact) {
    return { rows: [], errors: [{ rowNumber: 1, message: 'No phone or email column found. Include a "phone" and/or "email" column.' }] };
  }

  const dataRows = table.slice(1);
  const truncated = dataRows.length > maxRows;
  const rows: ParsedLeadRow[] = [];
  const errors: CsvRowError[] = [];

  dataRows.slice(0, maxRows).forEach((cells, i) => {
    const rowNumber = i + 2;
    if (cells.length === 1 && cells[0].trim() === "") return; // blank line

    const get = (field: Field): string | undefined => {
      const idx = columnOf.get(field);
      const raw = idx === undefined ? undefined : cells[idx];
      const trimmed = raw?.trim();
      return trimmed ? trimmed : undefined;
    };

    let firstName = get("firstName");
    let lastName = get("lastName");
    if (!firstName) {
      const full = get("name");
      if (full) {
        const parts = full.split(/\s+/);
        firstName = parts.shift();
        if (!lastName && parts.length > 0) lastName = parts.join(" ");
      }
    }

    const phoneRaw = get("phone");
    const phone = phoneRaw ? cleanPhone(phoneRaw) || null : null;
    const email = get("email") ?? null;

    if (!firstName) {
      errors.push({ rowNumber, message: "Missing name." });
      return;
    }
    if (!phone && !email) {
      errors.push({ rowNumber, message: "Missing both phone and email." });
      return;
    }

    const valueRaw = get("value");
    const valueStripped = valueRaw ? valueRaw.replace(/[^0-9.]/g, "") : "";
    const valueNumber = valueStripped ? Number(valueStripped) : NaN;
    const value = Number.isFinite(valueNumber) && valueNumber >= 0 ? valueNumber : null;

    rows.push({
      rowNumber,
      firstName,
      lastName: lastName ?? null,
      phone,
      email,
      source: get("source") ?? null,
      tags: (get("tags") ?? "")
        .split(/[;,]/)
        .map((t) => t.trim())
        .filter(Boolean),
      priority: get("priority")?.toLowerCase() ?? null,
      value,
    });
  });

  if (truncated) {
    errors.push({
      rowNumber: maxRows + 2,
      message: `Only the first ${maxRows} rows were read; the rest of the file was skipped.`,
    });
  }

  return { rows, errors };
}
