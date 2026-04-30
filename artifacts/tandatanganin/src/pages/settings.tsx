import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { User, Bell, Shield, Globe } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/contexts/language-context";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { toast } = useToast();
  const { t, language, setLanguage } = useLanguage();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast({ title: t("settings_saved") });
    }, 800);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("settings_title")}</h1>
        <p className="text-muted-foreground mt-1 text-lg">{t("settings_subtitle")}</p>
      </div>

      <div className="grid gap-8">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-primary" /> {t("settings_profile_title")}
            </CardTitle>
            <CardDescription>{t("settings_profile_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t("settings_first_name")}</Label>
                <Input id="firstName" defaultValue="User" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t("settings_last_name")}</Label>
                <Input id="lastName" defaultValue="Name" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("settings_email")}</Label>
              <Input id="email" type="email" defaultValue="user@example.com" disabled />
              <p className="text-xs text-muted-foreground">{t("settings_email_hint")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" /> {t("settings_language_title")}
            </CardTitle>
            <CardDescription>{t("settings_language_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {(["en", "id"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-3 rounded-lg border-2 text-sm font-medium transition-all",
                    language === lang
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <span className="text-base">{lang === "en" ? "🇬🇧" : "🇮🇩"}</span>
                  {t(lang === "en" ? "settings_language_en" : "settings_language_id")}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" /> {t("settings_notif_title")}
            </CardTitle>
            <CardDescription>{t("settings_notif_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">{t("settings_notif_signed")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings_notif_signed_desc")}</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">{t("settings_notif_requests")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings_notif_requests_desc")}</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">{t("settings_notif_marketing")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings_notif_marketing_desc")}</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> {t("settings_security_title")}
            </CardTitle>
            <CardDescription>{t("settings_security_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="space-y-0.5">
                <p className="font-medium">{t("settings_password")}</p>
                <p className="text-sm text-muted-foreground">{t("settings_password_last")}</p>
              </div>
              <Button variant="outline">{t("settings_change_password")}</Button>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <p className="font-medium">{t("settings_2fa")}</p>
                <p className="text-sm text-muted-foreground">{t("settings_2fa_desc")}</p>
              </div>
              <Button variant="outline">{t("settings_enable_2fa")}</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button size="lg" onClick={handleSave} disabled={isSaving}>
            {isSaving ? t("saving") : t("settings_save_all")}
          </Button>
        </div>
      </div>
    </div>
  );
}
