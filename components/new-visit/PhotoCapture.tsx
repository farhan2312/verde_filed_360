"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/interactive";

/**
 * Photo capture (New Visit review step). Two paths:
 *  • "Take Photo" opens an in-app camera (getUserMedia) with a live preview and a
 *    capture button that grabs the current frame. Falls back to the native
 *    camera file input when getUserMedia is unavailable or denied.
 *  • "Gallery" opens the OS file picker (image/*, multiple).
 *
 * Every image is downscaled + re-encoded to a JPEG data URL so the payload sent
 * to the server action stays small. Photos are stored as data-URL strings.
 */

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.7;
const MAX_PHOTOS = 8;

/** Draw an image/video onto a downscaled canvas → JPEG data URL. */
function toJpegDataUrl(
  source: HTMLImageElement | HTMLVideoElement,
  sw: number,
  sh: number,
): string {
  const scale = Math.min(1, MAX_DIM / Math.max(sw, sh || 1));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(toJpegDataUrl(img, img.naturalWidth, img.naturalHeight));
      img.onerror = () => reject(new Error("decode failed"));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const btn =
  "flex items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-[#BDBDBD] px-4 py-3 text-[13px] font-semibold text-[#616161] hover:border-[#678722] hover:text-[#678722]";

export function PhotoCapture({
  photos,
  onChange,
}: {
  photos: string[];
  onChange: (next: string[]) => void;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Attach the stream once the modal's <video> has mounted.
  useEffect(() => {
    if (cameraOpen && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  // Track mount + release the camera if we unmount mid-capture.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopStream();
    };
  }, []);

  const openCamera = async () => {
    setError(null);
    if (photosRef.current.length >= MAX_PHOTOS) {
      setError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      // Synchronous (still within the user gesture) → the native input opens.
      captureRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
      });
      // The user may have left step 4 while the permission prompt was open.
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      // Camera denied/unavailable. We can't reopen the native capture input here
      // (the user gesture is consumed across the await), so guide to Gallery.
      setError("Camera unavailable. Use Gallery, or allow camera access in your browser settings.");
    }
  };

  // Flip between the rear (environment) and front (user) camera while the preview
  // is open — acquire a fresh stream, then swap it onto the live <video>.
  const switchCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const nextFacing = facing === "environment" ? "user" : "environment";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      stopStream();
      streamRef.current = stream;
      setFacing(nextFacing);
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        void v.play().catch(() => {});
      }
    } catch {
      setError("Could not switch camera — this device may have only one.");
    }
  };

  const closeCamera = () => {
    stopStream();
    setCameraOpen(false);
  };

  const capture = () => {
    const v = videoRef.current;
    if (v && v.videoWidth && photosRef.current.length < MAX_PHOTOS) {
      const url = toJpegDataUrl(v, v.videoWidth, v.videoHeight);
      if (url) onChange([...photosRef.current, url]);
    }
    closeCamera();
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photosRef.current.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const urls: string[] = [];
    for (const f of images.slice(0, room)) {
      try {
        urls.push(await fileToDataUrl(f));
      } catch {
        /* skip an unreadable file */
      }
    }
    if (urls.length) onChange([...photosRef.current, ...urls]);
    if (images.length > room) setError(`Added ${room} photo(s) — max is ${MAX_PHOTOS}.`);
    else if (!urls.length && images.length) setError("Could not read the selected image(s).");
  };

  return (
    <div>
      {photos.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {photos.map((src, i) => (
            <div
              key={i}
              className="relative h-16 w-16 overflow-hidden rounded-lg border border-[#E0E0E0]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
                className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-lg bg-black/55 text-[12px] leading-none text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={openCamera} className={btn}>
          <span aria-hidden>📷</span> Take Photo
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()} className={btn}>
          <span aria-hidden>🖼️</span> Gallery
        </button>
      </div>
      {error && <div className="mt-1.5 text-[11px] text-[#C62828]">{error}</div>}

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <Modal open={cameraOpen} onClose={closeCamera} className="max-w-[540px]">
        <div className="p-4">
          <div className="relative mb-3 overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-h-[62vh] w-full object-contain"
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />
            <button
              type="button"
              onClick={switchCamera}
              aria-label="Switch camera"
              title="Switch camera"
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-[18px] text-white hover:bg-black/70"
            >
              ⟳
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeCamera}
              className="flex-1 rounded-[10px] border-[1.5px] border-[#E0E0E0] py-2.5 text-[13px] font-semibold text-[#616161] hover:border-[#678722] hover:text-[#678722]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={capture}
              className="flex-1 rounded-[10px] bg-[#678722] py-2.5 text-[13px] font-semibold text-white hover:bg-[#516A1B]"
            >
              Capture
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
