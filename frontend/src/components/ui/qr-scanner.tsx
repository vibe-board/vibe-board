import { useEffect, useRef, useCallback, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Button } from '@/components/ui/button';

interface QRScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

let scannerIdCounter = 0;

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [scannerId] = useState(() => `qr-scanner-${++scannerIdCounter}`);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const cleanup = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch(() => {});
      scannerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      scannerId,
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: false,
        showTorchButtonIfSupported: false,
        showZoomSliderIfSupported: false,
      },
      false
    );

    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        cleanup();
        onScanRef.current(decodedText);
      },
      () => {
        // ignore scan errors (no QR found in frame)
      }
    );

    return cleanup;
  }, [scannerId, cleanup]);

  return (
    <div className="space-y-2">
      <div id={scannerId} />
      <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
}
