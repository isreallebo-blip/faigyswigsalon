import { useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Search,
  MoreVertical,
  FileText,
  FileSpreadsheet,
  FileImage,
  File as FileIcon,
  Download,
  Pencil,
  Tag,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logAudit } from "@/lib/audit";
import { hebrewDateString } from "@/lib/hebrew-calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClientFile = Database["public"]["Tables"]["client_files"]["Row"];
type Category = Database["public"]["Enums"]["client_file_category"];

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "photo_before", label: "Photo — before" },
  { value: "photo_after", label: "Photo — after" },
  { value: "consent_form", label: "Consent form" },
  { value: "measurements", label: "Measurements" },
  { value: "insurance_medical", label: "Insurance / Medical" },
  { value: "invoice_receipt", label: "Invoice / Receipt" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<
  Category,
  string
>;

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv";

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function isImage(mime: string | null) {
  return !!mime && mime.startsWith("image/");
}

function fileIconFor(mime: string | null) {
  if (isImage(mime)) return <FileImage className="h-6 w-6" />;
  if (mime === "application/pdf") return <FileText className="h-6 w-6" />;
  if (mime?.includes("sheet") || mime?.includes("excel") || mime === "text/csv")
    return <FileSpreadsheet className="h-6 w-6" />;
  if (mime?.includes("word") || mime === "text/plain") return <FileText className="h-6 w-6" />;
  return <FileIcon className="h-6 w-6" />;
}

async function signedUrl(path: string, expires = 60) {
  const { data } = await supabase.storage.from("client-files").createSignedUrl(path, expires);
  return data?.signedUrl ?? null;
}

function useSignedThumb(path: string, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!enabled) return;
    signedUrl(path, 300).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [path, enabled]);
  return url;
}

export function ClientFilesCount({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ["client-files", clientId, "count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("client_files")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data ?? 0;
}

export function ClientFilesTab({
  clientId,
  clientDisplayId,
}: {
  clientId: string;
  clientDisplayId: string | null;
}) {
  const qc = useQueryClient();
  const [openUpload, setOpenUpload] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<Category | "all">("all");

  const filesQ = useQuery({
    queryKey: ["client-files", clientId, "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_files")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ClientFile[];
    },
  });

  // Fetch uploader names
  const uploaderIds = useMemo(
    () => Array.from(new Set((filesQ.data ?? []).map((f) => f.uploaded_by).filter(Boolean))) as string[],
    [filesQ.data],
  );
  const profilesQ = useQuery({
    queryKey: ["profiles", "by-ids", uploaderIds.sort().join(",")],
    queryFn: async () => {
      if (uploaderIds.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", uploaderIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name ?? p.email ?? "—"]));
    },
    enabled: uploaderIds.length > 0,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (filesQ.data ?? []).filter((f) => {
      if (filterCat !== "all" && f.category !== filterCat) return false;
      if (s && !f.display_name.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [filesQ.data, search, filterCat]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["client-files", clientId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files"
            className="pl-9"
          />
        </div>
        <Select value={filterCat} onValueChange={(v) => setFilterCat(v as Category | "all")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="gap-2" onClick={() => setOpenUpload(true)}>
          <Upload className="h-4 w-4" /> Upload File
        </Button>
      </div>

      {filesQ.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filesQ.data?.length ? "No files match your search." : "No files uploaded yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              uploaderName={(f.uploaded_by && profilesQ.data?.[f.uploaded_by]) || "—"}
              clientDisplayId={clientDisplayId}
              onChanged={invalidate}
            />
          ))}
        </div>
      )}

      <UploadDialog
        open={openUpload}
        onOpenChange={setOpenUpload}
        clientId={clientId}
        clientDisplayId={clientDisplayId}
        onUploaded={invalidate}
      />
    </div>
  );
}

function FileCard({
  file,
  uploaderName,
  clientDisplayId,
  onChanged,
}: {
  file: ClientFile;
  uploaderName: string;
  clientDisplayId: string | null;
  onChanged: () => void;
}) {
  const [editOpen, setEditOpen] = useState<null | "rename" | "category" | "notes">(null);
  const [delOpen, setDelOpen] = useState(false);
  const thumb = useSignedThumb(file.storage_path, isImage(file.mime_type));

  const open = async () => {
    const u = await signedUrl(file.storage_path, 60);
    if (u) window.open(u, "_blank", "noopener,noreferrer");
    else toast.error("Could not generate file link");
  };

  const del = useMutation({
    mutationFn: async () => {
      await supabase.storage.from("client-files").remove([file.storage_path]);
      const { error } = await supabase.from("client_files").delete().eq("id", file.id);
      if (error) throw error;
      await logAudit({
        action: "delete",
        module: "client",
        recordId: file.client_id,
        displayId: clientDisplayId,
        summary: `Deleted file ${file.display_name} from client ${clientDisplayId ?? ""}`.trim(),
        before: file as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success("File deleted");
      setDelOpen(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const created = new Date(file.created_at);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <button
            onClick={open}
            className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground"
            aria-label="Open file"
          >
            {thumb ? (
              <img src={thumb} alt={file.display_name} className="h-full w-full object-cover" />
            ) : (
              fileIconFor(file.mime_type)
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={open}
                className="truncate text-left text-sm font-medium hover:underline"
                title={file.display_name}
              >
                {file.display_name}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={open}>
                    <Download className="mr-2 h-4 w-4" /> View / Download
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEditOpen("rename")}>
                    <Pencil className="mr-2 h-4 w-4" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEditOpen("category")}>
                    <Tag className="mr-2 h-4 w-4" /> Edit category
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEditOpen("notes")}>
                    <StickyNote className="mr-2 h-4 w-4" /> Edit notes
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDelOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {CATEGORY_LABEL[file.category]}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {formatBytes(file.file_size_bytes)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {format(created, "MMM d, yyyy")} · {hebrewDateString(created)} · {uploaderName}
            </div>
            {file.notes && (
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{file.notes}</p>
            )}
          </div>
        </div>
      </CardContent>

      <EditFileDialog
        file={file}
        mode={editOpen}
        onOpenChange={(o) => !o && setEditOpen(null)}
        clientDisplayId={clientDisplayId}
        onSaved={onChanged}
      />

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{file.display_name}</strong>? This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                del.mutate();
              }}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  clientId,
  clientDisplayId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  clientDisplayId: string | null;
  onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  const reset = () => {
    setFile(null);
    setDisplayName("");
    setCategory("other");
    setNotes("");
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const onPick = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error("File exceeds 25MB limit");
      return;
    }
    setFile(f);
    setDisplayName((prev) => prev || f.name);
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pick a file first");
      if (!displayName.trim()) throw new Error("File name required");
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");

      setProgress(10);
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const path = `${clientId}/${crypto.randomUUID()}-${safeBase}${ext && !safeBase.endsWith(ext) ? "" : ""}`;
      const { error: upErr } = await supabase.storage
        .from("client-files")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      setProgress(80);

      const { data: row, error } = await supabase
        .from("client_files")
        .insert({
          client_id: clientId,
          storage_path: path,
          display_name: displayName.trim(),
          category,
          notes: notes.trim() || null,
          file_size_bytes: file.size,
          mime_type: file.type || null,
          uploaded_by: uid,
        })
        .select("*")
        .single();
      if (error) {
        await supabase.storage.from("client-files").remove([path]);
        throw error;
      }
      setProgress(100);

      await logAudit({
        action: "create",
        module: "client",
        recordId: clientId,
        displayId: clientDisplayId,
        summary: `Uploaded file ${row.display_name} (${CATEGORY_LABEL[category]}) to client ${clientDisplayId ?? ""}`.trim(),
        after: row as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success("File uploaded");
      onUploaded();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      setProgress(null);
      toast.error(e.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload file</DialogTitle>
          <DialogDescription>Max 25MB. Visible to staff only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">File</Label>
            <div className="mt-1.5">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
              {file && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {file.name} · {formatBytes(file.size)}
                </p>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              File name
            </Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Before photo June 2026"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Category
            </Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context"
              rows={2}
              className="mt-1.5"
            />
          </div>
          {progress !== null && <Progress value={progress} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button onClick={() => upload.mutate()} disabled={upload.isPending || !file}>
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditFileDialog({
  file,
  mode,
  onOpenChange,
  clientDisplayId,
  onSaved,
}: {
  file: ClientFile;
  mode: null | "rename" | "category" | "notes";
  onOpenChange: (o: boolean) => void;
  clientDisplayId: string | null;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(file.display_name);
  const [category, setCategory] = useState<Category>(file.category);
  const [notes, setNotes] = useState(file.notes ?? "");

  useEffect(() => {
    if (mode) {
      setDisplayName(file.display_name);
      setCategory(file.category);
      setNotes(file.notes ?? "");
    }
  }, [mode, file]);

  const save = useMutation({
    mutationFn: async () => {
      const patch: Partial<ClientFile> = {};
      let summary = "";
      if (mode === "rename") {
        if (!displayName.trim()) throw new Error("Name required");
        patch.display_name = displayName.trim();
        summary = `Renamed file ${file.display_name} to ${patch.display_name} for client ${clientDisplayId ?? ""}`.trim();
      } else if (mode === "category") {
        patch.category = category;
        summary = `Changed category of ${file.display_name} to ${CATEGORY_LABEL[category]} for client ${clientDisplayId ?? ""}`.trim();
      } else if (mode === "notes") {
        patch.notes = notes.trim() || null;
        summary = `Updated notes on file ${file.display_name} for client ${clientDisplayId ?? ""}`.trim();
      }
      const { data, error } = await supabase
        .from("client_files")
        .update(patch)
        .eq("id", file.id)
        .select("*")
        .single();
      if (error) throw error;
      await logAudit({
        action: "update",
        module: "client",
        recordId: file.client_id,
        displayId: clientDisplayId,
        summary,
        before: file as unknown as Record<string, unknown>,
        after: data as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!mode} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "rename" ? "Rename file" : mode === "category" ? "Edit category" : "Edit notes"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {mode === "rename" && (
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
          )}
          {mode === "category" && (
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {mode === "notes" && (
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Optional notes"
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
