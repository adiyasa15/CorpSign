import { useState } from "react";
import { 
  useListSignatures,
  useCreateSignature,
  useDeleteSignature,
  getListSignaturesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, PenTool, Type, Upload } from "lucide-react";
import { SignaturePad } from "@/components/signature-pad";
import { formatDate } from "@/lib/format";

export default function Signatures() {
  const { data: signatures, isLoading } = useListSignatures();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteSig = useDeleteSignature();
  
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this signature?")) return;
    
    deleteSig.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Signature deleted" });
        queryClient.invalidateQueries({ queryKey: getListSignaturesQueryKey() });
      }
    });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Signatures</h1>
          <p className="text-muted-foreground mt-1 text-lg">Manage your saved signature profiles.</p>
        </div>
        <AddSignatureDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="shadow-sm">
              <CardHeader className="pb-2"><Skeleton className="h-6 w-3/4" /></CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-4 w-1/2 mt-4" />
              </CardContent>
              <CardFooter><Skeleton className="h-8 w-20" /></CardFooter>
            </Card>
          ))
        ) : signatures && signatures.length > 0 ? (
          signatures.map((sig) => (
            <Card key={sig.id} className="shadow-sm flex flex-col group">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center justify-between">
                  {sig.name}
                  {sig.type === 'drawn' && <PenTool className="h-4 w-4 text-muted-foreground" title="Drawn" />}
                  {sig.type === 'typed' && <Type className="h-4 w-4 text-muted-foreground" title="Typed" />}
                  {sig.type === 'uploaded' && <Upload className="h-4 w-4 text-muted-foreground" title="Uploaded" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center p-6 bg-secondary/20 m-6 rounded-md border border-border/50 relative overflow-hidden h-32">
                <img 
                  src={sig.signatureData} 
                  alt={sig.name} 
                  className="max-h-full max-w-full object-contain mix-blend-multiply dark:mix-blend-normal dark:invert" 
                />
              </CardContent>
              <CardFooter className="flex justify-between items-center border-t border-border pt-4 text-sm text-muted-foreground">
                <span>Added {formatDate(sig.createdAt)}</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                  onClick={() => handleDelete(sig.id)}
                  disabled={deleteSig.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-center bg-card border border-dashed border-border rounded-lg">
            <PenTool className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
            <h3 className="text-xl font-bold text-foreground">No signatures yet</h3>
            <p className="text-muted-foreground mt-2 mb-6 max-w-sm">Create a saved signature profile to quickly sign documents without drawing it every time.</p>
            <Button onClick={() => setShowAddDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Create First Signature
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddSignatureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSig = useCreateSignature();

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setTimeout(() => {
        setStep(1);
        setName("");
      }, 300);
    }
  };

  const handleSave = (signatureData: string, type: 'drawn' | 'typed' | 'uploaded') => {
    createSig.mutate({
      data: {
        name: name.trim(),
        signatureData,
        type
      }
    }, {
      onSuccess: () => {
        toast({ title: "Signature profile saved" });
        handleOpenChange(false);
        queryClient.invalidateQueries({ queryKey: getListSignaturesQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save signature.", variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          Add Signature
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Create Signature Profile</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          {step === 1 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="sig-name" className="text-base">Profile Name</Label>
                <Input 
                  id="sig-name" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="e.g. Formal Initial, Full Signature" 
                  className="h-12 text-lg"
                />
                <p className="text-sm text-muted-foreground">Give this signature a descriptive name to identify it later.</p>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!name.trim()}>Next Step</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-sm text-muted-foreground">Profile: <span className="text-foreground">{name}</span></span>
                <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="-mr-2 h-8">Change Name</Button>
              </div>
              <SignaturePad onSave={handleSave} onCancel={() => handleOpenChange(false)} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
