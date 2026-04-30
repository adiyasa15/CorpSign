import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, Bell, Shield, Globe, Send } from "lucide-react";
import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/language-context";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

const COUNTRY_CODES = [
  { code: "+62", label: "🇮🇩 Indonesia (+62)" },
  { code: "+1",  label: "🇺🇸 United States (+1)" },
  { code: "+44", label: "🇬🇧 United Kingdom (+44)" },
  { code: "+61", label: "🇦🇺 Australia (+61)" },
  { code: "+65", label: "🇸🇬 Singapore (+65)" },
  { code: "+60", label: "🇲🇾 Malaysia (+60)" },
  { code: "+63", label: "🇵🇭 Philippines (+63)" },
  { code: "+66", label: "🇹🇭 Thailand (+66)" },
  { code: "+84", label: "🇻🇳 Vietnam (+84)" },
  { code: "+95", label: "🇲🇲 Myanmar (+95)" },
  { code: "+855", label: "🇰🇭 Cambodia (+855)" },
  { code: "+856", label: "🇱🇦 Laos (+856)" },
  { code: "+673", label: "🇧🇳 Brunei (+673)" },
  { code: "+670", label: "🇹🇱 Timor-Leste (+670)" },
  { code: "+86",  label: "🇨🇳 China (+86)" },
  { code: "+81",  label: "🇯🇵 Japan (+81)" },
  { code: "+82",  label: "🇰🇷 South Korea (+82)" },
  { code: "+91",  label: "🇮🇳 India (+91)" },
  { code: "+92",  label: "🇵🇰 Pakistan (+92)" },
  { code: "+880", label: "🇧🇩 Bangladesh (+880)" },
  { code: "+94",  label: "🇱🇰 Sri Lanka (+94)" },
  { code: "+971", label: "🇦🇪 UAE (+971)" },
  { code: "+966", label: "🇸🇦 Saudi Arabia (+966)" },
  { code: "+20",  label: "🇪🇬 Egypt (+20)" },
  { code: "+27",  label: "🇿🇦 South Africa (+27)" },
  { code: "+234", label: "🇳🇬 Nigeria (+234)" },
  { code: "+49",  label: "🇩🇪 Germany (+49)" },
  { code: "+33",  label: "🇫🇷 France (+33)" },
  { code: "+39",  label: "🇮🇹 Italy (+39)" },
  { code: "+34",  label: "🇪🇸 Spain (+34)" },
  { code: "+31",  label: "🇳🇱 Netherlands (+31)" },
  { code: "+7",   label: "🇷🇺 Russia (+7)" },
  { code: "+55",  label: "🇧🇷 Brazil (+55)" },
  { code: "+52",  label: "🇲🇽 Mexico (+52)" },
];

function splitPhone(full: string): { code: string; local: string } {
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (full.startsWith(c.code)) {
      return { code: c.code, local: full.slice(c.code.length).trimStart() };
    }
  }
  return { code: "+62", local: full.replace(/^\+\d+\s*/, "") };
}

export default function Settings() {
  const { toast } = useToast();
  const { t, language, setLanguage } = useLanguage();
  const { user, isLoading, refetch } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneCode, setPhoneCode] = useState("+62");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");

  useEffect(() => {
    if (user?.name) {
      const parts = user.name.trim().split(/\s+/);
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
    }
    if (user?.phone !== undefined) {
      const { code, local } = splitPhone(user.phone ?? "");
      setPhoneCode(code);
      setPhoneLocal(local);
    }
    if (user?.telegramChatId !== undefined) {
      setTelegramChatId(user.telegramChatId ?? "");
    }
  }, [user?.name, user?.phone, user?.telegramChatId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || (user?.name ?? "");
      const phone = `${phoneCode}${phoneLocal.trim()}`;
      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          telegramChatId: telegramChatId.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("failed");
      refetch();
      toast({ title: t("settings_saved") });
    } catch {
      toast({ title: t("error"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
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
            {isLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t("settings_first_name")}</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t("settings_last_name")}</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneLocal">{t("settings_phone")}</Label>
                  <div className="flex gap-2">
                    <Select value={phoneCode} onValueChange={setPhoneCode}>
                      <SelectTrigger className="w-52 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {COUNTRY_CODES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      id="phoneLocal"
                      type="tel"
                      inputMode="numeric"
                      placeholder={t("settings_phone_placeholder") as string}
                      value={phoneLocal}
                      onChange={(e) => setPhoneLocal(e.target.value.replace(/[^\d\s\-]/g, ""))}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("settings_email")}</Label>
                  <Input id="email" type="email" value={user?.email ?? ""} disabled />
                  <p className="text-xs text-muted-foreground">{t("settings_email_hint")}</p>
                </div>
              </>
            )}
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

        {/* Telegram Notifications */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" /> {t("settings_telegram_title")}
            </CardTitle>
            <CardDescription>{t("settings_telegram_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="telegramChatId">{t("settings_telegram_chat_id")}</Label>
                {user?.telegramChatId ? (
                  <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-600">
                    ✓ {t("settings_telegram_connected")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {t("settings_telegram_not_connected")}
                  </Badge>
                )}
              </div>
              <Input
                id="telegramChatId"
                type="text"
                inputMode="numeric"
                placeholder={t("settings_telegram_chat_id_placeholder") as string}
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value.replace(/[^\d-]/g, ""))}
              />
            </div>
            <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{t("settings_telegram_how_to")}</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  {t("settings_telegram_step1")}{" "}
                  <a
                    href="https://t.me/userinfobot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 font-medium"
                  >
                    {t("settings_telegram_bot_name")}
                  </a>
                </li>
                <li>{t("settings_telegram_step2")}</li>
                <li>{t("settings_telegram_step3")}</li>
              </ol>
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
