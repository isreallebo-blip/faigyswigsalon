import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoreHorizontal, UserPlus, Mail, ShieldOff } from "lucide-react";
import { useVerifiedAction } from "@/components/verification-gate";
import { adminResetLockout } from "@/lib/verification.functions";

import {
  inviteUser,
  listUsers,
  resendInvite,
  setUserRole,
  setUserStatus,
  getMyAccess,
} from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/settings/users")({
  component: UsersPage,
});

const inviteSchema = z.object({
  full_name: z.string().trim().min(1, "Required").max(120),
  email: z.string().trim().email().max(255),
  role: z.enum(["admin", "staff"]),
});
type InviteForm = z.infer<typeof inviteSchema>;

function UsersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const invite = useServerFn(inviteUser);
  const setRole = useServerFn(setUserRole);
  const setStatus = useServerFn(setUserStatus);
  const resend = useServerFn(resendInvite);
  const access = useServerFn(getMyAccess);
  const resetLockout = useServerFn(adminResetLockout);
  const verify = useVerifiedAction();

  const meQ = useQuery({ queryKey: ["my-access"], queryFn: () => access() });
  const usersQ = useQuery({ queryKey: ["users"], queryFn: () => list() });
  const me = meQ.data;

  const [open, setOpen] = useState(false);
  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { full_name: "", email: "", role: "staff" },
  });

  const inviteMut = useMutation({
    mutationFn: (data: InviteForm) => invite({ data }),
    onSuccess: () => {
      toast.success("Invitation sent");
      setOpen(false);
      form.reset();
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to invite"),
  });

  const roleMut = useMutation({
    mutationFn: (vars: { user_id: string; role: "admin" | "staff" }) => setRole({ data: vars }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const statusMut = useMutation({
    mutationFn: (vars: { user_id: string; status: "active" | "disabled" }) =>
      setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resendMut = useMutation({
    mutationFn: (user_id: string) => resend({ data: { user_id } }),
    onSuccess: () => toast.success("Invitation resent"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resetLockoutMut = useMutation({
    mutationFn: (user_id: string) => resetLockout({ data: { userId: user_id, subject: "staff" } }),
    onSuccess: () => toast.success("Lockout reset"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div>
      {verify.gate}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl">Users</h2>
          <p className="text-sm text-muted-foreground">
            Invite teammates and manage roles for your salon.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite user
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a new user</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={form.handleSubmit((d) => inviteMut.mutate(d))}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" {...form.register("full_name")} />
                {form.formState.errors.full_name && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.full_name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register("email")} />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={form.watch("role")}
                  onValueChange={(v) => form.setValue("role", v as "admin" | "staff")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={inviteMut.isPending}>
                  {inviteMut.isPending ? "Sending…" : "Send invitation"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : (usersQ.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  No users yet.
                </TableCell>
              </TableRow>
            ) : (
              (usersQ.data ?? []).map((u) => {
                const isMe = me?.userId === u.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.full_name || "—"} {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={isMe || u.role === "admin"}
                            onClick={() => roleMut.mutate({ user_id: u.id, role: "admin" })}
                          >
                            Make admin
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isMe || u.role === "staff"}
                            onClick={() => roleMut.mutate({ user_id: u.id, role: "staff" })}
                          >
                            Make staff
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {u.status === "invited" && (
                            <DropdownMenuItem onClick={() => resendMut.mutate(u.id)}>
                              <Mail className="h-4 w-4 mr-2" />
                              Resend invitation
                            </DropdownMenuItem>
                          )}
                          {u.status !== "disabled" ? (
                            <DropdownMenuItem
                              disabled={isMe}
                              onClick={() => statusMut.mutate({ user_id: u.id, status: "disabled" })}
                              className="text-destructive"
                            >
                              Disable user
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => statusMut.mutate({ user_id: u.id, status: "active" })}
                            >
                              Re-enable user
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "invited" | "disabled" }) {
  const variants: Record<typeof status, { className: string; label: string }> = {
    active: { className: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100", label: "Active" },
    invited: { className: "bg-amber-100 text-amber-900 hover:bg-amber-100", label: "Invited" },
    disabled: { className: "bg-muted text-muted-foreground hover:bg-muted", label: "Disabled" },
  };
  const v = variants[status];
  return <Badge className={v.className}>{v.label}</Badge>;
}
