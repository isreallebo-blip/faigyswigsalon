## Add Display IDs for Clients, Vendors, and Wigs

Add permanent, auto-generated, human-readable IDs (CLT-000001, VND-000001, WIG-000001) shown throughout the app. Internal relationships already use UUIDs, so renaming is already safe — this work adds a **display layer** on top.

### Database changes (one migration)

Add a `display_id` text column to `clients`, `vendors`, `wigs`:

- New column: `display_id text UNIQUE` on each table
- Backing sequences: `clients_display_seq`, `vendors_display_seq`, `wigs_display_seq` (bigint, start 1)
- BEFORE INSERT trigger on each table: if `display_id` is null, set it to `CLT-` / `VND-` / `WIG-` + `lpad(nextval(seq)::text, 6, '0')`
- Backfill: assign IDs to all existing rows ordered by `created_at`
- Make column `NOT NULL` after backfill
- Revoke UPDATE on `display_id` via a BEFORE UPDATE trigger that raises if the value changes (immutability guarantee)

UUIDs remain the actual foreign keys — no relationship changes, no breakage.

### UI changes

**Display the ID in:**

1. **Clients list** (`src/routes/_authenticated/clients.tsx`) — new column "ID"
2. **Client profile / detail dialog** — small muted text below name
3. **Vendors list** (`src/routes/_authenticated/vendors.tsx`) — new column "ID"
4. **Vendor profile / detail dialog** — small muted text below name
5. **Inventory list** (`src/routes/_authenticated/inventory.tsx`) — show wig display_id (replaces or augments existing `wig_code`)
6. **Wig detail dialog** — small muted text
7. **Appointments list** — show client display_id next to client name
8. **Payments list** — show client display_id next to client name
9. **Repairs list** — show client + vendor + (wig if linked) display_ids
10. **Workflows list** — show client display_id
11. **Custom orders** — show client + vendor display_ids
12. **Audit log** — append display_id to `record_label` when logging client/vendor/wig actions (update `src/lib/audit.ts` callers)
13. **CSV exports** — include display_id column (audit log CSV, any other exports)

**Selectors** (`client-select.tsx`, `vendor-select.tsx`): show "CLT-000012 — Jane Doe" so they're searchable by ID.

**Global search**: there is no global search component currently — out of scope unless one exists. (Can add later.)

### Files to touch

- `supabase/migrations/...` (new) — schema + triggers + backfill
- `src/components/client-select.tsx`, `vendor-select.tsx` — show ID in label
- `src/routes/_authenticated/clients.tsx` — column + detail
- `src/routes/_authenticated/vendors.tsx` — column + detail
- `src/routes/_authenticated/inventory.tsx` — column + detail
- `src/routes/_authenticated/appointments.tsx` — show client ID
- `src/routes/_authenticated/payments.tsx` — show client ID
- `src/routes/_authenticated/repairs.tsx` — show client/vendor IDs
- `src/routes/_authenticated/workflows.tsx` — show client ID
- `src/routes/_authenticated/settings.audit-log.tsx` — show in record column + CSV
- `src/lib/audit.ts` — accept optional displayId, include in `record_label`

### Technical notes

- **Trigger-generated** rather than computed view so the ID is concrete, indexable, and exportable.
- **Sequences** guarantee monotonic, gap-free-ish numbering with no race conditions (unlike `MAX()+1`).
- **Immutability trigger** prevents anyone (including admins via SQL) from changing a display_id once assigned.
- `wig_code` already exists as a free-text field; we keep it as-is and add `display_id` as the new permanent system ID. The user can still set their own `wig_code` if desired.
- TypeScript types regenerate automatically after migration approval.

After migration is approved, I'll implement all UI changes in one pass.
