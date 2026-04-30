import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Loader2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export interface PDFPageSize {
  width: number;
  height: number;
}

export interface PDFViewerHandle {
  getPageCount: () => number;
  getPageSize: (pageIndex: number) => PDFPageSize | null;
}

interface PDFViewerProps {
  url: string;
  onPageRendered?: (pageIndex: number, canvas: HTMLCanvasElement) => void;
  onPagesLoaded?: (count: number, sizes: PDFPageSize[]) => void;
  renderOverlay?: (pageIndex: number, pageSize: PDFPageSize, containerRef: HTMLDivElement) => React.ReactNode;
  scale?: number;
}

const PDFViewer = forwardRef<PDFViewerHandle, PDFViewerProps>(function PDFViewer(
  { url, onPagesLoaded, renderOverlay, scale = 1.5 },
  ref
) {
  const [pages, setPages] = useState<{ canvas: HTMLCanvasElement; size: PDFPageSize }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);

  useImperativeHandle(ref, () => ({
    getPageCount: () => pages.length,
    getPageSize: (i: number) => pages[i]?.size ?? null,
  }));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ url, withCredentials: true }).promise;
        const rendered: { canvas: HTMLCanvasElement; size: PDFPageSize }[] = [];
        const sizes: PDFPageSize[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) break;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx!, viewport, canvas }).promise;
          const size = { width: viewport.width, height: viewport.height };
          rendered.push({ canvas, size });
          sizes.push(size);
        }

        if (!cancelled) {
          setPages(rendered);
          setLoading(false);
          onPagesLoaded?.(pdf.numPages, sizes);
        }
      } catch (e) {
        if (!cancelled) {
          setError("Failed to load PDF");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [url, scale]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading PDF...
      </div>
    );
  }

  if (error) {
    return <div className="flex items-center justify-center h-64 text-destructive">{error}</div>;
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {pages.map((page, i) => (
        <div key={i} className="relative shadow-lg border border-border" style={{ width: page.size.width, height: page.size.height }}>
          <img
            src={page.canvas.toDataURL("image/png")}
            alt={`Page ${i + 1}`}
            style={{ width: page.size.width, height: page.size.height, display: "block" }}
            draggable={false}
          />
          <div
            ref={(el) => { containerRefs.current[i] = el; }}
            className="absolute inset-0"
            style={{ width: page.size.width, height: page.size.height }}
          >
            {containerRefs.current[i] && renderOverlay?.(i, page.size, containerRefs.current[i]!)}
          </div>
        </div>
      ))}
    </div>
  );
});

export default PDFViewer;
