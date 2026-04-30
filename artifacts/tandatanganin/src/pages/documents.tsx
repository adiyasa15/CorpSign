import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  useListDocuments, 
  useCreateDocument,
  getListDocumentsQueryKey,
  getListDashboardSummaryQueryKey,
  getListRecentActivityQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Search, Plus, FileText, CheckCircle, Clock, XCircle, MoreVertical, Download } from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";

export default function Documents() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "signed" | "rejected">("all");
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: documents, isLoading } = useListDocuments({ 
    search: search || undefined, 
    status: statusFilter === "all" ? undefined : statusFilter 
  });

  const isApprover = user?.role === "approver";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Documents</h1>
          <p className="text-muted-foreground mt-1 text-lg">Manage and track your document signing requests.</p>
        </div>
        {!isApprover && <CreateDocumentDialog />}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search documents by title or signer..." 
            className="pl-9 w-full bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-full sm:w-[180px] bg-background">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Documents</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="signed">Signed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow>
              <TableHead className="w-[300px]">Document</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Signer</TableHead>
              <TableHead>Date Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
              documents.map((doc) => {
                const isOwner = user?.role === "admin" || user?.role === "superadmin" || user?.id === doc.userId;
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
                            View Details
                          </DropdownMenuItem>
                          {isApprover && doc.status === "signed" && doc.signatureData && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(doc.signatureData!, "_blank"); }} data-testid={`download-doc-${doc.id}`}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
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
                    <p className="text-lg font-medium text-foreground">No documents found</p>
                    <p className="text-sm mt-1">Adjust your filters or upload a new document.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "pending" | "signed" | "rejected" }) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-900/50 gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
    case "signed":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900/50 gap-1"><CheckCircle className="h-3 w-3" /> Signed</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50 gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
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
