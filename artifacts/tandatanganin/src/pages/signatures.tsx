import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter as DFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, PenLine, Fingerprint, Stamp, Loader2, Upload, X, Star } from "lucide-react";
import DrawingPad, { DrawingPadHandle } from "@/components/signature-pad";
import { useLanguage } from "@/contexts/language-context";

interface Template {
  id: number;
  templateType: string;
  name: string | null;
  imageData: string;
  isDefault: boolean;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  signature: "Signature Template",
  initial: "Initial Template",
  stamp: "Stamp Template",
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  signature: PenLine,
  initial: Fingerprint,
  stamp: Stamp,
};

export default function Signatures() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch("/api/me/templates", { credentials: "include" });
      if (res.ok) setTemplates(await res.json());
    } catch {}
    setLoading(false);
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this signature profile?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/me/templates/${id}`, { method: "DELETE", credentials: "include" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast({ title: "Profile deleted" });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete" });
    } finally {
      setDeletingId(null);
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
      setTemplates((prev) =>
        prev.map((t) => (t.templateType === tpl.templateType ? { ...t, isDefault: t.id === tpl.id } : t)),
      );
    } catch {
      toast({ variant: "destructive", title: "Failed to update" });
    }
  };

  const handleCreated = (tpl: Template) => {
    setTemplates((prev) => {
      const cleared = tpl.isDefault
        ? prev.map((t) => (t.templateType === tpl.templateType ? { ...t, isDefault: false } : t))
        : prev;
      return [...cleared, tpl];
    });
    setShowAdd(false);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{t("sigs_title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-lg">{t("sigs_subtitle")}</p>
        </div>
        <Button className="gap-2 shadow-sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> {t("sigs_add_btn")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="col-span-full py-16 flex flex-col items-center justify-center text-center bg-card border border-dashed border-border rounded-lg">
          <PenLine className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
          <h3 className="text-xl font-bold text-foreground">{t("sigs_empty_title")}</h3>
          <p className="text-muted-foreground mt-2 mb-6 max-w-sm">
            {t("sigs_empty_desc")}
          </p>
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="h-4 w-4" /> {t("sigs_add_btn")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => {
            const Icon = TYPE_ICONS[tpl.templateType] ?? PenLine;
            return (
              <Card key={tpl.id} className="shadow-sm flex flex-col group">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{TYPE_LABELS[tpl.templateType] ?? tpl.templateType}</span>
                  </div>
                  {tpl.isDefault && (
                    <Badge className="text-[10px] px-1.5 py-0">
                      <Star className="h-2.5 w-2.5 mr-0.5" /> {t("sigs_default_badge")}
                    </Badge>
                  )}
                </div>
                <CardContent className="flex-1 flex items-center justify-center p-4 bg-secondary/20 mx-4 mb-0 rounded-md border border-border/50 h-28">
                  <img
                    src={tpl.imageData}
                    alt={TYPE_LABELS[tpl.templateType]}
                    className="max-h-full max-w-full object-contain mix-blend-multiply dark:mix-blend-normal dark:invert"
                  />
                </CardContent>
                <CardFooter className="flex justify-between items-center border-t border-border pt-3 mt-3 pb-3 px-4 gap-2">
                  {!tpl.isDefault && (
                    <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => setAsDefault(tpl)}>
                      <Star className="h-3 w-3" /> {t("sigs_set_default")}
                    </Button>
                  )}
                  {tpl.isDefault && <div />}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={deletingId === tpl.id}
                    onClick={() => handleDelete(tpl.id)}
                  >
                    {deletingId === tpl.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <AddProfileDialog open={showAdd} onOpenChange={setShowAdd} onCreated={handleCreated} />
    </div>
  );
}

function AddProfileDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (tpl: Template) => void;
}) {
  const { toast } = useToast();
  const [templateType, setTemplateType] = useState("signature");
  const [captureTab, setCaptureTab] = useState<"draw" | "upload">("draw");
  const [uploadImage, setUploadImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const padRef = useRef<DrawingPadHandle | null>(null);

  const isStamp = templateType === "stamp";

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setTemplateType("signature");
      setCaptureTab("draw");
      setUploadImage(null);
      padRef.current?.clear();
    }, 300);
  };

  const handleTypeChange = (v: string) => {
    setTemplateType(v);
    if (v === "stamp") {
      setCaptureTab("upload");
      setUploadImage(null);
      padRef.current?.clear();
    }
  };

  const handleSave = async () => {
    let imageData = "";
    if (captureTab === "draw") {
      if (!padRef.current?.hasContent) {
        toast({ variant: "destructive", title: "Please draw something first" });
        return;
      }
      imageData = padRef.current.getDataUrl();
    } else {
      if (!uploadImage) {
        toast({ variant: "destructive", title: "Please upload an image first" });
        return;
      }
      imageData = uploadImage;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/me/templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateType, imageData, isDefault: false }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const tpl = (await res.json()) as Template;
      toast({ title: "Profile saved!" });
      onCreated(tpl);
      handleClose();
    } catch {
      toast({ variant: "destructive", title: "Failed to save profile" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Signature Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type dropdown — fixed options only */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={templateType} onValueChange={handleTypeChange}>
              <SelectTrigger>
                <SelectValue>
                  <span className="flex items-center gap-2">
                    {templateType === "signature" && <PenLine className="h-4 w-4" />}
                    {templateType === "initial" && <Fingerprint className="h-4 w-4" />}
                    {templateType === "stamp" && <Stamp className="h-4 w-4" />}
                    {TYPE_LABELS[templateType]}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="signature">
                  <span className="flex items-center gap-2"><PenLine className="h-4 w-4" /> Signature Template</span>
                </SelectItem>
                <SelectItem value="initial">
                  <span className="flex items-center gap-2"><Fingerprint className="h-4 w-4" /> Initial Template</span>
                </SelectItem>
                <SelectItem value="stamp">
                  <span className="flex items-center gap-2"><Stamp className="h-4 w-4" /> Stamp Template</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Capture area */}
          {isStamp ? (
            <div className="space-y-2">
              <Label>Upload Stamp Image</Label>
              {uploadImage ? (
                <div
                  className="relative border rounded-lg flex items-center justify-center bg-muted/20"
                  style={{ height: 160 }}
                >
                  <img src={uploadImage} className="max-h-full max-w-full object-contain p-2" alt="Preview" />
                  <button
                    className="absolute top-2 right-2 bg-background border rounded-full p-0.5 hover:bg-muted"
                    onClick={() => setUploadImage(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  className="w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  style={{ height: 160 }}
                  onClick={() => uploadRef.current?.click()}
                >
                  <Upload className="h-7 w-7" />
                  <span className="text-sm">Click to upload your stamp image</span>
                  <span className="text-xs">PNG, JPG, BMP, SVG</span>
                </button>
              )}
            </div>
          ) : (
            <Tabs
              value={captureTab}
              onValueChange={(v) => { setCaptureTab(v as "draw" | "upload"); setUploadImage(null); }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="draw" className="flex-1">Draw</TabsTrigger>
                <TabsTrigger value="upload" className="flex-1">Upload Image</TabsTrigger>
              </TabsList>
              <TabsContent value="draw" className="pt-3">
                <div className="border rounded-lg overflow-hidden bg-white">
                  <DrawingPad ref={padRef} height={155} />
                </div>
              </TabsContent>
              <TabsContent value="upload" className="pt-3">
                {uploadImage ? (
                  <div
                    className="relative border rounded-lg flex items-center justify-center bg-muted/20"
                    style={{ height: 155 }}
                  >
                    <img src={uploadImage} className="max-h-full max-w-full object-contain p-2" alt="Preview" />
                    <button
                      className="absolute top-2 right-2 bg-background border rounded-full p-0.5 hover:bg-muted"
                      onClick={() => setUploadImage(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    style={{ height: 155 }}
                    onClick={() => uploadRef.current?.click()}
                  >
                    <Upload className="h-7 w-7" />
                    <span className="text-sm">Click to upload an image</span>
                    <span className="text-xs">PNG, JPG, BMP, SVG</span>
                  </button>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>

        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => setUploadImage(ev.target?.result as string);
            reader.readAsDataURL(file);
            e.target.value = "";
          }}
        />

        <DFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Profile
          </Button>
        </DFooter>
      </DialogContent>
    </Dialog>
  );
}
