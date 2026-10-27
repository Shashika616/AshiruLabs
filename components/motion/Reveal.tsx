"use client";

import { useEffect } from "react";

/**
 * Content is visible by default. Only elements still below the fold when the
 * page boots are held back, and each is released once as it enters, so a
 * failed script can never leave a section blank.
 */
export default function Reveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const vh = window.innerHeight;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.remove("is-pending");
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    for (const el of els) {
      if (el.getBoundingClientRect().top < vh * 0.9) continue;
      el.classList.add("is-pending");
      io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return null;
}
