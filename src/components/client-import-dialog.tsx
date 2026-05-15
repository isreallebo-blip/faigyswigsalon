import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { toast } from "sonner";
import { Download, FileUp, Upload, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSampleCSV,
  mapHeader,
  normalizeRow,
  rowToInsert,
  rowsToCSV,
  validateRow,
  type ImportRow,
  type ImportStatus,
} from "@/lib/client-import";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function ClientImportDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");

  function reset() {
    setRows(null);
    setFileName("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    let parsed: Record<string, string>[] = [];
    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
        parsed = result.data;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        parsed = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      }
    } catch (e) {
      toast.error(`Could not read file: ${(e as Error).message}`);
      return;
    }

    if (!parsed.length) {
      toast.error("File is empty");
      return;
    }

    // Re-key columns by alias mapping
    const remapped: Record<string, string>[] = parsed.map((row) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        const mapped = mapHeader(k);
        if (mapped) out[mapped] = String(v ?? "");
      }
      return out;
    });

    // Existing emails for duplicate check
    const { data: existing } = await supabase.from("clients").select("email");
    const existingEmails = new Set(
      (existing ?? [])
        .map((r) => (r.email || "").trim().toLowerCase())
        .filter(Boolean),
    );

    const seenEmails = new Set<string>();
    const normalized = remapped.map((raw) => {
      const r = normalizeRow(raw);
      r.errors = validateRow(r, existingEmails, seenEmails);
      if (r.email) seenEmails.add(r.email);
      return r;
    });
    setRows(normalized);
  }

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const errorCount = rows?.filter((r) => r.errors.length > 0).length ?? 0;

  function updateRow(idx: number, patch: Partial<ImportRow>) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const merged = { ...next[idx], ...patch } as ImportRow;
      // re-normalize with current row + revalidate against latest emails
      const renormalized = normalizeRow({
        first_name: merged.first_name,
        last_name: merged.last_name,
        phone: merged.phone,
        email: merged.email,
        circumference: merged.circumference,
        front_to_nape: merged.front_to_nape,
        ear_to_ear: merged.ear_to_ear,
        notes: merged.notes,
        preferences: merged.preferences,
        status: merged.status,
      });
      // Validate against other rows
      const seen = new Set<string>();
      next.forEach((r, i) => {
        if (i !== idx && r.email) seen.add(r.email);
      });
      renormalized.errors = validateRow(renormalized, new Set(), seen);
      next[idx] = renormalized;
      return next;
    });
  }

  const importMut = useMutation({
    mutationFn: async () => {
      if (!rows) return { ok: 0, skipped: 0 };
      const valid = rows.filter((r) => r.errors.length === 0);
      const skipped = rows.length - valid.length;
      if (valid.length === 0) return { ok: 0, skipped };
      const payload = valid.map(rowToInsert);
      const { error } = await supabase.from("clients").insert(payload);
      if (error) throw error;
      return { ok: valid.length, skipped };
    },
    onSuccess: ({ ok, skipped }) => {
      toast.success(`${ok} client${ok === 1 ? "" : "s"} imported, ${skipped} skipped due to errors`);
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (skipped === 0) {
        reset();
        onOpenChange(false);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function downloadSample() {
    triggerDownload(buildSampleCSV(), "client-import-template.csv");
  }
  function downloadSkipped() {
    if (!rows) return;
    const skipped = rows.filter((r) => r.errors.length > 0);
    triggerDownload(rowsToCSV(skipped), "skipped-rows.csv");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Import clients</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file. Names, phones, and emails are auto-corrected. Flagged rows can be edited inline.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={downloadSample} className="gap-2">
            <Download className="h-4 w-4" /> Download template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} className="gap-2">
            <FileUp className="h-4 w-4" /> Choose file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          {rows && (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <Badge variant="secondary">{validCount} ready</Badge>
              {errorCount > 0 && <Badge variant="destructive">{errorCount} flagged</Badge>}
            </div>
          )}
        </div>

        {rows && (
          <div className="max-h-[55vh] overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-left">
                  <th className="p-2">First</th>
                  <th className="p-2">Last</th>
                  <th className="p-2">Phone</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Issue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const bad = r.errors.length > 0;
                  return (
                    <tr
                      key={idx}
                      className={bad ? "bg-destructive/10" : "border-t"}
                    >
                      <td className="p-1.5">
                        <Input
                          className="h-8"
                          value={r.first_name}
                          onChange={(e) => updateRow(idx, { first_name: e.target.value })}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          className="h-8"
                          value={r.last_name}
                          onChange={(e) => updateRow(idx, { last_name: e.target.value })}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          className="h-8 w-32"
                          value={r.phone}
                          onChange={(e) => updateRow(idx, { phone: e.target.value })}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          className="h-8"
                          value={r.email}
                          onChange={(e) => updateRow(idx, { email: e.target.value })}
                        />
                      </td>
                      <td className="p-1.5">
                        <Select
                          value={r.status}
                          onValueChange={(v) => updateRow(idx, { status: v as ImportStatus })}
                        >
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new_consultation">New consultation</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-1.5 text-destructive">
                        {bad && (
                          <span className="inline-flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {r.errors.join(", ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="gap-2">
          {errorCount > 0 && (
            <Button variant="ghost" size="sm" onClick={downloadSkipped}>
              Download skipped rows
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => importMut.mutate()}
            disabled={!rows || validCount === 0 || importMut.isPending}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {importMut.isPending ? "Importing…" : `Import ${validCount} client${validCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
