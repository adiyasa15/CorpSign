import { useRoute, useLocation } from "wouter";
import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, AlertCircle, Clock, CheckCircle2, XCircle, FileText,
  Download, ChevronDown, Edit2, PenLine, Users, ClipboardList, Loader2, Trash2, Mail, Ban, BellRing,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { formatDate, formatBytes } from "@/lib/format";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

interface CcRecipient {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: string;
}

interface DocDetail {
  id: number;
  title: string;
  description?: string;
  fileName: string;
  filePath: string | null;
  fileSize: number;
  status: string;
  createdAt: string;
  signedAt: string | null;
  uploadedById: number | null;
  signers: Signer[];
  fields: Field[];
  cc?: CcRecipient[];
}

interface Signer {
  id: number;
  name: string;
  email: string;
  signerOrder: number;
  status: string;
  color: string;
  completedAt: string | null;
}

interface Field {
  id: number;
  signerId: number;
  fieldType: string;
  page: number;
  filledImage: string | null;
}

interface AuditEntry {
  id: number;
  actorName: string;
  actorEmail: string;
  eventType: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

type TFn = (key: string, ...args: any[]) => string;

function getStatusBadge(status: string, t: TFn): React.ReactNode {
  switch (status) {
    case "draft": return <Badge variant="secondary" className="gap-1.5"><Clock className="h-3.5 w-3.5" />{t("status_draft")}</Badge>;
    case "pending": return <Badge className="gap-1.5 bg-yellow-500 hover:bg-yellow-600"><Clock className="h-3.5 w-3.5" />{t("status_pending")}</Badge>;
    case "in_progress": return <Badge className="gap-1.5 bg-blue-500 hover:bg-blue-600"><PenLine className="h-3.5 w-3.5" />{t("status_in_progress")}</Badge>;
    case "signed": return <Badge className="gap-1.5 bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3.5 w-3.5" />{t("status_signed")}</Badge>;
    case "completed": return <Badge className="gap-1.5 bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3.5 w-3.5" />{t("status_completed")}</Badge>;
    case "rejected": return <Badge variant="destructive" className="gap-1.5"><XCircle className="h-3.5 w-3.5" />{t("status_rejected")}</Badge>;
    case "voided": return <Badge variant="outline" className="gap-1.5 text-muted-foreground border-muted-foreground/50"><Ban className="h-3.5 w-3.5" />{t("status_voided")}</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
}

function getSignerStatusBadge(status: string, t: TFn): React.ReactNode {
  switch (status) {
    case "completed": return <Badge className="text-xs gap-1"><CheckCircle2 className="h-3 w-3" />{t("doc_signer_signed")}</Badge>;
    case "rejected": return <Badge variant="destructive" className="text-xs gap-1"><XCircle className="h-3 w-3" />{t("doc_signer_rejected")}</Badge>;
    case "pending": return <Badge variant="secondary" className="text-xs">{t("doc_signer_pending")}</Badge>;
    default: return <Badge variant="secondary" className="text-xs capitalize">{status}</Badge>;
  }
}

const EVENT_LABELS: Record<string, string> = {
  uploaded: "Document uploaded",
  field_placed: "Signing field placed",
  signed: "Document signed",
  field_filled: "Field filled",
  signer_completed: "Signer completed all fields",
  document_completed: "Document signing completed",
  sent_for_signing: "Sent for signing",
  downloaded: "Document downloaded",
};

export default function DocumentDetail() {
  const [, params] = useRoute("/documents/:id");
  const docId = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();

  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [reminding, setReminding] = useState(false);

  useEffect(() => {
    loadDocument();
  }, [docId]);

  async function loadDocument() {
    try {
      const [docRes, auditRes] = await Promise.all([
        fetch(`/api/documents/${docId}`, { credentials: "include" }),
        fetch(`/api/documents/${docId}/audit`, { credentials: "include" }),
      ]);

      if (!docRes.ok) { setLocation("/documents"); return; }

      const docData: DocDetail = await docRes.json();
      const auditData: AuditEntry[] = auditRes.ok ? await auditRes.json() : [];

      setDoc(docData);
      setAuditLog(auditData);

      if (docData.filePath) {
        renderFirstPage(`/api/documents/${docId}/file`);
      }
    } catch {
      toast({ variant: "destructive", title: "Error loading document" });
    } finally {
      setLoading(false);
    }
  }

  async function renderFirstPage(url: string) {
    try {
      const pdf = await pdfjsLib.getDocument({ url, withCredentials: true }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const renderCtx = canvas.getContext("2d")!; await page.render({ canvasContext: renderCtx, viewport, canvas }).promise;
      setPdfPreview(canvas.toDataURL("image/png"));
    } catch {
      // preview failed, ignore
    }
  }

  async function downloadDoc(mode: "doc" | "coc" | "merged") {
    setDownloading(true);
    try {
      const res = await fetch(`/api/documents/${docId}/download?mode=${mode}`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = mode === "coc" ? `COC_${doc?.fileName}` : `Signed_${doc?.fileName}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ variant: "destructive", title: "Download failed" });
    } finally {
      setDownloading(false);
    }
  }

  async function deleteDocument() {
    setDeletingDoc(true);
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "Document deleted" });
      setLocation("/documents");
    } catch {
      toast({ variant: "destructive", title: "Failed to delete document" });
    } finally {
      setDeletingDoc(false);
      setDeleteOpen(false);
    }
  }

  async function handleRemind() {
    setReminding(true);
    try {
      const res = await fetch(`/api/documents/${docId}/remind`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed");
      }
      const data = await res.json();
      toast({
        title: t("doc_remind_sent"),
        description: `${data.reminded} signer${data.reminded !== 1 ? "s" : ""} notified`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: t("doc_remind_error"), description: e.message });
    } finally {
      setReminding(false);
    }
  }

  async function handleVoid() {
    setVoiding(true);
    try {
      const res = await fetch(`/api/documents/${docId}/void`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to void document");
      }
      toast({ title: "Document voided", description: "All parties have been notified." });
      setVoidOpen(false);
      setVoidReason("");
      loadDocument();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to void", description: e.message });
    } finally {
      setVoiding(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="col-span-2 h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-8 text-center py-20">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground opacity-30 mb-4" />
        <h2 className="text-xl font-bold">Document not found</h2>
        <Button className="mt-4" onClick={() => setLocation("/documents")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>
    );
  }

  const isOwner = doc.uploadedById === user?.id;
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const mySigner = doc.signers.find((s) => s.email === user?.email);
  const isCC = doc.cc?.some((cc) => cc.email === user?.email);
  const isInvolved = isOwner || isAdmin || !!mySigner || isCC;
  const canEdit = (isOwner || isAdmin) && doc.status === "draft";
  const canVoid = (isOwner || isAdmin) && ["draft", "pending", "in_progress"].includes(doc.status);
  const canRemind = (isOwner || isAdmin)
    && ["pending", "in_progress"].includes(doc.status)
    && doc.signers.some((s) => s.status === "pending");
  const canSign = !!mySigner && mySigner.status !== "completed" && doc.status === "in_progress";
  const canDownload = isInvolved && (doc.status === "completed" || doc.status === "signed");
  const myFields = doc.fields.filter((f) => f.signerId === mySigner?.id);
  const myUnfilledFields = myFields.filter((f) => !f.filledImage);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/documents")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> {t("doc_back")}
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{doc.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {doc.fileName} · {formatBytes(doc.fileSize)} · Added {formatDate(doc.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {getStatusBadge(doc.status, t)}

          {canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => setLocation(`/documents/${docId}/editor`)}>
                <Edit2 className="h-4 w-4 mr-1.5" /> {t("doc_edit")}
              </Button>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1.5" /> {t("delete")}
              </Button>
            </>
          )}

          {canVoid && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/50 hover:bg-destructive/10"
              onClick={() => { setVoidReason(""); setVoidOpen(true); }}
            >
              <Ban className="h-4 w-4 mr-1.5" /> {t("doc_void")}
            </Button>
          )}

          {canRemind && (
            <Button
              size="sm"
              variant="outline"
              disabled={reminding}
              onClick={handleRemind}
            >
              {reminding
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />{t("doc_reminding")}</>
                : <><BellRing className="h-4 w-4 mr-1.5" />{t("doc_remind")}</>}
            </Button>
          )}

          {canSign && (
            <Button size="sm" onClick={() => setLocation(`/documents/${docId}/sign`)}>
              <PenLine className="h-4 w-4 mr-1.5" />
              {t("doc_sign")} {myUnfilledFields.length > 0 ? `(${myUnfilledFields.length} left)` : ""}
            </Button>
          )}

          {canDownload && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={downloading}>
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
                  {t("download")} <ChevronDown className="h-3.5 w-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => downloadDoc("doc")}>
                  <FileText className="h-4 w-4 mr-2" /> Signed PDF only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadDoc("coc")}>
                  <ClipboardList className="h-4 w-4 mr-2" /> Certificate of Completion (COC)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadDoc("merged")}>
                  <Download className="h-4 w-4 mr-2" /> Signed PDF + COC (merged)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {doc.description && (
        <p className="text-sm text-muted-foreground border-l-2 border-border pl-3">{doc.description}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Document Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex justify-center bg-muted/30 min-h-64">
              {pdfPreview ? (
                <img src={pdfPreview} alt="PDF preview" className="max-w-full shadow-md border" />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                  <FileText className="h-10 w-10 opacity-30" />
                  <p className="text-sm">No preview available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {auditLog.length > 0 && (
            <Card>
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" /> Audit Trail / Chain of Custody
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{EVENT_LABELS[entry.eventType] ?? entry.eventType}</p>
                        <p className="text-xs text-muted-foreground">{entry.actorName} · {entry.actorEmail}</p>
                        {entry.details && Object.keys(entry.details).length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {Object.entries(entry.details).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDate(entry.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Signers ({doc.signers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {doc.signers.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-4 italic">No signers assigned yet</p>
              ) : (
                <div className="divide-y">
                  {doc.signers.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ background: s.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                        {s.completedAt && (
                          <p className="text-xs text-green-600">{formatDate(s.completedAt)}</p>
                        )}
                      </div>
                      {getSignerStatusBadge(s.status, t)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-sm space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="capitalize font-medium">{doc.status.replace("_", " ")}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fields</span>
                <span className="font-medium">{doc.fields.length} placed</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Filled</span>
                <span className="font-medium">{doc.fields.filter((f) => f.filledImage).length}/{doc.fields.length}</span>
              </div>
              {doc.signedAt && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-medium">{formatDate(doc.signedAt)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {doc.cc && doc.cc.length > 0 && (
            <Card>
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  CC / Observers
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-1">
                {doc.cc.map((cc) => (
                  <div key={cc.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cc.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{cc.email}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize shrink-0">{cc.role}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog open={voidOpen} onOpenChange={(open) => { if (!open) setVoidOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" /> {t("doc_void_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("doc_void_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2 space-y-1.5">
            <Label className="text-sm font-medium">{t("doc_void_reason_label")}</Label>
            <Textarea
              placeholder={t("doc_void_reason_placeholder")}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voiding}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={voiding}
              onClick={handleVoid}
            >
              {voiding ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("doc_voiding")}</> : <><Ban className="h-4 w-4 mr-2" />{t("doc_void_btn")}</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{doc.title}</strong> and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={deleteDocument}
              disabled={deletingDoc}
            >
              {deletingDoc ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
