import { useRoute } from "wouter";
import { useState } from "react";
import { 
  useGetDocument, 
  useUpdateDocument, 
  useSignDocument,
  getGetDocumentQueryKey,
  useListSignatures
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, ArrowLeft, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { formatDate, formatBytes } from "@/lib/format";
import { SignaturePad } from "@/components/signature-pad";

export default function DocumentDetail() {
  const [, params] = useRoute("/documents/:id");
  const docId = parseInt(params?.id || "0", 10);
  
  const { data: doc, isLoading } = useGetDocument(docId);
  const { data: savedSignatures } = useListSignatures();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const updateDoc = useUpdateDocument();
  const signDoc = useSignDocument();

  const [showSignDialog, setShowSignDialog] = useState(false);

  const handleReject = () => {
    if (!confirm("Are you sure you want to reject this document?")) return;
    
    updateDoc.mutate({ id: docId, data: { status: "rejected" } }, {
      onSuccess: () => {
        toast({ title: "Document rejected" });
        queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(docId) });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to reject document.", variant: "destructive" });
      }
    });
  };

  const handleSign = (signatureData: string, type: 'drawn' | 'typed' | 'uploaded') => {
    signDoc.mutate({ 
      id: docId, 
      data: { signatureData } 
    }, {
      onSuccess: () => {
        toast({ title: "Document signed successfully!" });
        setShowSignDialog(false);
        queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(docId) });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to sign document.", variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-12 w-3/4" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <Skeleton className="h-[600px] w-full" />
          </div>
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-8 max-w-5xl mx-auto text-center py-20">
        <AlertCircle className="h-16 w-16 mx-auto text-muted-foreground opacity-30 mb-4" />
        <h2 className="text-2xl font-bold">Document not found</h2>
        <p className="text-muted-foreground mt-2">The document you're looking for doesn't exist or you don't have access.</p>
        <Button asChild className="mt-6">
          <Link href="/documents">Back to Documents</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground -ml-2">
        <Link href="/documents"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Documents</Link>
      </Button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            {doc.title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {doc.fileName} • {formatBytes(doc.fileSize)} • Added {formatDate(doc.createdAt)}
          </p>
        </div>
        <div>
          {doc.status === "pending" && (
            <Badge variant="outline" className="text-base px-4 py-1.5 bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-900/50 gap-2">
              <Clock className="h-4 w-4" /> Pending Signature
            </Badge>
          )}
          {doc.status === "signed" && (
            <Badge variant="outline" className="text-base px-4 py-1.5 bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900/50 gap-2">
              <CheckCircle className="h-4 w-4" /> Signed on {formatDate(doc.signedAt)}
            </Badge>
          )}
          {doc.status === "rejected" && (
            <Badge variant="outline" className="text-base px-4 py-1.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50 gap-2">
              <XCircle className="h-4 w-4" /> Rejected
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <Card className="border-border shadow-sm min-h-[600px] flex flex-col">
            <CardHeader className="border-b border-border bg-secondary/30">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Document Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900/50 overflow-hidden relative">
              {/* Fake document preview for visual aesthetics */}
              <div className="bg-white dark:bg-slate-50 border shadow-md w-full max-w-[600px] h-[800px] my-8 p-12 flex flex-col pointer-events-none transform scale-90 origin-top">
                <div className="h-8 w-1/3 bg-gray-200 dark:bg-gray-300 rounded mb-8"></div>
                <div className="space-y-4 flex-1">
                  <div className="h-4 w-full bg-gray-100 dark:bg-gray-200 rounded"></div>
                  <div className="h-4 w-full bg-gray-100 dark:bg-gray-200 rounded"></div>
                  <div className="h-4 w-11/12 bg-gray-100 dark:bg-gray-200 rounded"></div>
                  <div className="h-4 w-full bg-gray-100 dark:bg-gray-200 rounded"></div>
                  <div className="h-4 w-9/12 bg-gray-100 dark:bg-gray-200 rounded"></div>
                  <div className="h-4 w-full bg-gray-100 dark:bg-gray-200 rounded mt-8"></div>
                  <div className="h-4 w-full bg-gray-100 dark:bg-gray-200 rounded"></div>
                  <div className="h-4 w-10/12 bg-gray-100 dark:bg-gray-200 rounded"></div>
                </div>
                
                <div className="mt-16 flex justify-between items-end border-t-2 border-gray-200 dark:border-gray-300 pt-8">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">Company Representative</div>
                    <div className="h-12 w-48 border-b-2 border-dashed border-gray-300 dark:border-gray-400"></div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">Signer ({doc.signerName})</div>
                    <div className="h-20 w-64 border-b-2 border-dashed border-gray-300 dark:border-gray-400 flex items-center justify-center relative">
                      {doc.signatureData && (
                        <img 
                          src={doc.signatureData} 
                          alt="Signature" 
                          className="absolute inset-0 w-full h-full object-contain p-2 mix-blend-multiply dark:mix-blend-normal dark:invert" 
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-2 border-b border-border pb-3">
                <span className="text-muted-foreground">Signer</span>
                <span className="col-span-2 font-medium">{doc.signerName}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border pb-3">
                <span className="text-muted-foreground">Email</span>
                <span className="col-span-2 font-medium break-all">{doc.signerEmail}</span>
              </div>
              {doc.description && (
                <div className="grid grid-cols-3 gap-2 border-b border-border pb-3">
                  <span className="text-muted-foreground">Note</span>
                  <span className="col-span-2">{doc.description}</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 border-b border-border pb-3">
                <span className="text-muted-foreground">Status</span>
                <span className="col-span-2 capitalize">{doc.status}</span>
              </div>
              {doc.signedAt && (
                <div className="grid grid-cols-3 gap-2 pb-3">
                  <span className="text-muted-foreground">Signed On</span>
                  <span className="col-span-2">{formatDate(doc.signedAt)}</span>
                </div>
              )}
            </CardContent>
            {doc.status === "pending" && (
              <CardFooter className="flex flex-col gap-3 pt-2">
                <Button className="w-full text-lg h-12" onClick={() => setShowSignDialog(true)}>
                  Sign Document
                </Button>
                <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleReject}>
                  Reject
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">Sign Document</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <SignaturePad 
              onSave={handleSign} 
              onCancel={() => setShowSignDialog(false)} 
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
