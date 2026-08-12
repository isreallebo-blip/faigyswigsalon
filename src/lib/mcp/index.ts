import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchClients from "./tools/search-clients";
import getClient from "./tools/get-client";
import listAppointments from "./tools/list-appointments";
import listRepairs from "./tools/list-repairs";
import listPayments from "./tools/list-payments";
import addClientNote from "./tools/add-client-note";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "faigy-s-wig-salon",
  title: "Faigy's Wig Salon",
  version: "0.1.0",
  instructions:
    "Tools for Faigy's Wig Salon staff CRM. Look up clients with `search_clients`, then use the returned client id with `get_client`, `list_payments`, or `add_client_note`. Use `list_appointments` for the schedule and `list_repairs` for vendor repair jobs. All tools act as the signed-in staff user and respect their permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchClients, getClient, listAppointments, listRepairs, listPayments, addClientNote],
});
