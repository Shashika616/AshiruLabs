"use client";

import { useEffect, useRef } from "react";
import { onLoad } from "@/lib/loading";

/**
 * The house loader: six treads that light one by one as the scene really loads, a climber
 * dot hopping up them, and the percentage. Written to the DOM directly, no re-renders.
 */
export default function Loader({ label }: { label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const pct = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      onLoad(({ progress, ready }) => {
        const el = root.current;
        if (!el) return;
        el.style.setProperty("--p", String(progress));
        el.dataset.lit = String(Math.min(6, Math.floor(progress * 6.0001)));
        el.dataset.ready = String(ready);
        if (pct.current) pct.current.textContent = `${Math.round(progress * 100)}%`;
      }),
    [],
  );

  return (
    <div ref={root} className="loader" role="status" aria-live="polite" data-lit="0" data-ready="false">
      <span className="loader-steps" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="loader-step" style={{ ["--i" as string]: i }} />
        ))}
        <span className="loader-dot" />
      </span>
      <span className="loader-label">
        <span className="loader-text">{label}</span>
        <span ref={pct} className="loader-pct tabular">
          0%
        </span>
      </span>
    </div>
  );
}
