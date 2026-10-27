"use client";

import { useEffect, useState } from "react";
import { NAV, SITE } from "@/content/site";
import { Mark } from "./Marks";

/** Every in-page destination the header can mark as current, in page order. */
const TRACKED = [...NAV.map((n) => n.href), "#contact"];

export default function Header() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  // The section on screen: the last one whose top has passed the middle of the viewport.
  // Read once per frame at most, and only when the answer changes does React re-render.
  useEffect(() => {
    const els = TRACKED.map((h) => document.querySelector<HTMLElement>(h));
    let raf = 0;
    let current: string | null = null;
    const read = () => {
      raf = 0;
      const line = window.innerHeight * 0.5;
      let next: string | null = null;
      els.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= line) next = TRACKED[i];
      });
      if (next !== current) {
        current = next;
        setActive(next);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("menu-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("menu-open");
    };
  }, [open]);

  return (
    <header className="header" data-open={open}>
      <a href="#top" className="brand" aria-label={`${SITE.name}, back to top`} onClick={() => setOpen(false)}>
        <Mark size={26} />
        <span className="brand-word">
          Ashiru<span>Labs</span>
        </span>
      </a>

      <nav className="nav" aria-label="Primary">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} aria-current={active === n.href ? "true" : undefined}>
            {n.label}
          </a>
        ))}
      </nav>

      <a href="#contact" className="btn btn-sm header-cta" aria-current={active === "#contact" ? "true" : undefined}>
        Start a project
      </a>

      <button
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path className="menu-l1" d="M3 8H21" />
          <path className="menu-l2" d="M3 16H21" />
        </svg>
      </button>

      <div id="mobile-menu" className="mobile-menu" hidden={!open}>
        <nav aria-label="Mobile">
          {NAV.map((n, i) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={active === n.href ? "true" : undefined}
              style={{ ["--i" as string]: i }}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <a href="#contact" className="btn" onClick={() => setOpen(false)}>
          Start a project
        </a>
      </div>
    </header>
  );
}
