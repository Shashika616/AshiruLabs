"use client";

import { useEffect } from "react";
import { whenScrollReady } from "@/lib/intro";

/**
 * Lenis smooths wheel input so the climb reads as one continuous move rather
 * than a series of notches. Touch keeps native momentum. It is skipped
 * entirely under reduced motion, and loaded after first paint.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let destroy = () => {};
    let alive = true;
    // The page does not scroll under the intro; smoothing starts once its momentum has died.
    const stop = whenScrollReady(() => {
      import("lenis").then(({ default: Lenis }) => {
        if (!alive) return;
        const lenis = new Lenis({ autoRaf: true, lerp: 0.085, anchors: { offset: -40 } });
        destroy = () => lenis.destroy();
      });
    });
    return () => {
      alive = false;
      stop();
      destroy();
    };
  }, []);
  return null;
}
