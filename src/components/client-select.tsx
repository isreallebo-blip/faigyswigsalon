import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function useClientOptions() {
  return useQuery({
    queryKey: ["clients", "options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });
}

export function ClientSelect({
  value,
  onChange,
  placeholder = "Select client…",
}: {
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const { data } = useClientOptions();
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {data?.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
