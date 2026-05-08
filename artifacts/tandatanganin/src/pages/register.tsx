import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PenTool, Loader2, CheckCircle2, AlertCircle, Building2, Plus, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Redirect } from "wouter";

interface Group {
  id: number;
  name: string;
  companyName: string | null;
}

interface PublicPackage {
  id: number;
  name: string;
  description: string | null;
  type: string;
  maxDocuments: number | null;
  maxSignersPerDoc: number | null;
  maxUploadMb: number;
  maxUploaderUsers: number;
  maxTotalUsers: number;
  activeDays: number;
}

const COUNTRY_CODES = [
  { code: "+62", label: "+62 (Indonesia)" },
  { code: "+1", label: "+1 (US/Canada)" },
  { code: "+44", label: "+44 (UK)" },
  { code: "+65", label: "+65 (Singapore)" },
  { code: "+60", label: "+60 (Malaysia)" },
  { code: "+61", label: "+61 (Australia)" },
  { code: "+81", label: "+81 (Japan)" },
];

const PhoneInput = ({
  countryCode, phone,
  onCountryChange, onPhoneChange,
}: {
  countryCode: string; phone: string;
  onCountryChange: (v: string) => void; onPhoneChange: (v: string) => void;
}) => (
  <div className="flex gap-2">
    <Select value={countryCode} onValueChange={onCountryChange}>
      <SelectTrigger className="w-40 shrink-0"><SelectValue /></SelectTrigger>
      <SelectContent>
        {COUNTRY_CODES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
      </SelectContent>
    </Select>
    <Input placeholder="812 3456 7890" value={phone} onChange={(e) => onPhoneChange(e.target.value)} required />
  </div>
);

export default function Register() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("free_trial");
  const [groups, setGroups] = useState<Group[]>([]);
  const [publicPackages, setPublicPackages] = useState<PublicPackage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFreeTrial, setShowFreeTrial] = useState(true);
  const [showSubscribe, setShowSubscribe] = useState(true);

  const [freeForm, setFreeForm] = useState({
    name: "", email: "", countryCode: "+62", phone: "", password: "", confirmPassword: "",
  });

  // Subscribe tab: mode selector
  const [subMode, setSubMode] = useState<"existing" | "new">("existing");

  // Existing subscription
  const [existingForm, setExistingForm] = useState({
    name: "", email: "", countryCode: "+62", phone: "",
    companyInput: "", selectedGroupId: "", password: "", confirmPassword: "",
  });

  // New subscription
  const [newForm, setNewForm] = useState({
    name: "", email: "", countryCode: "+62", phone: "",
    companyName: "", groupName: "", selectedPackageId: "", password: "", confirmPassword: "",
  });

  useEffect(() => {
    fetch("/api/user-groups/public")
      .then((r) => r.json())
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/packages/public")
      .then((r) => r.json())
      .then((data) => setPublicPackages(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/privileges/register-config")
      .then((r) => r.json())
      .then((data) => {
        const ft = data.showFreeTrial !== false;
        const sub = data.showSubscribe !== false;
        setShowFreeTrial(ft);
        setShowSubscribe(sub);
        // If current tab is hidden, switch to whichever is visible
        setActiveTab((prev) => {
          if (prev === "free_trial" && !ft) return sub ? "subscribed" : "free_trial";
          if (prev === "subscribed" && !sub) return ft ? "free_trial" : "subscribed";
          return prev;
        });
      })
      .catch(() => {});
  }, []);

  if (user) return <Redirect to="/" />;

  // Company name → group matching (for existing subscription)
  const companyTrimmed = existingForm.companyInput.trim().toLowerCase();
  const matchedGroups: Group[] = useMemo(() => {
    if (!companyTrimmed) return [];
    return groups.filter(
      (g) => g.companyName && g.companyName.toLowerCase().includes(companyTrimmed)
    );
  }, [companyTrimmed, groups]);

  const companyNotFound = companyTrimmed.length > 0 && matchedGroups.length === 0;
  const autoSelectedGroup = matchedGroups.length === 1 ? matchedGroups[0] : null;

  // When exactly one match, auto-select it
  const effectiveGroupId = autoSelectedGroup
    ? String(autoSelectedGroup.id)
    : existingForm.selectedGroupId;

  const effectiveGroupName = matchedGroups.find((g) => String(g.id) === effectiveGroupId)?.name ?? null;

  const handleFreeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (freeForm.password !== freeForm.confirmPassword) { setError("Passwords do not match."); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: freeForm.name, email: freeForm.email,
          phone: `${freeForm.countryCode}${freeForm.phone}`,
          password: freeForm.password, type: "free_trial",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed. Please try again."); return; }
      setSuccess(true);
    } catch { setError("Network error. Please try again."); }
    finally { setIsSubmitting(false); }
  };

  const handleExistingSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!effectiveGroupName) { setError("Please find and select your company group."); return; }
    if (existingForm.password !== existingForm.confirmPassword) { setError("Passwords do not match."); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: existingForm.name, email: existingForm.email,
          phone: `${existingForm.countryCode}${existingForm.phone}`,
          companyName: existingForm.companyInput || undefined,
          groupName: effectiveGroupName,
          password: existingForm.password, type: "subscribed",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed. Please try again."); return; }
      setSuccess(true);
    } catch { setError("Network error. Please try again."); }
    finally { setIsSubmitting(false); }
  };

  const handleNewSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newForm.groupName.trim()) { setError("Please enter a group name."); return; }
    if (newForm.password !== newForm.confirmPassword) { setError("Passwords do not match."); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newForm.name, email: newForm.email,
          phone: `${newForm.countryCode}${newForm.phone}`,
          companyName: newForm.companyName || undefined,
          groupName: newForm.groupName.trim(),
          packageId: newForm.selectedPackageId ? Number(newForm.selectedPackageId) : undefined,
          password: newForm.password, type: "subscribed_new",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed. Please try again."); return; }
      setSuccess(true);
    } catch { setError("Network error. Please try again."); }
    finally { setIsSubmitting(false); }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Registration Submitted!</h2>
            <p className="text-muted-foreground mt-2">
              {activeTab === "free_trial"
                ? "Your free trial request has been submitted. A superadmin will review and activate your account."
                : subMode === "new"
                ? "Your new subscription request has been submitted. A superadmin will review and activate your account after payment."
                : "Your registration has been submitted. Your group administrator or a superadmin will activate your account."}
            </p>
          </div>
          <Button className="w-full" onClick={() => setLocation("/login")}>Back to Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground mb-4 shadow-lg">
            <PenTool className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Create an Account</h1>
          <p className="text-muted-foreground">Sign up for Tandatanganin</p>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader>
            <CardTitle className="text-xl text-center">Sign Up</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setError(null); }}>
              {(showFreeTrial || showSubscribe) && (
                <TabsList className="w-full mb-6">
                  {showFreeTrial && <TabsTrigger value="free_trial" className="flex-1">Free Trial</TabsTrigger>}
                  {showSubscribe && <TabsTrigger value="subscribed" className="flex-1">Subscribe</TabsTrigger>}
                </TabsList>
              )}

              {/* ── Free Trial Form ── */}
              <TabsContent value="free_trial">
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-800 dark:text-blue-300 font-medium">Free Trial includes:</p>
                  <ul className="text-xs text-blue-700 dark:text-blue-400 mt-1 space-y-0.5">
                    <li>• Upload &amp; request signing for up to 5 documents</li>
                    <li>• Up to 5 approvers / CC recipients per document</li>
                    <li>• Maximum 5 MB file size</li>
                    <li>• 14-day trial period</li>
                  </ul>
                </div>
                <form onSubmit={handleFreeSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ft-name">Full Name *</Label>
                    <Input id="ft-name" placeholder="John Doe" value={freeForm.name} onChange={(e) => setFreeForm((p) => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ft-email">Email Address *</Label>
                    <Input id="ft-email" type="email" placeholder="name@example.com" value={freeForm.email} onChange={(e) => setFreeForm((p) => ({ ...p, email: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number *</Label>
                    <PhoneInput countryCode={freeForm.countryCode} phone={freeForm.phone} onCountryChange={(v) => setFreeForm((p) => ({ ...p, countryCode: v }))} onPhoneChange={(v) => setFreeForm((p) => ({ ...p, phone: v }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ft-password">Password *</Label>
                    <Input id="ft-password" type="password" placeholder="At least 6 characters" value={freeForm.password} onChange={(e) => setFreeForm((p) => ({ ...p, password: e.target.value }))} required minLength={6} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ft-confirm">Confirm Password *</Label>
                    <Input id="ft-confirm" type="password" placeholder="Repeat your password" value={freeForm.confirmPassword} onChange={(e) => setFreeForm((p) => ({ ...p, confirmPassword: e.target.value }))} required minLength={6} />
                  </div>
                  <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
                    {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Start Free Trial"}
                  </Button>
                </form>
              </TabsContent>

              {/* ── Subscribe Form ── */}
              <TabsContent value="subscribed">
                {/* Mode selector */}
                <div className="grid grid-cols-2 gap-2 mb-5">
                  <button
                    type="button"
                    onClick={() => { setSubMode("existing"); setError(null); }}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-left transition-all ${subMode === "existing" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}
                  >
                    <Building2 className={`h-5 w-5 ${subMode === "existing" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-xs font-medium ${subMode === "existing" ? "text-primary" : "text-muted-foreground"}`}>Existing Subscription</span>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">Join a company that already subscribed</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSubMode("new"); setError(null); }}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-left transition-all ${subMode === "new" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}
                  >
                    <Plus className={`h-5 w-5 ${subMode === "new" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-xs font-medium ${subMode === "new" ? "text-primary" : "text-muted-foreground"}`}>New Subscription</span>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">Start a new subscription for your company</span>
                  </button>
                </div>

                {/* ── Existing Subscription ── */}
                {subMode === "existing" && (
                  <form onSubmit={handleExistingSubSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="ex-company">Company Name *</Label>
                      <Input
                        id="ex-company"
                        placeholder="Type your company name…"
                        value={existingForm.companyInput}
                        onChange={(e) => setExistingForm((p) => ({ ...p, companyInput: e.target.value, selectedGroupId: "" }))}
                        required
                        className={companyNotFound ? "border-red-500 focus-visible:ring-red-500" : ""}
                      />
                      {companyNotFound && (
                        <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Your company is not registered / subscribed
                        </p>
                      )}
                      {autoSelectedGroup && (
                        <div className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm text-green-800 dark:text-green-300">
                          <CheckCircle className="h-4 w-4 shrink-0" />
                          <span>Group found: <strong>{autoSelectedGroup.name}</strong></span>
                        </div>
                      )}
                      {matchedGroups.length > 1 && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">Multiple groups found — select yours:</p>
                          <Select value={existingForm.selectedGroupId} onValueChange={(v) => setExistingForm((p) => ({ ...p, selectedGroupId: v }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select your group…" />
                            </SelectTrigger>
                            <SelectContent>
                              {matchedGroups.map((g) => (
                                <SelectItem key={g.id} value={String(g.id)}>
                                  {g.name}{g.companyName ? ` — ${g.companyName}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ex-name">Full Name *</Label>
                      <Input id="ex-name" placeholder="John Doe" value={existingForm.name} onChange={(e) => setExistingForm((p) => ({ ...p, name: e.target.value }))} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ex-email">Email Address *</Label>
                      <Input id="ex-email" type="email" placeholder="name@example.com" value={existingForm.email} onChange={(e) => setExistingForm((p) => ({ ...p, email: e.target.value }))} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number *</Label>
                      <PhoneInput countryCode={existingForm.countryCode} phone={existingForm.phone} onCountryChange={(v) => setExistingForm((p) => ({ ...p, countryCode: v }))} onPhoneChange={(v) => setExistingForm((p) => ({ ...p, phone: v }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ex-password">Password *</Label>
                      <Input id="ex-password" type="password" placeholder="At least 6 characters" value={existingForm.password} onChange={(e) => setExistingForm((p) => ({ ...p, password: e.target.value }))} required minLength={6} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ex-confirm">Confirm Password *</Label>
                      <Input id="ex-confirm" type="password" placeholder="Repeat your password" value={existingForm.confirmPassword} onChange={(e) => setExistingForm((p) => ({ ...p, confirmPassword: e.target.value }))} required minLength={6} />
                    </div>
                    <Button type="submit" className="w-full h-11" disabled={isSubmitting || !effectiveGroupName || companyNotFound}>
                      {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Join Subscription"}
                    </Button>
                  </form>
                )}

                {/* ── New Subscription ── */}
                {subMode === "new" && (
                  <form onSubmit={handleNewSubSubmit} className="space-y-4">
                    {/* Package selection */}
                    <div className="space-y-2">
                      <Label>Select a Plan</Label>
                      {publicPackages.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No plans available. Please contact support.</p>
                      ) : (
                        <div className="space-y-2">
                          {publicPackages.map((pkg) => (
                            <button
                              key={pkg.id}
                              type="button"
                              onClick={() => setNewForm((p) => ({ ...p, selectedPackageId: String(pkg.id) }))}
                              className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-all ${newForm.selectedPackageId === String(pkg.id) ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm">{pkg.name}</span>
                                <Badge variant={newForm.selectedPackageId === String(pkg.id) ? "default" : "secondary"} className="text-[10px]">
                                  {pkg.type === "subscribed" ? "Subscribed" : "Custom"}
                                </Badge>
                              </div>
                              {pkg.description && <p className="text-xs text-muted-foreground mb-2">{pkg.description}</p>}
                              <ul className="text-xs text-muted-foreground space-y-0.5">
                                <li>• {pkg.maxDocuments != null ? `Up to ${pkg.maxDocuments} documents` : "Unlimited documents"}</li>
                                <li>• {pkg.maxSignersPerDoc != null ? `Up to ${pkg.maxSignersPerDoc} signers/doc` : "Unlimited signers"}</li>
                                <li>• Max {pkg.maxUploadMb} MB upload size</li>
                                <li>• {pkg.maxUploaderUsers} uploader user{pkg.maxUploaderUsers !== 1 ? "s" : ""}, {pkg.maxTotalUsers} total user{pkg.maxTotalUsers !== 1 ? "s" : ""}</li>
                                <li>• {pkg.activeDays}-day subscription period</li>
                              </ul>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-company">Company Name</Label>
                      <Input id="new-company" placeholder="Your company name" value={newForm.companyName} onChange={(e) => setNewForm((p) => ({ ...p, companyName: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-group">Group Name *</Label>
                      <Input id="new-group" placeholder="e.g. Acme Corp Team" value={newForm.groupName} onChange={(e) => setNewForm((p) => ({ ...p, groupName: e.target.value }))} required />
                      <p className="text-xs text-muted-foreground">Choose a unique name for your group. This will be used by other members to join.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-name">Full Name *</Label>
                      <Input id="new-name" placeholder="John Doe" value={newForm.name} onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-email">Email Address *</Label>
                      <Input id="new-email" type="email" placeholder="name@example.com" value={newForm.email} onChange={(e) => setNewForm((p) => ({ ...p, email: e.target.value }))} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number *</Label>
                      <PhoneInput countryCode={newForm.countryCode} phone={newForm.phone} onCountryChange={(v) => setNewForm((p) => ({ ...p, countryCode: v }))} onPhoneChange={(v) => setNewForm((p) => ({ ...p, phone: v }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">Password *</Label>
                      <Input id="new-password" type="password" placeholder="At least 6 characters" value={newForm.password} onChange={(e) => setNewForm((p) => ({ ...p, password: e.target.value }))} required minLength={6} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-confirm">Confirm Password *</Label>
                      <Input id="new-confirm" type="password" placeholder="Repeat your password" value={newForm.confirmPassword} onChange={(e) => setNewForm((p) => ({ ...p, confirmPassword: e.target.value }))} required minLength={6} />
                    </div>
                    <Button type="submit" className="w-full h-11" disabled={isSubmitting || !newForm.groupName.trim()}>
                      {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Request Subscription"}
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 border-t border-border/50 py-4 text-sm text-muted-foreground">
            <p>Already have an account? <Link href="/login" className="text-primary underline underline-offset-2">Sign in</Link></p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
