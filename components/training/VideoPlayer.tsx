"use client";

import { useState } from "react";
import type { TrainingVideo } from "@/lib/training";

/**
 * Bilingual how-to video player. The same footage has two audio tracks (English + Hindi); the toggle
 * swaps the <video> source. Files are served statically from /public/training/video (see the folder's
 * README for the exact filenames). `key={src}` forces a reload so the poster + new track show cleanly.
 */
export function VideoPlayer({ video, title }: { video: TrainingVideo; title: string }) {
  const [lang, setLang] = useState<"en" | "hi">("en");
  const src = lang === "en" ? video.en : video.hi;

  return (
    <div className="mb-6">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold text-[#7DA02E]">▶ Watch the walkthrough</span>
        <div className="ml-auto inline-flex rounded-[8px] border border-[#E0E0E0] bg-[#F5F7F5] p-0.5">
          {(["en", "hi"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className="rounded-[6px] px-3 py-1 text-[11.5px] font-semibold transition-colors"
              style={{
                background: lang === l ? "#fff" : "transparent",
                color: lang === l ? "#7DA02E" : "#9E9E9E",
                boxShadow: lang === l ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
              }}
            >
              {l === "en" ? "English" : "हिंदी"}
            </button>
          ))}
        </div>
      </div>

      <video
        key={src}
        src={src}
        poster={video.poster}
        controls
        preload="metadata"
        playsInline
        title={title}
        className="w-full rounded-[12px] border border-[#E7E7E7] bg-black"
        style={{ aspectRatio: "16 / 9" }}
      >
        Your browser can’t play this video.{" "}
        <a href={src} download className="underline">Download it instead</a>.
      </video>

      <p className="mt-1.5 text-[11px] text-[#9E9E9E]">
        Same video — switch the audio between <b>English</b> and <b>हिंदी</b>. The steps below are a quick recap.
      </p>
    </div>
  );
}
