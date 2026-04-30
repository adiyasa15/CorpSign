import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Star, PenLine, Fingerprint, Stamp, Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DrawingPad, { DrawingPadHandle } from "@/components/signature-pad";

interface Template {
  id: number;
  templateType: string;
  name: string | null;
  imageData: string;
  isDefault: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  signature: PenLine,
  initial: Fingerprint,
  stamp: Stamp,
};

const TYPE_LABELS: Record<string, string> = {
  signature: "Signature",
  initial: "Initial",
  stamp: "Stamp",
};

export default function SignatureSettings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<string>("signature");
  const [addName, setAddName] = useState("");
  const [addDefault, setAddDefault] = useState(false);
  const [addTab, setAddTab] = useState<"draw" | "upload">("draw");
  const [addUploadImage, setAddUploadImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const sigPadRef = useRef<DrawingPadHandle | null>(null);
  const addUploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const res = await fetch("/api/me/templates", { credentials: "include" });
      if (res.ok) setTemplates(await res.json());
    } catch {}
    setLoading(false);
  }

  const openAdd = (type: string) => {
    setAddType(type);
    setAddName("");
    setAddDefault(false);
    setAddTab(type === "stamp" ? "upload" : "draw");
    setAddUploadImage(null);
    setAddOpen(true);
    setTimeout(() => sigPadRef.current?.clear(), 50);
  };

  const saveTemplate = async () => {
    let imageData = "";
    if (addTab === "draw") {
      if (!sigPadRef.current?.hasContent) {
        toast({ variant: "destructive", title: "Please draw something first" });
        return;
      }
      imageData = sigPadRef.current.getDataUrl();
    } else {
      if (!addUploadImage) {
        toast({ variant: "destructive", title: "Please upload an image first" });
        return;
      }
      imageData = addUploadImage;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/me/templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateType: addType, name: addName || null, imageData, isDefault: addDefault }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const tpl = await res.json() as Template;
      setTemplates((prev) => {
        let updated = addDefault ? prev.map((t) => t.templateType === addType ? { ...t, isDefault: false } : t) : prev;
        return [...updated, tpl];
      });
      setAddOpen(false);
      toast({ title: "Template saved!" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save template" });
    } finally {
      setSaving(false);
    }
  };

  const setAsDefault = async (tpl: Template) => {
    try {
      const res = await fetch(`/api/me/templates/${tpl.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) throw new Error();
      setTemplates((prev) => prev.map((t) =>
        t.templateType === tpl.templateType ? { ...t, isDefault: t.id === tpl.id } : t
      ));
    } catch {
      toast({ variant: "destructive", title: "Failed to update template" });
    }
  };

  const deleteTemplate = async (id: number) => {
    setDeletingId(id);
    try {
      await fetch(`/api/me/templates/${id}`, { method: "DELETE", credentials: "include" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toast({ variant: "destructive", title: "Failed to delete template" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Signature Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your signature, initial, and stamp templates</p>
        </div>
      </div>

      <Tabs defaultValue="signature">
        <TabsList>
          <TabsTrigger value="signature"><PenLine className="h-4 w-4 mr-1.5" />Signature</TabsTrigger>
          <TabsTrigger value="initial"><Fingerprint className="h-4 w-4 mr-1.5" />Initial</TabsTrigger>
          <TabsTrigger value="stamp"><Stamp className="h-4 w-4 mr-1.5" />Stamp</TabsTrigger>
        </TabsList>

        {(["signature", "initial", "stamp"] as const).map((type) => {
          const typeTemplates = templates.filter((t) => t.templateType === type);
          return (
            <TabsContent key={type} value={type} className="mt-4">
              <Card>
                <CardHeader className="border-b pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{TYPE_LABELS[type]} Templates</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Saved templates auto-fill when signing documents
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => openAdd(type)}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add New
                  </Button>
                </CardHeader>
                <CardContent className="p-4">
                  {loading ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : typeTemplates.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                        {(() => { const Icon = TYPE_ICONS[type]; return <Icon className="h-5 w-5" />; })()}
                      </div>
                      <p className="text-sm">No {TYPE_LABELS[type].toLowerCase()} templates yet</p>
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => openAdd(type)}>
                        <Plus className="h-4 w-4 mr-1" /> Create one
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {typeTemplates.map((tpl) => (
                        <div key={tpl.id} className="border rounded-xl p-3 space-y-2 relative group">
                          <div className="bg-muted/30 rounded-lg h-24 flex items-center justify-center">
                            <img src={tpl.imageData} className="max-h-20 max-w-full object-contain" />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs truncate text-muted-foreground">{tpl.name ?? "Untitled"}</div>
                            {tpl.isDefault && <Badge className="text-[10px] px-1.5 py-0"><Star className="h-2.5 w-2.5 mr-0.5" />Default</Badge>}
                          </div>
                          <div className="flex gap-1.5">
                            {!tpl.isDefault && (
                              <Button variant="outline" size="sm" className="flex-1 text-xs h-7" onClick={() => setAsDefault(tpl)}>
                                <Star className="h-3 w-3 mr-1" /> Set Default
                              </Button>
                            )}
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              disabled={deletingId === tpl.id}
                              onClick={() => deleteTemplate(tpl.id)}
                            >
                              {deletingId === tpl.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Hidden file input for upload */}
      <input
        ref={addUploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => setAddUploadImage(ev.target?.result as string);
          reader.readAsDataURL(file);
          e.target.value = "";
        }}
      />

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setAddUploadImage(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Type dropdown */}
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={addType}
                onValueChange={(v) => {
                  setAddType(v);
                  if (v === "stamp") { setAddTab("upload"); setAddUploadImage(null); }
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      {addType === "signature" && <PenLine className="h-4 w-4" />}
                      {addType === "initial" && <Fingerprint className="h-4 w-4" />}
                      {addType === "stamp" && <Stamp className="h-4 w-4" />}
                      {TYPE_LABELS[addType]}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="signature">
                    <span className="flex items-center gap-2"><PenLine className="h-4 w-4" /> Signature</span>
                  </SelectItem>
                  <SelectItem value="initial">
                    <span className="flex items-center gap-2"><Fingerprint className="h-4 w-4" /> Initial</span>
                  </SelectItem>
                  <SelectItem value="stamp">
                    <span className="flex items-center gap-2"><Stamp className="h-4 w-4" /> Stamp</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label>Name <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={`My ${TYPE_LABELS[addType]}`} />
            </div>

            {/* Draw / Upload tabs — Stamp is upload-only */}
            <Tabs value={addTab} onValueChange={(v) => { setAddTab(v as "draw" | "upload"); setAddUploadImage(null); }}>
              <TabsList className={`w-full ${addType === "stamp" ? "hidden" : ""}`}>
                <TabsTrigger value="draw" className="flex-1">Draw</TabsTrigger>
                <TabsTrigger value="upload" className="flex-1">Upload Image</TabsTrigger>
              </TabsList>
              <TabsContent value="draw" className="pt-3">
                <div className="border rounded-lg overflow-hidden bg-white">
                  <DrawingPad ref={sigPadRef} height={150} />
                </div>
              </TabsContent>
              <TabsContent value="upload" className="pt-3">
                {addUploadImage ? (
                  <div className="relative border rounded-lg flex items-center justify-center bg-muted/20" style={{ height: 150 }}>
                    <img src={addUploadImage} className="max-h-full max-w-full object-contain p-2" alt="Preview" />
                    <button
                      className="absolute top-2 right-2 bg-background border rounded-full p-0.5 hover:bg-muted"
                      onClick={() => setAddUploadImage(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    style={{ height: 150 }}
                    onClick={() => addUploadRef.current?.click()}
                  >
                    <Upload className="h-6 w-6" />
                    <span className="text-sm">Click to upload</span>
                    <span className="text-xs">PNG, JPG, or SVG</span>
                  </button>
                )}
              </TabsContent>
            </Tabs>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={addDefault} onChange={(e) => setAddDefault(e.target.checked)} className="rounded" />
              Set as default {TYPE_LABELS[addType].toLowerCase()}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
