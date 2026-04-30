import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/language-context";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { ShieldCheck, Users, HardDrive, Loader2 } from "lucide-react";
type RoleCapabilities = {
  addUser: boolean;
  uploadDocument: boolean;
  approveDocument: boolean;
  viewAllDocuments: boolean;
  manageSignatures: boolean;
};

type AllRoleCapabilities = {
  admin: RoleCapabilities;
  user: RoleCapabilities;
  approver: RoleCapabilities;
};

const CAP_KEYS: (keyof RoleCapabilities)[] = [
  "addUser",
  "uploadDocument",
  "approveDocument",
  "viewAllDocuments",
  "manageSignatures",
];

const ROLE_KEYS: (keyof AllRoleCapabilities)[] = ["admin", "user", "approver"];

const UPLOAD_SIZES = [10, 20, 30, 40, 50] as const;

const DEFAULT_CAPS: AllRoleCapabilities = {
  admin: { addUser: true, uploadDocument: true, approveDocument: true, viewAllDocuments: true, manageSignatures: true },
  user: { addUser: false, uploadDocument: true, approveDocument: false, viewAllDocuments: false, manageSignatures: true },
  approver: { addUser: false, uploadDocument: false, approveDocument: true, viewAllDocuments: true, manageSignatures: false },
};

export default function Privileges() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [maxAdmins, setMaxAdmins] = useState(10);
  const [maxUsers, setMaxUsers] = useState(50);
  const [maxUploadMb, setMaxUploadMb] = useState<number>(10);
  const [caps, setCaps] = useState<AllRoleCapabilities>(DEFAULT_CAPS);

  useEffect(() => {
    if (user && user.role !== "superadmin") {
      setLocation("/");
    }
  }, [user, setLocation]);

  useEffect(() => {
    fetch("/api/privileges", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setMaxAdmins(data.maxAdminAccounts ?? 10);
        setMaxUsers(data.maxUsersPerAdmin ?? 50);
        setMaxUploadMb(data.maxUploadSizeMb ?? 10);
        setCaps(data.roleCapabilities ?? DEFAULT_CAPS);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const toggleCap = (role: keyof AllRoleCapabilities, cap: keyof RoleCapabilities) => {
    setCaps((prev) => ({
      ...prev,
      [role]: { ...prev[role], [cap]: !prev[role][cap] },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/privileges", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxAdminAccounts: maxAdmins,
          maxUsersPerAdmin: maxUsers,
          maxUploadSizeMb: maxUploadMb,
          roleCapabilities: caps,
        }),
      });
      if (!res.ok) throw new Error("failed");
      toast({ title: t("priv_saved") });
    } catch {
      toast({ title: t("priv_save_error"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("priv_title")}</h1>
        <p className="text-muted-foreground mt-1 text-lg">{t("priv_subtitle")}</p>
      </div>

      <div className="grid gap-8">
        {/* Admin user limit */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> {t("priv_admin_limits_title")}
            </CardTitle>
            <CardDescription>{t("priv_admin_limits_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maxAdmins">{t("priv_max_admins_label")}</Label>
                <Input
                  id="maxAdmins"
                  type="number"
                  min={1}
                  max={9999}
                  value={maxAdmins}
                  onChange={(e) => setMaxAdmins(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <p className="text-xs text-muted-foreground">{t("priv_max_admins_hint")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxUsers">{t("priv_max_users_label")}</Label>
                <Input
                  id="maxUsers"
                  type="number"
                  min={1}
                  max={9999}
                  value={maxUsers}
                  onChange={(e) => setMaxUsers(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <p className="text-xs text-muted-foreground">{t("priv_max_users_hint")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload size limit */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" /> {t("priv_upload_title")}
            </CardTitle>
            <CardDescription>{t("priv_upload_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs space-y-2">
              <Label>{t("priv_upload_label")}</Label>
              <Select value={String(maxUploadMb)} onValueChange={(v) => setMaxUploadMb(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPLOAD_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>{s} MB</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Role capabilities matrix */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> {t("priv_capabilities_title")}
            </CardTitle>
            <CardDescription>{t("priv_capabilities_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-muted-foreground pb-4 pr-6 w-64">
                      {t("priv_capabilities_title")}
                    </th>
                    {ROLE_KEYS.map((role) => (
                      <th key={role} className="text-center font-semibold pb-4 px-4 min-w-[100px]">
                        {t(`priv_role_${role}` as "priv_role_admin")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {CAP_KEYS.map((cap) => (
                    <tr key={cap} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 pr-6 font-medium">
                        {t(`priv_cap_${cap}` as "priv_cap_addUser")}
                      </td>
                      {ROLE_KEYS.map((role) => (
                        <td key={role} className="py-3.5 px-4 text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={caps[role][cap]}
                              onCheckedChange={() => toggleCap(role, cap)}
                              className="h-5 w-5"
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="flex justify-end">
          <Button size="lg" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("priv_saving")}</>
            ) : (
              <><ShieldCheck className="h-4 w-4 mr-2" />{t("save")}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
