import { useState, useRef, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, X, MousePointer2, Type } from "lucide-react";

interface SignaturePadProps {
  onSave: (signatureData: string, type: 'drawn' | 'typed' | 'uploaded') => void;
  onCancel: () => void;
}

export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [activeTab, setActiveTab] = useState<"draw" | "type" | "upload">("draw");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Canvas Drawing Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Set explicit size for internal resolution
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "currentColor"; // Will use the current text color, or we could hardcode dark ink
    ctx.lineWidth = 3;
  }, [activeTab]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.beginPath(); // Start a new path so next draw doesn't connect
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle both mouse and touch events
    let clientX, clientY;
    if ('touches' in e) {
      const rect = canvas.getBoundingClientRect();
      clientX = e.touches[0].clientX - rect.left;
      clientY = e.touches[0].clientY - rect.top;
    } else {
      clientX = e.nativeEvent.offsetX;
      clientY = e.nativeEvent.offsetY;
    }

    ctx.lineTo(clientX, clientY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(clientX, clientY);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    let signatureData = "";
    
    if (activeTab === "draw") {
      const canvas = canvasRef.current;
      if (canvas) {
        signatureData = canvas.toDataURL("image/png");
      }
    } else if (activeTab === "type") {
      // Create a temporary canvas to render the typed text to an image
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = "transparent";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "60px 'Caveat', cursive";
        ctx.fillStyle = "#0f172a"; // dark ink
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
        signatureData = canvas.toDataURL("image/png");
      }
    } else if (activeTab === "upload" && uploadedImage) {
      signatureData = uploadedImage;
    }

    if (signatureData) {
      onSave(signatureData, activeTab === "draw" ? "drawn" : activeTab === "type" ? "typed" : "uploaded");
    }
  };

  const isSaveDisabled = 
    (activeTab === "type" && !typedName.trim()) || 
    (activeTab === "upload" && !uploadedImage);
    // Draw canvas doesn't easily tell if it's empty, so we don't disable for it.

  return (
    <div className="flex flex-col space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="draw" className="flex items-center gap-2"><MousePointer2 className="h-4 w-4"/> Draw</TabsTrigger>
          <TabsTrigger value="type" className="flex items-center gap-2"><Type className="h-4 w-4"/> Type</TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-2"><Upload className="h-4 w-4"/> Upload</TabsTrigger>
        </TabsList>
        
        <div className="mt-4 p-1 border rounded-md bg-secondary/30 relative">
          <TabsContent value="draw" className="m-0">
            <div className="relative w-full h-48 bg-white dark:bg-slate-950 rounded-sm overflow-hidden">
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                onMouseMove={draw}
                onTouchStart={startDrawing}
                onTouchEnd={stopDrawing}
                onTouchMove={draw}
                className="w-full h-full cursor-crosshair touch-none text-slate-900 dark:text-slate-100"
              />
              <div className="absolute bottom-2 right-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={clearCanvas}>Clear</Button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="type" className="m-0 h-48 flex flex-col items-center justify-center space-y-4 px-8 bg-white dark:bg-slate-950 rounded-sm">
            <Input 
              value={typedName} 
              onChange={(e) => setTypedName(e.target.value)} 
              placeholder="Type your name here..."
              className="text-center font-signature text-4xl h-16 border-b-2 border-t-0 border-l-0 border-r-0 rounded-none bg-transparent shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/30 placeholder:font-sans placeholder:text-base text-slate-900 dark:text-slate-100"
            />
          </TabsContent>
          
          <TabsContent value="upload" className="m-0 h-48 flex flex-col items-center justify-center bg-white dark:bg-slate-950 rounded-sm relative">
            {uploadedImage ? (
              <div className="relative w-full h-full p-4 flex items-center justify-center">
                <img src={uploadedImage} alt="Uploaded signature" className="max-h-full max-w-full object-contain" />
                <Button size="icon" variant="destructive" className="absolute top-2 right-2 rounded-full w-8 h-8" onClick={() => setUploadedImage(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Label htmlFor="sig-upload" className="cursor-pointer flex flex-col items-center justify-center w-full h-full hover:bg-secondary/50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to upload an image of your signature</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or SVG</p>
                  </div>
                  <Input id="sig-upload" type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                </Label>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaveDisabled}>Confirm Signature</Button>
      </div>
    </div>
  );
}
