"use client";

import { useEffect, useRef, useState } from "react";

/**
 * In-app voice note recorder (New Visit review step). Records audio via
 * MediaRecorder and stores each note as a data-URL string that plays back in a
 * native <audio> element. Releases the microphone on stop and on unmount, and
 * auto-stops at MAX_SECONDS to bound the payload.
 */

const MAX_SECONDS = 120;

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function VoiceRecorder({
  notes,
  onChange,
}: {
  notes: string[];
  onChange: (next: string[]) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // Always append to the latest notes (onstop closes over the start-time value).
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const stop = () => {
    clearTimer();
    const mr = recorderRef.current;
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop(); // fires onstop → saves blob + releases mic
      } catch {
        releaseMic();
        setRecording(false);
      }
    }
  };

  // Auto-stop at the cap.
  useEffect(() => {
    if (recording && elapsed >= MAX_SECONDS) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, elapsed]);

  // Track mount; stop recording + release the mic on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      const mr = recorderRef.current;
      if (mr && mr.state !== "inactive") {
        try {
          mr.stop();
        } catch {
          /* ignore */
        }
      }
      releaseMic();
    };
  }, []);

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The user may have left step 4 while the permission prompt was open.
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size) {
          try {
            const url = await blobToDataUrl(blob);
            onChange([...notesRef.current, url]);
          } catch {
            setError("Could not save the recording.");
          }
        }
        releaseMic();
        setRecording(false);
        setElapsed(0);
      };
      recorderRef.current = mr;
      mr.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      setError("Microphone unavailable or permission denied.");
      releaseMic();
    }
  };

  return (
    <div>
      {notes.length > 0 && (
        <div className="mb-2.5 flex flex-col gap-2">
          {notes.map((src, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-[#E0E0E0] px-2.5 py-1.5"
            >
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={src} className="h-8 min-w-0 flex-1" />
              <button
                type="button"
                aria-label={`Remove voice note ${i + 1}`}
                onClick={() => onChange(notes.filter((_, j) => j !== i))}
                className="shrink-0 text-[16px] leading-none text-[#9E9E9E] hover:text-[#C62828]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {!recording ? (
        <button
          type="button"
          onClick={start}
          className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-[#BDBDBD] px-4 py-3 text-[13px] font-semibold text-[#616161] hover:border-[#7DA02E] hover:text-[#7DA02E]"
        >
          <span aria-hidden>🎙️</span> Record Voice Note
        </button>
      ) : (
        <button
          type="button"
          onClick={stop}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-[#C62828] bg-[#FDECEA] px-4 py-3 text-[13px] font-semibold text-[#C62828]"
        >
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#C62828]" aria-hidden />
          Stop · {fmt(elapsed)}
        </button>
      )}
      {error && <div className="mt-1.5 text-[11px] text-[#C62828]">{error}</div>}
    </div>
  );
}
