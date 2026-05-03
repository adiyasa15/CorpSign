import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  Package, Users, UserCheck, Plus, Pencil, Trash2, Play, Pause, Eye,
  Loader2, Building2, CheckCircle, XCircle, Clock, ArrowUpCircle,
} from "lucide-react";

type PackageType = "free_trial" | "subscribed" | "custom";

interface PkgRow {
  id: number;
  name: string;
  description: string | null;
  type: PackageType;
  maxDocuments: number | null;
  maxSignersPerDoc: number | null;
  maxUploadMb: number;
  maxUploaderUsers: number;
  maxTotalUsers: number;
  activeDays: number;
  isActive: boolean;
  createdAt: string;
}

interface GroupRow {
  id: number;
  name: string;
  companyName: string | null;
  packageId: number | null;
  isActive: boolean;
  expiresAt: string | null;
  activatedAt: string | null;
  memberCount: number;
  package: PkgRow | null;
  createdAt: string;
}

interface MemberRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  isGroupOwner: boolean;
  pendingApproval: boolean;
  createdAt: string;
}

interface PendingUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  companyName: string | null;
  role: string;
  isActive: boolean;
  groupId: number | null;
  pendingApproval: boolean;
  createdAt: string;
  groupName?: string;
  groupType?: PackageType;
}

interface FreeTrialUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  companyName: string | null;
  role: string;
  isActive: boolean;
  pendingApproval: boolean;
  groupId: number | null;
  groupName: string | null;
  packageId: number | null;
  createdAt: string;
}

const TYPE_LABELS: Record<PackageType, string> = {
  free_trial: "Free Trial",
  subscribed: "Subscribed",
  custom: "Custom",
};

const TYPE_COLORS: Record<PackageType, string> = {
  free_trial: "bg-blue-100 text-blue-800",
  subscribed: "bg-green-100 text-green-800",
  custom: "bg-purple-100 text-purple-800",
};

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Provisioning() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [packages, setPackages] = useState<PkgRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [freeTrialUsers, setFreeTrialUsers] = useState<FreeTrialUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [pkgDialog, setPkgDialog] = useState<{ open: boolean; editing: PkgRow | null }>({ open: false, editing: null });
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; editing: GroupRow | null }>({ open: false, editing: null });
  const [membersDialog, setMembersDialog] = useState<{ open: boolean; group: GroupRow | null; members: MemberRow[] }>({ open: false, group: null, members: [] });
  const [upgradeDialog, setUpgradeDialog] = useState<{ open: boolean; user: FreeTrialUser | null; selectedGroupId: string }>({ open: false, user: null, selectedGroupId: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(false);

  const [pkgForm, setPkgForm] = useState({
    name: "", description: "", type: "free_trial" as PackageType,
    maxDocuments: "5", maxSignersPerDoc: "5", maxUploadMb: "5",
    maxUploaderUsers: "1", maxTotalUsers: "1", activeDays: "14", isActive: true,
  });

  const [groupForm, setGroupForm] = useState({
    name: "", companyName: "", packageId: "",
  });

  useEffect(() => {
    if (user && user.role !== "superadmin") setLocation("/");
  }, [user, setLocation]);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pkgRes, grpRes, pendRes, ftRes] = await Promise.all([
        fetch("/api/packages", { credentials: "include" }),
        fetch("/api/user-groups", { credentials: "include" }),
        fetch("/api/users/pending", { credentials: "include" }),
        fetch("/api/user-groups/free-trial-users", { credentials: "include" }),
      ]);
      const [pkgData, grpData, pendData, ftData] = await Promise.all([pkgRes.json(), grpRes.json(), pendRes.json(), ftRes.json()]);

      setPackages(Array.isArray(pkgData) ? pkgData : []);
      setGroups(Array.isArray(grpData) ? grpData : []);
      setFreeTrialUsers(Array.isArray(ftData) ? ftData : []);

      if (Array.isArray(pendData)) {
        const allGroups: GroupRow[] = Array.isArray(grpData) ? grpData : [];
        const enriched = pendData.map((u: PendingUser) => {
          if (u.groupId) {
            const g = allGroups.find((g) => g.id === u.groupId);
            return { ...u, groupName: g?.name, groupType: g?.package?.type };
          }
          return u;
        });
        setPendingUsers(enriched);
      }
    } catch {
      toast({ title: "Failed to load provisioning data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openNewPackage = () => {
    setPkgForm({ name: "", description: "", type: "free_trial", maxDocuments: "5", maxSignersPerDoc: "5", maxUploadMb: "5", maxUploaderUsers: "1", maxTotalUsers: "1", activeDays: "14", isActive: true });
    setPkgDialog({ open: true, editing: null });
  };

  const openEditPackage = (pkg: PkgRow) => {
    setPkgForm({
      name: pkg.name, description: pkg.description ?? "", type: pkg.type,
      maxDocuments: pkg.maxDocuments != null ? String(pkg.maxDocuments) : "",
      maxSignersPerDoc: pkg.maxSignersPerDoc != null ? String(pkg.maxSignersPerDoc) : "",
      maxUploadMb: String(pkg.maxUploadMb),
      maxUploaderUsers: String(pkg.maxUploaderUsers),
      maxTotalUsers: String(pkg.maxTotalUsers),
      activeDays: String(pkg.activeDays),
      isActive: pkg.isActive,
    });
    setPkgDialog({ open: true, editing: pkg });
  };

  const savePkg = async () => {
    setIsSaving(true);
    try {
      const body = {
        name: pkgForm.name,
        description: pkgForm.description || undefined,
        type: pkgForm.type,
        maxDocuments: pkgForm.maxDocuments ? Number(pkgForm.maxDocuments) : null,
        maxSignersPerDoc: pkgForm.maxSignersPerDoc ? Number(pkgForm.maxSignersPerDoc) : null,
        maxUploadMb: Number(pkgForm.maxUploadMb),
        maxUploaderUsers: Number(pkgForm.maxUploaderUsers),
        maxTotalUsers: Number(pkgForm.maxTotalUsers),
        activeDays: Number(pkgForm.activeDays),
        isActive: pkgForm.isActive,
      };
      const url = pkgDialog.editing ? `/api/packages/${pkgDialog.editing.id}` : "/api/packages";
      const method = pkgDialog.editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      toast({ title: pkgDialog.editing ? "Package updated" : "Package created" });
      setPkgDialog({ open: false, editing: null });
      fetchAll();
    } catch {
      toast({ title: "Failed to save package", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const deletePkg = async (id: number) => {
    try {
      await fetch(`/api/packages/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Package deleted" });
      fetchAll();
    } catch {
      toast({ title: "Failed to delete package", variant: "destructive" });
    }
  };

  const openNewGroup = () => {
    setGroupForm({ name: "", companyName: "", packageId: "" });
    setGroupDialog({ open: true, editing: null });
  };

  const openEditGroup = (g: GroupRow) => {
    setGroupForm({ name: g.name, companyName: g.companyName ?? "", packageId: g.packageId ? String(g.packageId) : "" });
    setGroupDialog({ open: true, editing: g });
  };

  const saveGroup = async () => {
    setIsSaving(true);
    try {
      const body = {
        name: groupForm.name,
        companyName: groupForm.companyName || undefined,
        packageId: groupForm.packageId ? Number(groupForm.packageId) : null,
      };
      const url = groupDialog.editing ? `/api/user-groups/${groupDialog.editing.id}` : "/api/user-groups";
      const method = groupDialog.editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      toast({ title: groupDialog.editing ? "Group updated" : "Group created" });
      setGroupDialog({ open: false, editing: null });
      fetchAll();
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed to save group", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const activateGroup = async (id: number) => {
    try {
      const res = await fetch(`/api/user-groups/${id}/activate`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      toast({ title: "Group activated" });
      fetchAll();
    } catch {
      toast({ title: "Failed to activate group", variant: "destructive" });
    }
  };

  const suspendGroup = async (id: number) => {
    try {
      const res = await fetch(`/api/user-groups/${id}/suspend`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      toast({ title: "Group suspended" });
      fetchAll();
    } catch {
      toast({ title: "Failed to suspend group", variant: "destructive" });
    }
  };

  const deleteGroup = async (id: number) => {
    try {
      await fetch(`/api/user-groups/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Group deleted" });
      fetchAll();
    } catch {
      toast({ title: "Failed to delete group", variant: "destructive" });
    }
  };

  const openMembers = async (group: GroupRow) => {
    setMembersDialog({ open: true, group, members: [] });
    setIsMembersLoading(true);
    try {
      const res = await fetch(`/api/user-groups/${group.id}/members`, { credentials: "include" });
      const data = await res.json();
      setMembersDialog((prev) => ({ ...prev, members: Array.isArray(data) ? data : [] }));
    } catch {
      toast({ title: "Failed to load members", variant: "destructive" });
    } finally {
      setIsMembersLoading(false);
    }
  };

  const activateMember = async (groupId: number, userId: number) => {
    try {
      await fetch(`/api/user-groups/${groupId}/members/${userId}/activate`, { method: "PATCH", credentials: "include" });
      toast({ title: "Member activated" });
      openMembers(membersDialog.group!);
      fetchAll();
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  const suspendMember = async (groupId: number, userId: number) => {
    try {
      await fetch(`/api/user-groups/${groupId}/members/${userId}/suspend`, { method: "PATCH", credentials: "include" });
      toast({ title: "Member suspended" });
      openMembers(membersDialog.group!);
      fetchAll();
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  const approveUser = async (id: number) => {
    try {
      const res = await fetch(`/api/users/${id}/approve`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      toast({ title: "User approved" });
      fetchAll();
    } catch {
      toast({ title: "Failed to approve user", variant: "destructive" });
    }
  };

  const rejectUser = async (id: number) => {
    try {
      const res = await fetch(`/api/users/${id}/reject`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      toast({ title: "User rejected" });
      fetchAll();
    } catch {
      toast({ title: "Failed to reject user", variant: "destructive" });
    }
  };

  const openUpgradeDialog = (u: FreeTrialUser) => {
    setUpgradeDialog({ open: true, user: u, selectedGroupId: "" });
  };

  const confirmUpgrade = async () => {
    if (!upgradeDialog.user || !upgradeDialog.selectedGroupId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/users/${upgradeDialog.user.id}/upgrade-group`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: Number(upgradeDialog.selectedGroupId) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      toast({ title: `${upgradeDialog.user.name} upgraded successfully` });
      setUpgradeDialog({ open: false, user: null, selectedGroupId: "" });
      fetchAll();
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed to upgrade user", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Provisioning</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">Manage packages, user groups, and signup requests.</p>
      </div>

      <Tabs defaultValue="packages">
        <TabsList className="mb-6">
          <TabsTrigger value="packages" className="gap-2">
            <Package className="h-4 w-4" /> Packages
          </TabsTrigger>
          <TabsTrigger value="groups" className="gap-2">
            <Building2 className="h-4 w-4" /> User Groups
          </TabsTrigger>
          <TabsTrigger value="signups" className="gap-2">
            <UserCheck className="h-4 w-4" /> Signup Requests
            {pendingUsers.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-[10px]">{pendingUsers.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upgrade" className="gap-2">
            <ArrowUpCircle className="h-4 w-4" /> Upgrade Users
            {freeTrialUsers.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">{freeTrialUsers.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Packages Tab ── */}
        <TabsContent value="packages">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-lg">Packages</CardTitle>
                <CardDescription>Define subscription plans and their limits.</CardDescription>
              </div>
              <Button size="sm" onClick={openNewPackage} className="gap-2">
                <Plus className="h-4 w-4" /> New Package
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-center">Max Docs</TableHead>
                      <TableHead className="text-center">Max Signers/Doc</TableHead>
                      <TableHead className="text-center">Max Upload</TableHead>
                      <TableHead className="text-center">Uploaders</TableHead>
                      <TableHead className="text-center">Total Users</TableHead>
                      <TableHead className="text-center">Active Days</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packages.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No packages yet. Create one to get started.
                        </TableCell>
                      </TableRow>
                    ) : packages.map((pkg) => (
                      <TableRow key={pkg.id}>
                        <TableCell className="font-medium">
                          <div>{pkg.name}</div>
                          {pkg.description && <div className="text-xs text-muted-foreground">{pkg.description}</div>}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[pkg.type]}`}>
                            {TYPE_LABELS[pkg.type]}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm">{pkg.maxDocuments ?? "∞"}</TableCell>
                        <TableCell className="text-center text-sm">{pkg.maxSignersPerDoc ?? "∞"}</TableCell>
                        <TableCell className="text-center text-sm">{pkg.maxUploadMb} MB</TableCell>
                        <TableCell className="text-center text-sm">{pkg.maxUploaderUsers}</TableCell>
                        <TableCell className="text-center text-sm">{pkg.maxTotalUsers}</TableCell>
                        <TableCell className="text-center text-sm">{pkg.activeDays}d</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={pkg.isActive ? "default" : "secondary"}>{pkg.isActive ? "Active" : "Inactive"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditPackage(pkg)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete package?</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently delete the package "{pkg.name}". Groups using this package will lose their package assignment.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deletePkg(pkg.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── User Groups Tab ── */}
        <TabsContent value="groups">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-lg">User Groups</CardTitle>
                <CardDescription>Create and manage user groups. Activate groups after payment.</CardDescription>
              </div>
              <Button size="sm" onClick={openNewGroup} className="gap-2">
                <Plus className="h-4 w-4" /> New Group
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead className="text-center">Members</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No groups yet. Create one to get started.
                        </TableCell>
                      </TableRow>
                    ) : groups.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">{g.name.startsWith("free_trial_") ? <span className="text-muted-foreground italic text-xs">Auto: free trial</span> : g.name}</TableCell>
                        <TableCell className="text-sm">{g.companyName ?? "—"}</TableCell>
                        <TableCell>
                          {g.package ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[g.package.type]}`}>
                              {g.package.name}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-center text-sm">{g.memberCount}</TableCell>
                        <TableCell className="text-sm">{formatDate(g.expiresAt)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={g.isActive ? "default" : "secondary"}>{g.isActive ? "Active" : "Inactive"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="View members" onClick={() => openMembers(g)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditGroup(g)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {g.isActive ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-600 hover:text-orange-600" title="Suspend" onClick={() => suspendGroup(g.id)}>
                                <Pause className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-600" title="Activate" onClick={() => activateGroup(g.id)}>
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete group?</AlertDialogTitle>
                                  <AlertDialogDescription>All members will be unlinked. This action cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteGroup(g.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Upgrade Users Tab ── */}
        <TabsContent value="upgrade">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Upgrade Free Trial Users</CardTitle>
              <CardDescription>
                Move a free trial user to a subscribed or custom group. The user will be activated under the new group's package.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Current Group</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {freeTrialUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No free trial users found.
                        </TableCell>
                      </TableRow>
                    ) : freeTrialUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-sm">{u.email}</TableCell>
                        <TableCell className="text-sm">{u.phone}</TableCell>
                        <TableCell className="text-sm text-muted-foreground italic">
                          {u.groupName?.startsWith("free_trial_") ? "Auto (free trial)" : (u.groupName ?? "—")}
                        </TableCell>
                        <TableCell className="text-center">
                          {u.pendingApproval ? (
                            <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>
                          ) : u.isActive ? (
                            <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" />Active</Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" />Suspended</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(u.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                            onClick={() => openUpgradeDialog(u)}
                          >
                            <ArrowUpCircle className="h-3 w-3" /> Upgrade
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Signup Requests Tab ── */}
        <TabsContent value="signups">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Pending Signup Requests</CardTitle>
              <CardDescription>Review and approve or reject new user registrations.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No pending signup requests.
                        </TableCell>
                      </TableRow>
                    ) : pendingUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-sm">{u.email}</TableCell>
                        <TableCell className="text-sm">{u.phone}</TableCell>
                        <TableCell>
                          {u.groupType ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[u.groupType]}`}>
                              {TYPE_LABELS[u.groupType]}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">{u.groupName?.startsWith("free_trial_") ? <span className="italic text-muted-foreground">Auto</span> : (u.groupName ?? "—")}</TableCell>
                        <TableCell className="text-sm">{formatDate(u.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50" onClick={() => approveUser(u.id)}>
                              <CheckCircle className="h-3 w-3" /> Approve
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-300 hover:bg-red-50">
                                  <XCircle className="h-3 w-3" /> Reject
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Reject this signup?</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently remove {u.name}'s registration. They will need to sign up again.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => rejectUser(u.id)} className="bg-destructive text-destructive-foreground">Reject</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Package Dialog ── */}
      <Dialog open={pkgDialog.open} onOpenChange={(open) => setPkgDialog((p) => ({ ...p, open }))}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pkgDialog.editing ? "Edit Package" : "New Package"}</DialogTitle>
            <DialogDescription>Define the limits and settings for this subscription package.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Package Name *</Label>
                <Input placeholder="e.g. Free Trial 14 Days" value={pkgForm.name} onChange={(e) => setPkgForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={pkgForm.type} onValueChange={(v) => setPkgForm((p) => ({ ...p, type: v as PackageType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free_trial">Free Trial</SelectItem>
                    <SelectItem value="subscribed">Subscribed</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Optional description…" value={pkgForm.description} onChange={(e) => setPkgForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Max Documents</Label>
                <Input type="number" min={1} placeholder="Leave blank for unlimited" value={pkgForm.maxDocuments} onChange={(e) => setPkgForm((p) => ({ ...p, maxDocuments: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Leave blank for unlimited</p>
              </div>
              <div className="space-y-2">
                <Label>Max Signers/Doc</Label>
                <Input type="number" min={1} placeholder="Leave blank for unlimited" value={pkgForm.maxSignersPerDoc} onChange={(e) => setPkgForm((p) => ({ ...p, maxSignersPerDoc: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Includes CC/info users</p>
              </div>
              <div className="space-y-2">
                <Label>Max Upload (MB) *</Label>
                <Input type="number" min={1} value={pkgForm.maxUploadMb} onChange={(e) => setPkgForm((p) => ({ ...p, maxUploadMb: e.target.value }))} />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Max Uploader Users *</Label>
                <Input type="number" min={1} value={pkgForm.maxUploaderUsers} onChange={(e) => setPkgForm((p) => ({ ...p, maxUploaderUsers: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Users who can upload docs</p>
              </div>
              <div className="space-y-2">
                <Label>Max Total Users *</Label>
                <Input type="number" min={1} value={pkgForm.maxTotalUsers} onChange={(e) => setPkgForm((p) => ({ ...p, maxTotalUsers: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Uploaders + ordinary + approvers</p>
              </div>
              <div className="space-y-2">
                <Label>Active Days *</Label>
                <Input type="number" min={1} value={pkgForm.activeDays} onChange={(e) => setPkgForm((p) => ({ ...p, activeDays: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Group validity period</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={pkgForm.isActive} onCheckedChange={(v) => setPkgForm((p) => ({ ...p, isActive: v }))} />
              <Label>Package is active (visible in signup form)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPkgDialog({ open: false, editing: null })}>Cancel</Button>
            <Button onClick={savePkg} disabled={isSaving || !pkgForm.name}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save Package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Group Dialog ── */}
      <Dialog open={groupDialog.open} onOpenChange={(open) => setGroupDialog((p) => ({ ...p, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{groupDialog.editing ? "Edit Group" : "New User Group"}</DialogTitle>
            <DialogDescription>Create a group and assign it a package. Activate after payment.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Group Name *</Label>
              <Input placeholder="e.g. Acme Corp" value={groupForm.name} onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Subscribed users will enter this name when registering.</p>
            </div>
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input placeholder="Optional company name" value={groupForm.companyName} onChange={(e) => setGroupForm((p) => ({ ...p, companyName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Package</Label>
              <Select value={groupForm.packageId || "none"} onValueChange={(v) => setGroupForm((p) => ({ ...p, packageId: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select a package…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No package assigned</SelectItem>
                  {packages.filter((p) => p.isActive).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} ({TYPE_LABELS[p.type]})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialog({ open: false, editing: null })}>Cancel</Button>
            <Button onClick={saveGroup} disabled={isSaving || !groupForm.name}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Upgrade Dialog ── */}
      <Dialog open={upgradeDialog.open} onOpenChange={(open) => setUpgradeDialog((p) => ({ ...p, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-blue-600" />
              Upgrade User to Subscribed
            </DialogTitle>
            <DialogDescription>
              Move <strong>{upgradeDialog.user?.name}</strong> from their free trial group to a subscribed or custom group.
              They will be activated immediately under the new group's package.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm space-y-1">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">Name:</span>
                <span className="font-medium">{upgradeDialog.user?.name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">Email:</span>
                <span>{upgradeDialog.user?.email}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">Current:</span>
                <span className="italic text-muted-foreground">
                  {upgradeDialog.user?.groupName?.startsWith("free_trial_") ? "Auto free trial group" : (upgradeDialog.user?.groupName ?? "None")}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Group / Company *</Label>
              <Select
                value={upgradeDialog.selectedGroupId || "none"}
                onValueChange={(v) => setUpgradeDialog((p) => ({ ...p, selectedGroupId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a subscribed group…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select a group —</SelectItem>
                  {groups
                    .filter((g) => g.package && (g.package.type === "subscribed" || g.package.type === "custom"))
                    .map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        <div className="flex flex-col">
                          <span>{g.name}{g.companyName ? ` — ${g.companyName}` : ""}</span>
                          <span className="text-xs text-muted-foreground">
                            {g.package!.name} · {g.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {groups.filter((g) => g.package && (g.package.type === "subscribed" || g.package.type === "custom")).length === 0 && (
                <p className="text-xs text-muted-foreground">No subscribed or custom groups available. Create one in the User Groups tab first.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeDialog({ open: false, user: null, selectedGroupId: "" })}>Cancel</Button>
            <Button
              onClick={confirmUpgrade}
              disabled={isSaving || !upgradeDialog.selectedGroupId}
              className="gap-2"
            >
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" />Upgrading…</> : <><ArrowUpCircle className="h-4 w-4" />Confirm Upgrade</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Members Dialog ── */}
      <Dialog open={membersDialog.open} onOpenChange={(open) => setMembersDialog((p) => ({ ...p, open }))}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Members — {membersDialog.group?.name}
            </DialogTitle>
            <DialogDescription>
              Manage members of this group. Activate or suspend individual members.
            </DialogDescription>
          </DialogHeader>
          {isMembersLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersDialog.members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">No members yet.</TableCell>
                  </TableRow>
                ) : membersDialog.members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {m.name}
                        {m.isGroupOwner && <Badge variant="outline" className="text-[10px] py-0">Owner</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{m.email}</TableCell>
                    <TableCell className="text-sm capitalize">{m.role}</TableCell>
                    <TableCell className="text-center">
                      {m.pendingApproval ? (
                        <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>
                      ) : m.isActive ? (
                        <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" />Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" />Suspended</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!m.isActive || m.pendingApproval ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300" onClick={() => activateMember(membersDialog.group!.id, m.id)}>
                            Activate
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs text-orange-700 border-orange-300" onClick={() => suspendMember(membersDialog.group!.id, m.id)}>
                            Suspend
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
