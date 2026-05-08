import { useState, useRef, useId } from "react";
import { useLocation, Redirect } from "wouter";
import { useLoginLocal, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { PenTool, Loader2, AlertCircle, Clock, ArrowLeft, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

const PENDING_APPROVAL_CODE = "pending_approval";

function getErrorMessage(errorCode: string | null): string | null {
  if (!errorCode) return null;
  const messages: Record<string, string> = {
    google_failed: "Google sign-in failed. Make sure your Google account is allowed to access this app.",
    session_error: "A session error occurred. Please try again.",
    access_denied: "Access was denied. Please try again or use your email/password instead.",
    pending_approval: "Your account is pending admin approval. You will be notified once activated.",
  };
  return messages[errorCode] ?? "Sign-in failed. Please try again.";
}

interface EmailInfo {
  exists: boolean;
  isGmail: boolean;
  isGws: boolean;
  hasGoogleId: boolean;
  hasPassword: boolean;
  isActive: boolean | null;
  isPending: boolean | null;
}

type Step = "email" | "google" | "password";

const GoogleIcon = () => (
  <svg className="w-5 h-5 absolute left-4" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

export default function Login() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [emailInfo, setEmailInfo] = useState<EmailInfo | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const rememberMeId = useId();

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLoginLocal();
  const { user, refetch } = useAuth();
  const passwordRef = useRef<HTMLInputElement>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const errorCode = searchParams.get("error");
  const errorMessage = getErrorMessage(errorCode);

  if (user) return <Redirect to="/" />;

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setIsCheckingEmail(true);
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const info: EmailInfo = await res.json();
      setEmailInfo(info);

      if (info.isPending) {
        setEmailError("Your account is pending admin approval. You will be notified once activated.");
        return;
      }
      if (info.exists && info.isActive === false) {
        setEmailError("This account has been suspended. Please contact your administrator.");
        return;
      }

      // Route to correct step
      if (info.isGmail || info.hasGoogleId) {
        setStep("google");
      } else {
        setStep("password");
        setTimeout(() => passwordRef.current?.focus(), 50);
      }
    } catch {
      setEmailError("Network error. Please try again.");
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { username: email, password, rememberMe } },
      {
        onSuccess: async () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          await refetch();
          setLocation("/");
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Login Failed",
            description: "Incorrect password. Please try again.",
          });
        },
      }
    );
  };

  const resetToEmail = () => {
    setStep("email");
    setEmailInfo(null);
    setEmailError(null);
    setPassword("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground mb-4 shadow-lg">
            <PenTool className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h1>
          <p className="text-muted-foreground">Sign in to your Tandatanganin account</p>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader>
            <CardTitle className="text-xl text-center">Sign In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {errorMessage && (
              errorCode === PENDING_APPROVAL_CODE ? (
                <Alert className="border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="font-medium">{errorMessage}</AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )
            )}

            {/* ── Step 1: Email ── */}
            {step === "email" && (
              <form onSubmit={handleEmailContinue} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-input">Email Address</Label>
                  <Input
                    id="email-input"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                    required
                    className="h-11"
                    autoFocus
                    data-testid="username-input"
                  />
                  {emailError && (
                    emailError.includes("pending") ? (
                      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                        <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{emailError}</span>
                      </div>
                    ) : (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" /> {emailError}
                      </p>
                    )
                  )}
                </div>
                <Button type="submit" className="w-full h-11 text-base" disabled={isCheckingEmail || !email.trim()} data-testid="login-submit-btn">
                  {isCheckingEmail ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Checking…</> : "Continue"}
                </Button>
              </form>
            )}

            {/* ── Step 2a: Google SSO ── */}
            {step === "google" && (
              <div className="space-y-4">
                {/* Email chip */}
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate text-foreground">{email}</span>
                  <button type="button" onClick={resetToEmail} className="text-xs text-primary underline underline-offset-2 shrink-0">
                    Change
                  </button>
                </div>

                {/* Google SSO button */}
                <Button
                  variant="outline"
                  className="w-full h-12 text-base font-medium relative"
                  asChild
                  data-testid="google-login-btn"
                >
                  <a href={`/api/auth/google?login_hint=${encodeURIComponent(email)}`}>
                    <GoogleIcon />
                    Continue with Google
                  </a>
                </Button>

                {/* Optional password fallback if they have one */}
                {emailInfo?.hasPassword && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or use password instead</span>
                      </div>
                    </div>
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="h-11"
                          ref={passwordRef}
                          data-testid="password-input"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id={rememberMeId} checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
                        <label htmlFor={rememberMeId} className="text-sm text-muted-foreground cursor-pointer select-none">Remember me</label>
                      </div>
                      <Button type="submit" variant="secondary" className="w-full h-11" disabled={loginMutation.isPending || !password}>
                        {loginMutation.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Signing in…</> : "Sign In with Password"}
                      </Button>
                    </form>
                  </>
                )}

                <button type="button" onClick={resetToEmail} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-full justify-center mt-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
              </div>
            )}

            {/* ── Step 2b: Password ── */}
            {step === "password" && (
              <div className="space-y-4">
                {/* Email chip */}
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate text-foreground">{email}</span>
                  <button type="button" onClick={resetToEmail} className="text-xs text-primary underline underline-offset-2 shrink-0">
                    Change
                  </button>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11"
                      ref={passwordRef}
                      data-testid="password-input"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id={rememberMeId} checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
                    <label htmlFor={rememberMeId} className="text-sm text-muted-foreground cursor-pointer select-none">Remember me</label>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11 text-base"
                    disabled={loginMutation.isPending || !password}
                    data-testid="login-submit-btn"
                  >
                    {loginMutation.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Signing in…</> : "Sign In"}
                  </Button>
                </form>

                <button type="button" onClick={resetToEmail} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-full justify-center">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-center border-t border-border/50 py-4 text-sm text-muted-foreground">
            <span>
              Contact your administrator for an account, or{" "}
              <a href="/register" className="text-primary underline underline-offset-2 font-medium">sign up here</a>
            </span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
