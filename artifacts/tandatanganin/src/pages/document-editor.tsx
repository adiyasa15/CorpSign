import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ArrowLeft, PenLine, Fingerprint, Stamp, Plus, Trash2,
  Send, Loader2, X, UserPlus, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

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

interface PageImg {
  dataUrl: string;
  width: number;
  height: number;
}

const FIELD_DEFAULTS: Record<string, { width: number; height: number }> = {
  signature: { width: 18, height: 6 },
  initial: { width: 10, height: 6 },
  stamp: { width: 12, height: 12 },
};

const FIELD_LABELS: Record<string, string> = {
  signature: "Signature",
  initial: "Initial",
  stamp: "Stamp",
};

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [doc, setDoc] = useState<{ title: string; status: string; filePath: string | null } | null>(null);
  const [pages, setPages] = useState<PageImg[]>([]);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeSignerId, setActiveSignerId] = useState<number | null>(null);

  const [addSignerOpen, setAddSignerOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [addingSign, setAddingSign] = useState(false);

  const [sending, setSending] = useState(false);

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    loadDocument();
  }, [docId]);

  async function loadDocument() {
    try {
      const [docRes, signersRes, fieldsRes] = await Promise.all([
        fetch(`/api/documents/${docId}`, { credentials: "include" }),
        fetch(`/api/documents/${docId}/signers`, { credentials: "include" }),
        fetch(`/api/documents/${docId}/fields`, { credentials: "include" }),
      ]);

      if (!docRes.ok) { setLocation("/documents"); return; }

      const docData = await docRes.json();
      const signersData = signersRes.ok ? await signersRes.json() : [];
      const fieldsData = fieldsRes.ok ? await fieldsRes.json() : [];

      setDoc(docData);
      setSigners(signersData);
      setFields(fieldsData);

      if (docData.filePath) {
        await renderPDF(`/api/documents/${docId}/file`);
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to load document" });
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

  const handlePageClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>, pageIndex: number) => {
    if (!activeTool || !activeSignerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const def = FIELD_DEFAULTS[activeTool] ?? { width: 15, height: 6 };

    const x = Math.max(0, Math.min(xPct - def.width / 2, 100 - def.width));
    const y = Math.max(0, Math.min(yPct - def.height / 2, 100 - def.height));

    try {
      const res = await fetch(`/api/documents/${docId}/fields`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerId: activeSignerId, fieldType: activeTool, page: pageIndex, x, y, width: def.width, height: def.height }),
      });
      if (!res.ok) throw new Error("Failed to add field");
      const field = await res.json() as Field;
      setFields((prev) => [...prev, field]);
    } catch {
      toast({ variant: "destructive", title: "Failed to place field" });
    }
  }, [activeTool, activeSignerId, docId]);

  const deleteField = async (fieldId: number) => {
    try {
      await fetch(`/api/documents/${docId}/fields/${fieldId}`, { method: "DELETE", credentials: "include" });
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
    } catch {
      toast({ variant: "destructive", title: "Failed to delete field" });
    }
  };

  const addSigner = async () => {
    if (!signerName.trim() || !signerEmail.trim()) return;
    setAddingSign(true);
    try {
      const res = await fetch(`/api/documents/${docId}/signers`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: signerName.trim(), email: signerEmail.trim() }),
      });
      if (!res.ok) throw new Error("Failed to add signer");
      const signer = await res.json() as Signer;
      setSigners((prev) => [...prev, signer]);
      setActiveSignerId(signer.id);
      setSignerName(""); setSignerEmail("");
      setAddSignerOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to add signer" });
    } finally {
      setAddingSign(false);
    }
  };

  const removeSigner = async (signerId: number) => {
    try {
      await fetch(`/api/documents/${docId}/signers/${signerId}`, { method: "DELETE", credentials: "include" });
      setSigners((prev) => prev.filter((s) => s.id !== signerId));
      setFields((prev) => prev.filter((f) => f.signerId !== signerId));
      if (activeSignerId === signerId) setActiveSignerId(null);
    } catch {
      toast({ variant: "destructive", title: "Failed to remove signer" });
    }
  };

  const sendForSigning = async () => {
    if (signers.length === 0) { toast({ variant: "destructive", title: "Add at least one signer" }); return; }
    if (fields.length === 0) { toast({ variant: "destructive", title: "Place at least one field" }); return; }
    setSending(true);
    try {
      const res = await fetch(`/api/documents/${docId}/send`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to send");
      toast({ title: "Sent for signing!", description: "Signers can now fill their fields." });
      setLocation(`/documents/${docId}`);
    } catch {
      toast({ variant: "destructive", title: "Failed to send for signing" });
    } finally {
      setSending(false);
    }
  };

  const activeSigner = signers.find((s) => s.id === activeSignerId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-muted/20">
      <div className="w-72 bg-background border-r flex flex-col shrink-0">
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/documents")} className="mb-3 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h2 className="font-semibold text-sm truncate">{doc?.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Place fields then send for signing</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Signers</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddSignerOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {signers.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No signers added yet</p>
              )}
              <div className="space-y-1.5">
                {signers.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setActiveSignerId(s.id)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      activeSignerId === s.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"
                    }`}
                  >
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                    </div>
                    {activeSignerId === s.id && <ChevronRight className="h-3.5 w-3.5 text-primary" />}
                    <Button
                      variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); removeSigner(s.id); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Add Fields</p>
              {!activeSignerId ? (
                <p className="text-xs text-muted-foreground italic">Select a signer first</p>
              ) : (
                <div className="space-y-1.5">
                  {[
                    { type: "signature", icon: PenLine, label: "Signature" },
                    { type: "initial", icon: Fingerprint, label: "Initial" },
                    { type: "stamp", icon: Stamp, label: "Stamp" },
                  ].map(({ type, icon: Icon, label }) => (
                    <Button
                      key={type}
                      variant={activeTool === type ? "default" : "outline"}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setActiveTool(activeTool === type ? null : type)}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {label}
                      {activeTool === type && <Badge className="ml-auto text-[10px] px-1 py-0">Placing</Badge>}
                    </Button>
                  ))}
                  {activeTool && (
                    <p className="text-xs text-primary mt-1">
                      Click anywhere on the document to place a {activeTool} field for <strong>{activeSigner?.name}</strong>
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Fields ({fields.length})
              </p>
              <div className="space-y-1">
                {fields.map((f) => {
                  const signer = signers.find((s) => s.id === f.signerId);
                  return (
                    <div key={f.id} className="flex items-center gap-1.5 text-xs py-1">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: signer?.color ?? "#aaa" }} />
                      <span className="capitalize flex-1 truncate">{FIELD_LABELS[f.fieldType] ?? f.fieldType} — P{f.page + 1}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive" onClick={() => deleteField(f.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <Button
            className="w-full"
            onClick={sendForSigning}
            disabled={sending || signers.length === 0 || fields.length === 0}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Send for Signing
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center gap-6 py-6 px-4">
          {pages.length === 0 && (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No PDF file attached to this document
            </div>
          )}
          {pages.map((page, pageIndex) => (
            <div key={pageIndex} className="relative shadow-xl border border-border bg-white" style={{ width: page.width, height: page.height }}>
              <img src={page.dataUrl} alt={`Page ${pageIndex + 1}`} style={{ width: page.width, height: page.height, display: "block" }} draggable={false} />
              <div
                ref={(el) => { pageRefs.current[pageIndex] = el; }}
                className={`absolute inset-0 ${activeTool && activeSignerId ? "cursor-crosshair" : ""}`}
                style={{ width: page.width, height: page.height }}
                onClick={(e) => handlePageClick(e, pageIndex)}
              >
                {fields.filter((f) => f.page === pageIndex).map((field) => {
                  const signer = signers.find((s) => s.id === field.signerId);
                  const color = signer?.color ?? "#2563eb";
                  return (
                    <div
                      key={field.id}
                      className="absolute group border-2 rounded flex items-center justify-center"
                      style={{
                        left: `${field.x}%`, top: `${field.y}%`,
                        width: `${field.width}%`, height: `${field.height}%`,
                        borderColor: color,
                        background: `${color}18`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {field.filledImage ? (
                        <img src={field.filledImage} className="w-full h-full object-contain p-0.5" />
                      ) : (
                        <span className="text-[10px] font-semibold px-1 truncate" style={{ color }}>
                          {FIELD_LABELS[field.fieldType] ?? field.fieldType}
                        </span>
                      )}
                      <button
                        className="absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full bg-destructive text-white hidden group-hover:flex items-center justify-center shadow-sm"
                        onClick={(e) => { e.stopPropagation(); deleteField(field.id); }}
                      >
                        <X className="h-3 w-3" />
                      </button>
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

      <Dialog open={addSignerOpen} onOpenChange={setAddSignerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Add Signer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSignerOpen(false)}>Cancel</Button>
            <Button onClick={addSigner} disabled={!signerName.trim() || !signerEmail.trim() || addingSign}>
              {addingSign ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Add Signer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
