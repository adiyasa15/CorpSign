import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Shield, CheckCircle2, XCircle, Clock, FileText, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/format";

interface VerifyDoc {
  id: number;
  title: string;
  fileName: string;
  status: string;
  signedAt: string | null;
  createdAt: string;
  isAuthentic: boolean;
  verificationToken: string;
  signers: Array<{
    name: string;
    email: string;
    status: string;
    completedAt: string | null;
  }>;
}

export default function Verify() {
  const [, params] = useRoute("/verify/:token");
  const token = params?.token ?? "";
  const [data, setData] = useState<VerifyDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/verify/${encodeURIComponent(token)}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d) => { if (d) setData(d); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying document…</p>
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6">
        <div className="rounded-full bg-destructive/10 p-4">
          <XCircle className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-center">Verification Failed</h1>
        <p className="text-muted-foreground text-center max-w-sm text-sm">
          This document could not be found or the verification token is invalid.
          The document may have been deleted or the link may be incorrect.
        </p>
        <p className="text-xs text-muted-foreground/60 break-all max-w-sm text-center">Token: {token}</p>
        <div className="mt-4 text-sm text-muted-foreground">
          Powered by <span className="font-semibold text-foreground">Tandatanganin</span>
        </div>
      </div>
    );
  }

  const isComplete = data.isAuthentic;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-lg space-y-5">
        <div className="text-center space-y-1 pb-2">
          <div className="flex justify-center mb-3">
            <div className={`rounded-full p-4 ${isComplete ? "bg-green-100 dark:bg-green-950/30" : "bg-yellow-100 dark:bg-yellow-950/30"}`}>
              <Shield className={`h-10 w-10 ${isComplete ? "text-green-600" : "text-yellow-600"}`} />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Document Verification</h1>
          <p className="text-sm text-muted-foreground">Powered by Tandatanganin</p>
        </div>

        <div className={`flex items-start gap-3 rounded-xl border-2 p-4 ${isComplete ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20"}`}>
          {isComplete ? (
            <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-6 w-6 text-yellow-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p className={`font-semibold text-sm ${isComplete ? "text-green-700 dark:text-green-400" : "text-yellow-700 dark:text-yellow-400"}`}>
              {isComplete ? "Verified & Authentic" : "Not Fully Signed Yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isComplete
                ? "All required signatures have been collected and verified on this document."
                : "This document has not yet collected all required signatures."}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Document Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 text-sm space-y-3">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Title</span>
              <span className="font-medium text-right">{data.title}</span>
            </div>
            <Separator />
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">File</span>
              <span className="font-medium text-right truncate max-w-[60%]">{data.fileName}</span>
            </div>
            <Separator />
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Status</span>
              <Badge
                variant={isComplete ? "default" : "secondary"}
                className={isComplete ? "bg-green-500 hover:bg-green-600 capitalize" : "capitalize"}
              >
                {data.status.replace("_", " ")}
              </Badge>
            </div>
            <Separator />
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Created</span>
              <span className="font-medium">{formatDate(data.createdAt)}</span>
            </div>
            {data.signedAt && (
              <>
                <Separator />
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Completed</span>
                  <span className="font-medium text-green-600">{formatDate(data.signedAt)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {data.signers.length > 0 && (
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">
                Signers ({data.signers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {data.signers.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                      {s.completedAt && (
                        <p className="text-xs text-green-600">{formatDate(s.completedAt)}</p>
                      )}
                    </div>
                    {s.status === "completed" ? (
                      <Badge className="text-xs gap-1 bg-green-500 hover:bg-green-600 shrink-0">
                        <CheckCircle2 className="h-3 w-3" /> Signed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs shrink-0 gap-1">
                        <Clock className="h-3 w-3" /> {s.status}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center space-y-1 pt-2">
          <p className="text-xs text-muted-foreground/60 break-all">
            Verification ID: {data.verificationToken}
          </p>
          <p className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-foreground">Tandatanganin</span> — Digital Signature Platform
          </p>
        </div>
      </div>
    </div>
  );
}
