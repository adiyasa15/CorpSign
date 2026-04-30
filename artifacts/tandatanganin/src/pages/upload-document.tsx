import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, Upload, X, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";

export default function UploadDocument() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [maxUploadMb, setMaxUploadMb] = useState<number>(10);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/privileges/limits", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.maxUploadSizeMb) setMaxUploadMb(data.maxUploadSizeMb); })
      .catch(() => {});
  }, []);

  if (user?.role === "approver") {
    setLocation("/");
    return null;
  }

  const handleFile = (f: File) => {
    if (f.type !== "application/pdf") {
      toast({ variant: "destructive", title: "Invalid file", description: "Only PDF files are accepted." });
      return;
    }
    const fileMb = +(f.size / (1024 * 1024)).toFixed(2);
    if (fileMb > maxUploadMb) {
      setFileSizeError(t("limit_file_too_large", fileMb, maxUploadMb));
      setFile(null);
      return;
    }
    setFileSizeError(null);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ""));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [maxUploadMb, title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title.trim());
      if (description.trim()) formData.append("description", description.trim());

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; maxMb?: number; fileSizeMb?: number };
        if (err.error === "file_too_large" && err.maxMb != null && err.fileSizeMb != null) {
          throw new Error(t("limit_file_too_large", err.fileSizeMb, err.maxMb));
        }
        throw new Error(err.error ?? "Upload failed");
      }

      const doc = await res.json() as { id: number };
      toast({ title: "Document uploaded!", description: "Now place signature fields." });
      setLocation(`/documents/${doc.id}/editor`);
    } catch (err) {
      toast({ variant: "destructive", title: "Upload failed", description: (err as Error).message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/documents")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("back")}
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t("upload_title")}</h1>
          <p className="text-muted-foreground text-sm">{t("upload_subtitle")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              } ${file ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""} ${fileSizeError ? "border-destructive bg-destructive/5" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="h-8 w-8 text-green-600" />
                  <div className="text-left">
                    <p className="font-medium text-green-700 dark:text-green-400">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="ml-2 h-7 w-7"
                    onClick={(ev) => { ev.stopPropagation(); setFile(null); setFileSizeError(null); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{t("upload_drop_title")}</p>
                    <p className="text-sm text-muted-foreground">{t("upload_drop_subtitle")} — {t("upload_drop_hint")}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("limit_file_hint", maxUploadMb)}</p>
                </div>
              )}
            </div>

            {fileSizeError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{fileSizeError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">{t("upload_doc_title")} <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("upload_doc_title_placeholder")}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("upload_doc_desc")}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("upload_doc_desc_placeholder")}
                rows={3}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={!file || !title.trim() || uploading || !!fileSizeError}
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t("upload_uploading")}</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> {t("upload_btn")}</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
