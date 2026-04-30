import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Loader2, PenLine, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import SignaturePad from "@/components/signature-pad";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

interface Signer {
  id: number;
  name: string;
  email: string;
  signerOrder: number;
  status: string;
  color: string;
}

interface Field {
  id: number;
  signerId: number;
  fieldType: string;
  page: number;
  x: number; y: number; width: number; height: number;
  filledImage: string | null;
}

interface Template {
  id: number;
  templateType: string;
  name: string | null;
  imageData: string;
  isDefault: boolean;
}

interface PageImg {
  dataUrl: string;
  width: number;
  height: number;
}

const FIELD_LABELS: Record<string, string> = {
  signature: "Signature",
  initial: "Initial",
  stamp: "Stamp",
};

export default function SignDocument() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [doc, setDoc] = useState<{ title: string; status: string } | null>(null);
  const [pages, setPages] = useState<PageImg[]>([]);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [mySigner, setMySigner] = useState<Signer | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeField, setActiveField] = useState<Field | null>(null);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const sigPadRef = useRef<{ getDataUrl: () => string; clear: () => void } | null>(null);

  useEffect(() => {
    loadDocument();
  }, [docId]);

  async function loadDocument() {
    try {
      const [docRes, signersRes, fieldsRes, tplRes] = await Promise.all([
        fetch(`/api/documents/${docId}`, { credentials: "include" }),
        fetch(`/api/documents/${docId}/signers`, { credentials: "include" }),
        fetch(`/api/documents/${docId}/fields`, { credentials: "include" }),
        fetch("/api/me/templates", { credentials: "include" }),
      ]);

      if (!docRes.ok) { setLocation("/documents"); return; }

      const docData = await docRes.json();
      const signersData: Signer[] = signersRes.ok ? await signersRes.json() : [];
      const fieldsData: Field[] = fieldsRes.ok ? await fieldsRes.json() : [];
      const tplData: Template[] = tplRes.ok ? await tplRes.json() : [];

      setDoc(docData);
      setSigners(signersData);
      setFields(fieldsData);
      setTemplates(tplData);

      const me = signersData.find((s) => s.email === user?.email);
      setMySigner(me ?? null);

      const myFields = fieldsData.filter((f) => f.signerId === me?.id);
      const allFilled = myFields.length > 0 && myFields.every((f) => f.filledImage);
      setDone(allFilled);

      if (docData.filePath !== null) {
        await renderPDF(`/api/documents/${docId}/file`);
      }
    } catch {
      toast({ variant: "destructive", title: "Error loading document" });
    } finally {
      setLoading(false);
    }
  }

  async function renderPDF(url: string) {
    const pdf = await pdfjsLib.getDocument({ url, withCredentials: true }).promise;
    const rendered: PageImg[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx!, viewport, canvas }).promise;
      rendered.push({ dataUrl: canvas.toDataURL("image/png"), width: viewport.width, height: viewport.height });
    }
    setPages(rendered);
  }

  const handleReject = async () => {
    setRejecting(true);
    try {
      const res = await fetch(`/api/documents/${docId}/reject`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      if (!res.ok) throw new Error("Failed to reject document");
      toast({ title: "Document rejected", description: "The uploader and all parties have been notified." });
      setRejectDialogOpen(false);
      setLocation("/documents");
    } catch {
      toast({ variant: "destructive", title: "Failed to reject document" });
    } finally {
      setRejecting(false);
    }
  };

  const openFieldDialog = (field: Field) => {
    if (!mySigner || field.signerId !== mySigner.id) return;
    setActiveField(field);
    setSignDialogOpen(true);
  };

  const fillField = async (imageData: string) => {
    if (!activeField) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/documents/${docId}/fields/${activeField.id}/fill`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });
      if (!res.ok) throw new Error("Failed to fill field");
      const result = await res.json() as { documentCompleted: boolean };

      setFields((prev) => prev.map((f) => f.id === activeField.id ? { ...f, filledImage: imageData } : f));
      setSignDialogOpen(false);
      setActiveField(null);

      if (result.documentCompleted) {
        toast({ title: "Document complete!", description: "All signers have signed. You can download the signed copy." });
        setDone(true);
        await loadDocument();
      } else {
        const updated = fields.map((f) => f.id === activeField.id ? { ...f, filledImage: imageData } : f);
        const myFields = updated.filter((f) => f.signerId === mySigner?.id);
        if (myFields.every((f) => f.filledImage)) {
          toast({ title: "You've signed all your fields!", description: "Waiting for other signers." });
          setDone(true);
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to submit signature" });
    } finally {
      setSubmitting(false);
    }
  };

  const myFields = fields.filter((f) => f.signerId === mySigner?.id);
  const myPendingFields = myFields.filter((f) => !f.filledImage);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!mySigner) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center space-y-4">
        <h2 className="text-xl font-bold">Not a signer</h2>
        <p className="text-muted-foreground">You are not listed as a signer for this document.</p>
        <Button onClick={() => setLocation("/documents")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-muted/20">
      <div className="w-64 bg-background border-r flex flex-col shrink-0">
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/documents/${docId}`)} className="mb-3 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h2 className="font-semibold text-sm truncate">{doc?.title}</h2>
          <p className="text-xs text-muted-foreground">Signing as <strong>{mySigner.name}</strong></p>
        </div>

        <div className="p-4 flex-1 space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-medium text-green-700 dark:text-green-400">All done!</p>
              <p className="text-xs text-muted-foreground">You have signed all your fields.</p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Your Fields ({myPendingFields.length} pending)
              </p>
              <div className="space-y-1.5">
                {myFields.map((f) => (
                  <div
                    key={f.id}
                    className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded cursor-pointer transition-colors ${
                      f.filledImage ? "text-muted-foreground" : "hover:bg-muted text-foreground"
                    }`}
                    onClick={() => !f.filledImage && openFieldDialog(f)}
                  >
                    {f.filledImage ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <PenLine className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                    <span className="capitalize">{FIELD_LABELS[f.fieldType] ?? f.fieldType} — Page {f.page + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">All Signers</p>
            <div className="space-y-1">
              {signers.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <div className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  <span className="truncate">{s.name}</span>
                  <Badge variant={s.status === "completed" ? "default" : "secondary"} className="ml-auto text-[10px] px-1.5">
                    {s.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Reject button — visible to signer before they complete */}
        {mySigner && !done && doc?.status === "in_progress" && (
          <div className="p-4 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive gap-2"
              onClick={() => setRejectDialogOpen(true)}
            >
              <XCircle className="h-4 w-4" /> Reject Document
            </Button>
          </div>
        )}
        {done && (
          <div className="p-4 border-t">
            <Button variant="outline" className="w-full" size="sm" onClick={() => setLocation(`/documents/${docId}`)}>
              View Document
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center gap-6 py-6 px-4">
          {pages.map((page, pageIndex) => (
            <div key={pageIndex} className="relative shadow-xl border border-border bg-white" style={{ width: page.width, height: page.height }}>
              <img src={page.dataUrl} alt={`Page ${pageIndex + 1}`} style={{ width: page.width, height: page.height, display: "block" }} draggable={false} />
              <div className="absolute inset-0" style={{ width: page.width, height: page.height }}>
                {fields.filter((f) => f.page === pageIndex).map((field) => {
                  const signer = signers.find((s) => s.id === field.signerId);
                  const isMyField = field.signerId === mySigner?.id;
                  const color = signer?.color ?? "#aaa";
                  return (
                    <div
                      key={field.id}
                      className={`absolute border-2 rounded flex items-center justify-center transition-all ${
                        isMyField && !field.filledImage ? "cursor-pointer hover:brightness-95" : ""
                      }`}
                      style={{
                        left: `${field.x}%`, top: `${field.y}%`,
                        width: `${field.width}%`, height: `${field.height}%`,
                        borderColor: color,
                        background: field.filledImage ? "transparent" : `${color}18`,
                        opacity: isMyField ? 1 : 0.5,
                      }}
                      onClick={() => isMyField && !field.filledImage && openFieldDialog(field)}
                    >
                      {field.filledImage ? (
                        <img src={field.filledImage} className="w-full h-full object-contain p-0.5" />
                      ) : (
                        <span className="text-[10px] font-semibold px-1 truncate" style={{ color }}>
                          {isMyField ? `Click to ${FIELD_LABELS[field.fieldType] ?? "sign"}` : `${FIELD_LABELS[field.fieldType] ?? "Field"} — ${signer?.name}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
                Page {pageIndex + 1}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" /> Reject this document?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Rejecting will stop the signing process for all parties. The document uploader and all signers/observers will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Label className="text-sm font-medium">Reason (optional)</Label>
            <Textarea
              className="mt-1.5"
              placeholder="Explain why you are rejecting this document..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={rejecting}
              onClick={handleReject}
            >
              {rejecting ? "Rejecting..." : "Reject Document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {activeField ? FIELD_LABELS[activeField.fieldType] ?? "Sign" : "Sign"}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue={templates.filter((t) => t.templateType === activeField?.fieldType).length > 0 ? "saved" : "draw"}>
            <TabsList className="w-full">
              <TabsTrigger value="draw" className="flex-1">Draw</TabsTrigger>
              {templates.filter((t) => t.templateType === activeField?.fieldType).length > 0 && (
                <TabsTrigger value="saved" className="flex-1">Saved Templates</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="draw" className="pt-3">
              <div className="border rounded-lg overflow-hidden">
                <SignaturePad ref={sigPadRef} height={160} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Draw your {activeField?.fieldType ?? "signature"} above</p>
            </TabsContent>
            <TabsContent value="saved" className="pt-3">
              <div className="grid grid-cols-2 gap-3">
                {templates
                  .filter((t) => t.templateType === activeField?.fieldType)
                  .map((tpl) => (
                    <button
                      key={tpl.id}
                      className="border rounded-lg p-2 hover:border-primary hover:bg-primary/5 transition-colors"
                      onClick={() => fillField(tpl.imageData)}
                    >
                      <img src={tpl.imageData} className="w-full h-16 object-contain" />
                      {tpl.name && <p className="text-xs text-center mt-1 text-muted-foreground">{tpl.name}</p>}
                      {tpl.isDefault && <Badge className="text-[10px] mx-auto block w-fit mt-1">Default</Badge>}
                    </button>
                  ))}
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={submitting}
              onClick={() => {
                const data = sigPadRef.current?.getDataUrl();
                if (data) fillField(data);
              }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
