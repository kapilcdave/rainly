import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Share, SquarePlus, Smartphone, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isIOS, isMobile, useInstallPrompt } from "@/lib/pwa";

const IOSSteps = () => (
  <ol className="space-y-4 text-sm text-slate-700" data-testid="ios-install-steps">
    <li className="flex gap-3 items-start"><span className="font-num text-slate-400">1</span><span>Open this page in <b>Safari</b> and tap the <Share size={16} className="inline -mt-1 text-sky-700" /> <b>Share</b> button.</span></li>
    <li className="flex gap-3 items-start"><span className="font-num text-slate-400">2</span><span>Scroll down and tap <SquarePlus size={16} className="inline -mt-1 text-sky-700" /> <b>Add to Home Screen</b>.</span></li>
    <li className="flex gap-3 items-start"><span className="font-num text-slate-400">3</span><span>Tap <b>Add</b>. RainCheck appears on your home screen like any other app.</span></li>
  </ol>
);

const DesktopQR = () => (
  <div className="flex flex-col items-center gap-4" data-testid="install-qr">
    <div className="rounded-2xl border border-slate-200 p-4 bg-white"><QRCodeSVG value={window.location.origin} size={180} fgColor="#0F4C81" /></div>
    <p className="text-sm text-slate-600 text-center">Scan with your phone's camera to open RainCheck, then add it to your home screen.</p>
  </div>
);

export const GetAppButton = ({ className = "", testid = "get-app-button", label = "Get the app" }) => {
  const [open, setOpen] = useState(false);
  const { canPrompt, install } = useInstallPrompt();
  const click = async () => { if (!(await install())) setOpen(true); };
  return (
    <>
      <Button size="lg" onClick={click} className={`h-12 px-6 rounded-full bg-[#0F4C81] hover:bg-[#0A3860] ${className}`} data-testid={testid}>
        {canPrompt ? <Download size={18} className="mr-2" /> : <Smartphone size={18} className="mr-2" />} {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)] rounded-2xl" data-testid="install-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Install RainCheck</DialogTitle>
            <DialogDescription>Free, no App Store needed. Full-screen with its own icon.</DialogDescription>
          </DialogHeader>
          {isIOS() ? <IOSSteps /> : isMobile() ? <p className="text-sm text-slate-700">Open your browser menu and tap <b>Install app</b> or <b>Add to Home screen</b>.</p> : <DesktopQR />}
        </DialogContent>
      </Dialog>
    </>
  );
};
