
# Wig Salon CRM — Build Plan

This is a substantial full-stack app (7 modules, auth, SMS, reconciliation). I'll build it in phases so you can review and steer between each one, rather than dumping everything in one go.

## Stack
- TanStack Start + React + Tailwind (already scaffolded)
- Lovable Cloud (Supabase) for DB + auth + storage (wig/client photos)
- Twilio connector for SMS reminders
- Recharts for dashboard charts
- shadcn components, sidebar layout

## Design direction
- Soft luxury palette: warm cream background, soft black text, muted gold accent, subtle rose undertone
- Serif display font (Cormorant) for headings + clean sans (Inter) for UI
- Generous spacing, rounded-xl cards, restrained motion
- Persistent left sidebar nav, top bar with search + user menu
- Fully responsive (sidebar collapses to drawer on mobile)

## Data model (Supabase)
- `profiles` (staff users)
- `clients` (contact, measurements jsonb, status, photo_url, preferences)
- `client_tags`
- `wigs` (catalog + status + photos[])
- `custom_orders` (wig_id, client_id, vendor, expected_date, specs)
- `service_workflows` (client_id, type: 'sale_cut'|'wash_set', wig_id, status)
- `workflow_steps` (workflow_id, step_key, status, notes, dates)
- `appointments` (client_id, workflow_id, type, starts_at, status, notes, reminders_sent jsonb)
- `repairs` (client_id, wig_id, workflow_id, vendor, dates, cost, status, work_requested)
- `payments` (client_id, date, amount, method, category, description)
- `bank_accounts` (name, type: 'bank'|'cc_processor', starting_balance)
- `bank_transactions` (account_id, date, amount, description, matched_payment_id)
- `activity_log` (client_id, type, ref_id, summary) — drives client timeline
- RLS: authenticated staff users have full access (single-tenant salon app)
- Storage buckets: `client-photos`, `wig-photos`

## Phased delivery

**Phase 1 — Foundation (this turn)**
- Enable Lovable Cloud
- Design system (palette, fonts, tokens, sidebar shell)
- Auth (email/password login + protected routes)
- Full DB schema + RLS + storage buckets
- Sidebar navigation scaffold for all 7 modules
- Dashboard with live data (today's appts, vendor wigs, low stock, revenue chart)

**Phase 2 — Core CRM**
- Clients module (list, profile, measurements, photo, tags, timeline)
- Inventory module (catalog grid, wig detail, status changes, reservation, custom orders)

**Phase 3 — Operations**
- Service workflows (Sale+Cut and Wash&Set step trackers)
- Repairs module (linked to client + workflow)
- Appointments module (calendar day/week/month, status tracking)

**Phase 4 — Money + SMS**
- Payments + bank register with running balance
- Bank reconciliation (manual entry + matching)
- Credit card processor reconciliation
- Twilio connector for SMS reminders (24h + 2h before) via scheduled server function

## Notes
- I'll generate a hero/login background image for the auth screen
- Form validation with zod + react-hook-form throughout
- SMS scheduling: cron-style server route at `/api/public/send-reminders` triggered by pg_cron every 15 min

If this looks right, approve and I'll start Phase 1. If you want to reorder phases, change the palette, or skip a module, tell me now.
