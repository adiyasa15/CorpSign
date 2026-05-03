import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Already installed as PWA
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsStandalone(true);
      return;
    }

    // Already dismissed in this session
    if (sessionStorage.getItem("pwa-prompt-dismissed")) {
      setDismissed(true);
      return;
    }

    // iOS detection
    const ua = window.navigator.userAgent;
    const isIosDev = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
    setIsIos(isIosDev);

    // Android / desktop Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setDismissed(true);
    sessionStorage.setItem("pwa-prompt-dismissed", "1");
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setInstallEvent(null);
    dismiss();
  }

  if (isStandalone || dismissed) return null;

  // iOS — show share-to-home-screen hint
  if (isIos) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 rounded-xl border bg-background shadow-lg p-4 flex items-start gap-3 max-w-sm mx-auto">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Add to Home Screen</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tap <Share className="inline h-3.5 w-3.5 mx-0.5 align-text-bottom" /> then <strong>"Add to Home Screen"</strong> to install Tandatanganin.
          </p>
        </div>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Android / desktop Chrome
  if (installEvent) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 rounded-xl border bg-background shadow-lg p-4 flex items-center gap-3 max-w-sm mx-auto">
        <div className="h-10 w-10 rounded-lg bg-[#FF3C00] shrink-0 flex items-center justify-center">
          <Download className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install Tandatanganin</p>
          <p className="text-xs text-muted-foreground">Add to your home screen for quick access</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" onClick={install}>Install</Button>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
