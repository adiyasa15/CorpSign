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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, PenLine, Fingerprint, Stamp, Plus, Trash2,
  Send, Loader2, X, UserPlus, GripVertical, Mail, AlertTriangle, Shield, QrCode, Link2,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

interface UserSuggestion {
  id: number;
  name: string;
  email: string;
}

interface CcUser {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: string;
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

type InteractState =
  | { type: "drag"; fieldId: number; pageIndex: number; startMouseX: number; startMouseY: number; startFieldX: number; startFieldY: number }
  | { type: "resize"; fieldId: number; pageIndex: number; startMouseX: number; startMouseY: number; startW: number; startH: number }
  | null;

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [doc, setDoc] = useState<{
    title: string; status: string; filePath: string | null;
    sealQrCode: boolean; sealInvisibleLink: boolean; verificationToken: string | null;
  } | null>(null);
  const [sealSaving, setSealSaving] = useState(false);
  const [qrWarnOpen, setQrWarnOpen] = useState(false);
  const [pages, setPages] = useState<PageImg[]>([]);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeSignerId, setActiveSignerId] = useState<number | null>(null);

  const [addSignerOpen, setAddSignerOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsFor, setSuggestionsFor] = useState<"name" | "email" | null>(null);
  const [addingSign, setAddingSign] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dragSignerId, setDragSignerId] = useState<number | null>(null);
  const [dropOverIdx, setDropOverIdx] = useState<number | null>(null);

  const [interactState, setInteractState] = useState<InteractState>(null);
  const interactRef = useRef<InteractState>(null);
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sending, setSending] = useState(false);
  const [warnSignersOpen, setWarnSignersOpen] = useState(false);
  const [signersWithoutFields, setSignersWithoutFields] = useState<Signer[]>([]);

  const [ccUsers, setCcUsers] = useState<CcUser[]>([]);
  const [addCcOpen, setAddCcOpen] = useState(false);
  const [ccSearchQuery, setCcSearchQuery] = useState("");
  const [ccSuggestions, setCcSuggestions] = useState<UserSuggestion[]>([]);
  const [ccSuggestionsOpen, setCcSuggestionsOpen] = useState(false);
  const [addingCc, setAddingCc] = useState(false);
  const ccSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    loadDocument();
  }, [docId]);

  // Escape key cancels active placement tool
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveTool(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function loadDocument() {
    try {
      const [docRes, signersRes, fieldsRes, ccRes] = await Promise.all([
        fetch(`/api/documents/${docId}`, { credentials: "include" }),
        fetch(`/api/documents/${docId}/signers`, { credentials: "include" }),
        fetch(`/api/documents/${docId}/fields`, { credentials: "include" }),
        fetch(`/api/documents/${docId}/cc`, { credentials: "include" }),
      ]);

      if (!docRes.ok) { setLocation("/documents"); return; }

      const docData = await docRes.json();
      const signersData = signersRes.ok ? await signersRes.json() : [];
      const fieldsData = fieldsRes.ok ? await fieldsRes.json() : [];
      const ccData = ccRes.ok ? await ccRes.json() : [];

      setDoc(docData);
      setSigners(signersData);
      setFields(fieldsData);
      setCcUsers(ccData);

      if (docData.filePath) {
        await renderPDF(`/api/documents/${docId}/file`);
      }
    } catch {
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
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      rendered.push({ dataUrl: canvas.toDataURL("image/png"), width: viewport.width, height: viewport.height });
    }
    setPages(rendered);
  }

  const handlePageClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>, pageIndex: number) => {
    if (!activeTool || !activeSignerId) return;
    if (interactRef.current) return;
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
      // Auto-exit placement mode so the user can immediately drag/resize the placed field
      setActiveTool(null);
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

  const saveFieldGeometry = useCallback((fieldId: number, x: number, y: number, width: number, height: number) => {
    if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/documents/${docId}/fields/${fieldId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y, width, height }),
        });
      } catch {
        toast({ variant: "destructive", title: "Failed to save field position" });
      }
    }, 400);
  }, [docId]);

  const startDrag = useCallback((e: React.PointerEvent, field: Field) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const state: InteractState = {
      type: "drag",
      fieldId: field.id,
      pageIndex: field.page,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startFieldX: field.x,
      startFieldY: field.y,
    };
    interactRef.current = state;
    setInteractState(state);
  }, [activeTool]);

  const startResize = useCallback((e: React.PointerEvent, field: Field) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const state: InteractState = {
      type: "resize",
      fieldId: field.id,
      pageIndex: field.page,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startW: field.width,
      startH: field.height,
    };
    interactRef.current = state;
    setInteractState(state);
  }, [activeTool]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>, pageIndex: number) => {
    const state = interactRef.current;
    if (!state || state.pageIndex !== pageIndex) return;

    const container = pageContainerRefs.current[pageIndex];
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const dxPct = ((e.clientX - state.startMouseX) / rect.width) * 100;
    const dyPct = ((e.clientY - state.startMouseY) / rect.height) * 100;

    setFields((prev) => prev.map((f) => {
      if (f.id !== state.fieldId) return f;
      if (state.type === "drag") {
        const newX = Math.max(0, Math.min(state.startFieldX + dxPct, 100 - f.width));
        const newY = Math.max(0, Math.min(state.startFieldY + dyPct, 100 - f.height));
        return { ...f, x: newX, y: newY };
      } else {
        const newW = Math.max(5, Math.min(state.startW + dxPct, 100 - f.x));
        const newH = Math.max(3, Math.min(state.startH + dyPct, 100 - f.y));
        return { ...f, width: newW, height: newH };
      }
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    const state = interactRef.current;
    if (!state) return;
    interactRef.current = null;
    setInteractState(null);

    setFields((prev) => {
      const field = prev.find((f) => f.id === state.fieldId);
      if (field) {
        saveFieldGeometry(field.id, field.x, field.y, field.width, field.height);
      }
      return prev;
    });
  }, [saveFieldGeometry]);

  const searchUsers = useCallback((query: string, field: "name" | "email") => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setSuggestionsFor(field);
    if (query.trim().length < 1) { setUserSuggestions([]); setSuggestionsOpen(false); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
        if (res.ok) {
          const users: UserSuggestion[] = await res.json();
          setUserSuggestions(users);
          setSuggestionsOpen(users.length > 0);
        }
      } catch {
        setUserSuggestions([]);
      }
    }, 250);
  }, []);

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
      setUserSuggestions([]); setSuggestionsOpen(false);
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

  const handleDragStart = (e: React.DragEvent, signerId: number) => {
    setDragSignerId(signerId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropOverIdx(idx);
  };

  const handleDrop = async (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragSignerId === null) return;
    const from = signers.findIndex((s) => s.id === dragSignerId);
    if (from === dropIdx || from === -1) { setDragSignerId(null); setDropOverIdx(null); return; }

    const reordered = [...signers];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIdx, 0, moved);
    const updated = reordered.map((s, i) => ({ ...s, signerOrder: i }));
    setSigners(updated);
    setDragSignerId(null);
    setDropOverIdx(null);

    try {
      await fetch(`/api/documents/${docId}/signers/reorder`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: updated.map((s) => s.id) }),
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to save signer order" });
    }
  };

  const searchCcUsers = useCallback((query: string) => {
    if (ccSearchRef.current) clearTimeout(ccSearchRef.current);
    if (query.trim().length < 1) { setCcSuggestions([]); setCcSuggestionsOpen(false); return; }
    ccSearchRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
        if (res.ok) {
          const users: UserSuggestion[] = await res.json();
          const existing = new Set(ccUsers.map((c) => c.userId));
          setCcSuggestions(users.filter((u) => !existing.has(u.id)));
          setCcSuggestionsOpen(true);
        }
      } catch { setCcSuggestions([]); }
    }, 250);
  }, [ccUsers]);

  const addCcUser = async (userId: number) => {
    setAddingCc(true);
    try {
      const res = await fetch(`/api/documents/${docId}/cc`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to add CC");
      }
      const cc = await res.json() as CcUser;
      setCcUsers((prev) => [...prev, cc]);
      setCcSearchQuery(""); setCcSuggestions([]); setCcSuggestionsOpen(false);
      setAddCcOpen(false);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: (e as Error).message ?? "Failed to add CC" });
    } finally {
      setAddingCc(false);
    }
  };

  const removeCcUser = async (ccId: number) => {
    try {
      await fetch(`/api/documents/${docId}/cc/${ccId}`, { method: "DELETE", credentials: "include" });
      setCcUsers((prev) => prev.filter((c) => c.id !== ccId));
    } catch {
      toast({ variant: "destructive", title: "Failed to remove CC user" });
    }
  };

  const getSealMode = (qr: boolean, link: boolean) => {
    if (qr && link) return "both";
    if (qr) return "qr";
    if (link) return "link";
    return "none";
  };

  const handleSealRadioChange = async (mode: string) => {
    const sealQrCode = mode === "qr" || mode === "both";
    const sealInvisibleLink = mode === "link" || mode === "both";
    setSealSaving(true);
    try {
      const res = await fetch(`/api/documents/${docId}/seal`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sealQrCode, sealInvisibleLink }),
      });
      if (!res.ok) throw new Error("Failed to update seal");
      const data = await res.json();
      setDoc((prev) => prev ? {
        ...prev,
        sealQrCode: data.sealQrCode,
        sealInvisibleLink: data.sealInvisibleLink,
        verificationToken: data.verificationToken,
      } : prev);
    } catch {
      toast({ variant: "destructive", title: "Failed to update seal settings" });
    } finally {
      setSealSaving(false);
    }
  };

  const sendForSigning = async () => {
    if (signers.length === 0) { toast({ variant: "destructive", title: "Add at least one signer" }); return; }
    if (fields.length === 0) { toast({ variant: "destructive", title: "Place at least one field" }); return; }

    // Warn if any signer has no fields
    const withoutFields = signers.filter((s) => !fields.some((f) => f.signerId === s.id));
    if (withoutFields.length > 0) {
      setSignersWithoutFields(withoutFields);
      setWarnSignersOpen(true);
      return;
    }

    // Warn if QR code seal is enabled
    if (doc?.sealQrCode) {
      setQrWarnOpen(true);
      return;
    }

    await doSend();
  };

  const doSend = async () => {
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
      {/* Sidebar */}
      <div className="w-72 bg-background border-r flex flex-col shrink-0">
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/documents/${docId}`)} className="mb-3 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h2 className="font-semibold text-sm truncate">{doc?.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Place fields then send for signing</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Signers */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setAddSignerOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Signers</span>
              </div>
              {signers.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No signers added yet</p>
              )}
              <div className="space-y-1.5">
                {signers.map((s, idx) => (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, s.id)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={() => { setDragSignerId(null); setDropOverIdx(null); }}
                    onClick={() => setActiveSignerId(s.id)}
                    className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg cursor-pointer transition-all select-none overflow-hidden ${
                      activeSignerId === s.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"
                    } ${dropOverIdx === idx && dragSignerId !== s.id ? "ring-2 ring-primary/60 bg-primary/5" : ""}`}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-grab" />
                    <Button
                      variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive shrink-0"
                      onClick={(e) => { e.stopPropagation(); removeSigner(s.id); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">#{idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Field tools */}
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
                  {activeTool ? (
                    <div className="mt-2 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-2 space-y-0.5">
                      <p className="text-xs text-primary font-medium">
                        Click anywhere on the document to place a <strong>{activeTool}</strong> box for <strong>{activeSigner?.name}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground">Press <kbd className="bg-muted border rounded px-1 text-[10px]">Esc</kbd> or click the button again to cancel</p>
                    </div>
                  ) : (
                    fields.length > 0 && (
                      <div className="mt-2 rounded-md bg-muted px-2.5 py-2 space-y-0.5">
                        <p className="text-xs text-muted-foreground font-medium">Select mode</p>
                        <p className="text-xs text-muted-foreground">Drag a box to move it · hover and drag the corner triangle to resize</p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* CC / Observers */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setAddCcOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CC / Observers</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2 leading-tight">Registered users who receive notifications and can download the final document.</p>
              {ccUsers.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No observers added</p>
              )}
              <div className="space-y-1">
                {ccUsers.map((cc) => (
                  <div key={cc.id} className="flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg bg-muted/50 overflow-hidden">
                    <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                    <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive shrink-0"
                      onClick={() => removeCcUser(cc.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{cc.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{cc.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Digital Seal */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                <Shield className="h-3 w-3" /> Digital Seal
              </p>
              <RadioGroup
                value={getSealMode(doc?.sealQrCode ?? false, doc?.sealInvisibleLink ?? true)}
                onValueChange={handleSealRadioChange}
                className="gap-1.5"
              >
                {([
                  { value: "none", icon: X, label: "None", desc: "No seal embedded" },
                  { value: "link", icon: Link2, label: "Invisible Link", desc: "Tap signature to verify" },
                  { value: "qr", icon: QrCode, label: "QR Code", desc: "QR on last page after signing" },
                  { value: "both", icon: Shield, label: "Both", desc: "QR code + invisible link" },
                ] as const).map(({ value, icon: Icon, label, desc }) => {
                  const active = getSealMode(doc?.sealQrCode ?? false, doc?.sealInvisibleLink ?? true) === value;
                  return (
                    <label
                      key={value}
                      htmlFor={`seal-${value}`}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors select-none ${
                        active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"
                      } ${sealSaving ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <RadioGroupItem value={value} id={`seal-${value}`} disabled={sealSaving} />
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-tight">{label}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>

            <Separator />

            {/* Fields list */}
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

      {/* PDF canvas */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center gap-6 py-6 px-4">
          {pages.length === 0 && (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No PDF file attached to this document
            </div>
          )}
          {pages.map((page, pageIndex) => (
            <div
              key={pageIndex}
              className="relative shadow-xl border border-border bg-white"
              style={{ width: page.width, height: page.height }}
            >
              <img
                src={page.dataUrl}
                alt={`Page ${pageIndex + 1}`}
                style={{ width: page.width, height: page.height, display: "block" }}
                draggable={false}
              />

              {/* Interaction overlay */}
              <div
                ref={(el) => { pageContainerRefs.current[pageIndex] = el; }}
                className={`absolute inset-0 ${activeTool && activeSignerId ? "cursor-crosshair" : ""}`}
                style={{ width: page.width, height: page.height }}
                onClick={(e) => { if (!interactRef.current) handlePageClick(e, pageIndex); }}
                onPointerMove={(e) => handlePointerMove(e, pageIndex)}
                onPointerUp={handlePointerUp}
              >
                {fields.filter((f) => f.page === pageIndex).map((field) => {
                  const signer = signers.find((s) => s.id === field.signerId);
                  const color = signer?.color ?? "#2563eb";
                  const isInteracting = interactState?.fieldId === field.id;

                  return (
                    <div
                      key={field.id}
                      className={`absolute group border-2 rounded flex items-center justify-center cursor-move ${
                        isInteracting ? "opacity-90 shadow-lg z-10" : "hover:brightness-95"
                      }`}
                      style={{
                        left: `${field.x}%`, top: `${field.y}%`,
                        width: `${field.width}%`, height: `${field.height}%`,
                        borderColor: color,
                        background: `${color}18`,
                        userSelect: "none",
                      }}
                      onPointerDown={(e) => startDrag(e, field)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {field.filledImage ? (
                        <img src={field.filledImage} className="w-full h-full object-contain p-0.5" draggable={false} />
                      ) : (
                        <span className="text-[10px] font-semibold px-1 truncate pointer-events-none" style={{ color }}>
                          {FIELD_LABELS[field.fieldType] ?? field.fieldType}
                        </span>
                      )}

                      {/* Delete button */}
                      <button
                        className="absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full bg-destructive text-white hidden group-hover:flex items-center justify-center shadow-sm z-20"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); deleteField(field.id); }}
                      >
                        <X className="h-3 w-3" />
                      </button>

                      {/* Resize handle (bottom-right) — larger for easier grabbing */}
                      <div
                        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{
                          background: color,
                          clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
                        }}
                        onPointerDown={(e) => { e.stopPropagation(); startResize(e, field); }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded pointer-events-none">
                Page {pageIndex + 1}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Warning: Signers without fields */}
      <AlertDialog open={warnSignersOpen} onOpenChange={setWarnSignersOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Some signers have no fields
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">The following signers have no signature, initial, or stamp fields assigned:</p>
                <ul className="space-y-1">
                  {signersWithoutFields.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      <strong>{s.name}</strong> — {s.email}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">They will be notified but won't have anything to sign. Do you want to send anyway?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setWarnSignersOpen(false)}>Go back and fix</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => {
                setWarnSignersOpen(false);
                if (doc?.sealQrCode) { setQrWarnOpen(true); } else { void doSend(); }
              }}
            >
              Send anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code seal warning */}
      <AlertDialog open={qrWarnOpen} onOpenChange={setQrWarnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" /> QR Code Seal Enabled
            </AlertDialogTitle>
            <AlertDialogDescription>
              A QR code will be embedded in the bottom-right corner of the last page of your document after all signers complete. The QR links to the public verification page. Do you want to proceed with sending?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setQrWarnOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setQrWarnOpen(false); void doSend(); }}>
              <Send className="h-4 w-4 mr-2" /> Proceed &amp; Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add CC Dialog */}
      <Dialog open={addCcOpen} onOpenChange={(open) => {
        setAddCcOpen(open);
        if (!open) { setCcSearchQuery(""); setCcSuggestions([]); setCcSuggestionsOpen(false); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Add CC / Observer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Search for a registered user to add as an observer. They will receive notifications and can download the final signed document.</p>
            <div className="space-y-2 relative">
              <Label>Search user by name or email</Label>
              <Input
                value={ccSearchQuery}
                onChange={(e) => { setCcSearchQuery(e.target.value); searchCcUsers(e.target.value); }}
                onBlur={() => setTimeout(() => setCcSuggestionsOpen(false), 150)}
                placeholder="Type name or email..."
                autoComplete="off"
              />
              {ccSuggestionsOpen && ccSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg top-full overflow-hidden">
                  {ccSuggestions.map((u) => (
                    <button
                      key={u.id}
                      disabled={addingCc}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm flex flex-col disabled:opacity-50"
                      onMouseDown={(e) => { e.preventDefault(); addCcUser(u.id); }}
                    >
                      <span className="font-medium">{u.name}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {ccSearchQuery.length >= 1 && ccSuggestions.length === 0 && !ccSuggestionsOpen && (
                <p className="text-xs text-muted-foreground mt-1">No registered users found matching "{ccSearchQuery}"</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCcOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Signer Dialog */}
      <Dialog open={addSignerOpen} onOpenChange={(open) => {
        setAddSignerOpen(open);
        if (!open) { setSignerName(""); setSignerEmail(""); setUserSuggestions([]); setSuggestionsOpen(false); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Add Signer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Name with autocomplete */}
            <div className="space-y-2 relative">
              <Label>Full Name</Label>
              <Input
                value={signerName}
                onChange={(e) => { setSignerName(e.target.value); searchUsers(e.target.value, "name"); }}
                onFocus={() => { setSuggestionsFor("name"); if (userSuggestions.length > 0) setSuggestionsOpen(true); }}
                onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                placeholder="Jane Smith"
                autoComplete="off"
              />
              {suggestionsOpen && suggestionsFor === "name" && userSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg top-full overflow-hidden">
                  {userSuggestions.map((u) => (
                    <button
                      key={u.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm flex flex-col"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSignerName(u.name);
                        setSignerEmail(u.email);
                        setUserSuggestions([]);
                        setSuggestionsOpen(false);
                      }}
                    >
                      <span className="font-medium">{u.name}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Email with autocomplete */}
            <div className="space-y-2 relative">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={signerEmail}
                onChange={(e) => { setSignerEmail(e.target.value); searchUsers(e.target.value, "email"); }}
                onFocus={() => { setSuggestionsFor("email"); if (userSuggestions.length > 0) setSuggestionsOpen(true); }}
                onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                placeholder="jane@example.com"
                autoComplete="off"
              />
              {suggestionsOpen && suggestionsFor === "email" && userSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg top-full overflow-hidden">
                  {userSuggestions.map((u) => (
                    <button
                      key={u.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm flex flex-col"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSignerName(u.name);
                        setSignerEmail(u.email);
                        setUserSuggestions([]);
                        setSuggestionsOpen(false);
                      }}
                    >
                      <span className="font-medium">{u.name}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
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
