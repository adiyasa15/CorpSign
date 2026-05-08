import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  useListDocuments, 
  useCreateDocument,
  getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { formatDate, formatBytes } from "@/lib/format";
import { Search, Plus, FileText, CheckCircle, Clock, XCircle, MoreVertical, Download, Ban, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";

export default function Documents() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "in_progress" | "pending" | "signed" | "completed" | "rejected" | "voided">("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [voidTarget, setVoidTarget] = useState<{ id: number; title: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const { data: documents, isLoading } = useListDocuments({ 
    search: search || undefined, 
    status: statusFilter === "all" ? undefined : statusFilter 
  });

  const isApprover = user?.role === "approver";

  const handleVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      const res = await fetch(`/api/documents/${voidTarget.id}/void`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to void document");
      }
      toast({ title: "Document voided", description: "All parties have been notified." });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      setVoidTarget(null);
      setVoidReason("");
    } catch (e: unknown) {
      toast({ variant: "destructive", title: (e as Error).message });
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{t("documents_title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-lg">{t("documents_subtitle")}</p>
        </div>
        {!isApprover && (
          <Button onClick={() => setLocation("/documents/upload")}>
            <Plus className="h-4 w-4 mr-2" /> {t("documents_upload_btn")}
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("documents_search_placeholder")}
            className="pl-9 w-full bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-full sm:w-[180px] bg-background">
            <SelectValue placeholder={t("documents_filter_status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("status_all")}</SelectItem>
            <SelectItem value="draft">{t("status_draft")}</SelectItem>
            <SelectItem value="in_progress">{t("status_in_progress")}</SelectItem>
            <SelectItem value="pending">{t("status_pending")}</SelectItem>
            <SelectItem value="signed">{t("status_signed")}</SelectItem>
            <SelectItem value="completed">{t("status_completed")}</SelectItem>
            <SelectItem value="rejected">{t("status_rejected")}</SelectItem>
            <SelectItem value="voided">{t("status_voided")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader className="bg-secondary/50">
            <TableRow>
              <TableHead className="w-[300px]">{t("documents_col_title")}</TableHead>
              <TableHead>{t("documents_col_status")}</TableHead>
              <TableHead>{t("documents_col_signers")}</TableHead>
              <TableHead
                className="cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
              >
                <span className="flex items-center gap-1.5">
                  {t("documents_col_uploaded")}
                  {sortDir === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                </span>
              </TableHead>
              <TableHead className="text-right">{t("documents_col_actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-[200px]" /><Skeleton className="h-4 w-[100px] mt-2" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[150px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : documents && documents.length > 0 ? (
              [...documents]
                .sort((a, b) => {
                  const da = new Date(a.createdAt).getTime();
                  const db = new Date(b.createdAt).getTime();
                  return sortDir === "desc" ? db - da : da - db;
                })
                .map((doc) => {
                const isOwner = user?.role === "admin" || user?.role === "superadmin" || !isApprover;
                return (
                  <TableRow key={doc.id} className="cursor-pointer hover:bg-secondary/30 transition-colors" onClick={() => setLocation(`/documents/${doc.id}`)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">{doc.fileName} • {formatBytes(doc.fileSize)}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{doc.signerName}</span>
                        <span className="text-xs text-muted-foreground">{doc.signerEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(doc.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`doc-actions-${doc.id}`}>
                            <span className="sr-only">Open menu</span>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setLocation(`/documents/${doc.id}`); }} data-testid={`view-doc-${doc.id}`}>
                            {t("documents_view")}
                          </DropdownMenuItem>
                          {isApprover && doc.status === "signed" && doc.signatureData && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(doc.signatureData!, "_blank"); }} data-testid={`download-doc-${doc.id}`}>
                              <Download className="mr-2 h-4 w-4" />
                              {t("download")}
                            </DropdownMenuItem>
                          )}
                          {(["draft", "in_progress"] as string[]).includes(doc.status) && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => { e.stopPropagation(); setVoidTarget({ id: doc.id, title: doc.title }); setVoidReason(""); }}
                              data-testid={`void-doc-${doc.id}`}
                            >
                              <Ban className="mr-2 h-4 w-4" />
                              {t("doc_void")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <FileText className="h-12 w-12 mb-4 opacity-20" />
                    <p className="text-lg font-medium text-foreground">{t("documents_empty_title")}</p>
                    <p className="text-sm mt-1">{t("documents_empty_filtered")}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Void Document Dialog */}
      <AlertDialog open={!!voidTarget} onOpenChange={(open) => { if (!open) setVoidTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" /> {t("doc_void_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("doc_void_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Label className="text-sm font-medium">{t("doc_void_reason_label")}</Label>
            <Textarea
              className="mt-1.5"
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
              {voiding ? t("doc_voiding") : t("doc_void_btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  switch (status) {
    case "draft":
      return <Badge variant="secondary" className="gap-1">{t("status_draft")}</Badge>;
    case "pending":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-900/50 gap-1"><Clock className="h-3 w-3" /> {t("status_pending")}</Badge>;
    case "in_progress":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-900/50 gap-1"><Clock className="h-3 w-3" /> {t("status_in_progress")}</Badge>;
    case "signed":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900/50 gap-1"><CheckCircle className="h-3 w-3" /> {t("status_signed")}</Badge>;
    case "completed":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900/50 gap-1"><CheckCircle className="h-3 w-3" /> {t("status_completed")}</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50 gap-1"><XCircle className="h-3 w-3" /> {t("status_rejected")}</Badge>;
    case "voided":
      return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700 gap-1"><XCircle className="h-3 w-3" /> {t("status_voided")}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function CreateDocumentDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createDoc = useCreateDocument();
  
  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setFileSize(file.size);
      if (!title) setTitle(file.name.split('.').slice(0, -1).join('.'));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !fileName || !signerName || !signerEmail) return;

    createDoc.mutate(
      { 
        data: {
          title,
          description,
          fileName,
          fileSize,
          signerName,
          signerEmail
        }
      },
      {
        onSuccess: () => {
          setOpen(false);
          toast({
            title: "Document created",
            description: "The document request has been successfully created.",
          });
          queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] }); // using string array since no direct helper for summary
          
          // Reset form
          setTitle("");
          setDescription("");
          setSignerName("");
          setSignerEmail("");
          setFileName("");
          setFileSize(0);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to create document. Please try again.",
            variant: "destructive"
          });
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          New Document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Document Request</DialogTitle>
            <DialogDescription>
              Upload a document and request a signature from someone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="file" className="font-semibold">Document File <span className="text-destructive">*</span></Label>
              <div className="border-2 border-dashed border-input rounded-md p-6 text-center hover:bg-secondary/50 transition-colors">
                <Input id="file" type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.doc,.docx" required />
                <Label htmlFor="file" className="cursor-pointer flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium text-primary">Click to upload a file</span>
                  <span className="text-xs text-muted-foreground">{fileName || "PDF, Word formats supported"}</span>
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title" className="font-semibold">Document Title <span className="text-destructive">*</span></Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Non-Disclosure Agreement" required />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description" className="font-semibold">Description (Optional)</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a brief note about this document" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="signerName" className="font-semibold">Signer Name <span className="text-destructive">*</span></Label>
                <Input id="signerName" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="John Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signerEmail" className="font-semibold">Signer Email <span className="text-destructive">*</span></Label>
                <Input id="signerEmail" type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="john@example.com" required />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createDoc.isPending || !fileName}>
              {createDoc.isPending ? "Creating..." : "Create Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
