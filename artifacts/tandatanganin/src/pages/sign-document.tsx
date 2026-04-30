import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Loader2, PenLine, XCircle, Fingerprint, Stamp, Upload, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import DrawingPad, { DrawingPadHandle } from "@/components/signature-pad";

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

  const sigPadRef = useRef<DrawingPadHandle | null>(null);
  const sdUploadRef = useRef<HTMLInputElement | null>(null);

  const [signDialogTab, setSignDialogTab] = useState<"saved" | "draw" | "upload">("draw");
  const [sdUploadImage, setSdUploadImage] = useState<string | null>(null);
  const [sdSaveToProfile, setSdSaveToProfile] = useState(true);
  const [sdSaving, setSdSaving] = useState(false);

  // DocuSign-style guided flow
  const [started, setStarted] = useState(false);
  const [currentFieldId, setCurrentFieldId] = useState<number | null>(null);
  const fieldRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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

  const closeSdDialog = () => {
    setSignDialogOpen(false);
    setSdUploadImage(null);
    setSdSaveToProfile(true);
    sigPadRef.current?.clear();
  };

  const scrollToField = useCallback((fieldId: number) => {
    const el = fieldRefs.current.get(fieldId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const sortByDocOrder = (fs: Field[]) =>
    [...fs].sort((a, b) =>
      a.page !== b.page ? a.page - b.page : a.y !== b.y ? a.y - b.y : a.x - b.x,
    );

  const handleStartSigning = useCallback(() => {
    setStarted(true);
    const pending = sortByDocOrder(
      fields.filter((f) => f.signerId === mySigner?.id && !f.filledImage),
    );
    if (pending[0]) {
      setCurrentFieldId(pending[0].id);
      setTimeout(() => scrollToField(pending[0].id), 200);
    }
  }, [fields, mySigner, scrollToField]);

  const openFieldDialog = (field: Field) => {
    if (!mySigner || field.signerId !== mySigner.id) return;

    const defaultTpl = templates.find(
      (t) => t.templateType === field.fieldType && t.isDefault,
    );
    if (defaultTpl) {
      fillField(defaultTpl.imageData);
      return;
    }

    const fieldTpls = templates.filter((t) => t.templateType === field.fieldType);
    const isStamp = field.fieldType === "stamp";
    setSignDialogTab(fieldTpls.length > 0 ? "saved" : isStamp ? "upload" : "draw");
    setSdUploadImage(null);
    setSdSaveToProfile(true);
    setActiveField(field);
    setSignDialogOpen(true);
  };

  const applyFromDialog = async () => {
    if (!activeField) return;
    let imageData = "";

    if (signDialogTab === "draw") {
      if (!sigPadRef.current?.hasContent) {
        toast({ variant: "destructive", title: "Please draw something first" });
        return;
      }
      imageData = sigPadRef.current.getDataUrl();
    } else if (signDialogTab === "upload") {
      if (!sdUploadImage) {
        toast({ variant: "destructive", title: "Please upload an image first" });
        return;
      }
      imageData = sdUploadImage;
    }

    if (!imageData) return;

    if (sdSaveToProfile) {
      setSdSaving(true);
      try {
        const res = await fetch("/api/me/templates", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateType: activeField.fieldType,
            imageData,
            isDefault: true,
          }),
        });
        if (res.ok) {
          const newTpl = (await res.json()) as Template;
          setTemplates((prev) => {
            const cleared = prev.map((t) =>
              t.templateType === activeField.fieldType ? { ...t, isDefault: false } : t,
            );
            return [...cleared, newTpl];
          });
        }
      } catch {
        // save failed — still apply to field
      } finally {
        setSdSaving(false);
      }
    }

    fillField(imageData);
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

      const updatedFields = fields.map((f) => f.id === activeField.id ? { ...f, filledImage: imageData } : f);
      setFields(updatedFields);
      setSignDialogOpen(false);
      setActiveField(null);

      if (result.documentCompleted) {
        toast({ title: "Document complete!", description: "All signers have signed. You can download the signed copy." });
        setDone(true);
        setCurrentFieldId(null);
        await loadDocument();
      } else {
        const myUpdated = updatedFields.filter((f) => f.signerId === mySigner?.id);
        if (myUpdated.every((f) => f.filledImage)) {
          toast({ title: "You've signed all your fields!", description: "Waiting for other signers." });
          setDone(true);
          setCurrentFieldId(null);
        } else {
          // Advance to next pending field in document order
          const nextPending = sortByDocOrder(
            updatedFields.filter((f) => f.signerId === mySigner?.id && !f.filledImage),
          );
          if (nextPending[0]) {
            setCurrentFieldId(nextPending[0].id);
            setTimeout(() => scrollToField(nextPending[0].id), 400);
          }
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to submit signature" });
    } finally {
      setSubmitting(false);
    }
  };

  const myFields = fields.filter((f) => f.signerId === mySigner?.id);
  const myPendingFields = sortByDocOrder(myFields.filter((f) => !f.filledImage));
  const pendingCount = myPendingFields.length;

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
                    } ${f.id === currentFieldId ? "bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-400" : ""}`}
                    onClick={() => {
                      if (!f.filledImage) {
                        setCurrentFieldId(f.id);
                        setTimeout(() => scrollToField(f.id), 50);
                        if (!started) setStarted(true);
                        openFieldDialog(f);
                      }
                    }}
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

      {/* Right side: progress bar + scrollable PDF */}
      <div className="flex-1 flex flex-col overflow-hidden">

      {/* Top progress / action bar */}
      <div className="bg-background border-b px-4 py-2.5 flex items-center gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{doc?.title}</p>
          <p className="text-xs text-muted-foreground">
            {done
              ? "All your fields are signed ✓"
              : started
              ? `${pendingCount} field${pendingCount !== 1 ? "s" : ""} remaining — click the highlighted box`
              : `${pendingCount} field${pendingCount !== 1 ? "s" : ""} require your signature`}
          </p>
        </div>
        {!done && !started && (
          <Button
            onClick={handleStartSigning}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-2 shrink-0"
          >
            <PenLine className="h-4 w-4" /> Start Signing
          </Button>
        )}
        {!done && started && pendingCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => {
              if (currentFieldId) scrollToField(currentFieldId);
              else if (myPendingFields[0]) scrollToField(myPendingFields[0].id);
            }}
          >
            Jump to Next →
          </Button>
        )}
        {done && (
          <Button size="sm" variant="outline" onClick={() => setLocation(`/documents/${docId}`)} className="shrink-0 gap-1.5">
            View Document →
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center gap-6 py-6 px-4">

          {/* Start Signing banner — shown before user clicks Start */}
          {!done && !started && pages.length > 0 && (
            <div
              className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-5 flex items-center justify-between gap-4 shadow"
              style={{ width: pages[0].width }}
            >
              <div className="space-y-1">
                <p className="font-bold text-amber-900 dark:text-amber-200 text-base">
                  Ready to sign?
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  You have <strong>{pendingCount} field{pendingCount !== 1 ? "s" : ""}</strong> to complete in this document.
                  Click <strong>Start Signing</strong> to begin — we'll guide you through each one.
                </p>
              </div>
              <Button
                onClick={handleStartSigning}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold gap-2 shrink-0 text-base px-5 py-5"
              >
                <PenLine className="h-5 w-5" /> Start Signing
              </Button>
            </div>
          )}

          {pages.map((page, pageIndex) => (
            <div key={pageIndex} className="relative shadow-xl border border-border bg-white" style={{ width: page.width, height: page.height }}>
              <img src={page.dataUrl} alt={`Page ${pageIndex + 1}`} style={{ width: page.width, height: page.height, display: "block" }} draggable={false} />
              <div className="absolute inset-0" style={{ width: page.width, height: page.height }}>
                {myFields.filter((f) => f.page === pageIndex).map((field) => {
                  const color = mySigner?.color ?? "#2563eb";
                  const isCurrent = field.id === currentFieldId && !field.filledImage;
                  return (
                    <div
                      key={field.id}
                      ref={(el) => {
                        if (el) fieldRefs.current.set(field.id, el);
                        else fieldRefs.current.delete(field.id);
                      }}
                      className={`absolute rounded flex items-center justify-center transition-all overflow-hidden ${
                        !field.filledImage ? "cursor-pointer" : ""
                      } ${isCurrent ? "animate-pulse" : ""}`}
                      style={{
                        left: `${field.x}%`, top: `${field.y}%`,
                        width: `${field.width}%`, height: `${field.height}%`,
                        border: isCurrent
                          ? "2.5px solid #f59e0b"
                          : field.filledImage
                          ? `1.5px solid ${color}55`
                          : `2px dashed ${color}`,
                        background: field.filledImage
                          ? "transparent"
                          : isCurrent
                          ? "#fef3c720"
                          : `${color}12`,
                        boxShadow: isCurrent ? "0 0 0 3px #fef3c7, 0 0 12px #f59e0b88" : undefined,
                      }}
                      onClick={() => !field.filledImage && openFieldDialog(field)}
                    >
                      {field.filledImage ? (
                        <img src={field.filledImage} className="w-full h-full object-contain p-0.5" draggable={false} />
                      ) : isCurrent ? (
                        <span className="text-[11px] font-bold px-1 truncate text-amber-700 flex items-center gap-0.5">
                          ✍ Sign Here
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-1 truncate" style={{ color }}>
                          {FIELD_LABELS[field.fieldType] ?? "Sign"}
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

      </div>{/* end right side */}

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
          <div className="px-1 pb-2 space-y-1.5">
            <Label className="text-sm font-medium">
              Reason <span className="text-destructive">*</span>
              <span className="text-muted-foreground font-normal text-xs ml-1">(required — will be included in the notification email)</span>
            </Label>
            <Textarea
              className="mt-1.5"
              placeholder="Explain why you are rejecting this document..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
            {rejectReason.trim() === "" && (
              <p className="text-xs text-destructive">Please provide a reason before rejecting.</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={rejecting || rejectReason.trim() === ""}
              onClick={handleReject}
            >
              {rejecting ? "Rejecting..." : "Reject Document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden file input for sign-dialog upload */}
      <input
        ref={sdUploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => setSdUploadImage(ev.target?.result as string);
          reader.readAsDataURL(file);
          e.target.value = "";
        }}
      />

      <Dialog open={signDialogOpen} onOpenChange={(open) => { if (!open) closeSdDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeField?.fieldType === "signature" && <PenLine className="h-4 w-4" />}
              {activeField?.fieldType === "initial" && <Fingerprint className="h-4 w-4" />}
              {activeField?.fieldType === "stamp" && <Stamp className="h-4 w-4" />}
              {activeField ? `Your ${FIELD_LABELS[activeField.fieldType] ?? "Signature"}` : "Sign"}
            </DialogTitle>
          </DialogHeader>

          {(() => {
            const fieldTpls = templates.filter((t) => t.templateType === activeField?.fieldType);
            const isStampField = activeField?.fieldType === "stamp";
            return (
              <Tabs value={signDialogTab} onValueChange={(v) => setSignDialogTab(v as typeof signDialogTab)}>
                <TabsList className="w-full">
                  {fieldTpls.length > 0 && (
                    <TabsTrigger value="saved" className="flex-1">Saved</TabsTrigger>
                  )}
                  {!isStampField && (
                    <TabsTrigger value="draw" className="flex-1">Draw</TabsTrigger>
                  )}
                  <TabsTrigger value="upload" className="flex-1">{isStampField ? "Upload Stamp" : "Upload"}</TabsTrigger>
                </TabsList>

                {fieldTpls.length > 0 && (
                  <TabsContent value="saved" className="pt-3">
                    <p className="text-xs text-muted-foreground mb-2">Click a saved profile to apply it instantly</p>
                    <div className="grid grid-cols-2 gap-3">
                      {fieldTpls.map((tpl) => (
                        <button
                          key={tpl.id}
                          disabled={submitting}
                          className="border rounded-lg p-2 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                          onClick={() => fillField(tpl.imageData)}
                        >
                          <img src={tpl.imageData} className="w-full h-16 object-contain" />
                          {tpl.name && <p className="text-xs text-center mt-1 text-muted-foreground">{tpl.name}</p>}
                          {tpl.isDefault && <Badge className="text-[10px] mx-auto block w-fit mt-1">Default</Badge>}
                        </button>
                      ))}
                    </div>
                  </TabsContent>
                )}

                <TabsContent value="draw" className="pt-3 space-y-3">
                  {fieldTpls.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      You don't have a saved {activeField?.fieldType ?? "signature"} yet. Draw one below.
                    </p>
                  )}
                  <div className="border rounded-lg overflow-hidden">
                    <DrawingPad ref={sigPadRef} height={160} />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={sdSaveToProfile}
                      onChange={(e) => setSdSaveToProfile(e.target.checked)}
                    />
                    Save as my {activeField?.fieldType ?? "signature"} profile (auto-apply next time)
                  </label>
                </TabsContent>

                <TabsContent value="upload" className="pt-3 space-y-3">
                  {fieldTpls.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      You don't have a saved {activeField?.fieldType ?? "signature"} yet. Upload an image below.
                    </p>
                  )}
                  {sdUploadImage ? (
                    <div className="relative border rounded-lg p-3 flex items-center justify-center bg-muted/20" style={{ height: 160 }}>
                      <img src={sdUploadImage} className="max-h-full max-w-full object-contain" alt="Uploaded" />
                      <button
                        className="absolute top-2 right-2 bg-background border rounded-full p-0.5 hover:bg-muted"
                        onClick={() => setSdUploadImage(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      style={{ height: 160 }}
                      onClick={() => sdUploadRef.current?.click()}
                    >
                      <Upload className="h-7 w-7" />
                      <span className="text-sm">Click to upload an image</span>
                      <span className="text-xs">PNG, JPG, or SVG</span>
                    </button>
                  )}
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={sdSaveToProfile}
                      onChange={(e) => setSdSaveToProfile(e.target.checked)}
                    />
                    Save as my {activeField?.fieldType ?? "signature"} profile (auto-apply next time)
                  </label>
                </TabsContent>
              </Tabs>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={closeSdDialog}>Cancel</Button>
            {signDialogTab !== "saved" && (
              <Button
                disabled={submitting || sdSaving}
                onClick={applyFromDialog}
              >
                {(submitting || sdSaving) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Apply
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
