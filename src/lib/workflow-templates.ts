import type { Database } from "@/integrations/supabase/types";

export type WorkflowType = Database["public"]["Enums"]["workflow_type"];

export type StepTemplate = { key: string; label: string };

export const WORKFLOW_STEPS: Record<WorkflowType, StepTemplate[]> = {
  sale_cut: [
    { key: "consultation", label: "Consultation & measurements" },
    { key: "select_wig", label: "Select wig" },
    { key: "fitting", label: "Fitting" },
    { key: "cut_style", label: "Cut & style" },
    { key: "final_pickup", label: "Final pickup" },
  ],
  wash_set: [
    { key: "drop_off", label: "Drop off" },
    { key: "wash", label: "Wash" },
    { key: "set", label: "Set & style" },
    { key: "ready", label: "Ready for pickup" },
    { key: "pickup", label: "Picked up" },
  ],
};

export const WORKFLOW_LABEL: Record<WorkflowType, string> = {
  sale_cut: "Sale + Cut",
  wash_set: "Wash & Set",
};
