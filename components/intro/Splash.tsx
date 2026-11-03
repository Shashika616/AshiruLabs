"use client";

import { useEffect, useRef } from "react";
import { finishIntro, finishSplash, introActive, releaseScroll } from "@/lib/intro";

/**
 * The landing: the AshiruLabs mark draws itself, the climber bounces down the stair while the
 * name loads in, then the splash lifts like a curtain onto the site. Any key, click, tap or
 * scroll skips it. Shown before first paint by the inline script in app/layout.tsx.
 */
export default function Splash() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || !introActive()) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let done = false;

    const lift = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      detach();
      el.classList.add("is-ready");
      // Open the site first, so the scene starts loading at once rather than after a delay.
      finishIntro();
      finishSplash();
      window.setTimeout(
        () => {
          el.remove();
          releaseScroll();
        },
        still ? 100 : 750,
      );
    };
    const timer = window.setTimeout(lift, still ? 600 : 2350);

    const skip = (e: Event) => {
      if (e.type === "wheel" || e.type === "touchmove") e.preventDefault();
      lift();
    };
    const opts = { passive: false } as const;
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    window.addEventListener("wheel", skip, opts);
    window.addEventListener("touchmove", skip, opts);
    const detach = () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchmove", skip);
    };
    return () => {
      detach();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={root} className="intro intro-splash" aria-hidden="true">
      <div className="splash">
        <div className="splash-lockup">
          <svg className="splash-mark" viewBox="0 0 32 32" fill="none">
            <path className="splash-steps" d="M3 28H10V21H17V14H24V7H29" />
            <circle className="splash-head" cx="25.5" cy="3.4" r="2.4" />
          </svg>
          <span className="splash-name">
            <span className="splash-word">
              Ashiru<span>Labs</span>
            </span>
            <span className="splash-rule" />
          </span>
        </div>
      </div>
    </div>
  );
}
