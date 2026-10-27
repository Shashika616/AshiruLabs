"use client";

import { useEffect, useRef } from "react";

/**
 * The house cursor, for mouse and trackpad only. The dot is written straight to the pointer's
 * position; the ring eases after it in a small rAF loop that stops as soon as it has caught up.
 * Nothing re-renders.
 */
const CLICKABLE = "a, button, [role='button'], label, summary, .kb-key";

export default function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches) return;
    const html = document.documentElement;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let x = -100;
    let y = -100;
    let rx = x;
    let ry = y;
    let raf = 0;
    let shown = false;

    const follow = () => {
      raf = 0;
      const k = still ? 1 : 0.22;
      rx += (x - rx) * k;
      ry += (y - ry) * k;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      if (Math.abs(x - rx) > 0.1 || Math.abs(y - ry) > 0.1) raf = requestAnimationFrame(follow);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      if (!shown) {
        shown = true;
        rx = x;
        ry = y;
        html.classList.add("has-cursor");
      }
      html.classList.remove("cursor-out");
      if (dot.current) dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const over = (e.target as Element | null)?.closest?.(CLICKABLE);
      if (ring.current) ring.current.dataset.state = over ? "link" : "";
      if (!raf) raf = requestAnimationFrame(follow);
    };
    const onDown = () => ring.current?.setAttribute("data-down", "");
    const onUp = () => ring.current?.removeAttribute("data-down");
    const onLeave = () => html.classList.add("cursor-out");

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      html.classList.remove("has-cursor", "cursor-out");
    };
  }, []);

  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden="true" />
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
    </>
  );
}
