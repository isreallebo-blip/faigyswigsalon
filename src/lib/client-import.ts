// Normalization & validation helpers for client mass import + manual entry.

export function capitalizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w
        .split("-")
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
        .join("-"),
    )
    .join(" ");
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** Strip non-digits, drop leading "1" if 11 digits. */
export function digitsOnly(input: string): string {
  const d = (input || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d;
}

/** Format full 10-digit phone as 111-111-1111. Returns "" for empty input. */
export function formatPhone(input: string): string {
  const d = digitsOnly(input);
  if (!d) return "";
  if (d.length !== 10) return d; // leave raw for validation to flag
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Live formatter for typing — inserts dashes after 3rd & 6th digit. */
export function formatPhoneTyping(input: string): string {
  const d = digitsOnly(input).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export type ImportStatus = "new_consultation" | "active" | "inactive";

export function normalizeStatus(input: string | undefined): ImportStatus {
  const s = (input || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "active") return "active";
  if (s === "inactive") return "inactive";
  return "new_consultation";
}

export type ImportRow = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  circumference: string;
  front_to_nape: string;
  ear_to_ear: string;
  notes: string;
  preferences: string;
  status: ImportStatus;
  errors: string[];
};

const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  "first name": "first_name",
  firstname: "first_name",
  "last name": "last_name",
  lastname: "last_name",
  surname: "last_name",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  email: "email",
  "e-mail": "email",
  "head circumference": "circumference",
  circumference: "circumference",
  "front to nape": "front_to_nape",
  "ear to ear": "ear_to_ear",
  notes: "notes",
  "wig preferences": "preferences",
  preferences: "preferences",
  status: "status",
};

export function mapHeader(h: string): keyof ImportRow | null {
  const k = h.trim().toLowerCase();
  return HEADER_ALIASES[k] ?? null;
}

export function normalizeRow(raw: Record<string, string>): ImportRow {
  const first_name = capitalizeName(raw.first_name || "");
  const last_name = capitalizeName(raw.last_name || "");
  const phone = formatPhone(raw.phone || "");
  const email = normalizeEmail(raw.email || "");
  return {
    first_name,
    last_name,
    phone,
    email,
    circumference: (raw.circumference || "").trim(),
    front_to_nape: (raw.front_to_nape || "").trim(),
    ear_to_ear: (raw.ear_to_ear || "").trim(),
    notes: (raw.notes || "").trim(),
    preferences: (raw.preferences || "").trim(),
    status: normalizeStatus(raw.status),
    errors: [],
  };
}

export function validateRow(row: ImportRow, existingEmails: Set<string>, seenEmails: Set<string>): string[] {
  const errs: string[] = [];
  if (!row.first_name && !row.last_name) errs.push("Missing name");
  if (row.phone) {
    const d = digitsOnly(row.phone);
    if (d.length !== 10) errs.push("Phone must be 10 digits");
  }
  if (row.email) {
    if (!row.email.includes("@")) errs.push("Email missing @");
    else if (existingEmails.has(row.email)) errs.push("Email already in database");
    else if (seenEmails.has(row.email)) errs.push("Duplicate email in file");
  }
  return errs;
}

export function rowToInsert(row: ImportRow) {
  const measurements: Record<string, number> = {};
  const c = parseFloat(row.circumference);
  const f = parseFloat(row.front_to_nape);
  const e = parseFloat(row.ear_to_ear);
  if (!Number.isNaN(c) && c > 0) measurements.circumference = c;
  if (!Number.isNaN(f) && f > 0) measurements.front_to_nape = f;
  if (!Number.isNaN(e) && e > 0) measurements.ear_to_ear = e;
  return {
    full_name: `${row.first_name} ${row.last_name}`.trim(),
    phone: row.phone || null,
    email: row.email || null,
    status: row.status,
    notes: row.notes || null,
    preferences: row.preferences || null,
    measurements,
  };
}

export const SAMPLE_TEMPLATE_HEADERS = [
  "First Name",
  "Last Name",
  "Phone",
  "Email",
  "Head Circumference",
  "Front to Nape",
  "Ear to Ear",
  "Notes",
  "Wig Preferences",
  "Status",
];

export const SAMPLE_TEMPLATE_ROWS: string[][] = [
  ["Sarah", "Cohen", "917-555-1234", "sarah@example.com", "22", "13", "12", "Prefers shoulder length", "Human hair, dark brown", "active"],
  ["Rivka", "Levy", "(347) 555 9821", "rivka@example.com", "21.5", "12.5", "11.5", "", "Lace top", "new_consultation"],
];

export function buildSampleCSV(): string {
  const lines = [SAMPLE_TEMPLATE_HEADERS, ...SAMPLE_TEMPLATE_ROWS]
    .map((row) => row.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
    .join("\n");
  return lines + "\n";
}

export function rowsToCSV(rows: ImportRow[]): string {
  const headers = [...SAMPLE_TEMPLATE_HEADERS, "Errors"];
  const data = rows.map((r) => [
    r.first_name,
    r.last_name,
    r.phone,
    r.email,
    r.circumference,
    r.front_to_nape,
    r.ear_to_ear,
    r.notes,
    r.preferences,
    r.status,
    r.errors.join("; "),
  ]);
  return [headers, ...data]
    .map((row) => row.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
    .join("\n") + "\n";
}
