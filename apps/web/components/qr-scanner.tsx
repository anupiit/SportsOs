'use client';

import { Camera, CameraOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Notice } from '@/components/ui';

// Minimal typings for the Shape Detection API (not yet in lib.dom).
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
}

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null);
}

/**
 * Camera QR scanner using the browser's native BarcodeDetector (Chrome, Edge,
 * Android). On browsers without it, renders nothing but a hint — callers always
 * offer manual entry as the fallback.
 */
export function QrScanner({ onScan, paused }: { onScan: (value: string) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ value: string; at: number } | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(!!getDetectorCtor() && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!active || paused) return;
    const Ctor = getDetectorCtor();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ['qr_code'] });
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      const video = videoRef.current;
      if (cancelled || !video) return;
      if (video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          if (value) {
            const last = lastRef.current;
            // Debounce repeated reads of the same code.
            if (!last || last.value !== value || Date.now() - last.at > 4000) {
              lastRef.current = { value, at: Date.now() };
              onScan(value);
            }
          }
        } catch {
          /* transient detection errors are ignored */
        }
      }
      timer = window.setTimeout(tick, 250);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [active, paused, onScan]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      setActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera unavailable');
    }
  }

  if (supported === false) {
    return (
      <Notice tone="blue" icon={<CameraOff className="size-4" />}>
        This browser can&apos;t scan QR codes natively. Type the code instead, or use the SportsOS mobile app.
      </Notice>
    );
  }

  return (
    <div className="space-y-2">
      {active ? (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="size-44 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <Button size="sm" variant="secondary" className="absolute top-2 right-2" onClick={stop}>
            Stop camera
          </Button>
        </div>
      ) : (
        <Button icon={<Camera className="size-4" />} onClick={start} disabled={supported === null}>
          Scan with camera
        </Button>
      )}
      {error && <p className="text-xs text-danger-ink">{error}</p>}
    </div>
  );
}
