"use client";

import { useEffect, useState } from "react";

/**
 * Whether a static file under /public is actually there. Verde's own training deck and how-to videos
 * have not been recorded yet (public/training holds only the folder READMEs), and an <iframe> or
 * <video> pointed at a missing file renders the browser's own broken viewer inside our styled frame.
 * A HEAD probe lets the caller show a labelled placeholder instead, the way StepImage already does
 * for screenshots.
 *
 * Returns null while the probe is in flight, so the caller can stay neutral rather than flashing the
 * wrong state.
 */
export function useAssetPresent(url: string | undefined): boolean | null {
  const [present, setPresent] = useState<boolean | null>(null);

  useEffect(() => {
    if (!url) {
      setPresent(false);
      return;
    }
    let alive = true;
    setPresent(null);
    fetch(url, { method: "HEAD" })
      .then((r) => { if (alive) setPresent(r.ok); })
      .catch(() => { if (alive) setPresent(false); }); // offline or blocked — treat as absent
    return () => { alive = false; };
  }, [url]);

  return present;
}

/** Dashed "not here yet" panel, matching StepImage's placeholder. */
export const MEDIA_PLACEHOLDER_CLASS =
  "mt-2 flex items-center gap-2 rounded-[14px] border border-dashed border-[#C5CAD3] bg-[#F4F6FA] px-4 py-8 text-[12.5px] text-[#7A8699]";
