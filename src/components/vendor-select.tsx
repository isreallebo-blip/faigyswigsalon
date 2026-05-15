import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type VendorType = Database["public"]["Enums"]["vendor_type"];

export function useVendorOptions(filterType?: "supplier" | "repair") {
  return useQuery({
    queryKey: ["vendors", "options", filterType ?? "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, name, type, status, display_id")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      if (!filterType) return data;
      return data.filter((v) => v.type === filterType || v.type === "both");
    },
  });
}

const NONE = "__none__";

export function VendorSelect({
  value,
  onChange,
  filterType,
  placeholder = "Select vendor…",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  filterType?: "supplier" | "repair";
  placeholder?: string;
}) {
  const { data } = useVendorOptions(filterType);
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {data?.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            <span className="font-mono text-[10px] text-muted-foreground mr-2">{v.display_id}</span>
            {v.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type { VendorType };
