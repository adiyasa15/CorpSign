import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PenTool, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Redirect } from "wouter";

interface Group {
  id: number;
  name: string;
  companyName: string | null;
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

export default function Register() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("free_trial");
  const [groups, setGroups] = useState<Group[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [freeForm, setFreeForm] = useState({
    name: "", email: "", countryCode: "+62", phone: "", password: "", confirmPassword: "",
  });

  const [subForm, setSubForm] = useState({
    name: "", email: "", countryCode: "+62", phone: "", companyName: "", groupName: "", password: "", confirmPassword: "",
  });

  useEffect(() => {
    fetch("/api/user-groups/public")
      .then((r) => r.json())
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  if (user) return <Redirect to="/" />;

  const handleFreeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (freeForm.password !== freeForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: freeForm.name,
          email: freeForm.email,
          phone: `${freeForm.countryCode}${freeForm.phone}`,
          password: freeForm.password,
          type: "free_trial",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed. Please try again.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!subForm.groupName) {
      setError("Please select or enter a group name.");
      return;
    }
    if (subForm.password !== subForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: subForm.name,
          email: subForm.email,
          phone: `${subForm.countryCode}${subForm.phone}`,
          companyName: subForm.companyName || undefined,
          groupName: subForm.groupName,
          password: subForm.password,
          type: "subscribed",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed. Please try again.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
                : "Your registration has been submitted. Your group administrator or a superadmin will activate your account."}
            </p>
          </div>
          <Button className="w-full" onClick={() => setLocation("/login")}>
            Back to Sign In
          </Button>
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
              <TabsList className="w-full mb-6">
                <TabsTrigger value="free_trial" className="flex-1">Free Trial</TabsTrigger>
                <TabsTrigger value="subscribed" className="flex-1">Subscribe</TabsTrigger>
              </TabsList>

              {/* Free Trial Form */}
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
                    <div className="flex gap-2">
                      <Select value={freeForm.countryCode} onValueChange={(v) => setFreeForm((p) => ({ ...p, countryCode: v }))}>
                        <SelectTrigger className="w-40 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRY_CODES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input placeholder="812 3456 7890" value={freeForm.phone} onChange={(e) => setFreeForm((p) => ({ ...p, phone: e.target.value }))} required />
                    </div>
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

              {/* Subscribe Form */}
              <TabsContent value="subscribed">
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-xs text-green-800 dark:text-green-300 font-medium">Subscribed plan:</p>
                  <ul className="text-xs text-green-700 dark:text-green-400 mt-1 space-y-0.5">
                    <li>• Join an existing subscribed group</li>
                    <li>• Limits defined by your group's package</li>
                    <li>• Activated by your group administrator</li>
                  </ul>
                </div>
                <form onSubmit={handleSubSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sub-name">Full Name *</Label>
                    <Input id="sub-name" placeholder="John Doe" value={subForm.name} onChange={(e) => setSubForm((p) => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub-email">Email Address *</Label>
                    <Input id="sub-email" type="email" placeholder="name@example.com" value={subForm.email} onChange={(e) => setSubForm((p) => ({ ...p, email: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number *</Label>
                    <div className="flex gap-2">
                      <Select value={subForm.countryCode} onValueChange={(v) => setSubForm((p) => ({ ...p, countryCode: v }))}>
                        <SelectTrigger className="w-40 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRY_CODES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input placeholder="812 3456 7890" value={subForm.phone} onChange={(e) => setSubForm((p) => ({ ...p, phone: e.target.value }))} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub-company">Company Name</Label>
                    <Input id="sub-company" placeholder="Your company name" value={subForm.companyName} onChange={(e) => setSubForm((p) => ({ ...p, companyName: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub-group">Group Name *</Label>
                    {groups.length > 0 ? (
                      <Select value={subForm.groupName} onValueChange={(v) => setSubForm((p) => ({ ...p, groupName: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your group…" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.name}>
                              {g.name}{g.companyName ? ` — ${g.companyName}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input id="sub-group" placeholder="Enter your group name exactly" value={subForm.groupName} onChange={(e) => setSubForm((p) => ({ ...p, groupName: e.target.value }))} required />
                    )}
                    <p className="text-xs text-muted-foreground">Enter the exact group name provided by your administrator.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub-password">Password *</Label>
                    <Input id="sub-password" type="password" placeholder="At least 6 characters" value={subForm.password} onChange={(e) => setSubForm((p) => ({ ...p, password: e.target.value }))} required minLength={6} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub-confirm">Confirm Password *</Label>
                    <Input id="sub-confirm" type="password" placeholder="Repeat your password" value={subForm.confirmPassword} onChange={(e) => setSubForm((p) => ({ ...p, confirmPassword: e.target.value }))} required minLength={6} />
                  </div>
                  <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
                    {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Register as Subscriber"}
                  </Button>
                </form>
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
